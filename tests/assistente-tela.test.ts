/**
 * AS REGRAS DA TELA DO ASSISTENTE AO VIVO (Fase C2, `src/core/assistente/telaDoAssistente.ts`) e a AGENDA das chamadas
 * automáticas (`src/lib/assistente/agendaDoAssistente.ts`): o portão (flag, plano, recusa, consentimento), a faixa
 * mínima, o orçamento (só linha final, ≥ 4 palavras, termo só com sigla, correção só da própria fala com opt-in), as
 * marcas sem sobreposição, a glosa única do PiP de vídeo e a espera/uma-por-linha/nada-pausado da agenda.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { assistenteDiaDoPlano } from '../src/components/views/captura/assistente/useAssistenteAoVivo'
import {
  AJUSTES_PADRAO,
  type AjustesDoAssistente,
  assistenteNoLayout,
  type ContextoDoAssistente,
  glosaParaOVideo,
  marcasDaLinha,
  normalizarAjustes,
  planejarChamadas,
  posicaoNaLinha,
  recursosDoAssistente,
  temChamada,
  TETO_DA_GLOSA_NO_VIDEO,
} from '../src/core/assistente/telaDoAssistente'
import { criarAgenda, ESPERA_DO_ASSISTENTE_MS } from '../src/lib/assistente/agendaDoAssistente'

const PAGO: ContextoDoAssistente = {
  flagLigada: true,
  assistenteDiaDoPlano: 200,
  recusadoNaSessao: false,
  consentiuNuvem: true,
}
const tudo = (aj: Partial<AjustesDoAssistente> = {}, ctx: Partial<ContextoDoAssistente> = {}) =>
  recursosDoAssistente({ ...AJUSTES_PADRAO, correcao: true, ...aj }, { ...PAGO, ...ctx })

describe('o portão: flag, plano, recusa do servidor e consentimento', () => {
  it('pago com a flag: os cinco recursos', () => {
    expect(tudo()).toEqual({
      nuvem: true,
      niveis: true,
      expressoes: true,
      termos: true,
      comoRespondo: true,
      correcao: true,
      algum: true,
    })
  })

  it('flag desligada: só as palavras acima do nível (locais); nada de nuvem', () => {
    const r = tudo({}, { flagLigada: false })
    expect(r).toMatchObject({ nuvem: false, expressoes: false, termos: false, comoRespondo: false, correcao: false })
    expect(r.niveis).toBe(true)
    expect(r.algum).toBe(true)
  })

  it('Grátis (assistenteDia 0): só as palavras acima do nível', () => {
    const r = tudo({}, { assistenteDiaDoPlano: 0 })
    expect(r).toMatchObject({ nuvem: false, niveis: true, expressoes: false, comoRespondo: false, correcao: false })
  })

  it('self-host (sem teto, null): tudo', () => {
    expect(tudo({}, { assistenteDiaDoPlano: null }).nuvem).toBe(true)
  })

  it('o servidor recusou nesta sessão (sem_plano/fora): a nuvem some, mesmo com o cache dizendo que pode', () => {
    expect(tudo({}, { recusadoNaSessao: true })).toMatchObject({ nuvem: false, comoRespondo: false, expressoes: false })
  })

  it('sem o consentimento de nuvem: nada AUTOMÁTICO sai; o "Como respondo?" fica (pede o sim na folha)', () => {
    expect(tudo({}, { consentiuNuvem: false })).toMatchObject({
      nuvem: true,
      expressoes: false,
      termos: false,
      correcao: false,
      comoRespondo: true,
    })
  })

  it('os ajustes desligam cada recurso; a correção nasce desligada (opt-in)', () => {
    expect(AJUSTES_PADRAO.correcao).toBe(false)
    expect(recursosDoAssistente(AJUSTES_PADRAO, PAGO).correcao).toBe(false)
    expect(tudo({ expressoes: false, termos: false, niveis: false })).toMatchObject({
      expressoes: false,
      termos: false,
      niveis: false,
      comoRespondo: true,
    })
    expect(tudo({ niveis: false }, { flagLigada: false }).algum).toBe(false)
  })

  it('o teto do plano: Grátis e sem conta 0, pagos 200, self-host sem teto', () => {
    expect(assistenteDiaDoPlano('free')).toBe(0)
    expect(assistenteDiaDoPlano('anonimo')).toBe(0)
    expect(assistenteDiaDoPlano('plus')).toBe(200)
    expect(assistenteDiaDoPlano('premium')).toBe(200)
    expect(assistenteDiaDoPlano('selfhost')).toBeNull()
    expect(assistenteDiaDoPlano('inventado')).toBe(0)
  })

  it('normaliza o que vem do disco', () => {
    expect(normalizarAjustes(null)).toEqual(AJUSTES_PADRAO)
    expect(normalizarAjustes({ nivel: 'Z9', correcao: 'sim', niveis: false })).toEqual({
      ...AJUSTES_PADRAO,
      niveis: false,
    })
    expect(normalizarAjustes({ nivel: 'C1' }).nivel).toBe('C1')
  })
})

describe('a faixa (jogo) fica mínima', () => {
  it('na faixa: só marcas sutis, sem "Como respondo?" e sem correção', () => {
    expect(assistenteNoLayout('faixa')).toEqual({ marcasSutis: true, comoRespondo: false, correcao: false })
  })
  it('legenda, conversa e estudo: o botão e a correção', () => {
    for (const l of ['legenda', 'conversa', 'estudo'] as const)
      expect(assistenteNoLayout(l)).toEqual({ marcasSutis: false, comoRespondo: true, correcao: true })
  })
})

describe('o orçamento: o que cada linha merece', () => {
  const r = tudo()
  const fala = (original: string, extra: Partial<Parameters<typeof planejarChamadas>[0]> = {}) =>
    planejarChamadas({ id: '1', original, lado: 'eles', lang: 'en', ...extra }, r, 'pt-BR')

  it('parcial, vazia ou no idioma da pessoa: nada', () => {
    expect(temChamada(fala('Break a leg out there tonight', { parcial: true }))).toBe(false)
    expect(temChamada(fala('   '))).toBe(false)
    expect(temChamada(fala('Quebre a perna lá hoje à noite', { lang: 'pt' }))).toBe(false)
  })

  it('expressões só com pelo menos 4 palavras', () => {
    expect(fala('Break a leg!').expressoes).toBe(false)
    expect(fala('Break a leg out there!').expressoes).toBe(true)
  })

  it('termos só quando a detecção local acha sigla', () => {
    expect(fala('We should check the numbers today').termos).toEqual([])
    expect(fala('The KPI for Q3 looks good').termos).toEqual(['KPI', 'Q3'])
  })

  it('a própria fala com a correção ligada: SÓ a correção (uma chamada, não três)', () => {
    expect(fala('I has went to the store yesterday', { lado: 'voce' })).toEqual({
      expressoes: false,
      termos: [],
      correcao: true,
    })
    /* Sem o opt-in, a linha do microfone é como as outras (no "assistir" só com o microfone, é a TV). */
    const semCorrecao = planejarChamadas(
      { id: '1', original: 'I has went to the store yesterday', lado: 'voce', lang: 'en' },
      tudo({ correcao: false }),
      'pt',
    )
    expect(semCorrecao).toEqual({ expressoes: true, termos: [], correcao: false })
  })

  it('a fala do outro lado nunca pede correção', () => {
    expect(fala('I has went to the store yesterday').correcao).toBe(false)
  })

  it('com os recursos de nuvem desligados (Grátis), nenhuma chamada', () => {
    const gratis = tudo({}, { assistenteDiaDoPlano: 0 })
    const p = planejarChamadas(
      { id: '1', original: 'The KPI for Q3 looks good', lado: 'voce', lang: 'en' },
      gratis,
      'pt',
    )
    expect(temChamada(p)).toBe(false)
  })
})

describe('as marcas na linha', () => {
  const linha = 'Break a leg, the KPI review is tomorrow afternoon.'

  it('acha o trecho inteiro, sem diferenciar maiúsculas e sem pegar pedaço de palavra', () => {
    expect(posicaoNaLinha(linha, 'break a leg')).toEqual({ inicio: 0, fim: 11 })
    expect(posicaoNaLinha('the cat is a category', 'cat')).toEqual({ inicio: 4, fim: 7 })
    expect(posicaoNaLinha(linha, 'nada disso')).toBeNull()
  })

  it('sem sobreposição: expressão vence termo, que vence nível; em ordem', () => {
    const m = marcasDaLinha(linha, {
      expressoes: [{ trecho: 'break a leg', sentido: 'boa sorte' }],
      termos: [{ termo: 'KPI', explicacao: 'indicador de desempenho' }],
      niveis: [
        { palavra: 'leg', inicio: 8, fim: 11, nivel: 'B2', escala: 'cefr' },
        { palavra: 'review', inicio: 21, fim: 27, nivel: 'B2', escala: 'cefr' },
      ],
    })
    expect(m.map((x) => [x.tipo, x.texto])).toEqual([
      ['expressao', 'Break a leg'],
      ['termo', 'KPI'],
      ['nivel', 'review'],
    ])
    expect(m[0].sentido).toBe('boa sorte')
  })

  it('trecho que a nuvem devolveu e não está na linha é descartado', () => {
    expect(marcasDaLinha(linha, { expressoes: [{ trecho: 'piece of cake', sentido: 'moleza' }] })).toEqual([])
  })
})

describe('a glosa do PiP de vídeo: uma linha curta, ou nada', () => {
  it('a expressão primeiro; sem ela, o termo; o nível não entra', () => {
    const m = marcasDaLinha('Break a leg at the KPI review.', {
      expressoes: [{ trecho: 'Break a leg', sentido: 'boa sorte' }],
      termos: [{ termo: 'KPI', explicacao: 'indicador' }],
    })
    expect(glosaParaOVideo(m)).toBe('Break a leg: boa sorte')
    expect(glosaParaOVideo(m.filter((x) => x.tipo === 'termo'))).toBe('KPI: indicador')
    expect(
      glosaParaOVideo([{ inicio: 0, fim: 3, tipo: 'nivel', texto: 'leg', nivel: 'B2', escala: 'cefr' }]),
    ).toBeNull()
  })
  it('longa demais: cortada com reticências, legível', () => {
    const g = glosaParaOVideo([
      { inicio: 0, fim: 3, tipo: 'termo', texto: 'API', sentido: 'uma explicação '.repeat(20) },
    ])!
    expect(g.length).toBeLessThanOrEqual(TETO_DA_GLOSA_NO_VIDEO)
    expect(g.endsWith('…')).toBe(true)
  })
})

describe('a agenda: espera, uma por linha, nada pausado', () => {
  afterEach(() => vi.useRealTimers())
  const f = (id: string) => ({ id })

  it('só chama depois da espera, uma vez por linha', () => {
    vi.useFakeTimers()
    const executar = vi.fn()
    const a = criarAgenda({ executar })
    a.oferecer(f('1'))
    vi.advanceTimersByTime(ESPERA_DO_ASSISTENTE_MS - 1)
    expect(executar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(executar).toHaveBeenCalledTimes(1)
    a.oferecer(f('1'))
    vi.advanceTimersByTime(ESPERA_DO_ASSISTENTE_MS * 3)
    expect(executar).toHaveBeenCalledTimes(1)
    expect(a.pedida('1')).toBe(true)
  })

  it('a linha atropelada pela seguinte antes da espera não é pedida', () => {
    vi.useFakeTimers()
    const executar = vi.fn()
    const a = criarAgenda({ executar })
    a.oferecer(f('1'))
    vi.advanceTimersByTime(300)
    a.oferecer(f('2'))
    vi.advanceTimersByTime(ESPERA_DO_ASSISTENTE_MS)
    expect(executar.mock.calls.map((c) => c[0].id)).toEqual(['2'])
  })

  it('pausada (ou escondida, ou fechada): nada sai; ao continuar, a linha que esperava é pedida', () => {
    vi.useFakeTimers()
    const executar = vi.fn()
    const a = criarAgenda({ executar, pausado: true })
    a.oferecer(f('1'))
    vi.advanceTimersByTime(ESPERA_DO_ASSISTENTE_MS * 5)
    expect(executar).not.toHaveBeenCalled()
    a.pausar(false)
    vi.advanceTimersByTime(ESPERA_DO_ASSISTENTE_MS)
    expect(executar).toHaveBeenCalledTimes(1)
    /* Pausar no meio da espera cancela. */
    a.oferecer(f('2'))
    vi.advanceTimersByTime(200)
    a.pausar(true)
    vi.advanceTimersByTime(ESPERA_DO_ASSISTENTE_MS * 5)
    expect(executar).toHaveBeenCalledTimes(1)
  })

  it('destruída: nada mais sai', () => {
    vi.useFakeTimers()
    const executar = vi.fn()
    const a = criarAgenda({ executar })
    a.oferecer(f('1'))
    a.destruir()
    vi.advanceTimersByTime(ESPERA_DO_ASSISTENTE_MS * 2)
    a.oferecer(f('2'))
    vi.advanceTimersByTime(ESPERA_DO_ASSISTENTE_MS * 2)
    expect(executar).not.toHaveBeenCalled()
  })
})
