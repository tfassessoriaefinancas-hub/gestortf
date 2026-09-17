import { test, expect, type Page } from '@playwright/test';
import { PostgresDatabase } from '../../lib/postgres';

async function login(page: Page) {
  const response = await page.request.post('/api/auth/login', { headers: { origin: 'http://127.0.0.1:3100' }, data: { email: 'admin@example.com', password: 'test-only-password' } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test('an imported operation updates the same client, revenues, partner and reports after reload', async ({ page }) => {
  test.setTimeout(120000);
  const db = new PostgresDatabase();
  const name = 'João Pedro — validação';
  try {
    await db.batch([
      db.prepare("INSERT INTO clients (id,owner_id,name,normalized_name,cpf,phone,birth_date,created_at,updated_at) VALUES (500,'local-test-owner',?,'joao pedro','33333333333','(88) 99999-1111','1990-01-01',1,1)").bind(name),
      db.prepare("INSERT INTO partners (id,owner_id,name,active,created_at,updated_at) VALUES (500,'local-test-owner','GG Veículos',1,1,1)"),
      db.prepare("INSERT INTO operations (id,owner_id,client_id,partner_id,bank,original_product,category,producer,origin,value_cents,installment_cents,term,operation_date,paid_at,completed_at,status,is_historical,notes,contract_number,created_at,updated_at) VALUES (500,'local-test-owner',500,500,'Banco do Brasil','Financiamento','Financiamento','Balcão TF / Código GG','GG Veículos',4265000,126159,48,'2026-08-03','2026-08-03','2026-08-03','Finalizado',1,?,'CONTRATO-ORIGINAL',1,1)").bind(JSON.stringify({ agreement: 'Veículo', commissionRate: 6, advisoryFeeCents: 100000, commissionPaid: true, observations: 'Observação preservada', sourceCommissionCents: 255900 })),
      db.prepare("INSERT INTO commissions (id,owner_id,operation_id,value_cents,rate_bps,status,notes,expected_at,received_at,created_at,updated_at) VALUES (500,'local-test-owner',500,255900,600,'recebida','Comissão','2026-08-03','2026-08-03',1,1),(501,'local-test-owner',500,100000,NULL,'recebida','Taxa de assessoria','2026-08-03','2026-08-03',1,1),(502,'local-test-owner',500,189000,NULL,'recebida','Base após ILA parceiro GG','2026-08-03','2026-08-03',1,1)"),
      db.prepare("INSERT INTO partner_operation_adjustments (owner_id,partner_id,operation_id,ila_rate_bps,invoice_rate_bps,tf_share_bps,created_at,updated_at) VALUES ('local-test-owner',500,500,2606,200,5000,1,1)"),
      db.prepare("INSERT INTO deals (id,owner_id,client_id,operation_id,title,payload_json,stage,status,needs_completion,created_at,updated_at) VALUES (500,'local-test-owner',500,500,'Nome antigo',?,'finalizado','concluido',0,1,1)").bind(JSON.stringify({ name: 'Nome antigo', commissionRate: '6' })),
    ]);
    const counts = await db.prepare('SELECT (SELECT COUNT(*) FROM clients) AS clients,(SELECT COUNT(*) FROM operations) AS operations').first();
    await login(page);
    await page.clock.setFixedTime(new Date('2026-08-15T12:00:00-03:00'));
    await page.goto('/');
    await page.locator('.tf-side nav').getByRole('button', { name: 'Produção', exact: true }).click();
    await page.getByLabel('Período', { exact: true }).fill('2026-08');
    await page.locator('.tf-op-row').filter({ hasText: name }).click();
    await page.getByRole('button', { name: 'Editar informações', exact: true }).click();
    const editor = page.locator('.tf-operation-editor');
    await expect(editor.getByLabel('Nome do cliente', { exact: true })).toHaveValue(name);
    await expect(editor.getByLabel('CPF ou benefício', { exact: true })).toHaveValue('33333333333');
    await expect(editor.getByLabel('Telefone / WhatsApp', { exact: true })).toHaveValue('(88) 99999-1111');
    await expect(editor.getByLabel('Valor pago / liberado', { exact: true })).toHaveValue(/42\.650,00/);
    await expect(editor.getByLabel('Parcela', { exact: true })).toHaveValue(/1\.261,59/);
    await expect(editor.getByLabel('Número do contrato', { exact: true })).toHaveValue('CONTRATO-ORIGINAL');
    await expect(editor.getByRole('textbox', { name: 'Observações da operação', exact: true })).toHaveValue('Observação preservada');
    await editor.getByLabel('Comissão (%)', { exact: false }).fill('4');
    const save = page.waitForResponse(response => response.url().endsWith('/api/records') && response.request().method() === 'PATCH');
    await editor.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
    const saved = await save;
    expect(saved.ok(), await saved.text()).toBeTruthy();
    await expect(editor).toBeHidden();

    const crm = await (await page.request.get('/api/crm/data')).json();
    expect(crm.operations.find((operation: { dbId: number }) => operation.dbId === 500)).toMatchObject({ clientName: name, commissionRate: 4, grossCommission: 1706, commission: 2706, advisoryFee: 1000, partnerId: 500 });
    const portal = await (await page.request.post('/api/germano-report')).json();
    expect(portal.operations.find((operation: { id: number }) => operation.id === 500)).toMatchObject({ clientName: name, gross: 1706, ilaRate: 26.06, invoiceRate: 2, tfShare: 50 });
    const deal = (await (await page.request.get('/api/deals')).json()).deals.find((item: { id: number }) => item.id === 500);
    expect(deal).toBeUndefined();
    expect(await db.prepare('SELECT stage,status,needs_completion FROM deals WHERE id=500').first()).toEqual({ stage: 'finalizado', status: 'concluido', needs_completion: 0 });
    expect(await db.prepare('SELECT (SELECT COUNT(*) FROM clients) AS clients,(SELECT COUNT(*) FROM operations) AS operations').first()).toEqual(counts);
    expect((await db.prepare('SELECT id,value_cents,received_at,deleted_at FROM commissions WHERE operation_id=500 ORDER BY id').all()).results).toEqual([
      { id: 500, value_cents: 170600, received_at: '2026-08-03', deleted_at: null },
      { id: 501, value_cents: 100000, received_at: '2026-08-03', deleted_at: null },
      { id: 502, value_cents: 189000, received_at: '2026-08-03', deleted_at: null },
    ]);

    await page.locator('.tf-side nav').getByRole('button', { name: 'Parceiros', exact: true }).click();
    await page.getByLabel('MÊS DO RELATÓRIO').selectOption('2026-08');
    await page.locator('.tf-partner-expand').click();
    await expect(page.locator('.tf-partner-operation-row').filter({ hasText: name })).toContainText('1.706,00');
    await page.getByRole('button', { name: 'Abrir relatório', exact: true }).click();
    await expect(page.locator('.tf-partner-report-cards')).toContainText('1.706,00');
    await page.getByRole('button', { name: 'Fechar relatório', exact: true }).click();
    await page.locator('.tf-side nav').getByRole('button', { name: 'Financeiro / Comissões', exact: true }).click();
    await page.getByLabel('MÊS DE REFERÊNCIA').selectOption('2026-08');
    await expect(page.locator('.tf-metrics')).toContainText('2.706,00');
    await page.reload();
    await expect(page.locator('.tf-kpi-strip')).toContainText('2.706,00');
    await page.locator('.tf-side nav').getByRole('button', { name: 'Clientes', exact: true }).click();
    await page.locator('.tf-client-row').filter({ hasText: name }).click();
    await page.getByRole('button', { name: 'Editar informações', exact: true }).click();
    await expect(editor.getByLabel('Comissão (%)', { exact: false })).toHaveValue('4');
  } finally { await db.close(); }
});

test('both themes share responsive structure, full menu labels and an unobstructed search', async ({ page }) => {
  test.setTimeout(120000);
  await login(page);
  await page.goto('/');
  const selectors = ['.tf-command-hero', '.tf-kpi-strip', '.tf-month-comparison', '.tf-overview-layout', '.tf-quick-panel-horizontal'];
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const layouts: unknown[] = [];
    for (const theme of ['classic', 'mono', 'classic']) {
      if (!(await page.locator('.tf-app').getAttribute('class'))?.includes(`theme-${theme}`)) {
        if (width <= 700) await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
        await page.locator('.tf-side nav').getByRole('button', { name: theme === 'mono' ? 'Usar tema Preto Luxo' : 'Usar tema original', exact: true }).click();
      }
      await expect(page.locator('.tf-app')).toHaveClass(new RegExp(`theme-${theme}`));
      const search = page.getByPlaceholder('Buscar por nome ou CPF');
      await expect(search).toBeVisible();
      const searchStyle = await search.evaluate(element => ({ background: getComputedStyle(element).backgroundImage, before: getComputedStyle(element.parentElement!, '::before').content }));
      expect(searchStyle).toEqual({ background: 'none', before: 'none' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      const boxes = await page.evaluate(items => items.map(selector => { const rect = document.querySelector(selector)!.getBoundingClientRect(); return { x: Math.round(rect.x), width: Math.round(rect.width), height: Math.round(rect.height) }; }), selectors);
      layouts.push(boxes);
      await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
      await expect(page.locator('.tf-app')).toHaveClass(/menu-open/);
      const navigation = page.locator('.tf-side');
      const labels = await navigation.locator('nav button span').evaluateAll(elements => elements.map(element => ({ text: element.textContent, visible: getComputedStyle(element).display !== 'none', clipped: element.scrollWidth > element.clientWidth + 1 })));
      expect(labels.every(label => label.visible && !label.clipped)).toBe(true);
      expect(labels.some(label => label.text === 'Atendimento')).toBe(true);
      const side = await navigation.boundingBox(), main = await page.locator('.tf-main').boundingBox();
      expect(side && main && (width > 700 ? side.x + side.width <= main.x + 1 : side.y + side.height <= main.y + 1)).toBeTruthy();
      if (width <= 700) await navigation.getByRole('button', { name: 'Fechar menu', exact: true }).click();
      else await page.getByRole('button', { name: 'Recolher menu', exact: true }).click();
      if (theme === 'mono' || layouts.length === 1) await page.screenshot({ path: `test-results/shared-layout-${width}-${theme}.png`, fullPage: true });
    }
    expect(layouts[1]).toEqual(layouts[0]);
    expect(layouts[2]).toEqual(layouts[0]);
  }
});

test('finalização, pós-venda e bonificação são reversíveis e idempotentes', async ({ page }) => {
  test.setTimeout(120000);
  const db = new PostgresDatabase();
  const dealId = 601;
  const clientId = 601;
  const clientName = 'Cliente fluxo completo Gestão TF';
  const partnerName = 'Parceiro fluxo restrito';
  try {
    await db.batch([
      db.prepare("INSERT INTO clients (id,owner_id,name,normalized_name,cpf,birth_date,phone,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,1)").bind(clientId, 'local-test-owner', clientName, 'cliente fluxo completo gestao tf', '44444444444', '1990-01-01', '(85) 98888-7777'),
      db.prepare("INSERT INTO deals (id,owner_id,title,payload_json,stage,status,needs_completion,created_at,updated_at) VALUES (?,?,?,?, 'contratado','aberto',0,1,1)").bind(dealId, 'local-test-owner', clientName, JSON.stringify({ name: clientName, cpf: '44444444444', birthDate: '1990-01-01', product: 'Financiamento', phone: '(85) 98888-7777' })),
    ]);
  } finally { await db.close(); }

  const loginResponse = await page.request.post('/api/auth/login', { headers: { origin: 'http://127.0.0.1:3100' }, data: { email: 'admin@example.com', password: 'test-only-password' } });
  expect(loginResponse.ok(), await loginResponse.text()).toBeTruthy();
  const move = await page.request.patch('/api/deals', { data: { id: dealId, stage: 'finalizado' } });
  expect(move.ok(), await move.text()).toBeTruthy();
  const details = {
    name: clientName, cpf: '44444444444', birthDate: '1990-01-01', phone: '(85) 98888-7777',
    bank: 'Bradesco', product: 'Financiamento', contractType: 'Financiamento', operationType: 'Financiamento',
    producer: 'Balcão TF', origin: 'TF', value: '10.000,00', installment: '500,00', term: '24', dueDay: '10',
    contractStatus: 'Finalizado', operationDate: '2026-09-17', paidDate: '2026-09-17',
    commissionRate: '5', commissionPaid: 'Não', commissionDueDate: '2099-12-31', invoiceRequired: 'Não',
    postSale: 'Pendente', postSaleNotes: 'Enviar orientação sobre o contrato.',
  };
  const completed = await page.request.patch('/api/deals', { data: { id: dealId, stage: 'finalizado', details } });
  expect(completed.ok(), await completed.text()).toBeTruthy();
  const first = await completed.json();
  expect(first).toMatchObject({ status: 'concluido', needsCompletion: false, operationId: expect.any(Number) });

  const activeDeals = await (await page.request.get('/api/deals')).json();
  expect(activeDeals.deals.some((deal: { id: number }) => deal.id === dealId)).toBe(false);
  const firstCounts = await dbQuery(first.operationId);
  expect(firstCounts).toMatchObject({ clients: 1, operations: 1, post_sale_tasks: 1 });

  const repeated = await page.request.patch('/api/deals', { data: { id: dealId, stage: 'finalizado', details } });
  expect(repeated.ok(), await repeated.text()).toBeTruthy();
  expect(await repeated.json()).toMatchObject({ alreadyCompleted: true, operationId: first.operationId });
  expect(await dbQuery(first.operationId)).toEqual(firstCounts);

  const postSales = await (await page.request.get('/api/post-sales')).json();
  const task = postSales.tasks.find((item: { operationId: number }) => item.operationId === first.operationId);
  expect(task).toMatchObject({ status: 'pendente', clientName, product: 'Financiamento', bank: 'Bradesco', value: 10000, installment: 500, term: 24 });
  expect(postSales.googleReviewUrl).toBeDefined();
  const whatsapp = `https://wa.me/55${'85988887777'}`;
  expect(`https://wa.me/55${task.phone.replace(/\D/g, '')}`).toBe(whatsapp);
  const postSaleCompleted = await page.request.patch('/api/post-sales', { data: { id: task.id, status: 'concluido' } });
  expect(postSaleCompleted.ok(), await postSaleCompleted.text()).toBeTruthy();
  expect(await postSaleCompleted.json()).toMatchObject({ task: { id: task.id, status: 'concluido', completedAt: expect.any(Number) } });
  expect((await (await page.request.get('/api/post-sales')).json()).tasks.find((item: { id: number }) => item.id === task.id)).toMatchObject({ status: 'concluido' });

  const partner = await page.request.post('/api/partners', { data: { name: partnerName } });
  expect(partner.status(), await partner.text()).toBe(201);
  const partnerId = (await partner.json()).partner.id as number;
  for (const [bonus, description] of [[500, 'Campanha inicial'], [250, 'Campanha revisada'], [0, '']] as const) {
    const response = await page.request.patch('/api/partners', { data: { id: partnerId, period: '2026-09', bonus, bonusDescription: description } });
    expect(response.ok(), await response.text()).toBeTruthy();
    expect((await response.json()).settlement).toMatchObject({ bonus });
  }
  const dbAfterZero = new PostgresDatabase();
  try {
    expect(await dbAfterZero.prepare('SELECT bonus_cents,bonus_description FROM partner_settlements WHERE partner_id=? AND period=?').bind(partnerId, '2026-09').first()).toEqual({ bonus_cents: 0, bonus_description: null });
  } finally { await dbAfterZero.close(); }

  await page.goto('/');
  await page.locator('.tf-side nav').getByRole('button', { name: 'Parceiros', exact: true }).click();
  await page.getByLabel('MÊS DO RELATÓRIO').selectOption('2026-09');
  const partnerCard = page.locator('.tf-partner-executive').filter({ hasText: partnerName });
  await partnerCard.locator('.tf-partner-expand').click();
  const visibleBonus = partnerCard.getByLabel('Valor adicional de bônus ou campanha', { exact: true });
  await visibleBonus.fill('');
  await visibleBonus.pressSequentially('50000');
  await visibleBonus.press('Tab');
  await expect(partnerCard.getByRole('button', { name: 'Remover valor adicional', exact: true })).toBeVisible();
  const removeResponse = page.waitForResponse(response => response.url().endsWith('/api/partners') && response.request().method() === 'PATCH' && response.request().postDataJSON().bonus === 0);
  await partnerCard.getByRole('button', { name: 'Remover valor adicional', exact: true }).click();
  await removeResponse;
  await expect(partnerCard.getByRole('button', { name: 'Remover valor adicional', exact: true })).toBeHidden();
  const verifiedZero = new PostgresDatabase();
  try { expect(await verifiedZero.prepare('SELECT bonus_cents FROM partner_settlements WHERE partner_id=? AND period=?').bind(partnerId, '2026-09').first('bonus_cents')).toBe(0); }
  finally { await verifiedZero.close(); }

  async function dbQuery(operationId: number) {
    const connection = new PostgresDatabase();
    try {
      const entries = await Promise.all([
        ['clients', Number(await connection.prepare('SELECT COUNT(*) AS count FROM clients WHERE id=?').bind(clientId).first('count'))],
        ['operations', Number(await connection.prepare('SELECT COUNT(*) AS count FROM operations WHERE id=? AND client_id=?').bind(operationId, clientId).first('count'))],
        ['post_sale_tasks', Number(await connection.prepare('SELECT COUNT(*) AS count FROM post_sale_tasks WHERE operation_id=?').bind(operationId).first('count'))],
        ['deal_history', Number(await connection.prepare('SELECT COUNT(*) AS count FROM deal_history WHERE deal_id=?').bind(dealId).first('count'))],
      ] as const);
      return Object.fromEntries(entries) as Record<string, number>;
    } finally { await connection.close(); }
  }
});
