/**
 * "APARELHO PRIMEIRO" NA POLÍTICA E NO SELO (Fase B, itens 5 e 6). A política de rota é o PREVISTO do
 * selo da fala; com a flag `stt_aparelho_primeiro`, ela tem de dizer o que a rota efetiva (`routeStt`)
 * faz — o Parakeet primeiro, a nuvem de reserva para o áudio difícil — e, quando a histerese sobe
 * (`estado.audioDificil`), a nuvem primeiro com o motivo. O selo reflete o real: a fala que foi à nuvem
 * por áudio difícil diz isso, sem "mudou"; a que o aparelho atendeu depois de tentar a nuvem não
 * promete que o áudio ficou.
 */
import { describe, expect, it } from 'vitest'

import {
  type AparelhoDaRota,
  decidirRota,
  type EstadoDaRota,
  MOTIVOS_DA_ROTA,
  paraRotaDoStt,
  type PedidoDeRota,
  type PlanoDaRota,
} from '../src/core/rota/politicaDeRota'
import { ID_DO_PARAKEET } from '../src/gateway/adapters/parakeetModelo'
import { type DispositivoDaRota, routeStt, type SttQuality, WHISPER_MODELS } from '../src/gateway/sttRouter'
import {
  type AmbienteDaConferencia,
  divergenciaDaRotaDoStt,
  type EntradaDaConferencia,
  montarPedidoDeRota,
} from '../src/lib/captura/conferenciaDaRota'
import { seloDaFala } from '../src/lib/captura/seloDaFala'

const aparelho: AparelhoDaRota = {
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
  parakeet: true,
}
const semTeto = { trechosNoMesS: null, trechosNoDiaS: null, aoVivoNoMesS: null, aoVivoNoDiaS: null }
const plus: PlanoDaRota = {
  nuvemPorTrechos: true,
  precisaoPorPadrao: true,
  nuvemAoVivo: false,
  traducaoNaNuvem: true,
  nuance: true,
  vozNeural: true,
  restante: semTeto,
}
const estado: EstadoDaRota = {
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
  aparelhoPrimeiro: true,
}
function pedido(m: { aparelho?: Partial<AparelhoDaRota>; estado?: Partial<EstadoDaRota>; idioma?: string } = {}) {
  return {
    tarefa: 'stt-final',
    fonte: 'sistema',
    idioma: m.idioma ?? 'pt',
    aparelho: { ...aparelho, ...m.aparelho },
    plano: plus,
    estado: { ...estado, ...m.estado },
  } satisfies PedidoDeRota
}

describe('política com a flag: o aparelho primeiro', () => {
  it('Parakeet pronto, automático, pt: o modelo no aparelho, e a nuvem de reserva para o áudio difícil', () => {
    const d = decidirRota(pedido())
    expect(d.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo: 'aparelho-da-conta', motor: 'parakeet-v3' })
    expect(d.reservas[0]).toMatchObject({ degrau: 'nuvem-por-trechos', motivo: 'audio-dificil' })
    expect(d.reservas.at(-1)?.degrau).toBe('modelo-no-aparelho')
    expect(d.processamento).toEqual({ onde: 'aparelho', enviaDadosA: null })
    expect(paraRotaDoStt(d)).toEqual({ preferCloud: false, localModel: ID_DO_PARAKEET, device: 'wasm' })
  })

  it('áudio difícil (a histerese subiu): a nuvem primeiro com o motivo, e o Parakeet de reserva', () => {
    const d = decidirRota(pedido({ estado: { audioDificil: true } }))
    expect(d.rota).toMatchObject({ degrau: 'nuvem-por-trechos', motivo: 'audio-dificil' })
    expect(d.explicacao.chave).toBe('Áudio difícil: nestas falas a nuvem erra menos.')
    expect(paraRotaDoStt(d)).toEqual({ preferCloud: true, localModel: ID_DO_PARAKEET, device: 'wasm' })
  })

  it('flag desligada: a nuvem primeiro, como hoje — e a reserva é o Parakeet pronto (item 5)', () => {
    for (const est of [
      { aparelhoPrimeiro: false },
      { aparelhoPrimeiro: undefined },
      { audioDificil: true, aparelhoPrimeiro: false },
    ]) {
      const d = decidirRota(pedido({ estado: est }))
      expect(d.rota).toMatchObject({ degrau: 'nuvem-por-trechos', motivo: 'nuvem-primeiro' })
      expect(paraRotaDoStt(d)).toEqual({ preferCloud: true, localModel: ID_DO_PARAKEET, device: 'wasm' })
    }
  })

  it('sem o Parakeet pronto (aparelho fraco, sem cópia): a nuvem primeiro com a reserva de sempre', () => {
    const d = decidirRota(pedido({ aparelho: { parakeet: false } }))
    expect(d.rota.degrau).toBe('nuvem-por-trechos')
    expect(paraRotaDoStt(d).localModel).toBe(WHISPER_MODELS.base)
  })

  it('Precisão pedida: a nuvem primeiro, pela escolha da pessoa', () => {
    const d = decidirRota(pedido({ estado: { preferencia: { qualidade: 'nuvem', microfone: 'modelo' } } }))
    expect(d.rota).toMatchObject({ degrau: 'nuvem-por-trechos', motivo: 'escolha-da-pessoa' })
  })

  it('inglês: como hoje (a nuvem primeiro)', () => {
    expect(decidirRota(pedido({ idioma: 'en' })).rota.degrau).toBe('nuvem-por-trechos')
  })

  it('o que barra a nuvem barra também a reserva da nuvem (sem consentimento, privado, protegido, pausa, sem rede)', () => {
    for (const est of [
      { consentimentos: { nuvem: false, navegador: false } },
      { perfilPrivado: true },
      { perfilProtegido: true },
      { nuvemPausada: true },
      { semRede: true },
    ] satisfies Partial<EstadoDaRota>[]) {
      for (const audioDificil of [false, true]) {
        const d = decidirRota(pedido({ estado: { ...est, audioDificil } }))
        const degraus = [d.rota, ...d.reservas].map((x) => x.degrau)
        expect(degraus, JSON.stringify(est)).not.toContain('nuvem-por-trechos')
        expect(d.rota.degrau).toBe('modelo-no-aparelho')
      }
    }
  })

  it('invariantes: motivos da lista fechada, reserva que termina no aparelho, descartado fora da rota', () => {
    const lista = new Set<string>(MOTIVOS_DA_ROTA)
    for (const qualidade of ['auto', 'rapido', 'preciso', 'nuvem'] as const)
      for (const idioma of ['pt', 'en'])
        for (const parakeet of [false, true])
          for (const audioDificil of [false, true])
            for (const nuvemDisponivel of [false, true])
              for (const tarefa of ['stt-final', 'stt-parcial'] as const) {
                const d = decidirRota({
                  ...pedido({
                    idioma,
                    aparelho: { parakeet },
                    estado: { audioDificil, nuvemDisponivel, preferencia: { qualidade, microfone: 'modelo' } },
                  }),
                  tarefa,
                })
                expect(lista.has(d.rota.motivo)).toBe(true)
                for (const r of d.reservas) expect(lista.has(r.motivo)).toBe(true)
                expect(d.reservas.at(-1)?.degrau).toBe('modelo-no-aparelho')
                const usados = new Set([d.rota, ...d.reservas].map((x) => x.degrau))
                for (const x of d.descartadas) expect(usados.has(x.degrau)).toBe(false)
                if (tarefa === 'stt-parcial') expect(d.rota.degrau).not.toBe('nuvem-por-trechos')
              }
  })
})

describe('EQUIVALÊNCIA com a rota efetiva (`routeStt`), com e sem a flag', () => {
  const desktop8: DispositivoDaRota = {
    tipo: 'desktop-com-gpu',
    permiteSmall: true,
    economiaDeDados: false,
    adaptadorReal: true,
    memoriaGb: 8,
    poucaMemoria: false,
  }
  const ambiente: AmbienteDaConferencia = {
    consentiuNuvem: true,
    consentiuNavegador: false,
    protegido: false,
    responsavelAutorizou: false,
    edicaoEstatica: false,
    nuvemDoSite: false,
    capacidades: { managedCloudStt: true, managedCloudLlm: true, traducaoNuance: true, vozNatural: true },
    alivioAceito: false,
  }
  it('`paraRotaDoStt(decidirRota(...))` = `routeStt(...)` com o Parakeet pronto ou não', () => {
    let casos = 0
    for (const aparelhoPrimeiro of [false, true])
      for (const parakeetNoAparelho of [false, true])
        for (const qualidade of ['auto', 'cloud'] as SttQuality[])
          for (const idiomaDoConteudo of ['pt', 'es', 'en'])
            for (const nuvemDisponivel of [false, true]) {
              /* "Precisão" sem nuvem cai no "preciso" do aparelho, que usa o Parakeet mesmo sem cópia (a
                 folha baixa); a política só conhece o Parakeet PRONTO — divergência anterior a esta
                 mudança, fora do escopo dela. */
              if (qualidade === 'cloud' && !nuvemDisponivel) continue
              const hoje = routeStt({
                contentLang: idiomaDoConteudo,
                autoDetect: false,
                quality: qualidade,
                hasWebGpu: true,
                cloudAvailable: nuvemDisponivel,
                profileId: 'free-web',
                dispositivo: desktop8,
                parakeet: true,
                parakeetNoAparelho,
                aparelhoPrimeiro,
              })
              const entrada: EntradaDaConferencia = {
                idiomaDoConteudo,
                idiomaDoMicrofone: '',
                micVaiAoModelo: false,
                soMicrofone: false,
                detectarIdioma: false,
                qualidade,
                temWebGpu: true,
                nuvemDisponivel,
                perfilId: 'free-web',
                dispositivo: desktop8,
                leve: false,
                parakeetPronto: parakeetNoAparelho && idiomaDoConteudo !== 'en',
                aparelhoPrimeiro,
              }
              const p = montarPedidoDeRota(entrada, ambiente)
              const contexto = JSON.stringify({
                aparelhoPrimeiro,
                parakeetNoAparelho,
                qualidade,
                idiomaDoConteudo,
                nuvemDisponivel,
              })
              expect(divergenciaDaRotaDoStt(p, hoje), contexto).toBeNull()
              casos++
            }
    expect(casos).toBe(36)
  })
})

describe('o selo com o aparelho primeiro', () => {
  const noAparelho = decidirRota(pedido())
  const naNuvem = decidirRota(pedido({ estado: { audioDificil: true } }))

  it('antes da primeira fala: "Vai rodar no aparelho"', () => {
    expect(seloDaFala(noAparelho)).toMatchObject({ onde: 'aparelho', saiDoAparelho: false, confirmado: false })
  })

  it('fala atendida pelo Parakeet: "No aparelho", sem mudança', () => {
    expect(seloDaFala(noAparelho, 'parakeet-local')).toMatchObject({
      onde: 'aparelho',
      saiDoAparelho: false,
      mudou: false,
    })
  })

  /* Rodada de correção 1, item 5: no modo APARELHO, uma fala que foi à nuvem não foi decisão da
     histerese (a porta subiu um trecho, ou os motores locais falharam e a cadeia caiu na nuvem): o selo
     diz que mudou, sem inventar "áudio difícil". O motivo só aparece no modo nuvem, abaixo. */
  it('modo aparelho, fala atendida pela nuvem: "Nuvem do Frasy" com "mudou", sem o motivo de áudio difícil', () => {
    const selo = seloDaFala(noAparelho, 'groq-whisper')
    expect(selo).toMatchObject({ onde: 'nuvem', saiDoAparelho: true, mudou: true })
    expect(selo?.motivo?.chave).toBe('Mudou: esta fala foi para a nuvem.')
  })

  it('no modo nuvem (a histerese subiu): a fala da nuvem diz o motivo; a do aparelho não promete que o áudio ficou', () => {
    expect(seloDaFala(naNuvem, 'groq-whisper')).toMatchObject({
      onde: 'nuvem',
      mudou: false,
      motivo: { chave: 'Áudio difícil: nestas falas a nuvem erra menos.' },
    })
    expect(seloDaFala(naNuvem, 'parakeet-local')).toMatchObject({ onde: 'aparelho', saiDoAparelho: true, mudou: true })
  })

  it('sem a flag, a fala da nuvem num previsto do aparelho continua "mudou" (nada de motivo inventado)', () => {
    const semFlag = decidirRota(pedido({ estado: { aparelhoPrimeiro: false, nuvemDisponivel: false } }))
    expect(seloDaFala(semFlag, 'groq-whisper')).toMatchObject({ onde: 'nuvem', mudou: true })
  })
})
