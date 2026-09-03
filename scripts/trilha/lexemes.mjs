/**
 * Wikidata Lexemes (CC0) — formas→lema e pares de tradução por par de idiomas.
 * Resolve os dois buracos do piloto: lista de frequência traz conjugações, e sem glosa os jogos
 * de par não abrem.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const CACHE = '.cache/trilha';

/** Wikidata item de cada idioma. */
export const ITEM_DO_IDIOMA = {
  en: 'Q1860', pt: 'Q5146', es: 'Q1321', fr: 'Q150', de: 'Q188', it: 'Q652',
  ru: 'Q7737', ja: 'Q5287', zh: 'Q7850', ko: 'Q9176', ar: 'Q13955', nl: 'Q7411',
  pl: 'Q809', tr: 'Q256', el: 'Q9129', he: 'Q9288', hi: 'Q1568', th: 'Q9217',
};

async function sparql(query, arquivo) {
  mkdirSync(CACHE, { recursive: true });
  const caminho = join(CACHE, arquivo);
  if (existsSync(caminho)) return readFileSync(caminho, 'utf8');
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}`;
  const r = await fetch(url, {
    headers: { Accept: 'text/csv', 'User-Agent': 'BabelPlay/1.0 (trilha educacional)' },
  });
  if (!r.ok) throw new Error(`SPARQL ${r.status}: ${arquivo}`);
  const csv = await r.text();
  writeFileSync(caminho, csv, 'utf8');
  return csv;
}

function linhasCsv(csv) {
  return csv.split(/\r?\n/).slice(1).filter(Boolean).map(l => {
    const i = l.indexOf(',');
    return i < 0 ? null : [l.slice(0, i).replace(/^"|"$/g, ''), l.slice(i + 1).replace(/^"|"$/g, '')];
  }).filter(Boolean);
}

/** forma (minúscula) → lema. Forma ambígua fica com o lema mais curto, que é o mais comum. */
export async function formasPorLema(lang) {
  const item = ITEM_DO_IDIOMA[lang];
  if (!item) return new Map();
  const csv = await sparql(
    `SELECT ?forma ?lema WHERE { ?l dct:language wd:${item} ; wikibase:lemma ?lema ; ontolex:lexicalForm ?f . ?f ontolex:representation ?forma . }`,
    `formas-${lang}.csv`,
  );
  const mapa = new Map();
  for (const [forma, lema] of linhasCsv(csv)) {
    const k = forma.toLowerCase();
    const anterior = mapa.get(k);
    if (!anterior || lema.length < anterior.length) mapa.set(k, lema);
  }
  return mapa;
}

/** lema do idioma praticado → tradução no nativo. */
export async function glosasDoPar(praticado, nativo) {
  const a = ITEM_DO_IDIOMA[praticado];
  const b = ITEM_DO_IDIOMA[nativo];
  if (!a || !b) return new Map();
  const csv = await sparql(
    `SELECT DISTINCT ?a ?b WHERE {`
    + ` ?la dct:language wd:${a} ; wikibase:lemma ?a ; ontolex:sense ?sa . ?sa wdt:P5137 ?c .`
    + ` ?lb dct:language wd:${b} ; wikibase:lemma ?b ; ontolex:sense ?sb . ?sb wdt:P5137 ?c . }`,
    `glosas-${praticado}-${nativo}.csv`,
  );
  const mapa = new Map();
  for (const [origem, destino] of linhasCsv(csv)) {
    const k = origem.toLowerCase();
    // Primeira tradução vence; a segunda seria sinônimo, e a pista quer uma resposta só.
    if (!mapa.has(k) && origem.toLowerCase() !== destino.toLowerCase()) mapa.set(k, destino);
  }
  return mapa;
}

/**
 * Wikcionário do idioma nativo, extraído pelo Wiktextract (CC BY-SA). Traz verbetes de palavras
 * estrangeiras definidas no nativo — o que o Wikidata, com 6% de cobertura em es-pt, não dá.
 * Dump esperado em `.cache/trilha/<nativo>-extract.jsonl.gz`; sem ele, devolve mapa vazio.
 */
/**
 * O verbete fala SOBRE a palavra em vez de traduzi-la: "feminino de alto", "pôr na massa". Numa
 * carta de jogo isso não é pista, é uma nota de dicionário — e a pessoa não tem como responder.
 */
const METALINGUAGEM = /^(?:o |a |ação de |ato de )?(?:feminino|masculino|plural|singular|diminutivo|aumentativo|superlativo|particípio|gerúndio|forma|flexão|variante|grafia|sinônimo|antônimo)\b|\bde\s+\w+ar$|^(?:pôr|dar|fazer|tornar)\s/i;

export async function glosasDoWikcionario(praticado, nativo) {
  const { createReadStream } = await import('node:fs');
  const { createGunzip } = await import('node:zlib');
  const { createInterface } = await import('node:readline');
  const arquivo = join(CACHE, `${nativo}-extract.jsonl.gz`);
  if (!existsSync(arquivo)) return new Map();

  const direto = new Map();
  const inverso = new Map();
  const rl = createInterface({ input: createReadStream(arquivo).pipe(createGunzip()) });
  for await (const linha of rl) {
    if (!linha.trim()) continue;
    let verbete;
    try { verbete = JSON.parse(linha); } catch { continue; }
    if (!verbete.word) continue;

    // Verbete do praticado definido no nativo: a definição É a glosa.
    if (verbete.lang_code === praticado) {
      const glosa = verbete.senses?.find((s) => s.glosses?.length)?.glosses[0];
      // Primeira acepção, cortada na primeira vírgula: a pista quer uma resposta, não um verbete.
      const curta = glosa ? limparLema(String(glosa).split(/[,;(]/)[0]) : '';
      const chave = String(verbete.word).toLowerCase();
      if (curta && curta.length <= 40 && curta.toLowerCase() !== chave
          && !METALINGUAGEM.test(curta) && !direto.has(chave)) {
        direto.set(chave, curta);
      }
      continue;
    }

    /* Verbete do nativo com tabela de traduções: invertida, cobre 3,6× mais que a via direta,
       porque o Wikcionário nativo descreve o próprio idioma com muito mais fôlego. */
    if (verbete.lang_code !== nativo) continue;
    for (const t of verbete.translations ?? []) {
      if ((t.code ?? t.lang_code) !== praticado || !t.word) continue;
      const chave = String(t.word).toLowerCase();
      // TODAS as candidatas, não a primeira: é entre elas que o cognato desempata.
      const glosa = limparLema(String(verbete.word));
      if (!glosa) continue;
      if (!inverso.has(chave)) inverso.set(chave, []);
      inverso.get(chave).push(glosa);
    }
  }
  // A definição direta descreve o sentido; a inversa é palavra a palavra. Direta ganha.
  const mapa = new Map();
  for (const [k, candidatas] of inverso) {
    const escolhida = escolherPorCognato(k, candidatas);
    if (escolhida !== null) mapa.set(k, escolhida);
  }
  for (const [k, v] of direto) mapa.set(k, v);
  return mapa;
}

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * O Wikcionário numera homógrafos no próprio lema (`cebola¹`) e às vezes deixa pontuação de
 * entrada (`África:`). Nada disso é parte da palavra, e tudo isso apareceria na carta do jogo.
 */
const limparLema = (s) => s.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+$/u, '').replace(/^[\s:;,.·-]+|[\s:;,.·-]+$/gu, '');

function distancia(a, b) {
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const atual = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = atual;
    }
  }
  return linha[b.length];
}

/**
 * O COGNATO DESEMPATA. A tabela de traduções do Wikcionário casa palavra com palavra sem sentido
 * nem classe, e a primeira que aparece frequentemente é uma acepção lateral: `negocio` saía como
 * "loja", `planear` como "planar". Entre línguas irmãs a forma parecida é quase sempre a acepção
 * central — `negócio`, `planejar` —, então ela vence quando está perto o bastante.
 *
 * Só desempata entre candidatas que o dicionário já ofereceu: não inventa tradução por semelhança,
 * e por isso um falso amigo só entra se já fosse uma tradução legítima daquela palavra.
 */
export function escolherPorCognato(palavra, candidatas) {
  const alvo = semAcento(palavra);

  /* PALAVRA TRANSPARENTE devolve `null`, não uma glosa. Se o dicionário traduz `temor` por `temor`,
     as outras candidatas daquela entrada são acepções laterais — era assim que saíam
     `temor=insegurança` e `infiel=mouro`. Ela também não precisa de trilha de par: quem lê
     português já a lê. Melhor buraco declarado que pista errada.

     Grafia EXATA, não normalizada: `negocio`→`negócio` difere por um acento e é a glosa perfeita,
     enquanto `temor`→`temor` é a mesma palavra escrita igual nos dois idiomas. */
  const exata = palavra.toLowerCase();
  if (candidatas.some((c) => c.toLowerCase() === exata)) return null;

  let melhor = candidatas[0];
  let melhorPerto = Infinity;
  for (const c of candidatas) {
    const d = distancia(alvo, semAcento(c)) / Math.max(alvo.length, c.length);
    if (d < melhorPerto) { melhorPerto = d; melhor = c; }
  }
  // Longe demais para ser cognato: nenhuma pista de forma, fica a ordem do dicionário.
  return melhorPerto <= 0.34 ? melhor : candidatas[0];
}

/** Wikidata primeiro (curado, CC0); Wikcionário preenche o resto. */
export async function glosas(praticado, nativo) {
  const doWikidata = await glosasDoPar(praticado, nativo);
  const doWikcionario = await glosasDoWikcionario(praticado, nativo);
  const mapa = new Map(doWikcionario);
  for (const [k, v] of doWikidata) mapa.set(k, v);
  return { mapa, doWikidata: doWikidata.size, doWikcionario: doWikcionario.size };
}

/**
 * Colapsa formas no lema, somando as contagens. Palavra sem lema conhecido fica como está —
 * descartar perderia vocabulário legítimo que o Wikidata ainda não cobre.
 */
/** Idiomas que grudam o pronome no fim do verbo: `darme`, `llamarla`, `dá-lo`. */
const ENCLITICOS = {
  es: ['me', 'te', 'se', 'lo', 'la', 'le', 'nos', 'los', 'las', 'les', 'selo', 'sela'],
  pt: ['me', 'te', 'se', 'lo', 'la', 'lhe', 'nos', 'los', 'las', 'lhes'],
  it: ['mi', 'ti', 'si', 'lo', 'la', 'ci', 'li', 'le', 'ne', 'gli'],
};
const FORMA_VERBAL = /(?:ar|er|ir|ír|ndo)$/;
/* Raiz de três letras é ambígua: `par` de `parte` tem a mesma cara de `dar` de `darme`. Os verbos
   tão curtos assim cabem numa lista. */
const VERBOS_CURTOS = new Set(['dar', 'ver', 'ir', 'oír', 'ser', 'ter', 'ver', 'vir', 'pôr']);

const pareceVerbo = (raiz) => (raiz.length > 3 ? FORMA_VERBAL.test(raiz) : VERBOS_CURTOS.has(raiz));

/**
 * `darme` → `dar`. Sem isto o pronome vira palavra da trilha e o mesmo verbo ocupa várias vagas.
 * A raiz precisa dos dois sinais — estar no dicionário e parecer verbo. Só o sufixo comeria
 * `suerte` → `suer`; só o dicionário comeria `parte` → `par`.
 */
function semEnclitico(palavra, mapa, lang) {
  for (const pronome of ENCLITICOS[lang] ?? []) {
    if (!palavra.endsWith(pronome)) continue;
    const raiz = palavra.slice(0, -pronome.length);
    if (raiz.length >= 2 && pareceVerbo(raiz) && mapa.has(raiz)) return mapa.get(raiz);
  }
  return null;
}

export function lematizar(palavras, mapa, lang) {
  const porLema = new Map();
  for (const p of palavras ?? []) {
    const chave = String(p.palavra).toLowerCase();
    const lema = mapa.get(chave) ?? semEnclitico(chave, mapa, lang) ?? p.palavra;
    const atual = porLema.get(lema);
    if (atual) atual.contagem += Number(p.contagem) || 0;
    else porLema.set(lema, { palavra: lema, contagem: Number(p.contagem) || 0 });
  }
  return [...porLema.values()].sort((x, y) => y.contagem - x.contagem);
}
