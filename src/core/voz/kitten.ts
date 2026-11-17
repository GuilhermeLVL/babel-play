/**
 * KITTEN TTS 2 — o que é puro no motor de voz natural no aparelho (openspec `voz-natural-no-aparelho-kitten`).
 *
 * Pesos: `KittenML/kitten-tts-2-mini` (um modelo para todos os idiomas, ~83 MB int8) e `KittenML/kitten-tts-2-pico` (um
 * modelo de ~8 MB POR idioma), licença Apache-2.0, espelhados no R2 com tamanho e sha256 fixados aqui. O pipeline é o do
 * pacote `kittenml` 0.9.8 (`kittentts2_tiny/model.py`, Apache-2.0):
 *
 *   fonemas (IPA, alfabeto de 114+ símbolos do `vocab.json`) → ids [0, …, 10, 0] → `input_ids [1,T]`,
 *   `style [1,256]` (a linha T−1 do pacote da voz, float32 [510,256]) e `speed [1]` → `waveform`, `durations`;
 *   o fim (o quadro do token final) é cortado, o começo só a partir do 2º trecho, rampas de 5 ms e 0,15 s entre trechos.
 *
 * O TEXTO → FONEMAS é do app (`./kitten/fonemas.ts`): o do pacote usa espeak-ng (GPL-3) para pt e es, e o app não leva
 * código GPL. Este módulo não sabe de onde os fonemas vieram.
 */
import { frasesDoTexto } from '../leitura/narracao';
import { type IdiomaDeVoz, prepararTextoParaVoz } from '../leitura/prepararTextoParaVoz';
import type { LexicoEn } from './kitten/en';
import { fonemasDoTexto } from './kitten/fonemas';
import type { CapacidadesDoMotor } from './portaDeVoz';

export type VarianteDoKitten = 'mini' | 'pico';
export const IDIOMAS_DO_KITTEN: readonly IdiomaDeVoz[] = ['pt', 'en', 'es'];

export const TAXA_DO_KITTEN = 24_000;
export const TOKEN_FINAL = 10;
/** O teto de fonemas por trecho (p90 das listas de treino). */
export const TETO_DE_FONEMAS = 350;
export const PAUSA_ENTRE_TRECHOS_KITTEN_S = 0.15;

/** As revisões no Hugging Face de onde os arquivos foram espelhados. */
export const REVISAO_DO_KITTEN: Record<VarianteDoKitten, string> = {
  mini: 'c01797caec3967b400da457656e011eb81f530a4',
  pico: 'da8c9d029e16d9302f1827adb303d92316e25f73',
};

export interface VozDoKitten {
  /** A chave no pacote (`voices_<idioma>.npz`). */
  chave: string;
  nome: string;
  genero: 'feminina' | 'masculina';
}

/**
 * As vozes que o app oferece (as do model card; a 1ª é a padrão). O mini traz mais vozes em inglês, que também servem
 * pt/es com sotaque: o app não as oferece nesses idiomas.
 */
export const VOZES_DO_KITTEN: Record<VarianteDoKitten, Record<IdiomaDeVoz, readonly VozDoKitten[]>> = {
  mini: {
    pt: [
      { chave: 'beatriz', nome: 'Beatriz', genero: 'feminina' },
      { chave: 'thiago', nome: 'Thiago', genero: 'masculina' },
    ],
    en: [
      { chave: 'eleanor', nome: 'Eleanor', genero: 'feminina' },
      { chave: 'otis', nome: 'Otis', genero: 'masculina' },
    ],
    es: [
      { chave: 'lucia', nome: 'Lucia', genero: 'feminina' },
      { chave: 'javier', nome: 'Javier', genero: 'masculina' },
    ],
  },
  pico: {
    pt: [
      { chave: 'juliana', nome: 'Juliana', genero: 'feminina' },
      { chave: 'gustavo', nome: 'Gustavo', genero: 'masculina' },
    ],
    en: [
      { chave: 'eleanor', nome: 'Eleanor', genero: 'feminina' },
      { chave: 'otis', nome: 'Otis', genero: 'masculina' },
    ],
    es: [
      { chave: 'sofia', nome: 'Sofia', genero: 'feminina' },
      { chave: 'pablo', nome: 'Pablo', genero: 'masculina' },
    ],
  },
};

export interface ArquivoDoKitten {
  /** Caminho relativo à raiz da variante (`<VITE_VOZ_KITTEN_URL>/<variante>/<revisão>/`). */
  caminho: string;
  bytes: number;
  sha256: string;
  /** Idioma que precisa do arquivo; sem idioma, todos precisam. */
  idioma?: IdiomaDeVoz;
}

/** O léxico do inglês (CMUdict no alfabeto do misaki), o mesmo nos dois repositórios. */
const LEXICO_EN: ArquivoDoKitten = {
  caminho: 'g2p/cmu_misaki_us.json',
  bytes: 3_418_388,
  sha256: 'ae564e1a76df3501058a5ec99d135d016759c9475042fb6c3811374daee1ef04',
  idioma: 'en',
};

export const ARQUIVOS_DO_KITTEN: Record<VarianteDoKitten, readonly ArquivoDoKitten[]> = {
  mini: [
    { caminho: 'vocab.json', bytes: 1_324, sha256: 'b007200ac2a7973ac25c509f8346815076b9d9f33758cb0bfe4de99e2f58f851' },
    {
      caminho: 'voices_pt.npz',
      bytes: 6_792_306,
      sha256: '83dc34bca3e2c454548d8d63cda7830aa22748cc1a0643fa5bdac445fe8f4f57',
      idioma: 'pt',
    },
    {
      caminho: 'voices_en.npz',
      bytes: 5_747_328,
      sha256: '5c18573d075f53f6f218c2056dfc84ad10e976e81e23d55e5a7a6adc6e9135a4',
      idioma: 'en',
    },
    {
      caminho: 'voices_es.npz',
      bytes: 6_792_300,
      sha256: '3de943ddab5eeced04a42c732d39152802df01fd94f194181a7bc5bd60d52c3b',
      idioma: 'es',
    },
    LEXICO_EN,
    {
      caminho: 'kitten_tts_2_mini.onnx',
      bytes: 82_711_386,
      sha256: 'fa821c1cdd8f7fbfdbd5d1cae0a767673871d62696b85af7db059a9bd26b42d2',
    },
  ],
  pico: [
    { caminho: 'vocab.json', bytes: 1_313, sha256: 'f96ba7baac25095152c28d9d23bca33685cd7411aad802f9fb1c9a3d2b06d046' },
    {
      caminho: 'voices_pt.npz',
      bytes: 2_089_960,
      sha256: '8fcc5244c6e9a6ba48e7c80bf2de490203b75729f2e905abaabce95d74f36ad7',
      idioma: 'pt',
    },
    {
      caminho: 'voices_en.npz',
      bytes: 2_089_952,
      sha256: '48496124eef320b70ccf741d871e401889597d5e14e15e6b2116bdc6100f1a0c',
      idioma: 'en',
    },
    {
      caminho: 'voices_es.npz',
      bytes: 2_089_950,
      sha256: '832e908c27bc7f8e63dbd96e2a9b15c8e45c7c67b9fe2aff27435887ea2e7c07',
      idioma: 'es',
    },
    LEXICO_EN,
    {
      caminho: 'kitten_tts_2_pico_pt.onnx',
      bytes: 7_953_526,
      sha256: '868599329a26a906c2c77f2a5c1e7e3ebef9be7a2f22c95e5c2d272592c13feb',
      idioma: 'pt',
    },
    {
      caminho: 'kitten_tts_2_pico_en.onnx',
      bytes: 7_953_526,
      sha256: '1968e082b71154a1e0e64ebea01d659b75683729b23869d021e183364dcd338a',
      idioma: 'en',
    },
    {
      caminho: 'kitten_tts_2_pico_es.onnx',
      bytes: 7_953_526,
      sha256: 'ebb705619f5c3aa8e51b5dc18fe197ad2a4eb016137cb1dad1de81593baa7bee',
      idioma: 'es',
    },
  ],
};

/** A URL de um arquivo: `<raiz>/<variante>/<caminho>` (a raiz é `VITE_VOZ_KITTEN_URL`, sem barra final). */
export const urlDoArquivoDoKitten = (raiz: string, v: VarianteDoKitten, a: ArquivoDoKitten): string =>
  `${raiz.replace(/\/+$/, '')}/${v}/${a.caminho}`;

/** O arquivo `.onnx` que fala o idioma na variante. */
export function modeloDoIdioma(v: VarianteDoKitten, idioma: IdiomaDeVoz): string {
  return v === 'mini' ? 'kitten_tts_2_mini.onnx' : `kitten_tts_2_pico_${idioma}.onnx`;
}

/** Os arquivos que um idioma precisa na variante (os comuns e os dele). */
export function arquivosDoIdioma(v: VarianteDoKitten, idioma: IdiomaDeVoz): ArquivoDoKitten[] {
  return ARQUIVOS_DO_KITTEN[v].filter((a) => !a.idioma || a.idioma === idioma);
}

export const bytesDe = (arquivos: readonly ArquivoDoKitten[]): number => arquivos.reduce((s, a) => s + a.bytes, 0);

/** `pt-BR` → `pt`; idioma fora dos três → `null`. */
export function idiomaDoKitten(idioma: string): IdiomaDeVoz | null {
  const b = (idioma || '').toLowerCase().split(/[-_]/)[0];
  return (IDIOMAS_DO_KITTEN as readonly string[]).includes(b) ? (b as IdiomaDeVoz) : null;
}

/** A voz pedida (pela chave ou pelo nome, sem caixa) se o idioma a tem na variante; senão a padrão do idioma. */
export function vozDoKitten(v: VarianteDoKitten, idioma: IdiomaDeVoz, pedida?: string | null): VozDoKitten {
  const vozes = VOZES_DO_KITTEN[v][idioma];
  const p = (pedida ?? '').toLowerCase();
  return vozes.find((x) => x.chave === p || x.nome.toLowerCase() === p) ?? vozes[0];
}

/** A velocidade da narração (1 = normal) para o modelo, limitada a 0,5–2. */
export function velocidadeDoKitten(velocidade = 1): number {
  const v = Number.isFinite(velocidade) && velocidade > 0 ? velocidade : 1;
  return Math.min(2, Math.max(0.5, v));
}

/** Fonemas → ids do modelo: [0] + símbolos do vocabulário + [10, 0]. Parênteses viram vírgula; o resto, fora. */
export function idsDosFonemas(fonemas: string, vocab: Readonly<Record<string, number>>): number[] {
  const ids = [0];
  for (const c of fonemas) {
    const id = vocab[c];
    if (id !== undefined) ids.push(id);
    else if (c === '(' || c === ')') ids.push(vocab[','] ?? 3);
  }
  ids.push(TOKEN_FINAL, 0);
  return ids;
}

/** Corta fonemas longos em trechos de até `teto`, nos espaços. */
export function trechosDeFonemas(fonemas: string, teto = TETO_DE_FONEMAS): string[] {
  const out: string[] = [];
  let ps = fonemas.trim();
  while ([...ps].length > teto) {
    const cps = [...ps];
    const corte0 = cps.slice(0, teto).join('').lastIndexOf(' ');
    const corte = corte0 > 0 ? corte0 : cps.slice(0, teto).join('').length;
    out.push(ps.slice(0, corte).trim());
    ps = ps.slice(corte).trim();
  }
  if (ps) out.push(ps);
  return out;
}

/** O estilo da voz para `n` tokens: a linha min(n−1, linhas−1) do pacote [linhas, dim]. */
export function estiloParaTokens(pacote: Float32Array, dim: number, n: number): Float32Array {
  const linhas = Math.floor(pacote.length / dim);
  const i = Math.max(0, Math.min(n - 1, linhas - 1));
  return pacote.subarray(i * dim, (i + 1) * dim);
}

/**
 * O áudio de um trecho como o pacote: tira o quadro do token final (e o do inicial, salvo no 1º trecho), limita a ±1 e
 * aplica rampas de ~5 ms.
 */
export function apararTrecho(
  wav: Float32Array,
  duracoes: ArrayLike<number | bigint>,
  manterInicio: boolean,
): Float32Array {
  const d = Array.from(duracoes, Number);
  const total = d.reduce((s, x) => s + x, 0);
  const spf = Math.max(1, Math.round(wav.length / Math.max(total, 1)));
  const inicio = manterInicio ? 0 : Math.max(0, (d[0] ?? 0) - 1) * spf;
  const fim = Math.max(0, (d[d.length - 1] ?? 0) - 1) * spf;
  let w = wav;
  if (inicio + fim + spf < wav.length) w = wav.subarray(inicio, wav.length - fim);
  const out = new Float32Array(w.length);
  for (let i = 0; i < w.length; i++) out[i] = Math.max(-1, Math.min(1, w[i]));
  const f = Math.min(120, Math.floor(out.length / 8));
  for (let i = 0; i < f; i++) {
    const g = f > 1 ? i / (f - 1) : 1;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return out;
}

/** O teto de caracteres de cada frase do texto (o primeiro áudio sai cedo; a frase longa vira mais de um trecho). */
export const TETO_DO_TRECHO_KITTEN = 200;

/**
 * Texto → trechos de fonemas prontos para o modelo: o preparo (números, siglas…), o corte do leitor e o fonetizador do
 * app; trecho de fonemas acima do teto do treino é cortado nos espaços.
 */
export function fonemasParaSintese(texto: string, idioma: IdiomaDeVoz, lexicoEn?: LexicoEn): string[] {
  const preparado = prepararTextoParaVoz(texto, idioma).replace(/\n+/g, ' ');
  return frasesDoTexto(preparado, idioma, TETO_DO_TRECHO_KITTEN).flatMap((f) =>
    trechosDeFonemas(fonemasDoTexto(f.texto, idioma, lexicoEn)),
  );
}

/** Junta os trechos com o silêncio do pacote entre eles. */
export function emendarTrechos(partes: readonly Float32Array[], taxa = TAXA_DO_KITTEN): Float32Array {
  const silencio = Math.floor(PAUSA_ENTRE_TRECHOS_KITTEN_S * taxa);
  const n = partes.reduce((s, p) => s + p.length, 0) + Math.max(0, partes.length - 1) * silencio;
  const out = new Float32Array(n);
  let o = 0;
  partes.forEach((p, i) => {
    if (i > 0) o += silencio;
    out.set(p, o);
    o += p.length;
  });
  return out;
}

/* ───────── os pacotes de voz (.npz sem compressão, de arrays .npy float32) ───────── */

export interface ArrayDoNpy {
  forma: number[];
  dados: Float32Array;
}

/** Lê um `.npy` (v1/v2/v3) float32 little-endian, ordem C. */
export function lerNpy(b: Uint8Array): ArrayDoNpy {
  if (b[0] !== 0x93 || String.fromCharCode(...b.subarray(1, 6)) !== 'NUMPY') throw new Error('npy inválido');
  const maior = b[6];
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tamCab = maior === 1 ? dv.getUint16(8, true) : dv.getUint32(8, true);
  const ini = maior === 1 ? 10 : 12;
  const cab = new TextDecoder().decode(b.subarray(ini, ini + tamCab));
  if (!/'descr':\s*'<f4'/.test(cab)) throw new Error(`npy: tipo não suportado (${cab})`);
  if (/'fortran_order':\s*True/.test(cab)) throw new Error('npy: ordem Fortran não suportada');
  const forma = (/'shape':\s*\(([^)]*)\)/.exec(cab)?.[1] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  const n = forma.reduce((s, x) => s * x, 1);
  const off = ini + tamCab;
  const copia = b.slice(off, off + n * 4); // alinhado em 4 para o Float32Array
  return { forma, dados: new Float32Array(copia.buffer, 0, n) };
}

/** Lê um `.npz` sem compressão (o `np.savez`): nome (sem `.npy`) → array. Entrada comprimida dá erro. */
export function lerNpz(b: Uint8Array): Map<string, ArrayDoNpy> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = new Map<string, ArrayDoNpy>();
  let p = 0;
  while (p + 30 <= b.length && dv.getUint32(p, true) === 0x04034b50) {
    const flags = dv.getUint16(p + 6, true);
    const metodo = dv.getUint16(p + 8, true);
    let tamanho = dv.getUint32(p + 18, true);
    const nNome = dv.getUint16(p + 26, true);
    const nExtra = dv.getUint16(p + 28, true);
    const nome = new TextDecoder().decode(b.subarray(p + 30, p + 30 + nNome));
    const ini = p + 30 + nNome + nExtra;
    if (metodo !== 0) throw new Error(`npz: ${nome} comprimido (método ${metodo})`);
    if (tamanho === 0xffffffff) {
      /* zip64: o tamanho real está no campo extra 0x0001 */
      const extra = new DataView(b.buffer, b.byteOffset + p + 30 + nNome, nExtra);
      for (let q = 0; q + 4 <= nExtra; ) {
        const id = extra.getUint16(q, true);
        const t = extra.getUint16(q + 2, true);
        if (id === 1) tamanho = Number(extra.getBigUint64(q + 4 + 0, true));
        q += 4 + t;
      }
    }
    if (flags & 0x08 && tamanho === 0) throw new Error('npz: tamanho no descritor não suportado');
    out.set(nome.replace(/\.npy$/, ''), lerNpy(b.subarray(ini, ini + tamanho)));
    p = ini + tamanho;
  }
  if (!out.size) throw new Error('npz vazio ou inválido');
  return out;
}

/* ───────── a porta ───────── */

export const CAPACIDADES_DO_KITTEN: CapacidadesDoMotor = {
  idiomas: IDIOMAS_DO_KITTEN,
  retomaNoMeio: false,
  velocidade: { min: 0.5, max: 2 },
  tom: null,
  volume: { min: 0, max: 1 },
  estilos: false,
  tamanhoMb: Math.round(bytesDe(ARQUIVOS_DO_KITTEN.mini) / 1_000_000),
  precisaIsolamento: false,
  licenca: 'pesos Apache-2.0 (KittenML/kitten-tts-2); fonetizador do app',
  textoSaiDoAparelho: false,
};
