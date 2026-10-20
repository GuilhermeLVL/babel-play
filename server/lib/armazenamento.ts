import { createHash, createHmac, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { armazenamentoR2, bucketDoR2Ligado, type BucketR2 } from './armazenamentoR2'
import { comTetoDeOperacoes, lerTetoDoR2 } from './tetoDoR2'

/**
 * Bytes em stream, venham do Node (`Readable`, gerador) ou da web (`ReadableStream`, o corpo do request
 * num Worker).
 */
export type FluxoDeBytes = AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>

/** Itera qualquer `FluxoDeBytes`. O `ReadableStream` vai pelo leitor (o iterador assíncrono dele não é garantido em todo runtime). */
async function* iterarBytes(fluxo: FluxoDeBytes): AsyncGenerator<Uint8Array> {
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

/**
 * Seam de armazenamento de mídia (F5-02).
 *
 * A mídia é 33× o banco (176,9 MB vs 5,3 MB por usuário; ~173 GB projetados para 1.000).
 * O ADR 001 decidiu object storage — este é o único ponto que precisa saber disso.
 */
export interface Armazenamento {
  readonly tipo: 'arquivos' | 's3' | 'r2'
  gravar(nome: string, bytes: Buffer, contentType: string): Promise<void>
  /**
   * Grava a partir de um STREAM, sem disco e sem o corpo inteiro na memória (Fase 2, Task 7). É o
   * caminho do upload num Worker: o corpo do request segue direto para o bucket.
   *
   * Disco: temporário ao lado do alvo + `rename` (um erro no meio não deixa nada). S3 e R2: abaixo de
   * 5 MiB um PUT só; acima, multipart em partes de 5 MiB, com `abort` em qualquer erro. O erro do
   * próprio fluxo (cliente caiu, corpo acima do teto) sobe como veio, para a rota responder por ele.
   *
   * `tamanho` é só uma dica de quem sabe o tamanho (o `Content-Length`); nenhum back-end depende dela.
   */
  gravarDeStream(nome: string, fluxo: FluxoDeBytes, contentType: string, tamanho?: number): Promise<void>
  /**
   * Grava a partir de um ARQUIVO LOCAL, sem carregá-lo na memória (fase 2 de prontidão, §2.3).
   *
   * É o caminho dos uploads grandes: o corpo já foi para o disco em pedaços (`corpoRecebido.ts`),
   * e daqui ele segue em stream. No filesystem o arquivo é MOVIDO (mesmo volume: `rename`, sem
   * cópia); no S3 ele é lido duas vezes em stream (hash do SigV4, depois o PUT). Em qualquer caso
   * quem chamou continua dono de apagar `caminho` — `rm({ force: true })` cobre o arquivo movido.
   */
  gravarDeArquivo(nome: string, caminho: string, contentType: string): Promise<void>
  ler(nome: string): Promise<Buffer>
  remover(nome: string): Promise<void>
  tamanho(nome: string): Promise<number | null>
  /**
   * Faixa FECHADA `[inicio, fim]`, em bytes — é o que sustenta o `Range` do `<audio>` (achado D1).
   * Existe no seam porque as duas pontas resolvem isso de forma incompatível: filesystem abre o
   * arquivo já posicionado, S3 pede a faixa ao servidor. Sem isto, ligar o seam custaria o seek.
   */
  lerFaixa(nome: string, inicio: number, fim: number): Promise<Readable>
  /**
   * O armazenamento ATENDE agora? (Fase 5, para o `GET /api/ready`.)
   *
   * Não é `tamanho()` com outro nome, e a diferença é o que motivou o método existir: `tamanho()`
   * devolve `null` para QUALQUER resposta não-ok do S3 — inclusive `403`, que é credencial errada,
   * e `404`, que é o objeto não existir. Uma readiness construída sobre ele daria "pronto" para
   * uma instância que não consegue gravar mídia nenhuma. `sondar()` separa os dois: objeto ausente
   * é o caso NORMAL (é uma chave que ninguém grava) e passa; recusa de autorização e falha de rede
   * lançam.
   *
   * Lança em vez de devolver booleano porque a CAUSA é o que o operador precisa ver no log — um
   * `false` mandaria ele adivinhar entre credencial, rede, bucket e permissão.
   */
  sondar(): Promise<void>
}

/* ─────────────────────────── filesystem ─────────────────────────── */

/**
 * Nome de arquivo/objeto recusado (S-14). Classe própria para quem SOMA tamanhos (a reconciliação da
 * cota) poder pular só este caso e deixar qualquer outra falha do store subir.
 */
export class NomeDeArquivoInvalido extends Error {}

/** Recusa nome que escape do diretório (S-14). */
export function resolverDentroDe(base: string, nome: string): string {
  const raiz = path.resolve(base)
  const alvo = path.resolve(raiz, nome)
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) {
    throw new NomeDeArquivoInvalido('caminho fora do diretório permitido')
  }
  return alvo
}

export function armazenamentoDeArquivos(dir: string): Armazenamento {
  return {
    tipo: 'arquivos',
    async gravar(nome, bytes) {
      await mkdir(dir, { recursive: true })
      await writeFile(resolverDentroDe(dir, nome), bytes)
    },
    async gravarDeArquivo(nome, caminho) {
      const alvo = resolverDentroDe(dir, nome)
      await mkdir(dir, { recursive: true })
      try {
        await rename(caminho, alvo)
      } catch (err) {
        // Volumes diferentes (temporário fora do `AUDIO_DIR`): copia. Qualquer outro erro sobe.
        if ((err as NodeJS.ErrnoException)?.code !== 'EXDEV') throw err
        await copyFile(caminho, alvo)
      }
    },
    async gravarDeStream(nome, fluxo) {
      const alvo = resolverDentroDe(dir, nome)
      await mkdir(dir, { recursive: true })
      const temporario = `${alvo}.${randomUUID()}.parcial`
      try {
        await pipeline(Readable.from(iterarBytes(fluxo)), createWriteStream(temporario, { flags: 'wx' }))
        await rename(temporario, alvo)
      } catch (err) {
        await rm(temporario, { force: true })
        throw err
      }
    },
    ler: (nome) => readFile(resolverDentroDe(dir, nome)),
    async lerFaixa(nome, inicio, fim) {
      return createReadStream(resolverDentroDe(dir, nome), { start: inicio, end: fim })
    },
    remover: (nome) => rm(resolverDentroDe(dir, nome), { force: true }),
    /* No filesystem a pergunta é se o diretório é GRAVÁVEL, e não se existe: no container o
       `/data` é um volume montado e o processo roda como `node` — o modo de falha real medido
       nesta base é EACCES, não ENOENT (ver o diário de erros em `server.ts`). `mkdir` recursivo
       cria o que faltar e falha alto no que não pode. */
    async sondar() {
      await mkdir(dir, { recursive: true })
      await stat(dir)
    },
    async tamanho(nome) {
      try {
        return (await stat(resolverDentroDe(dir, nome))).size
      } catch {
        return null
      }
    },
  }
}

/* ─────────────────────────── S3 / R2 ─────────────────────────── */

export interface ConfigS3 {
  endpoint: string
  bucket: string
  regiao: string
  accessKeyId: string
  secretAccessKey: string
}

const sha256 = (v: string | Buffer) => createHash('sha256').update(v).digest('hex')
const hmac = (chave: Buffer | string, dado: string) => createHmac('sha256', chave).update(dado).digest()

/** sha256 de um arquivo, lido em pedaços — o corpo grande nunca fica inteiro na memória. */
async function sha256DoArquivo(caminho: string): Promise<string> {
  const h = createHash('sha256')
  for await (const pedaco of createReadStream(caminho)) h.update(pedaco as Buffer)
  return h.digest('hex')
}

/**
 * Assinatura SigV4. Exportada para o teste conseguir conferi-la sem bucket real.
 *
 * `hashDoCorpo`, quando dado, substitui o hash de `corpo`: é como o PUT em stream assina um corpo
 * que não está na memória (o hash foi calculado lendo o arquivo — o upload de áudio).
 * Presente, `corpo` é ignorado. A assinatura resultante é a MESMA
 * que sairia do corpo inteiro — o teste confere isso.
 */
export function assinarSigV4(opts: {
  metodo: string
  url: URL
  corpo?: Buffer | string
  hashDoCorpo?: string
  contentType?: string
  cfg: ConfigS3
  agora: Date
}): Record<string, string> {
  const { metodo, url, corpo = '', contentType, cfg, agora } = opts
  const carimbo = agora
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  const dia = carimbo.slice(0, 8)
  const hashDoCorpo = opts.hashDoCorpo ?? sha256(corpo)

  const cabecalhos: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': hashDoCorpo,
    'x-amz-date': carimbo,
  }
  if (contentType) cabecalhos['content-type'] = contentType

  const nomes = Object.keys(cabecalhos).sort()
  const canonicos = nomes.map((n) => `${n}:${cabecalhos[n]}\n`).join('')
  const assinados = nomes.join(';')

  const requisicaoCanonica = [
    metodo,
    url.pathname,
    url.searchParams.toString(),
    canonicos,
    assinados,
    hashDoCorpo,
  ].join('\n')

  const escopo = `${dia}/${cfg.regiao}/s3/aws4_request`
  const paraAssinar = ['AWS4-HMAC-SHA256', carimbo, escopo, sha256(requisicaoCanonica)].join('\n')

  const chave = hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, dia), cfg.regiao), 's3'), 'aws4_request')
  const assinatura = createHmac('sha256', chave).update(paraAssinar).digest('hex')

  return {
    ...cabecalhos,
    authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${escopo}, SignedHeaders=${assinados}, Signature=${assinatura}`,
  }
}

/**
 * PRAZO DAS CHAMADAS AO S3 (fase 2 de prontidão, §2.3). Antes não havia nenhum: um R2 lento ou
 * mudo pendurava o upload — e, com o semáforo de corpos grandes, pendurava a VAGA junto, travando
 * os envios do usuário até o processo reiniciar.
 *
 * O prazo cobre até os CABEÇALHOS da resposta, não a leitura do corpo: o `lerFaixa` devolve o
 * corpo em stream para um `<audio>` que pode ler devagar por minutos, e cortá-lo no meio seria
 * quebrar o seek que ele existe para sustentar. No PUT o corpo vai ANTES da resposta, então o
 * envio inteiro está dentro do prazo — por isso ele cresce com o tamanho (piso de 1 MB/s).
 */
const PRAZO_BASE_MS = 30_000
const MS_POR_MB_ENVIADO = 1_000
const prazoDoPut = (base: number, bytes: number) => base + Math.ceil(bytes / (1024 * 1024)) * MS_POR_MB_ENVIADO
/** Parte do multipart do S3 (o mínimo para as que não são a última; o mesmo do binding). */
const TAMANHO_DA_PARTE_S3 = 5 * 1024 * 1024

export function armazenamentoS3(
  cfg: ConfigS3,
  buscar: typeof fetch = fetch,
  opcoes: { prazoMs?: number } = {},
): Armazenamento {
  const prazoBase = opcoes.prazoMs ?? PRAZO_BASE_MS
  const urlDe = (nome: string) => {
    if (nome.includes('..') || nome.startsWith('/')) throw new NomeDeArquivoInvalido('nome de objeto inválido')
    return new URL(`/${cfg.bucket}/${encodeURIComponent(nome)}`, cfg.endpoint)
  }

  const chamar = async (
    metodo: string,
    nome: string,
    o: {
      corpo?: Buffer | string
      /** Corpo em stream (PUT de arquivo): o hash e o tamanho vêm de quem leu o arquivo. */
      fluxo?: { stream: NodeJS.ReadableStream; hashDoCorpo: string; tamanho: number }
      contentType?: string
      // Cabeçalhos NÃO assinados (SigV4 só exige os que estão em `SignedHeaders`) — hoje só `range`.
      extras?: Record<string, string>
      /**
       * Query string do multipart (`uploads`, `partNumber`, `uploadId`). As chaves vêm já em ordem
       * alfabética — a requisição canônica do SigV4 usa `url.searchParams` como está. A codificação do
       * `URLSearchParams` coincide com a do SigV4 para os caracteres de um `uploadId` (`+`, `/`, `=`).
       */
      consulta?: Record<string, string>
      prazoMs?: number
    } = {},
  ) => {
    const url = urlDe(nome)
    for (const [k, v] of Object.entries(o.consulta ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
      url.searchParams.set(k, v)
    }
    const corpo = o.corpo ?? ''
    const headers = assinarSigV4({
      metodo,
      url,
      corpo,
      hashDoCorpo: o.fluxo?.hashDoCorpo,
      contentType: o.contentType,
      cfg,
      agora: new Date(),
    })
    const semCorpo = metodo === 'GET' || metodo === 'HEAD' || metodo === 'DELETE'
    // `content-length` explícito: com corpo em stream o fetch mandaria `chunked`, que o R2 recusa.
    const extras = o.fluxo ? { ...o.extras, 'content-length': String(o.fluxo.tamanho) } : o.extras
    const controle = new AbortController()
    const prazo = o.prazoMs ?? prazoBase
    const relogio = setTimeout(() => controle.abort(new Error(`s3 ${metodo} sem resposta em ${prazo} ms`)), prazo)
    try {
      return await buscar(url.toString(), {
        method: metodo,
        headers: extras ? { ...headers, ...extras } : headers,
        body: semCorpo ? undefined : ((o.fluxo?.stream ?? corpo) as BodyInit),
        signal: controle.signal,
        // Obrigatório no fetch do Node para corpo em stream.
        ...(o.fluxo ? { duplex: 'half' } : {}),
      } as RequestInit)
    } finally {
      clearTimeout(relogio)
    }
  }

  const s3: Armazenamento = {
    tipo: 's3',
    async gravar(nome, bytes, contentType) {
      const r = await chamar('PUT', nome, { corpo: bytes, contentType, prazoMs: prazoDoPut(prazoBase, bytes.length) })
      if (!r.ok) throw new Error(`s3 PUT ${r.status}`)
    },
    async gravarDeArquivo(nome, caminho, contentType) {
      urlDe(nome) // nome inválido falha ANTES de ler o arquivo para o hash
      const { size } = await stat(caminho)
      const hashDoCorpo = await sha256DoArquivo(caminho)
      const r = await chamar('PUT', nome, {
        fluxo: { stream: createReadStream(caminho), hashDoCorpo, tamanho: size },
        contentType,
        prazoMs: prazoDoPut(prazoBase, size),
      })
      if (!r.ok) throw new Error(`s3 PUT ${r.status}`)
    },
    /**
     * STREAM NO S3 — decisão (Task 7): MULTIPART ASSINADO PARTE A PARTE, e não `UNSIGNED-PAYLOAD`.
     * Cada parte de 5 MiB já está na memória (é o que o multipart exige de qualquer jeito), então o
     * sha256 dela sai de graça e a assinatura continua cobrindo o corpo — nada de afrouxar a
     * integridade nem depender de `chunked` (que o R2 recusa sem `Content-Length`). Abaixo de 5 MiB é
     * um PUT só. Funciona sem disco, então serve também a um Worker configurado só com `S3_*`.
     */
    async gravarDeStream(nome, fluxo, contentType) {
      urlDe(nome)
      let uploadId: string | null = null
      const etags: string[] = []
      try {
        for await (const parte of emPartes(fluxo, TAMANHO_DA_PARTE_S3)) {
          if (!uploadId) {
            if (parte.length < TAMANHO_DA_PARTE_S3) {
              await s3.gravar(nome, parte, contentType)
              return
            }
            const r = await chamar('POST', nome, { consulta: { uploads: '' }, contentType })
            const id = r.ok ? /<UploadId>([^<]+)<\/UploadId>/.exec(await r.text())?.[1] : undefined
            if (!id) throw new Error(`s3 POST uploads ${r.status}`)
            uploadId = id
          }
          const r = await chamar('PUT', nome, {
            corpo: parte,
            consulta: { partNumber: String(etags.length + 1), uploadId },
            prazoMs: prazoDoPut(prazoBase, parte.length),
          })
          const etag = r.headers.get('etag')
          if (!r.ok || !etag) throw new Error(`s3 PUT parte ${r.status}`)
          etags.push(etag)
        }
        if (!uploadId) {
          await s3.gravar(nome, Buffer.alloc(0), contentType)
          return
        }
        const xml =
          '<CompleteMultipartUpload>' +
          etags.map((e, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${e}</ETag></Part>`).join('') +
          '</CompleteMultipartUpload>'
        const r = await chamar('POST', nome, { corpo: xml, consulta: { uploadId } })
        // O S3 pode responder 200 com `<Error>` no corpo do complete.
        if (!r.ok || (await r.text()).includes('<Error>')) throw new Error(`s3 POST complete ${r.status}`)
      } catch (err) {
        if (uploadId) await chamar('DELETE', nome, { consulta: { uploadId } }).catch(() => {})
        throw err
      }
    },
    async ler(nome) {
      const r = await chamar('GET', nome)
      if (!r.ok) throw new Error(`s3 GET ${r.status}`)
      return Buffer.from(await r.arrayBuffer())
    },
    /**
     * O `Range` é REPASSADO ao objeto: quem recorta é o storage, não o processo. Se ele responder
     * 200 (ignorou a faixa), recortamos aqui — senão o corpo mentiria sobre o `Content-Range` que a
     * rota já prometeu.
     */
    async lerFaixa(nome, inicio, fim) {
      const r = await chamar('GET', nome, { extras: { range: `bytes=${inicio}-${fim}` } })
      if (!r.ok) throw new Error(`s3 GET faixa ${r.status}`)
      if (r.status === 206 && r.body) return Readable.fromWeb(r.body as Parameters<typeof Readable.fromWeb>[0])
      const buf = Buffer.from(await r.arrayBuffer())
      return Readable.from(r.status === 206 ? buf : buf.subarray(inicio, fim + 1))
    },
    /* HEAD numa chave que ninguém grava: `404` é a resposta ESPERADA e prova que o bucket
       respondeu com credencial válida. `403` (assinatura ou permissão) e falha de rede lançam —
       são exatamente os dois casos em que a instância não consegue servir mídia. O ready NÃO sai
       do ar por isso (ADR 0009): ele marca `armazenamento: 'indisponivel'` e segue 200. */
    async sondar() {
      const r = await chamar('HEAD', '__sonda-de-prontidao__')
      if (!r.ok && r.status !== 404) throw new Error(`s3 HEAD ${r.status}`)
    },
    async remover(nome) {
      const r = await chamar('DELETE', nome)
      // 404 ao remover não é erro: o objetivo é que ele não exista.
      if (!r.ok && r.status !== 404) throw new Error(`s3 DELETE ${r.status}`)
    },
    async tamanho(nome) {
      const r = await chamar('HEAD', nome)
      if (!r.ok) return null
      const n = Number(r.headers.get('content-length'))
      return Number.isFinite(n) ? n : null
    },
  }
  return s3
}

/* ─────────────────────────── escolha ─────────────────────────── */

/**
 * S3 só entra com as QUATRO variáveis presentes. Configuração pela metade cai para
 * filesystem em vez de falhar no primeiro upload em produção.
 */
export function configDoS3(env: NodeJS.ProcessEnv = process.env): ConfigS3 | null {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = env
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null
  return {
    endpoint: S3_ENDPOINT,
    bucket: S3_BUCKET,
    regiao: S3_REGION || 'auto',
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  }
}

/**
 * Há armazenamento EXTERNO (alcançável por todas as instâncias): o binding R2 ligado pelo `worker.ts`
 * ou o S3 com as quatro variáveis. É a pergunta da readiness, da cota (teto da conta, folga do volume)
 * e da trava de multi-réplica — uma regra só.
 */
export function armazenamentoExterno(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!bucketDoR2Ligado() || !!configDoS3(env)
}

/**
 * Qual armazenamento vale: o BINDING R2 (passado em `r2`, ou ligado pelo ponto de entrada do Worker),
 * depois o S3 (quatro variáveis), depois o disco em `dirPadrao`.
 */
export function armazenamentoDoAmbiente(
  dirPadrao: string,
  env: NodeJS.ProcessEnv = process.env,
  opcoes: { r2?: BucketR2 | null } = {},
): Armazenamento {
  const r2 = opcoes.r2 ?? bucketDoR2Ligado()
  const cfg = configDoS3(env)
  /* A DECISÃO saiu daqui para `configDoS3` porque o `GET /api/ready` precisa da mesma pergunta —
     "existe armazenamento EXTERNO configurado?" — sem receber um diretório de fallback que ele não
     tem e não usaria. Duas cópias da regra das quatro variáveis divergiriam no dia em que a quinta
     aparecesse. */
  /* O TETO DO R2 embrulha o binding e o S3 (`openspec/changes/r2-teto-de-uso`): no disco não há operação
     cobrada. Os tetos são lidos AQUI, na criação — valor inválido lança, e quem cria no boot é
     `server/boot/validar.ts`. */
  if (r2) return comTetoDeOperacoes(armazenamentoR2(r2), { tetos: lerTetoDoR2(env) })
  return cfg
    ? comTetoDeOperacoes(armazenamentoS3(cfg), { tetos: lerTetoDoR2(env) })
    : armazenamentoDeArquivos(dirPadrao)
}
