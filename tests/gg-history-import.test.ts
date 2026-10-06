import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGgHistorySpreadsheet } from '../lib/gg-history-import.ts';

test('parses GG history rows, payment dates, origins and campaign bonus', () => {
  const text = [
    'NOME\tCPF\tBANCO\tPRODUTO\tPARCELA\tVALOR\tPRAZO\tSITUAÇÃO CONTRATO\tTELEFONE\tDATA\tPROD\tCOMISSAO BRUTA\tLIQUIDO\tREP TFGG',
    'CLIENTE TF\t123.456.789-01\tC6 BANK TF\tFINANCIAMENTO\tR$ 1.000,00\tR$ 25.000,00\t48\tCONTRATO PAGO DIA 04/08/2026\t88 - 9 9999-9999\t03/08/2026\tTF\tR$ 1.000,00\tR$ 980,00\tR$ 490,00',
    'CLIENTE GG\t085...-22\tBV GG\tREFINANCIAMENTO\t-\tR$ 10.000,00\t24\tCONTRATO PAGO DIA 05/08/2026\t-\t04/08/2026\tGG\tR$ 0,00\tR$ 0,00\tR$ 0,00',
    'REPASSE SEGURO - CAMPANHA\tR$ 1.583,70\t07/08/2026',
  ].join('\n');
  const parsed = parseGgHistorySpreadsheet(text);
  assert.equal(parsed.records.length, 2);
  assert.deepEqual(parsed.records[0], {
    fingerprint: 'gg-history-2026:12345678901:2026-08-03:2500000', name: 'CLIENTE TF', cpf: '12345678901', bank: 'C6 Bank', product: 'Financiamento', installmentCents: 100000, valueCents: 2500000, term: 48, paidAt: '2026-08-04', phone: '88 - 9 9999-9999', operationDate: '2026-08-03', producer: 'TF', origin: 'TF Assessoria e Finanças', grossCents: 100000, netCents: 98000, repasseCents: 49000, ilaRateBps: 200, tfShareBps: 5000,
  });
  assert.equal(parsed.records[1].cpf, '');
  assert.equal(parsed.records[1].origin, 'GG Veículos');
  assert.deepEqual(parsed.bonus, { valueCents: 158370, date: '2026-08-07', description: 'Bonificação parceiro GG · Seguro campanha' });
});
