import { test, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:3100';

test('compromissos podem ser cadastrados, exibidos no aviso e concluídos', async ({ page }) => {
  const login = await page.request.post('/api/auth/login', {
    headers: { origin },
    data: { email: 'admin@example.com', password: 'test-only-password' },
  });
  expect(login.ok(), await login.text()).toBeTruthy();

  const title = `Agendamento de teste ${Date.now()}`;
  const created = await page.request.post('/api/activities', {
    data: { type: 'agendamento', title, clientName: 'Cliente histórico de teste', notes: 'Retorno na próxima semana', dueAt: Date.now() },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const activity = (await created.json()).activity;

  try {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Você tem .* atividade/ })).toBeVisible();
    await page.getByRole('button', { name: 'Abrir atividades' }).click();
    await expect(page.getByRole('heading', { name: 'Compromissos e negócios' })).toBeVisible();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Cliente: Cliente histórico de teste')).toBeVisible();

    const card = page.locator('.tf-activity-list>article').filter({ hasText: title });
    await card.getByRole('button', { name: 'Concluir' }).click();
    await page.getByRole('button', { name: 'Concluídas' }).click();
    await expect(card.getByRole('button', { name: 'Reabrir' })).toBeVisible();

    const list = await page.request.get('/api/activities');
    expect(list.ok(), await list.text()).toBeTruthy();
    expect((await list.json()).activities).toEqual(expect.arrayContaining([expect.objectContaining({ id: activity.id, title, completedAt: expect.any(Number) })]));
  } finally {
    await page.request.delete(`/api/activities?id=${activity.id}`);
  }
});
