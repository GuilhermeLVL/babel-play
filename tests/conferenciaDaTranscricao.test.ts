/**
 * QUANDO A PESSOA CONFERE A TRANSCRIÇÃO ANTES DA LEITURA (conversa-de-verdade, 5.4): no celular com o Whisper base
 * (o modelo que errou o português na auditoria e na bancada), fora do inglês. No computador, com outro modelo ou na
 * nuvem, a tradução é lida direto.
 */
import { describe, expect, it } from 'vitest'

import { WHISPER_MODELS } from '../src/gateway/sttRouter'
import { conferirAntesDeLer } from '../src/lib/captura/conferenciaDaTranscricao'

describe('conferirAntesDeLer', () => {
  const celular = { celular: true, modeloLocal: WHISPER_MODELS.base }

  it('celular + Whisper base + português: confere', () => {
    expect(conferirAntesDeLer({ ...celular, idiomaDaFala: 'pt' })).toBe(true)
    expect(conferirAntesDeLer({ ...celular, idiomaDaFala: 'pt-BR' })).toBe(true)
  })

  it('o inglês, que saiu certo, é lido direto', () => {
    expect(conferirAntesDeLer({ ...celular, idiomaDaFala: 'en' })).toBe(false)
  })

  it('computador, outro modelo ou nenhum modelo local: lê direto', () => {
    expect(conferirAntesDeLer({ ...celular, celular: false, idiomaDaFala: 'pt' })).toBe(false)
    expect(conferirAntesDeLer({ ...celular, modeloLocal: WHISPER_MODELS.small, idiomaDaFala: 'pt' })).toBe(false)
    expect(conferirAntesDeLer({ ...celular, modeloLocal: '', idiomaDaFala: 'pt' })).toBe(false)
  })

  it('a fala do reconhecedor do navegador (Web Speech) não passou pelo Whisper: lê direto', () => {
    expect(conferirAntesDeLer({ ...celular, idiomaDaFala: 'pt', motorDaFala: 'web-speech' })).toBe(false)
    expect(conferirAntesDeLer({ ...celular, idiomaDaFala: 'zh', motorDaFala: 'web-speech-local' })).toBe(false)
    expect(conferirAntesDeLer({ ...celular, idiomaDaFala: 'pt', motorDaFala: 'whisper-local' })).toBe(true)
  })
})
