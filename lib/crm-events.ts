export const CRM_CHANGED = 'tf:crm-changed';
export const CRM_STORAGE_KEY = 'tf_crm_revision';

export function notifyCrmChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CRM_CHANGED));
  try { localStorage.setItem(CRM_STORAGE_KEY, `${Date.now()}:${Math.random()}`); } catch { /* The current tab still refreshes if browser storage is disabled. */ }
}
