import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { parseApplicationSql, compileSelect, updateExpressions } from '../lib/mongodb-sql.ts';
import { mongoDocument } from '../lib/mongodb.ts';
import { mongoSchema } from '../lib/mongodb-schema.ts';

test('all static application queries are supported by the MongoDB grammar', () => {
  const paths: string[] = [];
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = directory + '/' + entry.name;
      if (entry.isDirectory()) walk(path); else if (path.endsWith('.ts')) paths.push(path);
    }
  }
  walk('app');
  for (const name of ['auth-session', 'gestor-tf', 'import-updated-sheet', 'update-operation']) paths.push('lib/' + name + '.ts');
  let checked = 0;
  for (const path of paths) {
    const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ['prepare', 'query'].includes(node.expression.name.text)) {
        const argument = node.arguments[0];
        if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) && !argument.text.includes('pg_advisory')) {
          assert.doesNotThrow(() => {
            const statement = parseApplicationSql(argument.text), values = Array(100).fill(1);
            if (['select', 'union', 'union all'].includes(statement.type)) compileSelect(statement, values);
            if (statement.type === 'update') updateExpressions(statement.table.name, statement.sets, values);
          }, path + ': ' + argument.text.slice(0, 100));
          checked++;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  assert.ok(checked >= 190);
});

test('SQL placeholders and alias normalization do not change quoted strings', () => {
  const statement = parseApplicationSql("SELECT 'AS Foo ?' AS textValue,? AS value -- ? AS Comment\n");
  assert.equal(statement.columns[0].expr.value, 'AS Foo ?');
  assert.equal(statement.columns[0].alias.name, 'textValue');
  assert.equal(statement.columns[1].expr.name, '$1');
  assert.throws(() => parseApplicationSql('SELECT 1; DELETE FROM clients'), /única/);
  assert.throws(() => compileSelect(parseApplicationSql('SELECT * FROM unknown_collection')), /não permitida/);
});

test('BSON monetary fields reject fractions and unsafe numbers instead of losing precision', () => {
  const row = { id: 1, owner_id: 'owner', client_id: 2, created_at: 1, updated_at: 1, value_cents: 12345 };
  assert.equal(mongoDocument('operations', row).value_cents.toString(), '12345');
  for (const value of [1.1, Number.MAX_SAFE_INTEGER + 1, Infinity, '12345']) assert.throws(() => mongoDocument('operations', { ...row, value_cents: value }), /Inteiro inválido/);
});

test('the MongoDB contract keeps client CPF searchable without requiring uniqueness', () => {
  const cpfIndexes = mongoSchema.tables.clients.indexes.filter(index => Object.hasOwn(index.fields, 'cpf'));
  assert.deepEqual(cpfIndexes, [{ name: 'idx_clients_owner_cpf', fields: { owner_id: 1, cpf: 1 }, unique: false }]);
  assert.ok(mongoSchema.migrations['006_allow_duplicate_client_cpf.sql']);
});
