/**
 * COMPATIBILIDADE DA API — nenhuma rota do contrato some sem passar pela depreciação (Fase 6).
 * A política está em `docs/versionamento.md`; o portão de CI é `scripts/testes/contrato-api.mjs`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  ARQ_CONTRATO,
  ARQ_DEPRECIACOES,
  compararVersoes,
  conferirContrato,
  removivelAPartirDe,
  rotasAtuais,
} from '../../scripts/testes/contrato-api.mjs'

const versaoAtual = JSON.parse(readFileSync('package.json', 'utf8')).version as string
const contrato = JSON.parse(readFileSync(ARQ_CONTRATO, 'utf8')).rotas as string[]
const depreciacoes = JSON.parse(readFileSync(ARQ_DEPRECIACOES, 'utf8')).depreciacoes as {
  rota: string
  depreciadaEm: string
  motivo: string
}[]

describe('contrato da API contra o servidor de hoje', () => {
  it('toda rota do contrato ainda existe, ou saiu depois do prazo de depreciação', () => {
    const r = conferirContrato({ atuais: rotasAtuais(), contrato, depreciacoes, versaoAtual })
    expect(r.erros).toEqual([])
  })

  it('o contrato está em dia (rota nova é livre, mas precisa ser registrada com --atualizar)', () => {
    const r = conferirContrato({ atuais: rotasAtuais(), contrato, depreciacoes, versaoAtual })
    expect(r.novas, 'rode: node scripts/testes/contrato-api.mjs --atualizar').toEqual([])
  })

  it('o censo enxerga as rotas de sempre (um censo vazio passaria tudo)', () => {
    const atuais = rotasAtuais()
    expect(atuais.length).toBeGreaterThan(50)
    expect(atuais).toContain('GET /api/health')
    expect(atuais).toContain('GET /api/ready')
  })
})

describe('conferirContrato — as regras', () => {
  const base = ['GET /api/a', 'GET /api/b', 'POST /api/c']

  it('rota que sumiu sem depreciação reprova', () => {
    const r = conferirContrato({
      atuais: ['GET /api/a', 'POST /api/c'],
      contrato: base,
      depreciacoes: [],
      versaoAtual: '0.5.0',
    })
    expect(r.erros).toHaveLength(1)
    expect(r.erros[0]).toMatch(/^GET \/api\/b sumiu do servidor sem depreciação/)
  })

  it('depreciada há menos de duas minor ainda não pode sumir', () => {
    const dep = [{ rota: 'GET /api/b', depreciadaEm: '0.4.1', motivo: 'substituída por /api/b2' }]
    const r = conferirContrato({
      atuais: ['GET /api/a', 'POST /api/c'],
      contrato: base,
      depreciacoes: dep,
      versaoAtual: '0.5.3',
    })
    expect(r.erros[0]).toMatch(/só pode sumir a partir de 0\.6\.0/)
  })

  it('depreciada há duas minor (ou uma major) pode sumir', () => {
    const dep = [{ rota: 'GET /api/b', depreciadaEm: '0.4.1', motivo: 'substituída por /api/b2' }]
    for (const versaoAtual of ['0.6.0', '1.0.0']) {
      const r = conferirContrato({
        atuais: ['GET /api/a', 'POST /api/c'],
        contrato: base,
        depreciacoes: dep,
        versaoAtual,
      })
      expect(r.erros).toEqual([])
      expect(r.removidas).toEqual(['GET /api/b'])
    }
  })

  it('rota nova é aditiva: não é erro, aparece em `novas`', () => {
    const r = conferirContrato({
      atuais: [...base, 'GET /api/d'],
      contrato: base,
      depreciacoes: [],
      versaoAtual: '0.1.0',
    })
    expect(r.erros).toEqual([])
    expect(r.novas).toEqual(['GET /api/d'])
  })

  it('depreciação sem motivo é erro', () => {
    const r = conferirContrato({
      atuais: base,
      contrato: base,
      depreciacoes: [{ rota: 'GET /api/b', depreciadaEm: '0.1.0', motivo: '' }],
      versaoAtual: '0.1.0',
    })
    expect(r.erros[0]).toMatch(/incompleta/)
  })

  it('aritmética de versão', () => {
    expect(removivelAPartirDe('1.2.7')).toBe('1.4.0')
    expect(compararVersoes('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compararVersoes('1.0.0', '1.0.0')).toBe(0)
  })
})
