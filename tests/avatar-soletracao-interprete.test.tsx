// @vitest-environment jsdom
/**
 * A SOLETRAÇÃO NO INTÉRPRETE, sem WebGL: a política de QUANDO soletra (nomes próprios, teto, fila atrasada, alfabeto pelo
 * idioma da outra pessoa), a decisão por fala, os preferências novas, os DOIS AVISOS FIXOS que sempre aparecem e voltam se
 * alguém os tirar, e o painel que esconde/desabilita a opção quando o modelo não tem dedos (com o motivo em texto).
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import AvisosDaSoletracao, { avisosFixos } from '../src/components/avatar/AvisosDaSoletracao'
import SoletracaoNaConversa from '../src/components/avatar/SoletracaoNaConversa'
import PainelDosAvatares from '../src/components/views/captura/interprete/PainelDosAvatares'
import { politicaDosAvatares, PREFERENCIAS_PADRAO, validarPreferencias } from '../src/core/avatar/interprete'
import {
  alfabetoDaConversa,
  decidirSoletracao,
  type EntradaDaDecisao,
  FILA_MAXIMA_PARA_SOLETRAR,
  nomesProprios,
  soletracaoDisponivel,
  suporteComModelo,
  TETO_DA_FALA_MS,
  VELOCIDADE_DO_RITMO,
} from '../src/core/avatar/sinais/soletracaoDoInterprete'
import { modeloDaColecao } from '../src/data/avatar/colecao'

afterEach(cleanup)

const AVISO_1 = 'Soletração do alfabeto manual: não é tradução para Libras'
const AVISO_2 = 'Poses de DEMONSTRAÇÃO: ainda NÃO revisadas por pessoas surdas'

const entrada = (p: Partial<EntradaDaDecisao> = {}): EntradaDaDecisao => ({
  ligada: true,
  item: { id: 'f1', texto: 'fale com Conceição amanhã' },
  naFila: 0,
  alfabeto: 'libras',
  ritmo: 'normal',
  espelhar: false,
  ...p,
})

describe('o alfabeto pelo idioma da outra pessoa', () => {
  it('automático: português é Libras, inglês é ASL (com ou sem região)', () => {
    expect(alfabetoDaConversa('auto', 'pt')).toBe('libras')
    expect(alfabetoDaConversa('auto', 'pt-BR')).toBe('libras')
    expect(alfabetoDaConversa('auto', 'en-US')).toBe('asl')
    expect(alfabetoDaConversa('auto', 'EN')).toBe('asl')
  })
  it('outro idioma ou vazio: sem alfabeto; a escolha manual sempre vence', () => {
    expect(alfabetoDaConversa('auto', 'es')).toBeNull()
    expect(alfabetoDaConversa('auto', '')).toBeNull()
    expect(alfabetoDaConversa('auto', null)).toBeNull()
    expect(alfabetoDaConversa('asl', 'pt')).toBe('asl')
    expect(alfabetoDaConversa('libras', 'en')).toBe('libras')
  })
})

describe('quais palavras entram', () => {
  it('só nomes próprios (inicial maiúscula fora do começo) com ao menos 2 letras', () => {
    expect(nomesProprios('fale com Conceição amanhã', 'libras')).toEqual(['Conceição'])
    expect(nomesProprios('Hoje falei com Maria e com João', 'libras')).toEqual(['Maria', 'João'])
  })
  it('a primeira palavra, as de uma letra e os números não contam', () => {
    expect(nomesProprios('Maria chegou', 'libras')).toEqual([])
    expect(nomesProprios('falei com A e com B', 'libras')).toEqual([])
    expect(nomesProprios('quarto 12', 'libras')).toEqual([])
    expect(nomesProprios('', 'asl')).toEqual([])
  })
})

describe('a decisão por fala', () => {
  it('desligada: nada, mesmo com nomes e fila vazia', () => {
    expect(decidirSoletracao(entrada({ ligada: false }))).toEqual({ tipo: 'desligada' })
  })
  it('ninguém falando, ou toque no texto (manual): nada a soletrar', () => {
    expect(decidirSoletracao(entrada({ item: null }))).toEqual({ tipo: 'nada' })
    expect(decidirSoletracao(entrada({ item: { id: 'm', texto: 'fale com Conceição', manual: true } }))).toEqual({
      tipo: 'nada',
    })
  })
  it('fala sem nome próprio: nada a soletrar', () => {
    expect(decidirSoletracao(entrada({ item: { id: 'f2', texto: 'bom dia a todos' } }))).toEqual({ tipo: 'nada' })
  })
  it('com nome: soletra com o alfabeto, o ritmo, o teto por fala e o espelho pedidos', () => {
    const d = decidirSoletracao(entrada({ ritmo: 'rapida', espelhar: true }))
    expect(d).toEqual({
      tipo: 'soletrar',
      id: 'f1',
      texto: 'fale com Conceição amanhã',
      alfabeto: 'libras',
      modo: 'nomes',
      soNomesProprios: true,
      palavras: ['Conceição'],
      nomes: ['Conceição'],
      velocidade: VELOCIDADE_DO_RITMO.rapida,
      tetoMs: TETO_DA_FALA_MS,
      espelhar: true,
    })
  })
  it('sem alfabeto para o idioma: pulada, com o motivo', () => {
    expect(decidirSoletracao(entrada({ alfabeto: null }))).toEqual({ tipo: 'pulada', motivo: 'sem_alfabeto' })
  })
  it('a fila de voz atrasada passa do teto: soletração PULADA (mostra "pulada"), nunca espera', () => {
    expect(decidirSoletracao(entrada({ naFila: FILA_MAXIMA_PARA_SOLETRAR }))).toMatchObject({ tipo: 'soletrar' })
    expect(decidirSoletracao(entrada({ naFila: FILA_MAXIMA_PARA_SOLETRAR + 1 }))).toEqual({
      tipo: 'pulada',
      motivo: 'fila',
    })
  })
  it('é pura: a mesma entrada dá a mesma saída', () => {
    expect(decidirSoletracao(entrada())).toEqual(decidirSoletracao(entrada()))
  })
  it('o teto por fala é finito e as velocidades vão de mais lenta a mais rápida', () => {
    expect(TETO_DA_FALA_MS).toBeGreaterThan(0)
    expect(TETO_DA_FALA_MS).toBeLessThanOrEqual(10_000)
    expect(VELOCIDADE_DO_RITMO.lenta).toBeLessThan(VELOCIDADE_DO_RITMO.normal)
    expect(VELOCIDADE_DO_RITMO.normal).toBeLessThan(VELOCIDADE_DO_RITMO.rapida)
  })
})

describe('preferências e política', () => {
  it('a soletração nasce DESLIGADA, com alfabeto automático, sem espelho e ritmo normal', () => {
    expect(PREFERENCIAS_PADRAO).toMatchObject({ soletrar: false, alfabeto: 'auto', espelhar: false, ritmo: 'normal' })
  })
  it('valida o que foi guardado: valores futuros ou de tipo errado voltam ao padrão', () => {
    expect(validarPreferencias({ soletrar: true, alfabeto: 'asl', espelhar: true, ritmo: 'lenta' })).toMatchObject({
      soletrar: true,
      alfabeto: 'asl',
      espelhar: true,
      ritmo: 'lenta',
    })
    expect(validarPreferencias({ soletrar: 'sim', alfabeto: 'klingon', espelhar: 1, ritmo: 'turbo' })).toMatchObject({
      soletrar: false,
      alfabeto: 'auto',
      espelhar: false,
      ritmo: 'normal',
    })
  })
  const base = { flag: true, prefs: { ...PREFERENCIAS_PADRAO, soletrar: true }, webgl2: true, tier: 'forte' as const }
  it('só soletra com as DUAS flags, a opção ligada e o avatar-intérprete na tela', () => {
    expect(politicaDosAvatares({ ...base, sinais: true }).soletrar).toBe(true)
    expect(politicaDosAvatares({ ...base }).soletrar).toBe(false) // sem avatar_sinais
    expect(politicaDosAvatares({ ...base, sinais: false }).soletrar).toBe(false)
    expect(politicaDosAvatares({ ...base, flag: false, sinais: true }).soletrar).toBe(false) // sem avatar_3d
    expect(politicaDosAvatares({ ...base, sinais: true, prefs: { ...base.prefs, soletrar: false } }).soletrar).toBe(
      false,
    )
    expect(politicaDosAvatares({ ...base, sinais: true, prefs: { ...base.prefs, quem: 'meu' } }).soletrar).toBe(false) // o intérprete não aparece
    expect(politicaDosAvatares({ ...base, sinais: true, prefs: { ...base.prefs, economia: true } }).soletrar).toBe(
      false,
    )
  })
})

describe('os dois avisos fixos', () => {
  it('são exatamente os dois textos obrigatórios', () => {
    expect(avisosFixos().map((a) => a.texto)).toEqual([AVISO_1, AVISO_2])
  })
  it('aparecem sempre que o componente existe, e voltam se alguém os remover, esconder ou editar', async () => {
    const { container } = render(<AvisosDaSoletracao />)
    const caixa = () => container.querySelector('[data-avisos-fixos]') as HTMLElement
    await waitFor(() => expect(container.querySelectorAll('[data-aviso-fixo]')).toHaveLength(2))
    expect(screen.getByText(AVISO_1)).toBeTruthy()
    expect(screen.getByText(AVISO_2)).toBeTruthy()

    container.querySelectorAll('[data-aviso-fixo]').forEach((e) => e.remove())
    await waitFor(() => expect(container.querySelectorAll('[data-aviso-fixo]')).toHaveLength(2))

    caixa().style.display = 'none'
    await waitFor(() => expect(caixa().style.display).toBe('block'))

    container.querySelector('[data-aviso-fixo="demonstracao"]')!.textContent = 'tudo certo'
    await waitFor(() => expect(screen.getByText(AVISO_2)).toBeTruthy())
  })
  it('na conversa os avisos estão SEMPRE, soletrando ou não, e a palavra atual só enquanto soletra', async () => {
    const { rerender, container } = render(
      <SoletracaoNaConversa soletrando={false} pulada={null} atual={null} compacto={false} anunciar={false} />,
    )
    await waitFor(() => expect(container.querySelectorAll('[data-aviso-fixo]')).toHaveLength(2))
    expect(container.querySelector('[data-palavra-atual]')).toBeNull()
    rerender(
      <SoletracaoNaConversa
        soletrando
        pulada={null}
        atual={{ palavra: 'Conceição', letra: 'C', naoSoletradas: 4 }}
        compacto={false}
        anunciar={false}
      />,
    )
    expect(container.querySelectorAll('[data-aviso-fixo]')).toHaveLength(2)
    expect(container.querySelector('[data-palavra-atual]')?.textContent).toBe('Conceição')
    rerender(<SoletracaoNaConversa soletrando={false} pulada="fila" atual={null} compacto={false} anunciar={false} />)
    expect(container.querySelectorAll('[data-aviso-fixo]')).toHaveLength(2)
    expect(screen.getByTestId('soletracao-pulada').textContent).toBe('Soletração pulada: a voz está atrasada.')
  })
})

describe('o painel: modelo sem dedos esconde/desabilita com o motivo', () => {
  const ligar = (suporte: Parameters<typeof PainelDosAvatares>[0]['suporte'], sinaisLigada = true, soletrar = false) =>
    render(
      <PainelDosAvatares
        prefs={{ ...PREFERENCIAS_PADRAO, soletrar }}
        aoMudar={() => undefined}
        aoFechar={() => undefined}
        sinaisLigada={sinaisLigada}
        suporte={suporte}
        sem3d={false}
      />,
    )

  it('sem a flag avatar_sinais: nenhuma opção de soletração, nenhum aviso; "só mãos" desabilitado', () => {
    ligar({ estado: 'sim' }, false, true)
    expect(screen.queryByTestId('avatar-soletrar')).toBeNull()
    expect(screen.queryByText(AVISO_1)).toBeNull()
    expect((screen.getByTestId('avatar-foco-maos') as HTMLInputElement).disabled).toBe(true)
  })
  it('suportaSinais falso: opção e "só mãos" desabilitadas, com o motivo em texto, e sem avisos', () => {
    ligar({ estado: 'nao', motivo: 'sem_dedos' }, true, true)
    const opcao = screen.getByTestId('avatar-soletrar') as HTMLInputElement
    expect(opcao.disabled).toBe(true)
    expect(opcao.checked).toBe(false) // mesmo com a preferência guardada ligada
    expect(screen.getByTestId('avatar-soletrar-motivo').textContent).toBe('Este avatar não tem dedos articulados.')
    expect(screen.getByTestId('avatar-maos-motivo').textContent).toBe('Este avatar não tem dedos articulados.')
    expect((screen.getByTestId('avatar-foco-maos') as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByText(AVISO_1)).toBeNull()
    expect(screen.queryByTestId('avatar-alfabeto-auto')).toBeNull()
  })
  it('"O que mostrar": o automático é o padrão e está marcado; a escolha explícita é respeitada (defeito 3)', () => {
    const { unmount } = ligar({ estado: 'sim' })
    expect((screen.getByTestId('avatar-foco-auto') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByTestId('avatar-foco-auto').closest('label')?.textContent).toBe('Automático (mãos ao soletrar)')
    unmount()
    render(
      <PainelDosAvatares
        prefs={{ ...PREFERENCIAS_PADRAO, foco: 'rosto' }}
        aoMudar={() => undefined}
        aoFechar={() => undefined}
        sinaisLigada
        suporte={{ estado: 'sim' }}
        sem3d={false}
      />,
    )
    expect((screen.getByTestId('avatar-foco-rosto') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('avatar-foco-auto') as HTMLInputElement).checked).toBe(false)
  })
  it('cada motivo tem o seu texto', () => {
    const textos = {
      sem_braco: 'Este avatar não tem braços articulados.',
      sem_ossos_reconheciveis: 'Os ossos deste avatar não têm nomes reconhecíveis.',
      sem_3d: 'Este aparelho não mostra o avatar em 3D.',
      sem_interprete: 'Escolha "Eu e o intérprete" ou "Só o intérprete" em Quem aparece.',
      maos_minusculas:
        'As mãos deste avatar são pequenas demais para soletrar. Escolha outro avatar em Meu avatar (o intérprete muda).',
    } as const
    for (const [motivo, texto] of Object.entries(textos)) {
      const { unmount } = ligar({ estado: 'nao', motivo: motivo as keyof typeof textos })
      expect(screen.getByTestId('avatar-soletrar-motivo').textContent).toBe(texto)
      unmount()
    }
  })
  it('verificando: desabilitada, com "Verificando o avatar…"', () => {
    ligar({ estado: 'verificando' })
    expect((screen.getByTestId('avatar-soletrar') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByTestId('avatar-soletrar-motivo').textContent).toBe('Verificando o avatar…')
  })
  it('com suporte: a opção aparece habilitada e DESLIGADA; ligada mostra as escolhas e os dois avisos', () => {
    const { unmount } = ligar({ estado: 'sim' })
    const opcao = screen.getByTestId('avatar-soletrar') as HTMLInputElement
    expect(opcao.disabled).toBe(false)
    expect(opcao.checked).toBe(false)
    expect(screen.queryByText(AVISO_1)).toBeNull()
    expect((screen.getByTestId('avatar-foco-maos') as HTMLInputElement).disabled).toBe(false)
    unmount()
    ligar({ estado: 'sim' }, true, true)
    const painel = screen.getByTestId('avatar-soletracao-grupo')
    expect(within(painel).getByTestId('avatar-alfabeto-auto')).toBeTruthy()
    expect(within(painel).getByTestId('avatar-ritmo-normal')).toBeTruthy()
    expect(within(painel).getByTestId('avatar-espelhar')).toBeTruthy()
    expect(within(painel).getByText(AVISO_1)).toBeTruthy()
    expect(within(painel).getByText(AVISO_2)).toBeTruthy()
  })
  it('modelo de mãos minúsculas (Milk): o "sim" vira "não" com o motivo; os outros estados mandam (defeito 5)', () => {
    expect(modeloDaColecao('milk')?.maosMinusculas).toBe(true)
    expect(modeloDaColecao('bullidan')?.maosMinusculas).toBeUndefined()
    expect(suporteComModelo({ estado: 'sim' }, modeloDaColecao('milk') ?? null)).toEqual({
      estado: 'nao',
      motivo: 'maos_minusculas',
    })
    expect(suporteComModelo({ estado: 'sim' }, modeloDaColecao('bullidan') ?? null)).toEqual({ estado: 'sim' })
    expect(suporteComModelo({ estado: 'nao', motivo: 'sem_dedos' }, { maosMinusculas: true })).toEqual({
      estado: 'nao',
      motivo: 'sem_dedos',
    })
    expect(soletracaoDisponivel(suporteComModelo({ estado: 'sim' }, { maosMinusculas: true }))).toBe(false)
  })
  it('a opção só vale com suporte confirmado', () => {
    expect(soletracaoDisponivel({ estado: 'sim' })).toBe(true)
    expect(soletracaoDisponivel({ estado: 'verificando' })).toBe(false)
    expect(soletracaoDisponivel({ estado: 'nao', motivo: 'sem_dedos' })).toBe(false)
  })
})
