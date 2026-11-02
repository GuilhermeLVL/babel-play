/**
 * SUPERTONIC 3 — o que é puro no motor de voz no aparelho (openspec `voz-no-aparelho`).
 *
 * Os pesos são os do `Supertone/supertonic-3` no Hugging Face (commit `724fb5ab…`, OpenRAIL-M; o projeto foi arquivado
 * em 09/09/2026, então não haverá versão nova). Cada arquivo tem o tamanho e o sha256 fixados aqui e conferidos no
 * navegador antes de virar "pronto". O pipeline (tokenização por caractere, NFKD, as trocas e a marca de idioma) é o do
 * exemplo oficial `web/helper.js` (MIT), o mesmo do spike de 02/11/2026.
 *
 * O MODELO NÃO NORMALIZA: número, moeda e sigla vão crus. Por isso todo texto passa antes por `prepararTextoParaVoz`
 * (`core/leitura`), como no gerador de capítulos. Frase longa é cortada com o mesmo corte do leitor (`frasesDoTexto`),
 * com teto de 120 caracteres para o primeiro áudio sair cedo.
 */
import { frasesDoTexto } from '../leitura/narracao';
import { type IdiomaDeVoz, prepararTextoParaVoz } from '../leitura/prepararTextoParaVoz';
import type { CapacidadesDoMotor } from './portaDeVoz';

export const REVISAO_DO_SUPERTONIC = '724fb5abbf5502583fb520898d45929e62f02c0b';

export const VOZES_DO_SUPERTONIC = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'] as const;
export type VozDoSupertonic = (typeof VOZES_DO_SUPERTONIC)[number];
export const VOZ_PADRAO_DO_NARRADOR: VozDoSupertonic = 'F1';

export const ehVozDoSupertonic = (v: unknown): v is VozDoSupertonic =>
  typeof v === 'string' && (VOZES_DO_SUPERTONIC as readonly string[]).includes(v);

/** Os idiomas em que o app sabe preparar o texto (`prepararTextoParaVoz`). O modelo lê 31; o app só oferece estes. */
export const IDIOMAS_DO_SUPERTONIC: readonly IdiomaDeVoz[] = ['pt', 'en', 'es'];

export interface ArquivoDoSupertonic {
  /** Caminho relativo à raiz `VITE_VOZ_MODELO_URL`. */
  caminho: string;
  bytes: number;
  sha256: string;
}

/** Os modelos e a configuração primeiro; o maior (vector_estimator, 245 MiB) por último. */
export const ARQUIVOS_DO_SUPERTONIC: readonly ArquivoDoSupertonic[] = [
  {
    caminho: 'onnx/tts.json',
    bytes: 8_253,
    sha256: '42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09',
  },
  {
    caminho: 'onnx/unicode_indexer.json',
    bytes: 277_676,
    sha256: '9bf7346e43883a81f8645c81224f786d43c5b57f3641f6e7671a7d6c493cb24f',
  },
  {
    caminho: 'voice_styles/F1.json',
    bytes: 292_046,
    sha256: 'bbdec6ee00231c2c742ad05483df5334cab3b52fda3ba38e6a07059c4563dbc2',
  },
  {
    caminho: 'voice_styles/F2.json',
    bytes: 292_423,
    sha256: '7c722c6a72707b1a77f035d67f0d1351ba187738e06f7683e8c72b1df3477fc6',
  },
  {
    caminho: 'voice_styles/F3.json',
    bytes: 290_794,
    sha256: '12f6ef2573baa2defa1128069cb59f203e3ab67c92af77b42df8a0e3a2f7c6ab',
  },
  {
    caminho: 'voice_styles/F4.json',
    bytes: 291_808,
    sha256: 'c2fa764c1225a76dfc3e2c73e8aa4f70d9ee48793860eb34c295fff01c2e032b',
  },
  {
    caminho: 'voice_styles/F5.json',
    bytes: 291_479,
    sha256: '45966e73316415626cf41a7d1c6f3b4c70dbc1ba2bee5c1978ef0ce33244fc8d',
  },
  {
    caminho: 'voice_styles/M1.json',
    bytes: 291_748,
    sha256: 'e35604687f5d23694b8e91593a93eec0e4eca6c0b02bb8ed69139ab2ea6b0a5b',
  },
  {
    caminho: 'voice_styles/M2.json',
    bytes: 292_055,
    sha256: 'b76cbf62bac707c710cf0ae5aba5e31eea1a6339a9734bfae33ab98499534a50',
  },
  {
    caminho: 'voice_styles/M3.json',
    bytes: 290_198,
    sha256: 'ea1ac35ccb91b0d7ecad533a2fbd0eec10c91513d8951e3b25fbba99954e159b',
  },
  {
    caminho: 'voice_styles/M4.json',
    bytes: 291_522,
    sha256: 'ca8eefad4fcd989c9379032ff3e50738adc547eeb5e221b82593a6d7b3bac303',
  },
  {
    caminho: 'voice_styles/M5.json',
    bytes: 291_469,
    sha256: 'dd22b92740314321f8ae11c5e87f8dd60d060f15dd3a632b5adf77f471f77af2',
  },
  {
    caminho: 'onnx/duration_predictor.onnx',
    bytes: 3_700_147,
    sha256: 'c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db',
  },
  {
    caminho: 'onnx/text_encoder.onnx',
    bytes: 36_416_150,
    sha256: 'c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff',
  },
  {
    caminho: 'onnx/vocoder.onnx',
    bytes: 101_424_195,
    sha256: '085de76dd8e8d5836d6ca66826601f615939218f90e519f70ee8a36ed2a4c4ba',
  },
  {
    caminho: 'onnx/vector_estimator.onnx',
    bytes: 256_534_781,
    sha256: '883ac868ea0275ef0e991524dc64f16b3c0376efd7c320af6b53f5b780d7c61c',
  },
];

export const BYTES_DO_SUPERTONIC = ARQUIVOS_DO_SUPERTONIC.reduce((s, a) => s + a.bytes, 0);
/** O tamanho que a tela diz antes de baixar (MB decimais, arredondado). */
export const MB_DO_SUPERTONIC = Math.round(BYTES_DO_SUPERTONIC / 1_000_000);

/** O que o motor sabe fazer, para a porta (`core/voz/portaDeVoz.ts`). Tom não existe no modelo. */
export const CAPACIDADES_DO_SUPERTONIC: CapacidadesDoMotor = {
  idiomas: IDIOMAS_DO_SUPERTONIC,
  retomaNoMeio: false,
  velocidade: { min: 0.5, max: 2 },
  tom: null,
  volume: { min: 0, max: 1 },
  estilos: false,
  tamanhoMb: MB_DO_SUPERTONIC,
  precisaIsolamento: false,
  licenca: 'pesos OpenRAIL-M (Supertone/supertonic-3); código do pipeline MIT',
  textoSaiDoAparelho: false,
};

/** A URL de cada arquivo a partir da raiz (sem barra dupla). */
export const urlDoArquivo = (raiz: string, a: ArquivoDoSupertonic): string =>
  `${raiz.replace(/\/+$/, '')}/${a.caminho}`;

/** Passos do estimador (o padrão do pacote Python 1.3.1) e o teto de cada trecho. */
export const PASSOS_DO_SUPERTONIC = 8;
export const TETO_DO_TRECHO = 120;
/** Silêncio entre os trechos de uma mesma frase. */
export const PAUSA_ENTRE_TRECHOS_S = 0.15;

/** A velocidade do modelo para a velocidade da narração: 1,05 é o padrão do pacote; limitada a 0,5–2. */
export function velocidadeDoModelo(velocidadeDaNarracao = 1): number {
  const v = 1.05 * (Number.isFinite(velocidadeDaNarracao) && velocidadeDaNarracao > 0 ? velocidadeDaNarracao : 1);
  return Math.min(2, Math.max(0.5, v));
}

/** `pt-BR` → `pt`; idioma fora dos três → `null` (o motor não serve). */
export function idiomaDoSupertonic(idioma: string): IdiomaDeVoz | null {
  const b = (idioma || '').toLowerCase().split(/[-_]/)[0];
  return (IDIOMAS_DO_SUPERTONIC as readonly string[]).includes(b) ? (b as IdiomaDeVoz) : null;
}

/** Texto do livro → trechos prontos para o modelo: preparo (números, siglas…) e o corte do leitor com teto 120. */
export function trechosParaSintese(texto: string, idioma: IdiomaDeVoz): string[] {
  const preparado = prepararTextoParaVoz(texto, idioma);
  return frasesDoTexto(preparado.replace(/\n+/g, ' '), idioma, TETO_DO_TRECHO).map((f) => f.texto);
}

const TROCAS: ReadonlyArray<readonly [string, string]> = [
  ['–', '-'],
  ['‑', '-'],
  ['—', '-'],
  ['_', ' '],
  ['“', '"'],
  ['”', '"'],
  ['‘', "'"],
  ['’', "'"],
  ['´', "'"],
  ['`', "'"],
  ['[', ' '],
  [']', ' '],
  ['|', ' '],
  ['/', ' '],
  ['#', ' '],
  ['→', ' '],
  ['←', ' '],
];

/** O texto como o modelo espera (`helper.js` oficial): NFKD, trocas, espaço antes de pontuação, ponto final, `<pt>…</pt>`. */
export function textoParaOModelo(trecho: string, idioma: IdiomaDeVoz): string {
  let t = trecho.normalize('NFKD');
  for (const [de, para] of TROCAS) t = t.split(de).join(para);
  t = t.replace(/[♥☆♡©\\]/g, '');
  t = t.replace(/ ([,.!?;:])/g, '$1');
  t = t.replace(/\s+/g, ' ').trim();
  if (t && !/[.!?;:,'")\]}…]$/.test(t)) t += '.';
  return `<${idioma}>${t}</${idioma}>`;
}

/** Os índices de cada caractere (`unicode_indexer.json`: code point → id; fora da tabela, -1). */
export function idsDoTexto(texto: string, indexador: readonly number[]): BigInt64Array {
  const ids = new BigInt64Array(texto.length);
  for (let j = 0; j < texto.length; j++) {
    const cp = texto.charCodeAt(j);
    ids[j] = BigInt(cp < indexador.length ? indexador[cp] : -1);
  }
  return ids;
}

/** Junta os trechos com o silêncio entre eles. */
export function emendar(partes: readonly Float32Array[], taxa: number, pausaS = PAUSA_ENTRE_TRECHOS_S): Float32Array {
  const silencio = Math.floor(pausaS * taxa);
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
