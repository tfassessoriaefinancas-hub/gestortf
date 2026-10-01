export const CRM_RESOURCES = ['crm', 'deals', 'partners', 'invoices', 'team', 'catalog', 'postSales', 'activities'] as const;
export type CrmResource = typeof CRM_RESOURCES[number];
export type CrmRevisions = Record<CrmResource, string> & { scope: string };
export const revisionKey = (resource: CrmResource) => `crm_revision:${resource}`;

/** Keep the full financial dataset once loaded; fetch auxiliary screens on demand. */
export function resourcesForView(view: string, role: string, permissions: readonly string[]): CrmResource[] {
  const allowed = (permission: string) => role === 'admin' || permissions.includes(permission);
  const resources = new Set<CrmResource>();
  if (['clientes', 'producao', 'relatorios', 'comissoes', 'financeiro', 'parceiros'].some(allowed)) resources.add('crm');
  if (['inicio', 'atendimento'].includes(view) && allowed('atendimento')) resources.add('deals');
  if (['atendimento', 'parceiros', 'usuarios'].includes(view) && allowed('parceiros')) resources.add('partners');
  if (['atendimento', 'usuarios'].includes(view) && role === 'admin') resources.add('team');
  if (view === 'atendimento' && allowed('atendimento')) resources.add('catalog');
  if (view === 'notas' && allowed('notas')) resources.add('invoices');
  if (view === 'posvenda' && allowed('posvenda')) resources.add('postSales');
  if (['inicio', 'compromissos'].includes(view) && allowed('inicio')) resources.add('activities');
  return [...resources];
}
