/**
 * FASE 6b — A AVALIAÇÃO DAS FLAGS (`src/core/flags.ts`), pura.
 *
 * O que se prova: cada regra sozinha (plano, lista de ids, idioma, versão mínima, percentual), a
 * combinação por E, o interruptor mestre, e as duas propriedades do balde que fazem o percentual
 * servir para alguma coisa — ele é DETERMINÍSTICO (o mesmo id cai sempre no mesmo balde, então a
 * flag não pisca entre requests) e se DISTRIBUI (10% é mais ou menos 10% das pessoas).
 */
import { describe, expect, it } from 'vitest'

import {
  avaliarFlag,
  avaliarFlags,
  baldeEstavel,
  compararVersoes,
  type ContextoDaFlag,
  type DefinicaoDeFlag,
  idiomaCasa,
} from '../src/core/flags'
import { OFERTAS_PADRAO, resolverTextoRemoto } from '../src/core/ofertas'

const flag = (regras: DefinicaoDeFlag['regras'], habilitada = true, chave = 'teste'): DefinicaoDeFlag => ({
  chave,
  descricao: '',
  habilitada,
  regras,
  payload: null,
})
const ctx = (c: Partial<ContextoDaFlag> = {}): ContextoDaFlag => ({ plano: 'free', ...c })

describe('interruptor mestre', () => {
  it('habilitada=false desliga para todos, inclusive quem está na lista de ids', () => {
    expect(avaliarFlag(flag({}, false), ctx())).toBe(false)
    expect(avaliarFlag(flag({ ids: ['u1'] }, false), ctx({ userId: 'u1' }))).toBe(false)
  })
  it('habilitada e sem regras: ligada para todos', () => {
    expect(avaliarFlag(flag({}), ctx({ plano: 'convidado' }))).toBe(true)
  })
})

describe('regra por plano', () => {
  it('só os planos da lista', () => {
    const f = flag({ planos: ['convidado', 'pro'] })
    expect(avaliarFlag(f, ctx({ plano: 'convidado' }))).toBe(true)
    expect(avaliarFlag(f, ctx({ plano: 'pro' }))).toBe(true)
    expect(avaliarFlag(f, ctx({ plano: 'free' }))).toBe(false)
    expect(avaliarFlag(f, ctx({ plano: 'essencial' }))).toBe(false)
  })
})

describe('regra por lista de ids', () => {
  it('quem está na lista (conta ou instalação) liga mesmo fora do plano e do percentual', () => {
    const f = flag({ ids: ['conta-1', 'inst-9'], planos: ['pro'], percentual: 0 })
    expect(avaliarFlag(f, ctx({ userId: 'conta-1' }))).toBe(true)
    expect(avaliarFlag(f, ctx({ instalacao: 'inst-9' }))).toBe(true)
    expect(avaliarFlag(f, ctx({ userId: 'outra' }))).toBe(false)
  })
})

describe('regra por idioma', () => {
  it('base casa região e vice-versa; regiões diferentes não', () => {
    expect(idiomaCasa('pt', 'pt-BR')).toBe(true)
    expect(idiomaCasa('pt-BR', 'pt')).toBe(true)
    expect(idiomaCasa('PT-br', 'pt_BR')).toBe(true)
    expect(idiomaCasa('pt-BR', 'pt-PT')).toBe(false)
    expect(idiomaCasa('en', 'pt')).toBe(false)
  })
  it('idioma desconhecido não passa numa regra de idioma', () => {
    const f = flag({ idiomas: ['pt', 'es'] })
    expect(avaliarFlag(f, ctx({ idioma: 'es' }))).toBe(true)
    expect(avaliarFlag(f, ctx({ idioma: 'en' }))).toBe(false)
    expect(avaliarFlag(f, ctx({}))).toBe(false)
  })
})

describe('regra por versão mínima', () => {
  it('compara semver ignorando o metadado de build', () => {
    expect(compararVersoes('0.1.0+35bc2d6', '0.1.0')).toBe(0)
    expect(compararVersoes('0.2.0', '0.10.0')).toBe(-1)
    expect(compararVersoes('1.0.0', '0.99.99')).toBe(1)
  })
  it('versão menor, ausente ou ilegível não passa', () => {
    const f = flag({ versaoMinima: '0.2.0' })
    expect(avaliarFlag(f, ctx({ versao: '0.2.0+abcdef1' }))).toBe(true)
    expect(avaliarFlag(f, ctx({ versao: '0.3.1' }))).toBe(true)
    expect(avaliarFlag(f, ctx({ versao: '0.1.9' }))).toBe(false)
    expect(avaliarFlag(f, ctx({}))).toBe(false)
    expect(avaliarFlag(f, ctx({ versao: 'lixo' }))).toBe(false)
  })
})

describe('regra por percentual estável', () => {
  it('o balde é determinístico: mesmo id + mesma chave = mesmo número, sempre', () => {
    const a = baldeEstavel('3f1c2d7e-0000-4000-8000-000000000001', 'modo_convidado')
    for (let i = 0; i < 5; i++) expect(baldeEstavel('3f1c2d7e-0000-4000-8000-000000000001', 'modo_convidado')).toBe(a)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(100)
  })

  it('chaves diferentes dão baldes independentes para o mesmo id', () => {
    let iguais = 0
    for (let i = 0; i < 1000; i++) {
      if (baldeEstavel(`id-${i}`, 'flag_a') === baldeEstavel(`id-${i}`, 'flag_b')) iguais++
    }
    // Independentes: coincidem ~1% das vezes (1/100), nunca a maioria.
    expect(iguais).toBeLessThan(40)
  })

  it('distribui: 10% liga para ~10% de 10 000 ids, e cada balde tem gente', () => {
    const f = flag({ percentual: 10 }, true, 'experimento')
    let ligados = 0
    const porBalde = new Array(100).fill(0)
    for (let i = 0; i < 10_000; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
      if (avaliarFlag(f, ctx({ instalacao: id }))) ligados++
      porBalde[baldeEstavel(id, 'experimento')]++
    }
    expect(ligados).toBeGreaterThan(850)
    expect(ligados).toBeLessThan(1150)
    expect(Math.min(...porBalde)).toBeGreaterThan(50)
    expect(Math.max(...porBalde)).toBeLessThan(160)
  })

  it('subir o percentual só ACRESCENTA gente (quem estava em 10% continua em 30%)', () => {
    for (let i = 0; i < 500; i++) {
      const c = ctx({ instalacao: `inst-${i}` })
      if (avaliarFlag(flag({ percentual: 10 }), c)) expect(avaliarFlag(flag({ percentual: 30 }), c)).toBe(true)
    }
  })

  it('a conta tem precedência sobre a instalação no balde', () => {
    const f = flag({ percentual: 50 })
    const comConta = avaliarFlag(f, ctx({ userId: 'conta-x', instalacao: 'inst-y' }))
    expect(comConta).toBe(avaliarFlag(f, ctx({ userId: 'conta-x' })))
  })

  it('sem id estável: só 100 passa (sortear a cada request faria a flag piscar)', () => {
    expect(avaliarFlag(flag({ percentual: 100 }), ctx())).toBe(true)
    expect(avaliarFlag(flag({ percentual: 99 }), ctx())).toBe(false)
    expect(avaliarFlag(flag({ percentual: 0 }), ctx({ instalacao: 'x' }))).toBe(false)
  })
})

describe('combinação e saída', () => {
  it('as regras se combinam com E', () => {
    const f = flag({ planos: ['free'], idiomas: ['pt'] })
    expect(avaliarFlag(f, ctx({ plano: 'free', idioma: 'pt' }))).toBe(true)
    expect(avaliarFlag(f, ctx({ plano: 'free', idioma: 'en' }))).toBe(false)
    expect(avaliarFlag(f, ctx({ plano: 'pro', idioma: 'pt' }))).toBe(false)
  })

  it('avaliarFlags devolve só ligada + payload, e payload só quando ligada', () => {
    const defs: DefinicaoDeFlag[] = [
      {
        chave: 'a',
        descricao: 'segredo da descrição',
        habilitada: true,
        regras: { ids: ['vip'], percentual: 0 },
        payload: { x: 1 },
      },
      { chave: 'b', descricao: '', habilitada: true, regras: {}, payload: { y: 2 } },
    ]
    const out = avaliarFlags(defs, ctx({ userId: 'comum' }))
    expect(out).toEqual({ a: { ligada: false }, b: { ligada: true, payload: { y: 2 } } })
    expect(JSON.stringify(out)).not.toContain('vip')
    expect(JSON.stringify(out)).not.toContain('segredo')
  })
})

describe('textos remotos das ofertas', () => {
  const t = (k: string) => `[${k}]`
  it('string é chave do i18n; objeto escolhe idioma exato → base → pt → primeiro', () => {
    expect(resolverTextoRemoto('Assine o Pro', 'en', t)).toBe('[Assine o Pro]')
    expect(resolverTextoRemoto({ pt: 'Olá', en: 'Hi' }, 'en-US', t)).toBe('Hi')
    expect(resolverTextoRemoto({ pt: 'Olá', 'en-GB': 'Hiya' }, 'en-GB', t)).toBe('Hiya')
    expect(resolverTextoRemoto({ pt: 'Olá', en: 'Hi' }, 'ja', t)).toBe('Olá')
    expect(resolverTextoRemoto({ es: 'Hola' }, 'ja', t)).toBe('Hola')
  })
  it('o padrão embutido não oferece nada', () => {
    expect(OFERTAS_PADRAO.gatilhos).toEqual([])
  })
})
