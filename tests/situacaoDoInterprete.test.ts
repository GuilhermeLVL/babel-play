/**
 * O PREPARO DOS DOIS LADOS NA TELA DO INTÉRPRETE, antes de começar a conversa (relato do dono no
 * celular, 2026-09-30). A tela diz, em duas linhas, o que vai acontecer ao tocar "Começar conversa":
 * como a voz será reconhecida (nos DOIS idiomas) e como a tradução será feita (nos DOIS sentidos) —
 * e quanto baixa, quando baixa.
 */
import { describe, expect, it } from 'vitest'

import { linhasDoPreparo } from '../src/lib/captura/situacaoDoInterprete'

const motor = {
  preferido: 'browser' as const,
  webSpeechSuportado: true,
  noAparelho: null,
  consentiuNavegador: false,
  rapidoPermitido: true,
  perfilId: 'free-web',
  escolha: 'privado' as const,
  podeInstalarPacote: false,
}
const base = { motor, mbStt: 0, mbTradutor: 0, tradutorNativoNosDois: false, modoNuvem: false }
const voz = (e: Parameters<typeof linhasDoPreparo>[0]) => linhasDoPreparo(e).find((l) => l.id === 'voz')!
const traducao = (e: Parameters<typeof linhasDoPreparo>[0]) => linhasDoPreparo(e).find((l) => l.id === 'traducao')!

describe('linhasDoPreparo: a voz', () => {
  it('o navegador reconhece os dois idiomas no aparelho: pronto, e nada sai', () => {
    expect(voz({ ...base, motor: { ...motor, noAparelho: 'available' } })).toMatchObject({
      estado: 'pronto',
      detalhe: 'No aparelho · nada sai do celular',
    })
  })

  it('o Rápido escolhido, sem o pacote no aparelho: pelo navegador', () => {
    expect(voz({ ...base, motor: { ...motor, escolha: 'rapido' } })).toMatchObject({
      estado: 'pronto',
      detalhe: 'Pelo navegador · modo Rápido',
    })
  })

  it('o Privado: o modelo do app, com o tamanho que falta', () => {
    expect(voz({ ...base, mbStt: 80.4 })).toMatchObject({
      estado: 'baixa',
      detalhe: 'Modelo do app · 80 MB a baixar',
    })
  })

  it('o modelo do app já no aparelho: pronto', () => {
    expect(voz(base)).toMatchObject({ estado: 'pronto', detalhe: 'Modelo do app · já no aparelho' })
  })

  it('o pacote de voz do navegador a baixar (e o Privado como escolha): baixa ao começar', () => {
    expect(voz({ ...base, motor: { ...motor, noAparelho: 'downloadable', podeInstalarPacote: true } })).toMatchObject({
      estado: 'baixa',
      detalhe: 'Pacote de voz do navegador · baixa ao começar',
    })
  })

  it('nunca respondeu "Rápido ou Privado?": a pessoa escolhe ao começar', () => {
    expect(voz({ ...base, motor: { ...motor, escolha: null } })).toMatchObject({
      estado: 'escolhe',
      detalhe: 'Você escolhe ao começar: Rápido ou Privado.',
    })
  })
})

describe('linhasDoPreparo: a tradução nos dois sentidos', () => {
  it('o navegador traduz os dois sentidos no aparelho: pronto', () => {
    expect(traducao({ ...base, tradutorNativoNosDois: true })).toMatchObject({
      estado: 'pronto',
      detalhe: 'Pelo navegador · no aparelho',
    })
  })

  it('o modelo do app dos dois sentidos, com o tamanho somado que falta', () => {
    expect(traducao({ ...base, mbTradutor: 226 })).toMatchObject({
      estado: 'baixa',
      detalhe: 'Modelo do app · 226 MB a baixar',
    })
  })

  it('já no aparelho: pronto', () => {
    expect(traducao(base)).toMatchObject({ estado: 'pronto', detalhe: 'Modelo do app · já no aparelho' })
  })

  it('modo nuvem: nada baixa', () => {
    expect(traducao({ ...base, modoNuvem: true, mbTradutor: 226 })).toMatchObject({
      estado: 'pronto',
      detalhe: 'Pela nuvem',
    })
  })
})

describe('linhasDoPreparo: o conjunto', () => {
  it('são duas linhas, a voz primeiro', () => {
    expect(linhasDoPreparo(base).map((l) => l.id)).toEqual(['voz', 'traducao'])
  })
})
