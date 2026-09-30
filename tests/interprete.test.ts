/**
 * A MÁQUINA DE ESTADOS DO MODO INTÉRPRETE (E2 da Fase E) — pura, sem tela e sem microfone.
 *
 * O ciclo de uma fala: parado → ouvindo(lado) → traduzindo → falando → parado. A tela (E3) manda os
 * EVENTOS (tocar num lado, o fim da fala, a tradução, o fim da voz, Repetir, Parar, trocar os lados,
 * sair) e executa os EFEITOS que a máquina devolve (abrir e fechar o microfone no idioma certo, pôr a
 * tradução na fila de fala, interromper a voz). O que se prova, caso a caso:
 *   - a direção vem do LADO (e dos lados trocados);
 *   - o microfone fecha no fim da fala (o guarda de eco cobre a voz que vem depois);
 *   - BARGE-IN: tocar enquanto a voz fala corta a voz e abre o microfone de quem tocou;
 *   - tocar o outro lado enquanto um ouve troca de lado (o microfone reabre no outro idioma);
 *   - tradução que chega depois de alguém tocar não é lida (fica só na tela).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  criarInterprete,
  direcaoAtual,
  direcaoDoLado,
  ESTADO_INICIAL,
  type EstadoDoInterprete,
  type EventoDoInterprete,
  transicao,
  trocaDoMicrofone,
} from '../src/lib/captura/interprete'

const IDIOMAS = { meu: 'pt-BR', outro: 'en-US' }

function rodar(eventos: EventoDoInterprete[], inicial: EstadoDoInterprete = ESTADO_INICIAL) {
  let estado = inicial
  const efeitos: unknown[] = []
  for (const e of eventos) {
    const r = transicao(estado, e, IDIOMAS)
    estado = r.estado
    efeitos.push(...r.efeitos)
  }
  return { estado, efeitos }
}

describe('direcaoDoLado', () => {
  it('meu lado fala o meu idioma e traduz para o do outro; o outro, o contrário', () => {
    expect(direcaoDoLado('meu', IDIOMAS)).toEqual({ lado: 'meu', fala: 'pt-BR', de: 'pt', para: 'en' })
    expect(direcaoDoLado('outro', IDIOMAS)).toEqual({ lado: 'outro', fala: 'en-US', de: 'en', para: 'pt' })
  })

  it('com os lados trocados, os idiomas mudam de metade', () => {
    expect(direcaoDoLado('meu', IDIOMAS, true)).toEqual({ lado: 'meu', fala: 'en-US', de: 'en', para: 'pt' })
    expect(direcaoDoLado('outro', IDIOMAS, true)).toEqual({ lado: 'outro', fala: 'pt-BR', de: 'pt', para: 'en' })
  })

  it('idioma só com a base vira BCP-47 para o reconhecedor', () => {
    expect(direcaoDoLado('outro', { meu: 'pt', outro: 'es' }).fala).toBe('es-ES')
  })
})

describe('o ciclo de uma fala', () => {
  it('tocar abre o microfone no idioma do lado; o fim da fala o fecha; a tradução vai à fila', () => {
    const tocar = transicao(ESTADO_INICIAL, { tipo: 'tocar', lado: 'outro' }, IDIOMAS)
    expect(tocar.estado).toMatchObject({ fase: 'ouvindo', lado: 'outro' })
    expect(tocar.efeitos).toEqual([
      { tipo: 'abrirMicrofone', direcao: { lado: 'outro', fala: 'en-US', de: 'en', para: 'pt' } },
    ])

    const fim = transicao(tocar.estado, { tipo: 'fimDaFala', segId: 'mic-1' }, IDIOMAS)
    expect(fim.estado).toMatchObject({ fase: 'traduzindo', lado: 'outro', pendentes: ['mic-1'] })
    expect(fim.efeitos).toEqual([{ tipo: 'fecharMicrofone' }])

    const trad = transicao(fim.estado, { tipo: 'traduziu', segId: 'mic-1' }, IDIOMAS)
    expect(trad.estado).toMatchObject({ fase: 'falando', lado: 'outro', pendentes: [] })
    expect(trad.efeitos).toEqual([{ tipo: 'falar', segId: 'mic-1' }])

    const voz = transicao(trad.estado, { tipo: 'fimDaVoz' }, IDIOMAS)
    expect(voz.estado).toMatchObject({ fase: 'parado', lado: 'outro' })
    expect(voz.efeitos).toEqual([])
  })

  it('tocar de novo no mesmo lado enquanto ouve: para de ouvir; o final que chegar ainda é traduzido e lido', () => {
    const { estado, efeitos } = rodar([
      { tipo: 'tocar', lado: 'meu' },
      { tipo: 'tocar', lado: 'meu' },
    ])
    expect(estado.fase).toBe('parado')
    expect(efeitos.at(-1)).toEqual({ tipo: 'fecharMicrofone' })
    const depois = rodar(
      [
        { tipo: 'fimDaFala', segId: 's1' },
        { tipo: 'traduziu', segId: 's1' },
      ],
      estado,
    )
    expect(depois.estado.fase).toBe('falando')
    expect(depois.efeitos).toEqual([{ tipo: 'falar', segId: 's1' }])
  })

  it('sem tradução para ler (mesmo idioma, falhou): volta a parado sem falar', () => {
    const { estado, efeitos } = rodar([
      { tipo: 'tocar', lado: 'meu' },
      { tipo: 'fimDaFala', segId: 's1' },
      { tipo: 'semTraducao', segId: 's1' },
    ])
    expect(estado.fase).toBe('parado')
    expect(efeitos).not.toContainEqual(expect.objectContaining({ tipo: 'falar' }))
  })

  it('duas falas no mesmo turno: as duas são lidas, na ordem', () => {
    const { estado, efeitos } = rodar([
      { tipo: 'tocar', lado: 'meu' },
      { tipo: 'fimDaFala', segId: 's1' },
      { tipo: 'fimDaFala', segId: 's2' },
      { tipo: 'traduziu', segId: 's1' },
      { tipo: 'fimDaVoz' },
      { tipo: 'traduziu', segId: 's2' },
    ])
    expect(efeitos.filter((e) => (e as { tipo: string }).tipo === 'falar')).toEqual([
      { tipo: 'falar', segId: 's1' },
      { tipo: 'falar', segId: 's2' },
    ])
    expect(estado.fase).toBe('falando')
  })
})

describe('barge-in e troca de lado', () => {
  it('tocar enquanto a voz fala corta a voz e abre o microfone de quem tocou', () => {
    const { estado, efeitos } = rodar([
      { tipo: 'tocar', lado: 'outro' },
      { tipo: 'fimDaFala', segId: 's1' },
      { tipo: 'traduziu', segId: 's1' },
      { tipo: 'tocar', lado: 'meu' },
    ])
    expect(estado).toMatchObject({ fase: 'ouvindo', lado: 'meu', pendentes: [] })
    expect(efeitos.slice(-2)).toEqual([
      { tipo: 'interromperVoz' },
      { tipo: 'abrirMicrofone', direcao: { lado: 'meu', fala: 'pt-BR', de: 'pt', para: 'en' } },
    ])
  })

  it('tocar o outro lado enquanto um ouve troca de lado: o microfone reabre no outro idioma', () => {
    const { estado, efeitos } = rodar([
      { tipo: 'tocar', lado: 'meu' },
      { tipo: 'tocar', lado: 'outro' },
    ])
    expect(estado).toMatchObject({ fase: 'ouvindo', lado: 'outro' })
    expect(efeitos.at(-1)).toEqual({
      tipo: 'abrirMicrofone',
      direcao: { lado: 'outro', fala: 'en-US', de: 'en', para: 'pt' },
    })
  })

  it('tradução que chega depois de alguém tocar não é lida (fica só na tela)', () => {
    const { estado, efeitos } = rodar([
      { tipo: 'tocar', lado: 'outro' },
      { tipo: 'fimDaFala', segId: 's1' },
      { tipo: 'tocar', lado: 'meu' },
      { tipo: 'traduziu', segId: 's1' },
    ])
    expect(estado).toMatchObject({ fase: 'ouvindo', lado: 'meu' })
    expect(efeitos).not.toContainEqual({ tipo: 'falar', segId: 's1' })
  })

  it('o fim da voz não tira de "ouvindo" (a voz do turno anterior pode avisar tarde)', () => {
    const { estado } = rodar([{ tipo: 'tocar', lado: 'meu' }, { tipo: 'fimDaVoz' }])
    expect(estado.fase).toBe('ouvindo')
  })
})

describe('Repetir, Parar voz, trocar os lados e sair', () => {
  const falando = rodar([
    { tipo: 'tocar', lado: 'outro' },
    { tipo: 'fimDaFala', segId: 's1' },
    { tipo: 'traduziu', segId: 's1' },
  ]).estado

  it('Repetir lê o último de novo', () => {
    const r = transicao(falando, { tipo: 'repetir' }, IDIOMAS)
    expect(r.estado.fase).toBe('falando')
    expect(r.efeitos).toEqual([{ tipo: 'repetirVoz' }])
    const parado = transicao({ ...ESTADO_INICIAL, lado: 'outro' }, { tipo: 'repetir' }, IDIOMAS)
    expect(parado.estado.fase).toBe('falando')
    expect(parado.efeitos).toEqual([{ tipo: 'repetirVoz' }])
  })

  it('Repetir enquanto alguém fala ao microfone não faz nada (a voz seria eco)', () => {
    const ouvindo = transicao(ESTADO_INICIAL, { tipo: 'tocar', lado: 'meu' }, IDIOMAS).estado
    expect(transicao(ouvindo, { tipo: 'repetir' }, IDIOMAS)).toEqual({ estado: ouvindo, efeitos: [] })
  })

  it('Parar voz corta a voz, esquece o que ia ser lido e volta a parado', () => {
    const traduzindo = rodar([
      { tipo: 'tocar', lado: 'outro' },
      { tipo: 'fimDaFala', segId: 's1' },
    ]).estado
    const r = transicao(traduzindo, { tipo: 'pararVoz' }, IDIOMAS)
    expect(r.estado).toMatchObject({ fase: 'parado', pendentes: [] })
    expect(r.efeitos).toEqual([{ tipo: 'pararVoz' }])
    expect(transicao(r.estado, { tipo: 'traduziu', segId: 's1' }, IDIOMAS).efeitos).toEqual([])
  })

  it('trocar os lados para tudo e troca os idiomas de metade', () => {
    const r = transicao(falando, { tipo: 'trocarLados' }, IDIOMAS)
    expect(r.estado).toMatchObject({ fase: 'parado', trocados: true, pendentes: [] })
    expect(r.efeitos).toEqual([{ tipo: 'fecharMicrofone' }, { tipo: 'pararVoz' }])
    const tocar = transicao(r.estado, { tipo: 'tocar', lado: 'meu' }, IDIOMAS)
    expect(tocar.efeitos).toEqual([
      { tipo: 'abrirMicrofone', direcao: { lado: 'meu', fala: 'en-US', de: 'en', para: 'pt' } },
    ])
  })

  it('sair fecha o microfone e para a voz, de qualquer fase', () => {
    for (const e of [
      ESTADO_INICIAL,
      falando,
      transicao(ESTADO_INICIAL, { tipo: 'tocar', lado: 'meu' }, IDIOMAS).estado,
    ]) {
      const r = transicao(e, { tipo: 'sair' }, IDIOMAS)
      expect(r.estado).toMatchObject({ fase: 'parado', pendentes: [] })
      expect(r.efeitos).toEqual([{ tipo: 'fecharMicrofone' }, { tipo: 'pararVoz' }])
    }
  })
})

describe('direcaoAtual', () => {
  it('a direção do microfone é a do lado ativo (ou do último que falou); sem ninguém, null', () => {
    expect(direcaoAtual(ESTADO_INICIAL, IDIOMAS)).toBeNull()
    const ouvindo = transicao(ESTADO_INICIAL, { tipo: 'tocar', lado: 'outro' }, IDIOMAS).estado
    expect(direcaoAtual(ouvindo, IDIOMAS)).toMatchObject({ lado: 'outro', de: 'en' })
    const parado = transicao(ouvindo, { tipo: 'tocar', lado: 'outro' }, IDIOMAS).estado
    expect(direcaoAtual(parado, IDIOMAS)).toMatchObject({ lado: 'outro', de: 'en' })
  })
})

describe('trocaDoMicrofone', () => {
  it('a Web Speech abre num idioma só e precisa religar; o Whisper só troca a dica da próxima fala', () => {
    expect(trocaDoMicrofone('web-speech')).toBe('religar')
    expect(trocaDoMicrofone('whisper')).toBe('so-a-dica')
  })
})

describe('criarInterprete', () => {
  it('muda o estado ANTES de executar os efeitos (o microfone lê a direção nova)', () => {
    const vistos: Array<string | null> = []
    const m = criarInterprete({
      idiomas: () => IDIOMAS,
      executar: () => vistos.push(m.direcao()?.lado ?? null),
    })
    m.enviar({ tipo: 'tocar', lado: 'outro' })
    expect(vistos).toEqual(['outro'])
    expect(m.estado().fase).toBe('ouvindo')
  })

  it('avisa só quando o estado muda', () => {
    const aoMudar = vi.fn()
    const m = criarInterprete({ idiomas: () => IDIOMAS, executar: () => {}, aoMudar })
    m.enviar({ tipo: 'fimDaVoz' })
    expect(aoMudar).not.toHaveBeenCalled()
    m.enviar({ tipo: 'tocar', lado: 'meu' })
    expect(aoMudar).toHaveBeenCalledTimes(1)
  })
})
