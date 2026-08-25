import { createHash, createHmac } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

/**
 * Seam de armazenamento de mídia (F5-02).
 *
 * A mídia é 33× o banco (176,9 MB vs 5,3 MB por usuário; ~173 GB projetados para 1.000).
 * O ADR 001 decidiu object storage — este é o único ponto que precisa saber disso.
 */
export interface Armazenamento {
  readonly tipo: 'arquivos' | 's3'
  gravar(nome: string, bytes: Buffer, contentType: string): Promise<void>
  ler(nome: string): Promise<Buffer>
  remover(nome: string): Promise<void>
  tamanho(nome: string): Promise<number | null>
  /**
   * Faixa FECHADA `[inicio, fim]`, em bytes — é o que sustenta o `Range` do `<audio>` (achado D1).
   * Existe no seam porque as duas pontas resolvem isso de forma incompatível: filesystem abre o
   * arquivo já posicionado, S3 pede a faixa ao servidor. Sem isto, ligar o seam custaria o seek.
   */
  lerFaixa(nome: string, inicio: number, fim: number): Promise<Readable>
}

/* ─────────────────────────── filesystem ─────────────────────────── */

/** Recusa nome que escape do diretório (S-14). */
export function resolverDentroDe(base: string, nome: string): string {
  const raiz = path.resolve(base)
  const alvo = path.resolve(raiz, nome)
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) {
    throw new Error('caminho fora do diretório permitido')
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
    ler: (nome) => readFile(resolverDentroDe(dir, nome)),
    async lerFaixa(nome, inicio, fim) {
      return createReadStream(resolverDentroDe(dir, nome), { start: inicio, end: fim })
    },
    remover: (nome) => rm(resolverDentroDe(dir, nome), { force: true }),
    async tamanho(nome) {
      try { return (await stat(resolverDentroDe(dir, nome))).size } catch { return null }
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

/** Assinatura SigV4. Exportada para o teste conseguir conferi-la sem bucket real. */
export function assinarSigV4(opts: {
  metodo: string
  url: URL
  corpo: Buffer | string
  contentType?: string
  cfg: ConfigS3
  agora: Date
}): Record<string, string> {
  const { metodo, url, corpo, contentType, cfg, agora } = opts
  const carimbo = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dia = carimbo.slice(0, 8)
  const hashDoCorpo = sha256(typeof corpo === 'string' ? corpo : corpo)

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

export function armazenamentoS3(cfg: ConfigS3, buscar: typeof fetch = fetch): Armazenamento {
  const urlDe = (nome: string) => {
    if (nome.includes('..') || nome.startsWith('/')) throw new Error('nome de objeto inválido')
    return new URL(`/${cfg.bucket}/${encodeURIComponent(nome)}`, cfg.endpoint)
  }

  const chamar = async (
    metodo: string,
    nome: string,
    corpo: Buffer | string = '',
    contentType?: string,
    // Cabeçalhos NÃO assinados (SigV4 só exige os que estão em `SignedHeaders`) — hoje só `range`.
    extras?: Record<string, string>,
  ) => {
    const url = urlDe(nome)
    const headers = assinarSigV4({ metodo, url, corpo, contentType, cfg, agora: new Date() })
    return buscar(url.toString(), {
      method: metodo,
      headers: extras ? { ...headers, ...extras } : headers,
      body: metodo === 'GET' || metodo === 'HEAD' || metodo === 'DELETE' ? undefined : corpo,
    })
  }

  return {
    tipo: 's3',
    async gravar(nome, bytes, contentType) {
      const r = await chamar('PUT', nome, bytes, contentType)
      if (!r.ok) throw new Error(`s3 PUT ${r.status}`)
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
      const r = await chamar('GET', nome, '', undefined, { range: `bytes=${inicio}-${fim}` })
      if (!r.ok) throw new Error(`s3 GET faixa ${r.status}`)
      if (r.status === 206 && r.body) return Readable.fromWeb(r.body as Parameters<typeof Readable.fromWeb>[0])
      const buf = Buffer.from(await r.arrayBuffer())
      return Readable.from(r.status === 206 ? buf : buf.subarray(inicio, fim + 1))
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
}

/* ─────────────────────────── escolha ─────────────────────────── */

/**
 * S3 só entra com as QUATRO variáveis presentes. Configuração pela metade cai para
 * filesystem em vez de falhar no primeiro upload em produção.
 */
export function armazenamentoDoAmbiente(dirPadrao: string, env: NodeJS.ProcessEnv = process.env): Armazenamento {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = env
  if (S3_ENDPOINT && S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY) {
    return armazenamentoS3({
      endpoint: S3_ENDPOINT,
      bucket: S3_BUCKET,
      regiao: S3_REGION || 'auto',
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
    })
  }
  return armazenamentoDeArquivos(dirPadrao)
}
