/**
 * O INÍCIO DA CAPTURA — uma folha só, antes de a sessão existir, com o tamanho do que a escolha baixa
 * de verdade (ver `lib/captura/inicioDaCaptura.ts`). O caso que o dono viu no celular: "cerca de 193
 * MB" (Whisper do sistema + opus-mt) e, com a sessão já andando, "Privado: cerca de 80 MB".
 */
import { describe, expect, it } from 'vitest'

import {
  type EntradaDoInicio,
  motorPrevistoDoMic,
  planejarInicio,
  tradutorDepoisDaPrimeiraLegenda,
} from '../src/lib/captura/inicioDaCaptura'

const motor = (o: Partial<EntradaDoInicio['motor']> = {}): EntradaDoInicio['motor'] => ({
  preferido: 'browser',
  webSpeechSuportado: true,
  noAparelho: 'unavailable',
  consentiuNavegador: false,
  rapidoPermitido: true,
  perfilId: 'hybrid',
  escolha: null,
  podeInstalarPacote: false,
  ...o,
})

/** O celular do relato: só microfone, Whisper base q8 (80 MB) a baixar, tradutor depois da 1ª legenda. */
const celular = (o: Partial<EntradaDoInicio> = {}): EntradaDoInicio => ({
  micEnabled: true,
  systemEnabled: false,
  motor: motor(),
  mbStt: 80,
  mbTradutor: 0,
  limiteDeDownloadMb: 100,
  downloadJaConfirmado: false,
  modoNuvem: false,
  ...o,
})

describe('planejarInicio', () => {
  it('celular, primeira vez: UMA folha com a pergunta; Privado 80 MB, Rápido nada', () => {
    const p = planejarInicio(celular())
    expect(p).toEqual({
      tipo: 'folha',
      perguntarMotor: true,
      pacoteDoNavegador: false,
      mbSePrivado: 80,
      mbSeRapido: 0,
      mb: 80,
    })
  })

  it('escolha guardada Rápido: começa JÁ (nada a baixar para a voz)', () => {
    expect(planejarInicio(celular({ motor: motor({ escolha: 'rapido' }) }))).toEqual({ tipo: 'iniciar' })
  })

  it('escolha guardada Privado: 80 MB abaixo do limite do celular (100) começa já', () => {
    expect(planejarInicio(celular({ motor: motor({ escolha: 'privado' }) }))).toEqual({ tipo: 'iniciar' })
  })

  it('Privado com o tradutor junto (acima do limite): a folha só confirma o download, com o total real', () => {
    const p = planejarInicio(celular({ motor: motor({ escolha: 'privado' }), mbTradutor: 113 }))
    expect(p).toMatchObject({ tipo: 'folha', perguntarMotor: false, mb: 193 })
  })

  it('download já confirmado nesta tela: não pergunta de novo', () => {
    const p = planejarInicio(
      celular({ motor: motor({ escolha: 'privado' }), mbTradutor: 113, downloadJaConfirmado: true }),
    )
    expect(p).toEqual({ tipo: 'iniciar' })
  })

  it('o navegador reconhece no aparelho: nada a perguntar, nada a baixar para a voz', () => {
    expect(planejarInicio(celular({ motor: motor({ noAparelho: 'available' }) }))).toEqual({ tipo: 'iniciar' })
  })

  it('pacote do navegador instalável: o Privado é ele (sem o nosso modelo)', () => {
    const p = planejarInicio(celular({ motor: motor({ noAparelho: 'downloadable', podeInstalarPacote: true }) }))
    expect(p).toMatchObject({ tipo: 'folha', perguntarMotor: true, pacoteDoNavegador: true, mbSePrivado: 0 })
  })

  it('desktop com o áudio do sistema: o Whisper do sistema conta nas DUAS opções', () => {
    const p = planejarInicio(
      celular({ systemEnabled: true, mbStt: 209, mbTradutor: 113, limiteDeDownloadMb: null }),
    )
    expect(p).toMatchObject({ tipo: 'folha', perguntarMotor: true, mbSePrivado: 322, mbSeRapido: 322 })
  })

  it('desktop sem limite e escolha feita: começa já (o comportamento de hoje)', () => {
    const p = planejarInicio(
      celular({ systemEnabled: true, mbStt: 209, mbTradutor: 113, limiteDeDownloadMb: null, motor: motor({ escolha: 'rapido' }) }),
    )
    expect(p).toEqual({ tipo: 'iniciar' })
  })

  it('só o sistema (mic mudo): a pergunta do motor não aparece', () => {
    const p = planejarInicio(celular({ micEnabled: false, systemEnabled: true, limiteDeDownloadMb: 0 }))
    expect(p).toMatchObject({ tipo: 'folha', perguntarMotor: false, mb: 80 })
  })

  it('perfil Privado ou protegido: não pergunta (o Privado é o único)', () => {
    expect(planejarInicio(celular({ motor: motor({ perfilId: 'local-private' }) }))).toEqual({ tipo: 'iniciar' })
    expect(planejarInicio(celular({ motor: motor({ rapidoPermitido: false }) }))).toEqual({ tipo: 'iniciar' })
  })

  it('modo nuvem: nada baixa para começar', () => {
    expect(planejarInicio(celular({ modoNuvem: true, motor: motor({ escolha: 'privado' }), mbTradutor: 113 }))).toEqual({
      tipo: 'iniciar',
    })
  })
})

describe('motorPrevistoDoMic', () => {
  it('Rápido → navegador; Privado → whisper; Privado com pacote instalável → pacote', () => {
    expect(motorPrevistoDoMic(motor({ escolha: 'rapido' }))).toBe('navegador')
    expect(motorPrevistoDoMic(motor({ escolha: 'privado' }))).toBe('whisper')
    expect(motorPrevistoDoMic(motor({ escolha: 'privado', noAparelho: 'downloadable', podeInstalarPacote: true }))).toBe(
      'pacote',
    )
  })
})

describe('tradutorDepoisDaPrimeiraLegenda', () => {
  it('só no celular com só o microfone', () => {
    expect(tradutorDepoisDaPrimeiraLegenda({ tipo: 'celular-fraco', sistemaLigado: false })).toBe(true)
    expect(tradutorDepoisDaPrimeiraLegenda({ tipo: 'celular-bom', sistemaLigado: false })).toBe(true)
    expect(tradutorDepoisDaPrimeiraLegenda({ tipo: 'desktop-com-gpu', sistemaLigado: false })).toBe(false)
    expect(tradutorDepoisDaPrimeiraLegenda({ tipo: 'quest', sistemaLigado: false })).toBe(false)
  })
})
