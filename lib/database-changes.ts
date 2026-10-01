import { randomUUID } from 'node:crypto';
import type { DatabaseClient, DatabaseRow } from './database-types.ts';
import { revisionKey, type CrmResource } from './crm-resources.ts';

const affected: Record<string, readonly CrmResource[]> = {
  clients: ['crm', 'invoices', 'postSales'],
  operations: ['crm', 'partners', 'postSales'],
  commissions: ['crm', 'partners'],
  partners: ['crm', 'partners', 'postSales', 'invoices'],
  partner_operation_adjustments: ['crm', 'partners'],
  partner_settlements: ['partners'],
  deals: ['deals'],
  invoices: ['invoices'],
  access_users: ['team', 'deals'],
  users: ['team'],
  crm_catalog_options: ['catalog'],
  post_sale_tasks: ['postSales'],
  activities: ['activities'],
  app_settings: ['postSales'],
};

// Application writes use these three SQL forms, including schema-qualified
// PostgreSQL statements. Auth/session writes deliberately do not invalidate data.
export function changedTable(sql: string) {
  const match = /^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+((?:"[^"]+"|[a-z_]\w*)(?:\.(?:"[^"]+"|[a-z_]\w*))?)/i.exec(sql);
  return match?.[1].split('.').at(-1)?.replaceAll('"', '').toLowerCase();
}

/** Publish revisions atomically with the data, across instances and providers. */
export async function withDatabaseChanges<T>(client: DatabaseClient, action: (tracked: DatabaseClient) => Promise<T>): Promise<T> {
  const resources = new Set<CrmResource>();
  const tracked: DatabaseClient = {
    async query<Row extends DatabaseRow = DatabaseRow>(sql: string, values?: unknown[]) {
      const result = await client.query<Row>(sql, values);
      if (result.rowCount) for (const resource of affected[changedTable(sql) || ''] || []) resources.add(resource);
      return result;
    },
  };
  const result = await action(tracked);
  if (resources.size) {
    const revision = randomUUID();
    const values = [...resources].sort().flatMap(resource => [revisionKey(resource), revision]);
    const placeholders = [...resources].map((_, i) => `($${i * 2 + 1},$${i * 2 + 2})`).join(',');
    await client.query(`INSERT INTO app_settings (key,value) VALUES ${placeholders} ON CONFLICT(key) DO UPDATE SET value=excluded.value`, values);
  }
  return result;
}
