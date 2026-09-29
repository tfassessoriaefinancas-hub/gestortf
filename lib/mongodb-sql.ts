/* eslint-disable @typescript-eslint/no-explicit-any */
import { parse } from 'pgsql-ast-parser';
import { collectionDefinition } from './mongodb-schema.ts';

type Ast = any;
type Scope = { alias: string; path: string; columns: string[]; outer?: boolean }[];
type Context = { scope: Scope; pipeline: any[]; values: unknown[]; grouped?: Map<string, any> };
export type MongoSelect = { collection: string; pipeline: any[]; columns: string[] };
const literal = (value: unknown) => ({ $literal: value ?? null });
const nullish = (value: any) => ({ $eq: [{ $ifNull: [value, null] }, null] });
const key = (node: Ast) => JSON.stringify(node);
const aggregateNames = new Set(['count', 'sum', 'max', 'min', 'json_agg']);
let variable = 0;

/** Only the application's parameterized query grammar is accepted. No SQL is executed. */
export function parseApplicationSql(sql: string) {
  let parameter = 0;
  const prepared = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?|\bAS\s+([a-zA-Z_]\w*)/gi, (token, alias) => token === '?' ? '$' + ++parameter : alias && /[A-Z]/.test(alias) ? `AS "${alias}"` : token)
    .replace(/\s+FOR UPDATE(?:\s+OF\s+[a-z_,\s]+)?\s*;?$/i, '');
  const statements = parse(prepared);
  if (statements.length !== 1) throw new Error('Uma única consulta é permitida.');
  return statements[0] as Ast;
}

function field(scope: Scope, node: Ast): any {
  const qualified = node.table?.name;
  const candidates = qualified ? scope.filter(s => s.alias === qualified) : scope.filter(s => s.columns.includes(node.name));
  const local = candidates.filter(s => !s.outer);
  const selected = (local.length ? local : candidates)[0];
  if (selected) {
    if (!selected.columns.includes(node.name)) throw new Error('Campo não permitido: ' + node.name);
    return selected.path === '$$ROOT' ? '$' + node.name : selected.path + '.' + node.name;
  }
  const row = !qualified && scope.find(s => s.alias === node.name);
  if (row) return rowObject(row);
  throw new Error('Campo desconhecido ou ambíguo: ' + (qualified ? qualified + '.' : '') + node.name);
}
function rowObject(scope: Scope[number]) {
  return Object.fromEntries(scope.columns.map(name => [name, { $ifNull: [scope.path === '$$ROOT' ? '$' + name : scope.path + '.' + name, null] }]));
}
function comparison(op: string, left: any, right: any) {
  return { $cond: [{ $or: [nullish(left), nullish(right)] }, null, { [op]: [left, right] }] };
}
function booleanExpression(op: string, left: any, right: any) {
  const decisive = op === 'AND' ? false : true;
  return { $cond: [{ $or: [{ $eq: [left, decisive] }, { $eq: [right, decisive] }] }, decisive, { $cond: [{ $or: [nullish(left), nullish(right)] }, null, !decisive] }] };
}
function bindings(scope: Scope) {
  const variables: Record<string, any> = {};
  const outer = scope.map(s => {
    const name = 'bound' + ++variable;
    variables[name] = rowObject(s);
    return { ...s, path: '$$' + name, outer: true };
  });
  return { variables, outer };
}
function subquery(node: Ast, ctx: Context, exists = false) {
  const { variables, outer } = bindings(ctx.scope);
  const sub = compileSelect(node, ctx.values, outer);
  const as = '__tf_sub' + ++variable;
  ctx.pipeline.push({ $lookup: { from: sub.collection, let: variables, pipeline: [...sub.pipeline, ...(exists ? [{ $limit: 1 }] : [])], as } });
  return { path: '$' + as, column: sub.columns[0] };
}
function staticValue(node: Ast, values: unknown[]): any {
  if (node.type === 'parameter') {
    const i = Number(node.name.slice(1)) - 1;
    if (i < 0 || i >= values.length) throw new Error('Parâmetro ausente.');
    const v = values[i];
    return typeof v === 'boolean' ? Number(v) : v ?? null;
  }
  if (['string', 'integer', 'numeric', 'boolean'].includes(node.type)) return node.value;
  if (node.type === 'null') return null;
  if (node.type === 'cast') return staticValue(node.operand, values);
  if (node.type === 'unary' && node.op === '-') return -staticValue(node.operand, values);
  throw new Error('Expressão constante esperada.');
}
export const sqlConstant = staticValue;

/** Keep ordinary filters and lookup equalities visible to MongoDB's indexes.
 * A WHERE/ON clause only retains TRUE, so UNKNOWN can safely become a failed
 * predicate here; expressions in SELECT/SET still use SQL's three-valued logic.
 */
function mongoMatch(node: Ast, ctx: Context): any {
  if (node.type === 'binary' && ['AND', 'OR'].includes(node.op)) return { [node.op === 'AND' ? '$and' : '$or']: [mongoMatch(node.left, ctx), mongoMatch(node.right, ctx)] };
  if (node.type === 'unary' && ['IS NULL', 'IS NOT NULL'].includes(node.op) && node.operand.type === 'ref') {
    const path = field(ctx.scope, node.operand);
    if (typeof path === 'string' && path.startsWith('$') && !path.startsWith('$$')) return { [path.slice(1)]: node.op === 'IS NULL' ? null : { $ne: null, $exists: true } };
  }
  if (node.type === 'binary' && ['=', '!=', '<>', '>', '>=', '<', '<='].includes(node.op)) {
    // ANY(array) has its own SQL null semantics in mongoExpression.
    if (node.right.type !== 'call' || node.right.function.name !== 'any') {
      const left = mongoExpression(node.left, ctx), right = mongoExpression(node.right, ctx);
      const operator: Record<string, string> = { '=': '$eq', '!=': '$ne', '<>': '$ne', '>': '$gt', '>=': '$gte', '<': '$lt', '<=': '$lte' };
      if (node.left.type === 'ref' && typeof left === 'string' && !left.startsWith('$$') && ['parameter', 'string', 'integer', 'numeric', 'null', 'boolean'].includes(node.right.type)) {
        const value = staticValue(node.right, ctx.values);
        if (value == null) return { $expr: false };
        return { [left.slice(1)]: ['!=', '<>'].includes(node.op) ? { $nin: [null, value], $exists: true } : { [operator[node.op]]: value } };
      }
      return { $expr: { $and: [{ $not: [nullish(left)] }, { $not: [nullish(right)] }, { [operator[node.op]]: [left, right] }] } };
    }
  }
  return { $expr: mongoExpression(node, ctx) };
}

export function mongoExpression(node: Ast, ctx: Context): any {
  if (!node) return literal(null);
  if (ctx.grouped?.has(key(node))) return ctx.grouped.get(key(node));
  if (['parameter', 'string', 'integer', 'numeric', 'boolean', 'null'].includes(node.type)) return literal(staticValue(node, ctx.values));
  if (node.type === 'ref') return field(ctx.scope, node);
  if (node.type === 'cast') return mongoExpression(node.operand, ctx);
  if (node.type === 'list') return node.expressions.map((n: Ast) => mongoExpression(n, ctx));
  if (node.type === 'select') {
    const sub = subquery(node, ctx);
    return { $ifNull: [{ $arrayElemAt: [sub.path + '.' + sub.column, 0] }, null] };
  }
  if (node.type === 'unary') {
    const value = mongoExpression(node.operand, ctx);
    if (node.op === 'IS NULL') return nullish(value);
    if (node.op === 'IS NOT NULL') return { $not: [nullish(value)] };
    if (node.op === 'NOT') return { $cond: [nullish(value), null, { $not: [value] }] };
    if (node.op === '-') return { $multiply: [-1, value] };
  }
  if (node.type === 'binary') {
    const left = mongoExpression(node.left, ctx);
    if (['IN', 'NOT IN'].includes(node.op) || (node.op === '=' && node.right.type === 'call' && node.right.function.name === 'any')) {
      const right = node.right.type === 'select' ? (() => { const sub = subquery(node.right, ctx); return sub.path + '.' + sub.column; })()
        : node.right.type === 'call' && node.right.function.name === 'any' ? mongoExpression(node.right.args[0], ctx)
        : node.right.type === 'list' ? mongoExpression(node.right, ctx) : [mongoExpression(node.right, ctx)];
      const included = { $in: [left, right] };
      const result = { $cond: [nullish(left), null, { $cond: [included, true, { $cond: [{ $in: [null, right] }, null, false] }] }] };
      return node.op === 'NOT IN' ? { $cond: [nullish(result), null, { $not: [result] }] } : result;
    }
    if (['LIKE', 'NOT LIKE', 'ILIKE', 'NOT ILIKE'].includes(node.op)) {
      const pattern = staticValue(node.right, ctx.values);
      if (pattern == null) return literal(null);
      let regex = '^';
      const text = String(pattern);
      for (let i = 0; i < text.length; i++) {
        let character = text[i];
        if (character === '\\' && i + 1 < text.length) { character = text[++i]; regex += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
        else regex += character === '%' ? '[\\s\\S]*' : character === '_' ? '[\\s\\S]' : character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      const matched = { $regexMatch: { input: { $ifNull: [left, ''] }, regex: regex + '$', options: node.op.includes('ILIKE') ? 'i' : '' } };
      return { $cond: [nullish(left), null, node.op.startsWith('NOT') ? { $not: [matched] } : matched] };
    }
    const right = mongoExpression(node.right, ctx);
    if (['AND', 'OR'].includes(node.op)) return booleanExpression(node.op, left, right);
    const operators: Record<string, string> = { '=': '$eq', '!=': '$ne', '<>': '$ne', '>': '$gt', '>=': '$gte', '<': '$lt', '<=': '$lte' };
    if (operators[node.op]) return comparison(operators[node.op], left, right);
    const arithmetic: Record<string, string> = { '+': '$add', '-': '$subtract', '*': '$multiply', '/': '$divide', '%': '$mod', '||': '$concat' };
    if (arithmetic[node.op]) return { [arithmetic[node.op]]: [left, right] };
  }
  if (node.type === 'case') return { $switch: { branches: node.whens.map((part: Ast) => ({ case: node.value ? comparison('$eq', mongoExpression(node.value, ctx), mongoExpression(part.when, ctx)) : mongoExpression(part.when, ctx), then: mongoExpression(part.value, ctx) })), default: mongoExpression(node.else, ctx) } };
  if (node.type === 'call') {
    const name = node.function.name.toLowerCase();
    if (name === 'exists') { const sub = subquery(node.args[0], ctx, true); return { $gt: [{ $size: sub.path }, 0] }; }
    if (name === 'chr') return literal(String.fromCodePoint(staticValue(node.args[0], ctx.values)));
    const args = (node.args || []).map((n: Ast) => mongoExpression(n, ctx));
    if (name === 'coalesce') return { $ifNull: args };
    if (name === 'nullif') return { $cond: [{ $eq: args }, null, args[0]] };
    if (name === 'lower' || name === 'upper') return { $cond: [nullish(args[0]), null, { [name === 'lower' ? '$toLower' : '$toUpper']: args[0] }] };
    if (name === 'substr' || name === 'substring') return { $cond: [nullish(args[0]), null, { $substrCP: [args[0], { $max: [0, { $subtract: [args[1], 1] }] }, args[2]] }] };
    if (name === 'length') return { $cond: [nullish(args[0]), null, { $strLenCP: args[0] }] };
    if (name === 'abs') return { $abs: args[0] };
  }
  throw new Error('Expressão SQL não suportada no MongoDB: ' + node.type + '/' + (node.op || node.function?.name || ''));
}

function outputName(column: Ast, index: number) {
  return column.alias?.name || (column.expr.type === 'ref' ? column.expr.name : column.expr.type === 'call' ? column.expr.function.name : 'column' + (index + 1));
}
function outputColumns(columns: Ast[], scope: Scope) {
  return columns.flatMap((column, index) => column.expr.type === 'ref' && column.expr.name === '*' ? scope.filter(s => !s.outer && (!column.expr.table || s.alias === column.expr.table.name)).flatMap(s => s.columns) : [outputName(column, index)]);
}
function projection(columns: Ast[], ctx: Context) {
  const result: Record<string, any> = { _id: 0 };
  columns.forEach((column, index) => {
    if (column.expr.type === 'ref' && column.expr.name === '*') {
      for (const scope of ctx.scope.filter(s => !s.outer && (!column.expr.table || s.alias === column.expr.table.name))) Object.assign(result, rowObject(scope));
    } else result[outputName(column, index)] = { $ifNull: [mongoExpression(column.expr, ctx), null] };
  });
  return result;
}
function ordering(orderBy: Ast[], ctx: Context) {
  if (!orderBy?.length) return;
  const fields: Record<string, any> = {}, sort: Record<string, number> = {};
  orderBy.forEach((item, i) => {
    const value = mongoExpression(item.by, ctx), descending = item.order === 'DESC';
    const nullsFirst = item.nulls ? item.nulls === 'FIRST' : descending;
    fields['__tf_null' + i] = nullish(value); fields['__tf_order' + i] = value;
    sort['__tf_null' + i] = nullsFirst ? -1 : 1; sort['__tf_order' + i] = descending ? -1 : 1;
  });
  ctx.pipeline.push({ $set: fields }, { $sort: sort });
}
function aggregates(columns: Ast[], groupBy: Ast[] | undefined, ctx: Context) {
  const calls: Ast[] = [];
  const walk = (node: Ast) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'call' && aggregateNames.has(node.function.name)) { calls.push(node); return; }
    if (node.type === 'select') return;
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else walk(value);
  };
  columns.forEach(c => walk(c.expr));
  if (!calls.length && !groupBy?.length) return;
  const group: Record<string, any> = { _id: groupBy?.length ? Object.fromEntries(groupBy.map((n, i) => ['g' + i, mongoExpression(n, ctx)])) : null };
  const refs = new Map<string, any>();
  groupBy?.forEach((n, i) => refs.set(key(n), '$_id.g' + i));
  const defaults: Record<string, any> = { _id: null };
  calls.forEach((call, i) => {
    const name = call.function.name, field = 'aggregate' + i, count = 'valid' + i;
    const arg = call.args[0], star = arg?.type === 'ref' && arg.name === '*';
    const value = star ? literal(1) : mongoExpression(arg, ctx);
    if (name === 'count' && call.distinct) {
      group[field] = { $addToSet: value }; defaults[field] = [];
      refs.set(key(call), { $size: { $filter: { input: '$' + field, as: 'value', cond: { $ne: ['$$value', null] } } } });
    } else if (name === 'count') {
      group[field] = { $sum: star ? 1 : { $cond: [nullish(value), 0, 1] } }; defaults[field] = 0;
      refs.set(key(call), '$' + field);
    } else if (name === 'json_agg') {
      ordering(call.orderBy, ctx);
      group[field] = { $push: value }; defaults[field] = null;
      refs.set(key(call), '$' + field);
    } else {
      group[field] = { [name === 'sum' ? '$sum' : name === 'max' ? '$max' : '$min']: value };
      group[count] = { $sum: { $cond: [nullish(value), 0, 1] } }; defaults[field] = null; defaults[count] = 0;
      refs.set(key(call), { $cond: [{ $eq: ['$' + count, 0] }, null, '$' + field] });
    }
  });
  if (groupBy?.length) ctx.pipeline.push({ $group: group });
  else ctx.pipeline.push({ $facet: { grouped: [{ $group: group }] } }, { $replaceWith: { $ifNull: [{ $arrayElemAt: ['$grouped', 0] }, literal(defaults)] } });
  ctx.grouped = refs;
}

export function compileSelect(statement: Ast, values: unknown[] = [], outer: Scope = []): MongoSelect {
  if (statement.type === 'union' || statement.type === 'union all') {
    const left = compileSelect(statement.left, values, outer), right = compileSelect(statement.right, values, outer);
    if (left.columns.length !== right.columns.length) throw new Error('UNION com colunas incompatíveis.');
    const rename = Object.fromEntries(left.columns.map((name, i) => [name, '$' + right.columns[i]]));
    left.pipeline.push({ $unionWith: { coll: right.collection, pipeline: [...right.pipeline, { $project: { _id: 0, ...rename } }] } });
    if (statement.type === 'union') left.pipeline.push({ $group: { _id: '$$ROOT' } }, { $replaceWith: '$_id' });
    return left;
  }
  if (statement.type !== 'select' || statement.with || statement.having) throw new Error('Consulta não suportada.');
  const from = statement.from || [], first = from[0];
  let collection: string, pipeline: any[], scope: Scope;
  if (!first) { collection = '_tf_state'; pipeline = [{ $match: { _id: 'write-lock' } }]; scope = [...outer]; }
  else if (first.type === 'table') {
    collection = first.name.name;
    const definition = collectionDefinition(collection);
    pipeline = []; scope = [{ alias: first.name.alias || collection, path: '$$ROOT', columns: Object.keys(definition.columns) }, ...outer];
  } else if (first.type === 'statement') {
    const inner = compileSelect(first.statement, values, outer);
    collection = inner.collection; pipeline = inner.pipeline; scope = [{ alias: first.alias, path: '$$ROOT', columns: inner.columns }, ...outer];
  } else throw new Error('Fonte de consulta não suportada.');
  const ctx: Context = { scope, pipeline, values };
  // Filter base-table conjuncts before joins. This also keeps pagination queries indexable.
  const remaining: Ast[] = [];
  const terms = (node: Ast): Ast[] => node?.type === 'binary' && node.op === 'AND' ? [...terms(node.left), ...terms(node.right)] : node ? [node] : [];
  for (const condition of terms(statement.where)) {
    const check = (n: Ast): boolean => {
      if (!n || typeof n !== 'object') return true;
      if (n.type === 'select') return false;
      if (n.type === 'ref') return Boolean(scope.find(s => !s.outer && (!n.table || s.alias === n.table.name) && s.columns.includes(n.name)));
      return Object.values(n).every(v => Array.isArray(v) ? v.every(check) : check(v));
    };
    if (check(condition)) pipeline.push({ $match: mongoMatch(condition, ctx) });
    else remaining.push(condition);
  }
  for (const item of from.slice(1)) {
    if (!['INNER JOIN', 'LEFT JOIN'].includes(item.join?.type)) throw new Error('Tipo de JOIN não suportado.');
    const { variables, outer: bound } = bindings(scope);
    const alias = item.type === 'table' ? item.name.alias || item.name.name : item.alias;
    const joined = item.type === 'table'
      ? compileSelect({ type: 'select', columns: [{ expr: { type: 'ref', name: '*', table: { name: alias } } }], from: [{ type: 'table', name: { ...item.name, alias } }], where: item.join.on }, values, bound)
      : compileSelect(item.statement, values, bound);
    if (item.type !== 'table') {
      const joinContext: Context = { values, pipeline: joined.pipeline, scope: [{ alias, path: '$$ROOT', columns: joined.columns }, ...bound] };
      joined.pipeline.push({ $match: mongoMatch(item.join.on, joinContext) });
    }
    const as = '__tf_join' + ++variable;
    pipeline.push({ $lookup: { from: joined.collection, let: variables, pipeline: joined.pipeline, as } }, { $unwind: { path: '$' + as, preserveNullAndEmptyArrays: item.join.type === 'LEFT JOIN' } });
    scope.unshift({ alias, path: '$' + as, columns: joined.columns });
  }
  for (const condition of remaining) pipeline.push({ $match: mongoMatch(condition, ctx) });
  aggregates(statement.columns, statement.groupBy, ctx);
  ordering(statement.orderBy, ctx);
  if (statement.limit?.offset) pipeline.push({ $skip: staticValue(statement.limit.offset, values) });
  if (statement.limit?.limit) {
    const limit = staticValue(statement.limit.limit, values);
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('LIMIT inválido.');
    if (limit === 0) pipeline.push({ $match: { $expr: false } }); else pipeline.push({ $limit: limit });
  }
  const project = projection(statement.columns, ctx);
  pipeline.push({ $project: project });
  if (statement.distinct) pipeline.push({ $group: { _id: '$$ROOT' } }, { $replaceWith: '$_id' });
  return { collection, pipeline, columns: outputColumns(statement.columns, scope) };
}

export function updateExpressions(table: string, sets: Ast[], values: unknown[], excluded?: Record<string, unknown>) {
  const definition = collectionDefinition(table), pipeline: any[] = [];
  const ctx: Context = { values, pipeline, scope: [{ alias: table, path: '$$ROOT', columns: Object.keys(definition.columns) }] };
  if (excluded) ctx.scope.push({ alias: 'excluded', path: '$__tf_excluded', columns: Object.keys(definition.columns) });
  const fields: Record<string, any> = {};
  for (const set of sets) {
    if (!definition.columns[set.column.name] || definition.primary.includes(set.column.name)) throw new Error('Coluna não editável: ' + set.column.name);
    fields[set.column.name] = mongoExpression(set.value, ctx);
  }
  if (pipeline.length) throw new Error('Subconsulta no SET não suportada.');
  return [...(excluded ? [{ $set: { __tf_excluded: literal(excluded) } }] : []), { $set: fields }, ...(excluded ? [{ $unset: '__tf_excluded' }] : [])];
}
