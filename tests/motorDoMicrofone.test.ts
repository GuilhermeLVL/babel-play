/**
 * O MOTOR DO MICROFONE passa pelo consentimento (integração do harness, 2026-09-28).
 *
 * A Web Speech era o motor PADRÃO do microfone e era instanciada direto, por fora do perfil: no
 * Chrome (modo nuvem) o áudio ia ao Google até no perfil "Privado/Local 100% offline", sem ninguém
 * perguntar. Agora a escolha é uma decisão pura, em três degraus:
 *   (a) o navegador reconhece NO aparelho (`available({processLocally})` = 'available') → Web Speech
 *       local, sem consentimento (nada sai);
 *   (b) senão, com consentimento de nuvem e fora do perfil Privado → Web Speech na nuvem, como antes;
 *   (c) senão → o Whisper/Moonshine local que já servia a quem não tem Web Speech.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  disponibilidadeDaSondaParaIdioma,
  type EntradaDoMotorDoMic,
  escolherMotorDoMic,
  resolverMotorDoMic,
} from '../src/lib/captura/motorDoMicrofone'

const BASE: EntradaDoMotorDoMic = {
  preferido: 'browser',
  webSpeechSuportado: true,
  noAparelho: null,
  consentiuNuvem: false,
  perfilId: 'free-web',
}

describe('escolherMotorDoMic', () => {
  it('reconhecimento no aparelho disponível → Web Speech LOCAL, mesmo sem consentimento', () => {
    const d = escolherMotorDoMic({ ...BASE, noAparelho: 'available' })
    expect(d.motor).toBe('web-speech-local')
    expect(d.instalarNoAparelho).toBe(false)
  })

  it('o perfil Privado pode usar o LOCAL (nada sai do aparelho)', () => {
    expect(escolherMotorDoMic({ ...BASE, perfilId: 'local-private', noAparelho: 'available' }).motor).toBe(
      'web-speech-local',
    )
  })

  it('sem o local e COM consentimento → Web Speech na nuvem, como antes', () => {
    const d = escolherMotorDoMic({ ...BASE, consentiuNuvem: true })
    expect(d.motor).toBe('web-speech-nuvem')
  })

  it('sem o local e SEM consentimento → Whisper local (o áudio não vai ao Google calado)', () => {
    const d = escolherMotorDoMic({ ...BASE, noAparelho: 'unavailable' })
    expect(d.motor).toBe('whisper')
    expect(d.motivo).toBe('sem-consentimento')
  })

  it('o perfil Privado NUNCA usa a Web Speech na nuvem, nem com consentimento', () => {
    const d = escolherMotorDoMic({ ...BASE, perfilId: 'local-private', consentiuNuvem: true })
    expect(d.motor).toBe('whisper')
    expect(d.motivo).toBe('perfil-privado')
  })

  it("pacote 'downloadable': pede a instalação (no clique) e usa o degrau seguinte AGORA", () => {
    const semConsentimento = escolherMotorDoMic({ ...BASE, noAparelho: 'downloadable' })
    expect(semConsentimento).toMatchObject({ motor: 'whisper', instalarNoAparelho: true })
    const comConsentimento = escolherMotorDoMic({ ...BASE, noAparelho: 'downloadable', consentiuNuvem: true })
    expect(comConsentimento).toMatchObject({ motor: 'web-speech-nuvem', instalarNoAparelho: true })
  })

  it("'downloading' não pede outra instalação", () => {
    expect(escolherMotorDoMic({ ...BASE, noAparelho: 'downloading' }).instalarNoAparelho).toBe(false)
  })

  it('quem escolheu o Whisper fica no Whisper; navegador sem Web Speech também', () => {
    expect(escolherMotorDoMic({ ...BASE, preferido: 'whisper', noAparelho: 'available' }).motor).toBe('whisper')
    expect(escolherMotorDoMic({ ...BASE, webSpeechSuportado: false, consentiuNuvem: true }).motor).toBe('whisper')
  })
})

describe('disponibilidadeDaSondaParaIdioma', () => {
  it('lê o pt-BR e o en da sonda; outro idioma = desconhecido', () => {
    const stt = { ptBR: 'available' as const, en: 'downloadable' as const }
    expect(disponibilidadeDaSondaParaIdioma('pt-BR', stt)).toBe('available')
    expect(disponibilidadeDaSondaParaIdioma('pt', stt)).toBe('available')
    expect(disponibilidadeDaSondaParaIdioma('en-US', stt)).toBe('downloadable')
    expect(disponibilidadeDaSondaParaIdioma('es', stt)).toBeNull()
    expect(disponibilidadeDaSondaParaIdioma('pt', undefined)).toBeNull()
  })
})

describe('resolverMotorDoMic — pergunta ao navegador e instala só quando pedido', () => {
  function escopo(disp: string) {
    const install = vi.fn(async () => true)
    const available = vi.fn(async () => disp)
    return { escopo: { SpeechRecognition: { available, install } }, install, available }
  }

  it('pergunta pelo idioma do microfone com processLocally', async () => {
    const e = escopo('available')
    const d = await resolverMotorDoMic({ ...BASE, lang: 'pt-BR', escopo: e.escopo })
    expect(d.motor).toBe('web-speech-local')
    expect(e.available).toHaveBeenCalledWith({ langs: ['pt-BR'], processLocally: true })
    expect(e.install).not.toHaveBeenCalled()
  })

  it("'downloadable' dispara install({langs, processLocally}) sem esperar por ele", async () => {
    const e = escopo('downloadable')
    const d = await resolverMotorDoMic({ ...BASE, lang: 'pt-BR', escopo: e.escopo })
    expect(d.motor).toBe('whisper')
    expect(e.install).toHaveBeenCalledWith({ langs: ['pt-BR'], processLocally: true })
  })

  it('install que rejeita não derruba a decisão', async () => {
    const e = escopo('downloadable')
    e.install.mockRejectedValueOnce(new Error('sem ativação do usuário'))
    await expect(resolverMotorDoMic({ ...BASE, lang: 'pt-BR', escopo: e.escopo })).resolves.toMatchObject({
      motor: 'whisper',
    })
  })

  it('sem a API estática (navegador antigo) → degrau seguinte, sem lançar', async () => {
    const d = await resolverMotorDoMic({ ...BASE, lang: 'pt-BR', consentiuNuvem: true, escopo: {} })
    expect(d.motor).toBe('web-speech-nuvem')
  })
})
