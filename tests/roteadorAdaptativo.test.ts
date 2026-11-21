/**
 * ROTEADOR ADAPTATIVO EM SOMBRA (openspec `roteador-adaptativo-em-sombra`): a decisão pura (`decidirAdaptativo`) e a
 * agregação (`sombraDoRoteador`). A guarda de `decidirRota` vem primeiro, a histerese não deixa oscilar, a medição de STT
 * entra como prior e o custo de CPU é provado por microbenchmark.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { REGISTRO_DE_MOTORES } from '../src/core/harness/registroDeMotores'
import { MEDICOES_DE_STT, type MedicoesDeStt } from '../src/core/rota/medicoesDeStt'
import {
  type AparelhoDaRota,
  decidirAdaptativo,
  decidirRota,
  type DegrauAdaptativo,
  ESTADO_INICIAL_DO_ADAPTATIVO,
  type EstadoDaRota,
  type EstadoDoAdaptativo,
  guardaDoAdaptativo,
  LIMIARES_DO_ADAPTATIVO,
  MOTIVOS_DA_ROTA,
  type PedidoDeRota,
  type PlanoDaRota,
  type SessaoDaRota,
} from '../src/core/rota/politicaDeRota'
import {
  baldeDaFila,
  baldeDoRtf,
  criarSombraDoRoteador,
  DEGRAUS_EFETIVOS,
  MAX_CONTAGEM_DO_ROTEADOR,
  MAX_LINHAS_DO_ROTEADOR,
} from '../src/core/rota/sombraDoRoteador'

// ───────────────────────────── o pedido ─────────────────────────────

const semTeto = { trechosNoMesS: null, trechosNoDiaS: null, aoVivoNoMesS: null, aoVivoNoDiaS: null }
const comNuvem: PlanoDaRota = {
  nuvemPorTrechos: true,
  precisaoPorPadrao: false,
  nuvemAoVivo: false,
  traducaoNaNuvem: true,
  nuance: false,
  vozNeural: false,
  restante: semTeto,
}
const semPlano: PlanoDaRota = { ...comNuvem, nuvemPorTrechos: false, traducaoNaNuvem: false }
const aparelho: AparelhoDaRota = {
  tipo: 'desktop-sem-gpu',
  leve: false,
  travando: false,
  gpuProvada: false,
  economiaDeDados: false,
  smallNaGpu: false,
  whisperNaGpu: false,
  shaderF16: false,
  navegador: { fala: false, falaNoAparelho: null, bipaAoReligar: false, tradutor: false },
  modelos: { opusMt: true, bergamot: false, llmLocal: false },
}
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
  idioma?: string
  plano?: PlanoDaRota
  estado?: Partial<EstadoDaRota>
  sessao?: SessaoDaRota
}): PedidoDeRota {
  const plano = p.plano ?? comNuvem
  return {
    tarefa: 'stt-final',
    fonte: 'sistema',
    idioma: p.idioma ?? 'pt',
    aparelho,
    plano,
    estado: { ...estadoAberto, nuvemDisponivel: plano.nuvemPorTrechos, ...p.estado },
    ...(p.sessao ? { sessao: p.sessao } : {}),
  }
}

const calma: SessaoDaRota = { rtf: 0.3, fila: 0, msDeMt: 200, confianca: 0.95 }
const pressaoDeRtf: SessaoDaRota = { rtf: 1.2, fila: 0, msDeMt: 200, confianca: 0.95 }
const pressaoDeFila: SessaoDaRota = { rtf: 0.6, fila: 3, msDeMt: 200, confianca: 0.95 }
const pressaoDeConfianca: SessaoDaRota = { rtf: 0.6, fila: 0, msDeMt: 200, confianca: 0.5 }

/** A guarda de quem JÁ roda no aparelho (o caso da sombra: a nuvem só entra se a guarda deixar). */
const guardaLocal = (p: PedidoDeRota) => guardaDoAdaptativo(p, 'modelo-no-aparelho')

/** Roda uma sequência de falas e devolve as decisões e o estado final. */
function rodar(base: PedidoDeRota, falas: SessaoDaRota[], inicio: EstadoDoAdaptativo = ESTADO_INICIAL_DO_ADAPTATIVO) {
  const guarda = guardaLocal(base)
  let estado = inicio
  const decisoes: DegrauAdaptativo[] = []
  let trocas = 0
  for (const sessao of falas) {
    const r = decidirAdaptativo({ ...base, sessao }, estado, { guarda })
    estado = r.estado
    decisoes.push(r.decisao)
    if (r.trocou) trocas++
  }
  return { decisoes, estado, trocas }
}
const repetir = (s: SessaoDaRota, n: number): SessaoDaRota[] => Array.from({ length: n }, () => s)

// ───────────────────────────── equivalência ─────────────────────────────

describe('sem sessão, nada muda', () => {
  it('decidirRota ignora `sessao`: a decisão é idêntica com ou sem ela', () => {
    for (const idioma of ['pt', 'en', 'es']) {
      const base = pedido({ idioma })
      expect(decidirRota({ ...base, sessao: pressaoDeRtf })).toEqual(decidirRota(base))
    }
  })

  it('decidirAdaptativo sem sessão mantém e não mexe no estado', () => {
    const estado: EstadoDoAdaptativo = { indice: 1, subir: 2, descer: 0, ultima: 'modelo-menor' }
    const r = decidirAdaptativo(pedido({}), estado)
    expect(r).toMatchObject({ decisao: 'manter', trocou: false, gatilho: 'sem-sessao' })
    expect(r.estado).toBe(estado)
  })

  it('não altera o pedido', () => {
    const base = pedido({ sessao: pressaoDeRtf })
    const copia = structuredClone(base)
    rodar(base, repetir(pressaoDeRtf, 10))
    expect(base).toEqual(copia)
  })
})

// ───────────────────────────── a regra ─────────────────────────────

describe('decidirAdaptativo: sobe, desce, guarda primeiro', () => {
  const base = pedido({})

  it('a escada do português no desktop sem GPU: manter, modelo menor, nuvem', () => {
    expect(guardaLocal(base).escada).toEqual(['manter', 'modelo-menor', 'nuvem'])
  })

  it('calmo, mantém', () => {
    expect(rodar(base, repetir(calma, 20)).decisoes.every((d) => d === 'manter')).toBe(true)
  })

  it.each([
    ['RTF alto', pressaoDeRtf, 'rtf-alto'],
    ['fila cheia', pressaoDeFila, 'fila-cheia'],
    ['confiança baixa', pressaoDeConfianca, 'confianca-baixa'],
  ] as const)('sobe um degrau com %s por N falas seguidas (e só então)', (_nome, sessao, gatilho) => {
    const n = LIMIARES_DO_ADAPTATIVO.falasParaSubir
    const { decisoes } = rodar(base, repetir(sessao, n))
    expect(decisoes.slice(0, n - 1).every((d) => d === 'manter')).toBe(true)
    expect(decisoes[n - 1]).toBe('modelo-menor')
    expect(
      decidirAdaptativo({ ...base, sessao }, ESTADO_INICIAL_DO_ADAPTATIVO, { guarda: guardaLocal(base) }).gatilho,
    ).toBe(gatilho)
  })

  it('segue subindo, um degrau por janela, até a nuvem, e para no topo', () => {
    const n = LIMIARES_DO_ADAPTATIVO.falasParaSubir
    const { decisoes } = rodar(base, repetir(pressaoDeRtf, n * 4))
    expect(decisoes[n - 1]).toBe('modelo-menor')
    expect(decisoes[2 * n - 1]).toBe('nuvem')
    expect(decisoes.at(-1)).toBe('nuvem')
  })

  it('desce só depois de M falas calmas', () => {
    const n = LIMIARES_DO_ADAPTATIVO.falasParaSubir
    const m = LIMIARES_DO_ADAPTATIVO.falasParaDescer
    const { decisoes } = rodar(base, [...repetir(pressaoDeRtf, n), ...repetir(calma, m + 2)])
    const depois = decisoes.slice(n)
    expect(decisoes[n - 1]).toBe('modelo-menor')
    expect(depois.slice(0, m - 1).every((d) => d === 'modelo-menor')).toBe(true)
    expect(depois[m - 1]).toBe('manter')
  })

  it('confiança baixa impede a calma (não desce para subir de novo)', () => {
    const n = LIMIARES_DO_ADAPTATIVO.falasParaSubir
    const { decisoes } = rodar(base, [...repetir(pressaoDeRtf, n), ...repetir({ ...calma, confianca: 0.4 }, 20)])
    expect(decisoes.at(-1)).not.toBe('manter')
  })

  it('o RTF não medido não sobe nem desce por RTF', () => {
    const r = rodar(base, repetir({ rtf: null, fila: 0, msDeMt: null, confianca: null }, 30))
    expect(r.decisoes.every((d) => d === 'manter')).toBe(true)
  })

  it('a nuvem como rota efetiva só tem `manter`', () => {
    const g = guardaDoAdaptativo(base, 'nuvem-por-trechos')
    expect(g.escada).toEqual(['manter'])
    const r = decidirAdaptativo({ ...base, sessao: pressaoDeRtf }, ESTADO_INICIAL_DO_ADAPTATIVO, { guarda: g })
    expect(r.decisao).toBe('manter')
  })

  it('o modelo mínimo (celular fraco falando inglês) não tem modelo menor', () => {
    const fraco = pedido({ idioma: 'en' })
    fraco.aparelho = { ...aparelho, tipo: 'celular-fraco', leve: true }
    expect(guardaLocal(fraco).escada).not.toContain('modelo-menor')
  })

  it('a guarda que encolhe a escada derruba a decisão na hora', () => {
    const n = LIMIARES_DO_ADAPTATIVO.falasParaSubir
    const alto = rodar(base, repetir(pressaoDeRtf, n * 2)).estado
    expect(alto.indice).toBe(2)
    const semNuvem = pedido({ estado: { consentimentos: { nuvem: false, navegador: false } }, sessao: pressaoDeRtf })
    const r = decidirAdaptativo(semNuvem, alto, { guarda: guardaLocal(semNuvem) })
    expect(r.decisao).not.toBe('nuvem')
    expect(r.trocou).toBe(true)
  })
})

// ───────────────────────────── guarda: a grade de A-012 ─────────────────────────────

describe('guarda primeiro: a nuvem nunca é sugerida onde a guarda a barra (A-012)', () => {
  const planos = {
    semPlano,
    comNuvem,
    cotaDoMes: { ...comNuvem, restante: { ...semTeto, trechosNoMesS: 0 } },
    cotaDoDia: { ...comNuvem, restante: { ...semTeto, trechosNoDiaS: 0 } },
  }
  const estados: Record<string, Partial<EstadoDaRota>> = {
    'adulto consentiu': {},
    'adulto sem consentimento': { consentimentos: { nuvem: false, navegador: false } },
    'convidado (protegido) sem responsável': { perfilProtegido: true, responsavelAutorizou: false },
    'menor sem responsável, consentiu': {
      perfilProtegido: true,
      responsavelAutorizou: false,
      consentimentos: { nuvem: true, navegador: true },
    },
    'menor com responsável': { perfilProtegido: true, responsavelAutorizou: true },
    'perfil privado': { perfilPrivado: true },
    'sem rede': { semRede: true },
    'nuvem pausada': { nuvemPausada: true },
    'servidor sem nuvem': { nuvemDisponivel: false },
  }
  const casos = Object.entries(planos).flatMap(([plano, p]) =>
    Object.entries(estados).map(([nome, e]) => ({ plano, nome, p, e })),
  )

  it.each(casos)('$plano · $nome', ({ p, e }) => {
    const base = pedido({ plano: p, estado: { ...e, nuvemDisponivel: e.nuvemDisponivel ?? p.nuvemPorTrechos } })
    const decisao = decidirRota(base)
    const nuvemDecidida = [decisao.rota, ...decisao.reservas].some((x) => x.degrau.startsWith('nuvem'))
    const r = rodar(base, repetir({ rtf: 5, fila: 9, msDeMt: 9000, confianca: 0.1 }, 40))
    const nuvemLiberada = guardaLocal(base).escada.includes('nuvem')
    // A nuvem só é liberada se a própria `decidirRota` a deixou E nada barra (consentimento, perfil, rede, servidor).
    if (nuvemLiberada) {
      expect(nuvemDecidida).toBe(true)
      expect(base.estado.consentimentos.nuvem).toBe(true)
      expect(base.estado.perfilPrivado).toBe(false)
      expect(base.estado.perfilProtegido && !base.estado.responsavelAutorizou).toBe(false)
      expect(base.estado.semRede || base.estado.nuvemPausada || !base.estado.nuvemDisponivel).toBe(false)
    } else {
      expect(r.decisoes).not.toContain('nuvem')
    }
  })

  it('convidado e menor sem consentimento NUNCA têm nuvem na escada, com qualquer plano e cota', () => {
    for (const p of Object.values(planos)) {
      for (const e of [
        { perfilProtegido: true, responsavelAutorizou: false },
        { consentimentos: { nuvem: false, navegador: false } },
        { perfilProtegido: true, responsavelAutorizou: false, consentimentos: { nuvem: false, navegador: false } },
      ] satisfies Partial<EstadoDaRota>[]) {
        expect(guardaLocal(pedido({ plano: p, estado: e })).escada).not.toContain('nuvem')
      }
    }
  })

  it('o caso que libera: adulto com plano, consentimento e servidor', () => {
    expect(guardaLocal(pedido({})).escada).toContain('nuvem')
  })
})

// ───────────────────────────── a histerese ─────────────────────────────

describe('sem oscilação', () => {
  const base = pedido({})

  it('RTF alternando em torno do limiar a cada fala não troca nada', () => {
    const l = LIMIARES_DO_ADAPTATIVO
    const alto: SessaoDaRota = { rtf: l.rtfSobe + 0.05, fila: 0, msDeMt: null, confianca: 0.95 }
    const baixo: SessaoDaRota = { rtf: l.rtfSobe - 0.05, fila: 0, msDeMt: null, confianca: 0.95 }
    const falas = Array.from({ length: 200 }, (_, i) => (i % 2 ? baixo : alto))
    expect(rodar(base, falas).trocas).toBe(0)
  })

  it('RTF ruidoso entre pressão e calma: no máximo uma troca por janela de histerese', () => {
    const l = LIMIARES_DO_ADAPTATIVO
    // ruído determinístico (LCG) entre 0,2 e 1,4
    let x = 12345
    const ruido = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648) * 1.2 + 0.2
    const falas: SessaoDaRota[] = Array.from({ length: 600 }, () => ({
      rtf: ruido(),
      fila: 0,
      msDeMt: null,
      confianca: 0.95,
    }))
    const { decisoes } = rodar(base, falas)
    const trocasEm: number[] = []
    decisoes.forEach((d, i) => {
      if (i > 0 && d !== decisoes[i - 1]) trocasEm.push(i)
    })
    for (let i = 1; i < trocasEm.length; i++)
      expect(trocasEm[i] - trocasEm[i - 1]).toBeGreaterThanOrEqual(Math.min(l.falasParaSubir, l.falasParaDescer))
  })

  it('pressão sustentada: sobe e fica; calma sustentada: desce e fica (≤ 2 trocas por subida e descida)', () => {
    const l = LIMIARES_DO_ADAPTATIVO
    const r = rodar(base, [...repetir(pressaoDeRtf, l.falasParaSubir * 3), ...repetir(calma, l.falasParaDescer * 3)])
    expect(r.trocas).toBe(4) // manter→menor→nuvem→menor→manter
    expect(r.decisoes.at(-1)).toBe('manter')
  })
})

// ───────────────────────────── medicoesDeStt ─────────────────────────────

describe('prior de `medicoesDeStt` (inglês)', () => {
  /* Hoje o inglês fica no aparelho e a guarda barra a nuvem; ela só entra na escada do inglês quando a rota a admite (aqui,
     a pessoa escolheu "Nuvem" em Qualidade da transcrição). É aí que o prior decide se a CONFIANÇA baixa pode sugeri-la. */
  const en = pedido({
    idioma: 'en',
    estado: { preferencia: { qualidade: 'nuvem', microfone: 'modelo' } },
  })
  const n = LIMIARES_DO_ADAPTATIVO.falasParaSubir
  const subirTudo = (medicoes?: MedicoesDeStt, sessao = pressaoDeConfianca) => {
    const guarda = guardaLocal(en)
    let estado = ESTADO_INICIAL_DO_ADAPTATIVO
    const decisoes: DegrauAdaptativo[] = []
    for (let i = 0; i < n * 4; i++) {
      const r = decidirAdaptativo({ ...en, sessao }, estado, { guarda, medicoes })
      estado = r.estado
      decisoes.push(r.decisao)
    }
    return decisoes
  }

  it('hoje o inglês no automático não tem nuvem na escada (a guarda a barra)', () => {
    expect(guardaLocal(pedido({ idioma: 'en' })).escada).not.toContain('nuvem')
  })

  it('com a medição de hoje (sem nuvem normalizada medida), a confiança baixa NUNCA leva à nuvem', () => {
    expect(guardaLocal(en).escada).toContain('nuvem')
    const d = subirTudo()
    expect(d).toContain('modelo-menor')
    expect(d).not.toContain('nuvem')
  })

  it('mas RTF alto e fila cheia ainda levam à nuvem', () => {
    expect(subirTudo(undefined, pressaoDeRtf)).toContain('nuvem')
    expect(subirTudo(undefined, pressaoDeFila)).toContain('nuvem')
  })

  it('com a nuvem normalizada vencendo o local (IC pareado abaixo de zero), a confiança volta a poder sugerir a nuvem', () => {
    const vence: MedicoesDeStt = {
      en: {
        ...MEDICOES_DE_STT.en,
        nuvemNormalizada: { wer: 5, ic95: [4, 6], n: 100, data: '2026-11-22', fonte: 'teste' },
        nuvemNormalizadaContraLocal: {
          'moonshine-base': { valor: -5, ic95: [-8, -2], n: 100, data: '2026-11-22', fonte: 'teste' },
          'parakeet-v3': null,
        },
      },
    }
    expect(subirTudo(vence)).toContain('nuvem')
  })

  it('o português não tem medição: vale a regra geral (a confiança pode sugerir a nuvem)', () => {
    const pt = pedido({ idioma: 'pt' })
    const guarda = guardaLocal(pt)
    let estado = ESTADO_INICIAL_DO_ADAPTATIVO
    const decisoes: DegrauAdaptativo[] = []
    for (let i = 0; i < n * 4; i++) {
      const r = decidirAdaptativo({ ...pt, sessao: pressaoDeConfianca }, estado, { guarda })
      estado = r.estado
      decisoes.push(r.decisao)
    }
    expect(decisoes).toContain('nuvem')
  })
})

// ───────────────────────────── custo de CPU ─────────────────────────────

describe('custo de CPU de decidirAdaptativo', () => {
  it('p99 ≤ 0,05 ms em 10 000 decisões (guarda pré-calculada, como na captura)', () => {
    const base = pedido({})
    const guarda = guardaLocal(base)
    const sessoes = [calma, pressaoDeRtf, pressaoDeFila, pressaoDeConfianca]
    let estado = ESTADO_INICIAL_DO_ADAPTATIVO
    const rodada = (i: number) => {
      estado = decidirAdaptativo({ ...base, sessao: sessoes[i % 4] }, estado, { guarda }).estado
    }
    for (let i = 0; i < 2000; i++) rodada(i) // aquecimento do JIT
    const tempos: number[] = []
    for (let i = 0; i < 10_000; i++) {
      const t0 = performance.now()
      rodada(i)
      tempos.push(performance.now() - t0)
    }
    tempos.sort((a, b) => a - b)
    const p99 = tempos[Math.floor(tempos.length * 0.99)]
    console.info(`decidirAdaptativo: p50 ${tempos[5000].toFixed(5)} ms, p99 ${p99.toFixed(5)} ms`)
    expect(p99).toBeLessThanOrEqual(0.05)
  })

  it('a guarda (consulta a decidirRota, uma vez por captura) custa pouco, mas não é o caminho de cada fala', () => {
    const base = pedido({})
    for (let i = 0; i < 500; i++) guardaLocal(base)
    const tempos: number[] = []
    for (let i = 0; i < 2000; i++) {
      const t0 = performance.now()
      guardaLocal(base)
      tempos.push(performance.now() - t0)
    }
    tempos.sort((a, b) => a - b)
    console.info(
      `guardaDoAdaptativo: p50 ${tempos[1000].toFixed(4)} ms, p99 ${tempos[1980].toFixed(4)} ms (só informativo)`,
    )
    expect(tempos[1000]).toBeLessThan(1) // 1 ms de mediana: folga enorme, só pega regressão absurda
  })
})

// ───────────────────────────── a agregação ─────────────────────────────

describe('sombraDoRoteador: agregação em baldes e lista fechada', () => {
  const fala = (o: Partial<Parameters<ReturnType<typeof criarSombraDoRoteador>['registrar']>[0]> = {}) => ({
    tomaria: 'manter' as DegrauAdaptativo,
    efetiva: 'modelo-no-aparelho' as const,
    motivo: 'aparelho-da-conta' as const,
    rtf: 0.4,
    fila: 0,
    trocou: false,
    ...o,
  })

  it('os baldes de RTF e de fila', () => {
    expect([0.1, 0.5, 0.51, 0.8, 0.81, 3, null, Number.NaN].map(baldeDoRtf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
    expect([0, 1, 2, 7, -1].map(baldeDaFila)).toEqual([0, 1, 2, 2, 0])
  })

  it('soma contagens por combinação, conta trocas e zera ao drenar', () => {
    const s = criarSombraDoRoteador()
    s.registrar(fala())
    s.registrar(fala())
    s.registrar(fala({ tomaria: 'nuvem', rtf: 2, fila: 3, trocou: true }))
    const campo = s.drenar()!
    expect(campo.trocas).toBe(1)
    expect(campo.linhas).toHaveLength(2)
    expect(campo.linhas.find((l) => l.tomaria === 'manter')).toMatchObject({ n: 2, rtf: 0, fila: 0 })
    expect(campo.linhas.find((l) => l.tomaria === 'nuvem')).toMatchObject({ n: 1, rtf: 2, fila: 2 })
    expect(s.drenar()).toBeNull()
  })

  it('só guarda baldes e listas fechadas: nenhum valor bruto, texto, id ou hora', () => {
    const s = criarSombraDoRoteador()
    s.registrar(fala({ rtf: 0.7312345, fila: 1 }))
    const campo = s.drenar()!
    expect(Object.keys(campo).sort()).toEqual(['linhas', 'trocas'])
    for (const l of campo.linhas) {
      expect(Object.keys(l).sort()).toEqual(['efetiva', 'fila', 'motivo', 'n', 'rtf', 'tomaria'])
      expect(DEGRAUS_EFETIVOS).toContain(l.efetiva)
      expect(MOTIVOS_DA_ROTA).toContain(l.motivo)
    }
    expect(JSON.stringify(campo)).not.toContain('0.73')
  })

  it('valor fora da lista fechada não entra', () => {
    const s = criarSombraDoRoteador()
    s.registrar(fala({ motivo: 'inventado' as never }))
    s.registrar(fala({ efetiva: 'qualquer' as never }))
    s.registrar(fala({ tomaria: 'x' as never }))
    expect(s.drenar()).toBeNull()
  })

  it('os tetos: linhas por lote e contagem por linha', () => {
    const s = criarSombraDoRoteador()
    for (let i = 0; i < MAX_CONTAGEM_DO_ROTEADOR + 50; i++) s.registrar(fala({ trocou: true }))
    for (const motivo of MOTIVOS_DA_ROTA)
      for (const efetiva of DEGRAUS_EFETIVOS)
        for (const tomaria of ['manter', 'modelo-menor', 'nativo', 'nuvem'] as const)
          s.registrar(fala({ motivo, efetiva, tomaria }))
    const campo = s.drenar()!
    expect(campo.linhas.length).toBeLessThanOrEqual(MAX_LINHAS_DO_ROTEADOR)
    expect(campo.linhas.every((l) => l.n <= MAX_CONTAGEM_DO_ROTEADOR)).toBe(true)
    expect(campo.trocas).toBe(MAX_CONTAGEM_DO_ROTEADOR)
  })
})

// ───────────────────────────── os ids de motor (design §4) ─────────────────────────────

describe('catálogos de motor: gateway/index.ts × registroDeMotores.ts', () => {
  const fonte = readFileSync(new URL('../src/gateway/index.ts', import.meta.url), 'utf8')
  const doGateway = new Set(
    [...fonte.matchAll(/^\s+case '([a-z0-9-]+)':/gm)].map((m) => m[1]).filter((id): id is string => !!id),
  )
  const doRegistro = new Set(REGISTRO_DE_MOTORES.map((m) => m.adapterId))

  it('todo adaptador instanciado pelo gateway existe no registro', () => {
    expect([...doGateway].filter((id) => !doRegistro.has(id))).toEqual([])
  })

  /* PENDÊNCIA REGISTRADA (design §4 da change `roteador-adaptativo-em-sombra`), não correção: o registro descreve
     `parakeet-local`, que o gateway instancia por outro caminho (`carregarParakeet`, fora dos `resolve*`). Se esta lista
     mudar, alguém mexeu num dos dois catálogos: revisar. */
  it('divergência conhecida: só o Parakeet está no registro e fora dos `resolve*` do gateway', () => {
    expect([...doRegistro].filter((id) => !doGateway.has(id)).sort()).toEqual(['parakeet-local'])
  })
})
