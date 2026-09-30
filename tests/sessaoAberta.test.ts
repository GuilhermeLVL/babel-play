/**
 * A SESSÃO QUE A ANÁLISE ABRE (`/sessao/<id>`). O defeito: abrir o endereço direto numa aba nova,
 * com a lista de gravações ainda a caminho (no modo com login ela chega depois), derrubava a tela —
 * a Análise recebia `recording` vazio e lia `.id` dele. E, com a lista já carregada, um id que não
 * está nela (sessão apagada, de outra conta) abria OUTRA sessão, a mais recente, sem avisar.
 */
import { describe, expect, it } from 'vitest'

import { sessaoAberta } from '../src/lib/sessaoAberta'

const A = { id: 'a', title: 'A' }
const B = { id: 'b', title: 'B' }

describe('sessaoAberta', () => {
  it('lista a caminho: carregando (nunca a Análise sem gravação)', () => {
    expect(sessaoAberta({ carregadas: false, gravacoes: [], id: 'b' })).toEqual({ tipo: 'carregando' })
  })

  it('o id está na lista: é ele', () => {
    expect(sessaoAberta({ carregadas: true, gravacoes: [A, B], id: 'b' })).toEqual({ tipo: 'sessao', gravacao: B })
  })

  it('já está na lista antes de a carga terminar (acabou de ser salva): abre', () => {
    expect(sessaoAberta({ carregadas: false, gravacoes: [B], id: 'b' })).toEqual({ tipo: 'sessao', gravacao: B })
  })

  it('o id não está na lista carregada: não encontrada (e não outra sessão)', () => {
    expect(sessaoAberta({ carregadas: true, gravacoes: [A], id: 'b' })).toEqual({ tipo: 'nao-encontrada' })
  })

  it('sem id: a mais recente, como antes', () => {
    expect(sessaoAberta({ carregadas: true, gravacoes: [A, B], id: null })).toEqual({ tipo: 'sessao', gravacao: A })
  })

  it('sem id e biblioteca vazia: vazia', () => {
    expect(sessaoAberta({ carregadas: true, gravacoes: [], id: null })).toEqual({ tipo: 'vazia' })
  })
})
