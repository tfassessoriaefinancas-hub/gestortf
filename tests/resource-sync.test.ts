import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResourceSync } from '../lib/resource-sync.ts';
import { CRM_RESOURCES, resourcesForView, type CrmRevisions, type CrmResource } from '../lib/crm-resources.ts';

const baseline = () => ({ scope: 'owner', ...Object.fromEntries(CRM_RESOURCES.map(resource => [resource, '0'])) }) as CrmRevisions;

test('unchanged checks and screen navigation never redownload loaded history', async () => {
  const revisions = baseline(), loads: CrmResource[] = [];
  let checks = 0;
  const sync = createResourceSync({ revisions: async () => { checks++; return { ...revisions }; }, load: async resource => { loads.push(resource); }, scopeChanged: assert.fail, error: error => { throw error; } });
  await sync.setResources(resourcesForView('inicio', 'admin', []));
  assert.deepEqual(loads, ['crm', 'deals']);
  for (let i = 0; i < 10; i++) await sync.refresh();
  assert.equal(loads.length, 2);
  await sync.setResources(resourcesForView('notas', 'admin', []));
  assert.deepEqual(loads, ['crm', 'deals', 'invoices']);
  revisions.catalog = 'changed-elsewhere';
  await sync.refresh();
  assert.equal(loads.length, 3, 'changes in an unopened screen must not fetch its data');
  revisions.crm = 'changed-client';
  await sync.refresh();
  assert.deepEqual(loads, ['crm', 'deals', 'invoices', 'crm']);
  assert.equal(checks, 14);
});

test('a save during an in-flight read queues one check and preserves the newer version', async () => {
  const revisions = baseline();
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  let loads = 0, checks = 0;
  const sync = createResourceSync({
    revisions: async () => { checks++; return { ...revisions }; },
    load: async () => { if (++loads === 1) { started(); await new Promise<void>(resolve => { release = resolve; }); } },
    scopeChanged: assert.fail, error: error => { throw error; },
  });
  const initial = sync.setResources(['crm']);
  await entered;
  revisions.crm = 'after-save';
  void sync.refresh(); void sync.refresh(); void sync.refresh();
  release(); await initial;
  assert.equal(loads, 2);
  assert.equal(checks, 2);
  await sync.refresh();
  assert.equal(loads, 2);
});

test('failed resources retry independently and changed permissions invalidate the screen', async () => {
  const revisions = baseline(), counts = { crm: 0, deals: 0 };
  let errors = 0, reloads = 0;
  const sync = createResourceSync({
    revisions: async () => ({ ...revisions }),
    load: async resource => { if (resource === 'crm' || resource === 'deals') { counts[resource]++; if (resource === 'crm' && counts.crm === 1) throw new Error('offline'); } },
    scopeChanged: () => { reloads++; }, error: () => { errors++; },
  });
  await sync.setResources(['crm', 'deals']);
  assert.equal(errors, 1);
  await sync.refresh();
  assert.deepEqual(counts, { crm: 2, deals: 1 });
  revisions.scope = 'different-permissions';
  await sync.refresh();
  assert.equal(reloads, 1);
  assert.deepEqual(counts, { crm: 2, deals: 1 });
});
