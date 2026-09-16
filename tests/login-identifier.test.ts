import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginIdentifier } from '../lib/login-identifier.ts';

test('CPF login preserves leading zeroes and normalizes punctuation', () => {
  for (const input of ['01234567890', '012.345.678-90', ' 012.345.678-90 ']) {
    assert.deepEqual(loginIdentifier(input), { kind: 'cpf', value: '01234567890' });
  }
});

test('email login remains supported and invalid identifiers cannot become a CPF', () => {
  assert.deepEqual(loginIdentifier(' ADMIN@EXAMPLE.COM '), { kind: 'email', value: 'admin@example.com' });
  for (const input of ['', '0123456789', '012345678901', 'user01234567890', 'not-an-email', 1234567890, null]) {
    assert.equal(loginIdentifier(input), null);
  }
});
