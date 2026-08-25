import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  armazenamentoDeArquivos, armazenamentoS3, armazenamentoDoAmbiente,
  assinarSigV4, resolverDentroDe, type ConfigS3,
} from '../../server/lib/armazenamento'

let dir: string
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'armz-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

/** Um `Readable` inteiro como Buffer — as duas pontas devolvem stream em `lerFaixa`. */
async function drenar(s: NodeJS.ReadableStream): Promise<Buffer> {
  const partes: Buffer[] = []
  for await (const c of s) partes.push(Buffer.from(c as Buffer))
  return Buffer.concat(partes)
}

describe('armazenamento de arquivos', () => {
  it('grava, lê, mede e remove', async () => {
    const a = armazenamentoDeArquivos(dir)
    await a.gravar('x.webm', Buffer.from('abc'), 'audio/webm')
    expect((await a.ler('x.webm')).toString()).toBe('abc')
    expect(await a.tamanho('x.webm')).toBe(3)
    await a.remover('x.webm')
    expect(await a.tamanho('x.webm')).toBeNull()
  })

  it('lê uma FAIXA fechada — é o que sustenta o seek do <audio>', async () => {
    const a = armazenamentoDeArquivos(dir)
    await a.gravar('r.webm', Buffer.from('0123456789'), 'audio/webm')
    expect((await drenar(await a.lerFaixa('r.webm', 3, 6))).toString()).toBe('3456')
    expect((await drenar(await a.lerFaixa('r.webm', 0, 9))).toString()).toBe('0123456789')
  })

  it('remover o que não existe não lança', async () => {
    await expect(armazenamentoDeArquivos(dir).remover('nada')).resolves.toBeUndefined()
  })

  it('recusa nome que escapa do diretório', () => {
    expect(() => resolverDentroDe(dir, '../fora.txt')).toThrow(/fora do diretório/)
    expect(() => resolverDentroDe(dir, 'sub/../../fora.txt')).toThrow(/fora do diretório/)
    expect(() => resolverDentroDe(dir, 'ok.webm')).not.toThrow()
  })
})

describe('assinatura SigV4', () => {
  const cfg: ConfigS3 = {
    endpoint: 'https://exemplo.r2.cloudflarestorage.com',
    bucket: 'midia',
    regiao: 'auto',
    accessKeyId: 'AKIAEXEMPLO',
    secretAccessKey: 'segredo-de-teste',
  }
  const agora = new Date('2026-08-14T18:00:00Z')
  const url = new URL('/midia/audio.webm', cfg.endpoint)

  it('produz os cabeçalhos exigidos', () => {
    const h = assinarSigV4({ metodo: 'PUT', url, corpo: Buffer.from('x'), contentType: 'audio/webm', cfg, agora })
    expect(h['x-amz-date']).toBe('20260814T180000Z')
    expect(h.host).toBe('exemplo.r2.cloudflarestorage.com')
    expect(h.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAEXEMPLO\/20260814\/auto\/s3\/aws4_request/)
    expect(h.authorization).toContain('SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date')
  })

  it('é determinística e muda com o corpo', () => {
    const args = { metodo: 'PUT', url, cfg, agora } as const
    const a = assinarSigV4({ ...args, corpo: Buffer.from('um') })
    const b = assinarSigV4({ ...args, corpo: Buffer.from('um') })
    const c = assinarSigV4({ ...args, corpo: Buffer.from('outro') })
    expect(a.authorization).toBe(b.authorization)
    expect(a.authorization).not.toBe(c.authorization)
  })

  it('muda com o segredo', () => {
    const args = { metodo: 'PUT', url, corpo: Buffer.from('x'), agora } as const
    const a = assinarSigV4({ ...args, cfg })
    const b = assinarSigV4({ ...args, cfg: { ...cfg, secretAccessKey: 'outro' } })
    expect(a.authorization).not.toBe(b.authorization)
  })
})

describe('armazenamento S3 contra um transporte falso', () => {
  const cfg: ConfigS3 = {
    endpoint: 'https://exemplo.r2.cloudflarestorage.com',
    bucket: 'midia', regiao: 'auto', accessKeyId: 'k', secretAccessKey: 's',
  }

  it('monta PUT no caminho do bucket, com corpo e assinatura', async () => {
    const chamadas: Array<{ url: string; init: RequestInit }> = []
    const falso = (async (u: string, init: RequestInit) => {
      chamadas.push({ url: u, init })
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch

    await armazenamentoS3(cfg, falso).gravar('a b.webm', Buffer.from('dados'), 'audio/webm')
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].url).toBe('https://exemplo.r2.cloudflarestorage.com/midia/a%20b.webm')
    expect(chamadas[0].init.method).toBe('PUT')
    const h = chamadas[0].init.headers as Record<string, string>
    expect(h.authorization).toContain('AWS4-HMAC-SHA256')
    expect(h['content-type']).toBe('audio/webm')
  })

  it('PUT com erro lança, e DELETE de objeto ausente não lança', async () => {
    const status = (n: number) => (async () => new Response(null, { status: n })) as unknown as typeof fetch
    await expect(armazenamentoS3(cfg, status(500)).gravar('x', Buffer.from('a'), 'audio/webm')).rejects.toThrow(/s3 PUT 500/)
    await expect(armazenamentoS3(cfg, status(404)).remover('x')).resolves.toBeUndefined()
    await expect(armazenamentoS3(cfg, status(500)).remover('x')).rejects.toThrow(/s3 DELETE 500/)
  })

  it('tamanho lê content-length e devolve null quando o objeto não existe', async () => {
    const ok = (async () => new Response(null, { status: 200, headers: { 'content-length': '42' } })) as unknown as typeof fetch
    const ausente = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    expect(await armazenamentoS3(cfg, ok).tamanho('x')).toBe(42)
    expect(await armazenamentoS3(cfg, ausente).tamanho('x')).toBeNull()
  })

  it('repassa o Range ao objeto e devolve só a faixa (206)', async () => {
    const objeto = Buffer.from('0123456789')
    const vistos: string[] = []
    const falso = (async (_u: string, init: RequestInit) => {
      const range = (init.headers as Record<string, string>).range
      vistos.push(range)
      const m = /bytes=(\d+)-(\d+)/.exec(range)!
      const [ini, fim] = [Number(m[1]), Number(m[2])]
      return new Response(objeto.subarray(ini, fim + 1), {
        status: 206,
        headers: { 'content-range': `bytes ${ini}-${fim}/${objeto.length}` },
      })
    }) as unknown as typeof fetch

    const faixa = await armazenamentoS3(cfg, falso).lerFaixa('a.webm', 2, 5)
    expect((await drenar(faixa)).toString()).toBe('2345')
    expect(vistos).toEqual(['bytes=2-5'])
  })

  it('storage que IGNORA o Range (200 com o objeto inteiro) é recortado aqui', async () => {
    const objeto = Buffer.from('0123456789')
    const teimoso = (async () => new Response(objeto, { status: 200 })) as unknown as typeof fetch
    const faixa = await armazenamentoS3(cfg, teimoso).lerFaixa('a.webm', 2, 5)
    expect((await drenar(faixa)).toString()).toBe('2345')
  })

  it('faixa de objeto ausente lança', async () => {
    const ausente = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    await expect(armazenamentoS3(cfg, ausente).lerFaixa('x', 0, 1)).rejects.toThrow(/s3 GET faixa 404/)
  })

  it('recusa nome de objeto com travessia', async () => {
    const falso = (async () => new Response(null, { status: 200 })) as unknown as typeof fetch
    await expect(armazenamentoS3(cfg, falso).ler('../outro-bucket/x')).rejects.toThrow(/inválido/)
  })
})

describe('escolha pelo ambiente', () => {
  it('sem as quatro variáveis, usa arquivos', () => {
    expect(armazenamentoDoAmbiente(dir, {}).tipo).toBe('arquivos')
  })

  it('configuração PELA METADE cai para arquivos em vez de falhar no primeiro upload', () => {
    const meio = { S3_ENDPOINT: 'https://x', S3_BUCKET: 'b' } as NodeJS.ProcessEnv
    expect(armazenamentoDoAmbiente(dir, meio).tipo).toBe('arquivos')
  })

  it('com as quatro, usa s3', () => {
    const completo = {
      S3_ENDPOINT: 'https://x', S3_BUCKET: 'b',
      S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's',
    } as NodeJS.ProcessEnv
    expect(armazenamentoDoAmbiente(dir, completo).tipo).toBe('s3')
  })
})

describe('as duas implementações têm o mesmo contrato', () => {
  it('gravar → ler → faixa → tamanho → remover se comportam igual', async () => {
    const memoria = new Map<string, Buffer>()
    const falso = (async (u: string, init: RequestInit) => {
      const nome = decodeURIComponent(new URL(u).pathname.split('/').pop()!)
      const m = init.method
      if (m === 'PUT') { memoria.set(nome, Buffer.from(init.body as Buffer)); return new Response(null, { status: 200 }) }
      if (m === 'DELETE') { memoria.delete(nome); return new Response(null, { status: 204 }) }
      const b = memoria.get(nome)
      if (!b) return new Response(null, { status: 404 })
      if (m === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': String(b.length) } })
      // Objeto real honra o Range: a faixa é recortada pelo storage, não pelo processo.
      const range = (init.headers as Record<string, string>).range
      const mr = range && /bytes=(\d+)-(\d+)/.exec(range)
      if (mr) {
        const [ini, fim] = [Number(mr[1]), Number(mr[2])]
        return new Response(b.subarray(ini, fim + 1), {
          status: 206,
          headers: { 'content-range': `bytes ${ini}-${fim}/${b.length}` },
        })
      }
      return new Response(b, { status: 200 })
    }) as unknown as typeof fetch

    for (const a of [armazenamentoDeArquivos(dir), armazenamentoS3({
      endpoint: 'https://x', bucket: 'b', regiao: 'auto', accessKeyId: 'k', secretAccessKey: 's',
    }, falso)]) {
      await a.gravar('y.webm', Buffer.from('conteudo'), 'audio/webm')
      expect((await a.ler('y.webm')).toString(), a.tipo).toBe('conteudo')
      expect(await a.tamanho('y.webm'), a.tipo).toBe(8)
      // A faixa é FECHADA nas duas pontas: [2,4] são 3 bytes, não 2.
      expect((await drenar(await a.lerFaixa('y.webm', 2, 4))).toString(), a.tipo).toBe('nte')
      expect((await drenar(await a.lerFaixa('y.webm', 0, 7))).toString(), a.tipo).toBe('conteudo')
      await a.remover('y.webm')
      expect(await a.tamanho('y.webm'), a.tipo).toBeNull()
    }
    expect(existsSync(path.join(dir, 'y.webm'))).toBe(false)
  })
})
