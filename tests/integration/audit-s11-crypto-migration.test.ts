/**
 * S-11/M-05 → Fase 6: a chave legada saiu do SERVIDOR.
 *
 * Histórico: segredos cifrados com a LEGACY_KEY (derivada de uma frase fixa no código-fonte) eram
 * recifrados no primeiro uso, e para isso o servidor carregava a chave. Na Fase 6 ela saiu de
 * `server/crypto.ts` — a produção nasce sem dado antigo — e ficou só no script de migração
 * `scripts/db/recifrar-segredos-legados.ts`, para quem roda self-host desde antes da correção.
 *
 * Este teste trava as duas metades: o servidor NÃO abre mais blob legado, e o script o recifra.
 */
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { beforeAll, describe, expect, it } from 'vitest'

import { type ClienteSql, recifrarLegados } from '../../scripts/db/recifrar-segredos-legados'

// Replica a cifragem LEGADA (mesma frase/sal) para fabricar um blob legado.
const LEGACY = scryptSync('dev-only-insecure-key-change-me', 'babel-play-web:secrets', 32)
function encLegacy(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', LEGACY, iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.')
}

let decryptSecret: (b: string) => string
let encryptSecret: (p: string) => string

beforeAll(async () => {
  // Chave atual determinística (evita depender do data/secret.key real).
  process.env.SECRET_KEY = 'chave-de-teste-fixa-para-o-S11-abc'
  ;({ decryptSecret, encryptSecret } = await import('../../server/crypto'))
})

/** Um "banco" em memória com a forma da tabela `secrets`. */
function bancoFalso(linhas: Array<{ ref: string; value_encrypted: string }>): ClienteSql & { linhas: typeof linhas } {
  return {
    linhas,
    async execute(q) {
      if (typeof q === 'string') return { rows: linhas.map((l) => ({ ...l })) }
      const [valor, , ref] = q.args
      const alvo = linhas.find((l) => l.ref === ref)
      if (alvo) alvo.value_encrypted = String(valor)
      return { rows: [] }
    },
  }
}

describe('Fase 6 — chave legada fora do servidor', () => {
  it('o código do servidor não contém mais a frase da chave legada', () => {
    expect(readFileSync('server/crypto.ts', 'utf8')).not.toContain('dev-only-insecure-key-change-me')
  })

  it('o servidor recusa blob da chave legada', () => {
    expect(() => decryptSecret(encLegacy('sk-segredo-legado'))).toThrow()
  })

  it('segredo na chave atual continua abrindo', () => {
    expect(decryptSecret(encryptSecret('sk-atual'))).toBe('sk-atual')
  })

  it('o script conta sem escrever, e recifra com --aplicar', async () => {
    const banco = bancoFalso([
      { ref: 'a', value_encrypted: encryptSecret('sk-atual') },
      { ref: 'b', value_encrypted: encLegacy('sk-legado') },
      { ref: 'c', value_encrypted: 'lixo.lixo.lixo' },
    ])
    const opts = { decifrarAtual: decryptSecret, cifrar: encryptSecret }

    const seco = await recifrarLegados(banco, { ...opts, aplicar: false })
    expect(seco).toEqual({ total: 3, atuais: 1, legados: 1, recifrados: 0, ilegiveis: 1 })
    expect(() => decryptSecret(banco.linhas[1].value_encrypted)).toThrow()

    const aplicado = await recifrarLegados(banco, { ...opts, aplicar: true })
    expect(aplicado.recifrados).toBe(1)
    expect(decryptSecret(banco.linhas[1].value_encrypted)).toBe('sk-legado')

    // idempotente: a segunda passada não acha mais nada legado
    const depois = await recifrarLegados(banco, { ...opts, aplicar: true })
    expect(depois).toEqual({ total: 3, atuais: 2, legados: 0, recifrados: 0, ilegiveis: 1 })
  })
})
