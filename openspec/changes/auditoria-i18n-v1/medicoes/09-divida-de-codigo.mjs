// MEDE: as quatro dívidas que os documentos quantificam e a Fase 0 deixou em aberto.
//
//   B1  "78 plurais decididos no código, fora do tp()"      i18n-lacunas.md:58-59
//   A15 "~60 plurais"                                        i18n.md:130
//   B4  "1.053 template literals com interpolação"           i18n-lacunas.md:117-118
//   A14 "540 template literals com ${}"                      i18n.md:129
//   A13 "688 casos de texto rico"                            i18n.md:127
//   B14 "20 diretos, ~688 no total"                          i18n-lacunas.md:229
//   A18 "~55 chaves de localStorage babel.*"                 i18n.md:143
//
// Os documentos dão dois números para a mesma coisa em dois casos (plural: 78 e ~60; template
// literal: 1.053 e 540). Meço com definições explícitas e digo QUAL definição produz QUAL número,
// em vez de escolher a que favorece um lado.
import { andar, caminho, ehFonte, lerTexto, relativo, tabela, publicar } from './comum.mjs';

const arquivos = [...andar(caminho('src'), ehFonte)];
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// --- plural decidido no código -----------------------------------------------------------
// O padrão canônico é um ternário sobre uma comparação numérica escolhendo entre dois textos.
const PLURAL_SUFIXO = /\$\{\s*\w+\s*[><=!]==?\s*\d+\s*\?\s*['"][^'"]*['"]\s*:\s*['"][^'"]*['"]\s*\}/g;
const PLURAL_TERNARIO = /(?<![\w.])\w+\s*(?:===?|!==?|>=?|<=?)\s*\d+\s*\?\s*['"`][^'"`]*['"`]\s*:\s*['"`][^'"`]*['"`]/g;

// --- template literal com interpolação ---------------------------------------------------
const TEMPLATE_COM_INTERP = /`[^`]*\$\{[^`]*`/g;

// --- texto rico: frase JSX com formatação no meio -----------------------------------------
// "Direto" = tag de ênfase inline dentro de uma linha que também tem texto solto.
const TAG_INLINE = /<(?:b|strong|i|em|u|small|code|mark|span)\b[^>]*>/g;

// --- chaves de localStorage ---------------------------------------------------------------
const CHAVE_STORAGE = /['"`](babel[.\w-]*)['"`]/g;

const linhas = [];
const chavesStorage = new Set();
let pluralSufixo = 0, pluralTernario = 0, templates = 0, tagsInline = 0;
const arquivosComTagInline = new Set();

for (const arq of arquivos) {
  const limpo = semComentarios(lerTexto(arq));
  const rel = relativo(arq);

  const ps = (limpo.match(PLURAL_SUFIXO) ?? []).length;
  const pt = (limpo.match(PLURAL_TERNARIO) ?? []).length;
  const tl = (limpo.match(TEMPLATE_COM_INTERP) ?? []).length;
  const ti = (limpo.match(TAG_INLINE) ?? []).length;

  for (const m of limpo.matchAll(CHAVE_STORAGE)) chavesStorage.add(m[1]);

  pluralSufixo += ps; pluralTernario += pt; templates += tl; tagsInline += ti;
  if (ti) arquivosComTagInline.add(rel);
  if (ps + pt + tl + ti > 0) linhas.push({ arquivo: rel, pluralSufixo: ps, pluralTernario: pt, templates: tl, tagsInline: ti });
}

// Só as chaves que de fato são usadas com localStorage/sessionStorage.
const usoDeStorage = arquivos
  .map((a) => semComentarios(lerTexto(a)))
  .join('\n');
const chavesReais = [...chavesStorage].filter((k) => new RegExp(`(?:localStorage|sessionStorage)[\\s\\S]{0,80}${k.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&')}`).test(usoDeStorage));

let texto = tabela(['medida', 'medido', 'alegado', 'origem'], [
  ['plural por sufixo (`${n>1?"s":""}`)', pluralSufixo, '—', 'i18n.md:131 cita o padrão'],
  ['plural por ternário sobre número', pluralTernario, '78 / ~60', 'i18n-lacunas.md:58 / i18n.md:130'],
  ['plural total decidido no código', pluralSufixo + pluralTernario, '78', 'i18n-lacunas.md:58'],
  ['template literal com `${}`', templates, '1.053 / 540', 'i18n-lacunas.md:117 / i18n.md:129'],
  ['tag inline de ênfase em JSX', tagsInline, '688', 'i18n.md:127'],
  ['arquivos com tag inline', arquivosComTagInline.size, '—', '—'],
  ['chaves `babel.*` distintas', chavesStorage.size, '~55', 'i18n.md:143'],
  ['dessas, usadas com (local|session)Storage', chavesReais.length, '~55', 'i18n.md:143'],
]);

texto += '\n\nOs 12 arquivos com mais dívida somada:\n';
texto += tabela(['arquivo', 'plural suf.', 'plural tern.', 'templates', 'tag inline'],
  [...linhas]
    .sort((a, b) => (b.pluralSufixo + b.pluralTernario + b.templates + b.tagsInline) - (a.pluralSufixo + a.pluralTernario + a.templates + a.tagsInline))
    .slice(0, 12)
    .map((x) => [x.arquivo, x.pluralSufixo, x.pluralTernario, x.templates, x.tagsInline]));

texto += '\n\nRessalva: "template literal com ${}" e "tag inline" são censos de PADRÃO, não de';
texto += '\nstring de tela. Um template literal pode montar uma classe CSS ou uma URL; uma tag';
texto += '\ninline pode envolver um ícone. O número alto não é dívida de tradução por inteiro —';
texto += '\né o teto dela. É por isso que os próprios documentos dão dois valores diferentes.';

export default publicar('09 — dívida de código quantificada', texto, {
  pluralSufixo, pluralTernario, templates, tagsInline,
  arquivosComTagInline: arquivosComTagInline.size,
  chavesStorage: chavesStorage.size, chavesReais: chavesReais.length,
  porArquivo: linhas,
});
