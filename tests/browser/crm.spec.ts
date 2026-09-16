import { test, expect, type APIRequestContext } from '@playwright/test';
import { PostgresDatabase, PostgresFiles } from '../../lib/postgres';

const origin='http://127.0.0.1:3100';
async function login(request:APIRequestContext,email='admin@example.com',password='test-only-password'){
  const response=await request.post('/api/auth/login',{headers:{origin},data:{email,password}});
  expect(response.status(),await response.text()).toBe(200);
}


test('CRM APIs persist a deal, its stage and its document', async ({ request }) => {
  await login(request);
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
  for (const file of ['tf-clients.json', 'tf-operations.json']) {
    const missing = await request.get(`/data/${file}`);
    expect(missing.status()).toBe(200);
    expect(await missing.json()).toEqual([]);
    expect(missing.headers()['cache-control']).toContain('no-store');
  }
  expect((await request.get('/data/unknown.json')).status()).toBe(404);
});

test('hosted login, all navigation sections and mobile layout work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Gestão', exact: true })).toBeVisible();
  await page.getByLabel('CPF ou e-mail', { exact: true }).fill('012.345.678-90');
  await page.getByLabel('Senha', { exact: true }).fill('test-only-password');
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


test('historical records are editable in PostgreSQL and superseded entries stay out of reports',async({request})=>{
  await login(request);
  const page=await request.get('/api/crm/data?limit=1');
  expect(page.ok(),await page.text()).toBeTruthy();
  expect((await page.json()).nextOffset).toBe(1);
  const production=await request.get('/api/crm/data');
  const data=await production.json();
  expect(data.operations).toEqual(expect.arrayContaining([expect.objectContaining({dbId:100,value:1234.56})]));
  expect(data.operations.some((row:{dbId:number})=>row.dbId===101)).toBe(false);
  const edit=await request.patch('/api/records',{data:{entity:'client',id:100,details:{name:'Histórico atualizado no Neon',document:'11111111111',birthDate:'1990-01-01'}}});
  expect(edit.ok(),await edit.text()).toBeTruthy();
  expect((await (await request.get('/api/crm/data')).json()).clients).toEqual(expect.arrayContaining([expect.objectContaining({dbId:100,name:'Histórico atualizado no Neon'})]));
});

test('advisory fees keep their cents when typed, pasted, saved and reopened', async ({ page }) => {
  const db = new PostgresDatabase();
  try {
    await db.batch([
      db.prepare("INSERT INTO clients (id,owner_id,name,normalized_name,cpf,created_at,updated_at) VALUES (200,'local-test-owner','Teste de taxa de assessoria','teste de taxa de assessoria','22222222222',1,1)"),
      db.prepare("INSERT INTO operations (id,owner_id,client_id,bank,original_product,category,value_cents,status,completed_at,notes,created_at,updated_at) VALUES (200,'local-test-owner',200,'Banco do Brasil','Financiamento','Financiamento',1000000,'Finalizado','2026-09-16',?,1,1)").bind(JSON.stringify({ agreement: 'Veículo' })),
    ]);
  } finally { await db.close(); }
  await login(page.request);

  const openEditor = async () => {
    await page.goto('/');
    await page.locator('aside nav').getByRole('button', { name: 'Clientes', exact: true }).click();
    await page.locator('.tf-client-row').filter({ hasText: 'Teste de taxa de assessoria' }).click();
    await page.getByRole('button', { name: 'Editar informações', exact: true }).click();
  };
  await openEditor();
  const editor = page.locator('.tf-operation-editor');
  const fee = editor.getByLabel('Taxa de assessoria', { exact: true });
  await fee.fill('');
  await fee.pressSequentially('15050');
  await expect(fee).toHaveValue(/R\$\s150,50/);
  await fee.press('Tab');
  await expect(fee).toHaveValue(/R\$\s150,50/);
  await fee.fill('');
  await expect(fee).toHaveValue('');
  await fee.evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '1.234,56');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(fee).toHaveValue(/R\$\s1\.234,56/);
  await editor.getByLabel('Vencimento da receita', { exact: true }).fill('2099-12-31');
  const saved = page.waitForResponse(response => response.url().endsWith('/api/records') && response.request().method() === 'PATCH');
  await editor.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBeTruthy();
  expect(response.request().postDataJSON().details.advisoryFee).toBe(1234.56);

  await openEditor();
  await expect(fee).toHaveValue(/R\$\s1\.234,56/);
});

test('server authentication rejects anonymous access and manages employee sessions',async({request,playwright})=>{
  for(const path of ['/api/crm/data','/api/access-users','/data/tf-clients.json'])expect((await request.get(path)).status()).toBe(401);
  expect((await request.post('/api/germano-report',{data:{password:'GG'}})).status()).toBe(401);
  expect((await request.post('/api/auth/login',{headers:{origin:'https://outside.example'},data:{email:'admin@example.com',password:'test-only-password'}})).status()).toBe(403);
  expect((await request.post('/api/auth/login',{headers:{origin},data:{email:'admin@example.com',password:'incorrect'}})).status()).toBe(401);
  await login(request);
  const create=await request.post('/api/access-users',{data:{name:'Funcionário teste',email:'employee@example.com',password:'employee-test-password',permissions:['inicio','clientes','atendimento','producao']}});
  expect(create.status(),await create.text()).toBe(201);
  const member=(await create.json()).member;
  const employee=await playwright.request.newContext({baseURL:origin});
  const secondSession=await playwright.request.newContext({baseURL:origin});
  try{
    await login(employee,'employee@example.com','employee-test-password');
    await login(secondSession,'employee@example.com','employee-test-password');
    expect((await employee.get('/api/access-users')).status()).toBe(401);
    const scoped=await employee.get('/api/crm/data');
    expect(scoped.ok(),await scoped.text()).toBeTruthy();
    expect((await scoped.json()).operations).toEqual([]);
    expect((await employee.patch('/api/records',{data:{entity:'client',id:100,details:{name:'Forbidden edit'}}})).status()).toBe(404);
    const change=await employee.post('/api/auth/password',{headers:{origin},data:{currentPassword:'employee-test-password',newPassword:'updated-test-password'}});
    expect(change.ok(),await change.text()).toBeTruthy();
    expect((await secondSession.get('/api/crm/data')).status()).toBe(401);
    await employee.post('/api/auth/logout',{headers:{origin}});
    expect((await employee.get('/api/crm/data')).status()).toBe(401);
    await login(employee,'employee@example.com','updated-test-password');
    const pause=await request.patch('/api/access-users',{data:{id:member.id,active:false}});
    expect(pause.ok(),await pause.text()).toBeTruthy();
    expect((await employee.get('/api/crm/data')).status()).toBe(401);
  }finally{await employee.dispose();await secondSession.dispose();}
});

test('PostgreSQL batches roll back and document bytes survive reconnection',async()=>{
  let db=new PostgresDatabase();
  try{
    await expect(db.batch([
      db.prepare("INSERT INTO companies (owner_id,name,created_at) VALUES ('test','Rollback company',1)"),
      db.prepare("INSERT INTO contacts (company_id,name) VALUES (999999,'Missing parent')"),
    ])).rejects.toThrow();
    expect(await db.prepare('SELECT COUNT(*) AS count FROM companies').first('count')).toBe(0);
    const inserted=await db.prepare("INSERT INTO companies (owner_id,name,created_at) VALUES ('test','Persistent company',1) RETURNING id AS companyId").first<{companyId:number}>();
    expect(typeof inserted?.companyId).toBe('number');
    const files=new PostgresFiles(db);
    await files.put('test/persistent.txt',new TextEncoder().encode('Bytes persistidos no PostgreSQL').buffer);
    await db.close();db=new PostgresDatabase();
    expect(new TextDecoder().decode((await new PostgresFiles(db).get('test/persistent.txt'))?.body)).toBe('Bytes persistidos no PostgreSQL');
  }finally{await db.close();}
});

test('CPF and email aliases share the same login attempt limit',async({request})=>{
  const identifiers=['01234567890','012.345.678-90','admin@example.com'];
  for(let i=0;i<10;i++){
    const response=await request.post('/api/auth/login',{headers:{origin},data:{login:identifiers[i%identifiers.length],password:'wrong-test-password'}});
    expect(response.status()).toBe(401);
  }
  const blocked=await request.post('/api/auth/login',{headers:{origin},data:{login:'01234567890',password:'test-only-password'}});
  expect(blocked.status()).toBe(429);
});
