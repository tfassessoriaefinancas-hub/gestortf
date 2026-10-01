export async function readApiPayload<T extends object>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  if (!text.trim()) return { error: response.ok ? 'O servidor não confirmou o salvamento. Tente novamente.' : 'O servidor não respondeu ao salvar. Tente novamente em alguns instantes.' } as T & { error?: string };
  try { return JSON.parse(text) as T & { error?: string }; }
  catch { return { error: 'O servidor não conseguiu concluir o salvamento. Tente novamente.' } as T & { error?: string }; }
}
