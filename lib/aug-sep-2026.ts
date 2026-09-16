import { env } from './runtime';

export type SpreadsheetImportRecord = {
  fingerprint: string;
  operationDate: string;
  paidAt: string;
  name: string;
  document: string;
  birthDate?: string;
  bank?: string;
  agreement?: string;
  contractType?: string;
  operationType?: string;
  fipeValue?: number;
  installment?: number;
  value?: number;
  commissionRate?: number;
  term?: number;
  adhesionFee?: number;
  dueDay?: string;
  status?: string;
  promoter?: string;
  productionIndicator?: string;
  phone?: string;
  producer?: string;
  origin?: string;
  partner?: string;
};

export async function getAugustSeptemberRecords(): Promise<SpreadsheetImportRecord[]> {
  const rows = await env.DB.prepare('SELECT payload FROM source_records WHERE source=? ORDER BY source_id').bind('legacy-import:aug-sep-2026').all<{payload: SpreadsheetImportRecord}>();
  return rows.results.map((row) => row.payload);
}
