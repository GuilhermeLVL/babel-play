/**
 * A TRAVA DO SANDBOX EM PRODUÇÃO (auditoria de 15/10/2026, correção de alto valor 3).
 *
 * Sem `ASAAS_BASE_URL`, o servidor fala com o SANDBOX do Asaas (`server/lib/asaas.ts`). Com as
 * variáveis do staging copiadas para a produção, qualquer pessoa assinaria com o cartão de teste e
 * ganharia o Premium — e o boot não dizia nada (só o preflight manual avisava). Agora, com
 * `NODE_ENV=production`, a cobrança ligada (`ASAAS_API_KEY`) e a base no sandbox (ou ausente), o boot
 * ABORTA, como as outras travas de produção do `server.ts` — a menos que o ambiente DECLARE o sandbox
 * com `ASAAS_SANDBOX=1`, o que só o staging faz.
 */
import { describe, expect, it } from 'vitest'

import { erroDeAsaasSandboxEmProducao } from '../server/lib/config'
import { conferirProducao } from '../server/lib/preflightProducao'

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv
const SANDBOX = 'https://api-sandbox.asaas.com/v3'

describe('erroDeAsaasSandboxEmProducao — o boot', () => {
  it('produção + chave + base do sandbox, sem ASAAS_SANDBOX=1 → aborta', () => {
    const e = erroDeAsaasSandboxEmProducao(env({ NODE_ENV: 'production', ASAAS_API_KEY: 'k', ASAAS_BASE_URL: SANDBOX }))
    expect(e).toMatch(/sandbox/i)
    expect(e).toMatch(/ASAAS_SANDBOX=1/)
  })

  it('produção + chave + base AUSENTE (o padrão do servidor é o sandbox) → aborta', () => {
    expect(erroDeAsaasSandboxEmProducao(env({ NODE_ENV: 'production', ASAAS_API_KEY: 'k' }))).toMatch(/sandbox/i)
    expect(
      erroDeAsaasSandboxEmProducao(env({ NODE_ENV: 'production', ASAAS_API_KEY: 'k', ASAAS_BASE_URL: '  ' })),
    ).toMatch(/sandbox/i)
  })

  it('o staging declara o sandbox com ASAAS_SANDBOX=1 → sobe', () => {
    expect(
      erroDeAsaasSandboxEmProducao(
        env({ NODE_ENV: 'production', ASAAS_API_KEY: 'k', ASAAS_BASE_URL: SANDBOX, ASAAS_SANDBOX: '1' }),
      ),
    ).toBeNull()
  })

  it('qualquer outro valor de ASAAS_SANDBOX não declara nada', () => {
    expect(
      erroDeAsaasSandboxEmProducao(
        env({ NODE_ENV: 'production', ASAAS_API_KEY: 'k', ASAAS_BASE_URL: SANDBOX, ASAAS_SANDBOX: 'sim' }),
      ),
    ).toMatch(/sandbox/i)
  })

  it('produção apontando para a API de produção do Asaas → sobe', () => {
    expect(
      erroDeAsaasSandboxEmProducao(
        env({ NODE_ENV: 'production', ASAAS_API_KEY: 'k', ASAAS_BASE_URL: 'https://api.asaas.com/v3' }),
      ),
    ).toBeNull()
  })

  it('sem a cobrança ligada (sem ASAAS_API_KEY) não há o que travar', () => {
    expect(erroDeAsaasSandboxEmProducao(env({ NODE_ENV: 'production' }))).toBeNull()
  })

  it('fora de produção o sandbox é o padrão certo', () => {
    expect(erroDeAsaasSandboxEmProducao(env({ NODE_ENV: 'development', ASAAS_API_KEY: 'k' }))).toBeNull()
  })
})

describe('o preflight segue o boot', () => {
  const base = {
    NODE_ENV: 'production',
    ASAAS_API_KEY: '$aact_hmlg_chave',
    ASAAS_BASE_URL: SANDBOX,
  }
  const nivel = (v: Record<string, string>) =>
    conferirProducao(v)
      .filter((x) => x.nome === 'ASAAS_BASE_URL')
      .map((x) => x.nivel)

  it('sandbox sem ASAAS_SANDBOX=1 BLOQUEIA (o boot abortaria)', () => {
    expect(nivel(base)).toEqual(['BLOQUEIA'])
    const { ASAAS_BASE_URL: _fora, ...ausente } = base
    expect(nivel(ausente)).toEqual(['BLOQUEIA'])
  })

  it('sandbox declarado (o staging) só AVISA', () => {
    expect(nivel({ ...base, ASAAS_SANDBOX: '1' })).toEqual(['AVISA'])
  })
})
