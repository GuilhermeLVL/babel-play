// MEDE: o erro da régua caseira `contarPalavras` contra o segmentador padrão do ICU.
//
// `src/core/learning/quality.ts:245-251` conta por caractere onde não há espaço:
//     chars / 2, arredondado, mínimo 1
// e declara isso: "uma aproximação declarada, não um tokenizador". A pergunta da auditoria não é
// se é aproximação — o código já diz que é — mas DE QUANTO ela erra, porque esse número decide
// se uma frase entra ou sai da trilha (`scripts/trilha/frases.mjs` filtra por 5-12 palavras).
//
// Comparo contra `Intl.Segmenter(lang, {granularity:'word'})`, que no Node com ICU completo usa
// os dicionários do ICU para japonês, chinês, tailandês e khmer.
import { andar, caminho, lerJSON, tabela, publicar } from './comum.mjs';

// Cópia literal da régua do app (quality.ts:245-251), para medir o que roda, não o que eu acho.
const ESCRITA_SEM_ESPACO = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
function contarPalavras(texto) {
  const t = (texto ?? '').trim();
  if (!t) return 0;
  if (!ESCRITA_SEM_ESPACO.test(t)) return t.split(/\s+/).filter(Boolean).length;
  const chars = [...t.replace(/[\s\p{P}]/gu, '')].length;
  return Math.max(1, Math.round(chars / 2));
}

/** Quantas palavras o ICU vê. `isWordLike` descarta pontuação e espaço. */
function porSegmenter(texto, lang) {
  const seg = new Intl.Segmenter(lang, { granularity: 'word' });
  let n = 0;
  for (const s of seg.segment(texto)) if (s.isWordLike) n++;
  return n;
}

// Amostra determinística: as frases das trilhas em escrita sem espaço, mais controles.
const AMOSTRA = 400;
const alvos = ['ja', 'zh', 'ko', 'ru', 'ar'];
const linhas = [];

for (const lang of alvos) {
  let dados;
  try { dados = lerJSON(caminho('public', 'trilha', `${lang}.json`)); } catch { continue; }
  const itens = Object.values(dados.niveis).flat();
  const idx = itens.some((i) => i.length >= 4) ? 2 : 1;
  const frases = itens.map((i) => i[idx]).filter((f) => typeof f === 'string' && f.trim());
  // Espaçadas na lista, não as primeiras: as primeiras são as mais frequentes e mais curtas.
  const passo = Math.max(1, Math.floor(frases.length / AMOSTRA));
  const amostra = frases.filter((_, i) => i % passo === 0).slice(0, AMOSTRA);

  let somaRegua = 0, somaICU = 0, erroAbs = 0, dentroDaFaixaRegua = 0, dentroDaFaixaICU = 0, discordam = 0;
  for (const f of amostra) {
    const r = contarPalavras(f);
    const i = porSegmenter(f, lang);
    somaRegua += r; somaICU += i; erroAbs += Math.abs(r - i);
    // A faixa que `scripts/trilha/frases.mjs:8` usa para aceitar uma frase.
    const okR = r >= 5 && r <= 12;
    const okI = i >= 5 && i <= 12;
    if (okR) dentroDaFaixaRegua++;
    if (okI) dentroDaFaixaICU++;
    if (okR !== okI) discordam++;
  }

  const n = amostra.length;
  linhas.push({
    lang, n,
    semEspaco: ESCRITA_SEM_ESPACO.test(amostra[0] ?? '') ? 'sim' : 'não',
    mediaRegua: (somaRegua / n).toFixed(2),
    mediaICU: (somaICU / n).toFixed(2),
    erroMedio: (erroAbs / n).toFixed(2),
    vies: ((somaRegua - somaICU) / n).toFixed(2),
    erroRelativo: `${(((somaRegua - somaICU) / somaICU) * 100).toFixed(1)}%`,
    aceitaRegua: dentroDaFaixaRegua,
    aceitaICU: dentroDaFaixaICU,
    discordam,
    discordanciaPct: `${((discordam / n) * 100).toFixed(1)}%`,
  });
}

let texto = tabela(
  ['lang', 'n', 'sem espaço', 'média régua', 'média ICU', 'erro médio', 'viés', 'erro rel.', 'aceita régua', 'aceita ICU', 'decisão diverge'],
  linhas.map((x) => [x.lang, x.n, x.semEspaco, x.mediaRegua, x.mediaICU, x.erroMedio, x.vies, x.erroRelativo, x.aceitaRegua, x.aceitaICU, `${x.discordam} (${x.discordanciaPct})`]),
);

// Idiomas sem espaço que a régua NÃO cobre — o teste de degradação que a Fase 3 vai querer.
texto += '\n\nEscritas sem espaço fora de ESCRITA_SEM_ESPACO (quality.ts:235):';
const foraDaRegua = [
  ['khmer', 'km', 'សូមអរគុណច្រើនសម្រាប់ជំនួយរបស់អ្នក'],
  ['lao', 'lo', 'ຂອບໃຈຫຼາຍສຳລັບການຊ່ວຍເຫຼືອຂອງທ່ານ'],
  ['birmanês', 'my', 'သင့်အကူအညီအတွက်ကျေးဇူးအများကြီးတင်ပါတယ်'],
  ['tibetano', 'bo', 'ཁྱེད་རང་གི་རོགས་རམ་ལ་ཐུགས་རྗེ་ཆེ།'],
];
texto += '\n' + tabela(['idioma', 'bcp47', 'régua', 'ICU', 'erro'],
  foraDaRegua.map(([nome, l, frase]) => {
    const r = contarPalavras(frase);
    const i = porSegmenter(frase, l);
    return [nome, l, r, i, `${r - i > 0 ? '+' : ''}${r - i}`];
  }));

texto += '\n\nTailandês: está em ESCRITA_SEM_ESPACO mas foi retirado da publicação (tasks.md:97).';
const th = 'ขอบคุณมากสำหรับความช่วยเหลือของคุณในวันนี้';
texto += `\n  frase de teste: régua ${contarPalavras(th)} · ICU ${porSegmenter(th, 'th')}`;

export default publicar('10 — segmentação: régua caseira × Intl.Segmenter', texto, { linhas });
