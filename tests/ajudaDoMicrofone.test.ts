/**
 * A AJUDA DO MICROFONE — o que a tela diz quando o microfone não abre, com o caminho de volta DAQUELE
 * aparelho. Antes era um toast de 7 s ("Permissão do microfone negada. Ative o microfone nas
 * permissões do navegador.") que não dizia onde ficam essas permissões no Android nem no iPhone, e o
 * "Rápido" nem isso (o erro ia só ao console).
 */
import { describe, expect, it } from 'vitest'

import {
  ajudaDoMic,
  classificarFalhaDoMic,
  plataformaDoNavegador,
} from '../src/lib/captura/ajudaDoMicrofone'

const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'
const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const UA_IPAD_COMO_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const UA_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

describe('plataformaDoNavegador', () => {
  it('Android, iPhone, iPad que se diz Mac (tem toque) e desktop', () => {
    expect(plataformaDoNavegador(UA_ANDROID)).toBe('android')
    expect(plataformaDoNavegador(UA_IPHONE)).toBe('ios')
    expect(plataformaDoNavegador(UA_IPAD_COMO_MAC, 5)).toBe('ios')
    expect(plataformaDoNavegador(UA_IPAD_COMO_MAC, 0)).toBe('desktop')
    expect(plataformaDoNavegador(UA_WINDOWS)).toBe('desktop')
  })
})

describe('classificarFalhaDoMic', () => {
  const dom = (name: string) => Object.assign(new Error('x'), { name })
  it('getUserMedia: o nome do DOMException (ou o que a captura guardou dele)', () => {
    expect(classificarFalhaDoMic(dom('NotAllowedError'))).toBe('permissao')
    expect(classificarFalhaDoMic(Object.assign(new Error('Permissão negada'), { nomeDoErro: 'NotAllowedError' }))).toBe(
      'permissao',
    )
    expect(classificarFalhaDoMic(dom('NotFoundError'))).toBe('sem-microfone')
    expect(classificarFalhaDoMic(dom('NotReadableError'))).toBe('ocupado')
  })
  it('Web Speech: o codigo do adaptador', () => {
    const ws = (codigo: string) => Object.assign(new Error('x'), { codigo })
    expect(classificarFalhaDoMic(ws('not-allowed'))).toBe('permissao')
    expect(classificarFalhaDoMic(ws('service-not-allowed'))).toBe('servico')
    expect(classificarFalhaDoMic(ws('audio-capture'))).toBe('ocupado')
    expect(classificarFalhaDoMic(ws('network'))).toBe('rede')
    expect(classificarFalhaDoMic(ws('sem-audio'))).toBe('nao-abriu')
    expect(classificarFalhaDoMic(ws('language-not-supported'))).toBe('idioma')
  })
  it('o resto é genérico (nunca chuta a causa)', () => {
    expect(classificarFalhaDoMic(new Error('???'))).toBe('outro')
    expect(classificarFalhaDoMic('texto')).toBe('outro')
  })
})

describe('ajudaDoMic', () => {
  it('permissão no Android: o caminho das configurações do site', () => {
    const a = ajudaDoMic('permissao', 'android', { motorRapido: false })
    expect(a.passos.join(' ')).toMatch(/Configurações do site/)
    expect(a.passos.join(' ')).toMatch(/Microfone/)
    expect(a.tentarDeNovo).toBe(true)
    expect(a.trocarParaPrivado).toBe(false)
  })
  it('permissão no iPhone: aA → Configurações do site, e Ajustes → Safari', () => {
    const a = ajudaDoMic('permissao', 'ios', { motorRapido: false })
    const tudo = a.passos.join(' ')
    expect(tudo).toMatch(/aA/)
    expect(tudo).toMatch(/Ajustes/)
    expect(tudo).toMatch(/Safari/)
  })
  it('serviço recusado no iPhone: Ditado/Siri, e o Privado como saída', () => {
    const a = ajudaDoMic('servico', 'ios', { motorRapido: true })
    expect(a.passos.join(' ')).toMatch(/Ditado/)
    expect(a.trocarParaPrivado).toBe(true)
  })
  it('o "Trocar para Privado" só aparece quando quem falhou foi o Rápido', () => {
    expect(ajudaDoMic('rede', 'android', { motorRapido: true }).trocarParaPrivado).toBe(true)
    expect(ajudaDoMic('nao-abriu', 'android', { motorRapido: true }).trocarParaPrivado).toBe(true)
    expect(ajudaDoMic('ocupado', 'android', { motorRapido: false }).trocarParaPrivado).toBe(false)
  })
  it('toda ajuda tem título e texto', () => {
    for (const f of ['permissao', 'servico', 'sem-microfone', 'ocupado', 'rede', 'nao-abriu', 'idioma', 'outro'] as const)
      for (const p of ['android', 'ios', 'desktop'] as const) {
        const a = ajudaDoMic(f, p, { motorRapido: true })
        expect(a.titulo.length).toBeGreaterThan(5)
        expect(a.texto.length).toBeGreaterThan(5)
      }
  })
})
