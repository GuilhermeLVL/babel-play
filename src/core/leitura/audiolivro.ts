/**
 * O AUDIOLIVRO PRÉ-GERADO — o contrato do manifesto (`manifesto.json` por livro/voz no R2), o hash das frases de
 * cada capítulo (a trava: texto do livro mudou depois da geração ⇒ o áudio não toca e o narrador local lê) e a
 * chave dos arquivos no bucket.
 *
 * O ÍNDICE `i` de cada frase é o de `frasesDoTexto` do app (teto 600). O gerador e o leitor montam as mesmas
 * frases; `hashDasFrases` sobre elas (normalizadas como no manifesto de parágrafos) é o que o cliente confere antes
 * de tocar o capítulo.
 *
 * Módulo puro: sem `TextEncoder`/`URL` diretos (via `globalThis`, como `src/core/livros/manifesto.ts`).
 */
import { normalizarParaManifesto } from '../livros/manifesto';

export interface FraseComTempo {
  i: number;
  t0: number;
  t1: number;
}

/** `frases: 0` ⇒ `bytes: 0`, `duracaoS: 0`, sem arquivo (capítulo vazio ou só imagem). */
export interface CapituloDeAudio {
  nn: number;
  duracaoS: number;
  bytes: number;
  sha256: string;
  frases: number;
  hashDasFrases: string;
}

export interface ManifestoDeAudio {
  versao: 1;
  livroId: string;
  idioma: string;
  voz: string;
  motor: string;
  versaoDoMotor: string;
  versaoDoPreprocessador: string;
  hashDoTexto: string;
  capitulos: CapituloDeAudio[];
  criadoEm: string;
  rotulo: 'voz sintetizada';
  licencaDoTexto: string;
  classificacao: string;
  formato: { codec: 'opus' | 'aac'; kbps: number; canais: 1 };
  elenco?: boolean;
}

const HEX_DO_HASH = 16;

const paraBytes = (s: string): Uint8Array =>
  new (globalThis as unknown as { TextEncoder: new () => { encode(s: string): Uint8Array } }).TextEncoder().encode(s);

const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** SHA-256 de `frases.map(normalizarParaManifesto).join('\n')`, 16 hex. */
export async function hashDasFrases(frases: readonly string[]): Promise<string> {
  const subtle = (
    globalThis as unknown as { crypto: { subtle: { digest(a: string, d: Uint8Array): Promise<ArrayBuffer> } } }
  ).crypto.subtle;
  const dados = paraBytes(frases.map(normalizarParaManifesto).join('\n'));
  return hex(new Uint8Array(await subtle.digest('SHA-256', dados))).slice(0, HEX_DO_HASH);
}

/* SHA-256 síncrono: `validarManifesto` é síncrona e confere `hashDoTexto`; `crypto.subtle` só é assíncrono. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

function sha256(dados: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const total = Math.ceil((dados.length + 9) / 64) * 64;
  const msg = new Uint8Array(total);
  msg.set(dados);
  msg[dados.length] = 0x80;
  const bits = dados.length * 8;
  const vista = new DataView(msg.buffer);
  vista.setUint32(total - 8, Math.floor(bits / 0x100000000));
  vista.setUint32(total - 4, bits >>> 0);
  const w = new Uint32Array(64);
  const rot = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let t = 0; t < 16; t++) w[t] = vista.getUint32(o + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rot(w[t - 15], 7) ^ rot(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rot(w[t - 2], 17) ^ rot(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (k + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) >>> 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += k;
  }
  const out = new Uint8Array(32);
  const vo = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) vo.setUint32(i * 4, h[i]);
  return out;
}

const hashDoLivroSincrono = (hashes: readonly string[]): string =>
  hex(sha256(paraBytes(hashes.join('\n')))).slice(0, HEX_DO_HASH);

/** O hash do texto do livro: SHA-256 dos hashes dos capítulos em ordem, unidos por `\n`, 16 hex. */
export async function hashDoLivro(hashesDosCapitulos: readonly string[]): Promise<string> {
  return hashDoLivroSincrono(hashesDosCapitulos);
}

type Resultado = { ok: true; manifesto: ManifestoDeAudio } | { ok: false; motivo: string };

const CAMPOS_DO_MANIFESTO = new Set([
  'versao',
  'livroId',
  'idioma',
  'voz',
  'motor',
  'versaoDoMotor',
  'versaoDoPreprocessador',
  'hashDoTexto',
  'capitulos',
  'criadoEm',
  'rotulo',
  'licencaDoTexto',
  'classificacao',
  'formato',
  'elenco',
]);
const CAMPOS_DO_CAPITULO = new Set(['nn', 'duracaoS', 'bytes', 'sha256', 'frases', 'hashDasFrases']);
const CAMPOS_DO_FORMATO = new Set(['codec', 'kbps', 'canais']);
const TEXTOS = [
  'livroId',
  'idioma',
  'voz',
  'motor',
  'versaoDoMotor',
  'versaoDoPreprocessador',
  'hashDoTexto',
  'criadoEm',
  'licencaDoTexto',
  'classificacao',
] as const;

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const naoNegativo = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const inteiroNaoNegativo = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function desconhecido(o: Record<string, unknown>, conhecidos: ReadonlySet<string>): string | null {
  for (const k of Object.keys(o)) if (!conhecidos.has(k)) return k;
  return null;
}

function validarCapitulo(c: unknown, anterior: number | null): string | null {
  if (!ehObjeto(c)) return 'capítulo não é objeto';
  const extra = desconhecido(c, CAMPOS_DO_CAPITULO);
  if (extra) return `campo desconhecido: ${extra}`;
  if (!Number.isInteger(c.nn) || (c.nn as number) < 1) return 'nn inválido';
  const nn = c.nn as number;
  if (anterior !== null && nn === anterior) return `nn repetido: ${nn}`;
  if (anterior !== null && nn < anterior) return `nn fora de ordem: ${nn}`;
  if (!inteiroNaoNegativo(c.frases)) return `frases inválido no capítulo ${nn}`;
  if (!inteiroNaoNegativo(c.bytes)) return `bytes inválido no capítulo ${nn}`;
  if (!naoNegativo(c.duracaoS)) return `duracaoS inválido no capítulo ${nn}`;
  if (typeof c.sha256 !== 'string') return `sha256 inválido no capítulo ${nn}`;
  if (typeof c.hashDasFrases !== 'string' || !/^[0-9a-f]{16}$/.test(c.hashDasFrases))
    return `hashDasFrases inválido no capítulo ${nn}`;
  if (c.frases === 0) {
    if (c.bytes !== 0 || c.duracaoS !== 0 || c.sha256 !== '') return `capítulo ${nn} com 0 frases tem arquivo`;
  } else if (c.bytes === 0 || c.duracaoS === 0 || !/^[0-9a-f]{64}$/.test(c.sha256)) {
    return `capítulo ${nn} sem arquivo válido`;
  }
  return null;
}

/** Validação estrita do manifesto lido de fora: qualquer desvio recusa (o cliente cai no narrador local). */
export function validarManifesto(bruto: unknown, livroId: string): Resultado {
  const nao = (motivo: string): Resultado => ({ ok: false, motivo });
  if (!ehObjeto(bruto)) return nao('manifesto não é objeto');
  const extra = desconhecido(bruto, CAMPOS_DO_MANIFESTO);
  if (extra) return nao(`campo desconhecido: ${extra}`);
  if (bruto.versao !== 1) return nao('versao diferente de 1');
  for (const campo of TEXTOS) if (typeof bruto[campo] !== 'string' || !bruto[campo]) return nao(`${campo} inválido`);
  if (bruto.livroId !== livroId) return nao('livroId não confere');
  if (bruto.rotulo !== 'voz sintetizada') return nao('rotulo diferente de "voz sintetizada"');
  if (bruto.elenco !== undefined && typeof bruto.elenco !== 'boolean') return nao('elenco inválido');
  const f = bruto.formato;
  if (!ehObjeto(f)) return nao('formato inválido');
  const extraF = desconhecido(f, CAMPOS_DO_FORMATO);
  if (extraF) return nao(`campo desconhecido: ${extraF}`);
  if (f.codec !== 'opus' && f.codec !== 'aac') return nao('codec inválido');
  if (!Number.isInteger(f.kbps) || (f.kbps as number) <= 0) return nao('kbps inválido');
  if (f.canais !== 1) return nao('canais diferente de 1');
  if (!Array.isArray(bruto.capitulos)) return nao('capitulos inválido');
  let anterior: number | null = null;
  for (const c of bruto.capitulos) {
    const erro = validarCapitulo(c, anterior);
    if (erro) return nao(erro);
    anterior = (c as CapituloDeAudio).nn;
  }
  const capitulos = bruto.capitulos as CapituloDeAudio[];
  if (bruto.hashDoTexto !== hashDoLivroSincrono(capitulos.map((c) => c.hashDasFrases)))
    return nao('hashDoTexto não confere com os capítulos');
  return { ok: true, manifesto: bruto as unknown as ManifestoDeAudio };
}

/** As frases que o app montou para o capítulo `nn` são as mesmas (mesma ordem, mesmo texto) do áudio gerado? */
export async function frasesIntegras(
  m: ManifestoDeAudio,
  nn: number,
  frasesDoApp: readonly string[],
): Promise<boolean> {
  const c = m.capitulos.find((x) => x.nn === nn);
  if (!c || c.frases !== frasesDoApp.length) return false;
  return (await hashDasFrases(frasesDoApp)) === c.hashDasFrases;
}

/** `audiolivros/<livroId>/<voz>/<versao>/<nn>.<ext>` (`nn` com 2 dígitos). */
export function chaveDoCapitulo(
  m: Pick<ManifestoDeAudio, 'livroId' | 'voz'>,
  versao: number,
  nn: number,
  ext: 'opus' | 'json',
): string {
  return `audiolivros/${m.livroId}/${m.voz}/${versao}/${String(nn).padStart(2, '0')}.${ext}`;
}
