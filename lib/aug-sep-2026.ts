import { readPrivateData } from './private-data';

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

export function getAugustSeptemberRecords(): SpreadsheetImportRecord[] {
  return readPrivateData<SpreadsheetImportRecord[]>('imports/aug-sep-2026.json', []);
}
