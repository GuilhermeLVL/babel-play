/**
 * O MOTOR DO MICROFONE passa pelo consentimento (integração do harness, 2026-09-28).
 *
 * A Web Speech era o motor PADRÃO do microfone e era instanciada direto, por fora do perfil: no
 * Chrome (modo nuvem) o áudio ia ao Google até no perfil "Privado/Local 100% offline", sem ninguém
 * perguntar. Agora a escolha é uma decisão pura, em três degraus:
 *   (a) o navegador reconhece NO aparelho (`available({processLocally})` = 'available') → Web Speech
 *       local, sem consentimento (nada sai);
 *   (b) senão, com o consentimento ESPECÍFICO do reconhecimento do navegador ("Rápido") e fora do perfil Privado → Web Speech na nuvem, como antes;
 *   (c) senão → o Whisper/Moonshine local que já servia a quem não tem Web Speech.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  disponibilidadeDaSondaParaIdioma,
  type EntradaDoMotorDoMic,
  escolhaGuardada,
  escolherMotorDoMic,
  podeOferecerRapido,
  precisaPerguntarMotorDoMic,
  resolverMotorDoMic,
} from '../src/lib/captura/motorDoMicrofone'

const BASE: EntradaDoMotorDoMic = {
  preferido: 'browser',
  webSpeechSuportado: true,
  noAparelho: null,
  consentiuNavegador: false,
  rapidoPermitido: true,
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
    const d = escolherMotorDoMic({ ...BASE, consentiuNavegador: true })
    expect(d.motor).toBe('web-speech-nuvem')
  })

  it('sem o local e SEM consentimento → Whisper local (o áudio não vai ao Google calado)', () => {
    const d = escolherMotorDoMic({ ...BASE, noAparelho: 'unavailable' })
    expect(d.motor).toBe('whisper')
    expect(d.motivo).toBe('sem-consentimento')
  })

  it('o perfil Privado NUNCA usa a Web Speech na nuvem, nem com consentimento', () => {
    const d = escolherMotorDoMic({ ...BASE, perfilId: 'local-private', consentiuNavegador: true })
    expect(d.motor).toBe('whisper')
    expect(d.motivo).toBe('perfil-privado')
  })

  it("pacote 'downloadable': pede a instalação (no clique) e usa o degrau seguinte AGORA", () => {
    const semConsentimento = escolherMotorDoMic({ ...BASE, noAparelho: 'downloadable' })
    expect(semConsentimento).toMatchObject({ motor: 'whisper', instalarNoAparelho: true })
    const comConsentimento = escolherMotorDoMic({ ...BASE, noAparelho: 'downloadable', consentiuNavegador: true })
    expect(comConsentimento).toMatchObject({ motor: 'web-speech-nuvem', instalarNoAparelho: true })
  })

  it("'downloading' não pede outra instalação", () => {
    expect(escolherMotorDoMic({ ...BASE, noAparelho: 'downloading' }).instalarNoAparelho).toBe(false)
  })

  it('quem escolheu o Whisper fica no Whisper; navegador sem Web Speech também', () => {
    expect(escolherMotorDoMic({ ...BASE, preferido: 'whisper', noAparelho: 'available' }).motor).toBe('whisper')
    expect(escolherMotorDoMic({ ...BASE, webSpeechSuportado: false, consentiuNavegador: true }).motor).toBe('whisper')
  })
})

describe('perfil protegido (menor ou idade desconhecida) — "Rápido" não é oferecido', () => {
  it('sem "Rápido" permitido, nem o consentimento guardado manda o áudio ao Google', () => {
    const d = escolherMotorDoMic({ ...BASE, consentiuNavegador: true, rapidoPermitido: false })
    expect(d).toMatchObject({ motor: 'whisper', motivo: 'perfil-protegido' })
  })

  it('o reconhecimento NO aparelho continua valendo (nada sai)', () => {
    expect(escolherMotorDoMic({ ...BASE, rapidoPermitido: false, noAparelho: 'available' }).motor).toBe(
      'web-speech-local',
    )
  })

  it('podeOferecerRapido: adulto sim; protegido só com o responsável autorizando (política da nuvem)', () => {
    expect(podeOferecerRapido({ protegido: false, responsavelAutorizou: false })).toBe(true)
    expect(podeOferecerRapido({ protegido: true, responsavelAutorizou: false })).toBe(false)
    expect(podeOferecerRapido({ protegido: true, responsavelAutorizou: true })).toBe(true)
  })
})

describe('precisaPerguntarMotorDoMic — a escolha "Rápido"/"Privado" aparece UMA vez', () => {
  const P = { ...BASE, escolha: null } as const

  it('primeira vez, sem reconhecimento no aparelho, com Web Speech → pergunta', () => {
    expect(precisaPerguntarMotorDoMic(P)).toBe(true)
    expect(precisaPerguntarMotorDoMic({ ...P, noAparelho: 'downloadable' })).toBe(true)
    expect(precisaPerguntarMotorDoMic({ ...P, noAparelho: 'unavailable' })).toBe(true)
  })

  it('com a escolha guardada (qualquer uma) → não pergunta de novo', () => {
    expect(precisaPerguntarMotorDoMic({ ...P, escolha: 'rapido' })).toBe(false)
    expect(precisaPerguntarMotorDoMic({ ...P, escolha: 'privado' })).toBe(false)
  })

  it('reconhecimento no aparelho disponível → nada a perguntar (nada sai, nada a baixar)', () => {
    expect(precisaPerguntarMotorDoMic({ ...P, noAparelho: 'available' })).toBe(false)
  })

  it('perfil Privado e perfil protegido → não pergunta: "Rápido" não existe para eles', () => {
    expect(precisaPerguntarMotorDoMic({ ...P, perfilId: 'local-private' })).toBe(false)
    expect(precisaPerguntarMotorDoMic({ ...P, rapidoPermitido: false })).toBe(false)
  })

  it('sem Web Speech, ou com o Whisper escolhido no seletor → não pergunta', () => {
    expect(precisaPerguntarMotorDoMic({ ...P, webSpeechSuportado: false })).toBe(false)
    expect(precisaPerguntarMotorDoMic({ ...P, preferido: 'whisper' })).toBe(false)
  })

  it('escolhaGuardada: consentimento → rápido; já respondeu sem consentir → privado; nunca → null', () => {
    expect(escolhaGuardada({ consentiuNavegador: true, jaEscolheu: false })).toBe('rapido')
    expect(escolhaGuardada({ consentiuNavegador: false, jaEscolheu: true })).toBe('privado')
    expect(escolhaGuardada({ consentiuNavegador: false, jaEscolheu: false })).toBeNull()
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

  it('primeira vez: pergunta DEPOIS de o navegador dizer que não reconhece no aparelho', async () => {
    const e = escopo('unavailable')
    const perguntar = vi.fn(async () => 'rapido' as const)
    const d = await resolverMotorDoMic({ ...BASE, lang: 'pt-BR', escopo: e.escopo, escolha: null, perguntar })
    expect(perguntar).toHaveBeenCalledOnce()
    expect(d.motor).toBe('web-speech-nuvem')
  })

  it('"Privado" ou fechar sem escolher → Whisper local', async () => {
    for (const r of ['privado', null] as const) {
      const d = await resolverMotorDoMic({
        ...BASE,
        lang: 'pt-BR',
        escopo: escopo('unavailable').escopo,
        escolha: null,
        perguntar: async () => r,
      })
      expect(d.motor).toBe('whisper')
    }
  })

  it('no aparelho disponível ou escolha guardada → não pergunta', async () => {
    const perguntar = vi.fn(async () => 'rapido' as const)
    await resolverMotorDoMic({ ...BASE, lang: 'pt-BR', escopo: escopo('available').escopo, escolha: null, perguntar })
    await resolverMotorDoMic({
      ...BASE,
      lang: 'pt-BR',
      escopo: escopo('unavailable').escopo,
      escolha: 'privado',
      perguntar,
    })
    expect(perguntar).not.toHaveBeenCalled()
  })

  it('sem a API estática (navegador antigo) → degrau seguinte, sem lançar', async () => {
    const d = await resolverMotorDoMic({ ...BASE, lang: 'pt-BR', consentiuNavegador: true, escopo: {} })
    expect(d.motor).toBe('web-speech-nuvem')
  })
})
