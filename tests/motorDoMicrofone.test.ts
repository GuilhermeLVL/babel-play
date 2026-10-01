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

  it("'downloadable' e o degrau seria o Whisper: instala o pacote DO NAVEGADOR e usa o local já nesta sessão", async () => {
    const e = escopo('downloadable')
    const estados: string[] = []
    const d = await resolverMotorDoMic({
      ...BASE,
      lang: 'pt-BR',
      escopo: e.escopo,
      aoInstalar: (s) => estados.push(s),
    })
    expect(e.install).toHaveBeenCalledWith({ langs: ['pt-BR'], processLocally: true })
    expect(d).toMatchObject({ motor: 'web-speech-local', motivo: 'instalado-no-aparelho' })
    expect(estados).toEqual(['baixando', 'pronto'])
  })

  it('install que rejeita ou devolve false: cai no Whisper, avisa a falha uma vez e não lança', async () => {
    for (const falha of [() => Promise.reject(new Error('sem ativação do usuário')), async () => false]) {
      const e = escopo('downloadable')
      e.install.mockImplementationOnce(falha as never)
      const estados: string[] = []
      await expect(
        resolverMotorDoMic({ ...BASE, lang: 'pt-BR', escopo: e.escopo, aoInstalar: (s) => estados.push(s) }),
      ).resolves.toMatchObject({ motor: 'whisper', motivo: 'sem-consentimento' })
      expect(estados).toEqual(['baixando', 'falhou'])
    }
  })

  it('install que não responde: passado o prazo, Whisper (o mic não fica esperando para sempre)', async () => {
    vi.useFakeTimers()
    try {
      const e = escopo('downloadable')
      e.install.mockImplementationOnce(() => new Promise(() => {}))
      const estados: string[] = []
      const r = resolverMotorDoMic({
        ...BASE,
        lang: 'pt-BR',
        escopo: e.escopo,
        prazoDaInstalacaoMs: 1000,
        aoInstalar: (s) => estados.push(s),
      })
      await vi.advanceTimersByTimeAsync(1001)
      await expect(r).resolves.toMatchObject({ motor: 'whisper' })
      expect(estados).toEqual(['baixando', 'falhou'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('"Privado" guardado + pacote a baixar: instala o do navegador (nada sai) em vez do nosso modelo', async () => {
    const e = escopo('downloadable')
    const perguntar = vi.fn(async () => 'rapido' as const)
    const d = await resolverMotorDoMic({ ...BASE, lang: 'pt-BR', escopo: e.escopo, escolha: 'privado', perguntar })
    expect(perguntar).not.toHaveBeenCalled()
    expect(d.motor).toBe('web-speech-local')
  })

  it('"Rápido" consentido + pacote a baixar: usa a nuvem AGORA e instala sem esperar (a próxima já é local)', async () => {
    const e = escopo('downloadable')
    e.install.mockImplementationOnce(() => new Promise(() => {}))
    const aoInstalar = vi.fn()
    const d = await resolverMotorDoMic({
      ...BASE,
      lang: 'pt-BR',
      consentiuNavegador: true,
      escopo: e.escopo,
      aoInstalar,
    })
    expect(d.motor).toBe('web-speech-nuvem')
    expect(e.install).toHaveBeenCalledOnce()
    expect(aoInstalar).not.toHaveBeenCalled() // sem barra: ninguém espera por ele
  })

  it('sem `install` no navegador: nenhuma barra, segue o degrau decidido', async () => {
    const available = vi.fn(async () => 'downloadable')
    const aoInstalar = vi.fn()
    const d = await resolverMotorDoMic({
      ...BASE,
      lang: 'pt-BR',
      escopo: { SpeechRecognition: { available } },
      aoInstalar,
    })
    expect(d.motor).toBe('whisper')
    expect(aoInstalar).not.toHaveBeenCalled()
  })

  it('a pergunta "Rápido ou Privado?" sabe quando o Privado é o pacote do navegador', async () => {
    const perguntar = vi.fn(async () => 'privado' as const)
    await resolverMotorDoMic({
      ...BASE,
      lang: 'pt-BR',
      escopo: escopo('downloadable').escopo,
      escolha: null,
      perguntar,
    })
    expect(perguntar).toHaveBeenCalledWith({ pacoteDoNavegador: true })
    perguntar.mockClear()
    await resolverMotorDoMic({ ...BASE, lang: 'pt-BR', escopo: escopo('unavailable').escopo, escolha: null, perguntar })
    expect(perguntar).toHaveBeenCalledWith({ pacoteDoNavegador: false })
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

/**
 * O BIPE DO ANDROID (relato do dono no celular, 2026-09-29: "um bipzinho estranho e incômodo"). O
 * Chrome do Android encerra o reconhecimento a cada frase e o sistema apita a cada religada; o site
 * não tem como calar. Lá, o reconhecimento do navegador (nuvem OU no aparelho) só entra com o
 * "Rápido" escolhido; o "Privado" é o nosso modelo, que abre o microfone uma vez só.
 */
describe('Android: o reconhecimento do navegador apita a cada religada', () => {
  it('detecta o Android pelo userAgentData ou pelo userAgent', async () => {
    const { webSpeechBipaAoReligar } = await import('../src/lib/captura/motorDoMicrofone')
    expect(webSpeechBipaAoReligar({ navigator: { userAgentData: { platform: 'Android' } } })).toBe(true)
    expect(
      webSpeechBipaAoReligar({ navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140' } }),
    ).toBe(true)
    expect(webSpeechBipaAoReligar({ navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140' } })).toBe(false)
    expect(webSpeechBipaAoReligar({})).toBe(false)
  })

  it('no aparelho disponível NÃO basta: sem o Rápido, é o Whisper (sem bipe)', () => {
    const d = escolherMotorDoMic({ ...BASE, noAparelho: 'available', bipaAoReligar: true })
    expect(d.motor).toBe('whisper')
    expect(d.instalarNoAparelho).toBe(false)
  })

  it('com o Rápido escolhido, a escolha da pessoa vale (Web Speech na nuvem)', () => {
    expect(escolherMotorDoMic({ ...BASE, consentiuNavegador: true, bipaAoReligar: true }).motor).toBe(
      'web-speech-nuvem',
    )
  })

  it('não pede o pacote do navegador (ele apitaria igual)', () => {
    expect(escolherMotorDoMic({ ...BASE, noAparelho: 'downloadable', bipaAoReligar: true }).instalarNoAparelho).toBe(
      false,
    )
  })

  it('a pergunta Rápido ou Privado aparece mesmo com o reconhecimento no aparelho', () => {
    expect(precisaPerguntarMotorDoMic({ ...BASE, noAparelho: 'available', escolha: null, bipaAoReligar: true })).toBe(
      true,
    )
  })

  it('resolverMotorDoMic detecta o Android pelo escopo e não chama install()', async () => {
    const install = vi.fn(async () => true)
    const escopo = {
      navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/140' },
      SpeechRecognition: { install, available: vi.fn(async () => 'downloadable') },
    }
    const d = await resolverMotorDoMic({ ...BASE, lang: 'pt-BR', escopo })
    expect(d.motor).toBe('whisper')
    expect(install).not.toHaveBeenCalled()
  })
})

/**
 * O MODO INTÉRPRETE OUVE EM DOIS IDIOMAS (relato do dono no celular, 2026-09-30: o lado do inglês não
 * respondia). A decisão olhava só o idioma de quem abriu o microfone: com o pacote do português no
 * aparelho, o lado do inglês abria o reconhecedor LOCAL sem conferir se o pacote do inglês existia, e
 * o navegador recusava. Agora a decisão cobre os dois: o reconhecimento no aparelho só vale se serve
 * aos dois idiomas; senão, o degrau seguinte (a nuvem consentida ou o Whisper) atende os dois lados.
 */
describe('resolverMotorDoMic com mais de um idioma (modo intérprete)', () => {
  function escopoPorIdioma(porIdioma: Record<string, string>) {
    const install = vi.fn(async () => true)
    const available = vi.fn(async ({ langs }: { langs: string[] }) => porIdioma[langs[0]] ?? 'unavailable')
    return { escopo: { SpeechRecognition: { available, install } }, install, available }
  }

  it('pergunta pelos DOIS idiomas, com processLocally', async () => {
    const e = escopoPorIdioma({ 'pt-BR': 'available', 'en-US': 'available' })
    const d = await resolverMotorDoMic({ ...BASE, lang: 'pt-BR', idiomas: ['pt-BR', 'en-US'], escopo: e.escopo })
    expect(d.motor).toBe('web-speech-local')
    expect(e.available).toHaveBeenCalledWith({ langs: ['pt-BR'], processLocally: true })
    expect(e.available).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true })
  })

  it('o pacote do inglês faltando: o local NÃO serve; sem consentimento, é o Whisper (os dois lados)', async () => {
    const e = escopoPorIdioma({ 'pt-BR': 'available', 'en-US': 'unavailable' })
    const d = await resolverMotorDoMic({ ...BASE, lang: 'pt-BR', idiomas: ['pt-BR', 'en-US'], escopo: e.escopo })
    expect(d.motor).toBe('whisper')
    expect(e.install).not.toHaveBeenCalled()
  })

  it('o pacote do inglês faltando e o "Rápido" consentido: a nuvem atende os dois lados', async () => {
    const e = escopoPorIdioma({ 'pt-BR': 'available', 'en-US': 'unavailable' })
    const d = await resolverMotorDoMic({
      ...BASE,
      lang: 'pt-BR',
      idiomas: ['pt-BR', 'en-US'],
      consentiuNavegador: true,
      escopo: e.escopo,
    })
    expect(d.motor).toBe('web-speech-nuvem')
  })

  it("um dos pacotes a baixar: instala SÓ o que falta ('downloadable') e usa o local nos dois", async () => {
    const e = escopoPorIdioma({ 'pt-BR': 'available', 'en-US': 'downloadable' })
    const estados: string[] = []
    const d = await resolverMotorDoMic({
      ...BASE,
      lang: 'pt-BR',
      idiomas: ['pt-BR', 'en-US'],
      escopo: e.escopo,
      aoInstalar: (s) => estados.push(s),
    })
    expect(e.install).toHaveBeenCalledTimes(1)
    expect(e.install).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true })
    expect(d).toMatchObject({ motor: 'web-speech-local', motivo: 'instalado-no-aparelho' })
    expect(estados).toEqual(['baixando', 'pronto'])
  })

  it('um pacote que não instala: o Whisper atende os dois lados, e a falha é avisada uma vez', async () => {
    const e = escopoPorIdioma({ 'pt-BR': 'downloadable', 'en-US': 'downloadable' })
    e.install.mockImplementationOnce(async () => true).mockImplementationOnce(async () => false)
    const estados: string[] = []
    const d = await resolverMotorDoMic({
      ...BASE,
      lang: 'pt-BR',
      idiomas: ['pt-BR', 'en-US'],
      escopo: e.escopo,
      aoInstalar: (s) => estados.push(s),
    })
    expect(d.motor).toBe('whisper')
    expect(estados).toEqual(['baixando', 'falhou'])
  })

  it('sem `idiomas`, vale só o `lang` (a captura de sempre não muda)', async () => {
    const e = escopoPorIdioma({ 'pt-BR': 'available', 'en-US': 'unavailable' })
    const d = await resolverMotorDoMic({ ...BASE, lang: 'pt-BR', escopo: e.escopo })
    expect(d.motor).toBe('web-speech-local')
    expect(e.available).toHaveBeenCalledTimes(1)
  })
})
