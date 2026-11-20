// @vitest-environment jsdom
/**
 * AS MENSAGENS E O 👎 NA TELA (Fase B do plano de qualidade da IA paga, itens 1 e 4).
 *
 *   · Nuance da frase: cota do mês e uso justo têm frase própria (nunca "faz parte da Tradução Nuance" a quem já
 *     tem a Nuance, nunca oferta); nuvem ocupada e falha passageira oferecem "Tentar de novo", que refaz o pedido;
 *     cota e uso justo não oferecem (tentar de novo não adianta);
 *   · o 👎 "Não ajudou" aparece na Nuance, nas outras formas e na explicação; um toque manda só listas fechadas
 *     (função, nota, motivo, modelo, nível) e troca o botão por um agradecimento;
 *   · Polir a sessão diz quando a cota volta e que o polido continua guardado.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import NaoAjudou from '../src/components/NaoAjudou'
import PolirSessao from '../src/components/views/analise/PolirSessao'
import ExplicacaoDaFrase from '../src/components/views/captura/estudo/ExplicacaoDaFrase'
import NuanceDaFrase from '../src/components/views/captura/nuance/NuanceDaFrase'

const nuance = vi.hoisted(() => ({
  traduzirComNuance: vi.fn(),
  pedirAlternativas: vi.fn(),
  polirBloco: vi.fn(),
  fixarNoGlossario: vi.fn(),
}))
vi.mock('../src/data/apiDaNuance', () => nuance)
const estudo = vi.hoisted(() => ({ explicarFrase: vi.fn() }))
vi.mock('../src/data/apiDoEstudo', () => estudo)
const fb = vi.hoisted(() => ({ enviarFeedback: vi.fn() }))
vi.mock('../src/data/apiDoFeedback', () => fb)
const nuvem = vi.hoisted(() => ({ consentiu: true, autorizar: vi.fn() }))
vi.mock('../src/lib/consentimentoDeNuvem', () => ({ useConsentimentoDeNuvem: () => nuvem }))
vi.mock('../src/lib/flags', () => ({ useFlag: () => true }))
const protecao = vi.hoisted(() => ({ protegido: false }))
vi.mock('../src/lib/protecaoDoMenor', () => ({ perfilProtegido: () => protecao.protegido }))

afterEach(cleanup)
beforeEach(() => {
  for (const f of [...Object.values(nuance), estudo.explicarFrase, fb.enviarFeedback]) f.mockReset()
  fb.enviarFeedback.mockResolvedValue(true)
  nuvem.consentiu = true
  protecao.protegido = false
})

const fala = { texto: 'see you later', traducao: 'até mais', lang: 'en' }
const montarNuance = () => render(<NuanceDaFrase fala={fala} destino="pt-BR" disponivel aoEscolher={vi.fn()} />)
const falha = (motivo: string, status = 402) => ({ ok: false, motivo, status })

describe('Nuance da frase: a recusa certa', () => {
  it('cota do mês: diz quando volta e o que segue funcionando — sem "faz parte da Nuance" e sem tentar de novo', async () => {
    nuance.traduzirComNuance.mockResolvedValue(falha('cota_do_mes'))
    const { container } = montarNuance()
    expect(await screen.findByText(/IA de nuvem deste mês; ela volta no dia/)).toBeTruthy()
    expect(container.textContent).toMatch(/A legenda e as palavras seguem funcionando/)
    expect(container.textContent).not.toMatch(/faz parte da Tradução Nuance/)
    expect(container.textContent).not.toMatch(/Premium|R\$|plano/i)
    expect(screen.queryByRole('button', { name: /Tentar de novo/ })).toBeNull()
  })

  it('uso justo do dia: "volta amanhã", sem nuvem ocupada e sem tentar de novo', async () => {
    nuance.traduzirComNuance.mockResolvedValue(falha('uso_justo', 429))
    const { container } = montarNuance()
    expect(await screen.findByText(/limite de hoje\. Volta amanhã/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/ocupada/)
    expect(screen.queryByRole('button', { name: /Tentar de novo/ })).toBeNull()
  })

  it('nuvem ocupada: "Tentar de novo" refaz o pedido da abertura e mostra a Nuance', async () => {
    nuance.traduzirComNuance
      .mockResolvedValueOnce(falha('nuvem_ocupada', 429))
      .mockResolvedValueOnce({ ok: true, valor: { texto: 'até logo', modelo: 'm/x' } })
    montarNuance()
    fireEvent.click(await screen.findByRole('button', { name: /Tentar de novo/ }))
    expect(await screen.findByRole('button', { name: /até logo/ })).toBeTruthy()
    expect(nuance.traduzirComNuance).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: /Tentar de novo/ })).toBeNull()
  })

  it('falha passageira (indisponível) também oferece tentar de novo', async () => {
    nuance.traduzirComNuance.mockResolvedValue(falha('indisponivel', 502))
    montarNuance()
    expect(await screen.findByRole('button', { name: /Tentar de novo/ })).toBeTruthy()
  })

  it('402 de capacidade (cache velho de plano): continua "faz parte da Tradução Nuance"', async () => {
    nuance.traduzirComNuance.mockResolvedValue(falha('exige_nuance'))
    montarNuance()
    expect(await screen.findByText(/faz parte da Tradução Nuance/)).toBeTruthy()
  })
})

describe('o 👎 "Não ajudou"', () => {
  it('na Nuance da frase: manda função, nota, motivo, modelo e nível — e agradece', async () => {
    nuance.traduzirComNuance.mockResolvedValue({
      ok: true,
      valor: { texto: 'até logo', modelo: 'openai/gpt-oss-120b' },
    })
    montarNuance()
    fireEvent.click(await screen.findByRole('button', { name: /Não ajudou/ }))
    await waitFor(() =>
      expect(fb.enviarFeedback).toHaveBeenCalledWith({
        funcao: 'nuance',
        nota: 'down',
        motivo: 'nao_ajudou',
        modelo: 'openai/gpt-oss-120b',
        nivel: 'nuance',
      }),
    )
    expect(screen.queryByRole('button', { name: /Não ajudou/ })).toBeNull()
    expect(screen.getByText(/Obrigado pelo aviso/)).toBeTruthy()
  })

  it('nas outras formas: a função é alternativas', async () => {
    nuance.traduzirComNuance.mockResolvedValue(falha('nuvem_ocupada', 429))
    nuance.pedirAlternativas.mockResolvedValue({ ok: true, valor: { opcoes: ['Até logo'], nota: '', modelo: 'm/y' } })
    montarNuance()
    fireEvent.click(await screen.findByRole('button', { name: /Outras formas/ }))
    await screen.findByTestId('outras-formas')
    fireEvent.click(screen.getByRole('button', { name: /Não ajudou/ }))
    await waitFor(() =>
      expect(fb.enviarFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ funcao: 'alternativas', modelo: 'm/y' }),
      ),
    )
  })

  it('na explicação, inclusive no perfil protegido (só listas fechadas, sem oferta)', async () => {
    protecao.protegido = true
    estudo.explicarFrase.mockResolvedValue({
      ok: true,
      valor: {
        explicacao: { porQue: 'Porque sim.', gramatica: '', registro: '', girias: [] },
        origem: 'plano',
        restanteNaAmostra: null,
        modelo: 'm/z',
      },
    })
    render(<ExplicacaoDaFrase fala={{ ...fala, lang: 'en-US' }} destino="pt-BR" />)
    fireEvent.click(await screen.findByRole('button', { name: /Explicar esta frase/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Não ajudou/ }))
    await waitFor(() =>
      expect(fb.enviarFeedback).toHaveBeenCalledWith({
        funcao: 'explicacao',
        nota: 'down',
        motivo: 'nao_ajudou',
        modelo: 'm/z',
      }),
    )
  })

  it('o componente sozinho: um toque só, e o aviso já estava montado', async () => {
    render(<NaoAjudou funcao="resumo" />)
    const aviso = screen.getByTestId('aviso-do-feedback')
    expect(aviso.getAttribute('aria-live')).toBe('polite')
    expect(aviso.textContent).toBe('')
    fireEvent.click(screen.getByRole('button', { name: /Não ajudou/ }))
    expect(aviso.textContent).toMatch(/Obrigado pelo aviso/)
    await waitFor(() => expect(fb.enviarFeedback).toHaveBeenCalledTimes(1))
    expect(fb.enviarFeedback.mock.calls[0][0]).toEqual({ funcao: 'resumo', nota: 'down', motivo: 'nao_ajudou' })
  })
})

describe('Polir a sessão: a cota', () => {
  const falas = Array.from({ length: 5 }, (_, i) => ({
    id: `u${i}`,
    idx: i,
    sourceText: `line ${i}`,
    translatedText: `linha ${i}`,
  }))
  const montar = () =>
    render(
      <PolirSessao
        sessionId="s1"
        utterances={falas}
        disponivel
        versao="original"
        aoTrocarVersao={vi.fn()}
        aoPolir={vi.fn()}
      />,
    )

  it('cota do mês: quando volta e que o polido fica guardado, sem "faz parte da Nuance"', async () => {
    nuance.polirBloco.mockResolvedValue(falha('cota_do_mes'))
    montar()
    fireEvent.click(screen.getByRole('button', { name: /Polir a tradução da sessão/ }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/volta no dia .*já foi polido continua guardado/),
    )
    expect(screen.getByRole('status').textContent).not.toMatch(/faz parte/)
  })

  it('uso justo: amanhã continua de onde parou', async () => {
    nuance.polirBloco.mockResolvedValue(falha('uso_justo', 429))
    montar()
    fireEvent.click(screen.getByRole('button', { name: /Polir a tradução da sessão/ }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/Amanhã o polimento continua de onde parou/),
    )
  })
})
