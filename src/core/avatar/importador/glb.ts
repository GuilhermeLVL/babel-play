/**
 * LEITURA E ESCRITA DE GLB (o contêiner binário do glTF 2.0) para o "traga o seu".
 *
 * Núcleo puro: sem DOM, sem rede, sem `TextDecoder`/`TextEncoder`/`URL` globais (o UTF-8 é feito aqui), e NUNCA
 * decodifica imagem. Porte do protótipo `glb.mjs` (ramo `proto/avatar-libras-fontes`).
 *
 * A leitura avança `ini + len` por bloco, SEM preenchimento, como o `GLTFLoader` do three.js: o que validamos é o
 * que renderizamos (há VRMs reais cujo bloco JSON não tem padding, o que o validador da Khronos reprova como
 * `GLB_CHUNK_LENGTH_UNALIGNED`; ver `validar.ts`).
 */

export type CodigoDeErroGlb =
  | 'glb_curto'
  | 'sem_magic'
  | 'versao_glb'
  | 'glb_truncado'
  | 'chunk_fora'
  | 'json_grande'
  | 'json_utf8'
  | 'json_invalido'
  | 'sem_json';

export class ErroDeGlb extends Error {
  constructor(
    readonly codigo: CodigoDeErroGlb,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroDeGlb';
  }
}

const MAGIC = 0x46546c67; // "glTF", little-endian
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
export const TETO_JSON_BYTES = 4 * 1024 * 1024;

export type Bytes = Uint8Array;
export type Json = Record<string, unknown>;

export function temMagicGlb(bytes: Bytes): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
}

/** UTF-8 ESTRITO (byte inválido, sequência curta, excesso ou substituto lançam). */
export function decodificarUtf8(b: Bytes): string {
  const partes: string[] = [];
  let lote: number[] = [];
  const erro = () => new ErroDeGlb('json_utf8', 'O texto do modelo não é UTF-8 válido.');
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    let cp: number;
    if (c < 0x80) {
      cp = c;
      i += 1;
    } else if (c >= 0xc2 && c <= 0xdf) {
      if (i + 1 >= b.length || (b[i + 1] & 0xc0) !== 0x80) throw erro();
      cp = ((c & 0x1f) << 6) | (b[i + 1] & 0x3f);
      i += 2;
    } else if (c >= 0xe0 && c <= 0xef) {
      if (i + 2 >= b.length || (b[i + 1] & 0xc0) !== 0x80 || (b[i + 2] & 0xc0) !== 0x80) throw erro();
      cp = ((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f);
      if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) throw erro();
      i += 3;
    } else if (c >= 0xf0 && c <= 0xf4) {
      if (i + 3 >= b.length || (b[i + 1] & 0xc0) !== 0x80 || (b[i + 2] & 0xc0) !== 0x80 || (b[i + 3] & 0xc0) !== 0x80)
        throw erro();
      cp = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f);
      if (cp < 0x10000 || cp > 0x10ffff) throw erro();
      i += 4;
    } else throw erro();
    lote.push(cp);
    if (lote.length >= 8192) {
      partes.push(String.fromCodePoint(...lote));
      lote = [];
    }
  }
  if (lote.length) partes.push(String.fromCodePoint(...lote));
  return partes.join('');
}

export function codificarUtf8(texto: string): Bytes {
  const saida: number[] = [];
  for (const ch of texto) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) saida.push(cp);
    else if (cp < 0x800) saida.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) saida.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else saida.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(saida);
}

const clonar = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Lê cabeçalho e blocos. `bin` é uma vista (sem cópia) ou `null`. */
export function lerGlb(bytes: Bytes): { json: Json; bin: Bytes | null } {
  if (bytes.byteLength < 20) throw new ErroDeGlb('glb_curto', 'Arquivo pequeno demais para ser um GLB.');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new ErroDeGlb('sem_magic', 'O arquivo não começa com "glTF".');
  if (dv.getUint32(4, true) !== 2) throw new ErroDeGlb('versao_glb', 'Só GLB versão 2 é aceito.');
  const total = dv.getUint32(8, true);
  if (total > bytes.byteLength)
    throw new ErroDeGlb('glb_truncado', 'O tamanho declarado no cabeçalho é maior que o arquivo.');
  let off = 12;
  let json: unknown = null;
  let bin: Bytes | null = null;
  while (off + 8 <= total) {
    const len = dv.getUint32(off, true);
    const tipo = dv.getUint32(off + 4, true);
    const ini = off + 8;
    if (ini + len > total) throw new ErroDeGlb('chunk_fora', 'Um bloco do GLB passa do fim do arquivo.');
    if (tipo === CHUNK_JSON && json === null) {
      if (len > TETO_JSON_BYTES)
        throw new ErroDeGlb('json_grande', `O JSON do modelo tem ${len} bytes (teto ${TETO_JSON_BYTES}).`);
      const texto = decodificarUtf8(bytes.subarray(ini, ini + len));
      try {
        json = JSON.parse(texto);
      } catch {
        throw new ErroDeGlb('json_invalido', 'O JSON do modelo está inválido.');
      }
    } else if (tipo === CHUNK_BIN && bin === null) {
      bin = bytes.subarray(ini, ini + len);
    }
    off = ini + len; // exatamente ini + len, sem padding (ver o cabeçalho do arquivo)
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json))
    throw new ErroDeGlb('sem_json', 'GLB sem bloco JSON válido.');
  return { json: json as Json, bin };
}

/** Monta um GLB a partir de JSON e binário (fixtures dos testes e redução de textura). */
export function montarGlb(json: Json, bin: Bytes | null): Bytes {
  const jb = codificarUtf8(JSON.stringify(json));
  const jpad = (4 - (jb.length % 4)) % 4;
  const jfinal = new Uint8Array(jb.length + jpad).fill(0x20);
  jfinal.set(jb);
  const temBin = !!bin && bin.byteLength > 0;
  const bpad = temBin ? (4 - ((bin as Bytes).byteLength % 4)) % 4 : 0;
  const total = 12 + 8 + jfinal.length + (temBin ? 8 + (bin as Bytes).byteLength + bpad : 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jfinal.length, true);
  dv.setUint32(16, CHUNK_JSON, true);
  out.set(jfinal, 20);
  if (temBin) {
    const b = bin as Bytes;
    const o = 20 + jfinal.length;
    dv.setUint32(o, b.byteLength + bpad, true);
    dv.setUint32(o + 4, CHUNK_BIN, true);
    out.set(b, o + 8);
  }
  return out;
}

export interface TrocaDeImagem {
  bytes: Bytes;
  mimeType: string;
}

interface Vista {
  buffer?: number;
  byteOffset?: number;
  byteLength: number;
}

/**
 * Troca o conteúdo de imagens (por índice em `images`) e recompacta o binário: cada bufferView vai para um buffer
 * único, alinhado a 4 bytes. Só vale para GLB com um buffer sem `uri` (já garantido pela validação).
 */
export function reescreverImagens(
  json: Json,
  bin: Bytes,
  trocas: Map<number, TrocaDeImagem>,
): { json: Json; bin: Bytes; glb: Bytes } {
  const novoJson = clonar(json);
  const vistas = (novoJson.bufferViews ?? []) as Vista[];
  const imagens = (novoJson.images ?? []) as Array<{ bufferView: number; mimeType?: string }>;
  const porVista = new Map<number, TrocaDeImagem>();
  for (const [i, t] of trocas) {
    const img = imagens[i];
    porVista.set(img.bufferView, t);
    img.mimeType = t.mimeType;
  }
  const partes: Bytes[] = [];
  let pos = 0;
  vistas.forEach((v, idx) => {
    const t = porVista.get(idx);
    const dados = t ? t.bytes : bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    const pad = (4 - (pos % 4)) % 4;
    if (pad) {
      partes.push(new Uint8Array(pad));
      pos += pad;
    }
    v.buffer = 0;
    v.byteOffset = pos;
    v.byteLength = dados.byteLength;
    partes.push(dados);
    pos += dados.byteLength;
  });
  const novoBin = new Uint8Array(pos);
  let o = 0;
  for (const p of partes) {
    novoBin.set(p, o);
    o += p.byteLength;
  }
  novoJson.buffers = [{ byteLength: novoBin.byteLength }];
  return { json: novoJson, bin: novoBin, glb: montarGlb(novoJson, novoBin) };
}
