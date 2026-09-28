// @vitest-environment jsdom
/**
 * A ESCOLHA "RÁPIDO" OU "PRIVADO" DO MICROFONE, guardada nas preferências (decisão do dono, opção b).
 *
 * "Rápido" grava o consentimento PRÓPRIO do reconhecimento do navegador (o áudio vai ao Google,
 * à Microsoft ou à Apple), com data, separado do "Usar IA de nuvem" (os nossos servidores de IA): um
 * não vale pelo outro. "Privado" registra a recusa, também com data, e marca que a pessoa respondeu —
 * é isso que impede a pergunta de voltar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const patchUiSettings = vi.fn()
vi.mock('../src/data/api', () => ({
  patchUiSettings: (...a: unknown[]) => patchUiSettings(...a),
  fetchSettings: vi.fn(async () => null),
}))

import {
  consentiuNuvem,
  consentiuReconhecimentoDoNavegador,
  escolhaDoMicGuardada,
  guardarEscolhaDoMic,
} from '../src/lib/consentimentoDeNuvem'
import { _reiniciarPreferencias, lerPreferencias, mudarConsentimento, PADRAO } from '../src/lib/preferencias'

beforeEach(() => {
  localStorage.clear()
  _reiniciarPreferencias()
  patchUiSettings.mockReset()
  patchUiSettings.mockResolvedValue({ id: 'x' })
})

describe('escolha do microfone nas preferências', () => {
  it('de fábrica: sem consentimento do navegador e sem resposta → a pergunta aparece', () => {
    expect(PADRAO.consentimentos.reconhecimentoDoNavegador).toBe(false)
    expect(escolhaDoMicGuardada()).toBeNull()
  })

  it('"Rápido" grava o consentimento específico, com data, e NÃO liga a IA de nuvem', async () => {
    expect(await guardarEscolhaDoMic('rapido')).toBe(true)
    expect(consentiuReconhecimentoDoNavegador()).toBe(true)
    expect(consentiuNuvem()).toBe(false)
    expect(escolhaDoMicGuardada()).toBe('rapido')
    expect(lerPreferencias().registroDeConsentimentos.at(-1)).toMatchObject({
      chave: 'reconhecimentoDoNavegador',
      valor: true,
    })
  })

  it('"Privado" registra a recusa e não pergunta de novo', async () => {
    await guardarEscolhaDoMic('privado')
    expect(consentiuReconhecimentoDoNavegador()).toBe(false)
    expect(escolhaDoMicGuardada()).toBe('privado')
    expect(lerPreferencias().registroDeConsentimentos.at(-1)).toMatchObject({
      chave: 'reconhecimentoDoNavegador',
      valor: false,
    })
  })

  it('trocar depois (Rápido → Privado) retira o consentimento', async () => {
    await guardarEscolhaDoMic('rapido')
    await guardarEscolhaDoMic('privado')
    expect(consentiuReconhecimentoDoNavegador()).toBe(false)
    expect(escolhaDoMicGuardada()).toBe('privado')
  })

  it('retirar em Ajustes → Privacidade vale como "Privado" (não volta a perguntar, não envia)', async () => {
    await guardarEscolhaDoMic('rapido')
    await mudarConsentimento('reconhecimentoDoNavegador', false)
    expect(escolhaDoMicGuardada()).toBe('privado')
  })

  it('o consentimento de IA de nuvem sozinho NÃO autoriza o reconhecimento do navegador', async () => {
    await mudarConsentimento('nuvem', true)
    expect(consentiuReconhecimentoDoNavegador()).toBe(false)
    expect(escolhaDoMicGuardada()).toBeNull()
  })
})
