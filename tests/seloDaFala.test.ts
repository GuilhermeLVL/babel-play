/**
 * O SELO DA FALA (etapa 5 de `planos-v3-e-rota-inteligente`, spec `transparencia-da-fala`): a tabela
 * previsto × real. O previsto é a decisão da política; o real é o motor que atendeu a última fala
 * final. A REGRA DE OURO: o selo nunca diz "No aparelho" se o motor real mandou o áudio para fora.
 */
import { describe, expect, it } from 'vitest'

import { exigeConsentimento, REGISTRO_DE_MOTORES } from '../src/core/harness/registroDeMotores'
import {
  type AparelhoDaRota,
  decidirRota,
  type DecisaoDeRota,
  type EstadoDaRota,
  type PedidoDeRota,
  type PlanoDaRota,
} from '../src/core/rota/politicaDeRota'
import { motorDaUltimaFala, previstosDoSelo, seloDaFala, textoDoSelo } from '../src/lib/captura/seloDaFala'

// ───────────────────────────── o pedido ─────────────────────────────

const desktop: AparelhoDaRota = {
  tipo: 'desktop-com-gpu',
  leve: false,
  travando: false,
  gpuProvada: true,
  economiaDeDados: false,
  smallNaGpu: true,
  whisperNaGpu: false,
  shaderF16: false,
  navegador: { fala: false, falaNoAparelho: null, bipaAoReligar: false, tradutor: false },
  modelos: { opusMt: true, bergamot: false, llmLocal: false },
}
const semTeto = { trechosNoMesS: null, trechosNoDiaS: null, aoVivoNoMesS: null, aoVivoNoDiaS: null }
const gratis: PlanoDaRota = {
  nuvemPorTrechos: false,
  precisaoPorPadrao: false,
  nuvemAoVivo: false,
  traducaoNaNuvem: false,
  nuance: false,
  vozNeural: false,
  restante: semTeto,
}
const premium: PlanoDaRota = { ...gratis, nuvemPorTrechos: true, precisaoPorPadrao: true, traducaoNaNuvem: true }
const aberto: EstadoDaRota = {
  consentimentos: { nuvem: true, navegador: false },
  perfilPrivado: false,
  perfilProtegido: false,
  responsavelAutorizou: false,
  nuvemDisponivel: true,
  nuvemPausada: false,
  semRede: false,
  edicaoEstatica: false,
  nuvemDoSite: false,
  preferencia: { qualidade: 'auto', microfone: 'modelo' },
}

function pedido(p: { plano?: PlanoDaRota; estado?: Partial<EstadoDaRota>; extra?: Partial<PedidoDeRota> } = {}) {
  return {
    tarefa: 'stt-final',
    fonte: 'sistema',
    idioma: 'pt',
    aparelho: desktop,
    plano: p.plano ?? gratis,
    estado: { ...aberto, ...p.estado },
    ...p.extra,
  } satisfies PedidoDeRota
}

/** O microfone pelo reconhecimento do navegador: `noAparelho` diz se o navegador reconhece localmente. */
function pedidoDoMic(noAparelho: boolean, consentiu = true): PedidoDeRota {
  return pedido({
    estado: {
      consentimentos: { nuvem: true, navegador: consentiu },
      preferencia: { qualidade: 'auto', microfone: 'navegador' },
    },
    extra: {
      fonte: 'microfone',
      aparelho: {
        ...desktop,
        navegador: {
          fala: true,
          falaNoAparelho: noAparelho ? 'available' : 'unavailable',
          bipaAoReligar: false,
          tradutor: false,
        },
      },
    },
  })
}

const noAparelho = decidirRota(pedido())
const naNuvem = decidirRota(pedido({ plano: premium }))
const peloNavegador = decidirRota(pedidoDoMic(false))
const navegadorLocal = decidirRota(pedidoDoMic(true))

const PREVISTOS: Record<string, DecisaoDeRota> = { noAparelho, naNuvem, peloNavegador, navegadorLocal }

describe('os previstos do teste são o que dizem ser', () => {
  it('cada decisão cai no lugar esperado', () => {
    expect(noAparelho.processamento).toEqual({ onde: 'aparelho', enviaDadosA: null })
    expect(naNuvem.processamento).toEqual({ onde: 'nuvem', enviaDadosA: 'nos' })
    expect(peloNavegador.processamento.onde).toBe('navegador')
    expect(peloNavegador.processamento.enviaDadosA).not.toBeNull()
    expect(navegadorLocal.processamento).toEqual({ onde: 'navegador', enviaDadosA: null })
  })
})

// ───────────────────────────── antes da primeira fala ─────────────────────────────

describe('antes da primeira fala vale o previsto, sem afirmar o que ainda não aconteceu', () => {
  it('modelo local: "Vai rodar no aparelho"', () => {
    const selo = seloDaFala(noAparelho, null)
    expect(selo).toMatchObject({
      onde: 'aparelho',
      etiqueta: 'Vai rodar no aparelho',
      detalhe: 'seu áudio não vai sair daqui',
      saiDoAparelho: false,
      confirmado: false,
      mudou: false,
    })
    expect(selo?.motivo).toEqual(noAparelho.explicacao)
  })

  it('nuvem do Babel prevista', () => {
    expect(seloDaFala(naNuvem)).toMatchObject({
      onde: 'nuvem',
      etiqueta: 'Vai pela Nuvem do Babel',
      detalhe: 'o áudio vai para o nosso servidor',
      saiDoAparelho: true,
      confirmado: false,
    })
  })

  it('fala do navegador que envia ao fabricante', () => {
    expect(seloDaFala(peloNavegador)).toMatchObject({
      onde: 'navegador',
      etiqueta: 'Vai pelo navegador',
      detalhe: 'o áudio vai para o serviço de fala do navegador',
      saiDoAparelho: true,
    })
  })

  it('fala do navegador processada no aparelho é "no aparelho"', () => {
    expect(seloDaFala(navegadorLocal)).toMatchObject({ onde: 'aparelho', etiqueta: 'Vai rodar no aparelho' })
  })

  it('com duas fontes, o previsto mostrado é o que mais expõe o áudio', () => {
    expect(seloDaFala([noAparelho, peloNavegador])).toMatchObject({ onde: 'navegador', saiDoAparelho: true })
    expect(seloDaFala([navegadorLocal, naNuvem])).toMatchObject({ onde: 'nuvem', saiDoAparelho: true })
  })

  it('sem previsto e sem fala não há selo', () => {
    expect(seloDaFala(null, null)).toBeNull()
    expect(seloDaFala([], undefined)).toBeNull()
  })
})

// ───────────────────────────── previsto × real ─────────────────────────────

describe('depois de uma fala vale o motor que a atendeu', () => {
  it('previsto e real no aparelho: "No aparelho", com o motivo da política', () => {
    expect(seloDaFala(noAparelho, 'whisper-local')).toEqual({
      onde: 'aparelho',
      etiqueta: 'No aparelho',
      detalhe: 'seu áudio não sai daqui',
      motivo: noAparelho.explicacao,
      saiDoAparelho: false,
      confirmado: true,
      mudou: false,
    })
  })

  it('previsto e real na nuvem: "Nuvem do Babel"', () => {
    expect(seloDaFala(naNuvem, 'groq-whisper')).toEqual({
      onde: 'nuvem',
      etiqueta: 'Nuvem do Babel',
      detalhe: 'o áudio vai para o nosso servidor',
      motivo: naNuvem.explicacao,
      saiDoAparelho: true,
      confirmado: true,
      mudou: false,
    })
  })

  it('previsto e real pelo navegador que envia: "Pelo navegador"', () => {
    expect(seloDaFala(peloNavegador, 'web-speech')).toMatchObject({
      onde: 'navegador',
      etiqueta: 'Pelo navegador',
      detalhe: 'o áudio vai para o serviço de fala do navegador',
      saiDoAparelho: true,
      mudou: false,
    })
  })

  it('reconhecimento do navegador processado localmente é "No aparelho"', () => {
    for (const motor of ['web-speech-local', 'web-speech-local-trilha']) {
      expect(seloDaFala(navegadorLocal, motor)).toMatchObject({
        etiqueta: 'No aparelho',
        detalhe: 'seu áudio não sai daqui',
        saiDoAparelho: false,
        mudou: false,
      })
    }
    // Previsto o nosso modelo, e quem atendeu foi o navegador no aparelho: o lugar do áudio não mudou.
    expect(seloDaFala(noAparelho, 'web-speech-local-trilha')).toMatchObject({
      etiqueta: 'No aparelho',
      mudou: false,
      motivo: { chave: 'O navegador reconheceu esta fala no próprio aparelho.' },
    })
  })

  it('REGRA DE OURO: previsto no aparelho, mas a fala foi à nuvem — vale o real e o motivo diz que mudou', () => {
    expect(seloDaFala(noAparelho, 'groq-whisper')).toMatchObject({
      etiqueta: 'Nuvem do Babel',
      saiDoAparelho: true,
      confirmado: true,
      mudou: true,
      motivo: { chave: 'Mudou: esta fala foi para a nuvem.' },
    })
  })

  it('REGRA DE OURO: previsto no aparelho, mas a fala foi ao serviço do navegador', () => {
    expect(seloDaFala(noAparelho, 'web-speech')).toMatchObject({
      etiqueta: 'Pelo navegador',
      saiDoAparelho: true,
      mudou: true,
      motivo: { chave: 'Mudou: esta fala foi para o serviço de fala do navegador.' },
    })
  })

  it('previsto a nuvem e quem atendeu foi o modelo local: não promete que o áudio ficou', () => {
    const selo = seloDaFala(naNuvem, 'whisper-local')
    expect(selo).toMatchObject({
      etiqueta: 'No aparelho',
      detalhe: 'transcrita aqui, depois de tentar a nuvem',
      saiDoAparelho: true,
      mudou: true,
      motivo: { chave: 'Mudou: a nuvem não respondeu nesta fala.' },
    })
    expect(selo?.detalhe).not.toMatch(/não sai/)
  })

  it('previsto o navegador que envia e quem atendeu foi o modelo local', () => {
    expect(seloDaFala(peloNavegador, 'whisper-local')).toMatchObject({
      etiqueta: 'No aparelho',
      detalhe: 'seu áudio não sai daqui',
      saiDoAparelho: false,
      mudou: true,
      motivo: { chave: 'Mudou: esta fala foi transcrita no aparelho.' },
    })
  })

  it('conversa: cada fala casa com o previsto da sua fonte, sem "mudou"', () => {
    const previstos = [noAparelho, peloNavegador]
    expect(seloDaFala(previstos, 'whisper-local')).toMatchObject({ etiqueta: 'No aparelho', mudou: false })
    expect(seloDaFala(previstos, 'web-speech')).toMatchObject({ etiqueta: 'Pelo navegador', mudou: false })
  })

  it('sem previsto, o real basta (e não há motivo a dar)', () => {
    expect(seloDaFala(null, 'web-speech')).toMatchObject({ etiqueta: 'Pelo navegador', motivo: null, mudou: false })
    expect(seloDaFala(null, 'whisper-local')).toMatchObject({ etiqueta: 'No aparelho', motivo: null })
  })

  it('com a chave da própria pessoa a política não vale: sem previsto, e o modelo local só vem depois da nuvem', () => {
    const chave = { nuvemPorChavePropria: true }
    // A política diria "no aparelho" (ela não vê a chave): antes da primeira fala o selo não afirma nada.
    expect(seloDaFala(noAparelho, null, chave)).toBeNull()
    expect(seloDaFala(noAparelho, 'groq-whisper', chave)).toMatchObject({ etiqueta: 'Nuvem do Babel', mudou: false })
    expect(seloDaFala(noAparelho, 'whisper-local', chave)).toMatchObject({
      etiqueta: 'No aparelho',
      detalhe: 'transcrita aqui, depois de tentar a nuvem',
      saiDoAparelho: true,
    })
  })

  it('motor que o registro não conhece (ou que não transcreve): o selo não afirma nada', () => {
    expect(seloDaFala(noAparelho, 'motor-inventado')).toBeNull()
    expect(seloDaFala(noAparelho, 'mymemory')).toBeNull()
  })
})

describe('REGRA DE OURO, em todos os motores de transcrição do registro', () => {
  const motores = REGISTRO_DE_MOTORES.filter((m) => m.tarefa === 'stt')

  it.each(Object.keys(PREVISTOS))('previsto %s', (nome) => {
    for (const m of motores) {
      for (const id of [m.id, m.adapterId]) {
        const selo = seloDaFala(PREVISTOS[nome], id)
        expect(selo, id).not.toBeNull()
        // O id do adaptador cobre vários motores: basta UM enviar para o selo falhar fechado.
        const envia =
          id === m.id ? exigeConsentimento(m) : motores.some((x) => x.adapterId === id && exigeConsentimento(x))
        if (envia) {
          expect(selo!.etiqueta, id).not.toBe('No aparelho')
          expect(selo!.saiDoAparelho, id).toBe(true)
        }
        if (selo!.detalhe === 'seu áudio não sai daqui') {
          expect(envia, id).toBe(false)
          expect(selo!.etiqueta).toBe('No aparelho')
        }
        expect(['No aparelho', 'Pelo navegador', 'Nuvem do Babel']).toContain(selo!.etiqueta)
      }
    }
  })
})

// ───────────────────────────── as situações da política ─────────────────────────────

describe('o motivo vem da política', () => {
  it('perfil protegido: fica no aparelho e diz por quê', () => {
    const d = decidirRota(pedido({ plano: premium, estado: { perfilProtegido: true } }))
    expect(seloDaFala(d, 'whisper-local')).toMatchObject({
      etiqueta: 'No aparelho',
      detalhe: 'seu áudio não sai daqui',
      motivo: { chave: 'Este perfil só usa a nuvem com a autorização do responsável.' },
      mudou: false,
    })
    // E se, mesmo assim, uma fala saísse: o selo diz a verdade.
    expect(seloDaFala(d, 'groq-whisper')).toMatchObject({ etiqueta: 'Nuvem do Babel', mudou: true })
  })

  it('cota do mês esgotada', () => {
    const d = decidirRota(pedido({ plano: { ...premium, restante: { ...semTeto, trechosNoMesS: 0 } } }))
    expect(seloDaFala(d, 'whisper-local')).toMatchObject({
      etiqueta: 'No aparelho',
      motivo: { chave: 'A nuvem deste mês acabou. Seguimos no aparelho.' },
    })
    expect(seloDaFala(d)).toMatchObject({ etiqueta: 'Vai rodar no aparelho' })
  })

  it('sem rede', () => {
    const d = decidirRota(pedido({ plano: premium, estado: { semRede: true } }))
    expect(seloDaFala(d, 'whisper-local')).toMatchObject({
      etiqueta: 'No aparelho',
      detalhe: 'seu áudio não sai daqui',
      motivo: { chave: 'Sem internet, tudo é feito no aparelho.' },
    })
  })

  it('sem consentimento para a nuvem', () => {
    const d = decidirRota(pedido({ plano: premium, estado: { consentimentos: { nuvem: false, navegador: false } } }))
    expect(seloDaFala(d)).toMatchObject({
      etiqueta: 'Vai rodar no aparelho',
      motivo: { chave: 'Você ainda não autorizou o envio para fora do aparelho.' },
    })
  })
})

// ───────────────────────────── o texto ─────────────────────────────

describe('textoDoSelo', () => {
  const t = (chave: string, vars?: Record<string, string | number>) =>
    chave.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`))

  it('a frase é a etiqueta e o detalhe; o motivo vem com as variáveis', () => {
    // Só a política LIGADA dá este motivo (inglês em aparelho que acompanha); o selo só o repassa.
    const d = decidirRota(pedido({ estado: { politicaLigada: true }, extra: { idioma: 'en' } }))
    const selo = seloDaFala(d, 'whisper-local')!
    expect(selo.motivo?.vars).toEqual({ idioma: 'en' })
    const texto = textoDoSelo(selo, t, (codigo) => (codigo === 'en' ? 'inglês' : codigo))
    expect(texto.frase).toBe('No aparelho · seu áudio não sai daqui')
    expect(texto.motivo).toBe('Este aparelho acompanha a fala em inglês.')
  })

  it('sem motivo, texto vazio', () => {
    expect(textoDoSelo(seloDaFala(null, 'groq-whisper')!, t).motivo).toBe('')
  })

  it('nenhum texto do selo traz nome de modelo', () => {
    for (const previsto of Object.values(PREVISTOS)) {
      for (const motor of [null, 'whisper-local', 'groq-whisper', 'web-speech', 'web-speech-local']) {
        const { frase, motivo } = textoDoSelo(seloDaFala(previsto, motor)!, t)
        expect(`${frase} ${motivo}`).not.toMatch(/whisper|moonshine|large|turbo|groq|tiny|small|base\b/i)
      }
    }
  })
})

// ───────────────────────────── o motor da última fala ─────────────────────────────

describe('motorDaUltimaFala', () => {
  const dicas = { sistemaNoNavegador: false, micNoNavegador: false }
  const fala = (f: { engine?: string; source?: 'system' | 'mic'; isPartial?: boolean }) => ({
    source: 'system' as const,
    ...f,
  })

  it('sem fala final, não há motor real', () => {
    expect(motorDaUltimaFala([], dicas)).toBeNull()
    expect(motorDaUltimaFala([fala({ isPartial: true, engine: 'groq-whisper' })], dicas)).toBeNull()
  })

  it('é o da ÚLTIMA fala final, não o de uma anterior nem o do parcial em curso', () => {
    const falas = [fala({ engine: 'whisper-local' }), fala({ engine: 'groq-whisper' }), fala({ isPartial: true })]
    expect(motorDaUltimaFala(falas, dicas)).toBe('groq-whisper')
  })

  it('fala do microfone sem motor, com o microfone no navegador: falha FECHADO (o modo não vem na fala)', () => {
    const falas = [fala({ engine: 'whisper-local' }), fala({ source: 'mic' })]
    expect(motorDaUltimaFala(falas, { ...dicas, micNoNavegador: true })).toBe('web-speech')
    // Com o microfone no nosso modelo, uma fala sem motor é uma falha de transcrição: nada a afirmar.
    expect(motorDaUltimaFala(falas, dicas)).toBeNull()
  })

  it('fala do sistema sem motor: a trilha no navegador é sempre no aparelho', () => {
    expect(motorDaUltimaFala([fala({})], { ...dicas, sistemaNoNavegador: true })).toBe('web-speech-local-trilha')
    expect(motorDaUltimaFala([fala({})], dicas)).toBeNull()
  })
})

// ───────────────────────────── os previstos da captura ─────────────────────────────

describe('previstosDoSelo', () => {
  const mic = { idioma: 'pt', falaNoAparelho: 'unavailable' as const, bipaAoReligar: false }
  const base = pedido({ plano: premium, estado: { consentimentos: { nuvem: true, navegador: true } } })

  it('sem microfone no navegador, só a decisão do modelo', () => {
    const [d, ...resto] = previstosDoSelo(base, { soMicrofone: false, semRede: false, micNoNavegador: null })
    expect(resto).toEqual([])
    expect(d.processamento.onde).toBe('nuvem')
  })

  it('sem rede, a decisão já sai com o motivo', () => {
    const [d] = previstosDoSelo(base, { soMicrofone: false, semRede: true, micNoNavegador: null })
    expect(d.rota.motivo).toBe('sem-rede')
    expect(base.estado.semRede).toBe(false) // não altera o pedido
  })

  it('conversa com o microfone no navegador: duas decisões, a do som e a do microfone', () => {
    const previstos = previstosDoSelo(base, { soMicrofone: false, semRede: false, micNoNavegador: mic })
    expect(previstos.map((d) => d.rota.degrau)).toEqual(['nuvem-por-trechos', 'navegador-na-nuvem'])
  })

  it('só o microfone, no navegador: a decisão do modelo não entra (ele não ouve nada)', () => {
    const previstos = previstosDoSelo(base, { soMicrofone: true, semRede: false, micNoNavegador: mic })
    expect(previstos.map((d) => d.rota.degrau)).toEqual(['navegador-na-nuvem'])
    const local = previstosDoSelo(base, {
      soMicrofone: true,
      semRede: false,
      micNoNavegador: { ...mic, falaNoAparelho: 'available' },
    })
    expect(local.map((d) => d.rota.degrau)).toEqual(['navegador-no-aparelho'])
    expect(seloDaFala(local)).toMatchObject({ etiqueta: 'Vai rodar no aparelho' })
  })
})
