/**
 * As regras de conversão do `src/data/trilha/FONTES.md` (seção "O que a conversão fez"),
 * aplicadas a uma lista de frequência.
 *
 * A régua de qualidade NÃO é reimplementada aqui: `foraDoBulkAdd`, `ehGramatical` e
 * `chaveComparavel` vêm de `src/core/learning/quality.ts`, que é a mesma régua do jogo. Por isso
 * este módulo só roda sob tsx/vitest (`npx tsx scripts/trilha/gerar.mjs <lang>`), não sob `node`.
 */
import { chaveComparavel, ehGramatical, foraDoBulkAdd } from '../../src/core/learning/quality.ts';

/** Uma palavra em Han/kana/hangul já é palavra inteira; alfabeto precisa de três letras. */
const ESCRITA_DE_UM_CARACTERE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function minimoDeLetras(palavra) {
  return ESCRITA_DE_UM_CARACTERE.test(palavra) ? 1 : 3;
}

export const MAX_LETRAS = 14;

/** `null` quando serve; senão o motivo do descarte. */
export function motivoDoDescarte(palavra, lang) {
  const p = (palavra ?? '').trim();
  if (!p) return 'vazia';
  if (/\s/.test(p)) return 'locucao';                 // locução de várias palavras
  if (/\d/.test(p)) return 'digito';
  if (/\./.test(p)) return 'abreviacao';              // `a.m.`
  if (!/^[\p{L}]+(?:[-'’][\p{L}]+)*$/u.test(p)) return 'simbolo'; // hífen/apóstrofo só internos
  const letras = (p.match(/\p{L}/gu) ?? []).length;
  if (letras < minimoDeLetras(p)) return 'curta';
  if (letras > MAX_LETRAS) return 'longa';
  if (foraDoBulkAdd(p)) return 'fora-do-bulk-add';
  if (ehGramatical(p, lang)) return 'gramatical';
  return null;
}

/**
 * `entradas`: `[{ palavra, contagem }]` na ordem da fonte (mais frequente primeiro).
 * Devolve `{ palavras, descartes }` — `palavras` na mesma ordem, variantes colapsadas pela
 * `chaveComparavel` (caixa e acento), primeira ocorrência vencendo.
 */
export function filtrar(entradas, lang) {
  const palavras = [];
  const descartes = {};
  const vistas = new Set();
  for (const e of entradas ?? []) {
    const palavra = (e?.palavra ?? '').trim();
    const motivo = motivoDoDescarte(palavra, lang);
    if (motivo) { descartes[motivo] = (descartes[motivo] ?? 0) + 1; continue; }
    const chave = chaveComparavel(palavra);
    if (vistas.has(chave)) { descartes.variante = (descartes.variante ?? 0) + 1; continue; }
    vistas.add(chave);
    palavras.push({ palavra, contagem: Number(e.contagem) || 0 });
  }
  return { palavras, descartes };
}
