/**
 * POLÍTICA DE ROTA (etapa 4 de `planos-v3-e-rota-inteligente`): a tabela aparelho × plano × tarefa ×
 * estado, os invariantes da spec `politica-de-rota` e a EQUIVALÊNCIA com as decisões de hoje
 * (`routeStt`, `escolherMotorDoMic`) enquanto a política está desligada (modo sombra).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { routeMt } from '../src/core/harness/roteadorDeTraducao'
import {
  type AparelhoDaRota,
  decidirRota,
  type DecisaoDeRota,
  type DegrauDaRota,
  type EstadoDaRota,
  MOTIVOS_DA_ROTA,
  paraRotaDoStt,
  type PedidoDeRota,
  type PlanoDaRota,
  type TarefaDaRota,
} from '../src/core/rota/politicaDeRota'
import {
  type DispositivoDaRota,
  MOONSHINE_MODELS,
  routeStt,
  type SttQuality,
  WHISPER_MODELS,
} from '../src/gateway/sttRouter'
import { divergenciaDaRotaDoStt, montarPedidoDeRota } from '../src/lib/captura/conferenciaDaRota'
import { type EntradaDoMotorDoMic, escolherMotorDoMic } from '../src/lib/captura/motorDoMicrofone'

/* O `routeStt` lê duas coisas do ambiente (edição estática e a nuvem do site); o teste as controla. */
const mundo = vi.hoisted(() => ({ estatica: false, nuvemDoSite: false }))
vi.mock('../src/lib/edicaoEstatica', () => ({ edicaoEstatica: () => mundo.estatica, urlDoAppCompleto: () => null }))
vi.mock('../src/lib/nuvemDoQuest', () => ({ nuvemDoQuestAtiva: () => mundo.estatica && mundo.nuvemDoSite }))

beforeEach(() => {
  mundo.estatica = false
  mundo.nuvemDoSite = false
})

// ───────────────────────────── os aparelhos ─────────────────────────────

const semNavegador = { fala: false, falaNoAparelho: null, bipaAoReligar: false, tradutor: false }
const semModelos = { opusMt: true, bergamot: false, llmLocal: false }
const aparelhoBase = {
  travando: false,
  economiaDeDados: false,
  smallNaGpu: false,
  whisperNaGpu: false,
  shaderF16: false,
  navegador: semNavegador,
  modelos: semModelos,
}
const APARELHOS = {
  desktopGpu: { ...aparelhoBase, tipo: 'desktop-com-gpu', leve: false, gpuProvada: true, smallNaGpu: true },
  desktopSemGpu: { ...aparelhoBase, tipo: 'desktop-sem-gpu', leve: false, gpuProvada: false },
  celularBom: { ...aparelhoBase, tipo: 'celular-bom', leve: false, gpuProvada: null },
  celularFraco: { ...aparelhoBase, tipo: 'celular-fraco', leve: true, gpuProvada: false },
  quest: { ...aparelhoBase, tipo: 'quest', leve: true, gpuProvada: null },
} satisfies Record<string, AparelhoDaRota>
type NomeDoAparelho = keyof typeof APARELHOS
const NOMES_DOS_APARELHOS = Object.keys(APARELHOS) as NomeDoAparelho[]

// ───────────────────────────── os planos (só capacidades) ─────────────────────────────

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
const essencial: PlanoDaRota = { ...gratis, nuvemPorTrechos: true, traducaoNaNuvem: true, nuance: true }
const premium: PlanoDaRota = { ...essencial, precisaoPorPadrao: true, vozNeural: true }
const aoVivo: PlanoDaRota = { ...premium, nuvemAoVivo: true }
const PLANOS = { gratis, essencial, premium, aoVivo }
type NomeDoPlano = keyof typeof PLANOS
const NOMES_DOS_PLANOS = Object.keys(PLANOS) as NomeDoPlano[]

// ───────────────────────────── o estado ─────────────────────────────

const estadoAberto: EstadoDaRota = {
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

function pedido(p: {
  aparelho?: NomeDoAparelho | AparelhoDaRota
  plano?: NomeDoPlano | PlanoDaRota
  tarefa?: TarefaDaRota
  idioma?: string
  fonte?: PedidoDeRota['fonte']
  estado?: Partial<EstadoDaRota>
  ligada?: boolean
  extra?: Partial<PedidoDeRota>
}): PedidoDeRota {
  const plano = typeof p.plano === 'object' ? p.plano : PLANOS[p.plano ?? 'gratis']
  return {
    tarefa: p.tarefa ?? 'stt-final',
    fonte: p.fonte ?? 'sistema',
    idioma: p.idioma ?? 'pt',
    idiomaDeDestino: 'en',
    aparelho: typeof p.aparelho === 'object' ? p.aparelho : APARELHOS[p.aparelho ?? 'desktopGpu'],
    plano,
    /* O que o servidor responde hoje em `/api/ai/stt/available`: sim para quem tem a nuvem. */
    estado: { ...estadoAberto, nuvemDisponivel: plano.nuvemPorTrechos, politicaLigada: p.ligada, ...p.estado },
    ...p.extra,
  }
}

const NUVENS: DegrauDaRota[] = ['nuvem-por-trechos', 'nuvem-ao-vivo', 'nuvem-do-site']
const DO_APARELHO: DegrauDaRota[] = ['modelo-no-aparelho', 'navegador-no-aparelho']
const degraus = (d: DecisaoDeRota): DegrauDaRota[] => [d.rota, ...d.reservas].map((x) => x.degrau)

// ───────────────────────────── a tabela de HOJE (política desligada) ─────────────────────────────

describe('política DESLIGADA: transcrever, aparelho × plano × idioma (o comportamento de hoje)', () => {
  const modeloEmIngles: Record<NomeDoAparelho, string> = {
    desktopGpu: MOONSHINE_MODELS.base,
    desktopSemGpu: MOONSHINE_MODELS.base,
    celularBom: MOONSHINE_MODELS.base,
    celularFraco: MOONSHINE_MODELS.tiny,
    quest: MOONSHINE_MODELS.tiny,
  }
  const modeloEmPortugues: Record<NomeDoAparelho, string> = {
    desktopGpu: WHISPER_MODELS.small,
    desktopSemGpu: WHISPER_MODELS.base,
    celularBom: WHISPER_MODELS.base,
    celularFraco: WHISPER_MODELS.base,
    quest: WHISPER_MODELS.base,
  }
  const casos = NOMES_DOS_APARELHOS.flatMap((aparelho) =>
    NOMES_DOS_PLANOS.flatMap((plano) => (['en', 'pt'] as const).map((idioma) => ({ aparelho, plano, idioma }))),
  )

  it.each(casos)('$aparelho · $plano · $idioma', ({ aparelho, plano, idioma }) => {
    const d = decidirRota(pedido({ aparelho, plano, idioma }))
    if (plano === 'gratis') {
      const modelo = (idioma === 'en' ? modeloEmIngles : modeloEmPortugues)[aparelho]
      expect(d.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo: 'plano-nao-inclui', modelo })
      expect(d.nivel).toBe('aparelho')
      expect(d.processamento).toEqual({ onde: 'aparelho', enviaDadosA: null })
      expect(d.descartadas).toContainEqual({ degrau: 'nuvem-por-trechos', motivo: 'plano-nao-inclui' })
    } else {
      // Hoje quem tem nuvem vai à nuvem primeiro, em qualquer idioma e aparelho.
      expect(d.rota).toMatchObject({ degrau: 'nuvem-por-trechos', motivo: 'nuvem-primeiro', motor: 'groq-whisper' })
      expect(d.nivel).toBe('precisao')
      expect(d.processamento).toEqual({ onde: 'nuvem', enviaDadosA: 'nos' })
      expect(d.reservas.at(-1)?.degrau).toBe('modelo-no-aparelho')
    }
    expect(d.acao ?? null).toBeNull()
  })

  it.each([
    ['rapido', 'en', MOONSHINE_MODELS.tiny],
    ['rapido', 'pt', WHISPER_MODELS.tiny],
    ['preciso', 'pt', WHISPER_MODELS.small],
  ] as const)('escolha "%s" em %s fica no aparelho, com o plano que for', (qualidade, idioma, modelo) => {
    const d = decidirRota(
      pedido({ plano: 'premium', idioma, estado: { preferencia: { qualidade, microfone: 'modelo' } } }),
    )
    expect(d.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo: 'escolha-da-pessoa', modelo })
    expect(d.descartadas).toContainEqual({ degrau: 'nuvem-por-trechos', motivo: 'escolha-da-pessoa' })
  })

  it('escolha "nuvem" sem o plano: melhor modelo local, com o motivo e a ação de ver os planos', () => {
    const d = decidirRota(pedido({ estado: { preferencia: { qualidade: 'nuvem', microfone: 'modelo' } } }))
    expect(d.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo: 'plano-nao-inclui' })
    expect(d.acao).toBe('ver-planos')
  })

  it('escolha "nuvem" com o plano: nuvem, com o motivo da escolha', () => {
    const d = decidirRota(
      pedido({
        plano: 'essencial',
        idioma: 'en',
        estado: { preferencia: { qualidade: 'nuvem', microfone: 'modelo' } },
      }),
    )
    expect(d.rota).toMatchObject({ degrau: 'nuvem-por-trechos', motivo: 'escolha-da-pessoa' })
  })

  it('edição estática sem a nuvem do site: no aparelho, com o motivo próprio', () => {
    const d = decidirRota(pedido({ plano: 'premium', estado: { edicaoEstatica: true, nuvemDisponivel: true } }))
    expect(d.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo: 'edicao-estatica' })
  })

  it('nuvem do site (aparelho leve): português vai à nuvem do site; inglês fica no aparelho', () => {
    const estado = { edicaoEstatica: true, nuvemDoSite: true, nuvemDisponivel: true }
    const pt = decidirRota(pedido({ aparelho: 'quest', estado }))
    expect(pt.rota).toMatchObject({ degrau: 'nuvem-do-site', motivo: 'nuvem-primeiro' })
    const en = decidirRota(pedido({ aparelho: 'quest', idioma: 'en', estado }))
    expect(en.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo: 'aparelho-da-conta' })
    expect(en.descartadas).toContainEqual({ degrau: 'nuvem-do-site', motivo: 'aparelho-da-conta' })
  })

  it.each([
    ['sem rede', { semRede: true }, 'sem-rede'],
    ['nuvem pausada', { nuvemPausada: true }, 'nuvem-pausada'],
    ['servidor sem nuvem', { nuvemDisponivel: false }, 'nuvem-indisponivel'],
  ] as const)('%s: no aparelho, com o motivo', (_n, estado, motivo) => {
    const d = decidirRota(pedido({ plano: 'premium', estado }))
    expect(d.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo })
    expect(d.descartadas).toContainEqual({ degrau: 'nuvem-por-trechos', motivo })
  })

  it('o texto durante a fala (stt-parcial) é do aparelho: hoje não existe nuvem ao vivo', () => {
    for (const plano of NOMES_DOS_PLANOS) {
      const d = decidirRota(pedido({ plano, tarefa: 'stt-parcial' }))
      expect(d.rota.degrau).toBe('modelo-no-aparelho')
      expect(d.descartadas.map((x) => x.degrau)).toContain('nuvem-ao-vivo')
    }
  })
})

// ───────────────────────────── a tabela NOVA (política ligada) ─────────────────────────────

describe('política LIGADA: transcrever, aparelho × plano × idioma (a árvore do design)', () => {
  type Esperado = [DegrauDaRota, string]
  const local = (motivo: string): Esperado => ['modelo-no-aparelho', motivo]
  const trechos = (motivo: string): Esperado => ['nuvem-por-trechos', motivo]
  const fluxo = (motivo: string): Esperado => ['nuvem-ao-vivo', motivo]
  const naoAcompanha = {
    gratis: local('plano-nao-inclui'),
    essencial: trechos('aparelho-nao-acompanha'),
    premium: trechos('aparelho-nao-acompanha'),
    aoVivo: fluxo('aparelho-nao-acompanha'),
  }
  const daConta = {
    gratis: local('aparelho-da-conta'),
    essencial: local('aparelho-da-conta'),
    premium: local('aparelho-da-conta'),
    aoVivo: local('aparelho-da-conta'),
  }
  const ARVORE: Record<NomeDoAparelho, Record<'en' | 'pt', Record<NomeDoPlano, Esperado>>> = {
    desktopGpu: {
      en: daConta,
      pt: { ...daConta, premium: trechos('idioma-pede-nuvem'), aoVivo: fluxo('idioma-pede-nuvem') },
    },
    desktopSemGpu: { en: daConta, pt: naoAcompanha },
    celularBom: { en: daConta, pt: naoAcompanha },
    celularFraco: { en: naoAcompanha, pt: naoAcompanha },
    quest: { en: naoAcompanha, pt: naoAcompanha },
  }
  const casos = NOMES_DOS_APARELHOS.flatMap((aparelho) =>
    NOMES_DOS_PLANOS.flatMap((plano) =>
      (['en', 'pt'] as const).map((idioma) => ({ aparelho, plano, idioma, esperado: ARVORE[aparelho][idioma][plano] })),
    ),
  )

  it.each(casos)('$aparelho · $plano · $idioma → $esperado', ({ aparelho, plano, idioma, esperado }) => {
    const d = decidirRota(pedido({ aparelho, plano, idioma, ligada: true }))
    expect([d.rota.degrau, d.rota.motivo]).toEqual(esperado)
    expect(d.reservas.at(-1)?.degrau).toBe('modelo-no-aparelho')
  })

  it('pagante com computador capaz, em inglês: no aparelho, com a nuvem de reserva', () => {
    const d = decidirRota(pedido({ plano: 'premium', idioma: 'en', ligada: true }))
    expect(d.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo: 'aparelho-da-conta' })
    expect(d.reservas.map((r) => r.degrau)).toEqual(['nuvem-por-trechos', 'modelo-no-aparelho'])
    expect(d.nivel).toBe('aparelho')
  })

  it('Quest com plano que inclui nuvem, português, nuvem consentida: nuvem por trechos', () => {
    const d = decidirRota(pedido({ aparelho: 'quest', plano: 'essencial', ligada: true }))
    expect(d.rota).toMatchObject({ degrau: 'nuvem-por-trechos', motivo: 'aparelho-nao-acompanha' })
  })

  it('o fator de tempo real MEDIDO manda: Quest em inglês com fator 0,2 fica no aparelho', () => {
    const aparelho = { ...APARELHOS.quest, fatorDeTempoReal: 0.2 }
    const d = decidirRota(pedido({ aparelho, plano: 'premium', idioma: 'en', ligada: true }))
    expect(d.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo: 'aparelho-da-conta' })
  })

  it('…e computador com placa de vídeo que mede 0,8 não acompanha: nuvem', () => {
    const aparelho = { ...APARELHOS.desktopGpu, fatorDeTempoReal: 0.8 }
    const d = decidirRota(pedido({ aparelho, plano: 'essencial', idioma: 'en', ligada: true }))
    expect(d.rota).toMatchObject({ degrau: 'nuvem-por-trechos', motivo: 'aparelho-nao-acompanha' })
  })

  it('aparelho travando não acompanha, mesmo com fator bom medido antes', () => {
    const aparelho = { ...APARELHOS.desktopGpu, travando: true, fatorDeTempoReal: 0.3 }
    const d = decidirRota(pedido({ aparelho, plano: 'premium', idioma: 'en', ligada: true }))
    expect(d.rota.degrau).toBe('nuvem-por-trechos')
  })

  it('Grátis no celular, fora do inglês: oferece a fala do navegador e só a usa com aceite', () => {
    const aparelho = { ...APARELHOS.celularFraco, navegador: { ...semNavegador, fala: true } }
    const base = { aparelho, fonte: 'microfone' as const, ligada: true }
    const preferencia = { qualidade: 'auto' as const, microfone: 'navegador' as const }
    const semAceite = decidirRota(pedido({ ...base, estado: { preferencia } }))
    expect(semAceite.rota.degrau).toBe('modelo-no-aparelho')
    expect(semAceite.acao).toBe('autorizar-nuvem')
    expect(semAceite.descartadas).toContainEqual({ degrau: 'navegador-na-nuvem', motivo: 'sem-consentimento' })

    const comAceite = decidirRota(
      pedido({ ...base, estado: { preferencia, consentimentos: { nuvem: false, navegador: true } } }),
    )
    expect(comAceite.rota.degrau).toBe('navegador-na-nuvem')
    expect(comAceite.processamento).toEqual({ onde: 'navegador', enviaDadosA: 'google' })
    expect(comAceite.reservas.at(-1)?.degrau).toBe('modelo-no-aparelho')
  })

  it('Ao Vivo com o mês ao vivo esgotado: desce para a nuvem por trechos e mostra o consumo', () => {
    const plano = { ...aoVivo, restante: { ...semTeto, aoVivoNoMesS: 0 } }
    const d = decidirRota(pedido({ aparelho: 'quest', plano, ligada: true }))
    expect(d.rota.degrau).toBe('nuvem-por-trechos')
    expect(d.descartadas).toContainEqual({ degrau: 'nuvem-ao-vivo', motivo: 'cota-do-mes' })
    expect(d.acao).toBe('ver-consumo')
  })

  it('texto durante a fala sem o direito ao fluxo: no aparelho', () => {
    const d = decidirRota(pedido({ aparelho: 'quest', plano: 'premium', tarefa: 'stt-parcial', ligada: true }))
    expect(d.rota.degrau).toBe('modelo-no-aparelho')
    expect(d.descartadas).toContainEqual({ degrau: 'nuvem-ao-vivo', motivo: 'plano-nao-inclui' })
  })
})

// ───────────────────────────── traduzir, falar, explicar ─────────────────────────────

describe('traduzir, falar e explicar', () => {
  const comTradutores = {
    ...APARELHOS.desktopGpu,
    navegador: { ...semNavegador, tradutor: true },
    modelos: { opusMt: true, bergamot: true, llmLocal: false },
  }

  it('Grátis: tradutor do navegador, depois Bergamot, depois opus-mt (pt→en)', () => {
    const d = decidirRota(pedido({ aparelho: comTradutores, tarefa: 'mt-final' }))
    expect([d.rota, ...d.reservas].map((p) => p.motor)).toEqual([
      'chrome-translator',
      'bergamot-local',
      'opus-mt-local',
    ])
    expect(d.rota.degrau).toBe('navegador-no-aparelho')
    expect(d.descartadas).toContainEqual({ degrau: 'nuvem-por-trechos', motivo: 'plano-nao-inclui' })
  })

  it('quem tem tradução na nuvem: nuvem primeiro, com o aparelho de reserva (o de hoje)', () => {
    const d = decidirRota(pedido({ aparelho: comTradutores, plano: 'premium', tarefa: 'mt-final' }))
    expect(d.rota).toMatchObject({ degrau: 'nuvem-por-trechos', motor: 'server-llm-mt', motivo: 'nuvem-primeiro' })
    expect(d.reservas.at(-1)).toMatchObject({ degrau: 'modelo-no-aparelho', motor: 'opus-mt-local' })
    expect(d.processamento).toEqual({ onde: 'nuvem', enviaDadosA: 'nos' })
  })

  it('a ordem dos motores é a do `routeMt` (composição, não cópia)', () => {
    const d = decidirRota(pedido({ aparelho: comTradutores, plano: 'premium', tarefa: 'mt-final', fonte: 'microfone' }))
    const escada = routeMt({
      texto: 'texto',
      ehToqueEmPalavra: false,
      parcial: false,
      pago: true,
      consentimento: true,
      disponibilidade: { tradutorNativo: true, opusMt: true, bergamot: true, nuvem: true, memoria: false },
      origem: 'pt',
      destino: 'en',
      falada: true,
      nuvemPrimeiro: true,
    })
    const motores = escada.degraus.map((x) => x.motor)
    expect([d.rota, ...d.reservas].map((p) => p.motor)).toEqual(motores)
  })

  it('política ligada: tradução na nuvem "sob demanda" (sem precisão por padrão) começa no aparelho', () => {
    const d = decidirRota(pedido({ aparelho: comTradutores, plano: 'essencial', tarefa: 'mt-final', ligada: true }))
    expect(d.rota.degrau).toBe('navegador-no-aparelho')
    expect(degraus(d)).toContain('nuvem-por-trechos')
    expect(d.reservas.at(-1)?.degrau).toBe('modelo-no-aparelho')
  })

  it('sem tradutor local para o par: a reserva do aparelho existe e diz que não há recurso', () => {
    const aparelho = { ...APARELHOS.quest, modelos: { opusMt: false, bergamot: false, llmLocal: false } }
    const d = decidirRota(pedido({ aparelho, tarefa: 'mt-final' }))
    expect(d.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo: 'recurso-indisponivel' })
    expect(d.rota.motor).toBeUndefined()
  })

  it('falar: voz do aparelho sem o direito; voz da nuvem com ele, e o aparelho de reserva', () => {
    const semVoz = decidirRota(pedido({ plano: 'essencial', tarefa: 'voz' }))
    expect(semVoz.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo: 'plano-nao-inclui' })
    const comVoz = decidirRota(pedido({ plano: 'premium', tarefa: 'voz' }))
    expect(comVoz.rota.degrau).toBe('nuvem-por-trechos')
    expect(comVoz.reservas.at(-1)?.degrau).toBe('modelo-no-aparelho')
  })

  it('nuance: só pela nuvem; sem o direito, a ação é ver os planos', () => {
    const sem = decidirRota(pedido({ tarefa: 'nuance' }))
    expect(sem.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo: 'plano-nao-inclui' })
    expect(sem.acao).toBe('ver-planos')
    const com = decidirRota(pedido({ plano: 'essencial', tarefa: 'nuance' }))
    expect(com.rota).toMatchObject({ degrau: 'nuvem-por-trechos', motivo: 'so-na-nuvem' })
    expect(com.reservas.at(-1)?.degrau).toBe('modelo-no-aparelho')
  })
})

// ───────────────────────────── os invariantes ─────────────────────────────

const TAREFAS: TarefaDaRota[] = ['stt-final', 'stt-parcial', 'mt-final', 'mt-parcial', 'voz', 'nuance']
const FONTES: PedidoDeRota['fonte'][] = ['microfone', 'sistema', 'texto']
const ESTADOS: Partial<EstadoDaRota>[] = [
  {},
  { consentimentos: { nuvem: false, navegador: false } },
  { consentimentos: { nuvem: true, navegador: true } },
  { perfilPrivado: true },
  { perfilProtegido: true },
  { perfilProtegido: true, responsavelAutorizou: true },
  { nuvemPausada: true },
  { semRede: true },
  { edicaoEstatica: true },
  { edicaoEstatica: true, nuvemDoSite: true, nuvemDisponivel: true },
  { preferencia: { qualidade: 'nuvem', microfone: 'navegador' } },
  { preferencia: { qualidade: 'rapido', microfone: 'navegador' } },
  { preferencia: { qualidade: 'preciso', microfone: 'modelo' } },
]
const NAVEGADORES: AparelhoDaRota['navegador'][] = [
  semNavegador,
  { fala: true, falaNoAparelho: 'available', bipaAoReligar: false, tradutor: true },
  { fala: true, falaNoAparelho: 'downloadable', bipaAoReligar: false, tradutor: false },
  { fala: true, falaNoAparelho: 'available', bipaAoReligar: true, tradutor: false },
]

/** A grade inteira: aparelho × navegador × plano × tarefa × fonte × idioma × estado × política. */
function* grade(): Generator<PedidoDeRota> {
  for (const nome of NOMES_DOS_APARELHOS)
    for (const navegador of NAVEGADORES)
      for (const plano of NOMES_DOS_PLANOS)
        for (const tarefa of TAREFAS)
          for (const fonte of FONTES)
            for (const idioma of ['en', 'pt'])
              for (const estado of ESTADOS)
                for (const ligada of [false, true])
                  yield pedido({
                    aparelho: { ...APARELHOS[nome], navegador },
                    plano,
                    tarefa,
                    fonte,
                    idioma,
                    estado,
                    ligada,
                  })
}

describe('invariantes (a grade inteira, com a política desligada e ligada)', () => {
  const todos = [...grade()]
  const decisoes = todos.map((p) => ({ p, d: decidirRota(p) }))

  it('a grade tem tamanho de grade', () => {
    expect(todos.length).toBeGreaterThan(20_000)
  })

  it('toda decisão tem motivo da lista fechada, explicação e reserva que termina no aparelho', () => {
    const lista = new Set<string>(MOTIVOS_DA_ROTA)
    for (const { d } of decisoes) {
      expect(lista.has(d.rota.motivo)).toBe(true)
      for (const r of d.reservas) expect(lista.has(r.motivo)).toBe(true)
      for (const x of d.descartadas) expect(lista.has(x.motivo)).toBe(true)
      expect(d.reservas.length).toBeGreaterThan(0)
      expect(d.reservas.at(-1)?.degrau).toBe('modelo-no-aparelho')
      expect(d.explicacao.chave.length).toBeGreaterThan(0)
    }
  })

  it('o que foi descartado não está na rota nem nas reservas', () => {
    for (const { d } of decisoes) {
      const usados = new Set(degraus(d))
      for (const x of d.descartadas) expect(usados.has(x.degrau)).toBe(false)
    }
  })

  it('`processamento` e `nivel` dizem a verdade sobre a rota', () => {
    for (const { d } of decisoes) {
      const g = d.rota.degrau
      if (g === 'modelo-no-aparelho') expect(d.processamento).toEqual({ onde: 'aparelho', enviaDadosA: null })
      if (g === 'navegador-no-aparelho') expect(d.processamento).toEqual({ onde: 'navegador', enviaDadosA: null })
      if (g === 'navegador-na-nuvem') expect(d.processamento.enviaDadosA).not.toBeNull()
      if (NUVENS.includes(g)) expect(d.processamento).toEqual({ onde: 'nuvem', enviaDadosA: 'nos' })
      expect(d.nivel).toBe(g === 'nuvem-ao-vivo' ? 'aovivo' : NUVENS.includes(g) ? 'precisao' : 'aparelho')
    }
  })

  it('`mt-parcial` nunca sai do aparelho, e o motivo é `parcial-nunca-sai`', () => {
    for (const { p, d } of decisoes) {
      if (p.tarefa !== 'mt-parcial') continue
      expect(degraus(d).every((g) => DO_APARELHO.includes(g))).toBe(true)
      expect(d.rota.motivo).toBe('parcial-nunca-sai')
    }
  })

  it('perfil privado nunca sai do aparelho, nem nas reservas', () => {
    for (const { p, d } of decisoes) {
      if (!p.estado.perfilPrivado) continue
      expect(degraus(d).every((g) => DO_APARELHO.includes(g))).toBe(true)
    }
  })

  it('perfil protegido sem o responsável nunca sai do aparelho, em qualquer plano', () => {
    for (const { p, d } of decisoes) {
      if (!p.estado.perfilProtegido || p.estado.responsavelAutorizou) continue
      expect(degraus(d).every((g) => DO_APARELHO.includes(g))).toBe(true)
    }
  })

  it('sem consentimento de nuvem, nenhuma nuvem do Babel entra; a que caberia sai com `sem-consentimento`', () => {
    for (const { p, d } of decisoes) {
      if (p.estado.consentimentos.nuvem) continue
      expect(degraus(d).some((g) => NUVENS.includes(g))).toBe(false)
    }
    const d = decidirRota(pedido({ plano: 'premium', estado: { consentimentos: { nuvem: false, navegador: false } } }))
    expect(d.rota).toMatchObject({ degrau: 'modelo-no-aparelho', motivo: 'sem-consentimento' })
    expect(d.descartadas).toContainEqual({ degrau: 'nuvem-por-trechos', motivo: 'sem-consentimento' })
    expect(d.acao).toBe('autorizar-nuvem')
  })

  it('sem o aceite do navegador, a fala que envia o áudio ao fabricante nunca entra', () => {
    for (const { p, d } of decisoes) {
      if (p.estado.consentimentos.navegador) continue
      expect(degraus(d)).not.toContain('navegador-na-nuvem')
    }
  })

  it('a nuvem do Babel só entra quando o plano inclui (ou é a nuvem do site)', () => {
    for (const { p, d } of decisoes) {
      if (p.tarefa !== 'stt-final' || p.plano.nuvemPorTrechos) continue
      expect(degraus(d)).not.toContain('nuvem-por-trechos')
      if (!p.plano.nuvemAoVivo) expect(degraus(d)).not.toContain('nuvem-ao-vivo')
    }
  })

  it('é pura: a mesma entrada dá a mesma decisão, e a entrada não é alterada', () => {
    for (const p of todos.slice(0, 500)) {
      const copia = structuredClone(p)
      expect(decidirRota(p)).toEqual(decidirRota(p))
      expect(p).toEqual(copia)
    }
  })
})

describe('a política decide pela capacidade, não pelo nome do plano', () => {
  it('dois planos de nomes diferentes com as mesmas capacidades e a mesma cota: decisão idêntica', () => {
    const catalogo: Record<string, PlanoDaRota> = {
      premium: { ...premium },
      selfhost: { ...premium },
      planoQueAindaNaoExiste: { ...premium },
    }
    for (const ligada of [false, true])
      for (const aparelho of NOMES_DOS_APARELHOS)
        for (const tarefa of TAREFAS) {
          const [a, ...resto] = Object.values(catalogo).map((plano) =>
            decidirRota(pedido({ aparelho, plano, tarefa, ligada })),
          )
          for (const b of resto) expect(b).toEqual(a)
        }
  })

  it('um nome pendurado no plano não muda nada', () => {
    for (const nome of ['free', 'premium', 'essencial', 'aovivo']) {
      const comNome = { ...essencial, nome, plan: nome } as PlanoDaRota
      for (const ligada of [false, true])
        expect(decidirRota(pedido({ plano: comNome, ligada }))).toEqual(
          decidirRota(pedido({ plano: essencial, ligada })),
        )
    }
  })
})

describe('cota esgotada não bloqueia: cai para o aparelho e mostra o consumo', () => {
  it.each([
    ['mês', { trechosNoMesS: 0 }, 'cota-do-mes'],
    ['dia', { trechosNoDiaS: 0 }, 'cota-do-dia'],
    ['mês e dia (o mês vem primeiro)', { trechosNoMesS: 0, trechosNoDiaS: 0 }, 'cota-do-mes'],
  ] as const)('%s zerado, política desligada e ligada', (_n, restante, motivo) => {
    const plano = { ...premium, restante: { ...semTeto, ...restante } }
    for (const ligada of [false, true])
      for (const aparelho of NOMES_DOS_APARELHOS) {
        const d = decidirRota(pedido({ aparelho, plano, ligada }))
        expect(d.rota.degrau).toBe('modelo-no-aparelho')
        expect(d.descartadas).toContainEqual({ degrau: 'nuvem-por-trechos', motivo })
        expect(d.acao).toBe('ver-consumo')
        if (aparelho !== 'desktopGpu' || !ligada) expect(d.rota.motivo).toBe(motivo)
      }
  })

  it('cota que ainda resta não muda nada', () => {
    const plano = { ...premium, restante: { ...semTeto, trechosNoMesS: 1, trechosNoDiaS: 1 } }
    expect(decidirRota(pedido({ plano })).rota.degrau).toBe('nuvem-por-trechos')
  })
})

// ───────────────────────────── a explicação ─────────────────────────────

describe('explicação: chave em português e variáveis', () => {
  it('cada motivo tem a sua frase, e o idioma vai como variável', () => {
    const d = decidirRota(pedido({ plano: 'premium', idioma: 'en-US', ligada: true }))
    expect(d.explicacao.chave).toContain('{idioma}')
    expect(d.explicacao.vars).toEqual({ idioma: 'en' })
  })

  it('motivos diferentes dão frases diferentes', () => {
    const a = decidirRota(pedido({ plano: 'premium', estado: { nuvemPausada: true } })).explicacao.chave
    const b = decidirRota(pedido({ plano: 'premium', estado: { semRede: true } })).explicacao.chave
    expect(a).not.toBe(b)
  })
})

// ───────────────────────────── equivalência com hoje ─────────────────────────────

const DISPOSITIVOS: DispositivoDaRota[] = [
  { tipo: 'quest', permiteSmall: false, economiaDeDados: false },
  {
    tipo: 'quest',
    permiteSmall: false,
    economiaDeDados: false,
    adaptadorReal: true,
    pontuacaoWasm: 1,
    pontuacaoWebgpu: 3,
  },
  { tipo: 'celular-fraco', permiteSmall: false, economiaDeDados: false },
  { tipo: 'celular-fraco', permiteSmall: false, economiaDeDados: true },
  { tipo: 'celular-bom', permiteSmall: false, economiaDeDados: false },
  {
    tipo: 'celular-bom',
    permiteSmall: false,
    economiaDeDados: false,
    adaptadorReal: true,
    shaderF16: true,
    pontuacaoWasm: 1,
    pontuacaoWebgpu: 2,
  },
  { tipo: 'desktop-sem-gpu', permiteSmall: false, economiaDeDados: false },
  { tipo: 'desktop-sem-gpu', permiteSmall: false, economiaDeDados: true },
  { tipo: 'desktop-com-gpu', permiteSmall: true, economiaDeDados: false },
  { tipo: 'desktop-com-gpu', permiteSmall: true, economiaDeDados: false, adaptadorReal: true },
  { tipo: 'desktop-com-gpu', permiteSmall: true, economiaDeDados: false, adaptadorReal: true, gpuCaiu: true },
  {
    tipo: 'desktop-com-gpu',
    permiteSmall: true,
    economiaDeDados: false,
    adaptadorReal: true,
    pontuacaoWasm: 2,
    pontuacaoWebgpu: 2,
  },
  { tipo: 'desktop-com-gpu', permiteSmall: true, economiaDeDados: true, adaptadorReal: true },
]
const QUALIDADES: SttQuality[] = ['auto', 'fast', 'accurate', 'cloud']
const IDIOMAS = ['en', 'pt', 'es', 'en-US', '']
/** [mic vai ao modelo?, idioma do mic, só microfone?] */
const MICROFONES: [boolean, string, boolean][] = [
  [false, 'pt', false],
  [true, 'pt', false],
  [true, 'en', false],
  [true, 'pt', true],
  [true, 'en', true],
  [false, 'en', true],
]

describe('EQUIVALÊNCIA com hoje (política desligada)', () => {
  it('`paraRotaDoStt(decidirRota(...))` = `routeStt(...)`: nuvem primeiro, modelo local, dtype e device', () => {
    let casos = 0
    for (const [estatica, nuvemDoSite] of [
      [false, false],
      [true, false],
      [true, true],
    ])
      for (const dispositivo of DISPOSITIVOS)
        for (const qualidade of QUALIDADES)
          for (const idiomaDoConteudo of IDIOMAS)
            for (const [micVaiAoModelo, idiomaDoMicrofone, soMicrofone] of MICROFONES)
              for (const detectarIdioma of [false, true])
                for (const temWebGpu of [false, true])
                  for (const nuvemDisponivel of [false, true])
                    for (const perfilId of ['free-web', 'local-private']) {
                      mundo.estatica = estatica
                      mundo.nuvemDoSite = nuvemDoSite
                      const hoje = routeStt({
                        contentLang: idiomaDoConteudo,
                        micLang: micVaiAoModelo ? idiomaDoMicrofone : '',
                        soMicrofone,
                        autoDetect: detectarIdioma,
                        quality: qualidade,
                        hasWebGpu: temWebGpu,
                        cloudAvailable: nuvemDisponivel,
                        profileId: perfilId,
                        dispositivo,
                      })
                      const entrada = {
                        idiomaDoConteudo,
                        idiomaDoMicrofone,
                        micVaiAoModelo,
                        soMicrofone,
                        detectarIdioma,
                        qualidade,
                        temWebGpu,
                        nuvemDisponivel,
                        perfilId,
                        dispositivo,
                        leve: dispositivo.tipo === 'quest' || dispositivo.tipo === 'celular-fraco',
                      }
                      /* O ambiente "aberto": tudo o que o `routeStt` não vê (consentimento, idade, plano,
                         cota) no estado em que não interfere. É aí que as duas decisões têm de coincidir. */
                      const ambiente = {
                        consentiuNuvem: true,
                        consentiuNavegador: false,
                        protegido: false,
                        responsavelAutorizou: false,
                        edicaoEstatica: estatica,
                        nuvemDoSite,
                        capacidades: {
                          managedCloudStt: true,
                          managedCloudLlm: true,
                          traducaoNuance: true,
                          vozNatural: true,
                        },
                        alivioAceito: false,
                      }
                      const p = montarPedidoDeRota(entrada, ambiente)
                      expect(p.estado.politicaLigada).toBeFalsy()
                      const politica = paraRotaDoStt(decidirRota(p))
                      const contexto = JSON.stringify({ estatica, nuvemDoSite, ...entrada })
                      expect(politica.preferCloud, contexto).toBe(hoje.preferCloud)
                      expect(politica.localModel, contexto).toBe(hoje.localModel)
                      expect(politica.dtype ?? 'hybrid', contexto).toBe(hoje.dtype ?? 'hybrid')
                      expect(politica.device, contexto).toBe(hoje.device)
                      expect(divergenciaDaRotaDoStt(p, hoje), contexto).toBeNull()
                      casos++
                    }
    expect(casos).toBe(3 * 13 * 4 * 5 * 6 * 2 * 2 * 2 * 2)
  })

  it('o motor do microfone é o de `escolherMotorDoMic`', () => {
    const MOTOR: Partial<Record<DegrauDaRota, string>> = {
      'navegador-no-aparelho': 'web-speech-local',
      'navegador-na-nuvem': 'web-speech-nuvem',
    }
    let casos = 0
    for (const preferido of ['browser', 'whisper'] as const)
      for (const webSpeechSuportado of [false, true])
        for (const noAparelho of [null, 'available', 'downloadable', 'downloading', 'unavailable'] as const)
          for (const consentiuNavegador of [false, true])
            for (const [protegido, responsavelAutorizou] of [
              [false, false],
              [true, false],
              [true, true],
            ])
              for (const privado of [false, true])
                for (const bipaAoReligar of [false, true])
                  for (const plano of ['gratis', 'premium'] as const) {
                    const entrada: EntradaDoMotorDoMic = {
                      preferido,
                      webSpeechSuportado,
                      noAparelho,
                      consentiuNavegador,
                      rapidoPermitido: !protegido || responsavelAutorizou,
                      perfilId: privado ? 'local-private' : 'free-web',
                      bipaAoReligar,
                    }
                    const hoje = escolherMotorDoMic(entrada)
                    const d = decidirRota(
                      pedido({
                        aparelho: {
                          ...APARELHOS.celularBom,
                          navegador: {
                            fala: webSpeechSuportado,
                            falaNoAparelho: noAparelho,
                            bipaAoReligar,
                            tradutor: false,
                          },
                        },
                        plano,
                        fonte: 'microfone',
                        estado: {
                          consentimentos: { nuvem: true, navegador: consentiuNavegador },
                          perfilPrivado: privado,
                          perfilProtegido: protegido,
                          responsavelAutorizou,
                          preferencia: {
                            qualidade: 'auto',
                            microfone: preferido === 'browser' ? 'navegador' : 'modelo',
                          },
                        },
                      }),
                    )
                    expect(MOTOR[d.rota.degrau] ?? 'whisper', JSON.stringify(entrada)).toBe(hoje.motor)
                    casos++
                  }
    expect(casos).toBe(2 * 2 * 5 * 2 * 3 * 2 * 2 * 2)
  })
})

// ───────────────────────────── a conferência em desenvolvimento ─────────────────────────────

describe('conferência da rota (dev): diz onde a política e a rota efetiva divergem', () => {
  const entrada = {
    idiomaDoConteudo: 'pt',
    idiomaDoMicrofone: 'pt',
    micVaiAoModelo: false,
    soMicrofone: false,
    detectarIdioma: false,
    qualidade: 'auto' as const,
    temWebGpu: false,
    nuvemDisponivel: true,
    perfilId: 'free-web',
    dispositivo: { tipo: 'desktop-sem-gpu', permiteSmall: false, economiaDeDados: false } as DispositivoDaRota,
    leve: false,
  }
  const ambiente = {
    consentiuNuvem: true,
    consentiuNavegador: false,
    protegido: false,
    responsavelAutorizou: false,
    edicaoEstatica: false,
    nuvemDoSite: false,
    capacidades: { managedCloudStt: true, managedCloudLlm: true, traducaoNuance: true, vozNatural: true },
    alivioAceito: false,
  }
  const hoje = () => routeStt({ ...ROTA_DE_HOJE })
  const ROTA_DE_HOJE = {
    contentLang: 'pt',
    autoDetect: false,
    quality: 'auto' as const,
    hasWebGpu: false,
    cloudAvailable: true,
    profileId: 'free-web',
    dispositivo: entrada.dispositivo,
  }

  it('sem divergência quando o ambiente não interfere', () => {
    expect(divergenciaDaRotaDoStt(montarPedidoDeRota(entrada, ambiente), hoje())).toBeNull()
  })

  it('sem consentimento de nuvem: a rota de hoje diz "nuvem primeiro", a política diz aparelho', () => {
    const p = montarPedidoDeRota(entrada, { ...ambiente, consentiuNuvem: false })
    const texto = divergenciaDaRotaDoStt(p, hoje())
    expect(texto).toMatch(/nuvem primeiro/)
    expect(texto).toMatch(/sem-consentimento/)
  })

  it('o Grátis que aceitou a nuvem de alívio conta como plano que inclui a nuvem', () => {
    const semDireito = { ...ambiente.capacidades, managedCloudStt: false }
    const p = montarPedidoDeRota(entrada, { ...ambiente, capacidades: semDireito, alivioAceito: true })
    expect(p.plano.nuvemPorTrechos).toBe(true)
    expect(divergenciaDaRotaDoStt(p, hoje())).toBeNull()
  })

  it('modelo local diferente também é divergência', () => {
    const p = montarPedidoDeRota(entrada, ambiente)
    expect(divergenciaDaRotaDoStt(p, { ...hoje(), localModel: WHISPER_MODELS.tiny })).toMatch(/modelo/)
  })

  it('o pedido montado nunca liga a política', () => {
    expect(montarPedidoDeRota(entrada, ambiente).estado.politicaLigada).toBeFalsy()
  })
})
