/**
 * FASE 6b — FLAGS NO SERVIDOR (`server/lib/flags.ts`) contra o banco efêmero migrado.
 *
 * Prova: a semente da migração 0031 existe e o payload dela passa no schema de ofertas; o cache
 * segura a leitura por 30 s e a escrita o invalida; o banco editado à mão não derruba ninguém
 * (regra ilegível desliga, payload ilegível some); a escrita valida chave, regras e payload
 * (ofertas inválidas são recusadas) e deixa rastro; e a porta de emergência vence `vender_planos`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let F: typeof import('../../server/lib/flags')
let repo: typeof import('../../server/db/repositories/flags').flagsRepo
let ofertasSchema: typeof import('../../server/lib/ofertas').ofertasSchema

beforeAll(async () => {
  h = await setupEphemeralDb()
  F = await h.load('../../server/lib/flags')
  repo = (await h.load<typeof import('../../server/db/repositories/flags')>('../../server/db/repositories/flags'))
    .flagsRepo
  ofertasSchema = (await h.load<typeof import('../../server/lib/ofertas')>('../../server/lib/ofertas')).ofertasSchema
})
afterEach(() => {
  delete process.env.CHECKOUT_ENABLED
  F.invalidarCacheDeFlags()
})
afterAll(async () => {
  await h.cleanup()
})

const ctx = { plano: 'free' as const, instalacao: '3f1c2d7e-0000-4000-8000-000000000001' }

describe('semente das migrações 0031 e 0039', () => {
  it('cria as quatro flags iniciais no estado combinado', async () => {
    const porChave = Object.fromEntries((await F.listarFlagsCruas()).map((f) => [f.chave, f]))
    expect(porChave.modo_convidado.habilitada).toBe(false)
    expect(porChave.nuvem_convidado.habilitada).toBe(false)
    expect(porChave.nuvem_convidado.regras).toEqual({ planos: ['convidado'] })
    expect(porChave.oferta_planos.habilitada, 'ligada pela 0039').toBe(true)
    expect(porChave.vender_planos.habilitada).toBe(true)
  })

  it('o payload semeado de oferta_planos passa no schema zod', async () => {
    const linha = await repo.ler('oferta_planos')
    const r = ofertasSchema.safeParse(JSON.parse(linha!.payload!))
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true)
    expect(r.data!.gatilhos.map((g) => g.momento)).toEqual(
      expect.arrayContaining(['fim_de_cota', 'cota_proxima', 'modelo_premium', 'convidado_para_conta']),
    )
  })
})

describe('cache e invalidação', () => {
  it('escrita direta no banco NÃO aparece antes do TTL; aparece depois dele', async () => {
    await F.definirFlag('cache_teste', { descricao: 'teste de cache', habilitada: false }, 'teste')
    expect((await F.avaliarParaContexto(ctx)).cache_teste.ligada).toBe(false)

    const linha = (await repo.ler('cache_teste'))!
    await repo.gravar({ ...linha, habilitada: true }) // por fora, sem invalidar
    expect((await F.avaliarParaContexto(ctx)).cache_teste.ligada, 'ainda no cache').toBe(false)

    const depois = await F.definicoesDasFlags(Date.now() + F.TTL_DO_CACHE_MS + 1)
    expect(depois.find((d) => d.chave === 'cache_teste')!.habilitada, 'TTL venceu').toBe(true)
  })

  it('definirFlag invalida o cache na hora', async () => {
    await F.definirFlag('cache_teste2', { descricao: 'x', habilitada: false }, 'teste')
    expect((await F.avaliarParaContexto(ctx)).cache_teste2.ligada).toBe(false)
    await F.definirFlag('cache_teste2', { habilitada: true }, 'teste')
    expect((await F.avaliarParaContexto(ctx)).cache_teste2.ligada).toBe(true)
  })

  it('leituras simultâneas com o cache vazio fazem uma consulta só', async () => {
    F.invalidarCacheDeFlags()
    const [a, b] = await Promise.all([F.definicoesDasFlags(), F.definicoesDasFlags()])
    expect(a).toBe(b)
  })
})

describe('o banco editado à mão não derruba ninguém', () => {
  it('regra ilegível desliga a flag; payload fora do schema é descartado', async () => {
    const agora = Date.now()
    await repo.gravar({
      chave: 'mao_regra',
      descricao: '',
      habilitada: true,
      regras: '{"percentual":"muito"}',
      payload: null,
      atualizadoEm: agora,
      atualizadoPor: 'sql',
    })
    await repo.gravar({
      chave: 'mao_json',
      descricao: '',
      habilitada: true,
      regras: '{',
      payload: '{',
      atualizadoEm: agora,
      atualizadoPor: 'sql',
    })
    const oferta = (await repo.ler('oferta_planos'))!
    await repo.gravar({ ...oferta, habilitada: true, payload: '{"gatilhos":[{"id":"x"}]}' })
    F.invalidarCacheDeFlags()

    const out = await F.avaliarParaContexto(ctx)
    expect(out.mao_regra).toEqual({ ligada: false })
    expect(out.mao_json).toEqual({ ligada: false })
    expect(out.oferta_planos).toEqual({ ligada: true }) // ligada, mas sem payload: o cliente usa o padrão
    await repo.gravar(oferta)
  })
})

describe('escrita validada', () => {
  it('recusa chave fora do formato e flag nova sem descrição', async () => {
    await expect(F.definirFlag('Chave-Ruim', { descricao: 'x' }, 't')).rejects.toThrow(/chave inválida/)
    await expect(F.definirFlag('sem_descricao', { habilitada: true }, 't')).rejects.toThrow(/descrição/)
  })

  it('recusa regra inválida com a lista do que está errado', async () => {
    const e = await F.definirFlag(
      'regra_ruim',
      { descricao: 'x', regras: { percentual: 150, planos: ['ouro'] } },
      't',
    ).catch((x) => x)
    expect(e).toBeInstanceOf(F.ErroDeFlag)
    expect(e.detalhes.join('\n')).toMatch(/percentual/)
    expect(e.detalhes.join('\n')).toMatch(/planos/)
    await expect(F.definirFlag('regra_ruim2', { descricao: 'x', regras: { desconhecida: 1 } }, 't')).rejects.toThrow(
      /regras inválidas/,
    )
  })

  it('payload de ofertas inválido é recusado; válido é aceito e sai na avaliação', async () => {
    const invalidos = [
      {
        gatilhos: [
          {
            id: 'a',
            momento: 'quando_quiser',
            componente: 'modal',
            titulo: 't',
            texto: 't',
            cta: 't',
            maxPorDia: 1,
            maxPorSemana: 1,
            intervaloMinHoras: 1,
            planos: ['free'],
          },
        ],
      },
      {
        gatilhos: [
          {
            id: 'a',
            momento: 'fim_de_cota',
            componente: 'popup',
            titulo: 't',
            texto: 't',
            cta: 't',
            maxPorDia: 1,
            maxPorSemana: 1,
            intervaloMinHoras: 1,
            planos: ['free'],
          },
        ],
      },
      {
        gatilhos: [
          {
            id: 'a',
            momento: 'fim_de_cota',
            componente: 'modal',
            titulo: '',
            texto: 't',
            cta: 't',
            maxPorDia: 1,
            maxPorSemana: 1,
            intervaloMinHoras: 1,
            planos: ['free'],
          },
        ],
      },
      {
        gatilhos: [
          {
            id: 'a',
            momento: 'fim_de_cota',
            componente: 'modal',
            titulo: 't',
            texto: 't',
            cta: 't',
            maxPorDia: 3,
            maxPorSemana: 1,
            intervaloMinHoras: 1,
            planos: ['free'],
          },
        ],
      },
      {
        gatilhos: [
          {
            id: 'a',
            momento: 'fim_de_cota',
            componente: 'modal',
            titulo: 't',
            texto: 't',
            cta: 't',
            maxPorDia: 1,
            maxPorSemana: 1,
            intervaloMinHoras: 1,
            planos: [],
          },
        ],
      },
      { gatilhos: 'nenhum' },
    ]
    for (const payload of invalidos) {
      await expect(F.definirFlag('oferta_planos', { payload }, 't'), JSON.stringify(payload)).rejects.toThrow(
        /payload inválido/,
      )
    }
    const valido = {
      gatilhos: [
        {
          id: 'um',
          momento: 'conquista',
          componente: 'banner',
          titulo: { pt: 'Parabéns', en: 'Congrats' },
          texto: 'Assine',
          cta: 'Ver',
          maxPorDia: 1,
          maxPorSemana: 2,
          intervaloMinHoras: 6,
          planos: ['free'],
        },
      ],
    }
    await F.definirFlag('oferta_planos', { habilitada: true, payload: valido }, 't')
    expect((await F.avaliarParaContexto(ctx)).oferta_planos).toEqual({ ligada: true, payload: valido })
    await F.definirFlag('oferta_planos', { habilitada: false }, 't')
  })

  it('a escrita registra quem mexeu e quando', async () => {
    const antes = Date.now()
    const f = await F.definirFlag('rastro', { descricao: 'rastro', habilitada: true }, 'admin-1')
    expect(f.atualizadoPor).toBe('admin-1')
    expect(f.atualizadoEm).toBeGreaterThanOrEqual(antes)
  })
})

describe('porta de emergência vence a flag', () => {
  it('CHECKOUT_ENABLED=0 desliga vender_planos para todos, qualquer que seja a regra', async () => {
    expect((await F.avaliarParaContexto(ctx)).vender_planos.ligada).toBe(true)
    process.env.CHECKOUT_ENABLED = '0'
    expect((await F.avaliarParaContexto(ctx)).vender_planos.ligada).toBe(false)
  })
})
