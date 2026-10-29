import { describe, expect, it } from 'vitest'

import { atalhoDeSoletrar, convidarParaCriarAvatar } from '../src/core/avatar/descoberta'

describe('o atalho "Soletrar nomes"', () => {
  it('sem a flag avatar_sinais não existe', () => {
    expect(atalhoDeSoletrar({ sinaisLigada: false, soletrar: true, suporte: { estado: 'sim' } })).toEqual({
      tipo: 'oculto',
    })
  })
  it('com suporte, mostra o estado da preferência', () => {
    expect(atalhoDeSoletrar({ sinaisLigada: true, soletrar: false, suporte: { estado: 'sim' } })).toEqual({
      tipo: 'pronto',
      ligado: false,
    })
    expect(atalhoDeSoletrar({ sinaisLigada: true, soletrar: true, suporte: { estado: 'sim' } })).toEqual({
      tipo: 'pronto',
      ligado: true,
    })
  })
  it('enquanto verifica o modelo, espera', () => {
    expect(atalhoDeSoletrar({ sinaisLigada: true, soletrar: true, suporte: { estado: 'verificando' } }).tipo).toBe(
      'verificando',
    )
  })
  it('modelo que não serve (mãos pequenas, sem dedos): explica e oferece outro avatar', () => {
    for (const motivo of ['maos_minusculas', 'sem_dedos', 'sem_braco', 'sem_ossos_reconheciveis'] as const) {
      expect(atalhoDeSoletrar({ sinaisLigada: true, soletrar: true, suporte: { estado: 'nao', motivo } })).toEqual({
        tipo: 'indisponivel',
        motivo,
        saida: 'outro_avatar',
      })
    }
  })
  it('intérprete escondido: oferece mostrá-lo; sem 3D ou sem modelo: só explica', () => {
    expect(
      atalhoDeSoletrar({ sinaisLigada: true, soletrar: false, suporte: { estado: 'nao', motivo: 'sem_interprete' } }),
    ).toMatchObject({ saida: 'mostrar_interprete' })
    expect(
      atalhoDeSoletrar({ sinaisLigada: true, soletrar: false, suporte: { estado: 'nao', motivo: 'sem_3d' } }),
    ).toMatchObject({ saida: 'nenhuma' })
    expect(
      atalhoDeSoletrar({ sinaisLigada: true, soletrar: false, suporte: { estado: 'nao', motivo: 'sem_modelo' } }),
    ).toMatchObject({ saida: 'nenhuma' })
  })
})

describe('o convite "Crie seu avatar"', () => {
  it('só com a flag, sem avatar e sem ter sido dispensado', () => {
    expect(convidarParaCriarAvatar({ flag: true, temAvatar: false, dispensado: false })).toBe(true)
    expect(convidarParaCriarAvatar({ flag: false, temAvatar: false, dispensado: false })).toBe(false)
    expect(convidarParaCriarAvatar({ flag: true, temAvatar: true, dispensado: false })).toBe(false)
    expect(convidarParaCriarAvatar({ flag: true, temAvatar: false, dispensado: true })).toBe(false)
  })
})
