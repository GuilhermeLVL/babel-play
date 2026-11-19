/**
 * A VOZ NATURAL PELO OPENROUTER (change `voz-natural-openrouter`, 17/11/2026): o Kokoro (o padrão, o mais barato) e o
 * MAI-Voice (a voz "boa", desligada por padrão) pelo `POST /audio/speech` do OpenRouter, com a chave que o app já usa.
 *
 * O que se prova aqui, sem rede:
 *   - o pedido leva `provider: { zdr: true, data_collection: "deny" }` SEMPRE que a base é do OpenRouter (e só nela);
 *   - a voz sai do IDIOMA (o Kokoro e o MAI escolhem o idioma pela voz): pt → pf_dora, en → af_heart, es → ef_dora;
 *     no MAI, o id inteiro `pt-BR-Luana:MAI-Voice-2.1-Flash`;
 *   - modelo de voz do OpenRouter fora da lista de retenção zero conferida não vira perna, e o registro o recusa;
 *   - o MAI (nível `boa`) não atende plano de voz `basica`;
 *   - só plano PAGO com `vozNatural` usa a voz da nuvem: Grátis, convidado e teste nunca;
 *   - o preço por caractere no orçamento.
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  CAMPOS_DE_CLONAGEM,
  corpoDoPedidoDeVoz,
  falaOIdioma,
  montarPedidoDeVoz,
  pernasDeVoz,
  pernasDoNivelDeVoz,
  vozComRetencaoZero,
  vozDoModelo,
} from '../server/ai/provedoresDeVoz'
import { esquecerRegistro, type Provedor, validarRegistro } from '../server/ai/registroDeProvedores'
import { custoDeTts } from '../server/lib/orcamentoDeIa'
import { FRANQUIA_DO_TESTE, PLAN_MATRIX } from '../src/core/planos'
import {
  MODELO_DE_VOZ_BOA_DO_OPENROUTER,
  MODELO_DE_VOZ_DO_OPENROUTER,
  vozDaNuvemLiberada,
} from '../src/core/vozNatural'

const OPENROUTER = 'https://openrouter.ai/api/v1'
const perna = (model: string, base = OPENROUTER): Provedor => ({
  rotulo: 'tts-primario',
  base,
  apiKey: 'chave-falsa',
  model,
  fornecedor: 'openrouter',
  formato: 'openai',
})
const KOKORO = 'hexgrad/kokoro-82m'
const MAI = 'microsoft/mai-voice-2.1-flash'
const pedido = (idioma: string, bcp47: string, voz?: string) => ({
  texto: 'Onde fica a estação?',
  idioma,
  bcp47,
  ...(voz ? { voz } : {}),
})

const registro = (modelos: Array<Record<string, unknown>>) => ({
  provedores: [
    {
      id: 'openrouter',
      formato: 'openai',
      base: OPENROUTER,
      chave: 'OPENROUTER_API_KEY',
      retencao: 'zdr',
      roteamento: { data_collection: 'deny', zdr: true, ignore: ['google-ai-studio', 'google-vertex'] },
      modelos,
    },
  ],
})

afterEach(() => {
  delete process.env.IA_PROVEDORES
  delete process.env.OPENROUTER_API_KEY
  esquecerRegistro()
})

describe('os modelos do OpenRouter', () => {
  it('o padrão é o Kokoro (o mais barato); a voz boa é o MAI-Voice 2.1 Flash', () => {
    expect(MODELO_DE_VOZ_DO_OPENROUTER).toBe(KOKORO)
    expect(MODELO_DE_VOZ_BOA_DO_OPENROUTER).toBe(MAI)
  })
})

describe('o pedido ao OpenRouter', () => {
  it('Kokoro: /audio/speech, mp3, a voz do idioma e o provider de retenção zero', () => {
    const { url, init } = montarPedidoDeVoz(perna(KOKORO), pedido('pt', 'pt-BR'))
    expect(url).toBe('https://openrouter.ai/api/v1/audio/speech')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer chave-falsa')
    expect(JSON.parse(String(init.body))).toEqual({
      model: KOKORO,
      input: 'Onde fica a estação?',
      response_format: 'mp3',
      voice: 'pf_dora',
      provider: { zdr: true, data_collection: 'deny' },
    })
  })

  it('Kokoro: a voz segue o idioma; a pedida vale só se é do idioma', () => {
    expect(vozDoModelo(KOKORO, undefined, 'en', 'en-US')).toBe('af_heart')
    expect(vozDoModelo(KOKORO, undefined, 'es', 'es-ES')).toBe('ef_dora')
    expect(vozDoModelo(KOKORO, 'pm_alex', 'pt', 'pt-BR')).toBe('pm_alex')
    /* Uma voz de outro idioma leria português com sotaque de outro: cai na do idioma. */
    expect(vozDoModelo(KOKORO, 'af_heart', 'pt', 'pt-BR')).toBe('pf_dora')
    expect(vozDoModelo(KOKORO, 'Luana', 'pt', 'pt-BR')).toBe('pf_dora')
  })

  it('MAI-Voice: o id inteiro com a região e o sufixo do modelo', () => {
    expect(corpoDoPedidoDeVoz(perna(MAI), pedido('pt', 'pt-BR', 'Luana'))).toMatchObject({
      model: MAI,
      voice: 'pt-BR-Luana:MAI-Voice-2.1-Flash',
      provider: { zdr: true, data_collection: 'deny' },
    })
    expect(vozDoModelo(MAI, undefined, 'pt', 'pt-PT')).toBe('pt-PT-Rui:MAI-Voice-2.1-Flash')
    expect(vozDoModelo(MAI, undefined, 'es', 'es-ES')).toBe('es-ES-Marta:MAI-Voice-2.1-Flash')
    expect(vozDoModelo(MAI, undefined, 'es', 'es-MX')).toBe('es-MX-Valeria:MAI-Voice-2.1-Flash')
    /* Região que o modelo não tem: a primeira da língua. */
    expect(vozDoModelo(MAI, undefined, 'zh', 'cmn-CN')).toBe('zh-CN-Lan:MAI-Voice-2.1-Flash')
  })

  it('quem fala o quê', () => {
    expect(falaOIdioma(perna(KOKORO), 'pt')).toBe(true)
    expect(falaOIdioma(perna(KOKORO), 'de')).toBe(false)
    expect(falaOIdioma(perna(MAI), 'de')).toBe(true)
  })

  it('fora do OpenRouter, o mesmo modelo vai sem o campo provider', () => {
    const corpo = corpoDoPedidoDeVoz(perna(KOKORO, 'https://api.deepinfra.com/v1/openai'), pedido('pt', 'pt-BR'))
    expect(corpo).not.toHaveProperty('provider')
  })

  it('nenhum pedido ao OpenRouter leva campo de clonagem (input_references incluso)', () => {
    expect(CAMPOS_DE_CLONAGEM).toContain('input_references')
    for (const modelo of [KOKORO, MAI])
      for (const voz of [undefined, 'input_references', 'voice_id', 'Luana', 'pf_dora']) {
        const { init } = montarPedidoDeVoz(perna(modelo), pedido('pt', 'pt-BR', voz))
        const corpo = JSON.parse(String(init.body)) as Record<string, unknown>
        expect(Object.keys(corpo).filter((k) => CAMPOS_DE_CLONAGEM.includes(k))).toEqual([])
      }
  })
})

describe('retenção zero obrigatória', () => {
  it('modelo de voz do OpenRouter fora da lista conferida não vira perna (o registro inteiro é recusado)', () => {
    process.env.IA_PROVEDORES = JSON.stringify(
      registro([
        { id: 'elevenlabs/eleven-flash-v2.5', funcoes: ['tts'] },
        { id: KOKORO, funcoes: ['tts'] },
      ]),
    )
    process.env.OPENROUTER_API_KEY = 'k'
    expect(pernasDeVoz()).toEqual([])
    /* A segunda trava, na perna: vale também para perna montada fora do registro. */
    expect(vozComRetencaoZero(perna('elevenlabs/eleven-flash-v2.5'))).toBe(false)
    expect(vozComRetencaoZero(perna(KOKORO))).toBe(true)
    expect(vozComRetencaoZero(perna('elevenlabs/eleven-flash-v2.5', 'https://api.deepinfra.com/v1/openai'))).toBe(true)
    expect(() => montarPedidoDeVoz(perna('elevenlabs/eleven-flash-v2.5'), pedido('pt', 'pt-BR'))).toThrow(
      /retenção zero/,
    )
  })

  it('o registro recusa voz do OpenRouter sem retenção zero conferida (e o :free)', () => {
    const r = validarRegistro(registro([{ id: 'fish-audio/s2.1-pro-free:free', funcoes: ['tts'] }]), {
      producao: false,
    })
    expect(r.ok === false && r.erros.join(' ')).toMatch(/retenção zero/)
    expect(validarRegistro(registro([{ id: KOKORO, funcoes: ['tts'] }]), { producao: true }).ok).toBe(true)
  })
})

describe('o nível da voz do plano', () => {
  it('a voz boa (MAI) só atende quem tem o nível boa; a básica atende os dois', () => {
    const pernas = [perna(MAI), perna(KOKORO)]
    expect(pernasDoNivelDeVoz(pernas, 'basica').map((p) => p.model)).toEqual([KOKORO])
    expect(pernasDoNivelDeVoz(pernas, 'boa').map((p) => p.model)).toEqual([MAI, KOKORO])
    expect(pernasDoNivelDeVoz(pernas, 'aparelho')).toEqual([])
  })
})

describe('só planos pagos', () => {
  const de = (plan: keyof typeof PLAN_MATRIX | 'convidado', emTeste = false) => ({
    plan,
    vozNatural: plan === 'convidado' ? false : PLAN_MATRIX[plan].entitlements.vozNatural,
    emTeste,
  })

  it('pago com vozNatural: sim; Grátis, Essencial (sem a capacidade), convidado e teste: nunca', () => {
    for (const p of ['plus', 'premium', 'familia', 'pro4', 'aovivo'] as const)
      expect(vozDaNuvemLiberada(de(p))).toBe(true)
    expect(vozDaNuvemLiberada(de('free'))).toBe(false)
    expect(vozDaNuvemLiberada(de('essencial'))).toBe(false)
    expect(vozDaNuvemLiberada(de('convidado'))).toBe(false)
    expect(vozDaNuvemLiberada(de('premium', true))).toBe(false)
    expect(vozDaNuvemLiberada(de('plus', true))).toBe(false)
    /* A capacidade forjada num plano sem preço não abre a nuvem do dono. */
    expect(vozDaNuvemLiberada({ plan: 'free', vozNatural: true, emTeste: false })).toBe(false)
  })

  it('o self-host usa a chave do próprio dono da instância: liberado', () => {
    expect(vozDaNuvemLiberada(de('selfhost'))).toBe(true)
  })

  it('o teste não tem franquia de voz da nuvem', () => {
    expect(FRANQUIA_DO_TESTE.vozCaracteresMes).toBe(0)
  })
})

describe('o custo no orçamento', () => {
  it('Kokoro no pior endpoint de retenção zero (US$ 4/1M); MAI-Voice Flash a US$ 15/1M', () => {
    expect(custoDeTts(KOKORO, 1_000_000, { fornecedor: 'openrouter' })).toBeCloseTo(4, 6)
    expect(custoDeTts(MAI, 1_000_000, { fornecedor: 'openrouter' })).toBeCloseTo(15, 6)
  })
})
