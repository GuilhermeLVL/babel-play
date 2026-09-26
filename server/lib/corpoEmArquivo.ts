/**
 * RECEPÇÃO DE CORPO EM ARQUIVO — o corpo do request vai para o disco em pedaços, sem nunca existir
 * inteiro na memória (fase 2 de prontidão, §2.3; ADR 0009: "proibido `express.raw` acima de 5 MB").
 *
 * Por que não `pipeline(req, arquivo)`: no erro, o `pipeline` DESTRÓI todos os streams, e destruir o
 * `IncomingMessage` derruba o socket — aí o 413 que explica o estouro nunca chega ao cliente. Aqui o
 * request só é PAUSADO; quem decide o que fazer com o resto (responder e descartar) é a rota.
 *
 * O teto é contado em BYTES RECEBIDOS, não no `Content-Length` declarado: o cabeçalho serve para
 * recusar cedo (ver `tamanhoDeclarado`), mas quem manda `Transfer-Encoding: chunked` não declara
 * nada, e é a contagem que segura esse caso.
 */
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

/** O corpo passou do teto. A rota responde 413. */
export class CorpoGrandeDemais extends Error {
  constructor(readonly limite: number) {
    super(`corpo acima de ${limite} bytes`)
    this.name = 'CorpoGrandeDemais'
  }
}

/** O cliente foi embora no meio do corpo. Não há a quem responder; a rota só limpa. */
export class CorpoInterrompido extends Error {
  constructor() {
    super('o cliente interrompeu o envio do corpo')
    this.name = 'CorpoInterrompido'
  }
}

/** Bytes guardados do início do corpo — os magic bytes que `detectarAudio` precisa ficam aqui. */
const TAMANHO_DA_CABECA = 64

export interface CorpoRecebido {
  bytes: number
  /** Os primeiros bytes do corpo, para detectar o tipo sem reler o arquivo. */
  cabeca: Buffer
}

/** `Content-Length` como número, ou `null` quando ausente/inválido (corpo `chunked`). */
export function tamanhoDeclarado(req: { headers: Record<string, string | string[] | undefined> }): number | null {
  const bruto = req.headers['content-length']
  if (typeof bruto !== 'string' || !/^\d+$/.test(bruto.trim())) return null
  return Number(bruto)
}

/**
 * De onde ler o corpo. Se algum middleware anterior JÁ bufferizou (ou numa chamada direta ao
 * handler), o Buffer vira um stream de um pedaço só e segue pelo mesmo caminho; senão, o próprio
 * request é o stream. O `{}` que o `express.json` deixa em `req.body` para outros tipos não conta.
 */
export function fonteDoCorpo(req: { body?: unknown }): Readable {
  if (Buffer.isBuffer(req.body)) return Readable.from([req.body])
  const r = req as unknown as Readable
  return typeof r.on === 'function' && typeof r.pause === 'function' ? r : Readable.from([])
}

/** Por quanto tempo o resto de um corpo RECUSADO é lido e jogado fora antes de a conexão cair. */
const PRAZO_DE_DESCARTE_MS = 10_000

/**
 * RECUSOU COM O CORPO AINDA CHEGANDO: descarta o resto, com prazo.
 *
 * Fechar a conexão na hora parece o barato, e não é: medido no Windows, o socket fechado com dado
 * não lido responde RST, e o cliente recebe `ECONNRESET` em vez do 413/429 que explica o motivo —
 * a resposta se perde junto. Então o resto é LIDO E DESCARTADO (sem acumular), para a resposta
 * chegar; e, para um `chunked` que nunca acaba não prender a conexão para sempre, depois de
 * `PRAZO_DE_DESCARTE_MS` o socket cai de qualquer jeito. É o "lingering close" do nginx.
 */
export function descartarRestoDoCorpo(req: Readable & { socket?: { destroy(): void } | null }): void {
  if (typeof req.resume !== 'function') return // chamada direta de teste: não há corpo chegando
  if (req.readableEnded) return // já chegou inteiro; um prazo aqui derrubaria a conexão keep-alive
  const prazo = setTimeout(() => req.socket?.destroy(), PRAZO_DE_DESCARTE_MS)
  prazo.unref?.()
  const soltar = () => clearTimeout(prazo)
  req.once('end', soltar)
  req.once('close', soltar)
  req.resume()
}

/**
 * Escreve `fonte` em `destino` (criado, nunca sobrescrito), contando bytes. Rejeita com
 * `CorpoGrandeDemais` ao passar de `limite` e com `CorpoInterrompido` se a fonte fechar antes do
 * fim; nos dois casos o arquivo parcial é apagado e a fonte fica PAUSADA, não destruída.
 */
export function receberCorpoEmArquivo(fonte: Readable, destino: string, limite: number): Promise<CorpoRecebido> {
  return new Promise<CorpoRecebido>((resolve, reject) => {
    const arquivo = createWriteStream(destino, { flags: 'wx' })
    const cabeca: Buffer[] = []
    let naCabeca = 0
    let bytes = 0
    let terminou = false
    let decidido = false

    const soltar = () => {
      fonte.off('data', aoDado)
      fonte.off('end', aoFim)
      fonte.off('close', aoFechar)
      fonte.off('error', aoErro)
    }
    const falhar = (err: Error) => {
      if (decidido) return
      decidido = true
      soltar()
      fonte.pause()
      arquivo.destroy()
      // O parcial sai SEMPRE: um 413 ou um abandono não pode deixar lixo ocupando o volume.
      arquivo.once('close', () => {
        void rm(destino, { force: true }).finally(() => reject(err))
      })
    }

    const aoDado = (pedaco: Buffer) => {
      bytes += pedaco.length
      if (bytes > limite) {
        falhar(new CorpoGrandeDemais(limite))
        return
      }
      if (naCabeca < TAMANHO_DA_CABECA) {
        cabeca.push(pedaco.subarray(0, TAMANHO_DA_CABECA - naCabeca))
        naCabeca += Math.min(pedaco.length, TAMANHO_DA_CABECA - naCabeca)
      }
      // Contrapressão: o disco dita o ritmo, não a rede. Sem isto o pedaço esperaria na memória.
      if (!arquivo.write(pedaco)) {
        fonte.pause()
        arquivo.once('drain', () => {
          if (!decidido) fonte.resume()
        })
      }
    }
    const aoFim = () => {
      terminou = true
      soltar()
      arquivo.end()
    }
    const aoFechar = () => {
      if (!terminou) falhar(new CorpoInterrompido())
    }
    const aoErro = () => falhar(new CorpoInterrompido())

    arquivo.once('error', (err) => falhar(err))
    arquivo.once('finish', () => {
      if (decidido) return
      decidido = true
      resolve({ bytes, cabeca: Buffer.concat(cabeca) })
    })

    fonte.on('data', aoDado)
    fonte.once('end', aoFim)
    fonte.once('close', aoFechar)
    fonte.once('error', aoErro)
    fonte.resume()
  })
}

/**
 * PARA OS PARSERS QUE EXIGEM BUFFER (o JSZip do `.apkg`, o pdf/docx do documento): o corpo passa
 * pelo disco e volta como UM Buffer do tamanho exato.
 *
 * Não tira o corpo da memória — o parser precisa dele inteiro —, mas corta o pico pela metade: o
 * `express.raw` guardava a lista de pedaços E o `Buffer.concat` deles ao mesmo tempo (2× o corpo),
 * e aqui só existe o Buffer final. Com o semáforo, esse 1× também deixa de se multiplicar.
 */
export async function lerCorpoViaArquivo(req: { body?: unknown }, limite: number): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > limite) throw new CorpoGrandeDemais(limite)
    return req.body
  }
  const dir = await mkdtemp(join(tmpdir(), 'babel-corpo-'))
  try {
    const caminho = join(dir, 'corpo')
    const { bytes } = await receberCorpoEmArquivo(fonteDoCorpo(req), caminho, limite)
    return bytes ? await readFile(caminho) : Buffer.alloc(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
