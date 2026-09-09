/**
 * FASE 4 — O DIÁRIO NÃO GUARDA O CONTEÚDO DO USUÁRIO.
 *
 * O `logger.ts` tem allowlist de CAMPOS desde o M-01, e o comentário dele promete que
 * "transcrição, chave de API ou texto de prompt do usuário NUNCA vão para o log". A allowlist é
 * sobre a CHAVE, não sobre o VALOR — e `error` é uma chave permitida que carrega texto livre.
 *
 * A MEDIÇÃO (2026-09-09), reproduzida no primeiro `describe` deste arquivo: o drizzle escreve os
 * VALORES VINCULADOS dentro de `message`, de `stack` e de uma propriedade `params`. O driver do
 * libsql sozinho não faz isso. Ou seja, toda escrita que falhava — salvar transcrição, gravar
 * cartão, guardar credencial — despejava o conteúdo no `error`, entrando por dentro do único
 * campo que a allowlist deixa passar.
 *
 * Este arquivo é a rede: se alguém tirar `redigirErro` de `log()`, ou acrescentar um campo de
 * texto livre sem redigi-lo, os casos abaixo falham.
 */
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { log } from '../../server/lib/logger'
import { redigirErro } from '../../server/lib/redacao'

/** Um valor com a cara do que este produto guarda: texto do usuário, e identificável. */
const SEGREDO = 'transcricao-do-usuario-meu-cpf-e-123.456.789-00'

afterEach(() => {
  vi.restoreAllMocks()
})

/** Captura tudo que sai por `console.*` durante `f`. */
function saidaDe(f: () => void): string {
  const linhas: string[] = []
  const captura = (...a: unknown[]) => {
    linhas.push(a.map(String).join(' '))
  }
  vi.spyOn(console, 'log').mockImplementation(captura)
  vi.spyOn(console, 'warn').mockImplementation(captura)
  vi.spyOn(console, 'error').mockImplementation(captura)
  f()
  return linhas.join('\n')
}

describe('a medição: de onde vem o vazamento', () => {
  const t = sqliteTable('t', {
    id: integer('id').primaryKey(),
    texto: text('texto').notNull().unique(),
  })

  it('o drizzle anexa os parâmetros vinculados ao erro — o driver do libsql não', async () => {
    const c = createClient({ url: ':memory:' })
    const db = drizzle(c)
    await c.execute('CREATE TABLE t (id integer primary key, texto text not null unique)')
    await db.insert(t).values({ id: 1, texto: SEGREDO })

    // Pelo DRIVER: a mensagem é só a restrição violada.
    await expect(c.execute({ sql: 'INSERT INTO t VALUES (?,?)', args: [2, SEGREDO] })).rejects.toThrow(
      /UNIQUE constraint failed/,
    )
    try {
      await c.execute({ sql: 'INSERT INTO t VALUES (?,?)', args: [2, SEGREDO] })
    } catch (err) {
      expect(String(err), 'o libsql não deveria carregar o valor').not.toContain(SEGREDO)
    }

    // Pelo DRIZZLE: a mesma escrita, e o valor está na mensagem E no stack.
    try {
      await db.insert(t).values({ id: 2, texto: SEGREDO })
      throw new Error('a escrita deveria ter falhado')
    } catch (err) {
      const e = err as Error
      expect(String(e), 'é isto que ia para o log').toContain(SEGREDO)
      expect(e.stack ?? '').toContain(SEGREDO)

      // E o elo entre a medição e o conserto: o erro REAL, passando pelo caminho real.
      const saida = saidaDe(() => {
        log('error', {
          event: 'sessions_create_error',
          error: String(e).slice(0, 300),
          stack: (e.stack ?? '').slice(0, 1200),
        })
      })
      expect(saida, 'o valor do usuário não pode sobreviver ao log').not.toContain(SEGREDO)
      expect(saida, 'a query continua dizendo onde quebrou').toContain('insert into')
      expect(saida, 'os quadros do stack continuam lá').toMatch(/at /)
    }
    c.close()
  })
})

describe('redigirErro', () => {
  it('corta os parâmetros do drizzle e mantém a query, que é o que diz onde quebrou', () => {
    const bruto = `Failed query: insert into "sessions" ("id", "texto") values (?, ?)\nparams: 7,${SEGREDO}`
    const limpo = redigirErro(bruto)
    expect(limpo).not.toContain(SEGREDO)
    expect(limpo, 'a query tem que sobreviver').toContain('insert into "sessions"')
    expect(limpo).toContain('[redigido]')
  })

  it('corta e-mail', () => {
    expect(redigirErro('conta duplicada: alguem.sobrenome+tag@exemplo.com.br')).not.toMatch(/alguem/)
  })

  it('corta as três formas de segredo que este servidor manuseia', () => {
    expect(redigirErro('Authorization: Bearer abc123.def-456_ghi')).not.toContain('abc123')
    expect(redigirErro('provedor recusou sk-proj-AAAABBBBCCCCDDDD')).not.toContain('AAAABBBB')
    expect(redigirErro('gsk_1234567890abcdefgh falhou')).not.toContain('1234567890abcdef')
    expect(redigirErro('key=AIzaSyA1234567890abcdef')).not.toContain('SyA1234567890')
    expect(redigirErro('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.assinatura')).not.toContain('eyJzdWIiOiIxIn0')
  })

  it('é idempotente: aplicada de novo, não muda mais nada', () => {
    const uma = redigirErro(`params: ${SEGREDO}`)
    expect(redigirErro(uma)).toBe(uma)
  })

  it('não estraga uma mensagem de erro comum', () => {
    // Um redator que corrompe a mensagem custa mais do que resolve — é por isso que ele não tenta
    // adivinhar CPF ou telefone por formato.
    const comum = 'SQLITE_BUSY: database is locked (tentativa 3 de 5, 250ms)'
    expect(redigirErro(comum)).toBe(comum)
  })
})

describe('log() aplica a redação — o chokepoint é lá, não nos chamadores', () => {
  it('o campo error sai redigido', () => {
    const saida = saidaDe(() => {
      log('error', {
        event: 'sessions_create_error',
        error: `Failed query: insert into "sessions" ...\nparams: 7,${SEGREDO}`,
      })
    })
    expect(saida).not.toContain(SEGREDO)
    expect(saida).toContain('sessions_create_error')
  })

  it('o campo stack também — é ele que carrega a cópia da mensagem', () => {
    const saida = saidaDe(() => {
      log('error', { event: 'erro_nao_tratado', stack: `Error: Failed query\nparams: ${SEGREDO}\n    at algo` })
    })
    expect(saida).not.toContain(SEGREDO)
    expect(saida, 'o quadro do stack é o que resta de útil').toContain('at algo')
  })

  it('a linha continua sendo UM JSON por evento', () => {
    const saida = saidaDe(() => {
      log('error', { event: 'x', stack: 'Error: y\n    at a\n    at b' })
    })
    // Uma chamada, uma linha: `JSON.parse` da saída inteira tem que funcionar.
    const obj = JSON.parse(saida) as Record<string, unknown>
    expect(obj.event).toBe('x')
    expect(obj.level).toBe('error')
    expect(typeof obj.stack).toBe('string')
  })

  it('a allowlist continua valendo: campo fora da lista não sai', () => {
    const saida = saidaDe(() => {
      log('info', { event: 'x', transcricao: SEGREDO } as never)
    })
    expect(saida).not.toContain(SEGREDO)
  })
})
