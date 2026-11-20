/**
 * DUBLÊ DO BINDING R2 (Fase 2, Task 7): um bucket em memória com a forma do `R2Bucket` do Worker —
 * `put`, `get` (com `range: { offset, length }`), `head`, `delete` e o multipart
 * (`createMultipartUpload` → `uploadPart`/`complete`/`abort`) — que REGISTRA cada chamada em `chamadas`,
 * na ordem, para os testes conferirem o protocolo (partes, aborto, faixa) e não só o resultado.
 *
 * `soTamanhos`: as partes do multipart guardam só o resumo (tamanho, primeiro byte, sha256), e o objeto
 * completado guarda só o tamanho. É o modo do upload de 120 MB simulado: o teste confere o protocolo sem
 * manter 120 MB vivos na memória. Nesse modo `get` de um objeto multipart devolve zeros do tamanho certo.
 *
 * `falharParte`: número da parte cujo `uploadPart` rejeita (o R2 caindo no meio do upload).
 */
import { createHash } from 'node:crypto'

import type { BucketR2, ObjetoR2, UploadMultipartR2 } from '../../../server/lib/armazenamentoR2'

export type ChamadaR2 =
  | { op: 'put'; chave: string; tamanho: number; contentType?: string }
  | { op: 'get'; chave: string; range?: { offset?: number; length?: number } }
  | { op: 'head'; chave: string }
  | { op: 'delete'; chave: string }
  | { op: 'createMultipartUpload'; chave: string; contentType?: string }
  | { op: 'uploadPart'; chave: string; numero: number; tamanho: number; primeiroByte: number; sha256: string }
  | { op: 'complete'; chave: string; partes: number[] }
  | { op: 'abort'; chave: string }

interface Guardado {
  bytes: Buffer | null
  tamanho: number
  contentType?: string
}

export interface DubleDoR2 extends BucketR2 {
  chamadas: ChamadaR2[]
  /** Conteúdo guardado (só fora do `soTamanhos`, ou para objetos gravados por `put`). */
  conteudo(chave: string): Buffer | undefined
  /** Chaves existentes. */
  chaves(): string[]
  /** Quantas chamadas de cada operação. */
  contar(op: ChamadaR2['op']): number
}

type Valor = ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob

async function paraBuffer(v: Valor): Promise<Buffer> {
  if (v === null) return Buffer.alloc(0)
  if (typeof v === 'string') return Buffer.from(v)
  if (v instanceof ArrayBuffer) return Buffer.from(v)
  if (ArrayBuffer.isView(v)) return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
  if (typeof Blob !== 'undefined' && v instanceof Blob) return Buffer.from(await v.arrayBuffer())
  const partes: Buffer[] = []
  const leitor = (v as ReadableStream<Uint8Array>).getReader()
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    partes.push(Buffer.from(value))
  }
  return Buffer.concat(partes)
}

function objeto(chave: string, g: Guardado, faixa?: { offset: number; length: number }): ObjetoR2 {
  const inteiro = g.bytes ?? Buffer.alloc(g.tamanho)
  const corpo = faixa ? inteiro.subarray(faixa.offset, faixa.offset + faixa.length) : inteiro
  return {
    key: chave,
    size: g.tamanho,
    httpMetadata: { contentType: g.contentType },
    body: new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(corpo))
        c.close()
      },
    }),
    arrayBuffer: async () => corpo.buffer.slice(corpo.byteOffset, corpo.byteOffset + corpo.byteLength) as ArrayBuffer,
  }
}

export function dubleDoR2(opts: { soTamanhos?: boolean; falharParte?: number } = {}): DubleDoR2 {
  const guardados = new Map<string, Guardado>()
  const chamadas: ChamadaR2[] = []

  return {
    chamadas,
    conteudo: (chave) => guardados.get(chave)?.bytes ?? undefined,
    chaves: () => [...guardados.keys()],
    contar: (op) => chamadas.filter((c) => c.op === op).length,

    async put(chave, valor, o) {
      const bytes = await paraBuffer(valor as Valor)
      const contentType = o?.httpMetadata?.contentType
      chamadas.push({ op: 'put', chave, tamanho: bytes.length, contentType })
      guardados.set(chave, { bytes, tamanho: bytes.length, contentType })
      return { key: chave, size: bytes.length }
    },

    async get(chave, o) {
      chamadas.push({ op: 'get', chave, ...(o?.range ? { range: { ...o.range } } : {}) })
      const g = guardados.get(chave)
      if (!g) return null
      if (!o?.range) return objeto(chave, g)
      const offset = o.range.offset ?? 0
      const length = Math.min(o.range.length ?? g.tamanho - offset, g.tamanho - offset)
      return objeto(chave, g, { offset, length })
    },

    async head(chave) {
      chamadas.push({ op: 'head', chave })
      const g = guardados.get(chave)
      return g ? { key: chave, size: g.tamanho, httpMetadata: { contentType: g.contentType } } : null
    },

    async delete(chave) {
      chamadas.push({ op: 'delete', chave })
      guardados.delete(chave)
    },

    async createMultipartUpload(chave, o) {
      const contentType = o?.httpMetadata?.contentType
      chamadas.push({ op: 'createMultipartUpload', chave, contentType })
      const partes = new Map<number, { bytes: Buffer | null; tamanho: number }>()
      let encerrado = false
      const upload: UploadMultipartR2 = {
        async uploadPart(numero, dado) {
          if (encerrado) throw new Error('upload multipart já encerrado')
          const bytes = await paraBuffer(dado as Valor)
          chamadas.push({
            op: 'uploadPart',
            chave,
            numero,
            tamanho: bytes.length,
            primeiroByte: bytes[0] ?? -1,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          })
          if (opts.falharParte === numero) throw new Error(`r2 dublê: falha na parte ${numero}`)
          partes.set(numero, { bytes: opts.soTamanhos ? null : bytes, tamanho: bytes.length })
          return { partNumber: numero, etag: `etag-${numero}` }
        },
        async complete(lista) {
          chamadas.push({ op: 'complete', chave, partes: lista.map((p) => p.partNumber) })
          encerrado = true
          const ordem = lista.map((p) => {
            const parte = partes.get(p.partNumber)
            if (!parte || p.etag !== `etag-${p.partNumber}`) throw new Error(`parte ${p.partNumber} inválida`)
            return parte
          })
          const tamanho = ordem.reduce((s, p) => s + p.tamanho, 0)
          const bytes = opts.soTamanhos ? null : Buffer.concat(ordem.map((p) => p.bytes as Buffer))
          guardados.set(chave, { bytes, tamanho, contentType })
          return { key: chave, size: tamanho }
        },
        async abort() {
          chamadas.push({ op: 'abort', chave })
          encerrado = true
          partes.clear()
        },
      }
      return upload
    },
  }
}
