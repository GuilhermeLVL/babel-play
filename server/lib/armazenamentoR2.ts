/**
 * ARMAZENAMENTO NO R2 POR BINDING (Fase 2, Task 7) — o back-end do seam (`armazenamento.ts`) para o
 * Cloudflare Worker.
 *
 * No Worker não há disco: o upload não pode passar por `mkdtemp`, e o cliente S3 (SigV4 sobre `fetch`)
 * seria uma volta desnecessária — o binding `R2Bucket` fala com o bucket direto, sem credencial no
 * código. Ordem de preferência em `armazenamentoDoAmbiente`: binding → S3 → disco.
 *
 * O tipo do bucket é ESTRUTURAL (`BucketR2`, só o que este módulo usa) e não o `R2Bucket` de
 * `@cloudflare/workers-types`: puxar os tipos de Workers para o tsconfig da raiz conflita com as libs de
 * DOM e Node que o resto do projeto usa. O `env.MIDIA` do Worker satisfaz esta interface.
 *
 * UPLOAD EM STREAM (`gravarDeStream`): o corpo é cortado em partes de 5 MiB (`emPartes`). Se ele acaba
 * antes de encher a primeira, é um `put` só; senão, multipart — `createMultipartUpload`, uma
 * `uploadPart` por parte (todas de 5 MiB exceto a última, como o R2 exige; 120 MB = 24 partes, longe do
 * máximo de 10 000), `complete`. Qualquer erro no meio (o cliente caiu, o corpo passou do teto, o R2
 * recusou uma parte) chama `abort`: as partes já enviadas não ficam cobrando armazenamento, e o objeto
 * anterior com o mesmo nome continua intacto (o multipart só substitui no `complete`). Memória: uma
 * parte (5 MiB) por upload em voo.
 */
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'

import type { Armazenamento } from './armazenamento'
import { emPartes, NomeDeArquivoInvalido } from './fluxoDeBytes'
import { log } from './logger'
import { temDisco } from './runtime'

/** Tamanho de cada parte do multipart (o mínimo do R2 para as que não são a última). */
const TAMANHO_DA_PARTE = 5 * 1024 * 1024

type CorpoR2 = ReadableStream | ArrayBuffer | ArrayBufferView | string | null

interface OpcoesDeGravacaoR2 {
  httpMetadata?: { contentType?: string }
}

/** O que `head` devolve (o `R2Object`): só o que o seam usa. */
export interface CabecalhoR2 {
  key: string
  size: number
  httpMetadata?: { contentType?: string }
}

/** O que `get` devolve (o `R2ObjectBody`). */
export interface ObjetoR2 extends CabecalhoR2 {
  body: ReadableStream<Uint8Array>
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface ParteEnviadaR2 {
  partNumber: number
  etag: string
}

export interface UploadMultipartR2 {
  uploadPart(numero: number, dado: CorpoR2): Promise<ParteEnviadaR2>
  complete(partes: ParteEnviadaR2[]): Promise<unknown>
  abort(): Promise<void>
}

/** O binding `R2Bucket`, estrutural: só os métodos que o seam chama. */
export interface BucketR2 {
  put(chave: string, valor: CorpoR2, opcoes?: OpcoesDeGravacaoR2): Promise<unknown>
  get(chave: string, opcoes?: { range?: { offset?: number; length?: number } }): Promise<ObjetoR2 | null>
  head(chave: string): Promise<CabecalhoR2 | null>
  delete(chave: string): Promise<void>
  createMultipartUpload(chave: string, opcoes?: OpcoesDeGravacaoR2): Promise<UploadMultipartR2>
}

/* O BINDING LIGADO PELO PONTO DE ENTRADA. No Worker o `env` só existe dentro do `fetch`, e quem escolhe o
   armazenamento (`armazenamentoDoAmbiente`) é chamado de longe dele — rotas, cota, jobs. O `worker.ts`
   (Task 12) liga o `env.MIDIA` aqui na primeira requisição; o binding é o mesmo durante a vida do
   isolate. No Node ninguém liga e vale `null` (S3 ou disco, como sempre). */
let bucketLigado: BucketR2 | null = null

/** Liga (ou desliga, com `null`) o binding R2 que `armazenamentoDoAmbiente` passa a preferir. */
export function ligarBucketDoR2(bucket: BucketR2 | null): void {
  /* Religar com OUTRO bucket é suspeito (o binding é um só na vida do isolate) e quem já memoizou o
     store (as rotas de sessões) continua no antigo: avisa, não troca em silêncio. */
  if (bucket && bucketLigado && bucket !== bucketLigado) {
    log('warn', {
      event: 'r2_binding_religado',
      error: 'binding R2 religado com outro bucket; stores já criados seguem no anterior',
    })
  }
  bucketLigado = bucket
}

/** O binding R2 ligado pelo ponto de entrada, ou `null`. */
export function bucketDoR2Ligado(): BucketR2 | null {
  return bucketLigado
}

/** A mesma regra sintática do adaptador S3: nada de `..` nem caminho absoluto como chave. */
function chaveValida(nome: string): string {
  if (nome.includes('..') || nome.startsWith('/')) throw new NomeDeArquivoInvalido('nome de objeto inválido')
  return nome
}

export function armazenamentoR2(bucket: BucketR2): Armazenamento {
  const meta = (contentType: string): OpcoesDeGravacaoR2 => ({ httpMetadata: { contentType } })

  const gravarDeStream: Armazenamento['gravarDeStream'] = async (nome, fluxo, contentType, _tamanho, opcoes) => {
    const chave = chaveValida(nome)
    // Antes de CADA operação cobrada (put, create, parte, complete): é onde o teto do R2 conta e recusa.
    const operar = async () => opcoes?.aoOperar?.()
    let upload: UploadMultipartR2 | null = null
    const enviadas: ParteEnviadaR2[] = []
    try {
      for await (const parte of emPartes(fluxo, TAMANHO_DA_PARTE)) {
        if (!upload) {
          // A primeira parte não encheu: o corpo inteiro cabe nela, e um `put` basta.
          if (parte.length < TAMANHO_DA_PARTE) {
            await operar()
            await bucket.put(chave, parte, meta(contentType))
            return
          }
          await operar()
          upload = await bucket.createMultipartUpload(chave, meta(contentType))
        }
        await operar()
        enviadas.push(await upload.uploadPart(enviadas.length + 1, parte))
      }
      if (!upload) {
        await operar()
        await bucket.put(chave, new Uint8Array(0), meta(contentType))
        return
      }
      await operar()
      await upload.complete(enviadas)
    } catch (err) {
      // O erro que importa é o original; uma falha do `abort` só iria escondê-lo.
      if (upload) await upload.abort().catch(() => {})
      throw err
    }
  }

  return {
    tipo: 'r2',
    async gravar(nome, bytes, contentType) {
      await bucket.put(chaveValida(nome), bytes, meta(contentType))
    },
    gravarDeStream,
    /* Só existe com disco (Node com o binding — hoje só em teste; no Worker não há arquivo local para
       ler). O arquivo segue em stream pelo mesmo caminho do upload. */
    async gravarDeArquivo(nome, caminho, contentType) {
      if (!temDisco()) throw new Error('gravarDeArquivo indisponível sem disco: use gravarDeStream')
      chaveValida(nome)
      await gravarDeStream(nome, createReadStream(caminho), contentType)
    },
    async ler(nome) {
      const obj = await bucket.get(chaveValida(nome))
      if (!obj) throw new Error('r2 GET: objeto ausente')
      return Buffer.from(await obj.arrayBuffer())
    },
    /** A faixa FECHADA `[inicio, fim]` vira `{ offset, length }`: quem recorta é o R2, não o isolate. */
    async lerFaixa(nome, inicio, fim) {
      const obj = await bucket.get(chaveValida(nome), { range: { offset: inicio, length: fim - inicio + 1 } })
      if (!obj) throw new Error('r2 GET faixa: objeto ausente')
      return Readable.fromWeb(obj.body as Parameters<typeof Readable.fromWeb>[0])
    },
    async remover(nome) {
      // `delete` de chave ausente não é erro no R2: o objetivo é que ela não exista.
      await bucket.delete(chaveValida(nome))
    },
    async tamanho(nome) {
      return (await bucket.head(chaveValida(nome)))?.size ?? null
    },
    /* HEAD numa chave que ninguém grava: `null` é o caso normal e passa; o binding quebrado lança. */
    async sondar() {
      await bucket.head('__sonda-de-prontidao__')
    },
  }
}
