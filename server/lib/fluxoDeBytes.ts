/**
 * BYTES EM STREAM — módulo FOLHA (sem dependências do app) com o que o seam de armazenamento e os
 * back-ends (`armazenamento.ts`, `armazenamentoR2.ts`) dividem: o tipo do fluxo, o corte em partes do
 * multipart e o erro de nome inválido. Existe para os dois não se importarem em ciclo.
 */

/**
 * Nome de arquivo/objeto recusado (S-14). Classe própria para quem SOMA tamanhos (a reconciliação da
 * cota) poder pular só este caso e deixar qualquer outra falha do store subir.
 */
export class NomeDeArquivoInvalido extends Error {}

/**
 * Bytes em stream, venham do Node (`Readable`, gerador) ou da web (`ReadableStream`, o corpo do request
 * num Worker).
 */
export type FluxoDeBytes = AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>

/** Itera qualquer `FluxoDeBytes`. O `ReadableStream` vai pelo leitor (o iterador assíncrono dele não é garantido em todo runtime). */
export async function* iterarBytes(fluxo: FluxoDeBytes): AsyncGenerator<Uint8Array> {
  if (typeof (fluxo as ReadableStream).getReader !== 'function') {
    yield* fluxo as AsyncIterable<Uint8Array>
    return
  }
  const leitor = (fluxo as ReadableStream<Uint8Array>).getReader()
  let acabou = false
  try {
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) {
        acabou = true
        return
      }
      yield value
    }
  } finally {
    // Saída antecipada (erro de quem consome): o stream é cancelado em vez de ficar preso.
    if (!acabou) await leitor.cancel().catch(() => {})
  }
}

/**
 * Corta um fluxo em partes de EXATAMENTE `tamanho` bytes, menos a última (que pode ser menor e não sai
 * vazia). É a forma que o multipart pede (R2 e S3: partes uniformes, a última livre). Só uma parte
 * existe na memória por vez.
 */
export async function* emPartes(fluxo: FluxoDeBytes, tamanho: number): AsyncGenerator<Buffer> {
  let pedacos: Buffer[] = []
  let juntos = 0
  for await (const p of iterarBytes(fluxo)) {
    let resto = Buffer.from(p.buffer, p.byteOffset, p.byteLength)
    while (juntos + resto.length >= tamanho) {
      const falta = tamanho - juntos
      pedacos.push(resto.subarray(0, falta))
      yield Buffer.concat(pedacos, tamanho)
      pedacos = []
      juntos = 0
      resto = resto.subarray(falta)
    }
    if (resto.length) {
      // Cópia: quem produziu o pedaço (o gerador do teste, o socket) pode reaproveitar o buffer.
      pedacos.push(Buffer.from(resto))
      juntos += resto.length
    }
  }
  if (juntos) yield Buffer.concat(pedacos, juntos)
}
