/**
 * UPLOADS GRANDES PELA MONTAGEM REAL (fase 2 de prontidão, §2.3/§4.1; ADR 0009).
 *
 * Medido em 25/09: 4 uploads simultâneos de 120 MB em `POST /api/sessions/:id/audio` levaram o RSS
 * de uma VM de 1 GB a 1.011 MB — o `express.raw` guardava o corpo inteiro, e o PUT do S3 o copiava
 * de novo para o sha256. Aqui, por HTTP de verdade (`criarApp()` via harness, modo público):
 *
 *  - o semáforo segura 1 corpo grande por usuário e 2 por processo, ANTES de ler o corpo, e devolve
 *    a vaga no fim normal, no erro e quando o cliente desiste;
 *  - o teto de 120 MB responde 413 pelo `Content-Length` sem ler nada, e pela CONTAGEM quando o
 *    corpo vem `chunked` — sem acumular;
 *  - a cota e o dono da sessão são conferidos antes de o corpo ser lido;
 *  - o corpo não passa inteiro pela memória (`arrayBuffers` quase parado num upload de 100 MB);
 *  - o round-trip do áudio no disco local continua funcionando.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { type ClientRequest, request } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import v8 from 'node:v8'
import { runInNewContext } from 'node:vm'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

const MB = 1024 * 1024

/* `gc()` sem `--expose-gc` na linha de comando: liga a flag em tempo de execução e pega a função num
   contexto novo, onde ela passa a existir. É só para a sonda de memória medir o que está RETIDO. */
v8.setFlagsFromString('--expose-gc')
const coletarLixo = runInNewContext('gc') as () => void
/** WebM de verdade (EBML): a rota detecta o tipo pelos magic bytes. */
const CABECA_WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60, 0x21)])

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Espera o `drain` (ou o fim da conexão) e tira os dois ouvintes — sem acumular um por pedaço. */
function drenou(req: ClientRequest): Promise<void> {
  return new Promise((r) => {
    const soltar = () => {
      req.off('drain', soltar).off('close', soltar)
      r()
    }
    req.once('drain', soltar).once('close', soltar)
  })
}

interface Resposta {
  status: number
  headers: Record<string, string | string[] | undefined>
  corpo: string
}

describe('uploads grandes: semáforo, streaming e teto (ADR 0009)', () => {
  let s: AppDeTeste
  let audioDir: string
  const tokens: Record<string, string> = {}
  const envAntes = { AUDIO_DIR: process.env.AUDIO_DIR, FREE_STORAGE_MB: process.env.FREE_STORAGE_MB }

  beforeAll(async () => {
    audioDir = mkdtempSync(path.join(tmpdir(), 'babel-uploads-grandes-'))
    process.env.AUDIO_DIR = audioDir
    process.env.FREE_STORAGE_MB = '100000'
    s = await subirApp({ modo: 'publico' })
    for (const u of ['ana', 'bia', 'caio', 'duda', 'edu', 'fabi', 'gil']) tokens[u] = await s.token(`uploads-${u}`)
  }, 60_000)

  afterAll(async () => {
    await s.encerrar()
    for (const [k, v] of Object.entries(envAntes)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    rmSync(audioDir, { recursive: true, force: true })
  })

  async function novaSessao(u: string): Promise<string> {
    const r = await s.post('/api/sessions', { title: 'upload', kind: 'audio' }, tokens[u])
    expect(r.status).toBe(200)
    return ((await r.json()) as { id: string }).id
  }

  /** Um POST mantido ABERTO: o corpo é escrito aos poucos por quem chamou. */
  function abrirUpload(caminho: string, u: string, headers: Record<string, string> = {}) {
    const base = new URL(s.base)
    const req = request({
      host: base.hostname,
      port: base.port,
      path: caminho,
      method: 'POST',
      headers: { 'content-type': 'audio/webm', authorization: `Bearer ${tokens[u]}`, ...headers },
    })
    const resposta = new Promise<Resposta>((ok, falha) => {
      req.on('response', (res) => {
        const partes: Buffer[] = []
        res.on('data', (c: Buffer) => partes.push(c))
        res.on('end', () =>
          ok({ status: res.statusCode ?? 0, headers: res.headers, corpo: Buffer.concat(partes).toString() }),
        )
        res.on('error', falha)
      })
      req.on('error', falha)
    })
    // Sem isto o erro de um request que o teste destrói de propósito vira "unhandled rejection".
    resposta.catch(() => {})
    return { req, resposta }
  }

  const enviarAudio = (id: string, u: string, corpo: Buffer = CABECA_WEBM) =>
    s.chamar('POST', `/api/sessions/${id}/audio`, {
      token: tokens[u],
      raw: corpo,
      headers: { 'content-type': 'audio/webm' },
    })

  /** Os temporários de recepção não podem sobrar — nem no 413, nem no abandono. */
  const temporarios = () => {
    const d = path.join(audioDir, '.recebendo')
    return existsSync(d) ? readdirSync(d) : []
  }

  it('segundo upload do MESMO usuário → 429 upload_ocupado com Retry-After; libera ao terminar', async () => {
    const [s1, s2] = [await novaSessao('ana'), await novaSessao('ana')]
    const resto = Buffer.alloc(4096, 0x11)
    const a = abrirUpload(`/api/sessions/${s1}/audio`, 'ana', {
      'content-length': String(CABECA_WEBM.length + resto.length),
    })
    a.req.write(CABECA_WEBM)
    await esperar(200)

    const b = await enviarAudio(s2, 'ana')
    expect(b.status).toBe(429)
    expect(b.headers.get('retry-after')).toBeTruthy()
    const corpo = (await b.json()) as { code: string; motivo?: string; detalhes?: { motivo?: string } }
    expect(corpo.code).toBe('upload_ocupado')

    a.req.end(resto)
    expect((await a.resposta).status).toBe(200)

    // A vaga voltou: o mesmo usuário envia de novo.
    expect((await enviarAudio(s2, 'ana')).status).toBe(200)
  })

  it('terceiro upload no processo → 429, mesmo vindo de um terceiro usuário', async () => {
    const [sb, sc, sd] = [await novaSessao('bia'), await novaSessao('caio'), await novaSessao('duda')]
    const abertos = [
      abrirUpload(`/api/sessions/${sb}/audio`, 'bia', { 'content-length': String(CABECA_WEBM.length + 10) }),
      abrirUpload(`/api/sessions/${sc}/audio`, 'caio', { 'content-length': String(CABECA_WEBM.length + 10) }),
    ]
    for (const a of abertos) a.req.write(CABECA_WEBM)
    await esperar(200)

    const r = await enviarAudio(sd, 'duda')
    expect(r.status).toBe(429)
    expect(((await r.json()) as { code: string }).code).toBe('upload_ocupado')

    for (const a of abertos) a.req.end(Buffer.alloc(10, 1))
    for (const a of abertos) expect((await a.resposta).status).toBe(200)
    expect((await enviarAudio(sd, 'duda')).status).toBe(200)
  })

  it('cliente que desiste no meio do corpo devolve a vaga e não deixa temporário', async () => {
    const id = await novaSessao('edu')
    const a = abrirUpload(`/api/sessions/${id}/audio`, 'edu', { 'content-length': String(10 * MB) })
    a.req.write(CABECA_WEBM)
    a.req.write(Buffer.alloc(256 * 1024))
    await esperar(200)
    a.req.destroy()

    let status = 0
    for (let i = 0; i < 30 && status !== 200; i++) {
      await esperar(100)
      status = (await enviarAudio(id, 'edu')).status
    }
    expect(status).toBe(200)
    expect(temporarios()).toEqual([])
  })

  it('Content-Length acima de 120 MB → 413 antes de ler o corpo, e a vaga volta', async () => {
    const id = await novaSessao('fabi')
    const a = abrirUpload(`/api/sessions/${id}/audio`, 'fabi', { 'content-length': String(200 * MB) })
    a.req.write(CABECA_WEBM)
    const r = await a.resposta
    a.req.destroy()
    expect(r.status).toBe(413)
    expect(JSON.parse(r.corpo).code).toBe('corpo_grande_demais')
    expect((await enviarAudio(id, 'fabi')).status).toBe(200)
  })

  /*
   * Sem asserção de memória AQUI, de propósito: o `arrayBuffers` conta também os pedaços já lidos e
   * ainda não coletados, e num envio sem pausa (o disco engole mais rápido que a rede entrega) o
   * lixo pendente oscilou entre 20 e 70 MB nesta máquina. O caso de memória é o de 100 MB abaixo,
   * com margem que o `express.raw` (210 MB medidos) não tem como cumprir.
   */
  it('corpo chunked passando de 120 MB → 413 pela contagem, e a resposta chega ao cliente', async () => {
    const id = await novaSessao('gil')
    const a = abrirUpload(`/api/sessions/${id}/audio`, 'gil') // sem Content-Length: chunked
    const pedaco = Buffer.alloc(MB, 0x33)
    let respondeu = false
    void a.resposta.then(
      () => (respondeu = true),
      () => (respondeu = true),
    )

    a.req.write(CABECA_WEBM)
    for (let i = 0; i < 130 && !respondeu; i++) {
      if (!a.req.write(pedaco)) await drenou(a.req)
    }
    const r = await a.resposta.catch(() => null)
    a.req.destroy()
    expect(r?.status).toBe(413)
    expect(JSON.parse(r?.corpo ?? '{}').code).toBe('corpo_grande_demais')
    expect(temporarios()).toEqual([])
    expect(existsSync(path.join(audioDir, `${id}.webm`))).toBe(false)
  }, 60_000)

  it('upload de 100 MB não passa inteiro pela memória (arrayBuffers quase parado) e grava', async () => {
    const id = await novaSessao('ana')
    const total = 100 * MB
    const a = abrirUpload(`/api/sessions/${id}/audio`, 'ana', { 'content-length': String(total) })
    const pedaco = Buffer.alloc(MB, 0x44)

    /* Mede o RETIDO, não o alocado: sem coletar antes de cada amostra, o `arrayBuffers` conta os
       pedaços que já foram para o disco e só esperam o GC — e isso oscilou entre 10 e 70 MB de uma
       rodada para outra nesta máquina, com o mesmo código.

       A amostra é por PROGRESSO (a cada 8 MB escritos e no fim), não por relógio. Antes havia uma
       sonda de 20 em 20 ms, e cada amostra é um GC completo NO MESMO PROCESSO que serve o upload:
       o servidor só lia um pedaço entre dois GCs. No runner do CI (com cobertura v8, heap maior,
       GC de centenas de ms) isso fez o teste passar de 120 s sem nenhum defeito no upload — só a
       sonda atrasando a leitura. Por progresso, são ~14 GCs no total, e o `express.raw` (que retém
       o corpo inteiro até o fim) continua reprovando: a retenção dele cresce a cada amostra. */
    const retido = () => {
      coletarLixo()
      return process.memoryUsage().arrayBuffers
    }
    const antes = retido()
    let pico = antes
    /* Se o servidor responder antes de ler o corpo (429/413/507), o `drain` nunca viria e o teste
       ficaria preso até o timeout; a resposta antecipada desbloqueia a espera e reprova no status. */
    let respondeu = false
    void a.resposta.then(
      () => (respondeu = true),
      () => (respondeu = true),
    )
    a.req.write(CABECA_WEBM)
    let enviado = CABECA_WEBM.length
    let proximaAmostra = 8 * MB
    while (enviado < total && !respondeu) {
      const n = Math.min(MB, total - enviado)
      const ok = a.req.write(n === MB ? pedaco : pedaco.subarray(0, n))
      enviado += n
      if (!ok) await drenou(a.req)
      if (enviado >= proximaAmostra) {
        pico = Math.max(pico, retido())
        proximaAmostra += 8 * MB
      }
    }
    pico = Math.max(pico, retido())
    a.req.end()
    const r = await a.resposta
    expect(r.status).toBe(200)
    /* Com `express.raw` o corpo inteiro ficava RETIDO até o fim (a lista de pedaços, depois o
       `Buffer.concat`): 100 MB ou mais aqui. Em streaming, o retido é o que está entre a rede e o
       disco — alguns pedaços de 64 KB. */
    expect(pico - antes).toBeLessThan(20 * MB)
    expect(readdirSync(audioDir).filter((f) => f.startsWith(id))).toEqual([`${id}.webm`])
  }, 120_000)

  it('cota cheia é decidida pelo Content-Length, ANTES de o corpo chegar (507 com o corpo aberto)', async () => {
    const id = await novaSessao('bia')
    process.env.FREE_STORAGE_MB = '1'
    try {
      const a = abrirUpload(`/api/sessions/${id}/audio`, 'bia', { 'content-length': String(5 * MB) })
      a.req.write(CABECA_WEBM) // só a cabeça: o resto nunca é enviado
      const r = await a.resposta
      a.req.destroy()
      expect(r.status).toBe(507)
      expect(JSON.parse(r.corpo).code).toBe('storage_quota_exceeded')
    } finally {
      process.env.FREE_STORAGE_MB = '100000'
    }
    expect(readdirSync(audioDir).filter((f) => f.startsWith(id))).toEqual([])
  })

  it('sessão de outro usuário → 404 antes de ler o corpo', async () => {
    const alheia = await novaSessao('caio')
    const a = abrirUpload(`/api/sessions/${alheia}/audio`, 'duda', { 'content-length': String(50 * MB) })
    a.req.write(CABECA_WEBM)
    const r = await a.resposta
    a.req.destroy()
    expect(r.status).toBe(404)
  })

  it('round-trip no disco local: o que sobe é o que o GET devolve', async () => {
    const id = await novaSessao('edu')
    const audio = Buffer.concat([CABECA_WEBM, Buffer.from('conteudo-do-audio')])
    expect((await enviarAudio(id, 'edu', audio)).status).toBe(200)
    const g = await s.get(`/api/sessions/${id}/audio`, tokens.edu)
    expect(g.status).toBe(200)
    expect(Buffer.from(await g.arrayBuffer()).equals(audio)).toBe(true)
  })

  it('import Anki divide o semáforo: com um áudio em voo, o mesmo usuário recebe 429', async () => {
    const id = await novaSessao('fabi')
    const a = abrirUpload(`/api/sessions/${id}/audio`, 'fabi', { 'content-length': String(CABECA_WEBM.length + 10) })
    a.req.write(CABECA_WEBM)
    await esperar(200)
    const r = await s.chamar('POST', '/api/import/anki', {
      token: tokens.fabi,
      raw: Buffer.from('casa\thouse\n', 'utf8'),
      headers: { 'x-filename': 'b.txt' },
    })
    expect(r.status).toBe(429)
    a.req.end(Buffer.alloc(10, 1))
    expect((await a.resposta).status).toBe(200)
  })

  it('import Anki com Content-Length acima de 200 MB → 413 com a explicação, sem ler o corpo', async () => {
    const a = abrirUpload('/api/import/anki', 'gil', {
      'content-length': String(250 * MB),
      'content-type': 'application/octet-stream',
      'x-filename': 'grande.apkg',
    })
    a.req.write(Buffer.alloc(1024))
    const r = await a.resposta
    a.req.destroy()
    expect(r.status).toBe(413)
    expect(JSON.parse(r.corpo).error).toMatch(/SEM mídia/)
  })
})
