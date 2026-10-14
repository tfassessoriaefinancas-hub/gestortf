import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { kanbanImagery, kanbanPhotoAssignments } from '../lib/kanban-imagery.ts';

test('each service has three different available photos, including repeated financing deals', () => {
  for (const product of ['Financiamento', 'Proteção Auto', 'Consórcio', 'Crédito imobiliário', 'INSS', 'CLT', 'FGTS', 'Consignado', 'Assessoria Financeira', 'Seguros']) {
    const deals = [1, 2, 3].map(id => ({ id, product, stage: 'atendimento' }));
    const photos = [...kanbanPhotoAssignments(deals).values()];
    assert.equal(new Set(photos).size, 3, product);
    for (const photo of photos) assert.ok(existsSync(new URL(`../public${photo}`, import.meta.url)), photo);
  }
});

test('protection and consortium remain distinct even with vehicle details', () => {
  assert.equal(kanbanImagery({ product: 'Proteção Auto', operationType: 'Veículo' }), 'protecao');
  assert.equal(kanbanImagery({ product: 'Consórcio', operationType: 'Veículo' }), 'consorcio');
  assert.equal(kanbanImagery({ product: 'Crédito com garantia', guaranteeType: 'Imóvel' }), 'imovel');
  const deals = [1, 2, 3].map(id => ({ id, product: 'Proteção Auto' }));
  const protection = new Set(kanbanPhotoAssignments(deals).values());
  const consortium = kanbanPhotoAssignments(deals.map(deal => ({ ...deal, product: 'Consórcio' })));
  for (const photo of consortium.values()) assert.ok(!protection.has(photo));
});

test('reordering, moving and completing a deal preserve other assigned photos', () => {
  const deals = [1, 2, 3].map(id => ({ id, product: 'Financiamento', stage: 'atendimento' }));
  const before = kanbanPhotoAssignments(deals);
  assert.deepEqual(kanbanPhotoAssignments([...deals].reverse()), before);
  assert.deepEqual(kanbanPhotoAssignments(deals.map(deal => ({ ...deal, stage: 'analise' }))), before);
  const after = kanbanPhotoAssignments(deals.map(deal => deal.id === 1 ? { ...deal, stage: 'finalizado' } : deal));
  assert.equal(after.has(1), false);
  assert.equal(after.get(2), before.get(2));
  assert.equal(after.get(3), before.get(3));
  assert.deepEqual(deals.map(deal => deal.id), [1, 2, 3]);
});
