// @vitest-environment jsdom
/**
 * AS FERRAMENTAS DE IA À VISTA NO LEITOR (spec `docs/specs/2026-10-28-leitor-ia-visivel.md`): o painel lista as
 * quatro com o motivo; a barra do trecho mostra Explicar e Perguntar mesmo indisponíveis; o parceiro cobre sucesso,
 * recusas e "tentar de novo"; a tradução do capítulo tem progresso, cancelamento e o aviso de mesmo idioma.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import BarraDaSelecao from '../src/components/views/leitor/BarraDaSelecao'
import PainelDaTraducao from '../src/components/views/leitor/PainelDaTraducao'
import PainelDeFerramentas from '../src/components/views/leitor/PainelDeFerramentas'
import PainelDoParceiro from '../src/components/views/leitor/PainelDoParceiro'
import {
  type EstadoDaFerramenta,
  estadoDasFerramentas,
  type FatosDasFerramentas,
} from '../src/core/leitura/ferramentasDeIa'
import type { ResultadoDoParceiro } from '../src/data/rotas/parceiroDeLeitura'

let consentiu = true
vi.mock('../src/lib/consentimentoDeNuvem', () => ({
  useConsentimentoDeNuvem: () => ({
    consentiu,
    autorizar: async () => {
      consentiu = true
      return true
    },
  }),
}))
vi.mock('../src/components/views/captura/estudo/ExplicacaoDaFrase', () => ({
  default: () => <div data-testid="explicacao-mock" />,
}))

afterEach(() => {
  cleanup()
  consentiu = true
})

const PAGO: FatosDasFerramentas = {
  iaDeEstudoLigada: true,
  parceiroLigado: true,
  temConta: true,
  planoGratis: false,
  explicacoesMes: 300,
  parceiroDia: 40,
  nuvemRestritaPelaIdade: false,
  online: true,
}
const com = (p: Partial<FatosDasFerramentas>) => estadoDasFerramentas({ ...PAGO, ...p })

function lista(estados: Record<string, EstadoDaFerramenta>, extra: { protegido?: boolean; planos?: () => void } = {}) {
  return render(
    <PainelDeFerramentas
      aba="lista"
      aoMudarAba={() => {}}
      estados={estados as ReturnType<typeof com>}
      temSelecao={false}
      protegido={extra.protegido ?? false}
      aoConhecerPlanos={extra.planos}
      parceiro={null}
      capitulo={null}
    />,
  )
}
const item = (f: string) => document.querySelector(`[data-ferramenta="${f}"]`) as HTMLElement

describe('PainelDeFerramentas', () => {
  it('lista as quatro ferramentas, sempre, mesmo sem nada liberado', () => {
    lista(com({ iaDeEstudoLigada: false, parceiroLigado: false }))
    expect(document.querySelectorAll('[data-ferramenta]')).toHaveLength(4)
    expect(item('traduzir-capitulo').textContent).toContain('Abrir')
    expect(item('traduzir-trecho').textContent).toContain('Pronto para usar')
    expect(item('explicar').textContent).toContain('Em breve')
    expect(item('parceiro').textContent).toContain('Em breve')
  })

  const motivos: Array<[string, Partial<FatosDasFerramentas>, string]> = [
    ['entrar', { temConta: false }, 'Entre na sua conta'],
    ['plano', { parceiroDia: 0 }, 'Faz parte dos planos pagos'],
    ['idade', { nuvemRestritaPelaIdade: true }, 'responsável'],
    ['cota', { cotaEsgotada: { parceiro: 'dia' } }, 'volta amanhã'],
    ['sem-conexao', { online: false }, 'internet'],
  ]
  it.each(motivos)('mostra o motivo %s em português', (motivo, fatos, trecho) => {
    lista(com(fatos))
    const li = item('parceiro')
    expect(li.querySelector('.leitor-ia-motivo')?.getAttribute('data-motivo')).toBe(motivo)
    expect(li.textContent).toContain(trecho)
  })

  it('disponível: o parceiro e o capítulo têm botão "Abrir"; traduzir e explicar só dizem como usar', () => {
    lista(com({}))
    expect(item('parceiro').querySelector('button')).not.toBeNull()
    expect(item('traduzir-capitulo').querySelector('button')).not.toBeNull()
    expect(item('explicar').querySelector('button')).toBeNull()
    expect(item('traduzir-trecho').querySelector('button')).toBeNull()
  })

  it('o link dos planos existe só para adulto; no perfil protegido nunca', () => {
    const planos = vi.fn()
    const { unmount } = lista(com({ parceiroDia: 0 }), { planos })
    fireEvent.click(screen.getByText('Conhecer os planos'))
    expect(planos).toHaveBeenCalled()
    unmount()
    lista(com({ parceiroDia: 0 }), { protegido: true, planos })
    expect(screen.queryByText('Conhecer os planos')).toBeNull()
    expect(item('parceiro').textContent).toContain('Faz parte dos planos pagos')
  })

  it('nenhuma frase tem preço, contagem regressiva ou pressão', () => {
    lista(com({ parceiroDia: 0, temConta: true }))
    expect(document.body.textContent).not.toMatch(/R\$|últim[ao]s? (vagas|chance)|só hoje|corra|não perca/i)
  })
})

describe('BarraDaSelecao: Explicar e Perguntar não somem', () => {
  const trecho = { texto: 'a quiet evening', frase: 'It was a quiet evening.', idioma: 'en' }
  const barra = (e: Record<string, EstadoDaFerramenta>, aoPerguntar = vi.fn()) =>
    render(
      <BarraDaSelecao
        trecho={trecho}
        destino="pt-BR"
        traduzir={async () => 'uma noite tranquila'}
        aoGrifar={() => {}}
        aoAnotar={() => {}}
        aoFechar={() => {}}
        explicar={e.explicar}
        parceiro={e.parceiro}
        aoPerguntar={aoPerguntar}
      />,
    )

  it('indisponível: o botão fica, com aria-disabled, título e a razão ao tocar', () => {
    barra(com({ iaDeEstudoLigada: false, parceiroLigado: false }))
    const explicar = screen.getByTestId('selecao-explicar')
    expect(explicar.getAttribute('aria-disabled')).toBe('true')
    expect(explicar.getAttribute('title')).toContain('Em breve')
    expect(screen.getByTestId('selecao-motivo').textContent).toBe('')
    fireEvent.click(explicar)
    expect(screen.getByTestId('selecao-motivo').textContent).toContain('Em breve')
    expect(explicar.getAttribute('aria-describedby')).toBe(screen.getByTestId('selecao-motivo').id)
    expect(screen.queryByTestId('explicacao-mock')).toBeNull() // não abriu a explicação
  })

  it('indisponível: dá para chegar nele pelo teclado (não é `disabled`)', () => {
    barra(com({ temConta: false }))
    const perguntar = screen.getByTestId('selecao-parceiro')
    expect(perguntar.hasAttribute('disabled')).toBe(false)
    perguntar.focus()
    expect(document.activeElement).toBe(perguntar)
  })

  it('disponível: Explicar abre a explicação e Perguntar chama o parceiro', () => {
    const perguntar = vi.fn()
    barra(com({}), perguntar)
    fireEvent.click(screen.getByTestId('selecao-parceiro'))
    expect(perguntar).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('selecao-explicar'))
    expect(screen.getByTestId('explicacao-mock')).toBeTruthy()
  })

  it('perfil de menor com a nuvem restrita: os dois ficam indisponíveis com a razão da idade', () => {
    barra(com({ nuvemRestritaPelaIdade: true }))
    fireEvent.click(screen.getByTestId('selecao-explicar'))
    expect(screen.getByTestId('selecao-motivo').textContent).toContain('responsável')
    fireEvent.click(screen.getByTestId('selecao-parceiro'))
    expect(screen.getByTestId('selecao-motivo').textContent).toContain('responsável')
  })
})

describe('PainelDoParceiro', () => {
  const OK: ResultadoDoParceiro = {
    ok: true,
    resposta: {
      texto: 'Ele quer dizer que a noite estava calma.',
      pontos: ['calma', 'noite'],
      citacoes: [{ trechoId: '0', exato: 'a quiet evening' }],
      naoEstaNoTrecho: false,
    },
    origem: 'modelo',
    restanteHoje: 39,
    textoConferido: true,
    aviso: 'Gerado por IA a partir do texto e da ficha do livro.',
  }
  const secao = () => ({ paragrafos: ['Before.', 'It was a quiet evening.', 'After.'], primeiroVisivel: 0 })
  const montar = (pedir: (p: never) => Promise<ResultadoDoParceiro>, extra: Record<string, unknown> = {}) =>
    render(
      <PainelDoParceiro
        livro={{ origem: 'catalogo', id: 'se-pride' }}
        tituloDoCapitulo="Chapter 1"
        selecao="a quiet evening"
        fraseDaSelecao="It was a quiet evening."
        idiomaDoLivro="en"
        idiomaDaPessoa="pt"
        lerSecao={secao}
        pedir={pedir as never}
        {...extra}
      />,
    )

  it('sucesso: monta o pedido (modo, livro, seleção, trechos em volta) e mostra a resposta com a citação', async () => {
    const pedir = vi.fn(async (_p?: unknown) => OK)
    montar(pedir)
    fireEvent.click(screen.getByTestId('parceiro-pedir'))
    await screen.findByTestId('parceiro-resposta')
    const p = pedir.mock.calls[0][0] as Record<string, unknown>
    expect(p).toMatchObject({
      modo: 'explicar',
      livro: { origem: 'catalogo', id: 'se-pride' },
      selecao: 'a quiet evening',
      idiomaDoLivro: 'en',
      idiomaDaPessoa: 'pt',
    })
    expect((p.trechos as Array<{ texto: string }>).map((x) => x.texto)).toContain('It was a quiet evening.')
    expect(p.pergunta).toBeUndefined()
    const r = screen.getByTestId('parceiro-resposta').textContent ?? ''
    expect(r).toContain('a noite estava calma')
    expect(r).toContain('“a quiet evening”')
    expect(r).toContain('Restam 39 hoje')
    expect(r).toContain('Gerado por IA')
  })

  it('o modo pergunta pede o texto e manda a pergunta', async () => {
    const pedir = vi.fn(async (_p?: unknown) => OK)
    montar(pedir)
    fireEvent.click(document.querySelector('[data-modo="pergunta"]')!)
    const botao = screen.getByTestId('parceiro-pedir') as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Sua pergunta'), { target: { value: 'Quem fala aqui?' } })
    expect(botao.disabled).toBe(false)
    fireEvent.click(botao)
    await screen.findByTestId('parceiro-resposta')
    expect(pedir.mock.calls[0][0]).toMatchObject({ modo: 'pergunta', pergunta: 'Quem fala aqui?' })
  })

  it('sem seleção: os modos que pedem trecho ficam desligados e o do capítulo segue (sem `selecao` no pedido)', async () => {
    const pedir = vi.fn(async (_p?: unknown) => OK)
    montar(pedir, { selecao: '' })
    expect((screen.getByTestId('parceiro-pedir') as HTMLButtonElement).disabled).toBe(false) // abre em "observar"
    fireEvent.click(document.querySelector('[data-modo="explicar"]')!)
    expect((screen.getByTestId('parceiro-pedir') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Selecione um trecho no livro para usar este modo.')).toBeTruthy()
    fireEvent.click(document.querySelector('[data-modo="observar"]')!)
    fireEvent.click(screen.getByTestId('parceiro-pedir'))
    await screen.findByTestId('parceiro-resposta')
    expect((pedir.mock.calls[0][0] as Record<string, unknown>).selecao).toBeUndefined()
  })

  const recusas: Array<[string, ResultadoDoParceiro, string, boolean]> = [
    ['sem_plano', { ok: false, motivo: 'sem_plano', status: 402 }, 'planos pagos', false],
    ['uso_justo', { ok: false, motivo: 'uso_justo', status: 429 }, 'volta amanhã', false],
    ['cota_do_mes', { ok: false, motivo: 'cota_do_mes', status: 402 }, 'neste mês', false],
    ['nuvem_ocupada', { ok: false, motivo: 'nuvem_ocupada', status: 429 }, 'nuvem está ocupada', true],
    ['indisponivel', { ok: false, motivo: 'indisponivel', status: 502 }, 'Não deu para responder', true],
  ]
  it.each(recusas)('recusa %s: frase amigável e "Tentar de novo" só quando adianta', async (_m, r, frase, retenta) => {
    const pedir = vi.fn(async (_p?: unknown) => r)
    montar(pedir)
    fireEvent.click(screen.getByTestId('parceiro-pedir'))
    await waitFor(() => expect(screen.getByTestId('parceiro-status').textContent).toContain(frase))
    expect(!!screen.queryByText('Tentar de novo')).toBe(retenta)
    expect(screen.queryByTestId('parceiro-resposta')).toBeNull()
  })

  it('"Tentar de novo" repete o pedido e, desta vez, mostra a resposta', async () => {
    const pedir = vi
      .fn<() => Promise<ResultadoDoParceiro>>()
      .mockResolvedValueOnce({ ok: false, motivo: 'nuvem_ocupada', status: 429 })
      .mockResolvedValueOnce(OK)
    montar(pedir)
    fireEvent.click(screen.getByTestId('parceiro-pedir'))
    fireEvent.click(await screen.findByText('Tentar de novo'))
    await screen.findByTestId('parceiro-resposta')
    expect(pedir).toHaveBeenCalledTimes(2)
  })

  it('cota esgotada avisa o leitor (para o painel de ferramentas passar a explicar o motivo)', async () => {
    const aoEsgotarCota = vi.fn()
    montar(async () => ({ ok: false, motivo: 'uso_justo', status: 429 }), { aoEsgotarCota })
    fireEvent.click(screen.getByTestId('parceiro-pedir'))
    await waitFor(() => expect(aoEsgotarCota).toHaveBeenCalledWith('dia'))
  })

  it('carregando: o botão trava e o status diz "Pensando…"', async () => {
    let soltar: (r: ResultadoDoParceiro) => void = () => {}
    montar(() => new Promise<ResultadoDoParceiro>((ok) => (soltar = ok)))
    fireEvent.click(screen.getByTestId('parceiro-pedir'))
    expect(screen.getByTestId('parceiro-status').textContent).toBe('Pensando…')
    expect((screen.getByTestId('parceiro-pedir') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => soltar(OK))
    await screen.findByTestId('parceiro-resposta')
  })

  it('guardar como cartão: chama aoGuardar com o trecho e a frase e mostra o resultado', async () => {
    const aoGuardar = vi.fn(async () => true)
    montar(async () => OK, { aoGuardar })
    fireEvent.click(screen.getByTestId('parceiro-pedir'))
    fireEvent.click(await screen.findByText('Guardar o trecho como cartão'))
    await screen.findByText('Guardado no deck')
    expect(aoGuardar).toHaveBeenCalledWith('a quiet evening', 'It was a quiet evening.')
  })

  it('sem autorizar a IA de nuvem nenhum pedido sai; autorizar libera', async () => {
    consentiu = false
    const pedir = vi.fn(async (_p?: unknown) => OK)
    montar(pedir)
    expect(screen.queryByTestId('parceiro-pedir')).toBeNull()
    fireEvent.click(screen.getByText('Autorizar IA de nuvem'))
    expect(pedir).not.toHaveBeenCalled()
  })

  it('livro trazido: manda no máximo a seleção e 2 vizinhos (o livro dela não sai do aparelho)', async () => {
    const pedir = vi.fn(async (_p?: unknown) => OK)
    montar(pedir, {
      livro: { origem: 'proprio' },
      lerSecao: () => ({ paragrafos: Array.from({ length: 30 }, (_, i) => `Parágrafo ${i}.`), primeiroVisivel: 10 }),
      selecao: 'Parágrafo 10.',
    })
    fireEvent.click(screen.getByTestId('parceiro-pedir'))
    await screen.findByTestId('parceiro-resposta')
    const p = pedir.mock.calls[0][0] as { trechos: unknown[]; livro: object }
    expect(p.livro).toEqual({ origem: 'proprio' })
    expect(p.trechos.length).toBeLessThanOrEqual(2)
  })
})

describe('PainelDaTraducao', () => {
  const textos = ['One.', 'Two.', 'Three.', 'Four.']
  const montar = (extra: Record<string, unknown> = {}) =>
    render(
      <PainelDaTraducao
        paragrafos={textos}
        idiomaDoLivro="en"
        idiomaDaPessoa="pt"
        traduzir={async (t) => `PT ${t}`}
        lote={2}
        pausaMs={0}
        preparoMs={0}
        {...extra}
      />,
    )

  it('traduz o capítulo todo com progresso e mostra original e tradução lado a lado', async () => {
    montar()
    fireEvent.click(screen.getByTestId('traduzir-capitulo'))
    await waitFor(() => expect(screen.getByTestId('traducao-status').textContent).toContain('Capítulo traduzido'))
    const pares = document.querySelectorAll('.leitor-bilingue-par')
    expect(pares).toHaveLength(4)
    expect(pares[0].textContent).toContain('One.')
    expect(pares[0].textContent).toContain('PT One.')
    expect((screen.getByTestId('traducao-progresso') as HTMLProgressElement).value).toBe(4)
  })

  it('dá para cancelar no meio: o que saiu fica e o botão vira "Continuar a tradução"', async () => {
    let liberar: () => void = () => {}
    const travada = new Promise<void>((ok) => (liberar = ok))
    let n = 0
    montar({
      traduzir: async (t: string) => {
        if (++n === 2) await travada
        return `PT ${t}`
      },
    })
    fireEvent.click(screen.getByTestId('traduzir-capitulo'))
    await screen.findByTestId('cancelar-traducao')
    await waitFor(() => expect(screen.getByTestId('traducao-status').textContent).toContain('Traduzindo 1 de 4'))
    fireEvent.click(screen.getByTestId('cancelar-traducao'))
    await act(async () => liberar())
    expect(screen.getByTestId('traducao-status').textContent).toContain('Parei')
    expect(screen.getByText('Continuar a tradução')).toBeTruthy()
    expect(document.body.textContent).toContain('PT One.')
    expect(document.body.textContent).not.toContain('PT Four.')
  })

  it('traduz um parágrafo só, sob pedido', async () => {
    montar()
    fireEvent.click(screen.getAllByText('Traduzir este parágrafo')[2])
    await waitFor(() => expect(document.body.textContent).toContain('PT Three.'))
    expect(document.body.textContent).not.toContain('PT One.')
  })

  it('falha seguida do tradutor encerra com a mensagem de sempre e deixa tentar de novo', async () => {
    montar({ traduzir: async () => null })
    fireEvent.click(screen.getByTestId('traduzir-capitulo'))
    await waitFor(() => expect(screen.getByTestId('traducao-status').textContent).toContain('Não deu para traduzir'))
    expect(screen.getByText('Continuar a tradução')).toBeTruthy()
  })

  it('livro no idioma da pessoa: avisa em vez de devolver o mesmo texto', () => {
    montar({ idiomaDoLivro: 'pt', idiomaDaPessoa: 'pt' })
    expect(screen.getByTestId('traducao-mesmo-idioma')).toBeTruthy()
    expect(screen.queryByTestId('traduzir-capitulo')).toBeNull()
  })

  it('capítulo sem texto: explica', () => {
    montar({ paragrafos: [] })
    expect(screen.getByTestId('traducao-sem-texto')).toBeTruthy()
  })
})
