// @vitest-environment jsdom
/**
 * O Mapeador na tela e no fluxo (openspec `motor-anki-mapeador`, tarefas 4.x): a troca de papel muda a prévia sem sumir
 * com campo nenhum, confiança baixa para ANTES do primeiro lote, cancelar não envia nada, confirmar relê com o mapeamento
 * escolhido e lembra dele neste aparelho, e o perfil reconhecido pode ser esquecido.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/anki/lerBaralho', () => ({ lerBaralhoNoNavegador: vi.fn() }))
vi.mock('../src/data/api', () => ({
  apiFetch: vi.fn(),
  IMPORT_TIMEOUT_MS: 600_000,
  lerErro: async (res: Response) => ({ status: res.status, error: `o servidor respondeu ${res.status}` }),
}))

import { AvisoDePerfilReconhecido, MapeadorDeCampos } from '../src/components/views/anki/MapeadorDeCampos'
import { type EstruturaLida, hashDaEstrutura, type NotaAnki, type PapelNaImportacao } from '../src/core/anki'
import { apiFetch } from '../src/data/api'
import { ImportacaoCancelada, importarBaralhoAnki } from '../src/data/importarAnki'
import { lerBaralhoNoNavegador } from '../src/lib/anki/lerBaralho'
import { CHAVE_DOS_PERFIS, lerPerfis } from '../src/lib/anki/perfisDeMapeamento'

const apiFetchMock = apiFetch as unknown as ReturnType<typeof vi.fn>
const lerMock = lerBaralhoNoNavegador as unknown as ReturnType<typeof vi.fn>

const CAMPOS = ['№', 'IMG', 'Foo', 'Bar']
const HASH = hashDaEstrutura(CAMPOS)
const estrutura = (extra: Partial<EstruturaLida> = {}): EstruturaLida => ({
  hash: HASH,
  notetype: '4000 EW',
  campos: CAMPOS,
  notas: 3871,
  papeis: ['palavra', 'nenhum', 'significado', 'nenhum'],
  palpites: {
    palavra: { indice: 0, confianca: 'baixa', origem: 'posicao' },
    significado: { indice: 2, confianca: 'baixa', origem: 'posicao' },
  },
  precisaDeConferencia: true,
  amostra: [
    ['1', '', 'abandon', 'deixar'],
    ['2', '', 'ability', 'capacidade'],
  ],
  ...extra,
})

describe('MapeadorDeCampos (componente)', () => {
  afterEach(() => cleanup())

  it('lista todos os campos, destaca o que está em dúvida e a troca de papel muda a prévia', () => {
    render(<MapeadorDeCampos estruturas={[estrutura()]} aoConfirmar={vi.fn()} aoCancelar={vi.fn()} />)
    // Nenhum campo some.
    for (const c of CAMPOS) expect(screen.getByText(c)).toBeTruthy()
    expect(screen.getAllByText('Conferir').length).toBeGreaterThan(0)

    // Palavra passa de № para Foo, significado para Bar.
    fireEvent.change(screen.getByLabelText('Papel do campo №'), { target: { value: 'nenhum' } })
    fireEvent.change(screen.getByLabelText('Papel do campo Foo'), { target: { value: 'palavra' } })
    fireEvent.change(screen.getByLabelText('Papel do campo Bar'), { target: { value: 'significado' } })
    expect(screen.getByText('abandon')).toBeTruthy()
    expect(screen.getByText('deixar', { selector: 'span:not(.mapeador-amostra)' })).toBeTruthy()
    // Os 4 campos continuam na tela.
    expect(screen.getAllByRole('combobox')).toHaveLength(4)
  })

  it('palavra e significado são únicos: escolher um papel de novo tira de quem o tinha', () => {
    render(<MapeadorDeCampos estruturas={[estrutura()]} aoConfirmar={vi.fn()} aoCancelar={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Papel do campo Bar'), { target: { value: 'palavra' } })
    expect((screen.getByLabelText('Papel do campo №') as HTMLSelectElement).value).toBe('nenhum')
    expect((screen.getByLabelText('Papel do campo Bar') as HTMLSelectElement).value).toBe('palavra')
  })

  it('sem palavra ou sem tradução o botão fica desligado e a tela diz por quê', () => {
    render(<MapeadorDeCampos estruturas={[estrutura()]} aoConfirmar={vi.fn()} aoCancelar={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Papel do campo №'), { target: { value: 'nenhum' } })
    expect((screen.getByRole('button', { name: 'Importar assim' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Falta escolher a palavra e a tradução/)).toBeTruthy()
  })

  it('confirmar entrega os papéis por hash; cancelar não entrega nada', () => {
    const aoConfirmar = vi.fn()
    const aoCancelar = vi.fn()
    render(<MapeadorDeCampos estruturas={[estrutura()]} aoConfirmar={aoConfirmar} aoCancelar={aoCancelar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Importar assim' }))
    expect(aoConfirmar).toHaveBeenCalledWith({ [HASH]: ['palavra', 'nenhum', 'significado', 'nenhum'] })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(aoCancelar).toHaveBeenCalledTimes(1)
  })
})

describe('AvisoDePerfilReconhecido', () => {
  afterEach(() => cleanup())
  it('diz que reconheceu e esquece só quando a pessoa pede', () => {
    const aoEsquecer = vi.fn()
    render(<AvisoDePerfilReconhecido reconhecidos={[{ hash: HASH, notetype: '4000 EW' }]} aoEsquecer={aoEsquecer} />)
    expect(screen.getByText(/mapeamento de um baralho anterior \(4000 EW\)/)).toBeTruthy()
    expect(aoEsquecer).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Esquecer/ }))
    expect(aoEsquecer).toHaveBeenCalledWith(HASH)
    expect(screen.queryByRole('button', { name: /Esquecer/ })).toBeNull()
  })
})

describe('importarBaralhoAnki com o Mapeador', () => {
  const arquivo = new File(['x'], '4000ew.apkg')
  const json = (corpo: unknown) =>
    ({ ok: true, status: 200, json: async () => corpo, headers: new Headers() }) as unknown as Response
  const nota = (frente: string, verso: string): NotaAnki => ({
    guid: frente,
    frente,
    verso,
    tags: [],
    campos: CAMPOS,
    notetype: '4000 EW',
  })
  const leitura = (notas: NotaAnki[], estruturas: EstruturaLida[]) => ({
    notas,
    formato: 'collection.anki21',
    campos: CAMPOS,
    descartadas: 0,
    temMidia: true,
    baralhos: ['4000EW'],
    estruturas,
  })
  const servidor = () => {
    const urls: string[] = []
    apiFetchMock.mockImplementation(async (url: string) => {
      urls.push(url)
      if (url.endsWith('/notas')) return json({ novas: 1, atualizadas: 0, iguais: 0, descartadas: 0, porMotivo: {} })
      if (url.endsWith('/fechar'))
        return json({
          importId: 'imp',
          deckId: 'deck',
          resumo: { notas: 1, novas: 1, atualizadas: 0, iguais: 0, descartadas: 0, porMotivo: {} },
        })
      return json({ importId: 'imp', deckId: 'deck' })
    })
    return urls
  }

  beforeEach(() => {
    vi.clearAllMocks()
    const dados = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => dados.get(k) ?? null,
      setItem: (k: string, v: string) => void dados.set(k, v),
      removeItem: (k: string) => void dados.delete(k),
      clear: () => dados.clear(),
    })
  })

  it('sem o Mapeador (flag desligada): leitura de sempre, sem parada e sem campos novos na resposta', async () => {
    lerMock.mockResolvedValue(leitura([nota('a', 'b')], [estrutura()]))
    servidor()
    const r = await importarBaralhoAnki(arquivo, 'en', 'pt')
    expect(lerMock).toHaveBeenCalledTimes(1)
    expect(lerMock.mock.calls[0]).toHaveLength(2)
    expect(r).not.toHaveProperty('conferidoAgora')
  })

  it('confiança baixa: para ANTES do primeiro lote; cancelar não manda nada ao servidor', async () => {
    lerMock.mockResolvedValue(leitura([], [estrutura()]))
    const urls = servidor()
    const aoConferir = vi.fn().mockResolvedValue(null)
    await expect(importarBaralhoAnki(arquivo, 'en', 'pt', undefined, { aoConferir })).rejects.toBeInstanceOf(
      ImportacaoCancelada,
    )
    expect(aoConferir).toHaveBeenCalledWith([expect.objectContaining({ hash: HASH })])
    expect(urls).toEqual([])
  })

  it('confirmar: relê com o mapeamento escolhido, envia as notas e lembra o perfil só neste aparelho', async () => {
    const escolhido: PapelNaImportacao[] = ['nenhum', 'imagem', 'palavra', 'significado']
    lerMock
      .mockResolvedValueOnce(leitura([], [estrutura()]))
      .mockResolvedValueOnce(leitura([nota('abandon', 'deixar')], [estrutura({ precisaDeConferencia: false })]))
    const urls = servidor()
    const r = await importarBaralhoAnki(arquivo, 'en', 'pt', undefined, {
      aoConferir: async () => ({ [HASH]: escolhido }),
    })
    expect(lerMock).toHaveBeenCalledTimes(2)
    expect(lerMock.mock.calls[1][2]).toEqual({ perfis: {}, manuais: { [HASH]: escolhido } })
    expect(urls).toEqual(['/api/anki/imports', '/api/anki/imports/imp/notas', '/api/anki/imports/imp/fechar'])
    expect(r.conferidoAgora).toBe(true)
    expect(lerPerfis()).toEqual({ [HASH]: escolhido })
    expect(localStorage.getItem(CHAVE_DOS_PERFIS)).not.toMatch(/abandon|deixar/)
  })

  it('perfil já salvo: não para, e a resposta diz que reconheceu', async () => {
    const reconhecida = estrutura({
      precisaDeConferencia: false,
      palpites: { palavra: { indice: 2, confianca: 'media', origem: 'perfil' } },
    })
    lerMock.mockResolvedValue(leitura([nota('abandon', 'deixar')], [reconhecida]))
    servidor()
    const aoConferir = vi.fn()
    const r = await importarBaralhoAnki(arquivo, 'en', 'pt', undefined, { aoConferir })
    expect(aoConferir).not.toHaveBeenCalled()
    expect(r.reconhecidos).toEqual([{ hash: HASH, notetype: '4000 EW' }])
    expect(r.conferidoAgora).toBe(false)
  })
})
