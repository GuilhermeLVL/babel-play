/**
 * Download e cache das fontes públicas. Nada baixa por import — só quando alguém chama.
 *
 * Cache: `.cache/trilha/` (a pasta se auto-ignora: um `.gitignore` com `*` é escrito nela).
 * Manifesto `.cache/trilha/manifesto.json`: chave → { url, sha256, bytes, quando }.
 *
 * Licenças: FrequencyWords (hermitdave) MIT/CC-BY-SA — derivado de legendas OpenSubtitles.
 * Tatoeba: CC-BY 2.0 FR. As duas exigem atribuição na saída (`fonte` do JSON da trilha).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

export const DIR_CACHE = path.resolve(process.cwd(), '.cache/trilha');

export const FONTE_FREQUENCIA = {
  nome: 'hermitdave/FrequencyWords',
  licenca: 'MIT (código) / CC-BY-SA (dados OpenSubtitles)',
  url: (lang) => `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/${lang}/${lang}_full.txt`,
  arquivo: (lang) => `frequencia-${lang}.txt`,
};

export const FONTE_FRASES = {
  nome: 'Tatoeba',
  licenca: 'CC-BY 2.0 FR',
  // Dump por idioma (código ISO-639-3). `<x>_sentences.tsv`: id \t lang \t texto.
  url: (iso3) => `https://downloads.tatoeba.org/exports/per_language/${iso3}/${iso3}_sentences.tsv.bz2`,
  arquivo: (iso3) => `tatoeba-${iso3}.tsv.bz2`,
};

/** ISO-639-1 → ISO-639-3, que é o código dos dumps do Tatoeba. */
export const ISO3 = {
  en: 'eng', es: 'spa', fr: 'fra', de: 'deu', it: 'ita', pt: 'por',
  ja: 'jpn', zh: 'cmn', ru: 'rus', ar: 'ara', he: 'heb', hi: 'hin', th: 'tha',
  ko: 'kor', nl: 'nld', pl: 'pol', tr: 'tur', sv: 'swe',
};

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function prepararCache() {
  await mkdir(DIR_CACHE, { recursive: true });
  const guarda = path.join(DIR_CACHE, '.gitignore');
  try { await stat(guarda); } catch { await writeFile(guarda, '*\n'); }
}

export async function lerManifesto() {
  try { return JSON.parse(await readFile(path.join(DIR_CACHE, 'manifesto.json'), 'utf8')); }
  catch { return {}; }
}

async function gravarManifesto(m) {
  await writeFile(path.join(DIR_CACHE, 'manifesto.json'), JSON.stringify(m, null, 2) + '\n');
}

/** Baixa `url` para `nomeArquivo` se ainda não houver cache. Devolve o caminho local. */
export async function baixar(url, nomeArquivo, { forcar = false } = {}) {
  await prepararCache();
  const destino = path.join(DIR_CACHE, nomeArquivo);
  const manifesto = await lerManifesto();
  if (!forcar && manifesto[nomeArquivo]) {
    try { await stat(destino); return destino; } catch { /* sumiu do disco: rebaixa */ }
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} em ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await writeFile(destino, buf);
  manifesto[nomeArquivo] = { url, sha256: sha256(buf), bytes: buf.length, quando: new Date().toISOString() };
  await gravarManifesto(manifesto);
  return destino;
}

/** Lista de frequência: `[{ palavra, contagem }]`, já na ordem da fonte (mais frequente antes). */
export function lerFrequencia(texto) {
  const fora = [];
  for (const linha of texto.split('\n')) {
    const [palavra, n] = linha.trim().split(/\s+/);
    if (!palavra || !n) continue;
    const contagem = Number(n);
    if (!Number.isFinite(contagem)) continue;
    fora.push({ palavra, contagem });
  }
  return fora;
}

/**
 * Dump do Tatoeba (`id \t lang \t texto`) -> `{ id, frase }`.
 *
 * O ID VIAJA JUNTO porque e ele que casa a traducao: o Tatoeba liga frases por id, nao por texto,
 * e sem ele a frase de exemplo chega a trilha sem par em portugues -- que e o que mantinha os
 * jogos de frase bloqueados nos idiomas novos.
 */
export function lerFrases(texto) {
  const fora = [];
  for (const linha of texto.split('\n')) {
    const col = linha.split('\t');
    if (col.length < 3) continue;
    const frase = col[2].trim();
    if (frase) fora.push({ id: col[0].trim(), frase });
  }
  return fora;
}

export async function frequenciaDe(lang, opcoes) {
  const caminho = await baixar(FONTE_FREQUENCIA.url(lang), FONTE_FREQUENCIA.arquivo(lang), opcoes);
  return lerFrequencia(await readFile(caminho, 'utf8'));
}

/**
 * Dump do Tatoeba. O arquivo vem `.bz2`, que o Node não descomprime sozinho — descomprima antes
 * (`bunzip2 .cache/trilha/tatoeba-<iso3>.tsv.bz2`) e passe o `.tsv`; se já houver `.tsv` no cache,
 * ele é usado direto.
 */
export async function frasesDe(lang, opcoes) {
  const iso3 = ISO3[lang];
  if (!iso3) throw new Error(`sem código ISO-639-3 para "${lang}" — acrescente em ISO3`);
  const tsv = path.join(DIR_CACHE, `tatoeba-${iso3}.tsv`);
  try {
    await stat(tsv);
  } catch {
    await baixar(FONTE_FRASES.url(iso3), FONTE_FRASES.arquivo(iso3), opcoes);
    throw new Error(`baixei ${FONTE_FRASES.arquivo(iso3)}; descomprima para ${tsv} (bunzip2) e rode de novo`);
  }
  return lerFrases(await readFile(tsv, 'utf8'));
}

/**
 * Tradução das frases, pelo id do Tatoeba.
 *
 * O par vem do export `<iso3>-<iso3nativo>_links.tsv` (só `id \t id`), muito menor que o `links.csv`
 * global — 77 mil linhas para es-pt contra dezenas de milhões. O texto do lado nativo vem do dump
 * daquele idioma. Sem os dois arquivos em cache devolve mapa vazio, e a trilha sai com a frase e
 * sem tradução: os jogos de frase seguem bloqueados, dizendo isso.
 */
export async function traducoesDasFrases(lang, nativo) {
  const iso3 = ISO3[lang];
  const iso3Nativo = ISO3[nativo];
  if (!iso3 || !iso3Nativo) return new Map();

  const links = path.join(DIR_CACHE, `links-${iso3}-${iso3Nativo}.tsv`);
  const frasesNativo = path.join(DIR_CACHE, `tatoeba-${iso3Nativo}.tsv`);
  try {
    await stat(links);
    await stat(frasesNativo);
  } catch {
    return new Map();
  }

  const porId = new Map();
  for (const { id, frase } of lerFrases(await readFile(frasesNativo, 'utf8'))) porId.set(id, frase);

  const fora = new Map();
  for (const linha of (await readFile(links, 'utf8')).split('\n')) {
    const [origem, destino] = linha.split('\t');
    if (!origem || !destino) continue;
    const traducao = porId.get(destino.trim());
    // Primeira tradução vence: o Tatoeba lista várias e a ordem dele é estável entre gerações.
    if (traducao && !fora.has(origem.trim())) fora.set(origem.trim(), traducao);
  }
  return fora;
}

/** Auxiliar para fonte já em `.gz` (Wiktextract, por exemplo). */
export async function descomprimirGz(origem, destino) {
  await pipeline(createReadStream(origem), createGunzip(), createWriteStream(destino));
  return destino;
}

export async function baixarStream(url, destino) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${resp.status} em ${url}`);
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(destino));
  return destino;
}

/** Atribuição que vai no campo `fonte` do JSON da trilha. */
export function atribuicao(lang) {
  return `Frequência: ${FONTE_FREQUENCIA.nome} (${FONTE_FREQUENCIA.licenca}), ${FONTE_FREQUENCIA.url(lang)}. `
    + `Frases: ${FONTE_FRASES.nome} (${FONTE_FRASES.licenca}), https://tatoeba.org.`;
}
