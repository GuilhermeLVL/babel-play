/**
 * ARMAZENAMENTO R2 POR BINDING (Fase 2, Task 7). Num Worker não há disco: o áudio vai para o `R2Bucket`
 * do binding, e o upload segue em STREAM, em partes de 5 MiB (multipart), sem arquivo temporário.
 *
 * Contra o dublê em memória (`tests/harness/workers/r2Duble.ts`), que registra cada chamada:
 *  - todos os métodos do seam (`gravar`, `gravarDeStream`, `gravarDeArquivo`, `ler`, `lerFaixa`,
 *    `remover`, `tamanho`, `sondar`);
 *  - `lerFaixa` repassa a faixa ao bucket (`range: { offset, length }`), não recorta no processo;
 *  - o upload de 120 MB simulado vira 24 partes de 5 MiB — o stream é GERADO em pedaços de 1 MiB, e o
 *    dublê guarda só o resumo das partes (nada de 120 MB vivos de uma vez);
 *  - erro no meio do stream, ou na parte, chama `abort` e não chama `complete`;
 *  - sob o teto do R2, `tamanho` (HEAD) conta classe B e `gravarDeStream` conta classe A;
 *  - `armazenamentoDoAmbiente` prefere o binding, depois o S3, depois o disco.
 *
 * E o mesmo `gravarDeStream` nos outros dois back-ends: disco (temporário + `rename`) e S3 (PUT único
 * abaixo de 5 MiB; multipart assinado parte a parte acima).
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  armazenamentoDeArquivos,
  armazenamentoDoAmbiente,
  armazenamentoS3,
  NomeDeArquivoInvalido,
} from '../../server/lib/armazenamento'
import { armazenamentoR2, ligarBucketDoR2 } from '../../server/lib/armazenamentoR2'
import { temDisco } from '../../server/lib/runtime'
import { comTetoDeOperacoes, ErroDeTetoDoR2, semTeto } from '../../server/lib/tetoDoR2'
import { dubleDoR2 } from '../harness/workers/r2Duble'

const MiB = 1024 * 1024

/** Stream GERADO: `n` pedaços de 1 MiB, o pedaço i cheio do byte `i % 256`. Um buffer por vez. */
async function* gerado(n: number, falharDepoisDe?: number): AsyncGenerator<Buffer> {
  for (let i = 0; i < n; i++) {
    if (falharDepoisDe !== undefined && i === falharDepoisDe) throw new Error('cliente caiu no meio')
    yield Buffer.alloc(MiB, i % 256)
  }
}

const textoDe = async (r: Readable) => {
  const partes: Buffer[] = []
  for await (const p of r) partes.push(p as Buffer)
  return Buffer.concat(partes).toString()
}

let dir: string
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'babel-r2-binding-'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))
afterEach(() => ligarBucketDoR2(null))

describe('armazenamentoR2: os métodos do seam contra o binding', () => {
  it('gravar → put com contentType; ler, tamanho (head) e remover (delete)', async () => {
    const b = dubleDoR2()
    const a = armazenamentoR2(b)
    expect(a.tipo).toBe('r2')
    await a.gravar('s1.webm', Buffer.from('conteudo'), 'audio/webm')
    expect(b.chamadas[0]).toEqual({ op: 'put', chave: 's1.webm', tamanho: 8, contentType: 'audio/webm' })
    expect((await a.ler('s1.webm')).toString()).toBe('conteudo')
    expect(await a.tamanho('s1.webm')).toBe(8)
    expect(b.contar('head')).toBe(1)
    await a.remover('s1.webm')
    expect(b.contar('delete')).toBe(1)
    expect(await a.tamanho('s1.webm')).toBeNull()
    // Remover o que não existe não é erro: o objetivo é que ele não exista.
    await expect(a.remover('s1.webm')).resolves.toBeUndefined()
  })

  it('ler objeto ausente lança (como o GET 404 do S3)', async () => {
    await expect(armazenamentoR2(dubleDoR2()).ler('nada.webm')).rejects.toThrow(/r2 GET/)
  })

  it('lerFaixa repassa a faixa FECHADA ao bucket como { offset, length } e devolve só ela', async () => {
    const b = dubleDoR2()
    const a = armazenamentoR2(b)
    await a.gravar('f.webm', Buffer.from('0123456789'), 'audio/webm')
    expect(await textoDe(await a.lerFaixa('f.webm', 2, 5))).toBe('2345')
    expect(b.chamadas.at(-1)).toEqual({ op: 'get', chave: 'f.webm', range: { offset: 2, length: 4 } })
  })

  it('nome que escaparia lança NomeDeArquivoInvalido antes de tocar o bucket', async () => {
    const b = dubleDoR2()
    const a = armazenamentoR2(b)
    await expect(a.gravar('../fora.webm', Buffer.from('x'), 'audio/webm')).rejects.toBeInstanceOf(NomeDeArquivoInvalido)
    await expect(a.tamanho('/abs.webm')).rejects.toBeInstanceOf(NomeDeArquivoInvalido)
    expect(b.chamadas).toEqual([])
  })

  it('sondar faz HEAD numa chave que ninguém grava; ausente passa, binding quebrado lança', async () => {
    const b = dubleDoR2()
    await armazenamentoR2(b).sondar()
    expect(b.chamadas).toEqual([{ op: 'head', chave: '__sonda-de-prontidao__' }])
    const quebrado = { ...dubleDoR2(), head: async () => Promise.reject(new Error('binding fora')) }
    await expect(armazenamentoR2(quebrado).sondar()).rejects.toThrow(/binding fora/)
  })

  it('gravarDeArquivo (Node, com disco) lê o arquivo em stream e grava no bucket', async () => {
    const origem = path.join(dir, 'recebido.tmp')
    writeFileSync(origem, 'do-arquivo')
    const b = dubleDoR2()
    await armazenamentoR2(b).gravarDeArquivo('a.webm', origem, 'audio/webm')
    expect(b.conteudo('a.webm')?.toString()).toBe('do-arquivo')
  })
})

describe('armazenamentoR2.gravarDeStream: multipart em partes de 5 MiB', () => {
  it('abaixo de 5 MiB: um put só, sem multipart', async () => {
    const b = dubleDoR2()
    await armazenamentoR2(b).gravarDeStream('p.webm', gerado(3), 'audio/webm')
    expect(b.chamadas.map((c) => c.op)).toEqual(['put'])
    expect(b.conteudo('p.webm')?.length).toBe(3 * MiB)
  })

  it('120 MB gerados → 24 partes de 5 MiB, em ordem, e complete com as 24', async () => {
    const b = dubleDoR2({ soTamanhos: true })
    await armazenamentoR2(b).gravarDeStream('grande.webm', gerado(120), 'audio/webm', 120 * MiB)
    const partes = b.chamadas.filter((c) => c.op === 'uploadPart')
    expect(partes).toHaveLength(24)
    partes.forEach((p, k) => {
      expect(p).toMatchObject({ numero: k + 1, tamanho: 5 * MiB, primeiroByte: (5 * k) % 256 })
    })
    expect(b.chamadas[0]).toEqual({ op: 'createMultipartUpload', chave: 'grande.webm', contentType: 'audio/webm' })
    expect(b.chamadas.at(-1)).toEqual({
      op: 'complete',
      chave: 'grande.webm',
      partes: Array.from({ length: 24 }, (_, i) => i + 1),
    })
    expect(b.contar('put')).toBe(0)
    expect(b.contar('abort')).toBe(0)
    expect(await armazenamentoR2(b).tamanho('grande.webm')).toBe(120 * MiB)
  }, 60_000)

  it('última parte menor: 12 MiB → 5 + 5 + 2', async () => {
    const b = dubleDoR2()
    await armazenamentoR2(b).gravarDeStream('m.webm', gerado(12), 'audio/webm')
    const tamanhos = b.chamadas.flatMap((c) => (c.op === 'uploadPart' ? [c.tamanho / MiB] : []))
    expect(tamanhos).toEqual([5, 5, 2])
    expect(b.conteudo('m.webm')?.length).toBe(12 * MiB)
  })

  it('erro no MEIO do stream → abort, sem complete, e o erro sobe', async () => {
    const b = dubleDoR2({ soTamanhos: true })
    await expect(armazenamentoR2(b).gravarDeStream('x.webm', gerado(120, 12), 'audio/webm')).rejects.toThrow(
      /cliente caiu/,
    )
    expect(b.contar('uploadPart')).toBe(2)
    expect(b.contar('abort')).toBe(1)
    expect(b.contar('complete')).toBe(0)
    expect(b.chaves()).toEqual([])
  })

  it('parte recusada pelo R2 → abort, sem complete', async () => {
    const b = dubleDoR2({ soTamanhos: true, falharParte: 3 })
    await expect(armazenamentoR2(b).gravarDeStream('y.webm', gerado(30), 'audio/webm')).rejects.toThrow(/parte 3/)
    expect(b.contar('abort')).toBe(1)
    expect(b.contar('complete')).toBe(0)
  })

  it('aceita o ReadableStream da web (o corpo do request num Worker)', async () => {
    const b = dubleDoR2()
    const web = Readable.toWeb(Readable.from(gerado(6))) as unknown as ReadableStream<Uint8Array>
    await armazenamentoR2(b).gravarDeStream('w.webm', web, 'audio/webm')
    expect(b.conteudo('w.webm')?.length).toBe(6 * MiB)
    expect(b.contar('uploadPart')).toBe(2)
  })
})

describe('teto do R2 embrulhando o binding', () => {
  it('tamanho (HEAD) conta classe B; gravarDeStream conta classe A; sondar não conta', async () => {
    const contadas: string[] = []
    const contar = async (classe: 'a' | 'b') => (contadas.push(classe), 1)
    const b = dubleDoR2()
    const s = comTetoDeOperacoes(armazenamentoR2(b), {
      tetos: { bytes: Infinity, opsA: 100, opsB: 100 },
      contar: contar as never,
    })
    await s.gravarDeStream('t.webm', gerado(1), 'audio/webm')
    await s.tamanho('t.webm')
    await s.sondar()
    expect(contadas).toEqual(['a', 'b'])
    expect(b.contar('head')).toBe(2)
  })

  it('no teto de B, tamanho recusa ANTES do HEAD', async () => {
    const b = dubleDoR2()
    const s = comTetoDeOperacoes(armazenamentoR2(b), {
      tetos: { bytes: Infinity, opsA: 100, opsB: 100 },
      contar: (async () => null) as never,
    })
    await expect(s.tamanho('t.webm')).rejects.toThrow(/classe B/)
    expect(b.contar('head')).toBe(0)
  })

  /* O multipart custa 1 + partes + 1 operações A no R2 (create, cada uploadPart, complete; o abort é
     grátis): o teto conta cada uma, pelo `aoOperar` que o embrulho passa ao back-end. */
  const contadorA = (teto = Infinity) => {
    let n = 0
    const contar = async (classe: 'a' | 'b') => {
      if (classe !== 'a') return 1
      if (n >= teto) return null
      return ++n
    }
    return { contar: contar as never, contadas: () => n }
  }

  it('120 MB simulado → 26 operações A contadas (create + 24 partes + complete)', async () => {
    const c = contadorA()
    const b = dubleDoR2({ soTamanhos: true })
    const s = comTetoDeOperacoes(armazenamentoR2(b), {
      tetos: { bytes: Infinity, opsA: 1e9, opsB: 1e9 },
      contar: c.contar,
    })
    await s.gravarDeStream('g.webm', gerado(120), 'audio/webm')
    expect(c.contadas()).toBe(26)
    expect(b.contar('uploadPart')).toBe(24)
  }, 60_000)

  it('put único (< 5 MiB) → 1 operação A', async () => {
    const c = contadorA()
    const s = comTetoDeOperacoes(armazenamentoR2(dubleDoR2()), {
      tetos: { bytes: Infinity, opsA: 1e9, opsB: 1e9 },
      contar: c.contar,
    })
    await s.gravarDeStream('p.webm', gerado(2), 'audio/webm')
    expect(c.contadas()).toBe(1)
  })

  it('teto que estoura na parte 3 → ErroDeTetoDoR2 (R2_TETO_OPS), abort, sem a parte 3', async () => {
    const c = contadorA(3) // create, parte 1, parte 2 passam; a parte 3 é recusada
    const b = dubleDoR2({ soTamanhos: true })
    const s = comTetoDeOperacoes(armazenamentoR2(b), {
      tetos: { bytes: Infinity, opsA: 1e9, opsB: 1e9 },
      contar: c.contar,
    })
    const erro = await s.gravarDeStream('t.webm', gerado(30), 'audio/webm').catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDeTetoDoR2)
    expect((erro as ErroDeTetoDoR2).codigo).toBe('R2_TETO_OPS')
    expect(b.contar('uploadPart')).toBe(2)
    expect(b.contar('abort')).toBe(1)
    expect(b.contar('complete')).toBe(0)
  })

  it('S3 também conta por operação: 12 MiB → 5 (uploads + 3 partes + complete)', async () => {
    const c = contadorA()
    const buscar = (async (u: string, init: RequestInit) => {
      const url = new URL(u)
      if (url.searchParams.has('uploads')) return new Response('<UploadId>u1</UploadId>')
      if (url.searchParams.has('partNumber')) return new Response(null, { headers: { etag: '"e"' } })
      return new Response(null, { status: init.method === 'DELETE' ? 204 : 200 })
    }) as unknown as typeof fetch
    const cfg = {
      endpoint: 'https://s3.falso',
      bucket: 'midia',
      regiao: 'auto',
      accessKeyId: 'k',
      secretAccessKey: 's',
    }
    const s = comTetoDeOperacoes(armazenamentoS3(cfg, buscar), {
      tetos: { bytes: Infinity, opsA: 1e9, opsB: 1e9 },
      contar: c.contar,
    })
    await s.gravarDeStream('s.webm', gerado(12), 'audio/webm')
    expect(c.contadas()).toBe(5)
  })
})

describe('armazenamentoDoAmbiente: binding > S3 > disco', () => {
  const S3 = {
    S3_ENDPOINT: 'http://r2-falso.invalid',
    S3_BUCKET: 'midia',
    S3_ACCESS_KEY_ID: 'k',
    S3_SECRET_ACCESS_KEY: 's',
  }

  it('com o binding passado, é o R2 — mesmo com S3 configurado — e vem embrulhado pelo teto', () => {
    const a = armazenamentoDoAmbiente(dir, S3, { r2: dubleDoR2() })
    expect(a.tipo).toBe('r2')
    expect(semTeto(a)).not.toBe(a)
  })

  it('o binding ligado pelo ponto de entrada (ligarBucketDoR2) vale sem ser passado', () => {
    ligarBucketDoR2(dubleDoR2())
    expect(armazenamentoDoAmbiente(dir, {}).tipo).toBe('r2')
  })

  it('sem binding: S3 com as quatro variáveis; sem elas, disco', () => {
    expect(armazenamentoDoAmbiente(dir, S3).tipo).toBe('s3')
    expect(armazenamentoDoAmbiente(dir, {}).tipo).toBe('arquivos')
  })

  it('sem disco, sem binding e sem S3: erro claro em vez de cair num disco que não existe', () => {
    const antes = process.env.BABEL_SEM_DISCO
    process.env.BABEL_SEM_DISCO = '1'
    try {
      expect(() => armazenamentoDoAmbiente(dir, {})).toThrow(/sem disco.*binding R2.*S3_/)
      expect(armazenamentoDoAmbiente(dir, S3).tipo).toBe('s3')
      expect(armazenamentoDoAmbiente(dir, {}, { r2: dubleDoR2() }).tipo).toBe('r2')
    } finally {
      if (antes === undefined) delete process.env.BABEL_SEM_DISCO
      else process.env.BABEL_SEM_DISCO = antes
    }
  })

  it('religar o binding com OUTRO bucket avisa no log; o mesmo de novo, não', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const b1 = dubleDoR2()
      ligarBucketDoR2(b1)
      ligarBucketDoR2(b1)
      expect(aviso).not.toHaveBeenCalled()
      ligarBucketDoR2(dubleDoR2())
      expect(aviso).toHaveBeenCalledTimes(1)
      expect(String(aviso.mock.calls[0][0])).toContain('r2_binding_religado')
    } finally {
      aviso.mockRestore()
    }
  })
})

describe('temDisco: gancho de teste BABEL_SEM_DISCO', () => {
  it('lido na hora: 1 → sem disco; ausente → com disco (no Node)', () => {
    const antes = process.env.BABEL_SEM_DISCO
    try {
      process.env.BABEL_SEM_DISCO = '1'
      expect(temDisco()).toBe(false)
      delete process.env.BABEL_SEM_DISCO
      expect(temDisco()).toBe(true)
    } finally {
      if (antes === undefined) delete process.env.BABEL_SEM_DISCO
      else process.env.BABEL_SEM_DISCO = antes
    }
  })
})

describe('gravarDeStream nos outros back-ends', () => {
  it('disco: grava pelo temporário e renomeia; erro no meio não deixa nada', async () => {
    const d = path.join(dir, 'audio')
    const a = armazenamentoDeArquivos(d)
    await a.gravarDeStream('d.webm', gerado(2), 'audio/webm')
    expect(readFileSync(path.join(d, 'd.webm')).length).toBe(2 * MiB)
    await expect(a.gravarDeStream('e.webm', gerado(4, 2), 'audio/webm')).rejects.toThrow(/cliente caiu/)
    expect(existsSync(path.join(d, 'e.webm'))).toBe(false)
    expect(readdirSync(d)).toEqual(['d.webm'])
    await expect(a.gravarDeStream('../fora.webm', gerado(1), 'audio/webm')).rejects.toThrow(/fora do diretório/)
  })

  const cfg = { endpoint: 'https://s3.falso', bucket: 'midia', regiao: 'auto', accessKeyId: 'k', secretAccessKey: 's' }
  type Pedido = { metodo: string; url: URL; bytes: number; sha?: string; corpo?: string }

  function s3Falso(o: { falharParte?: number } = {}) {
    const pedidos: Pedido[] = []
    const buscar = (async (u: string, init: RequestInit & { body?: unknown }) => {
      const url = new URL(u)
      const corpo = init.body ? Buffer.from(init.body as Uint8Array) : Buffer.alloc(0)
      const h = init.headers as Record<string, string>
      pedidos.push({
        metodo: init.method ?? 'GET',
        url,
        bytes: corpo.length,
        sha: h['x-amz-content-sha256'],
        ...(url.searchParams.has('uploadId') && init.method === 'POST' ? { corpo: corpo.toString() } : {}),
      })
      if (init.method === 'POST' && url.searchParams.has('uploads'))
        return new Response(
          '<InitiateMultipartUploadResult><UploadId>up+1/x=</UploadId></InitiateMultipartUploadResult>',
        )
      if (init.method === 'PUT' && url.searchParams.has('partNumber')) {
        const n = Number(url.searchParams.get('partNumber'))
        if (n === o.falharParte) return new Response(null, { status: 500 })
        return new Response(null, { status: 200, headers: { etag: `"e${n}"` } })
      }
      return new Response(null, { status: 200 })
    }) as unknown as typeof fetch
    return { pedidos, buscar }
  }

  it('S3 abaixo de 5 MiB: um PUT só, com o corpo assinado pelo hash', async () => {
    const f = s3Falso()
    await armazenamentoS3(cfg, f.buscar).gravarDeStream('s.webm', gerado(2), 'audio/webm')
    expect(f.pedidos.map((p) => p.metodo)).toEqual(['PUT'])
    expect(f.pedidos[0].bytes).toBe(2 * MiB)
    expect(f.pedidos[0].sha).toMatch(/^[0-9a-f]{64}$/)
  })

  it('S3 acima de 5 MiB: multipart (uploads → partes assinadas → complete com os ETags)', async () => {
    const f = s3Falso()
    await armazenamentoS3(cfg, f.buscar).gravarDeStream('g.webm', gerado(12), 'audio/webm')
    expect(f.pedidos.map((p) => `${p.metodo} ${p.url.search}`)).toEqual([
      'POST ?uploads=',
      'PUT ?partNumber=1&uploadId=up%2B1%2Fx%3D',
      'PUT ?partNumber=2&uploadId=up%2B1%2Fx%3D',
      'PUT ?partNumber=3&uploadId=up%2B1%2Fx%3D',
      'POST ?uploadId=up%2B1%2Fx%3D',
    ])
    expect(f.pedidos.slice(1, 4).map((p) => p.bytes / MiB)).toEqual([5, 5, 2])
    expect(f.pedidos.slice(1, 4).every((p) => /^[0-9a-f]{64}$/.test(p.sha ?? ''))).toBe(true)
    const xml = f.pedidos[4].corpo ?? ''
    expect(xml).toContain('<Part><PartNumber>1</PartNumber><ETag>"e1"</ETag></Part>')
    expect(xml).toContain('<Part><PartNumber>3</PartNumber><ETag>"e3"</ETag></Part>')
  })

  it('S3: parte recusada → DELETE ?uploadId (abort) e o erro sobe', async () => {
    const f = s3Falso({ falharParte: 2 })
    await expect(armazenamentoS3(cfg, f.buscar).gravarDeStream('z.webm', gerado(12), 'audio/webm')).rejects.toThrow(
      /s3 PUT parte 500/,
    )
    expect(f.pedidos.at(-1)).toMatchObject({ metodo: 'DELETE' })
    expect(f.pedidos.at(-1)?.url.search).toBe('?uploadId=up%2B1%2Fx%3D')
  })
})
