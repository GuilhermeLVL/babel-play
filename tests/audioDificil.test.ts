/**
 * ÁUDIO DIFÍCIL (Fase B, item 6; flag `stt_aparelho_primeiro`): o sinal objetivo de cada fala local e a
 * HISTERESE que decide quando o "aparelho primeiro" passa a mandar as falas à nuvem e quando volta.
 *
 * O que se garante: uma fala ruim isolada não sobe (só a porta por trecho a leva); três difíceis nas
 * últimas seis sobem; na nuvem há um mínimo de falas antes de voltar; quem volta e sobe de novo logo
 * fica o dobro do tempo na nuvem (com teto); a fala local enquanto o modo é nuvem (a nuvem falhou) e
 * a fala da nuvem enquanto o modo é aparelho (a porta subiu um trecho) não mudam o modo.
 */
import { describe, expect, it } from 'vitest'

import {
  avaliarFalaLocal,
  type EstadoDoAudioDificil,
  estadoInicialDoAudioDificil,
  FLAG_STT_APARELHO_PRIMEIRO,
  LIMIARES_DO_AUDIO_DIFICIL,
  registrarFalaLocal,
  registrarFalaNaNuvem,
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

  it('fala local enquanto o modo é nuvem (a nuvem falhou e o aparelho atendeu) não conta para nada', () => {
    const subiu = rodar('ddd')
    expect(rodar('ffffffffffff', subiu)).toEqual(subiu)
    expect(rodar('dddd', subiu)).toEqual(subiu)
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

  it('é pura: não altera o estado recebido', () => {
    const e = rodar('dd')
    const copia = structuredClone(e)
    registrarFalaLocal(e, true)
    registrarFalaNaNuvem(e)
    expect(e).toEqual(copia)
  })
})
