/**
 * O ID do modelo que a pessoa trouxe: `imp-` mais 12 caracteres de `0-9a-f`, no formato que a receita
 * (`base.id`) e o armazém (`modelos`) aceitam. O sorteio vem de fora, para o teste ser determinístico.
 */
export function novoIdDoModelo(sorteio: () => number = Math.random): string {
  let s = 'imp-';
  for (let i = 0; i < 12; i++) {
    const x = sorteio();
    s += Math.floor((Number.isFinite(x) ? Math.min(0.999999, Math.max(0, x)) : 0) * 16).toString(16);
  }
  return s;
}
