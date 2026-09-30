// @vitest-environment jsdom
/**
 * "MODELO NO DISPOSITIVO" QUANDO A LEGENDA VEM DO RECONHECEDOR DO NAVEGADOR. O diálogo listava o
 * Whisper (com o tamanho do download) mesmo quando a transcrição é do navegador — nada nosso baixa
 * para transcrever. Com `transcricaoNoNavegador`, a linha do Whisper sai, uma linha diz quem
 * transcreve, e os tradutores (que baixam do mesmo jeito) continuam.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../src/gateway/modelManifest', async (original) => ({
  ...(await original<typeof import('../src/gateway/modelManifest')>()),
  modeloDisponivel: vi.fn(async () => ({ completo: false, motivo: 'sem-manifesto', bytesTotais: 0, bytesFaltando: 0 })),
}))

import ModeloNoDispositivo, { type ModeloDaCaptura } from '../src/components/views/captura/ModeloNoDispositivo'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

beforeAll(prepararDialogoNoJsdom)
afterEach(cleanup)

const MODELOS: ModeloDaCaptura[] = [
  { id: 'onnx-community/whisper-small', titulo: 'Transcrição (Whisper small)', mbEstimado: 209, transcricao: true },
  { id: 'Xenova/opus-mt-en-ROMANCE', titulo: 'Tradutor English → Português (opus-mt)', mbEstimado: 113 },
]

describe('ModeloNoDispositivo e o reconhecedor do navegador', () => {
  it('com o Whisper transcrevendo, ele aparece como sempre', () => {
    render(<ModeloNoDispositivo modelos={MODELOS} nuvem={false} aoFechar={() => {}} />)
    expect(screen.getByText('Transcrição (Whisper small)')).toBeTruthy()
    expect(screen.queryByTestId('transcricao-no-navegador')).toBeNull()
  })

  it('com o navegador transcrevendo, o Whisper sai e o tradutor fica', () => {
    render(<ModeloNoDispositivo modelos={MODELOS} nuvem={false} transcricaoNoNavegador aoFechar={() => {}} />)
    expect(screen.queryByText('Transcrição (Whisper small)')).toBeNull()
    expect(screen.getByTestId('transcricao-no-navegador').textContent).toMatch(/reconhecimento do navegador/)
    expect(screen.getByText('Tradutor English → Português (opus-mt)')).toBeTruthy()
  })
})
