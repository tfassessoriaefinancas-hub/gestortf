type CardContext = {
  stage?: string;
  product?: string;
  operationType?: string;
  guaranteeType?: string;
  agreement?: string;
};

type CardImage = 'imovel' | 'veiculo' | 'aposentados' | 'assessoria' | 'fgts' | 'clt' | 'consignado' | 'consorcio' | 'seguros';
const normalize = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Decorative only: finalized cards retain their existing appearance. */
export function kanbanImagery(deal: CardContext): CardImage | undefined {
  if (deal.stage === 'finalizado') return undefined;
  const product = normalize(deal.product);
  if (!product.trim()) return undefined;
  // Product wins over ancillary values left behind when an existing card is edited.
  if (/fgts|saque.aniversario/.test(product)) return 'fgts';
  if (/assessoria|consultoria|financas pessoais|educacao financeira/.test(product)) return 'assessoria';
  if (/clt|trabalhador|consignado privado/.test(product)) return 'clt';
  if (/inss|aposentad|pensionista/.test(product)) return 'aposentados';
  if (/consignad|cartao beneficio/.test(product)) {
    return /inss|aposentad|pensionista/.test(normalize([deal.agreement, deal.operationType].filter(Boolean).join(' '))) ? 'aposentados' : 'consignado';
  }
  const context = normalize([deal.product, deal.operationType, /garantia/.test(product) && !/seguro/.test(product) ? deal.guaranteeType : undefined].filter(Boolean).join(' '));
  if (/imove|imobi|home equity|residencial/.test(context)) return 'imovel';
  if (/veicul|automovel|auto\b|carro|motocicl/.test(context)) return 'veiculo';
  if (/protecao|rastreamento|evogard/.test(product)) return 'veiculo';
  if (/seguro/.test(product)) return 'seguros';
  if (/consorcio/.test(product)) return 'consorcio';
  if (product === 'financiamento' || product === 'credito com garantia') return 'veiculo';
  return 'assessoria';
}
