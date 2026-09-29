import contract from '../db/mongodb-schema.json' with { type: 'json' };

export type CollectionDefinition = {
  columns: Record<string, { type: string; required: boolean; default: unknown }>;
  primary: string[];
  identity?: string;
  references: { columns: string[]; table: string; foreignColumns: string[] }[];
  indexes: { name: string; fields: Record<string, number>; unique: boolean }[];
};
export const mongoSchema = contract as unknown as { version: number; migrations: Record<string, string>; tables: Record<string, CollectionDefinition> };
export function collectionDefinition(name: string) {
  const table = mongoSchema.tables[name];
  if (!table) throw new Error('Coleção não permitida: ' + name);
  return table;
}
export function mongoDatabaseName(value = process.env.MONGODB_DATABASE) {
  if (!value || !/^[a-z][a-z0-9_]{0,62}$/.test(value) || ['admin', 'local', 'config'].includes(value)) throw new Error('Configure MONGODB_DATABASE com o nome da base da aplicação.');
  return value;
}
