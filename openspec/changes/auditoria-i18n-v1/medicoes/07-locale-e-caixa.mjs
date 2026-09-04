// MEDE: três censos que decidem se o app se comporta fora do pt-BR.
//
// 1. LOCALE CRAVADO — `toLocaleString('pt-BR')` e amigos. O relatório afirma que os 44 pontos
//    foram migrados e que restam zero. Aqui recontro, e separo o que a regra ast-grep
//    `locale-cravado` cobre do que ela NÃO cobre (Intl.NumberFormat e Intl.DateTimeFormat
//    construídos com locale literal não casam com o padrão dela).
//
// 2. CAIXA SEM LOCALE — `toLowerCase()`/`toUpperCase()` sem argumento. Em turco e azeri o
//    'I' maiúsculo vira 'ı' (sem pingo) e o 'i' minúsculo vira 'İ' (com pingo). Comparar
//    chave, montar slug ou buscar com a regra invariante quebra em silêncio nesses idiomas.
//    Só conto: dizer se cada caso é bug depende do que a string é, e isso é a Fase 3.
//
// 3. CLASSES DIRECIONAIS — lógicas (ms-/me-/ps-/pe-/text-start/border-s) contra físicas
//    (left-/right-/ml-/mr-/pl-/pr-/text-left/text-right). Classe física não espelha em RTL.
import { andar, caminho, ehFonte, lerTexto, relativo, tabela, publicar } from './comum.mjs';

const SRC = caminho('src');
const arquivos = [
  ...andar(SRC, ehFonte),
  ...andar(caminho('server'), ehFonte),
].filter(Boolean);

const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// --- 1. locale cravado -------------------------------------------------------------------
const TO_LOCALE_LITERAL = /\.toLocale(?:String|DateString|TimeString)\(\s*['"][a-zA-Z-]+['"]/g;
const TO_LOCALE_QUALQUER = /\.toLocale(?:String|DateString|TimeString)\(/g;
const INTL_LITERAL = /new\s+Intl\.(?:NumberFormat|DateTimeFormat|RelativeTimeFormat|ListFormat|Collator|PluralRules|Segmenter|DisplayNames)\(\s*['"][a-zA-Z-]+['"]/g;

// --- 2. caixa sem locale -----------------------------------------------------------------
const CAIXA_SEM_LOCALE = /\.to(?:Lower|Upper)Case\(\s*\)/g;
const CAIXA_COM_LOCALE = /\.toLocale(?:Lower|Upper)Case\(/g;

// --- 3. classes direcionais --------------------------------------------------------------
const LOGICAS = /\b(?:ms|me|ps|pe|start|end)-[\w./[\]-]+|\btext-(?:start|end)\b|\b(?:border|rounded)-(?:s|e)(?:[ext]*)?-[\w./[\]-]+|\b(?:border|rounded)-(?:s|e)\b/g;
const FISICAS = /\b(?:ml|mr|pl|pr|left|right)-[\w./[\]-]+|\btext-(?:left|right)\b|\b(?:border|rounded)-(?:l|r)(?:[ext]*)?-[\w./[\]-]+/g;

const conta = (s, re) => (s.match(re) ?? []).length;

const localeCravado = [];
const caixaSemLocale = [];
const direcionais = [];

for (const arq of arquivos) {
  const limpo = semComentarios(lerTexto(arq));
  const rel = relativo(arq);

  const tl = [...limpo.matchAll(TO_LOCALE_LITERAL)].map((m) => m[0]);
  const il = [...limpo.matchAll(INTL_LITERAL)].map((m) => m[0]);
  if (tl.length || il.length) localeCravado.push({ arquivo: rel, toLocale: tl, intl: il });

  const cs = conta(limpo, CAIXA_SEM_LOCALE);
  if (cs) caixaSemLocale.push({ arquivo: rel, semLocale: cs, comLocale: conta(limpo, CAIXA_COM_LOCALE) });

  const lg = conta(limpo, LOGICAS);
  const fs = conta(limpo, FISICAS);
  if (lg || fs) direcionais.push({ arquivo: rel, logicas: lg, fisicas: fs });
}

// index.css e index.html também carregam classe, e ficam fora do varrimento de .ts/.tsx.
for (const extra of ['index.css', 'index.html', 'src/index.css']) {
  try {
    const txt = lerTexto(caminho(extra));
    const lg = conta(txt, LOGICAS); const fs = conta(txt, FISICAS);
    if (lg || fs) direcionais.push({ arquivo: extra, logicas: lg, fisicas: fs });
  } catch { /* arquivo não existe nesta árvore */ }
}

const totalToLocale = localeCravado.reduce((a, x) => a + x.toLocale.length, 0);
const totalIntl = localeCravado.reduce((a, x) => a + x.intl.length, 0);
const totalCaixa = caixaSemLocale.reduce((a, x) => a + x.semLocale, 0);
const totalCaixaOk = caixaSemLocale.reduce((a, x) => a + x.comLocale, 0);
const totalLog = direcionais.reduce((a, x) => a + x.logicas, 0);
const totalFis = direcionais.reduce((a, x) => a + x.fisicas, 0);

let texto = tabela(['censo', 'total'], [
  ['1. .toLocale*() com locale literal', totalToLocale],
  ['1. new Intl.*() com locale literal', totalIntl],
  ['2. toLowerCase/toUpperCase() sem locale', totalCaixa],
  ['2. toLocaleLowerCase/UpperCase() (a forma certa)', totalCaixaOk],
  ['3. classes lógicas (espelham em RTL)', totalLog],
  ['3. classes físicas (NÃO espelham)', totalFis],
]);

texto += '\n\n[1] Onde ainda há locale literal:';
if (!localeCravado.length) texto += ' nenhum lugar.';
for (const x of localeCravado) {
  texto += `\n  ${x.arquivo}`;
  for (const o of [...x.toLocale, ...x.intl]) texto += `\n      ${o}`;
}

texto += '\n\n[2] Os 12 arquivos com mais caixa sem locale:\n';
texto += tabela(['arquivo', 'sem locale', 'com locale'],
  [...caixaSemLocale].sort((a, b) => b.semLocale - a.semLocale).slice(0, 12)
    .map((x) => [x.arquivo, x.semLocale, x.comLocale]));

texto += '\n\n[3] Os 12 arquivos com mais classe física remanescente:\n';
texto += tabela(['arquivo', 'físicas', 'lógicas'],
  [...direcionais].filter((x) => x.fisicas > 0).sort((a, b) => b.fisicas - a.fisicas).slice(0, 12)
    .map((x) => [x.arquivo, x.fisicas, x.logicas]));

export default publicar('07 — locale cravado, caixa sem locale e classes direcionais', texto, {
  totalToLocale, totalIntl, totalCaixa, totalCaixaOk, totalLog, totalFis,
  localeCravado, caixaSemLocale, direcionais,
});
