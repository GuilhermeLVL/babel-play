// @vitest-environment jsdom
/**
 * O SELO DA FALA NA TELA (etapa 5 de `planos-v3-e-rota-inteligente`): a linha "Nesta captura" do
 * diálogo "Modelo no dispositivo" deixa de mostrar o rótulo técnico da rota e passa a dizer ONDE a
 * fala é processada. O rótulo técnico fica no `title`, depois da frase clara. E o selo TROCA quando o
 * motor que atendeu a última fala muda.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../src/gateway/modelManifest', async (original) => ({
  ...(await original<typeof import('../src/gateway/modelManifest')>()),
  modeloDisponivel: vi.fn(async () => ({ completo: false, motivo: 'sem-manifesto', bytesTotais: 0, bytesFaltando: 0 })),
}))

import ModeloNoDispositivo, { type ModeloDaCaptura } from '../src/components/views/captura/ModeloNoDispositivo'
import { decidirRota, type PedidoDeRota } from '../src/core/rota/politicaDeRota'
import { motorDaUltimaFala, seloDaFala } from '../src/lib/captura/seloDaFala'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

beforeAll(prepararDialogoNoJsdom)
afterEach(cleanup)

const MODELOS: ModeloDaCaptura[] = [
  { id: 'onnx-community/whisper-base', titulo: 'Transcrição (Whisper base)', mbEstimado: 209, transcricao: true },
]
const ROTULO_TECNICO = 'nuvem (large-v3-turbo) · reserva local'

/** Premium com a nuvem autorizada, ouvindo português: a política prevê a nuvem do Babel. */
const pedido: PedidoDeRota = {
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
    nuvemPorTrechos: true,
    precisaoPorPadrao: true,
    nuvemAoVivo: false,
    traducaoNaNuvem: true,
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
}
const previsto = decidirRota(pedido)

type Fala = { source: 'system' | 'mic'; engine?: string; isPartial?: boolean }

/** O diálogo como a captura o monta: o selo sai do previsto e das falas que estão na tela. */
function Dialogo({ falas }: { falas: Fala[] }) {
  const motor = motorDaUltimaFala(falas, { sistemaNoNavegador: false, micNoNavegador: false })
  return (
    <ModeloNoDispositivo
      modelos={MODELOS}
      rota={ROTULO_TECNICO}
      selo={seloDaFala(previsto, motor)}
      nuvem={false}
      aoFechar={() => {}}
    />
  )
}

const selo = () => screen.getByTestId('selo-da-fala')

describe('o selo da fala no diálogo "Modelo no dispositivo"', () => {
  it('antes da primeira fala, diz o previsto sem afirmar; o rótulo técnico fica só no title', () => {
    render(<Dialogo falas={[]} />)
    expect(selo().textContent).toContain('Vai pela Nuvem do Babel · o áudio vai para o nosso servidor')
    expect(selo().textContent).not.toContain('large-v3-turbo')
    const title = selo().getAttribute('title') ?? ''
    expect(title).toContain(ROTULO_TECNICO)
    expect(title.indexOf('Vai pela Nuvem do Babel')).toBeLessThan(title.indexOf(ROTULO_TECNICO))
  })

  it('o selo TROCA quando o motor da última fala muda', () => {
    const { rerender } = render(<Dialogo falas={[]} />)

    rerender(<Dialogo falas={[{ source: 'system', engine: 'groq-whisper' }]} />)
    expect(selo().textContent).toContain('Nuvem do Babel · o áudio vai para o nosso servidor')
    expect(selo().textContent).not.toContain('Vai pela')

    // A nuvem caiu e o modelo local atendeu a fala seguinte.
    rerender(
      <Dialogo
        falas={[
          { source: 'system', engine: 'groq-whisper' },
          { source: 'system', engine: 'whisper-local' },
        ]}
      />,
    )
    expect(selo().textContent).toContain('No aparelho · transcrita aqui, depois de tentar a nuvem')
    expect(selo().textContent).toContain('Mudou: a nuvem não respondeu nesta fala.')
    expect(selo().textContent).not.toContain('não sai daqui')

    // E voltou: a última fala é que vale, e o parcial em curso não conta.
    rerender(
      <Dialogo
        falas={[
          { source: 'system', engine: 'whisper-local' },
          { source: 'system', engine: 'groq-whisper' },
          { source: 'system', isPartial: true },
        ]}
      />,
    )
    expect(selo().textContent).toContain('Nuvem do Babel · o áudio vai para o nosso servidor')
  })

  it('o leitor de tela lê a frase clara e o motivo, nunca o rótulo técnico', () => {
    render(<Dialogo falas={[{ source: 'system', engine: 'groq-whisper' }]} />)
    expect(selo().textContent).toContain('A nuvem está disponível na sua conta e erra menos.')
    expect(selo().textContent).not.toContain(ROTULO_TECNICO)
    expect(selo().hasAttribute('aria-label')).toBe(false) // o texto do elemento já é a frase clara
  })

  it('sem selo (nada previsto, nenhuma fala), a linha segue com o rótulo técnico, como antes', () => {
    render(<ModeloNoDispositivo modelos={MODELOS} rota={ROTULO_TECNICO} nuvem={false} aoFechar={() => {}} />)
    expect(screen.getByText(ROTULO_TECNICO)).toBeTruthy()
    expect(screen.queryByTestId('selo-da-fala')).toBeNull()
  })

  it('sem rótulo técnico, mas com uma fala atendida, o selo aparece (microfone só pelo navegador)', () => {
    render(
      <ModeloNoDispositivo modelos={MODELOS} selo={seloDaFala(null, 'web-speech')} nuvem={false} aoFechar={() => {}} />,
    )
    expect(selo().textContent).toContain('Pelo navegador · o áudio vai para o serviço de fala do navegador')
  })
})
