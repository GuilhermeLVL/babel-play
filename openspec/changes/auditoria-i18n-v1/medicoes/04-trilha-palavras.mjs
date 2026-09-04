// MEDE: quantas palavras a trilha REALMENTE tem, depois de descontar o que não deveria contar.
//
// "85.668 palavras em 16 idiomas" é a soma bruta das entradas. Uma auditoria precisa saber
// quanto disso sobrevive a quatro filtros que o pipeline pode não ter aplicado:
//   1. duplicata literal dentro do mesmo idioma (a mesma string duas vezes)
//   2. duplicata por caixa ("Tokio" e "tokio" contam duas vezes?)
//   3. duplicata por forma Unicode (NFC vs NFD — "é" composto e "é" decomposto são strings
//      diferentes para o JavaScript e a mesma palavra para o leitor)
//   4. entrada vazia ou só pontuação
//
// E mede uma quinta coisa que decide se o dado é usável: quanto está FORA da escrita esperada
// do idioma (latim vazando no árabe, por exemplo).
//
// A caixa é dobrada com toLocaleLowerCase(idioma) de propósito: em turco, 'I'.toLowerCase()
// devolve 'i' minúsculo com pingo, que é OUTRA letra. Uso a regra do idioma, não a invariante.
import { andar, caminho, lerJSON, relativo, tamanho, tabela, pct, publicar } from './comum.mjs';

const DIR = caminho('public', 'trilha');

// A escrita que cada idioma deveria usar. Serve para medir vazamento, não para reprovar:
// nome próprio estrangeiro e sigla aparecem legitimamente em qualquer trilha.
const ESCRITA = {
  ar: /\p{Script=Arabic}/u, de: /\p{Script=Latin}/u, en: /\p{Script=Latin}/u,
  es: /\p{Script=Latin}/u, fr: /\p{Script=Latin}/u, he: /\p{Script=Hebrew}/u,
  hi: /\p{Script=Devanagari}/u, it: /\p{Script=Latin}/u,
  ja: /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u,
  ko: /\p{Script=Hangul}/u, nl: /\p{Script=Latin}/u, pl: /\p{Script=Latin}/u,
  ru: /\p{Script=Cyrillic}/u, sv: /\p{Script=Latin}/u, tr: /\p{Script=Latin}/u,
  zh: /\p{Script=Han}/u,
};

const TEM_LETRA = /\p{L}/u;

const resultados = [];

for (const arq of andar(DIR, (p) => p.endsWith('.json'))) {
  const lang = arq.split(/[/\\]/).pop().replace('.json', '');
  const dados = lerJSON(arq);

  // v1 (só o inglês): [palavra, glosa, frase, fraseTraduzida]. v2: [palavra, frase].
  //
  // Duas armadilhas, ambas pagas medindo errado antes:
  // 1. A versão não distingue: `public/trilha/en.json` grava versao como a STRING
  //    "1.5+1.0+trad.2+frases.1", não como o número 1.
  // 2. O tamanho da tupla item a item também não: o inglês MISTURA 2.552 tuplas de 4 campos
  //    com 232 de 2 campos ([palavra, glosa], sem frase). Ler item[1] nessas 232 conta a
  //    glosa como frase e o inglês vira 100% com frase, quando o correto é 91,7%.
  // Quem decide é o formato do ARQUIVO: se alguma tupla tem 4 campos, a frase mora em [2].
  const todosItens = Object.values(dados.niveis).flat();
  const ehV1 = todosItens.some((i) => Array.isArray(i) && i.length >= 4);
  const idxFrase = ehV1 ? 2 : 1;

  const palavras = [];
  let comFrase = 0;
  for (const nivel of Object.keys(dados.niveis)) {
    for (const item of dados.niveis[nivel]) {
      const palavra = Array.isArray(item) ? item[0] : item;
      palavras.push(palavra);
      const frase = Array.isArray(item) ? item[idxFrase] : null;
      if (typeof frase === 'string' && frase.trim() !== '') comFrase += 1;
    }
  }

  const bruto = palavras.length;
  const vazias = palavras.filter((p) => typeof p !== 'string' || !TEM_LETRA.test(p)).length;
  const validas = palavras.filter((p) => typeof p === 'string' && TEM_LETRA.test(p));

  const unicasLiteral = new Set(validas).size;
  const unicasNFC = new Set(validas.map((p) => p.normalize('NFC'))).size;
  const unicasCaixa = new Set(validas.map((p) => p.normalize('NFC').toLocaleLowerCase(lang))).size;

  // Entradas gravadas em forma decomposta: colidem em runtime com a mesma palavra em NFC.
  const emNFD = validas.filter((p) => p.normalize('NFC') !== p).length;

  // Pares distintos como string que viram a mesma palavra depois de NFC — duplicata invisível.
  const mapaNFC = new Map();
  for (const p of validas) {
    const c = p.normalize('NFC');
    if (!mapaNFC.has(c)) mapaNFC.set(c, new Set());
    mapaNFC.get(c).add(p);
  }
  const colisoesNFC = [...mapaNFC.entries()].filter(([, s]) => s.size > 1);

  // Pares que só diferem na caixa: "Tokio"/"tokio".
  const mapaCaixa = new Map();
  for (const p of validas) {
    const c = p.normalize('NFC').toLocaleLowerCase(lang);
    if (!mapaCaixa.has(c)) mapaCaixa.set(c, new Set());
    mapaCaixa.get(c).add(p.normalize('NFC'));
  }
  const colisoesCaixa = [...mapaCaixa.entries()].filter(([, s]) => s.size > 1);

  const re = ESCRITA[lang];
  const foraDaEscrita = re ? validas.filter((p) => !re.test(p)) : [];
  // Em que faixa o vazamento se concentra. Importa mais que o total: erro na A1 atinge
  // o iniciante, que é justamente quem não tem como perceber que a palavra não é do idioma.
  const foraPorNivel = {};
  for (const nivel of Object.keys(dados.niveis)) {
    const itens = dados.niveis[nivel];
    const fora = re ? itens.filter((i) => !re.test(Array.isArray(i) ? i[0] : i)).length : 0;
    if (fora) foraPorNivel[nivel] = `${fora}/${itens.length}`;
  }

  resultados.push({
    lang, arquivo: relativo(arq), bytes: tamanho(arq),
    versao: ehV1 ? 'v1' : 'v2', versaoDeclarada: dados.versao, escala: dados.escala ?? '—',
    bruto, vazias, unicasLiteral, unicasNFC, unicasCaixa,
    duplicataLiteral: validas.length - unicasLiteral,
    emNFD, colisoesNFC: colisoesNFC.length,
    colisoesCaixa: colisoesCaixa.length,
    exemplosCaixa: colisoesCaixa.slice(0, 3).map(([, s]) => [...s]),
    comFrase,
    foraDaEscrita: foraDaEscrita.length,
    foraPorNivel,
    exemplosForaDaEscrita: foraDaEscrita.slice(0, 6),
  });
}

const soma = (c) => resultados.reduce((a, r) => a + r[c], 0);

let texto = tabela(
  ['lang', 'v', 'escala', 'bruto', 'únicas', 'dup.lit', 'dup.caixa', 'em NFD', 'colisão NFC', 'c/ frase', 'fora da escrita'],
  resultados.map((r) => [
    r.lang, r.versao, r.escala, r.bruto, r.unicasLiteral,
    r.duplicataLiteral, r.colisoesCaixa, r.emNFD, r.colisoesNFC,
    `${r.comFrase} (${pct(r.comFrase, r.bruto)})`,
    `${r.foraDaEscrita} (${pct(r.foraDaEscrita, r.bruto)})`,
  ]),
);

texto += `\n\nTOTAL bruto: ${soma('bruto')}`;
texto += `\nTOTAL de únicas por idioma (soma): ${soma('unicasLiteral')}`;
texto += `\nTOTAL de únicas ignorando caixa (soma): ${soma('unicasCaixa')}`;
texto += `\nEntradas vazias/sem letra: ${soma('vazias')}`;
texto += `\nEntradas gravadas em NFD: ${soma('emNFD')}`;
texto += `\nColisões NFC (mesma palavra em duas formas): ${soma('colisoesNFC')}`;

texto += '\n\nExemplos de duplicata por caixa:';
let houve = false;
for (const r of resultados) {
  if (!r.exemplosCaixa.length) continue;
  houve = true;
  texto += `\n  [${r.lang}] ${r.exemplosCaixa.map((e) => e.join(' / ')).join(' · ')}`;
}
if (!houve) texto += ' nenhuma em nenhum idioma.';

texto += '\n\nO que está fora da escrita esperada, e em que faixa:';
let vazou = false;
for (const r of resultados) {
  if (!r.exemplosForaDaEscrita.length) continue;
  vazou = true;
  texto += `\n  [${r.lang}] ${r.foraDaEscrita} entradas · por faixa: ${Object.entries(r.foraPorNivel).map(([n, v]) => `${n} ${v}`).join('  ')}`;
  texto += `\n         amostra: ${r.exemplosForaDaEscrita.map((e) => JSON.stringify(e)).join(' ')}`;
}
if (!vazou) texto += ' nenhuma.';

export default publicar('04 — palavras da trilha, recontadas', texto, {
  totalBruto: soma('bruto'), totalUnicas: soma('unicasLiteral'), porIdioma: resultados,
});
