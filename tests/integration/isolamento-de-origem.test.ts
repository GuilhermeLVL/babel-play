/**
 * A8 — ISOLAMENTO DE ORIGEM LIGADO DE FÁBRICA NO SERVIDOR.
 *
 * Sem `crossOriginIsolated` não há `SharedArrayBuffer`, e o WASM do ONNX Runtime (Whisper, opus-mt,
 * WeSpeaker) roda em UMA thread: o orçamento do A3 (`src/lib/dispositivo/orcamentoDeThreads.ts`)
 * devolve 1 para todo motor. A edição estática já saía isolada (`public/_headers`); a edição com
 * servidor só isolava com `CROSS_ORIGIN_ISOLATION=1`, e o Fly nunca a definiu — o grátis rodava
 * com uma thread justamente onde mais pesa.
 *
 * O que se trava aqui é o CONTRATO DOS MODOS, pela montagem de produção (`criarApp()` e depois
 * `montarSpa()`, na ordem do `server.ts`), porque o cabeçalho que importa é o do DOCUMENTO e o dos
 * scripts de worker — e esses saem do estático, montado depois de tudo:
 *
 *   ausente, `1`, `completo`   COOP `same-origin` + COEP `credentialless` + DIP `isolate-and-credentialless`
 *   `dip`                      só o `Document-Isolation-Policy` (sem COEP)
 *   `0`, `false`, `off`        nenhum dos dois (o COOP do helmet continua, como sempre saiu)
 *
 * O porquê de cada modo, e o que foi verificado que poderia quebrar, está em `server/http/isolamento.ts`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { modoDeIsolamento } from '../../server/http/isolamento'
import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
let dist: string
const anterior = process.env.CROSS_ORIGIN_ISOLATION

beforeAll(async () => {
  delete process.env.CROSS_ORIGIN_ISOLATION
  s = await subirApp({ modo: 'publico' })
  dist = mkdtempSync(path.join(tmpdir(), 'dist-isolamento-'))
  mkdirSync(path.join(dist, 'assets'))
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>')
  /* Um chunk de worker: sob COEP, o script de um `new Worker(url)` precisa trazer o cabeçalho também. */
  writeFileSync(path.join(dist, 'assets', 'whisperWorker-Ab12Cd34.js'), 'self.onmessage = () => {}')
}, 60_000)

afterAll(async () => {
  await s.encerrar()
  rmSync(dist, { recursive: true, force: true })
  if (anterior === undefined) delete process.env.CROSS_ORIGIN_ISOLATION
  else process.env.CROSS_ORIGIN_ISOLATION = anterior
})

interface Cabecalhos {
  coop: string | null
  coep: string | null
  dip: string | null
}

const ler = (r: Response): Cabecalhos => ({
  coop: r.headers.get('cross-origin-opener-policy'),
  coep: r.headers.get('cross-origin-embedder-policy'),
  dip: r.headers.get('document-isolation-policy'),
})

/**
 * A montagem de produção com o valor dado: `criarApp()` lê o ambiente NA CHAMADA, então cada modo é
 * um app novo sobre o mesmo banco efêmero (um `subirApp` só por arquivo — ver o harness).
 */
async function cabecalhosCom(valor: string | undefined, caminhos: string[]): Promise<Cabecalhos[]> {
  if (valor === undefined) delete process.env.CROSS_ORIGIN_ISOLATION
  else process.env.CROSS_ORIGIN_ISOLATION = valor
  const { criarApp } = await s.load('../../server/http/app')
  const { montarSpa } = await s.load('../../server/http/estaticos')
  const app = criarApp()
  montarSpa(app, dist)
  const servidor: Server = await new Promise((r) => {
    const srv = app.listen(0, '127.0.0.1', () => r(srv))
  })
  try {
    const addr = servidor.address()
    const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
    return await Promise.all(caminhos.map(async (c) => ler(await fetch(base + c))))
  } finally {
    await new Promise<void>((r) => servidor.close(() => r()))
    delete process.env.CROSS_ORIGIN_ISOLATION
  }
}

/** O documento (pela raiz e pelo fallback de rota da SPA), o script de worker e uma resposta da API. */
const CAMINHOS = ['/', '/capturar', '/assets/whisperWorker-Ab12Cd34.js', '/api/health']

const COMPLETO: Cabecalhos = {
  coop: 'same-origin',
  coep: 'credentialless',
  dip: 'isolate-and-credentialless',
}

describe('isolamento de origem na montagem de produção', () => {
  it('SEM a variável (o padrão): documento, worker e API saem isolados — COOP + COEP + DIP', async () => {
    for (const h of await cabecalhosCom(undefined, CAMINHOS)) expect(h).toEqual(COMPLETO)
  })

  it('o harness de caracterização (a montagem que as outras suítes usam) também sai isolado', async () => {
    expect(ler(await s.get('/api/health'))).toEqual(COMPLETO)
  })

  it('`CROSS_ORIGIN_ISOLATION=1` (quem já ligava) continua ligado — agora com o DIP junto', async () => {
    for (const h of await cabecalhosCom('1', CAMINHOS)) expect(h).toEqual(COMPLETO)
  })

  it('`=0` desliga: sem COEP e sem DIP; o COOP do helmet continua, como saía antes do A8', async () => {
    for (const h of await cabecalhosCom('0', CAMINHOS)) {
      expect(h).toEqual({ coop: 'same-origin', coep: null, dip: null })
    }
  })

  it('`=dip`: só o Document-Isolation-Policy — sem COEP, para quando um iframe de terceiro não aceitar COEP', async () => {
    for (const h of await cabecalhosCom('dip', CAMINHOS)) {
      expect(h).toEqual({ coop: 'same-origin', coep: null, dip: 'isolate-and-credentialless' })
    }
  })
})

describe('leitura do valor', () => {
  it('ausente, vazio, `1` e `completo` são o modo completo', () => {
    for (const v of [undefined, '', '  ', '1', 'completo', 'COMPLETO', 'true']) {
      expect(modoDeIsolamento({ CROSS_ORIGIN_ISOLATION: v }), String(v)).toBe('completo')
    }
  })

  it('`0`, `false` e `off` desligam — as formas que um operador escreve quando quer desligar', () => {
    for (const v of ['0', 'false', 'off', ' OFF ', 'desligado']) {
      expect(modoDeIsolamento({ CROSS_ORIGIN_ISOLATION: v }), v).toBe('desligado')
    }
  })

  it('`dip` (sem diferença de caixa nem de espaço) é só o DIP', () => {
    for (const v of ['dip', ' DIP ']) expect(modoDeIsolamento({ CROSS_ORIGIN_ISOLATION: v }), v).toBe('dip')
  })

  it('valor desconhecido cai no PADRÃO (ligado), e não em desligado: erro de digitação não tira as threads', () => {
    expect(modoDeIsolamento({ CROSS_ORIGIN_ISOLATION: 'dpi' })).toBe('completo')
  })
})
