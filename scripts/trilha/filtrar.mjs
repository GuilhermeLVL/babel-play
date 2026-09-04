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

/**
 * A escrita própria de cada idioma, onde ela é decisiva.
 *
 * As listas de frequência vêm de legendas, e legenda de filme chinês tem `hello` e `ok` no meio —
 * medido: 11% das palavras do chinês não estavam em Han, 15% no tailandês. Numa trilha de chinês,
 * `hello` não é vocabulário chinês: é sujeira da fonte, e ocupa a vaga de uma palavra que a pessoa
 * foi ali aprender. Idioma de escrita latina não entra na tabela — ali a mistura é legítima
 * (`show`, `email`), e a régua gramatical já cuida do resto.
 */
const ESCRITA_DO_IDIOMA = {
  ar: /[\p{Script=Arabic}]/u, he: /[\p{Script=Hebrew}]/u, hi: /[\p{Script=Devanagari}]/u,
  ja: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
  zh: /[\p{Script=Han}]/u, ko: /[\p{Script=Hangul}]/u, ru: /[\p{Script=Cyrillic}]/u,
  th: /[\p{Script=Thai}]/u, el: /[\p{Script=Greek}]/u,
};

export function foraDaEscrita(palavra, lang) {
  const escrita = ESCRITA_DO_IDIOMA[(lang || '').toLowerCase().split('-')[0]];
  return !!escrita && !escrita.test(palavra);
}

export const MAX_LETRAS = 14;

/** `null` quando serve; senão o motivo do descarte. */
export function motivoDoDescarte(palavra, lang) {
  const p = (palavra ?? '').trim();
  if (!p) return 'vazia';
  if (/\s/.test(p)) return 'locucao';                 // locução de várias palavras
  if (/\d/.test(p)) return 'digito';
  if (/\./.test(p)) return 'abreviacao';              // `a.m.`
  /* `\p{M}` = marcas combinantes, e sem elas a regra jogava fora vocabulário essencial:
     medido no árabe, 445 palavras de 6.000 — `شكراً` (obrigado), `مرحباً` (olá) —, porque o
     diacrítico não é letra. Vale para árabe, hebraico, devanágari e tailandês, onde a marca faz
     parte da grafia da palavra, não é pontuação. */
  if (!/^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u.test(p)) return 'simbolo'; // hífen/apóstrofo só internos
  const letras = (p.match(/\p{L}/gu) ?? []).length;
  if (letras < minimoDeLetras(p)) return 'curta';
  if (letras > MAX_LETRAS) return 'longa';
  if (foraDoBulkAdd(p)) return 'fora-do-bulk-add';
  if (foraDaEscrita(p, lang)) return 'fora-da-escrita';
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
