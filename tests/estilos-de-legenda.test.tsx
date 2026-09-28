// @vitest-environment jsdom
/**
 * ESTILOS DE LEGENDA (recompensas v2, onda 4, Task 4.2).
 *
 * O estilo veste a legenda ao vivo (caixa, contorno, entrada da palavra, destaque da palavra já
 * aprendida) e nada mais: tamanho, cor de alto contraste e fonte são acessibilidade, continuam
 * livres e ganham do estilo quando os dois brigam. Tudo em CSS — nenhuma espera a mais entre a
 * fala e a legenda.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({
  fetchSettings: vi.fn(async () => null),
  patchUiSettings: vi.fn(async () => {}),
}))

import ChatTranscript from '../src/components/ChatTranscript'
import LegendasFlutuantes from '../src/components/views/captura/LegendasFlutuantes'
import {
  classesDoEstilo,
  equiparEstiloDeLegenda,
  ESTILO_PADRAO,
  ESTILOS_DE_LEGENDA,
  lerEstiloDeLegenda,
  resolverEstiloDeLegenda,
} from '../src/lib/estilosDeLegenda'
import { CATALOGO_DA_LOJA, marcarPosse, soPorSeeds } from '../src/lib/loja'
import { DEFAULT_TRANSCRIPT_SETTINGS } from '../src/lib/transcriptUtils'

const css = readFileSync(path.join(process.cwd(), 'src/styles/legendas.css'), 'utf8')
const tudoLivre = { possui: () => true, movimentoReduzido: false, altoContraste: false }

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('o catálogo dos estilos', () => {
  it('são 8, com a clássica de graça e os outros só com Seeds (comum ou raro)', () => {
    expect(ESTILOS_DE_LEGENDA).toHaveLength(8)
    expect(ESTILO_PADRAO).toBe('classica')
    expect(DEFAULT_TRANSCRIPT_SETTINGS.estilo).toBe('classica')
    const itens = CATALOGO_DA_LOJA.filter((i) => i.tipo === 'legenda')
    expect(itens.map((i) => i.alvo).sort()).toEqual(ESTILOS_DE_LEGENDA.map((e) => e.id).sort())
    for (const i of itens) {
      if (i.alvo === 'classica') {
        expect(i.nivel).toBe(1)
        expect(i.precoSeeds).toBeUndefined()
        continue
      }
      /* Onda 5: o candidato à temporada virou exclusivo da Temporada 1 — sem preço agora, com o preço
         de volta (`precoSeedsDepois`) um ano depois do fim. A faixa vale para os dois. */
      if (i.origemTemporada) expect(i.precoSeeds, i.id).toBeUndefined()
      else expect(soPorSeeds(i), i.id).toBe(true)
      const preco = i.precoSeeds ?? i.origemTemporada!.precoSeedsDepois
      expect(['comum', 'raro'], i.id).toContain(i.raridade)
      const [min, max] = i.raridade === 'comum' ? [350, 450] : [1000, 1300]
      expect(preco, i.id).toBeGreaterThanOrEqual(min)
      expect(preco, i.id).toBeLessThanOrEqual(max)
    }
  })
})

describe('resolver o estilo', () => {
  it('estilo não possuído (ou desconhecido, ou ausente) cai na clássica', () => {
    const naoTem = { ...tudoLivre, possui: () => false }
    expect(resolverEstiloDeLegenda('vidro', naoTem).id).toBe('classica')
    expect(resolverEstiloDeLegenda('estilo-que-saiu', tudoLivre).id).toBe('classica')
    expect(resolverEstiloDeLegenda(undefined, tudoLivre).id).toBe('classica')
  })

  it('a posse vem da régua da Loja: comprado abre, sem compra não abre', () => {
    expect(resolverEstiloDeLegenda('vidro').id).toBe('classica')
    marcarPosse(CATALOGO_DA_LOJA.find((i) => i.tipo === 'legenda' && i.alvo === 'vidro')!.id)
    expect(resolverEstiloDeLegenda('vidro').id).toBe('vidro')
  })

  it('com movimento reduzido a palavra não entra animada', () => {
    for (const e of ESTILOS_DE_LEGENDA) {
      expect(resolverEstiloDeLegenda(e.id, { ...tudoLivre, movimentoReduzido: true }).entrada).toBe('nenhuma')
    }
    expect(ESTILOS_DE_LEGENDA.some((e) => e.entrada !== 'nenhuma')).toBe(true)
  })

  it('alto contraste ganha do estilo: sem caixa, sem contorno e sem trocar a cor da palavra', () => {
    for (const e of ESTILOS_DE_LEGENDA) {
      const r = resolverEstiloDeLegenda(e.id, { ...tudoLivre, altoContraste: true })
      expect(r.caixa).toBe('nenhuma')
      expect(r.contorno).toBe(0)
      expect(r.destaqueAprendida).not.toBe('cor')
    }
  })

  it('tamanho e fonte ficam fora do estilo: o CSS dos estilos nunca declara letra nem tamanho', () => {
    expect(css).not.toMatch(/font-size|font-family|font:\s|line-height/)
  })

  it('as classes descrevem as quatro escolhas', () => {
    const vidro = ESTILOS_DE_LEGENDA.find((e) => e.id === 'vidro')!
    const c = classesDoEstilo(vidro)
    expect(c).toContain(`leg-caixa-${vidro.caixa}`)
    expect(c).toContain(`leg-contorno-${vidro.contorno}`)
    expect(c).toContain(`leg-entrada-${vidro.entrada}`)
    expect(c).toContain(`leg-destaque-${vidro.destaqueAprendida}`)
  })

  it('equipar grava junto dos ajustes da legenda e avisa a captura aberta', () => {
    const ouvinte = vi.fn()
    window.addEventListener('transcriptSettingsChanged', ouvinte)
    equiparEstiloDeLegenda('cinema')
    expect(lerEstiloDeLegenda()).toBe('cinema')
    // Sem ajustes salvos antes, grava os padrões junto: a captura não pode abrir com metade dos campos.
    expect(JSON.parse(localStorage.getItem('transcriptSettings')!)).toEqual({ ...DEFAULT_TRANSCRIPT_SETTINGS, estilo: 'cinema' })
    expect(ouvinte).toHaveBeenCalled()
    window.removeEventListener('transcriptSettingsChanged', ouvinte)
  })
})

describe('a palavra já aprendida é marcada na legenda', () => {
  it('legenda flutuante: data-aprendida só nas palavras aprendidas', () => {
    const { container } = render(
      <LegendasFlutuantes
        falas={[{ id: '1', quem: 'Outros', original: 'The roadmap is ready.', traducao: '', lado: 'eles' }]}
        emJanela={false}
        aoFechar={vi.fn()}
        aprendidas={new Set(['roadmap'])}
      />,
    )
    const marcadas = [...container.querySelectorAll('[data-aprendida]')].map((e) => e.textContent)
    expect(marcadas).toEqual(['roadmap'])
    expect(container.querySelector('.leg-o')!.textContent).toBe('The roadmap is ready.')
  })

  it('legenda flutuante veste o estilo equipado', () => {
    marcarPosse(CATALOGO_DA_LOJA.find((i) => i.tipo === 'legenda' && i.alvo === 'cinema')!.id)
    equiparEstiloDeLegenda('cinema')
    const { container } = render(<LegendasFlutuantes falas={[]} emJanela={false} aoFechar={vi.fn()} />)
    expect(container.querySelector('.leg-flut')!.className).toContain('leg-caixa-solida')
  })

  it('transcrição da captura: data-aprendida na palavra do caderno já aprendida, e o estilo no contêiner', () => {
    marcarPosse(CATALOGO_DA_LOJA.find((i) => i.tipo === 'legenda' && i.alvo === 'fita')!.id)
    const { container } = render(
      <ChatTranscript
        segments={[
          {
            id: 's1',
            speakerId: 'a',
            source: 'system',
            originalText: 'We ship the roadmap today',
            translatedText: '',
            words: [
              { word: 'roadmap', translation: 'roteiro' },
              { word: 'ship', translation: 'entregar' },
            ],
          } as never,
        ]}
        speakers={[{ id: 'a', name: 'Outros', color: '#333' } as never]}
        scenario="media"
        tsSettings={{ ...DEFAULT_TRANSCRIPT_SETTINGS, estilo: 'fita' }}
        ageProfile={'pro' as never}
        sourceLang="pt"
        targetLang="en"
        isRecording={false}
        selectedWord={null}
        addedWords={[]}
        aprendidas={new Set(['roadmap'])}
        onExamineWord={vi.fn()}
        onSpeakWord={vi.fn()}
      />,
    )
    const marcadas = [...container.querySelectorAll('[data-aprendida]')].map((e) => e.textContent)
    expect(marcadas).toEqual(['roadmap'])
    expect(container.firstElementChild!.className).toContain('leg-caixa-fita')
  })
})
