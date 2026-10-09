/** Formatação das telas de administração. Datas no fuso e no idioma de quem opera. */
import { dataHora as dataHoraDoIdioma } from '../../../lib/i18n';

export const dataHora = (ms: number | null | undefined): string =>
  typeof ms === 'number' && Number.isFinite(ms)
    ? dataHoraDoIdioma(ms, { dateStyle: 'short', timeStyle: 'short' })
    : '—';

export const dolar = (n: number | null | undefined): string =>
  typeof n === 'number' && Number.isFinite(n) ? `US$ ${n.toFixed(2)}` : '—';

/** Texto curto de uma célula que pode vir com qualquer coisa do diário: nunca devolve objeto. */
export function texto(v: unknown, max = 160): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
