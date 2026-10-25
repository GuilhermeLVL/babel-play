/**
 * ÁUDIO DIFÍCIL (Fase B, item 6; flag `stt_aparelho_primeiro`): o sinal objetivo de cada fala local e a
 * HISTERESE que decide quando o "aparelho primeiro" passa a mandar as falas à nuvem e quando volta.
 *
 * O que se garante: uma fala ruim isolada não sobe (só a porta por trecho a leva); três difíceis nas
 * últimas seis sobem; na nuvem há um mínimo de falas antes de voltar; quem volta e sobe de novo logo
 * fica o dobro do tempo na nuvem (com teto); a nuvem que para de responder (duas falas locais seguidas
 * no modo nuvem, ou a pausa dela) devolve ao aparelho; a fala da nuvem enquanto o modo é aparelho (a
 * porta subiu um trecho) não muda o modo.
 */
import { describe, expect, it } from 'vitest'

import {
  avaliarFalaLocal,
  continuarAudioDificil,
  type EstadoDoAudioDificil,
  estadoInicialDoAudioDificil,
  FLAG_STT_APARELHO_PRIMEIRO,
  LIMIARES_DO_AUDIO_DIFICIL,
  registrarFalaLocal,
  registrarFalaNaNuvem,
  registrarPausaDaNuvem,
} from '../src/core/rota/audioDificil'

const L = LIMIARES_DO_AUDIO_DIFICIL
const BOA = 'a gente combinou de ver o filme amanhã'
const LACO = 'obrigado por assistir obrigado por assistir obrigado por assistir obrigado por assistir'

/** Aplica uma sequência: `d` = fala local difícil, `f` = local fácil, `n` = fala atendida pela nuvem. */
function rodar(seq: string, inicio: EstadoDoAudioDificil = estadoInicialDoAudioDificil()): EstadoDoAudioDificil {
  let e = inicio
  for (const c of seq) {
    if (c === 'n') e = registrarFalaNaNuvem(e)
    else e = registrarFalaLocal(e, c === 'd')
  }
  return e
}

describe('a flag', () => {
  it('tem o nome que a migração semeia', () => {
    expect(FLAG_STT_APARELHO_PRIMEIRO).toBe('stt_aparelho_primeiro')
  })
})

describe('avaliarFalaLocal: o sinal objetivo de uma fala', () => {
  it('fala limpa, confiante e no tempo: não é difícil', () => {
    expect(avaliarFalaLocal({ texto: BOA, confianca: 0.95, fatorDeTempoReal: 0.2 })).toEqual({
      dificil: false,
      motivos: [],
    })
  })

  it('confiança média dos tokens abaixo do limiar: difícil', () => {
    const r = avaliarFalaLocal({ texto: BOA, confianca: L.confiancaMinima - 0.01 })
    expect(r).toEqual({ dificil: true, motivos: ['confianca'] })
  })

  it('confiança no limiar não sobe; sem confiança (motor que não informa) não julga por ela', () => {
    expect(avaliarFalaLocal({ texto: BOA, confianca: L.confiancaMinima }).dificil).toBe(false)
    expect(avaliarFalaLocal({ texto: BOA }).dificil).toBe(false)
  })

  it('fala curta demais não é julgada pela confiança ("Sim.", "Vale.")', () => {
    expect(avaliarFalaLocal({ texto: 'Sim.', confianca: 0.1 }).dificil).toBe(false)
  })

  it('laço de repetição (a porta de compressão do Whisper): difícil', () => {
    expect(avaliarFalaLocal({ texto: LACO, confianca: 0.99 }).motivos).toContain('compressao')
  })

  it('o aparelho não acompanhou a fala (fator de tempo real acima do teto): difícil', () => {
    expect(avaliarFalaLocal({ texto: BOA, confianca: 0.95, fatorDeTempoReal: L.fatorMaximo + 0.1 })).toEqual({
      dificil: true,
      motivos: ['lento'],
    })
  })

  it('texto vazio não é julgado', () => {
    expect(avaliarFalaLocal({ texto: '   ', confianca: 0 })).toEqual({ dificil: false, motivos: [] })
  })
})

describe('histerese', () => {
  it('começa no aparelho', () => {
    expect(estadoInicialDoAudioDificil().modo).toBe('aparelho')
  })

  it('uma fala difícil isolada não sobe, nem duas', () => {
    expect(rodar('d').modo).toBe('aparelho')
    expect(rodar('dfffd').modo).toBe('aparelho')
  })

  it(`${L.dificeisParaSubir} difíceis nas últimas ${L.janela} falas locais sobem à nuvem`, () => {
    expect(rodar('dfdfd').modo).toBe('nuvem')
    expect(rodar('ddd').modo).toBe('nuvem')
  })

  it('uma difícil a cada três (ruído esporádico) nunca sobe', () => {
    expect(rodar('dffdffdffdffdffdff').modo).toBe('aparelho')
  })

  it('a janela esquece: difíceis espalhadas além dela não somam', () => {
    expect(rodar('dffffffdffffffd').modo).toBe('aparelho')
  })

  it(`na nuvem, fica pelo menos ${L.minimoNaNuvem} falas antes de tentar o aparelho de novo`, () => {
    const subiu = rodar('ddd')
    expect(rodar('n'.repeat(L.minimoNaNuvem - 1), subiu).modo).toBe('nuvem')
    const voltou = rodar('n'.repeat(L.minimoNaNuvem), subiu)
    expect(voltou.modo).toBe('aparelho')
    expect(voltou.recentes).toEqual([]) // volta com a janela limpa: precisa de 3 novas para subir
  })

  /* Rodada de correção 1, item 4: a nuvem que para de responder (pausa, 402, 429) devolve ao aparelho.
     Uma fala local isolada no modo nuvem é um soluço; duas seguidas, a nuvem não está respondendo. */
  it('uma fala local no modo nuvem (soluço da nuvem) não muda o modo', () => {
    const subiu = rodar('ddd')
    expect(rodar('f', subiu).modo).toBe('nuvem')
    expect(rodar('fnf', subiu).modo).toBe('nuvem') // a nuvem respondeu no meio: a contagem zera
  })

  it(`${L.locaisParaDescer} falas locais SEGUIDAS no modo nuvem (ela parou de responder): desce ao aparelho`, () => {
    const subiu = rodar('ddd')
    const desceu = rodar('f'.repeat(L.locaisParaDescer), subiu)
    expect(desceu.modo).toBe('aparelho')
    expect(desceu.recentes).toEqual([])
    expect(desceu.desdeADescida).toBe(0) // subir logo de novo conta como reincidência
    expect(rodar('dd'.repeat(L.locaisParaDescer), subiu).modo).toBe('aparelho') // difícil ou não
  })

  it('a pausa da nuvem no modo nuvem desce na hora; no modo aparelho não muda nada', () => {
    const subiu = rodar('ddd')
    const desceu = registrarPausaDaNuvem(subiu)
    expect(desceu.modo).toBe('aparelho')
    expect(desceu.minimoNaNuvem).toBe(subiu.minimoNaNuvem)
    const noAparelho = rodar('df')
    expect(registrarPausaDaNuvem(noAparelho)).toEqual(noAparelho)
  })

  it('fala da nuvem enquanto o modo é aparelho (a porta subiu um trecho) não muda o modo nem a janela', () => {
    const e = rodar('df')
    expect(rodar('nnnn', e)).toEqual(e)
  })

  it('quem volta e sobe de novo logo depois fica o DOBRO na nuvem; com teto', () => {
    const volta = (e: EstadoDoAudioDificil) => rodar('n'.repeat(e.minimoNaNuvem), e)
    let e = rodar('ddd')
    expect(e.minimoNaNuvem).toBe(L.minimoNaNuvem)
    e = rodar('ddd', volta(e)) // reincidiu logo
    expect(e.modo).toBe('nuvem')
    expect(e.minimoNaNuvem).toBe(L.minimoNaNuvem * 2)
    for (let i = 0; i < 10; i++) e = rodar('ddd', volta(e))
    expect(e.minimoNaNuvem).toBe(L.maximoNaNuvem)
  })

  it('quem fica bem no aparelho por mais que a reincidência volta ao mínimo de base na próxima subida', () => {
    let e = rodar('ddd')
    e = rodar('ddd', rodar('n'.repeat(e.minimoNaNuvem), e))
    expect(e.minimoNaNuvem).toBe(L.minimoNaNuvem * 2)
    e = rodar('n'.repeat(e.minimoNaNuvem), e)
    e = rodar('f'.repeat(L.reincidencia + 1), e)
    e = rodar('ddd', e)
    expect(e.modo).toBe('nuvem')
    expect(e.minimoNaNuvem).toBe(L.minimoNaNuvem)
  })

  /* Rodada de correção 1, item 5: trocar de rota no meio da sessão (nova preparação) não apaga a memória
     da histerese — o mínimo dobrado continua, e quem estava na nuvem conta como recém-descido. */
  it('continuar numa nova preparação: volta ao aparelho, guarda o mínimo dobrado e conta como descida', () => {
    let e = rodar('ddd')
    e = rodar('ddd', rodar('n'.repeat(e.minimoNaNuvem), e))
    expect(e.minimoNaNuvem).toBe(L.minimoNaNuvem * 2)
    const c = continuarAudioDificil(e)
    expect(c.modo).toBe('aparelho')
    expect(c.minimoNaNuvem).toBe(L.minimoNaNuvem * 2)
    expect(c.desdeADescida).toBe(0)
    expect(rodar('ddd', c).minimoNaNuvem).toBe(L.minimoNaNuvem * 4) // reincidiu logo
    const parado = rodar('df')
    expect(continuarAudioDificil(parado)).toEqual({ ...estadoInicialDoAudioDificil(), desdeADescida: null })
  })

  it('é pura: não altera o estado recebido', () => {
    const e = rodar('dd')
    const copia = structuredClone(e)
    registrarFalaLocal(e, true)
    registrarFalaNaNuvem(e)
    expect(e).toEqual(copia)
  })
})
