// One accessible accent palette for the home menu and module workspaces.
export const moduleAccentColors: Record<string, string> = {
  numeros: '#806133', atendimento: '#31618f', clientes: '#665092',
  producao: '#236e59', compromissos: '#895437', bancos: '#3d617e',
  calculadora: '#645187', financeiro: '#236e59', comissoes: '#236e59',
  notas: '#934960', parceiros: '#2e6c73', relatorios: '#505e96',
  servicos: '#856431', posvenda: '#356d5d', usuarios: '#79566f',
};

// Each workspace selects a scene that reflects its purpose.
export const moduleBackgrounds: Record<string,string> = {
  numeros:'office', atendimento:'handshake', clientes:'clients', producao:'planning',
  financeiro:'finance', comissoes:'analytics', notas:'documents', parceiros:'handshake',
  compromissos:'agenda', bancos:'architecture', calculadora:'finance', relatorios:'analytics',
  servicos:'architecture', posvenda:'clients', usuarios:'team',
};
