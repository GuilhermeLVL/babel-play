/**
 * SEM NÍVEL ESCOLHIDO, A TRILHA JOGA COM TODOS OS NÍVEIS.
 *
 * A Sala de Escolha diz isso por escrito ("Sem escolher, a trilha joga com todos os níveis de uma
 * vez") e a tela fazia o oposto: `fonte.nivel` vazio caía no baralho triado, que para quem nunca
 * jogou a trilha é VAZIO — nenhuma palavra dela foi promovida a cartão ainda. A pessoa lia
 * "2.784 palavras prontas", confirmava, e a rodada não montava. Escolher um nível "consertava",
 * o que fazia o defeito parecer preferência de uso.
 *
 * Achado F08 de `docs/auditoria/tela-de-jogos-v1.md`.
 */
import { describe, expect,it } from 'vitest'

import type { DadoTrilha } from '../src/core/learning/trilha'
import { niveisEmJogo } from '../src/core/learning/trilha'

const trilha: DadoTrilha = {
  lang: 'en',
  fonte: 'teste',
  versao: '1',
  niveis: {
    A1: [['about', 'cerca de']],
    A2: [['above', 'acima']],
    B1: [['abolish', 'abolir']],
    // B2, C1 e C2 ausentes de propósito: nem todo idioma terá as seis listas.
  },
}

describe('niveisEmJogo', () => {
  it('sem escolha, devolve todos os níveis que EXISTEM no arquivo', () => {
    expect(niveisEmJogo(trilha)).toEqual(['A1', 'A2', 'B1'])
  })

  it('com escolha, devolve só o nível escolhido', () => {
    expect(niveisEmJogo(trilha, 'A2')).toEqual(['A2'])
  })

  it('nível pedido que não existe no arquivo devolve vazio, não o arquivo inteiro', () => {
    // Silencioso seria pior: cair para "todos" faria um C2 inexistente virar a trilha completa.
    expect(niveisEmJogo(trilha, 'C2')).toEqual([])
  })

  it('nunca inventa nível ausente', () => {
    const so = niveisEmJogo(trilha)
    expect(so).not.toContain('B2')
    expect(so).not.toContain('C1')
  })

  it('trilha vazia devolve vazio em vez de quebrar', () => {
    expect(niveisEmJogo({ lang: 'es', fonte: 'x', versao: '1', niveis: {} })).toEqual([])
  })

  it('a ordem é a do CEFR, não a de inserção do objeto', () => {
    const foraDeOrdem: DadoTrilha = {
      lang: 'en', fonte: 'teste', versao: '1',
      niveis: { B1: [['x', 'x']], A1: [['y', 'y']] },
    }
    expect(niveisEmJogo(foraDeOrdem)).toEqual(['A1', 'B1'])
  })
})
