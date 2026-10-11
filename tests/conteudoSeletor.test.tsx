// @vitest-environment jsdom
/**
 * A FICHA E O CATÁLOGO ("Escolher o conteúdo"), e a BIBLIOTECA com a ficha.
 *
 * A marcação é a do protótipo (`seletor.js`, `fontes.js`, `telas.js:395-446` de `cartoes-enxuto-src`):
 * os testes cobram as classes e os textos de lá, o teclado (Enter abre, Esc fecha, o foco volta para a
 * ficha), a busca, escolher, o "x" e a lista longa.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContagensDeConteudo } from '../src/core/learning/contagensDeConteudo'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const servidor = vi.hoisted(() => ({ contagens: null as unknown, pedidos: [] as string[] }))

vi.mock('../src/data/rotas/settings', () => ({
  fetchSettings: async () => null,
  patchUiSettings: vi.fn(async () => null),
  saveSettings: async () => null,
}))
vi.mock('../src/data/rotas/conteudo', () => ({
  lerContagensDeConteudo: async (idioma: string) => {
    servidor.pedidos.push(idioma)
    const k = servidor.contagens as ContagensDeConteudo
    return k && { ...k, idioma: k.idiomas.length > 1 ? (k.idiomas.some((i) => i.id === idioma) ? idioma : k.idiomas[0].id) : '' }
  },
}))
vi.mock('../src/lib/langConfig', async (orig) => {
  const real = await orig<typeof import('../src/lib/langConfig')>()
  return { ...real, fetchLangConfig: async () => real.DEFAULT_LANG_CONFIG }
})
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
vi.mock('../src/data/api', async (orig) => ({
  ...(await orig<typeof import('../src/data/api')>()),
  fetchSessions: async () => [],
  patchSessionMeta: async () => null,
  updateSession: async () => null,
  deleteSession: async () => undefined,
}))

import CatalogoDeConteudo from '../src/components/conteudo/CatalogoDeConteudo'
import { CabecalhoComFicha, FichaDeConteudo } from '../src/components/conteudo/FichaDeConteudo'
import { SeletorDeConteudo } from '../src/components/conteudo/SeletorDeConteudo'
import Library from '../src/components/views/Library'
import type { FonteDeConteudo } from '../src/lib/conteudo/estado'
import { conteudoAtual, escolherConteudo, useConteudo, zerarConteudoParaTeste } from '../src/lib/conteudo/loja'
import { useContagensDeConteudo } from '../src/lib/conteudo/useContagens'
import type { Recording } from '../src/types'

const SESSAO: FonteDeConteudo = { tipo: 'sessao', id: 's1', nome: 'Reunião de produto: roadmap do trimestre' }

const catalogo = (o: Partial<ContagensDeConteudo> = {}): ContagensDeConteudo => ({
  agora: 0,
  idioma: 'en',
  idiomas: [
    { id: 'en', palavras: 318 },
    { id: 'es', palavras: 104 },
  ],
  tudo: { palavras: 318, frases: 236, paraHoje: 22 },
  dificeis: { palavras: 5, frases: 5, paraHoje: 2 },
  sessoes: [
    { id: 's1', nome: SESSAO.nome, tipo: 'live', quando: Date.UTC(2026, 9, 3), duracaoMs: 38 * 60_000, palavras: 37, frases: 31, paraHoje: 9 },
    { id: 's2', nome: 'Entrevista com a designer', tipo: 'video', quando: Date.UTC(2026, 9, 1), duracaoMs: null, palavras: 3, frases: 2, paraHoje: 0 },
  ],
  anki: [{ id: 'dA', nome: 'English Phrasal Verbs', tipo: null, quando: Date.UTC(2026, 8, 12), duracaoMs: null, palavras: 120, frases: 96, paraHoje: 2 }],
  trilha: { palavras: 60, frases: 0, paraHoje: 2 },
  ...o,
})

function Seletor(props: Partial<React.ComponentProps<typeof SeletorDeConteudo>> = {}) {
  const conteudo = useConteudo()
  const { contagens, recarregar } = useContagensDeConteudo(conteudo.idioma)
  return <SeletorDeConteudo conteudo={conteudo} contagens={contagens} aoRecarregar={recarregar} {...props} />
}

const abrir = async () => {
  fireEvent.click(document.querySelector('[data-fs="abrir"]')!)
  return waitFor(() => screen.getByRole('dialog', { name: 'Escolher o conteúdo' }))
}

beforeEach(() => {
  localStorage.clear()
  zerarConteudoParaTeste()
  servidor.contagens = catalogo()
  servidor.pedidos = []
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never
})
afterEach(cleanup)

describe('a ficha', () => {
  it('com "Tudo": ícone, nome e seta, sem o "x"', () => {
    render(<FichaDeConteudo conteudo={{ idioma: 'en', fonte: { tipo: 'tudo' } }} idioma="Inglês" aoAbrir={() => {}} aoVoltarParaTudo={() => {}} />)
    const ficha = document.querySelector('.fs-ficha')!
    expect(ficha.classList.contains('fs-com-volta')).toBe(false)
    const abre = ficha.querySelector('button.q-chip.fs-abrir')!
    expect(abre.getAttribute('aria-haspopup')).toBe('dialog')
    expect(abre.getAttribute('aria-label')).toBe('Conteúdo: Tudo em inglês. Trocar')
    expect(abre.querySelector('.fs-nome b')!.textContent).toBe('Tudo')
    expect(abre.querySelector('.fs-nome small')!.textContent).toBe('Inglês')
    expect(abre.querySelectorAll('svg')).toHaveLength(2)
    expect(ficha.querySelector('.fs-volta')).toBeNull()
  })

  it('com uma fonte: acesa, com o "x" que volta para Tudo em um toque', () => {
    const volta = vi.fn()
    render(<FichaDeConteudo conteudo={{ idioma: 'en', fonte: SESSAO }} aoAbrir={() => {}} aoVoltarParaTudo={volta} />)
    expect(document.querySelector('.fs-ficha.fs-com-volta')).not.toBeNull()
    expect(document.querySelector('.fs-nome b')!.textContent).toBe(SESSAO.nome)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Tudo' }))
    expect(volta).toHaveBeenCalledOnce()
  })

  it('o cabeçalho reutilizável: título na vaga fixa, ficha, espaço e o resto', () => {
    render(
      <CabecalhoComFicha titulo="Biblioteca" classe="fs-cab-bib" ficha={<span data-testid="ficha" />}>
        <p>resto</p>
      </CabecalhoComFicha>,
    )
    const cab = document.querySelector('header.q-cab.fs-cab.fs-cab-bib')!
    expect([...cab.children].map((x) => x.tagName + (x.className ? '.' + x.className : ''))).toEqual(['H1', 'SPAN', 'SPAN.q-espaco', 'P'])
  })

  it('"respira" uma vez ao mudar (a classe do brilho entra)', async () => {
    document.documentElement.dataset.px = 'on'
    document.body.classList.add('animations-on')
    const { rerender } = render(<FichaDeConteudo conteudo={{ idioma: 'en', fonte: { tipo: 'tudo' } }} aoAbrir={() => {}} aoVoltarParaTudo={() => {}} />)
    expect(document.querySelector('.fs-brilho')).toBeNull()
    rerender(<FichaDeConteudo conteudo={{ idioma: 'en', fonte: SESSAO }} aoAbrir={() => {}} aoVoltarParaTudo={() => {}} />)
    expect(document.querySelector('.fs-ficha.fs-brilho')).not.toBeNull()
    delete document.documentElement.dataset.px
    document.body.classList.remove('animations-on')
  })
})

describe('o catálogo', () => {
  it('Enter na ficha abre; grupos e ordem do protótipo; contagem por extenso; a marca "em uso"', async () => {
    render(<Seletor />)
    const ficha = document.querySelector<HTMLButtonElement>('[data-fs="abrir"]')!
    ficha.focus()
    /* Enter num <button> é um clique: o navegador o dispara; o jsdom precisa do clique. */
    fireEvent.keyDown(ficha, { key: 'Enter' })
    const d = await abrir()
    expect(d.className).toContain('qj qj-painel largo ct-dlg fx-catalogo')
    expect(within(d).getByText('Vale para os Cartões e para o Jogar, e fica guardado.')).toBeTruthy()
    expect([...d.querySelectorAll('.fx-linha-texto > b')].map((b) => b.textContent)).toEqual([
      'Tudo em inglês',
      'Difíceis',
      SESSAO.nome,
      'Entrevista com a designer',
      'English Phrasal Verbs',
      'Trilha de vocabulário',
    ])
    expect([...d.querySelectorAll('.ct-grupo h3')].map((h) => h.textContent)).toEqual(['Das minhas sessões', 'Do Anki', 'Trilha do app'])
    const linha = d.querySelector('[data-fx-fonte="sessao:s1"]')!
    expect(linha.querySelector('.fx-linha-conta')!.textContent).toBe('37 palavras · 31 frases')
    expect(d.querySelector('[data-fx-fonte="trilha"] .fx-linha-conta')!.textContent).toBe('60 palavras · sem frases')
    /* "Tudo" está em uso: marca no lugar do botão; as outras têm UMA ação, "Usar". */
    const tudo = d.querySelector('[data-fx-fonte="tudo"]')!.parentElement!
    expect(tudo.classList.contains('fx-linha-em-uso')).toBe(true)
    expect(tudo.querySelector('.ct-em-dia.fx-em-uso')!.textContent).toBe('em uso')
    expect(tudo.querySelector('.fx-usar')).toBeNull()
    expect(linha.parentElement!.querySelectorAll('button.fx-usar')).toHaveLength(1)
  })

  it('a chave de idioma no alto quando há dois; trocar pede o outro idioma e a fonte de idioma cai em Tudo', async () => {
    escolherConteudo(SESSAO, 'en')
    render(<Seletor />)
    const d = await abrir()
    const abas = [...d.querySelectorAll('.fs-idiomas .q-aba')]
    expect(abas.map((a) => [a.textContent, a.getAttribute('aria-pressed')])).toEqual([
      ['Inglês318', 'true'],
      ['Espanhol104', 'false'],
    ])
    fireEvent.click(abas[1])
    await waitFor(() => expect(servidor.pedidos).toContain('es'))
    expect(conteudoAtual()).toEqual({ idioma: 'es', fonte: { tipo: 'tudo' } })
  })

  it('com um idioma só, não há chave de idioma', async () => {
    servidor.contagens = catalogo({ idiomas: [{ id: 'en', palavras: 318 }] })
    render(<Seletor />)
    const d = await abrir()
    expect(d.querySelector('.fs-idiomas')).toBeNull()
    expect(d.querySelector('[data-fx-fonte="tudo"] b')!.textContent).toBe('Tudo')
  })

  it('a busca filtra pelo nome; sem resultado, oferece limpar', async () => {
    render(<Seletor />)
    const d = await abrir()
    const campo = within(d).getByRole('searchbox', { name: 'Buscar conteúdo pelo nome' })
    fireEvent.change(campo, { target: { value: 'phrasal' } })
    expect([...d.querySelectorAll('.fx-linha-texto > b')].map((b) => b.textContent)).toEqual(['English Phrasal Verbs'])
    fireEvent.change(campo, { target: { value: 'zzz' } })
    expect(within(d).getByText('Nada com “zzz”')).toBeTruthy()
    fireEvent.click(within(d).getByRole('button', { name: 'Limpar a busca' }))
    expect(d.querySelectorAll('.fx-linha')).toHaveLength(6)
  })

  it('no computador a linha mostra o painel (3 fatos, jogos, ações de retorno) e "Usar" escolhe e fecha', async () => {
    const aoRevisar = vi.fn()
    const aoJogar = vi.fn()
    render(<Seletor aoRevisar={aoRevisar} aoJogar={aoJogar} />)
    const d = await abrir()
    fireEvent.click(d.querySelector('[data-fx-fonte="sessao:s2"]')!)
    const det = d.querySelector('.fx-cat-det')!
    expect(det.querySelector('h2')!.textContent).toBe('Entrevista com a designer')
    expect([...det.querySelectorAll('.ct-fatos3 > div')].map((x) => x.textContent)).toEqual(['Palavras3', 'Frases2', 'Para hoje0'])
    expect(det.querySelector('.fx-fora-t')!.textContent).toContain('3 de 18 jogos abrem com ele.')
    expect(det.querySelectorAll('.fx-fora li')).toHaveLength(4)
    /* sem ação ligada, o botão não existe; "Revisar" sem nada para hoje fica desligado */
    expect(within(det as HTMLElement).queryByRole('button', { name: /Ver palavras/ })).toBeNull()
    expect((within(det as HTMLElement).getByRole('button', { name: 'Revisar' }) as HTMLButtonElement).disabled).toBe(true)
    expect(conteudoAtual().fonte.tipo).toBe('tudo') // tocar na linha não escolhe

    fireEvent.click(d.querySelector('[data-fx-fonte="sessao:s1"]')!)
    fireEvent.click(within(det as HTMLElement).getByRole('button', { name: 'Revisar · 9' }))
    expect(conteudoAtual()).toEqual({ idioma: 'en', fonte: SESSAO })
    expect(aoRevisar).toHaveBeenCalledExactlyOnceWith(SESSAO)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    /* a ficha acendeu, com o nome da sessão */
    expect(document.querySelector('.fs-ficha.fs-com-volta .fs-nome b')!.textContent).toBe(SESSAO.nome)
  })

  it('"Usar" na ponta da linha escolhe, fecha e devolve o foco à ficha; o "x" volta para Tudo', async () => {
    render(<Seletor />)
    const d = await abrir()
    fireEvent.click(d.querySelector('[data-fx-usar="anki:dA"]')!)
    expect(conteudoAtual().fonte).toEqual({ tipo: 'anki', id: 'dA', nome: 'English Phrasal Verbs' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-fs="abrir"]')))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Tudo' }))
    expect(conteudoAtual().fonte).toEqual({ tipo: 'tudo' })
    expect(document.querySelector('.fs-volta')).toBeNull()
  })

  it('no celular a linha inteira usa', async () => {
    window.matchMedia = ((q: string) => ({ matches: /max-width: 720px/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never
    render(<Seletor />)
    const d = await abrir()
    fireEvent.click(d.querySelector('[data-fx-fonte="dificeis"]')!)
    expect(conteudoAtual().fonte).toEqual({ tipo: 'dificeis' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('Esc fecha (o `close` do diálogo) e o foco volta para a ficha', async () => {
    render(<Seletor />)
    const d = (await abrir()) as HTMLDialogElement
    act(() => d.close())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-fs="abrir"]')))
    expect(conteudoAtual().fonte.tipo).toBe('tudo')
  })

  it('"Trazer uma fonte" mora dentro do catálogo e abre a folha com as portas ligadas', async () => {
    const aoCapturar = vi.fn()
    render(<Seletor aoCapturar={aoCapturar} aoTrazerArquivo={() => {}} />)
    const d = await abrir()
    fireEvent.click(within(d).getByRole('button', { name: /Trazer uma fonte/ }))
    const folha = await waitFor(() => screen.getByRole('dialog', { name: 'Trazer uma fonte' }))
    expect(folha.className).toContain('ct-dlg ct-menu ct-trazer fx-trazer')
    expect([...folha.querySelectorAll('.ct-menu-lista .q-linha b')].map((b) => b.textContent)).toEqual([
      'Arquivo do Anki',
      'Vídeo, áudio ou PDF',
      'Capturar agora',
    ])
    fireEvent.click(within(folha).getByRole('button', { name: /Capturar agora/ }))
    expect(aoCapturar).toHaveBeenCalledOnce()
  })

  it('quem ainda não trouxe nada vê os grupos vazios com a porta', async () => {
    servidor.contagens = catalogo({ idiomas: [], tudo: { palavras: 0, frases: 0, paraHoje: 0 }, dificeis: { palavras: 0, frases: 0, paraHoje: 0 }, sessoes: [], anki: [], trilha: null })
    render(<Seletor />)
    const d = await abrir()
    expect(d.querySelectorAll('.fx-grupo-vazio')).toHaveLength(2)
    expect(d.querySelector('.fx-busca')).toBeNull()
    expect(d.querySelectorAll('.fx-linha')).toHaveLength(1)
  })

  it('lista longa: 200 sessões entram de uma vez, com a contagem do grupo', async () => {
    const k = catalogo()
    const sessoes = Array.from({ length: 200 }, (_, i) => ({ ...k.sessoes[0], id: `x${i}`, nome: `Sessão ${i}` }))
    const antes = performance.now()
    render(
      <CatalogoDeConteudo
        conteudo={{ idioma: 'en', fonte: { tipo: 'tudo' } }}
        contagens={{ ...k, sessoes }}
        aoEscolher={() => {}}
        aoMudarIdioma={() => {}}
        aoRecarregar={async () => null}
        aoFechar={() => {}}
      />,
    )
    expect(document.querySelectorAll('.fx-linha')).toHaveLength(204)
    expect(document.querySelector('.ct-grupo h3 .fx-grupo-n')!.textContent!.trim()).toBe('200')
    expect(performance.now() - antes).toBeLessThan(2000)
  })
})

describe('a Biblioteca com a ficha', () => {
  const gravacao = (id: string, extra: Partial<Recording> = {}): Recording =>
    ({ id, title: `Sessão ${id}`, date: 'Ontem', durationStr: '38:10', wordCount: 1234, type: 'audio', tags: [], idioma: 'en', pronta: true, ...extra }) as Recording
  const GRAVACOES = [
    gravacao('s1', { title: SESSAO.nome }),
    gravacao('s2'),
    gravacao('s9', { title: 'Sem cartão' }),
    gravacao('e1', { title: 'Aula de espanhol', idioma: 'es', type: 'video' }),
  ]
  const montar = (aoIr = vi.fn()) => {
    render(<Library onChangeView={aoIr} recordings={GRAVACOES} />)
    return aoIr
  }
  const pronta = () => waitFor(() => expect(document.querySelector('.fx-bib-acoes')).not.toBeNull())

  it('o cabeçalho: título, ficha, e à direita os totais do idioma e a ordem; sem "Importar"', async () => {
    montar()
    await pronta()
    const cab = document.querySelector('.q-bib > header.q-cab.fs-cab.fs-cab-bib')!
    expect([...cab.children].map((x) => x.className || x.tagName)).toEqual([
      'H1',
      'fs-ficha ',
      'q-espaco',
      'q-sobre fs-bib-sobre',
      'q-chip fs-bib-ordem',
    ])
    expect(cab.querySelector('.fs-bib-sobre')!.textContent).toBe('3 gravações · 115 min · 3.702 palavras')
    expect(screen.queryByRole('button', { name: 'Importar' })).toBeNull()
  })

  it('a fileira de idioma não existe: manda o idioma do seletor; sobra o filtro de tipo', async () => {
    montar()
    await pronta()
    expect(document.querySelectorAll('.q-bib > .q-abas')).toHaveLength(1)
    expect([...document.querySelectorAll('.q-bib .q-lista .q-linha b')].map((b) => b.textContent)).toEqual([SESSAO.nome, 'Sessão s2', 'Sem cartão'])
    const link = screen.getByRole('button', { name: 'Ver a gravação em espanhol' })
    expect(link.className).toBe('ex-lig fs-outro-idioma')
    fireEvent.click(link)
    await waitFor(() => expect([...document.querySelectorAll('.q-bib .q-lista .q-linha b')].map((b) => b.textContent)).toEqual(['Aula de espanhol']))
    expect(conteudoAtual().idioma).toBe('es')
  })

  it('a linha mostra as palavras GUARDADAS (as do baralho) e as duas ações diretas', async () => {
    montar()
    await pronta()
    const linhas = [...document.querySelectorAll('.q-bib .q-lista > .ct-linha-caixa.fx-bib-caixa')]
    expect(linhas.map((l) => l.querySelector('.q-fim')!.textContent)).toEqual(['37 palavras', '3 palavras', 'sem cartões'])
    expect(linhas.map((l) => l.querySelectorAll('.fx-bib-acoes .q-ctl.ct-so-icone').length)).toEqual([2, 2, 0])
    expect(within(linhas[0] as HTMLElement).getByRole('button', { name: `Revisar ${SESSAO.nome}: 9 para hoje` })).toBeTruthy()
    expect((within(linhas[1] as HTMLElement).getByRole('button', { name: 'Revisar Sessão s2: nada vence hoje' }) as HTMLButtonElement).disabled).toBe(true)
    /* o painel: guardadas de total */
    expect(document.querySelector('.q-bib-det .q-bib-fatos > div')!.textContent).toBe('Guardadas37 de 1.234')
  })

  it('"Jogar" e "Revisar" da sessão definem o conteúdo e levam; a sessão em uso ganha a marca', async () => {
    const aoIr = montar()
    await pronta()
    fireEvent.click(screen.getByRole('button', { name: 'Jogar com Sessão s2' }))
    expect(conteudoAtual()).toEqual({ idioma: 'en', fonte: { tipo: 'sessao', id: 's2', nome: 'Sessão s2' } })
    expect(aoIr).toHaveBeenLastCalledWith('play', { id: 's2' })
    fireEvent.click(screen.getByRole('button', { name: `Revisar ${SESSAO.nome}: 9 para hoje` }))
    expect(conteudoAtual().fonte).toEqual(SESSAO)
    expect(aoIr).toHaveBeenLastCalledWith('study', { id: 's1' })
    await waitFor(() => expect(document.querySelector('.q-lista .fs-em-uso')!.textContent).toBe('em uso'))
    expect(document.querySelector('.q-lista .fs-em-uso')!.closest('.q-linha')!.querySelector('b')!.textContent).toBe(SESSAO.nome)
    expect(document.querySelector('.q-bib-tags .q-tag.ct-rv')!.textContent).toBe('Em uso')
  })

  it('tocar numa linha a seleciona e "Abrir" abre; "Trazer ou capturar" abre a folha de trazer', async () => {
    const aoIr = montar()
    await pronta()
    fireEvent.click(document.querySelector('[data-px-grav="s2"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(aoIr).toHaveBeenLastCalledWith('analysis', { id: 's2' })
    fireEvent.click(screen.getByRole('button', { name: /Trazer ou capturar/ }))
    expect(await waitFor(() => screen.getByRole('dialog', { name: 'Trazer uma fonte' }))).toBeTruthy()
  })
})
