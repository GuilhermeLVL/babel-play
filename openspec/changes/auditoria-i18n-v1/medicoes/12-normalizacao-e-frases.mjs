// MEDE: (a) se a normalização Unicode é consistente entre a INGESTÃO e a COMPARAÇÃO EM RUNTIME,
//       e (b) se as frases do Tatoeba estão no idioma que dizem estar.
//
// (a) É a falha invisível clássica: o pipeline grava "é" composto (NFC) e o app procura "é"
//     decomposto (NFD), ou vice-versa. As duas strings são iguais na tela e diferentes para o
//     `===`. O resultado é "palavra não encontrada" sem mensagem de erro.
//     O repo tem DUAS estratégias de chave convivendo:
//       · scripts/trilha/verificar.mjs:14 — NFD + remove diacrítico + minúscula
//       · src/core/learning/quality.ts    — `chaveComparavel`, a régua do app
//     Comparo as duas sobre o vocabulário real.
//
// (b) `D:131` admite nome próprio na lista de frequência. A pergunta que falta: a FRASE de
//     exemplo está na escrita do idioma dela? Frase marcada errado no Tatoeba vira exemplo
//     em outra língua, apresentado como se fosse do idioma estudado.
import { andar, caminho, lerJSON, tabela, pct, publicar } from './comum.mjs';

/* ── (a) normalização ─────────────────────────────────────────────────────────────────────── */

// A chave do verificar.mjs, literal (linha 14-16).
const chaveDoVerificador = (p) => p.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const ESCRITA = {
  ar: /\p{Script=Arabic}/u, de: /\p{Script=Latin}/u, en: /\p{Script=Latin}/u,
  es: /\p{Script=Latin}/u, fr: /\p{Script=Latin}/u, he: /\p{Script=Hebrew}/u,
  hi: /\p{Script=Devanagari}/u, it: /\p{Script=Latin}/u,
  ja: /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u,
  ko: /\p{Script=Hangul}/u, nl: /\p{Script=Latin}/u, pl: /\p{Script=Latin}/u,
  ru: /\p{Script=Cyrillic}/u, sv: /\p{Script=Latin}/u, tr: /\p{Script=Latin}/u,
  zh: /\p{Script=Han}/u,
};

const normalizacao = [];
const frases = [];

for (const arq of andar(caminho('public', 'trilha'), (p) => p.endsWith('.json'))) {
  const lang = arq.split(/[/\\]/).pop().replace('.json', '');
  const d = lerJSON(arq);
  const itens = Object.values(d.niveis).flat();
  const idxFrase = itens.some((i) => i.length >= 4) ? 2 : 1;

  const palavras = itens.map((i) => String(i[0]));

  // Quantas palavras MUDAM ao passar pela chave do verificador — ou seja, quantas dependem
  // de que os dois lados apliquem exatamente a mesma transformação.
  const mudamNaChave = palavras.filter((p) => chaveDoVerificador(p) !== p).length;
  // Quantas COLIDEM depois da chave: duas palavras distintas viram a mesma. Se o app usasse
  // essa chave para procurar, ele não saberia qual das duas devolver.
  const mapa = new Map();
  for (const p of palavras) {
    const k = chaveDoVerificador(p);
    if (!mapa.has(k)) mapa.set(k, new Set());
    mapa.get(k).add(p);
  }
  const colisoes = [...mapa.entries()].filter(([, s]) => s.size > 1);

  // O que interessa para o runtime: a glosa é procurada pela palavra CRUA (verificar.mjs:41
  // faz `glosas?.[p]`). Então palavra e chave da glosa têm de bater byte a byte.
  let glosasQueNaoBatem = 0, totalGlosas = 0;
  try {
    const g = lerJSON(caminho('public', 'glosas', `${lang}-pt.json`)).glosas ?? {};
    const doArquivo = new Set(palavras);
    totalGlosas = Object.keys(g).length;
    glosasQueNaoBatem = Object.keys(g).filter((k) => !doArquivo.has(k)).length;
  } catch { /* inglês não tem arquivo de glosa: é v1, embutida */ }

  normalizacao.push({
    lang, palavras: palavras.length, mudamNaChave,
    colisoes: colisoes.length,
    exemplos: colisoes.slice(0, 3).map(([, s]) => [...s].join(' / ')),
    totalGlosas, glosasQueNaoBatem,
  });

  // (b) frases fora da escrita do idioma
  const re = ESCRITA[lang];
  const comFrase = itens.map((i) => i[idxFrase]).filter((f) => typeof f === 'string' && f.trim());
  const foraDaEscrita = re ? comFrase.filter((f) => !re.test(f)) : [];
  frases.push({
    lang, comFrase: comFrase.length,
    foraDaEscrita: foraDaEscrita.length,
    exemplos: foraDaEscrita.slice(0, 3),
  });
}

let texto = '(a) NORMALIZAÇÃO — a chave do verificar.mjs sobre o vocabulário real:\n';
texto += tabela(['lang', 'palavras', 'mudam na chave', 'colisões', 'glosas', 'glosas sem palavra correspondente'],
  normalizacao.map((x) => [x.lang, x.palavras, `${x.mudamNaChave} (${pct(x.mudamNaChave, x.palavras)})`, x.colisoes, x.totalGlosas, x.glosasQueNaoBatem]));

texto += '\n\nColisões (duas palavras distintas viram a mesma chave):';
let houve = false;
for (const x of normalizacao) {
  if (!x.exemplos.length) continue;
  houve = true;
  texto += `\n  [${x.lang}] ${x.colisoes} · exemplos: ${x.exemplos.join('  |  ')}`;
}
if (!houve) texto += ' nenhuma em nenhum idioma.';

texto += '\n\n(b) FRASES DE EXEMPLO FORA DA ESCRITA DO IDIOMA:\n';
texto += tabela(['lang', 'frases', 'fora da escrita', 'taxa'],
  frases.map((x) => [x.lang, x.comFrase, x.foraDaEscrita, pct(x.foraDaEscrita, x.comFrase)]));
for (const x of frases) {
  if (!x.exemplos.length) continue;
  texto += `\n  [${x.lang}] ${x.exemplos.map((e) => JSON.stringify(e.slice(0, 70))).join('  ')}`;
}

export default publicar('12 — normalização e idioma das frases', texto, { normalizacao, frases });
