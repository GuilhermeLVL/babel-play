/**
 * REGISTRO DE MOTORES — o consentimento passa a ser DERIVADO de `enviaDadosA`, não de uma lista à mão.
 *
 * O bug que isto fecha (auditoria de eficiência 2026-09-28, §3): a Web Speech do microfone manda o
 * áudio ao Google no Chrome — inclusive no perfil "Privado/Local" — e nunca passou pelo consentimento,
 * porque a lista fixa de `src/gateway/index.ts` só conhecia os motores que falam com o NOSSO servidor.
 * Os testes prendem duas coisas: (1) a lista derivada contém tudo que a lista de hoje pede, MAIS a
 * Web Speech; (2) todo adaptador que um perfil embutido usa tem entrada no registro — um motor novo
 * sem entrada seria um motor sem decisão de privacidade.
 */
import { describe, expect, it } from 'vitest'

import {
  adaptersQueExigemConsentimento,
  bindingExigeConsentimento,
  exigeConsentimento,
  motoresDaTarefa,
  motorPorId,
  REGISTRO_DE_MOTORES,
} from '../src/core/harness/registroDeMotores'
import { BUILTIN_PROFILES } from '../src/gateway/profiles'
import { MODEL_DOWNLOAD_MB, MOONSHINE_MODELS, MT_DOWNLOAD_MB, WHISPER_MODELS } from '../src/gateway/sttRouter'

/*
 * A lista à mão de `src/gateway/index.ts` foi APAGADA na integração do harness: o gateway usa
 * `bindingExigeConsentimento` direto (e `tests/nuvem-primeiro-e-consentimento.test.ts` cobra o
 * gateway). Aqui ficam as garantias que a cópia dava: todo adaptador que pedia consentimento antes
 * continua pedindo — nomeado, `credentialId` (BYOK) e `openai-compatible` com URL não local.
 */
describe('registro de motores — consentimento derivado', () => {
  it('quem pedia consentimento antes continua pedindo, E a Web Speech (o furo de privacidade)', () => {
    const derivada = adaptersQueExigemConsentimento()
    for (const id of ['server-llm-mt', 'groq-whisper', 'mymemory', 'openai-compatible'])
      expect(derivada.has(id), id).toBe(true)
    expect(derivada.has('web-speech')).toBe(true)
  })

  it('a Web Speech LOCAL (`processLocally`) não manda nada, mas o BINDING `web-speech` segue pedindo', () => {
    const local = motorPorId('web-speech-local')!
    expect(local.adapterId).toBe('web-speech')
    expect(local.enviaDadosA).toBeNull()
    expect(exigeConsentimento(local)).toBe(false)
    // O binding não sabe o modo: quem escolhe o local é a captura (`motorDoMicrofone.ts`).
    expect(bindingExigeConsentimento({ adapterId: 'web-speech' })).toBe(true)
  })

  it('a Web Speech LOCAL com TRILHA (áudio da aba) declara a entrada e também não manda nada', () => {
    const trilha = motorPorId('web-speech-local-trilha')!
    expect(trilha.adapterId).toBe('web-speech')
    expect(trilha.requer.trilhaDeAudio).toBe(true)
    expect(trilha.enviaDadosA).toBeNull()
    expect(exigeConsentimento(trilha)).toBe(false)
    // O microfone no aparelho não precisa de trilha.
    expect(motorPorId('web-speech-local')!.requer.trilhaDeAudio).toBeFalsy()
  })

  it('o que roda no aparelho NÃO pede consentimento', () => {
    const derivada = adaptersQueExigemConsentimento()
    for (const id of ['chrome-translator', 'opus-mt-local', 'whisper-local']) expect(derivada.has(id), id).toBe(false)
  })

  it('exigeConsentimento = sai do aparelho (inclui a nossa própria nuvem)', () => {
    expect(exigeConsentimento(motorPorId('web-speech')!)).toBe(true)
    expect(exigeConsentimento(motorPorId('groq-whisper')!)).toBe(true)
    expect(exigeConsentimento(motorPorId('server-llm-mt')!)).toBe(true)
    expect(exigeConsentimento(motorPorId('whisper-small')!)).toBe(false)
    expect(exigeConsentimento(motorPorId('moonshine-base')!)).toBe(false)
  })

  it('a Web Speech declara o Google como destino (modo nuvem do Chrome)', () => {
    const ws = motorPorId('web-speech')!
    expect(ws.enviaDadosA).toBe('google')
    expect(ws.runtime).toBe('nativo-navegador')
  })

  describe('bindingExigeConsentimento — equivalente à lista de hoje, + Web Speech', () => {
    it.each([
      [{ adapterId: 'server-llm-mt' }, true],
      [{ adapterId: 'groq-whisper' }, true],
      [{ adapterId: 'mymemory' }, true],
      [{ adapterId: 'web-speech' }, true],
      [{ adapterId: 'chrome-translator' }, false],
      [{ adapterId: 'opus-mt-local' }, false],
      [{ adapterId: 'whisper-local' }, false],
      // BYOK: qualquer binding com credencial vai ao proxy e sai do aparelho
      [{ adapterId: 'whisper-local', credentialId: 'c1' }, true],
      [{ adapterId: 'openai-compatible', credentialId: 'c1' }, true],
      // openai-compatible: local (Ollama) não pede; URL remota pede; sem URL = como hoje (não pede)
      [{ adapterId: 'openai-compatible', baseUrl: 'http://localhost:11434/v1' }, false],
      [{ adapterId: 'openai-compatible', baseUrl: 'http://127.0.0.1:1234/v1' }, false],
      [{ adapterId: 'openai-compatible', baseUrl: 'http://[::1]:1234/v1' }, false],
      [{ adapterId: 'openai-compatible', baseUrl: 'https://api.exemplo.com/v1' }, true],
      [{ adapterId: 'openai-compatible' }, false],
    ])('%j → %s', (binding, esperado) => {
      expect(bindingExigeConsentimento(binding)).toBe(esperado)
    })

    it('adaptador desconhecido FALHA FECHADO (pede consentimento)', () => {
      expect(bindingExigeConsentimento({ adapterId: 'motor-novo-sem-registro' })).toBe(true)
    })
  })
})

describe('registro de motores — fidelidade ao código de hoje', () => {
  it('ids únicos', () => {
    const ids = REGISTRO_DE_MOTORES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('todo adaptador dos perfis embutidos tem entrada no registro, na tarefa certa', () => {
    for (const p of BUILTIN_PROFILES) {
      for (const [tarefa, cadeia] of Object.entries(p.bindings)) {
        for (const b of cadeia ?? []) {
          const doAdapter = REGISTRO_DE_MOTORES.filter((m) => m.adapterId === b.adapterId)
          expect(doAdapter.length, `${p.id}/${tarefa}/${b.adapterId}`).toBeGreaterThan(0)
          for (const m of doAdapter) expect(m.tarefa).toBe(tarefa)
        }
      }
    }
  })

  it('tamanhos batem com a tabela medida do sttRouter (MB decimais do Hub)', () => {
    const pares: [string, string][] = [
      ['whisper-tiny', WHISPER_MODELS.tiny],
      ['whisper-base', WHISPER_MODELS.base],
      ['whisper-small', WHISPER_MODELS.small],
      ['moonshine-base', MOONSHINE_MODELS.base],
      ['moonshine-tiny', MOONSHINE_MODELS.tiny],
    ]
    for (const [id, modelo] of pares) {
      const m = motorPorId(id)!
      expect(m.modelo).toBe(modelo)
      expect(m.bytes! / 1_000_000, id).toBe(MODEL_DOWNLOAD_MB[modelo])
    }
    expect(motorPorId('opus-mt-local')!.bytes! / 1_000_000).toBe(MT_DOWNLOAD_MB)
  })

  it('Moonshine é só inglês; Whisper é multilíngue; o small exige WebGPU', () => {
    expect(motorPorId('moonshine-base')!.idiomas).toEqual(['en'])
    expect(motorPorId('moonshine-tiny')!.idiomas).toEqual(['en'])
    expect(motorPorId('whisper-base')!.idiomas).toBe('todos')
    expect(motorPorId('whisper-small')!.requer.webgpu).toBe(true)
    expect(motorPorId('whisper-base')!.requer.webgpu).toBeFalsy()
  })

  it('nuvem própria é "nos" e custa cota; MyMemory é terceiro', () => {
    for (const id of ['groq-whisper', 'server-llm-mt']) {
      expect(motorPorId(id)!.enviaDadosA, id).toBe('nos')
      expect(motorPorId(id)!.custo, id).toBe('cota')
    }
    expect(motorPorId('mymemory')!.enviaDadosA).toBe('terceiro')
  })

  it('motoresDaTarefa filtra por tarefa', () => {
    const mt = motoresDaTarefa('mt').map((m) => m.id)
    expect(mt).toEqual(expect.arrayContaining(['chrome-translator', 'opus-mt-local', 'server-llm-mt', 'mymemory']))
    expect(motoresDaTarefa('stt').every((m) => m.tarefa === 'stt')).toBe(true)
  })

  it('motorPorId devolve undefined para id desconhecido', () => {
    expect(motorPorId('nao-existe')).toBeUndefined()
  })
})
