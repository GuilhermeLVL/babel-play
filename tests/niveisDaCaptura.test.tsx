// @vitest-environment jsdom
/**
 * O NÍVEL DE SERVIÇO NA TELA DE CAPTURA (`src/components/views/captura/niveis/`): o seletor "No
 * aparelho / Precisão / Ao vivo" por capacidade do plano, o cadeado e a folha dele, o perfil protegido,
 * o medidor das horas de nuvem, a nota das horas esgotadas e a marca, que segue o selo da fala.
 *
 * O protótipo é a especificação da MARCAÇÃO (`planos4.js:205-437`); o dado é o do app.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const avisos = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('../src/components/Toast', () => ({
  toast: { info: avisos.info, ok: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../src/lib/polimento/sentidos', () => ({ sentir: vi.fn(), vibrar: vi.fn() }))

import {
  type AmbienteDosNiveis,
  type NiveisDaCaptura,
  useNiveisDaCaptura,
} from '../src/components/views/captura/niveis/useNiveisDaCaptura'
import type { PlanoPago } from '../src/core/planos'
import { decidirRota, type PedidoDeRota } from '../src/core/rota/politicaDeRota'
import type { SttQuality } from '../src/gateway/sttRouter'
import { type SeloDaFala, seloDaFala } from '../src/lib/captura/seloDaFala'
import type { UsoDoMes } from '../src/lib/uso'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

beforeAll(prepararDialogoNoJsdom)
beforeEach(() => avisos.info.mockClear())
afterEach(cleanup)

const pedido = (nuvem: boolean): PedidoDeRota => ({
  tarefa: 'stt-final',
  fonte: 'sistema',
  idioma: 'pt',
  aparelho: {
    tipo: 'desktop-sem-gpu',
    leve: false,
    travando: false,
    gpuProvada: false,
    economiaDeDados: false,
    smallNaGpu: false,
    whisperNaGpu: false,
    shaderF16: false,
    navegador: { fala: false, falaNoAparelho: null, bipaAoReligar: false, tradutor: false },
    modelos: { opusMt: true, bergamot: false, llmLocal: false },
  },
  plano: {
    nuvemPorTrechos: nuvem,
    precisaoPorPadrao: nuvem,
    nuvemAoVivo: false,
    traducaoNaNuvem: nuvem,
    nuance: false,
    vozNeural: false,
    restante: { trechosNoMesS: null, trechosNoDiaS: null, aoVivoNoMesS: null, aoVivoNoDiaS: null },
  },
  estado: {
    consentimentos: { nuvem: true, navegador: false },
    perfilPrivado: false,
    perfilProtegido: false,
    responsavelAutorizou: false,
    nuvemDisponivel: true,
    nuvemPausada: false,
    semRede: false,
    edicaoEstatica: false,
    nuvemDoSite: false,
    preferencia: { qualidade: 'auto', microfone: 'modelo' },
  },
})
const PREVISTO_NO_APARELHO = decidirRota(pedido(false))
const PREVISTO_NA_NUVEM = decidirRota(pedido(true))

const usoDe = (usado: number, teto: number): UsoDoMes => ({
  plano: 'premium',
  janela: '2026-10',
  chamadas: { usado: 0, teto: 0 },
  segundosDeAudio: { usado, teto },
  porNivel: {
    trechos: { usado, teto, restante: Math.max(0, teto - usado) },
    aovivo: { usado: 0, teto: 0, restante: 0 },
  },
  tokensDeLlm: { usado: 0, teto: 0 },
})

const GRATIS = { managedCloudStt: false, sttAoVivo: false }
const COM_NUVEM = { managedCloudStt: true, sttAoVivo: false }
const TODOS_A_VENDA: PlanoPago[] = ['essencial', 'premium', 'aovivo']

/** A tela como `CapturaDoPrototipo` a monta: a marca do topo, a fileira, a nota e as folhas. */
function Tela({
  selo = seloDaFala(PREVISTO_NO_APARELHO),
  qualidade = 'auto',
  ambiente,
  aoEscolherQualidade = () => {},
  aoVerPlanos,
  noQuest = false,
}: {
  selo?: SeloDaFala | null
  qualidade?: SttQuality
  ambiente: Partial<AmbienteDosNiveis>
  aoEscolherQualidade?: (q: SttQuality) => void
  aoVerPlanos?: NiveisDaCaptura['aoVerPlanos']
  noQuest?: boolean
}) {
  const pecas = useNiveisDaCaptura(
    {
      selo,
      qualidade,
      aoEscolherQualidade,
      tipoDoAparelho: 'desktop-sem-gpu',
      aoVerPlanos,
      ambiente: {
        protegido: false,
        semPlanos: false,
        aVenda: TODOS_A_VENDA,
        consentiuNuvem: true,
        carregarUso: async () => null,
        ...ambiente,
      },
    },
    { gravando: false, noQuest, modelo: 'Modelo local · 209 MB', aoAbrirModelo: () => {} },
  )
  return (
    <div>
      {pecas.marcaDoTopo}
      {pecas.linha}
      {pecas.nota}
      {pecas.folhas}
    </div>
  )
}

const nivel = (nome: string) => screen.getByRole('radio', { name: new RegExp(`^${nome}`) })
const temCadeado = (el: HTMLElement) => el.hasAttribute('data-pl-tranca') && !!el.querySelector('.pl-cad')

describe('o seletor de nível, por capacidade do plano', () => {
  it('no Grátis: "No aparelho" livre, "Precisão" e "Ao vivo" com cadeado e o plano que os abre', () => {
    render(<Tela ambiente={{ capacidades: GRATIS }} />)
    const grupo = screen.getByRole('radiogroup', { name: 'Nível de serviço' })
    expect(within(grupo).getAllByRole('radio')).toHaveLength(3)
    expect(temCadeado(nivel('No aparelho'))).toBe(false)
    expect(temCadeado(nivel('Precisão'))).toBe(true)
    expect(temCadeado(nivel('Ao vivo'))).toBe(true)
    expect(nivel('Precisão').title).toContain('Faz parte do Essencial.')
    expect(nivel('Ao vivo').title).toContain('Faz parte do Ao Vivo.')
  })

  it('com nuvem no plano: "Precisão" abre, e "Ao vivo" continua com cadeado', () => {
    render(<Tela ambiente={{ capacidades: COM_NUVEM }} />)
    expect(temCadeado(nivel('Precisão'))).toBe(false)
    expect(temCadeado(nivel('Ao vivo'))).toBe(true)
  })

  it('o "Ao vivo" tem cadeado até no plano que o declara (o transporte não existe), sem prometer plano', () => {
    render(<Tela ambiente={{ capacidades: { managedCloudStt: true, sttAoVivo: true } }} />)
    expect(temCadeado(nivel('Ao vivo'))).toBe(true)
    expect(nivel('Ao vivo').title).toContain('Ainda não está disponível.')
    expect(nivel('Ao vivo').title).not.toContain('Faz parte')
  })

  it('escolher "Precisão" grava a preferência de nuvem; "No aparelho", a do modelo local', () => {
    const gravar = vi.fn()
    render(<Tela ambiente={{ capacidades: COM_NUVEM }} aoEscolherQualidade={gravar} />)
    fireEvent.click(nivel('Precisão'))
    expect(gravar).toHaveBeenLastCalledWith('cloud')
    fireEvent.click(nivel('No aparelho'))
    expect(gravar).toHaveBeenLastCalledWith('accurate')
    expect(screen.queryByTestId('folha-do-cadeado')).toBeNull()
  })

  it('sem o aceite da nuvem, escolher "Precisão" diz o que falta em vez de prometer a nuvem', () => {
    render(<Tela ambiente={{ capacidades: COM_NUVEM, consentiuNuvem: false }} />)
    fireEvent.click(nivel('Precisão'))
    expect(avisos.info).toHaveBeenLastCalledWith('Você ainda não autorizou o envio para fora do aparelho.')
  })
})

describe('o cadeado', () => {
  it('tocar no nível com cadeado NÃO grava nada e abre a folha: o que é, quando vale, quem tem, a porta', () => {
    const gravar = vi.fn()
    const verPlanos = vi.fn()
    render(<Tela ambiente={{ capacidades: GRATIS }} aoEscolherQualidade={gravar} aoVerPlanos={verPlanos} />)
    fireEvent.click(nivel('Precisão'))
    expect(gravar).not.toHaveBeenCalled()

    const folha = within(screen.getByTestId('folha-do-cadeado'))
    expect(folha.getByRole('heading', { name: 'A Precisão começa no plano Essencial' })).toBeTruthy()
    expect(folha.getByText('O que é.')).toBeTruthy()
    expect(folha.getByText('Quando vale a pena.')).toBeTruthy()
    expect(folha.getByText(/Neste computador vale quase sempre/)).toBeTruthy()
    expect(folha.getByText(/No Essencial são 5 h por mês\. No Premium, 20 h\./)).toBeTruthy()

    fireEvent.click(folha.getByRole('button', { name: /^Ver o Essencial · R\$ 9,90/ }))
    expect(verPlanos).toHaveBeenCalledWith('essencial')
    expect(screen.queryByTestId('folha-do-cadeado')).toBeNull()
  })

  it('a porta só nomeia um plano que está à venda', () => {
    const verPlanos = vi.fn()
    render(<Tela ambiente={{ capacidades: GRATIS, aVenda: ['premium'] }} aoVerPlanos={verPlanos} />)
    fireEvent.click(nivel('Precisão'))
    expect(screen.getByRole('heading', { name: 'A Precisão começa no plano Premium' })).toBeTruthy()

    cleanup()
    render(<Tela ambiente={{ capacidades: COM_NUVEM, aVenda: ['premium'] }} aoVerPlanos={verPlanos} />)
    fireEvent.click(nivel('Ao vivo'))
    const folha = within(screen.getByTestId('folha-do-cadeado'))
    expect(folha.getByText(/Só o plano Ao Vivo tem: 10 h por mês\. Ele ainda não está à venda\./)).toBeTruthy()
    fireEvent.click(folha.getByRole('button', { name: 'Ver os planos' }))
    expect(verPlanos).toHaveBeenLastCalledWith(null)
  })

  it('"Ao vivo" no plano que já o inclui: a folha não vende o que a pessoa já tem', () => {
    const verPlanos = vi.fn()
    render(<Tela ambiente={{ capacidades: { managedCloudStt: true, sttAoVivo: true } }} aoVerPlanos={verPlanos} />)
    fireEvent.click(nivel('Ao vivo'))
    const folha = within(screen.getByTestId('folha-do-cadeado'))
    expect(folha.getByRole('heading', { name: 'O nível Ao vivo ainda não está disponível' })).toBeTruthy()
    expect(folha.queryByRole('button', { name: /^Ver o/ })).toBeNull()
  })

  it('da folha do cadeado dá para ir a "Como isto funciona"', () => {
    render(<Tela ambiente={{ capacidades: GRATIS }} />)
    fireEvent.click(nivel('Ao vivo'))
    fireEvent.click(screen.getByRole('button', { name: 'Como isto funciona' }))
    expect(screen.queryByTestId('folha-do-cadeado')).toBeNull()
    expect(screen.getByTestId('como-isto-funciona')).toBeTruthy()
  })
})

describe('o perfil protegido', () => {
  it('os níveis que enviam áudio não são oferecidos, nem a porta dos planos', () => {
    const verPlanos = vi.fn()
    render(
      <Tela
        ambiente={{ capacidades: { managedCloudStt: true, sttAoVivo: true }, protegido: true }}
        aoVerPlanos={verPlanos}
      />,
    )
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(1)
    expect(radios[0].textContent).toBe('No aparelho')
    expect(screen.queryByText('Precisão')).toBeNull()
    expect(screen.queryByText('Ao vivo')).toBeNull()

    fireEvent.click(screen.getAllByTestId('marca-de-onde')[0])
    const como = within(screen.getByTestId('como-isto-funciona'))
    expect(como.getAllByRole('radio')).toHaveLength(1)
    expect(como.queryByRole('button', { name: 'Ver os planos' })).toBeNull()
  })
})

describe('o medidor das horas de nuvem', () => {
  it('some para quem não tem nuvem no plano (e nem pergunta ao servidor)', async () => {
    const carregarUso = vi.fn(async () => usoDe(0, 0))
    render(<Tela ambiente={{ capacidades: GRATIS, carregarUso }} />)
    await Promise.resolve()
    expect(carregarUso).not.toHaveBeenCalled()
    expect(screen.queryByTestId('medidor-de-nuvem')).toBeNull()
    expect(screen.getByTestId('fileira-do-nivel').querySelector('.pl-vaga')?.childElementCount).toBe(0)
  })

  it('com horas: "restam X de Y" e a barrinha com o que sobra', async () => {
    render(<Tela ambiente={{ capacidades: COM_NUVEM, carregarUso: async () => usoDe(23_400, 72_000) }} />)
    const chip = await screen.findByTestId('medidor-de-nuvem')
    expect(chip.textContent).toBe('Nuvem: restam 13 h 30 de 20 h')
    expect(chip.dataset.tom).toBe('')
    expect(chip.querySelector<HTMLElement>('.pl-mini-barra i')?.style.width).toBe('67%')
    expect(screen.queryByTestId('nota-das-horas')).toBeNull()
  })

  it('perto do fim: o tom muda', async () => {
    render(<Tela ambiente={{ capacidades: COM_NUVEM, carregarUso: async () => usoDe(67_800, 72_000) }} />)
    expect((await screen.findByTestId('medidor-de-nuvem')).dataset.tom).toBe('pouco')
  })

  it('o medidor abre "Como isto funciona", com a nuvem do mês', async () => {
    render(<Tela ambiente={{ capacidades: COM_NUVEM, carregarUso: async () => usoDe(23_400, 72_000) }} />)
    fireEvent.click(await screen.findByTestId('medidor-de-nuvem'))
    const como = within(screen.getByTestId('como-isto-funciona'))
    expect(como.getByText('Nuvem deste mês')).toBeTruthy()
    expect(como.getByText('6 h 30 de 20 h')).toBeTruthy()
    expect(como.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('33')
  })

  it('servidor sem resposta: nenhum número inventado', async () => {
    const carregarUso = vi.fn(async () => null)
    render(<Tela ambiente={{ capacidades: COM_NUVEM, carregarUso }} />)
    await waitFor(() => expect(carregarUso).toHaveBeenCalled())
    expect(screen.queryByTestId('medidor-de-nuvem')).toBeNull()
  })

  it('no Quest a captura fica só com o seletor e a marca', async () => {
    const carregarUso = vi.fn(async () => usoDe(18_000, 18_000))
    render(<Tela noQuest ambiente={{ capacidades: COM_NUVEM, carregarUso }} />)
    await waitFor(() => expect(carregarUso).toHaveBeenCalled())
    expect(screen.getByRole('radiogroup')).toBeTruthy()
    expect(screen.getAllByTestId('marca-de-onde').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('medidor-de-nuvem')).toBeNull()
    expect(screen.queryByTestId('nota-das-horas')).toBeNull()
  })
})

describe('as horas acabaram', () => {
  const esgotado = async () => usoDe(18_000, 18_000)

  it('nada bloqueia: a nota diz quanto era, que a legenda segue no aparelho e quando as horas voltam', async () => {
    const verPlanos = vi.fn()
    render(<Tela ambiente={{ capacidades: COM_NUVEM, carregarUso: esgotado }} aoVerPlanos={verPlanos} />)
    const nota = await screen.findByTestId('nota-das-horas')
    expect(nota.textContent).toContain('As 5 h de nuvem deste mês acabaram.')
    expect(nota.textContent).toContain('A legenda continua no aparelho, sem limite. As horas voltam no dia 1º.')
    const chip = screen.getByTestId('medidor-de-nuvem')
    expect(chip.textContent).toBe('Nuvem do mês acabou · no aparelho')
    expect(chip.dataset.tom).toBe('fim')
    // O seletor continua inteiro e "No aparelho" continua a um toque.
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(nivel('No aparelho').hasAttribute('disabled')).toBe(false)
    // A marca fica em alerta, com o texto do selo.
    expect(screen.getAllByTestId('marca-de-onde')[0].dataset.tom).toBe('alerta')

    fireEvent.click(within(nota).getByRole('button', { name: 'Ver o Premium · 20 h' }))
    expect(verPlanos).toHaveBeenCalledWith('premium')
  })

  it('escolher "Precisão" sem horas avisa e não grava', async () => {
    const gravar = vi.fn()
    render(<Tela ambiente={{ capacidades: COM_NUVEM, carregarUso: esgotado }} aoEscolherQualidade={gravar} />)
    await screen.findByTestId('nota-das-horas')
    fireEvent.click(nivel('Precisão'))
    expect(gravar).not.toHaveBeenCalled()
    expect(avisos.info).toHaveBeenLastCalledWith(
      'As horas do nível Precisão deste mês acabaram. Elas voltam no dia 1º.',
    )
  })

  it('sem plano com mais horas à venda, a nota é só a informação', async () => {
    render(
      <Tela
        ambiente={{ capacidades: COM_NUVEM, carregarUso: async () => usoDe(72_000, 72_000) }}
        aoVerPlanos={() => {}}
      />,
    )
    const nota = await screen.findByTestId('nota-das-horas')
    expect(nota.textContent).toContain('As 20 h de nuvem deste mês acabaram.')
    expect(within(nota).queryByRole('button')).toBeNull()
  })

  it('perfil protegido não recebe a porta do plano', async () => {
    render(
      <Tela ambiente={{ capacidades: COM_NUVEM, protegido: true, carregarUso: esgotado }} aoVerPlanos={() => {}} />,
    )
    const nota = await screen.findByTestId('nota-das-horas')
    expect(within(nota).queryByRole('button')).toBeNull()
  })
})

describe('a marca segue o selo da fala', () => {
  const marcas = () => screen.getAllByTestId('marca-de-onde')

  it('antes da primeira fala diz o que VAI acontecer, com o motivo da política no title', () => {
    render(<Tela ambiente={{ capacidades: GRATIS }} selo={seloDaFala(PREVISTO_NO_APARELHO)} />)
    // Duas cópias, como no protótipo: a do topo (largo) e a da fileira (estreito). O CSS mostra uma.
    expect(marcas().map((m) => m.className)).toEqual(['pl-onde pl-so-largo', 'pl-onde pl-so-estreito'])
    for (const m of marcas()) {
      expect(m.textContent).toBe('Vai rodar no aparelho · seu áudio não vai sair daqui')
      expect(m.querySelector('b')?.textContent).toBe('Vai rodar no aparelho')
      expect(m.dataset.tom).toBe('')
      expect(m.title).toBe('O seu plano não inclui a nuvem para isto.')
    }
    expect(nivel('No aparelho').getAttribute('aria-checked')).toBe('true')
  })

  it('com a nuvem prevista: a marca, o tom e o nível marcado são os da nuvem', () => {
    render(<Tela ambiente={{ capacidades: COM_NUVEM }} selo={seloDaFala(PREVISTO_NA_NUVEM)} />)
    expect(marcas()[0].textContent).toBe('Vai pela Nuvem do Babel · o áudio vai para o nosso servidor')
    expect(marcas()[0].dataset.tom).toBe('nuvem')
    expect(nivel('Precisão').getAttribute('aria-checked')).toBe('true')
    expect(nivel('No aparelho').getAttribute('aria-checked')).toBe('false')
  })

  it('REGRA DE OURO: previsto o aparelho, a fala saiu → a tela nunca diz "No aparelho"', () => {
    render(<Tela ambiente={{ capacidades: COM_NUVEM }} selo={seloDaFala(PREVISTO_NO_APARELHO, 'groq-whisper')} />)
    for (const m of marcas()) {
      expect(m.textContent).toBe('Nuvem do Babel · o áudio vai para o nosso servidor')
      expect(m.textContent).not.toContain('No aparelho')
      expect(m.dataset.tom).toBe('alerta') // a rota mudou sozinha
    }
    expect(nivel('No aparelho').getAttribute('aria-checked')).toBe('false')
    expect(nivel('Precisão').getAttribute('aria-checked')).toBe('true')
  })

  it('a marca TROCA quando o motor da última fala muda', () => {
    const { rerender } = render(
      <Tela ambiente={{ capacidades: COM_NUVEM }} selo={seloDaFala(PREVISTO_NA_NUVEM, 'groq-whisper')} />,
    )
    expect(marcas()[0].textContent).toBe('Nuvem do Babel · o áudio vai para o nosso servidor')
    rerender(<Tela ambiente={{ capacidades: COM_NUVEM }} selo={seloDaFala(PREVISTO_NA_NUVEM, 'whisper-local')} />)
    // A nuvem foi tentada antes: a etiqueta diz onde foi transcrita, e o detalhe não promete que o áudio ficou.
    expect(marcas()[0].textContent).toBe('No aparelho · transcrita aqui, depois de tentar a nuvem')
    expect(marcas()[0].dataset.tom).toBe('alerta')
  })

  it('sem selo (nada a afirmar com segurança) não há marca, e nenhum nível aparece marcado', () => {
    render(<Tela ambiente={{ capacidades: COM_NUVEM }} selo={null} />)
    expect(screen.queryByTestId('marca-de-onde')).toBeNull()
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true)
  })
})

describe('a folha "Como isto funciona"', () => {
  const abrir = () => {
    fireEvent.click(screen.getAllByTestId('marca-de-onde')[0])
    return within(screen.getByTestId('como-isto-funciona'))
  }

  it('o nível de agora e o porquê vêm do selo e do motivo da política', () => {
    render(<Tela ambiente={{ capacidades: COM_NUVEM }} selo={seloDaFala(PREVISTO_NA_NUVEM, 'groq-whisper')} />)
    const como = abrir()
    const agora = within(como.getByTestId('nivel-de-agora'))
    expect(agora.getByText('Agora: Nuvem do Babel')).toBeTruthy()
    expect(agora.getByText('A nuvem está disponível na sua conta e erra menos.')).toBeTruthy()
  })

  it('antes da primeira fala a folha não afirma "agora"', () => {
    render(<Tela ambiente={{ capacidades: GRATIS }} />)
    const agora = abrir().getByTestId('nivel-de-agora')
    expect(agora.textContent).toContain('Vai rodar no aparelho')
    expect(agora.textContent).not.toContain('Agora:')
  })

  it('os três níveis, com o selo de cada um, e as seções da folha', () => {
    render(<Tela ambiente={{ capacidades: GRATIS }} />)
    const como = abrir()
    const selos = como.getAllByRole('radio').map((r) => r.querySelector('.pl-selo')?.textContent)
    expect(selos).toEqual(['grátis', 'Essencial', 'Ao Vivo'])
    for (const secao of ['Os três níveis', 'Como o app escolhe sozinho', 'O que é enviado'])
      expect(como.getByText(secao)).toBeTruthy()
    // Sem nuvem no plano não há "Nuvem deste mês".
    expect(como.queryByText('Nuvem deste mês')).toBeNull()
  })

  it('SÓ AFIRMA O QUE O CÓDIGO FAZ: nada de "não fica guardado"', () => {
    render(<Tela ambiente={{ capacidades: COM_NUVEM }} selo={seloDaFala(PREVISTO_NA_NUVEM)} />)
    const texto = screen.getByTestId('fileira-do-nivel').parentElement!
    abrir()
    expect(texto.textContent).toContain('O áudio vai para o nosso servidor.')
    expect(texto.textContent).not.toMatch(/nada fica guardado|não é guardado|ordem de não guardar/i)
  })

  it('o nível com cadeado fecha esta folha e abre a dele', () => {
    render(<Tela ambiente={{ capacidades: GRATIS }} />)
    fireEvent.click(abrir().getByRole('radio', { name: /Precisão/ }))
    expect(screen.queryByTestId('como-isto-funciona')).toBeNull()
    expect(screen.getByTestId('folha-do-cadeado')).toBeTruthy()
  })

  it('"Voltar à escolha automática" grava `auto`; já no automático, o botão fica desligado', () => {
    const gravar = vi.fn()
    const { rerender } = render(
      <Tela ambiente={{ capacidades: COM_NUVEM }} qualidade="cloud" aoEscolherQualidade={gravar} />,
    )
    fireEvent.click(abrir().getByRole('button', { name: 'Voltar à escolha automática' }))
    expect(gravar).toHaveBeenCalledWith('auto')
    rerender(<Tela ambiente={{ capacidades: COM_NUVEM }} qualidade="auto" aoEscolherQualidade={gravar} />)
    const ligado = screen.getByRole('button', { name: 'Escolha automática ligada' })
    expect(ligado.hasAttribute('disabled')).toBe(true)
  })
})
