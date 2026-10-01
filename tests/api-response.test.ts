import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readApiPayload } from '../lib/api-response.ts';

test('empty or invalid save responses become useful messages instead of JSON errors', async () => {
  assert.deepEqual(await readApiPayload(new Response('', { status: 500 })), { error: 'O servidor não respondeu ao salvar. Tente novamente em alguns instantes.' });
  assert.deepEqual(await readApiPayload(new Response('', { status: 200 })), { error: 'O servidor não confirmou o salvamento. Tente novamente.' });
  assert.deepEqual(await readApiPayload(new Response('<html>erro</html>', { status: 502 })), { error: 'O servidor não conseguiu concluir o salvamento. Tente novamente.' });
  assert.deepEqual(await readApiPayload<{ ok: boolean }>(new Response('{"ok":true}')), { ok: true });
});
