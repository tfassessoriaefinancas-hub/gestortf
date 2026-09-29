import { test, expect, type Page } from '@playwright/test';
import { createDatabase } from '../../lib/database';

const origin = 'http://127.0.0.1:3100';
test.afterEach(async () => {
  const db = createDatabase();
  try {
    await db.batch([
      db.prepare('DELETE FROM partner_settlements WHERE partner_id=903'),
      db.prepare('DELETE FROM partners WHERE id=903'),
      db.prepare('DELETE FROM clients WHERE id=902'),
    ]);
  } finally { await db.close(); }
});
async function login(page: Page) {
  const response = await page.request.post('/api/auth/login', { headers: { origin }, data: { email: 'admin@example.com', password: 'test-only-password' } });
  expect(response.ok(), await response.text()).toBeTruthy();
}
async function nextCheck(page: Page) {
  const checked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/crm/changes');
  await page.evaluate(() => window.dispatchEvent(new Event('pointerdown')));
  await page.clock.fastForward(60_000);
  const response = await checked;
  expect(response.ok()).toBeTruthy();
  await response.finished();
  await page.evaluate(() => Promise.resolve());
}

test('the luxury black theme keeps unchanged history cached and synchronizes edits from another session', async ({ page, browser }) => {
  test.setTimeout(120000);
  const db = createDatabase();
  try {
    await db.prepare("INSERT INTO clients (id,owner_id,name,normalized_name,cpf,created_at,updated_at) VALUES (902,'local-test-owner','Cliente sincronização econômica','cliente sincronizacao economica','90290290290',1,1)").run();
  } finally { await db.close(); }
  await login(page);
  const external = await browser.newContext({ baseURL: origin });
  const remote = await external.newPage();
  await login(remote);
  await page.clock.install();
  const requests: string[] = [];
  page.on('request', request => { if (request.method() === 'GET' && new URL(request.url()).pathname.startsWith('/api/')) requests.push(new URL(request.url()).pathname); });
  const count = (path: string) => requests.filter(item => item === path).length;
  try {
    {
      const initial = page.waitForResponse(response => new URL(response.url()).pathname === '/api/crm/data');
      await page.goto('/');
      await initial;
      await expect(page.locator('.tf-app')).toHaveClass(/theme-mono/);
      const initialReads = count('/api/crm/data');
      const otherReads = count('/api/partners') + count('/api/invoices') + count('/api/post-sales') + count('/api/access-users');
      for (let i = 0; i < 3; i++) await nextCheck(page);
      expect(count('/api/crm/data')).toBe(initialReads);
      expect(count('/api/partners') + count('/api/invoices') + count('/api/post-sales') + count('/api/access-users')).toBe(otherReads);
      const beforeFocus = count('/api/crm/changes');
      await page.evaluate(() => { for (let i = 0; i < 5; i++) { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); } });
      await page.clock.fastForward(1000);
      expect(count('/api/crm/changes')).toBe(beforeFocus);
      const changedName = 'Cliente alterado em outro computador';
      const saved = await remote.request.patch(`${origin}/api/records`, { data: { entity: 'client', id: 902, details: { name: changedName } } });
      expect(saved.ok(), await saved.text()).toBeTruthy();
      const reloaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/crm/data');
      await nextCheck(page);
      await reloaded;
      await page.locator('aside nav').getByRole('button', { name: 'Clientes', exact: true }).click();
      await expect(page.locator('.tf-client-row').filter({ hasText: changedName })).toBeVisible();
      expect(count('/api/crm/data')).toBe(initialReads + 1);
      const invoices = page.waitForResponse(response => new URL(response.url()).pathname === '/api/invoices');
      await page.locator('aside nav').getByRole('button', { name: 'Notas fiscais', exact: true }).click();
      await invoices;
      await nextCheck(page);
      expect(count('/api/crm/data')).toBe(initialReads + 1);
    }
  } finally { await external.close(); }
});

test('the partner portal only reloads its report after a relevant change', async ({ page }) => {
  test.setTimeout(120000);
  const db = createDatabase();
  try {
    await db.prepare("INSERT INTO partners (id,owner_id,name,active,created_at,updated_at) VALUES (903,'local-test-owner','Parceiro sincronização econômica',1,1,1)").run();
  } finally { await db.close(); }
  await login(page);
  await page.clock.install();
  let reports = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/germano-report') reports++; });
  const initial = page.waitForResponse(response => new URL(response.url()).pathname === '/api/germano-report');
  await page.goto('/germano?partner=903');
  expect((await initial).ok()).toBeTruthy();
  await expect(page.locator('body')).toContainText('Parceiro sincronização econômica');
  for (let i = 0; i < 3; i++) await nextCheck(page);
  expect(reports).toBe(1);
  const bonus = await page.request.patch('/api/partners', { data: { id: 903, period: '2026-09', bonus: 500, bonusDescription: 'Bônus sincronizado', grossCommission: 0 } });
  expect(bonus.ok(), await bonus.text()).toBeTruthy();
  const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/germano-report');
  await nextCheck(page);
  const result = await refreshed;
  expect(result.ok(), await result.text()).toBeTruthy();
  expect((await result.json()).operations).toEqual(expect.arrayContaining([expect.objectContaining({ product: 'Bônus sincronizado' })]));
  expect(reports).toBe(2);
});
