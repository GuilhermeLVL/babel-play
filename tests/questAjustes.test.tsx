// @vitest-environment jsdom
/**
 * AJUSTES NO META QUEST (segunda rodada do headset, 01/10/2026).
 *
 * A regra que estes testes guardam é a do guia (`docs/design/quest-desenho.md`): NENHUMA FUNÇÃO SOME.
 * As seis abas montam no desenho do headset, e cada ajuste da tela de sempre continua alcançável e
 * chama o mesmo caminho de gravação. Mais o que é novo: "Vibração ao apontar" e o seletor de idioma em
 * diálogo. Fora do Quest, a tela de sempre não muda.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import LangPicker from '../src/components/LangPicker'
import LangAudit from '../src/components/views/LangAudit'
import Settings from '../src/components/views/Settings'
import { PADRAO, type Preferencias } from '../src/lib/preferencias'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

/* `ligado`: o desenho novo está à vista. `aparelho`: o headset, salvo nos casos "no computador". */
const quest = vi.hoisted(() => ({ ligado: true, aparelho: 'quest' as string }))
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()
  return { ...real, useQuestNovo: () => quest.ligado }
})
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: quest.aparelho }) }
})

const api = vi.hoisted(() => ({
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(),
  patchUiSettings: vi.fn(),
  fetchDeck: vi.fn(),
  fetchAllUtterances: vi.fn(),
  fetchExerciseResults: vi.fn(),
}))
vi.mock('../src/data/api', async (original) => ({
  ...(await original<typeof import('../src/data/api')>()),
  ...api,
}))

const nuance = vi.hoisted(() => ({ listarGlossario: vi.fn(), apagarDoGlossario: vi.fn() }))
vi.mock('../src/data/apiDaNuance', () => nuance)

const prefs = vi.hoisted(() => ({ atual: null as unknown, salvar: vi.fn() }))
vi.mock('../src/lib/preferencias', async (original) => {
  const real = await original<typeof import('../src/lib/preferencias')>()
  const salvarPreferencias = (fn: (p: Preferencias) => Preferencias) => {
    prefs.atual = fn(prefs.atual as Preferencias)
    prefs.salvar(prefs.atual)
    return Promise.resolve(true)
  }
  return {
    ...real,
    usePreferencias: () => prefs.atual,
    salvarPreferencias,
    mudarConsentimento: (chave: string, valor: boolean) =>
      salvarPreferencias((p) => ({ ...p, consentimentos: { ...p.consentimentos, [chave]: valor } })),
  }
})

vi.mock('../src/lib/usePerfil', () => ({ usePerfil: () => ({ perfil: null, buscando: false }) }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))

const dados = vi.hoisted(() => ({ prepararCopia: vi.fn(), baixarArquivo: vi.fn() }))
vi.mock('../src/components/views/perfil/AbaDados', () => ({ ...dados, RelatorioDaExclusao: () => null }))

const acoes = () => ({
  setDarkMode: vi.fn(),
  onOpenStudio: vi.fn(),
  onReplayTour: vi.fn(),
  setAgeProfile: vi.fn(),
  setMenuPosition: vi.fn(),
  setFontScale: vi.fn(),
  toggleSound: vi.fn(),
  toggleAnimations: vi.fn(),
  togglePerformanceMode: vi.fn(),
  onChangeView: vi.fn(),
})

function montar(aba: string | null = null) {
  const a = acoes()
  const tela = render(
    <Settings
      theme={'babel' as never}
      darkMode={false}
      abaInicial={aba}
      menuPosition={'left' as never}
      fontScale="md"
      soundEnabled
      animationsEnabled
      performanceMode
      {...a}
    />,
  )
  return { ...tela, ...a }
}

const interruptor = (nome: string | RegExp) => screen.getByRole('switch', { name: nome })

beforeAll(prepararDialogoNoJsdom)
beforeEach(() => {
  quest.ligado = true
  quest.aparelho = 'quest'
  prefs.atual = JSON.parse(JSON.stringify(PADRAO))
  prefs.salvar.mockReset()
  for (const f of Object.values(api)) f.mockReset()
  api.fetchSettings.mockResolvedValue(null)
  api.saveSettings.mockResolvedValue({})
  api.patchUiSettings.mockResolvedValue(true)
  api.fetchDeck.mockResolvedValue([])
  api.fetchAllUtterances.mockResolvedValue([])
  api.fetchExerciseResults.mockResolvedValue([])
  nuance.listarGlossario.mockResolvedValue({
    ok: true,
    valor: {
      entradas: [{ id: 'g1', termo: 'deadline', traducao: 'prazo', origem: 'en', destino: 'pt', atualizadoEm: 1 }],
      limite: 500,
    },
  })
  nuance.apagarDoGlossario.mockResolvedValue({ ok: true, valor: true })
  dados.prepararCopia.mockResolvedValue({ blob: new Blob(['{}']), nome: 'babel-play.json' })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Ajustes no Quest: a casca', () => {
  it('monta no desenho do headset, com as seis abas na ordem de sempre', () => {
    const { container } = montar()
    expect(container.querySelector('.q-palco.q-aju')).not.toBeNull()
    expect(container.querySelector('.tela')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual([
      'Idiomas',
      'Aparência',
      'Notificações',
      'Processamento',
      'Privacidade',
      'Conta',
    ])
    expect(screen.getByRole('tab', { name: 'Idiomas' }).getAttribute('aria-selected')).toBe('true')
  })

  it('a aba pedida por quem abre a tela é a que aparece, e as setas trocam de aba', () => {
    montar('notificacoes')
    const aba = screen.getByRole('tab', { name: 'Notificações' })
    expect(aba.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(aba, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Processamento' }).getAttribute('aria-selected')).toBe('true')
  })

  it('fora do Quest, a tela de sempre: nada do desenho do headset', () => {
    quest.ligado = false
    const { container } = montar('aparencia')
    expect(container.querySelector('.q-palco')).toBeNull()
    expect(container.querySelector('.tela')).not.toBeNull()
    expect(screen.queryByText('Vibração ao apontar')).toBeNull()
  })
})

describe('Ajustes no Quest: Idiomas', () => {
  it('os três idiomas, cada um com o seletor em diálogo; escolher grava e confirma', async () => {
    montar('idiomas')
    const gatilho = await screen.findByRole('button', { name: /^Idioma que estou aprendendo:/ })
    expect(await screen.findByRole('button', { name: /^Meu idioma:/ })).toBeTruthy()
    expect(await screen.findByRole('button', { name: /^Idioma da interface:/ })).toBeTruthy()

    fireEvent.click(gatilho)
    const lista = within(screen.getByRole('dialog', { name: 'Idioma que estou aprendendo' }))
    expect(lista.getAllByRole('option').length).toBeGreaterThan(10)
    fireEvent.change(lista.getByRole('searchbox'), { target: { value: 'franc' } })
    const opcoes = lista.getAllByRole('option')
    expect(opcoes).toHaveLength(1)
    fireEvent.click(opcoes[0])
    await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ targetLanguage: 'fr-FR' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a Tradução Nuance: registro, variantes e o glossário que se apaga', async () => {
    montar('idiomas')
    const painel = within(await screen.findByTestId('painel-da-nuance'))
    for (const nome of ['Automático', 'Formal', 'Informal', 'Brasil', 'Portugal', 'América Latina', 'Espanha'])
      expect(painel.getByRole('button', { name: nome })).toBeTruthy()
    fireEvent.click(await painel.findByRole('button', { name: 'Apagar "deadline" do glossário' }))
    await waitFor(() => expect(nuance.apagarDoGlossario).toHaveBeenCalledWith('g1'))
  })

  it('a auditoria de idioma: conferir, e o estado vazio diz que não há o que auditar', async () => {
    montar('idiomas')
    const auditoria = within(screen.getByTestId('auditoria-de-idioma'))
    expect(auditoria.getByRole('button', { name: 'Falas das transcrições' })).toBeTruthy()
    fireEvent.click(auditoria.getByRole('button', { name: /Conferir agora/ }))
    expect(await auditoria.findByText(/Você ainda não tem cartões no baralho/)).toBeTruthy()
    expect(auditoria.getByRole('button', { name: /Conferir de novo/ })).toBeTruthy()
  })
})

describe('Ajustes no Quest: Aparência', () => {
  it('tema, tamanho do texto e os três interruptores chamam o que a tela de sempre chama', () => {
    const { setDarkMode, setFontScale, toggleAnimations, toggleSound, togglePerformanceMode } = montar('aparencia')
    fireEvent.click(screen.getByRole('button', { name: 'Escuro' }))
    expect(setDarkMode).toHaveBeenCalledWith(true)
    expect(screen.getByRole('button', { name: 'Claro' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Grande' }))
    expect(setFontScale).toHaveBeenCalledWith('lg')
    expect(screen.getByRole('button', { name: 'Médio' }).getAttribute('aria-pressed')).toBe('true')

    expect(interruptor('Reduzir movimento').getAttribute('aria-checked')).toBe('false')
    fireEvent.click(interruptor('Reduzir movimento'))
    expect(toggleAnimations).toHaveBeenCalledTimes(1)
    expect(interruptor('Sons').getAttribute('aria-checked')).toBe('true')
    fireEvent.click(interruptor('Sons'))
    expect(toggleSound).toHaveBeenCalledTimes(1)
    expect(interruptor('Modo desempenho').getAttribute('aria-checked')).toBe('true')
    fireEvent.click(interruptor('Modo desempenho'))
    expect(togglePerformanceMode).toHaveBeenCalledTimes(1)
  })

  it('NOVO: vibração ao apontar, com três opções, guardada no aparelho, e "Testar" diz o que houve', () => {
    montar('aparencia')
    const linha = within(screen.getByTestId('vibracao-ao-apontar'))
    const opcao = (nome: string) => linha.getByRole('button', { name: nome })
    // De fábrica, forte.
    expect(opcao('Forte').getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(opcao('Suave'))
    expect(localStorage.getItem('babel.quest.vibracao')).toBe('suave')
    expect(opcao('Suave').getAttribute('aria-pressed')).toBe('true')

    // Sem controle à vista (jsdom não tem Gamepad API): o app usa o som no lugar, e a linha diz isso.
    fireEvent.click(linha.getByRole('button', { name: 'Testar' }))
    expect(screen.getByTestId('prova-da-vibracao').textContent).toMatch(/Nenhum controle à vista.*som bem baixo/)

    fireEvent.click(opcao('Desligada'))
    expect(localStorage.getItem('babel.quest.vibracao')).toBe('desligada')
    expect((linha.getByRole('button', { name: 'Testar' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('prova-da-vibracao').textContent).toMatch(/nada vibra nem soa/)
  })

  it('no headset não há "Desenho novo": lá a chave das telas novas mora no diagnóstico', () => {
    montar('aparencia')
    expect(screen.queryByText('Desenho novo')).toBeNull()
    quest.ligado = false
    cleanup()
    montar('aparencia')
    expect(screen.queryByText('Desenho novo')).toBeNull()
  })
})

describe('Ajustes no computador: o interruptor do desenho novo', () => {
  beforeEach(() => {
    quest.aparelho = 'desktop-com-gpu'
  })

  it('na tela de sempre, "Desenho novo" está desligado e ligar grava a escolha neste computador', () => {
    quest.ligado = false
    const { container } = montar('aparencia')
    expect(container.querySelector('.tela')).not.toBeNull()
    expect(screen.getByText(/A interface limpa que nasceu no headset, agora no computador/)).toBeTruthy()
    const caixa = screen.getByRole('checkbox', { name: 'Desenho novo' }) as HTMLInputElement
    expect(caixa.checked).toBe(false)
    fireEvent.click(caixa)
    expect(localStorage.getItem('babel.desenhoNovo')).toBe('sim')
    expect(document.documentElement.dataset.questNovo).toBe('true')
  })

  it('no desenho novo, o mesmo ajuste é um interruptor ligado; desligar devolve a tela de sempre', () => {
    localStorage.setItem('babel.desenhoNovo', 'sim')
    const { container } = montar('aparencia')
    expect(container.querySelector('.q-palco.q-aju')).not.toBeNull()
    const linha = screen.getByTestId('desenho-novo')
    expect(linha.className).toContain('q-ajuste')
    expect(linha.textContent).toContain('A interface limpa que nasceu no headset, agora no computador.')
    const chave = interruptor('Desenho novo')
    expect(chave.className).toContain('q-interruptor')
    expect(chave.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(chave)
    expect(localStorage.getItem('babel.desenhoNovo')).toBeNull()
    expect(document.documentElement.dataset.questNovo).toBe('false')
  })

  it('o que é do headset não aparece: nada de "Vibração ao apontar", e o resto da aba continua', () => {
    const { toggleSound } = montar('aparencia')
    expect(screen.queryByTestId('vibracao-ao-apontar')).toBeNull()
    expect(screen.queryByText('Vibração ao apontar')).toBeNull()
    for (const nome of ['Reduzir movimento', 'Sons', 'Modo desempenho']) expect(interruptor(nome)).toBeTruthy()
    fireEvent.click(interruptor('Sons'))
    expect(toggleSound).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Escuro' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Grande' })).toBeTruthy()
  })
})

describe('Ajustes no Quest: Notificações', () => {
  it('lembrete e horário, a matriz tipo × canal inteira, o silêncio e o resumo com "Ver exemplo"', async () => {
    const { container } = montar('notificacoes')
    // 4 tipos × 3 canais na matriz.
    expect(container.querySelectorAll('.q-aju-matriz [role="switch"]')).toHaveLength(12)

    expect(screen.getByRole('combobox', { name: 'Horário do lembrete' })).toBeTruthy()
    fireEvent.click(interruptor('Lembrete diário'))
    expect((prefs.atual as Preferencias).lembrete.on).toBe(false)

    fireEvent.click(interruptor('Revisão pendente por e-mail'))
    expect((prefs.atual as Preferencias).avisos.revisao.email).toBe(true)

    fireEvent.click(interruptor('Horário silencioso'))
    expect((prefs.atual as Preferencias).silencio.on).toBe(!PADRAO.silencio.on)

    if (!(prefs.atual as Preferencias).semanal.on) fireEvent.click(interruptor('Resumo semanal'))
    cleanup()
    montar('notificacoes')
    fireEvent.click(screen.getByRole('button', { name: 'Segunda' }))
    expect((prefs.atual as Preferencias).semanal.dia).toBe('segunda')
    fireEvent.click(screen.getByRole('button', { name: /Ver exemplo/ }))
    expect(await screen.findByRole('dialog', { name: 'Sua semana no Babel Play' })).toBeTruthy()
  })
})

describe('Ajustes no Quest: Processamento', () => {
  it('aparelho ou a sua chave, a IA do computador, e o teste de tradução atrás do detalhe', () => {
    montar('contas')
    const aparelho = screen.getByRole('button', { name: /Rodar no seu aparelho/ })
    expect(aparelho.getAttribute('aria-pressed')).toBe('true')
    expect(aparelho.textContent).toContain('Em uso')
    expect(screen.getByRole('button', { name: /Usar a sua chave \(nuvem\)/ })).toBeTruthy()

    fireEvent.click(interruptor('Usar também a IA do computador'))
    expect(api.saveSettings).toHaveBeenCalledWith({ activeProfileId: 'local-private' })

    expect(screen.getByText('Ver o que este jeito consegue fazer e testar uma tradução')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Traduzir pelo gateway/ })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Texto em inglês para testar a tradução ao vivo' })).toBeTruthy()
  })
})

describe('Ajustes no Quest: Privacidade', () => {
  it('os cinco consentimentos, a cópia em JSON ou CSV com os três estados, política e encarregado', async () => {
    const { container } = montar('privacidade')
    expect(container.querySelectorAll('.q-ajustes [role="switch"]')).toHaveLength(5)
    fireEvent.click(interruptor('Métricas de uso'))
    expect(prefs.salvar).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
    expect((prefs.atual as Preferencias).formatoDaCopia).toBe('csv')

    fireEvent.click(screen.getByRole('button', { name: /Pedir uma cópia/ }))
    expect(await screen.findByText('Seu arquivo está pronto')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Baixar/ }))
    expect(dados.baixarArquivo).toHaveBeenCalledTimes(1)

    expect(screen.getByRole('link', { name: /Falar com o encarregado de dados/ }).getAttribute('href')).toMatch(
      /^mailto:/,
    )
    fireEvent.click(screen.getByRole('button', { name: /Política de privacidade/ }))
    expect(screen.getByRole('dialog', { name: 'Política de privacidade' })).toBeTruthy()
  })
})

describe('Ajustes no Quest: Conta', () => {
  it('sem login, cada linha continua lá e diz "sem login"; rever a apresentação e excluir a conta', () => {
    const { onReplayTour } = montar('conta')
    for (const titulo of ['E-mail', 'Senha', 'Verificação em duas etapas', 'Aparelhos conectados', 'Atividade recente'])
      expect(screen.getByText(titulo)).toBeTruthy()
    expect(screen.getAllByText('sem login')).toHaveLength(3)
    expect(screen.getByText('Você está aqui')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Rever/ }))
    expect(onReplayTour).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Excluir a conta/ }))
    expect(screen.getByRole('dialog', { name: 'Excluir a sua conta' })).toBeTruthy()
  })
})

describe('O seletor de idioma', () => {
  it('no Quest: gatilho grande e lista em diálogo; "automático" continua oferecido', async () => {
    const aoEscolher = vi.fn()
    render(<LangPicker value="en-US" allowAuto ariaLabel="Idioma do conteúdo" onPick={aoEscolher} />)
    const gatilho = await screen.findByRole('button', { name: /^Idioma do conteúdo:/ })
    expect(gatilho.className).toContain('q-seletor')
    fireEvent.click(gatilho)
    fireEvent.click(screen.getByRole('option', { name: 'Detectar automaticamente' }))
    expect(aoEscolher).toHaveBeenCalledWith({ auto: true })
  })

  it('no Quest: o teclado do seletor de sempre vale na busca (setas, Home/End e Enter)', async () => {
    const aoEscolher = vi.fn()
    render(<LangPicker value="en-US" ariaLabel="Idioma do conteúdo" onPick={aoEscolher} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Idioma do conteúdo:/ }))
    const busca = screen.getByRole('searchbox')
    const opcoes = screen.getAllByRole('option')
    const destacada = () => screen.getAllByRole('option').findIndex((o) => o.getAttribute('data-active') === 'true')
    // Uma opção destacada por vez (a que o Enter escolhe).
    expect(screen.getAllByRole('option').filter((o) => o.getAttribute('data-active') === 'true')).toHaveLength(1)

    fireEvent.keyDown(busca, { key: 'Home' })
    expect(destacada()).toBe(0)
    fireEvent.keyDown(busca, { key: 'ArrowDown' })
    expect(destacada()).toBe(1)
    expect(busca.getAttribute('aria-activedescendant')).toBe(opcoes[1].id)
    fireEvent.keyDown(busca, { key: 'End' })
    expect(destacada()).toBe(opcoes.length - 1)
    fireEvent.keyDown(busca, { key: 'ArrowUp' })
    fireEvent.keyDown(busca, { key: 'Enter' })
    expect(aoEscolher).toHaveBeenCalledTimes(1)
    expect(aoEscolher.mock.calls[0][0]).toMatchObject({ auto: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('fora do Quest: a lista de sempre, colada no gatilho', () => {
    quest.ligado = false
    const { container } = render(<LangPicker value="en-US" ariaLabel="Idioma do conteúdo" onPick={() => {}} />)
    expect(container.querySelector('.q-seletor')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Idioma do conteúdo' })).toBeTruthy()
  })
})

describe('A auditoria de idioma fora do Quest', () => {
  it('continua com a marcação de sempre', () => {
    quest.ligado = false
    const { container } = render(<LangAudit />)
    expect(container.querySelector('.q-secao')).toBeNull()
    expect(screen.getByRole('button', { name: /Conferir agora/ })).toBeTruthy()
  })
})
