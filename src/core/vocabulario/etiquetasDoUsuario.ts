/**
 * AS ETIQUETAS DO USUÁRIO num cartão (o "tag" do LingQ): rótulos livres como `filme`, `trabalho`, `viagem`.
 * Regra pura, a mesma no navegador e no servidor (que não confia no cliente).
 *
 * Normalização de cada etiqueta: sem `#` na frente, minúscula, espaços viram `-`, só letras, números, `-` e `_`
 * (assim a mesma etiqueta vira tag do Anki sem quebrar, que separa tags por espaço), até 32 caracteres. Repetidas
 * somem (a primeira fica). Até 10 por cartão.
 */
export const MAX_ETIQUETAS = 10;
export const MAX_CARACTERES_DA_ETIQUETA = 32;

/** Uma etiqueta normalizada, ou `null` se não sobra nada ou passa de 32 caracteres. */
export function normalizarEtiqueta(bruta: string): string | null {
  const t = bruta
    .normalize('NFC')
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{M}\p{N}_-]/gu, '') // \p{M}: sinais combinantes (vogais do árabe, devanágari)
    .replace(/^-+|-+$/g, '');
  if (!t || t.length > MAX_CARACTERES_DA_ETIQUETA) return null;
  return t;
}

export type ResultadoDasEtiquetas = { ok: true; etiquetas: string[] } | { ok: false; motivo: 'muitas' | 'invalida' };

/**
 * A lista inteira: normaliza, tira repetidas e confere os tetos. Uma etiqueta inválida (vazia ou acima de 32) ou
 * mais de 10 depois de deduplicar recusa tudo (o servidor responde 400), em vez de cortar em silêncio.
 */
export function normalizarEtiquetas(brutas: readonly string[]): ResultadoDasEtiquetas {
  const vistas = new Set<string>();
  for (const b of brutas) {
    const e = normalizarEtiqueta(b);
    if (e === null) return { ok: false, motivo: 'invalida' };
    vistas.add(e);
  }
  if (vistas.size > MAX_ETIQUETAS) return { ok: false, motivo: 'muitas' };
  return { ok: true, etiquetas: [...vistas] };
}
