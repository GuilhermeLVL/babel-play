/**
 * A ESTRUTURA DE UM TIPO DE NOTA — a chave que reconhece "já vi este tipo antes".
 *
 * O servidor calcula o mesmo hash ao gravar (`server/import/identidadeDaNota.ts:hashDaEstrutura`, com `node:crypto`). Aqui
 * está a versão PURA, para o navegador decidir o mapeamento ANTES do primeiro lote, sem WebCrypto assíncrono e sem Node. Os
 * dois TÊM de dar o mesmo resultado (`tests/anki-mapeador.test.ts` compara com 20 listas); se um mudar, o outro muda junto.
 */

/** Minúsculas, sem acento, separadores (espaço, hífen, sublinhado) colapsados num espaço. */
export function normalizarNomeDeCampo(nome: string): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, ' ');
}

/** UTF-8 sem `TextEncoder` (o núcleo não assume DOM nem Node). */
function utf8(texto: string): Uint8Array {
  const saida: number[] = [];
  for (const c of texto) {
    const p = c.codePointAt(0)!;
    if (p < 0x80) saida.push(p);
    else if (p < 0x800) saida.push(0xc0 | (p >> 6), 0x80 | (p & 63));
    else if (p < 0x10000) saida.push(0xe0 | (p >> 12), 0x80 | ((p >> 6) & 63), 0x80 | (p & 63));
    else saida.push(0xf0 | (p >> 18), 0x80 | ((p >> 12) & 63), 0x80 | ((p >> 6) & 63), 0x80 | (p & 63));
  }
  return Uint8Array.from(saida);
}

/** SHA-256 em JS puro (FIPS 180-4) sobre UTF-8; devolve hexadecimal. Só para entradas curtas (nomes de campo). */
function sha256Hex(texto: string): string {
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
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bytes = utf8(texto);
  const comprimento = bytes.length;
  const total = (((comprimento + 8) >> 6) + 1) << 6; // bytes + 0x80 + 8 do tamanho, em blocos de 64
  const bloco = new Uint8Array(total);
  bloco.set(bytes);
  bloco[comprimento] = 0x80;
  const visao = new DataView(bloco.buffer);
  visao.setUint32(total - 8, Math.floor((comprimento * 8) / 0x100000000), false);
  visao.setUint32(total - 4, (comprimento * 8) >>> 0, false);

  const W = new Uint32Array(64);
  const girar = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let inicio = 0; inicio < total; inicio += 64) {
    for (let i = 0; i < 16; i++) W[i] = visao.getUint32(inicio + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = girar(W[i - 15], 7) ^ girar(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = girar(W[i - 2], 17) ^ girar(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = girar(e, 6) ^ girar(e, 11) ^ girar(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = girar(a, 2) ^ girar(a, 13) ^ girar(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] += a;
    H[1] += b;
    H[2] += c;
    H[3] += d;
    H[4] += e;
    H[5] += f;
    H[6] += g;
    H[7] += h;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}

/**
 * Hash da estrutura: sha256 dos nomes normalizados, na ORDEM em que aparecem, 16 hex. A ordem entra de propósito (campos
 * iguais em ordem diferente são tipos diferentes), e o `mid` do Anki não entra (é local à coleção de origem).
 */
export function hashDaEstrutura(campos: string[]): string {
  return sha256Hex((campos ?? []).map(normalizarNomeDeCampo).join('|')).slice(0, 16);
}
