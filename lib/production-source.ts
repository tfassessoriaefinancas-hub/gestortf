export const productionSources = ['Balcão TF','Balcão TF / Código TF','Balcão TF / Código GG','Cliente GG / Código GG','Balcão TF / Código Aracati Veículos'];
export const hasGgCode = (value: string) => /codigo\s+gg\s*$/.test(value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
