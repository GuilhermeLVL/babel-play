import { spawnSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import { paresRecusados, selecionarPares, todosOsPares } from '../scripts/modelos/publicar-bergamot-no-r2'

const todos = Object.keys(todosOsPares())

describe('selecionarPares (--pares do publicar-bergamot-no-r2)', () => {
  it.each([['all'], [''], [undefined], [' all '], ['all,es-en']])('%j = todos os pares', (v) => {
    expect(selecionarPares(v)).toEqual(todos)
  })
  it('lista explícita escolhe só os pedidos', () => {
    expect(selecionarPares('es-en,fr-en')).toEqual(['es-en', 'fr-en'])
  })
  it('par desconhecido lança com a lista dos conhecidos', () => {
    expect(() => selecionarPares('ja-ne')).toThrow(/ja-ne[\s\S]*es-en/)
  })
  it('há ao menos os 15 pares do CDN', () => {
    expect(todos.length).toBeGreaterThanOrEqual(15)
  })
})

describe('portão de licença e aprovação do dono (openspec traducao-local-por-direcao, 1.3)', () => {
  it('todo par do catálogo traz licencaPesos, licencaDados "não informada" e aprovadoPeloDono false por padrão', () => {
    for (const [par, cfg] of Object.entries(todosOsPares())) {
      expect(cfg.licencaPesos, par).toBe('MPL-2.0')
      expect(cfg.licencaDados, par).toBe('não informada')
      expect(cfg.aprovadoPeloDono, par).toBe(false)
    }
  })

  it('paresRecusados: sem aprovação ou sem licença dos pesos é recusado; só aprovado e com licença passa', () => {
    const base = { execucao: 'r', caminhoNaOrigem: 'c/', arquivos: {} }
    const pares = {
      ok: { ...base, licencaPesos: 'MPL-2.0', aprovadoPeloDono: true },
      semAprovacao: { ...base, licencaPesos: 'MPL-2.0', aprovadoPeloDono: false },
      semCampo: { ...base, licencaPesos: 'MPL-2.0' },
      semLicenca: { ...base, aprovadoPeloDono: true },
      licencaVazia: { ...base, licencaPesos: '  ', aprovadoPeloDono: true },
    }
    expect(paresRecusados(Object.keys(pares), pares)).toEqual([
      'semAprovacao',
      'semCampo',
      'semLicenca',
      'licencaVazia',
    ])
    expect(paresRecusados(['ok'], pares)).toEqual([])
    expect(paresRecusados(['desconhecido'], pares)).toEqual(['desconhecido'])
  })

  it('--seco com par não aprovado sai com erro e cita o par (nada é enviado)', () => {
    const r = spawnSync(
      'npx',
      ['tsx', 'scripts/modelos/publicar-bergamot-no-r2.ts', '--bucket=teste', '--seco', '--pares=es-en'],
      {
        encoding: 'utf8',
        env: { ...process.env, S3_ENDPOINT: '', S3_ACCESS_KEY_ID: '', S3_SECRET_ACCESS_KEY: '' },
      },
    )
    expect(r.status).toBe(3)
    expect(r.stderr).toMatch(/RECUSADO[\s\S]*es-en[\s\S]*Nada foi enviado/)
    expect(r.stdout).not.toMatch(/bergamot\/es-en\//)
  }, 60_000)
})
