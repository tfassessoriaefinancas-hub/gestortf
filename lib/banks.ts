export type BankCatalogEntry = {
  code: string;
  name: string;
  color: string;
  phone?: string;
  service?: string;
  officialUrl: string;
};

// Codes are the official Brazilian COMPE bank codes. Contact details are kept
// only when the institution publishes them on its own support channels.
export const bankCatalog: BankCatalogEntry[] = [
  { code: '001', name: 'Banco do Brasil', color: '#2457a6', officialUrl: 'https://www.bb.com.br/site/atendimento/' },
  { code: '003', name: 'Banco da Amazônia', color: '#187a46', officialUrl: 'https://www.bancoamazonia.com.br/atendimento' },
  { code: '004', name: 'Banco do Nordeste', color: '#16764a', officialUrl: 'https://www.bnb.gov.br/atendimento' },
  { code: '033', name: 'Santander', color: '#e22b2b', officialUrl: 'https://www.santander.com.br/atendimento' },
  { code: '041', name: 'Banrisul', color: '#2b65a7', officialUrl: 'https://www.banrisul.com.br/atendimento' },
  { code: '070', name: 'BRB', color: '#1b6e9d', officialUrl: 'https://novo.brb.com.br/atendimento/' },
  { code: '077', name: 'Banco Inter', color: '#f26c21', officialUrl: 'https://www.bancointer.com.br/atendimento/' },
  { code: '104', name: 'Caixa Econômica Federal', color: '#1664a5', officialUrl: 'https://www.caixa.gov.br/atendimento' },
  { code: '237', name: 'Bradesco', color: '#b41d3a', phone: '4002 0022 · 0800 570 0022', service: 'Fone Fácil', officialUrl: 'https://banco.bradesco/html/prime/atendimento/fale-conosco/telefones-uteis.shtm' },
  { code: '260', name: 'Nubank', color: '#820ad1', officialUrl: 'https://nubank.com.br/ajuda/' },
  { code: '290', name: 'PagBank', color: '#00a868', officialUrl: 'https://pagseguro.uol.com.br/atendimento' },
  { code: '318', name: 'Banco BMG', color: '#df1683', officialUrl: 'https://www.bancobmg.com.br/atendimento/' },
  { code: '336', name: 'C6 Bank', color: '#111111', phone: '3003 6116 · 0800 660 6116', service: 'Central de Atendimento', officialUrl: 'https://www.c6bank.com.br/central-de-atendimento/' },
  { code: '341', name: 'Itaú', color: '#ec7000', phone: '4004 4828 · 0800 970 4828', service: 'Central de Atendimento', officialUrl: 'https://www.itau.com.br/atendimento-itau/para-voce/telefones' },
  { code: '389', name: 'Banco Mercantil', color: '#123f8c', officialUrl: 'https://www.mercantil.com.br/atendimento/' },
  { code: '422', name: 'Banco Safra', color: '#a50000', officialUrl: 'https://www.safra.com.br/atendimento.htm' },
  { code: '623', name: 'Banco PAN', color: '#00a6df', officialUrl: 'https://www.bancopan.com.br/atendimento' },
  { code: '655', name: 'Banco BV', color: '#1677d2', phone: '3003 1616 · 0800 701 8600', service: 'Atendimento BV', officialUrl: 'https://www.bv.com.br/atendimento/telefone-bv' },
  { code: '707', name: 'Banco Daycoval', color: '#1e5ca8', officialUrl: 'https://www.daycoval.com.br/atendimento' },
  { code: '748', name: 'Sicredi', color: '#168344', officialUrl: 'https://www.sicredi.com.br/site/atendimento/' },
  { code: '756', name: 'Sicoob', color: '#008c45', officialUrl: 'https://www.sicoob.com.br/web/sicoob/atendimento' },
].sort((a, b) => Number(a.code) - Number(b.code));

export const bankNames = bankCatalog.map((bank) => bank.name);

export function bankInfo(value?: string | null) {
  const name = String(value || '').trim().toLocaleLowerCase('pt-BR');
  return bankCatalog.find((bank) => bank.name.toLocaleLowerCase('pt-BR') === name)
    || bankCatalog.find((bank) => name.includes(bank.name.toLocaleLowerCase('pt-BR')) || bank.name.toLocaleLowerCase('pt-BR').includes(name));
}

export function bankLabel(value?: string | null) {
  const bank = bankInfo(value);
  return bank ? `${bank.code} — ${bank.name}` : String(value || 'Não informado');
}
