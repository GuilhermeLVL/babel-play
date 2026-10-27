/**
 * Diagnóstico de erros e estado de boot (P1-6, P2-5).
 *
 *  P1-6 — os handlers respondiam `String(err).slice(0, 200)` e NÃO logavam. A mensagem do
 *         drizzle começa com `Failed query: insert into "sessions" (...` e o nome das colunas
 *         consome os 200 chars, então a causa real (`SQLITE_BUSY: database is locked`) ficava
 *         fora. Foi preciso sair do HTTP e instrumentar o driver para diagnosticar o P0-2.
 *  P2-5 — migração e backfill do boot falhavam com console.warn e o servidor subia assim
 *         mesmo, sem nenhum sinal externo de que os dados estavam incompletos.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let erroDeRota: any
let boot: any
let health: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ erroDeRota } = await h.load('../../server/lib/erroDeRota'))
  boot = await h.load('../../server/lib/bootStatus')
  ;({ healthHandler: health } = await h.load('../../server/routes/health'))
})
afterAll(async () => {
  await h.cleanup()
})
afterEach(async () => {
  /* `registrarFalhaDeBoot` grava sem esperar (`void db…`). No Postgres de verdade a inserção ainda em voo chegava
     DEPOIS do `DELETE` do reset e a linha vazava para o teste seguinte: deixa as inserções pousarem antes. */
  await new Promise((r) => setTimeout(r, 50))
  await boot.resetBootStatus()
  vi.restoreAllMocks()
})

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    return r
  }
  return r
}

describe('erroDeRota — P1-6', () => {
  it('devolve mensagem truncada para o cliente', () => {
    const msg = erroDeRota(new Error('x'.repeat(500)), { event: 'teste' })
    expect(msg.length).toBeLessThanOrEqual(200)
  })

  it('LOGA a mensagem inteira, mesmo quando a resposta é truncada', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Imita o formato do drizzle: o prefixo come os 200 chars e a causa fica no fim.
    const causa = 'SQLITE_BUSY: database is locked'
    erroDeRota(new Error(`Failed query: insert into "sessions" (${'"col", '.repeat(40)}) — ${causa}`), {
      event: 'teste',
    })

    const logado = spy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logado).toContain(causa)
  })

  it('a mensagem truncada NÃO contém a causa (é por isso que o log importa)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const causa = 'SQLITE_BUSY: database is locked'
    const msg = erroDeRota(new Error(`Failed query: insert into "sessions" (${'"col", '.repeat(40)}) — ${causa}`), {
      event: 'teste',
    })
    expect(msg).not.toContain(causa)
  })
})

describe('bootStatus + /api/health — P2-5', () => {
  it('boot limpo: health responde ok', async () => {
    const res = fakeRes()
    await health({} as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.boot).toBe('ok')
  })

  it('falha de migração no boot aparece no health como degraded', async () => {
    boot.registrarFalhaDeBoot('migracao-fsrs', new Error('tabela ausente'))

    const res = fakeRes()
    await health({} as any, res)

    expect(res.statusCode).toBe(503)
    expect(res.body.boot).toBe('degraded')
    expect(JSON.stringify(res.body.bootErros)).toContain('migracao-fsrs')
  })

  it('acumula mais de uma falha', async () => {
    boot.registrarFalhaDeBoot('migracao-fsrs', new Error('a'))
    boot.registrarFalhaDeBoot('backfill-tenancy', new Error('b'))
    expect((await boot.bootStatus()).erros).toHaveLength(2)
  })

  /**
   * O ESTADO ATRAVESSA O PROCESSO (auditoria de 2026-09-07, achado A34).
   *
   * Em cluster só o primário prepara os dados; os workers sobem com `prepararDados: false`. Com o
   * estado na memória, a falha do primário era invisível para eles e `/api/health` respondia
   * `degraded` ou `ok` conforme o processo sorteado pelo balanceador. O espelho de memória abaixo
   * é limpo para simular OUTRO processo lendo o mesmo banco.
   */
  it('a falha registrada por um processo é vista por outro que lê o mesmo banco', async () => {
    boot.registrarFalhaDeBoot('backfill-tenancy', new Error('b'))
    await new Promise((r) => setTimeout(r, 20)) // a escrita no banco é disparada, não aguardada
    boot.esquecerEmMemoria()
    const visto = await boot.bootStatus()
    expect(visto.ok).toBe(false)
    expect(visto.erros.map((e: any) => e.passo)).toContain('backfill-tenancy')
  })

  /** Passo que volta a dar certo apaga a linha — senão a instância fica em 503 para sempre. */
  it('sucesso posterior limpa a falha, e a saúde volta', async () => {
    boot.registrarFalhaDeBoot('migracao-fsrs', new Error('a'))
    await new Promise((r) => setTimeout(r, 20))
    boot.registrarSucessoDeBoot('migracao-fsrs')
    await new Promise((r) => setTimeout(r, 20))
    boot.esquecerEmMemoria()
    expect((await boot.bootStatus()).ok).toBe(true)
  })

  it('não vaza o texto do erro na resposta (só o passo que falhou)', async () => {
    boot.registrarFalhaDeBoot('backfill-tenancy', new Error('SEGREDO no caminho /var/x'))
    const res = fakeRes()
    await health({} as any, res)
    expect(JSON.stringify(res.body)).not.toContain('SEGREDO')
  })

  /**
   * A falha `configuracao` também se desfaz (revisão final da Fase 4): sem isto, uma variável crítica
   * corrigida deixava a linha em `boot_falhas` e o health em `degraded` até alguém apagar à mão.
   */
  it('configuração crítica ausente e depois corrigida: health volta a ok', async () => {
    const { conferirConfiguracao, verificarConfiguracaoNoBoot } = await h.load<any>('../../server/lib/config')
    const antes = { ...process.env }
    const esperarNoBanco = async (presente: boolean) => {
      for (let i = 0; i < 100; i++) {
        boot.esquecerEmMemoria() // só o banco vale: o espelho local escondia a corrida
        const passos = (await boot.bootStatus()).erros.map((e: any) => e.passo)
        if (passos.includes('configuracao') === presente) return
        await new Promise((r) => setTimeout(r, 20))
      }
      throw new Error(`o banco não refletiu a falha de configuração (esperado presente=${presente}) em 2 s`)
    }
    try {
      process.env.AUTH_REQUIRED = '1'
      const criticas: string[] = conferirConfiguracao().faltandoCriticas
      expect(criticas.length).toBeGreaterThan(0)
      verificarConfiguracaoNoBoot()
      expect((await boot.bootStatus()).erros.map((e: any) => e.passo)).toContain('configuracao')
      /* A gravação e a remoção em `boot_falhas` são disparadas sem espera (`void db…`): no Postgres de verdade a
         remoção podia chegar ANTES da inserção e a linha ficava. Espera o banco refletir cada passo. */
      await esperarNoBanco(true)

      for (const n of criticas) process.env[n] = 'x'
      expect(verificarConfiguracaoNoBoot().ok).toBe(true)
      await esperarNoBanco(false)
      const res = fakeRes()
      await health({} as any, res)
      expect(res.body.bootErros ?? []).toEqual([])
      expect(res.body.boot).toBe('ok')
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in antes)) delete process.env[k]
      Object.assign(process.env, antes)
    }
  })
})
