type CardContext = {
  stage?: string;
  product?: string;
  operationType?: string;
  guaranteeType?: string;
  agreement?: string;
};

type CardImage = 'imovel' | 'veiculo' | 'protecao' | 'aposentados' | 'assessoria' | 'fgts' | 'clt' | 'consignado' | 'consorcio' | 'seguros';
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
  if (/protecao|rastreamento|evogard/.test(product)) return 'protecao';
  if (/seguro/.test(product)) return 'seguros';
  if (/consorcio/.test(product)) return 'consorcio';
  const context = normalize([deal.product, deal.operationType, /garantia/.test(product) && !/seguro/.test(product) ? deal.guaranteeType : undefined].filter(Boolean).join(' '));
  if (/imove|imobi|home equity|residencial/.test(context)) return 'imovel';
  if (/veicul|automovel|auto\b|carro|motocicl/.test(context)) return 'veiculo';
  if (product === 'financiamento' || product === 'credito com garantia') return 'veiculo';
  return 'assessoria';
}

const photoPools: Record<CardImage, readonly string[]> = {
  veiculo: ['veiculo', 'veiculo-2', 'veiculo-3'],
  protecao: ['protecao-1', 'protecao-2', 'protecao-3'],
  imovel: ['imovel', 'imovel-2', 'imovel-3'],
  aposentados: ['aposentados', 'aposentados-2', 'aposentados-3'],
  assessoria: ['assessoria', 'assessoria-2', 'assessoria-3'],
  fgts: ['fgts', 'assessoria-2', 'assessoria-3'],
  clt: ['clt', 'assessoria-3', 'assessoria-2'],
  consignado: ['consignado', 'assessoria-2', 'assessoria-3'],
  consorcio: ['consorcio', 'imovel-2', 'veiculo-2'],
  seguros: ['seguros', 'protecao-2', 'protecao-3'],
};

/** Rotate real photos per service, independent of column and drag order.
 * Finalized deals reserve their slot so completing a deal does not shuffle others.
 */
export function kanbanPhotoAssignments(deals: readonly (CardContext & { id: number })[]): Map<number, string> {
  const counters = new Map<CardImage, number>();
  const photos = new Map<number, string>();
  for (const deal of [...deals].sort((a, b) => a.id - b.id)) {
    const category = kanbanImagery({ ...deal, stage: undefined });
    if (!category) continue;
    const pool = photoPools[category];
    const index = counters.get(category) ?? 0;
    counters.set(category, index + 1);
    if (deal.stage !== 'finalizado') photos.set(deal.id, `/kanban-images/${pool[index % pool.length]}.webp`);
  }
  return photos;
}
