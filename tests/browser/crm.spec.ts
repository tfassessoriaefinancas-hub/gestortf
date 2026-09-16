import { test, expect } from '@playwright/test';

test('CRM APIs persist a deal, its stage and its document', async ({ request }) => {
  const create = await request.post('/api/deals', { data: {
    name: 'Cliente de teste local', cpf: '00000000000', birthDate: '1990-01-01', product: 'Financiamento', phone: '85999999999',
  } });
  expect(create.status(), await create.text()).toBe(201);
  const { deal } = await create.json();
  const move = await request.patch('/api/deals', { data: { id: deal.id, stage: 'analise' } });
  expect(move.ok(), await move.text()).toBeTruthy();
  const list = await request.get('/api/deals');
  expect((await list.json()).deals).toEqual(expect.arrayContaining([expect.objectContaining({ id: deal.id, stage: 'analise' })]));

  const upload = await request.post('/api/deal-documents', { multipart: {
    dealId: String(deal.id), documentType: 'outro',
    file: { name: 'comprovante.txt', mimeType: 'text/plain', buffer: Buffer.from('Documento de teste local') },
  } });
  expect(upload.status(), await upload.text()).toBe(201);
  const { document } = await upload.json();
  const download = await request.get(`/api/deal-documents?id=${document.id}`);
  expect(await download.text()).toBe('Documento de teste local');
  const history = await request.get(`/api/deals/history?dealId=${deal.id}`);
  expect(history.ok()).toBeTruthy();

  const complete = await request.patch('/api/deals', { data: {
    id: deal.id, stage: 'finalizado', details: {
      name: 'Cliente de teste local', cpf: '00000000000', birthDate: '1990-01-01',
      bank: 'Banco de teste', product: 'Financiamento', operationType: 'Financiamento',
      producer: 'Thiago', origin: 'Sem parceiro', value: '10.000,00', installment: '500,00',
      term: '24', contractStatus: 'Finalizado', operationDate: '2026-09-16',
      commissionRate: '5', commissionPaid: 'Não', commissionDueDate: '2099-12-31', invoiceRequired: 'Não',
    },
  } });
  expect(complete.ok(), await complete.text()).toBeTruthy();
  const completed = await complete.json();
  expect(completed.receivables).toEqual(expect.arrayContaining([expect.objectContaining({ value: 500 })]));
  const production = await request.get('/api/crm/data');
  expect((await production.json()).operations).toEqual(expect.arrayContaining([expect.objectContaining({ dbId: deal.operationId, value: 10000, commission: 500 })]));

  for (const path of ['/api/crm/data', '/api/partners', '/api/access-users', '/api/invoices', '/api/whatsapp/settings']) {
    const response = await request.get(path);
    expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  }
  const outsideHost = await request.get('/api/crm/data', { headers: { host: 'crm.example.com' } });
  expect(outsideHost.status()).toBe(401);
  for (const file of ['tf-clients.json', 'tf-operations.json']) {
    const missing = await request.get(`/data/${file}`);
    expect(missing.status()).toBe(200);
    expect(await missing.json()).toEqual([]);
    expect(missing.headers()['cache-control']).toContain('no-store');
    const unauthorized = await request.get(`/data/${file}`, { headers: { host: 'crm.example.com' } });
    expect(unauthorized.status()).toBe(401);
  }
  expect((await request.get('/data/unknown.json')).status()).toBe(404);
});

test('original gate, all navigation sections, themes and mobile layout work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Gestão', exact: true })).toBeVisible();
  await page.getByLabel('CPF', { exact: true }).fill('00000000000');
  await page.getByLabel('Senha', { exact: true }).fill('teste-local');
  await page.locator('.tf-gate form button[type="submit"]').click();
  await expect(page.locator('.tf-sidebar, .tf-side').first()).toBeVisible();
  const menu = page.locator('aside nav button[aria-label]');
  const labels = await menu.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')!));
  expect(labels.length).toBeGreaterThan(10);
  for (const label of labels) {
    await page.locator('aside nav').getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.tf-main')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Ir para o início', exact: true }).first().click();
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Abrir menu', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.locator('.tf-icon-drawer nav button').first().click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
  await page.goto('/signout-with-chatgpt');
  await expect(page.getByRole('heading', { name: 'Gestão', exact: true })).toBeVisible();
});
