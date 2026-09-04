// MEDE: quantas chaves cada catálogo de tradução realmente PREENCHE.
//
// O número que interessa não é "quantas linhas tem o arquivo". Um catálogo pode declarar
// a chave e devolver o próprio português — isso conta como linha e não como tradução.
// Por isso separo quatro estados: preenchida, vazia, idêntica à chave, e ausente.
//
// Também confronto as categorias de plural declaradas com as que o CLDR exige para o idioma
// (Intl.PluralRules). Categoria faltando não quebra — cai em `other` — mas é tradução errada
// silenciosa em russo, polonês e árabe.
import { andar, caminho, lerJSON, relativo, tamanho, tabela, pct, publicar } from './comum.mjs';

const DIR = caminho('public', 'i18n');
const arquivos = andar(DIR, (p) => p.endsWith('.json'));

// `xx` é o pseudo-idioma gerado por scripts/i18n/pseudo.mjs; não é idioma de produto.
const ehPseudo = (lang) => lang === 'xx';

function classificar(chave, valor) {
  if (valor === null || valor === undefined) return 'ausente';
  if (typeof valor === 'object') {
    const formas = Object.values(valor).filter((v) => typeof v === 'string' && v.trim() !== '');
    return formas.length === 0 ? 'vazia' : 'preenchida';
  }
  if (typeof valor !== 'string') return 'vazia';
  if (valor.trim() === '') return 'vazia';
  if (valor === chave) return 'identica';
  return 'preenchida';
}

const porIdioma = [];
const universo = new Set();

for (const arq of arquivos) {
  const lang = arq.split(/[/\\]/).pop().replace('.json', '');
  const dados = lerJSON(arq);
  const chaves = Object.keys(dados);
  chaves.forEach((k) => universo.add(k));

  const estados = { preenchida: 0, vazia: 0, identica: 0, ausente: 0 };
  const plurais = [];
  const identicas = [];
  for (const k of chaves) {
    const estado = classificar(k, dados[k]);
    estados[estado] += 1;
    if (estado === 'identica') identicas.push(k);
    if (dados[k] && typeof dados[k] === 'object') plurais.push({ chave: k, categorias: Object.keys(dados[k]) });
  }

  // O que o CLDR exige para este idioma, contra o que o catálogo declara.
  let exigidas = [];
  try { exigidas = new Intl.PluralRules(ehPseudo(lang) ? 'pt' : lang).resolvedOptions().pluralCategories; } catch { exigidas = ['?']; }
  const faltando = new Map();
  for (const p of plurais) {
    const ausentes = exigidas.filter((c) => !p.categorias.includes(c));
    if (ausentes.length) faltando.set(p.chave, ausentes);
  }

  porIdioma.push({
    lang,
    arquivo: relativo(arq),
    bytes: tamanho(arq),
    chaves: chaves.length,
    ...estados,
    objetosDePlural: plurais.length,
    categoriasCLDR: exigidas,
    pluraisIncompletos: [...faltando.entries()].map(([c, f]) => ({ chave: c, faltando: f })),
    identicasExemplos: identicas,
    pseudo: ehPseudo(lang),
  });
}

// Universo = união das chaves de todos os catálogos. É o denominador honesto da cobertura
// entre idiomas: quantas das chaves que ALGUÉM já traduziu este idioma cobre.
const total = universo.size;
for (const i of porIdioma) i.doUniverso = pct(i.preenchida, total);

const linhas = porIdioma.map((i) => [
  i.lang + (i.pseudo ? ' (pseudo)' : ''),
  i.chaves,
  i.preenchida,
  i.identica,
  i.vazia,
  total - i.chaves,
  i.objetosDePlural,
  i.doUniverso,
  `${(i.bytes / 1024).toFixed(1)} kB`,
]);

let texto = tabela(
  ['idioma', 'chaves', 'preench.', 'iguais à chave', 'vazias', 'ausentes', 'plurais', '% do universo', 'tamanho'],
  linhas,
);
texto += `\n\nUniverso de chaves (união de todos os catálogos): ${total}`;
texto += `\nPortuguês não tem arquivo — a chave É o texto português (src/lib/i18n.ts:3-22).`;

for (const i of porIdioma) {
  texto += `\n\n[${i.lang}] categorias CLDR exigidas: ${i.categoriasCLDR.join(', ')}`;
  if (i.pluraisIncompletos.length === 0) {
    texto += i.objetosDePlural ? '  → todos os objetos de plural cobrem todas elas' : '  → nenhum objeto de plural neste catálogo';
  } else {
    texto += `  → ${i.pluraisIncompletos.length} de ${i.objetosDePlural} objetos de plural com categoria faltando:`;
    for (const p of i.pluraisIncompletos.slice(0, 10)) texto += `\n    ${JSON.stringify(p.chave)} falta: ${p.faltando.join(', ')}`;
    if (i.pluraisIncompletos.length > 10) texto += `\n    … e mais ${i.pluraisIncompletos.length - 10}`;
  }
}

export default publicar('02 — chaves por catálogo', texto, { universo: total, porIdioma });
