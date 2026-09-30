/* eslint-disable @typescript-eslint/no-explicit-any -- The DDL interpreter handles heterogeneous parser nodes; its output has a separate collection contract. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'pgsql-ast-parser';

// Generate the MongoDB contract from the existing migrations, never from customer data.
const tables: Record<string, any> = {};
const migrations: Record<string, string> = {};
function column(table: any, node: any) {
  const constraints = node.constraints || [];
  table.columns[node.name.name] = {
    type: node.dataType.name,
    required: constraints.some((c: any) => ['not null', 'primary key'].includes(c.type)),
    default: constraints.find((c: any) => c.type === 'default')?.default.value ?? null,
  };
  if (constraints.some((c: any) => c.type === 'primary key')) table.primary.push(node.name.name);
  if (constraints.some((c: any) => c.type === 'add generated')) table.identity = node.name.name;
  for (const c of constraints.filter((c: any) => c.type === 'reference')) table.references.push({ columns: [node.name.name], table: c.foreignTable.name, foreignColumns: c.foreignColumns.map((x: any) => x.name) });
}
for (const name of readdirSync('db/postgres').filter(n => n.endsWith('.sql')).sort()) {
  const sql = readFileSync('db/postgres/' + name, 'utf8');
  migrations[name] = createHash('sha256').update(sql).digest('hex');
  for (const node of parse(sql.replace(/DEFERRABLE INITIALLY DEFERRED/g, '')) as any[]) {
    if (node.type === 'create table') {
      const table: any = tables[node.name.name] = { columns: {}, primary: [], references: [], indexes: [] };
      for (const c of node.columns) column(table, c);
      for (const c of node.constraints || []) {
        if (c.type !== 'primary key') throw new Error('Unsupported table constraint: ' + c.type);
        table.primary = c.columns.map((x: any) => x.name);
        for (const key of table.primary) table.columns[key].required = true;
      }
    } else if (node.type === 'alter table') {
      const table = tables[node.table.name];
      for (const change of node.changes) {
        if (change.type === 'add column') column(table, change.column);
        else if (change.type === 'add constraint' && change.constraint.type === 'foreign key') {
          const c = change.constraint;
          table.references.push({ columns: c.localColumns.map((x: any) => x.name), table: c.foreignTable.name, foreignColumns: c.foreignColumns.map((x: any) => x.name) });
        } else throw new Error('Unsupported schema change: ' + change.type);
      }
    } else if (node.type === 'create index') {
      const fields: Record<string, number> = {};
      for (const item of node.expressions) {
        const expr = item.expression;
        const field = expr.type === 'ref' ? expr.name : expr.type === 'call' && expr.function.name === 'lower' && expr.args[0].type === 'ref' ? '__tf_lower_' + expr.args[0].name : null;
        if (!field) throw new Error('Unsupported index expression.');
        fields[field] = item.order === 'DESC' ? -1 : 1;
      }
      tables[node.table.name].indexes.push({ name: node.indexName.name, fields, unique: Boolean(node.unique) });
    } else if (node.type === 'drop index') {
      const dropped = new Set(node.names.map((name: any) => name.name));
      for (const table of Object.values(tables) as any[]) table.indexes = table.indexes.filter((index: any) => !dropped.has(index.name));
    } else if (node.type !== 'update') throw new Error('Unsupported migration statement: ' + node.type);
  }
}
tables._schema_migrations = { columns: { name: { type: 'text', required: true, default: null }, checksum: { type: 'text', required: true, default: null }, applied_at: { type: 'bigint', required: true, default: null } }, primary: ['name'], references: [], indexes: [] };
writeFileSync('db/mongodb-schema.json', JSON.stringify({ version: 1, migrations, tables }, null, 2) + '\n');
console.log(`Contrato MongoDB gerado: ${Object.keys(tables).length} coleções.`);
