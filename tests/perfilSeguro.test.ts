/**
 * F2-01 — a leitura do perfil não pode confiar num `as`.
 *
 * `App.tsx` lia `localStorage.getItem('babel.age_profile') as AgeProfileType || 'pro'`. Dois
 * defeitos nisso, e são os dois que este arquivo trava:
 *
 *   1. valor inválido guardado é truthy, então o `|| 'pro'` não pega. O perfil inválido entra no
 *      estado e toda tabela `Record<AgeProfileType, string>` devolve `undefined` — a UI renderiza
 *      vazio onde deveria haver rótulo;
 *   2. `localStorage.getItem` LANÇA com storage bloqueado (aba privada, iframe com sandbox). Dentro
 *      do inicializador de um `useState`, isso impede a montagem do App inteiro.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { COPY, copyDoPerfil, readAgeProfile, readStoredEnum, readStoredValue } from '../src/lib/profile'

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

function instalarStorage(impl: unknown) {
  Object.defineProperty(globalThis, 'localStorage', { value: impl, configurable: true, writable: true })
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

/** Espelho mínimo: só o `getItem` importa aqui. */
const storageCom = (valor: string | null) => ({ getItem: () => valor })
/**
 * O PADRÃO VIVE AQUI, numa constante — e não repetido em três asserções.
 *
 * Ele já mudou duas vezes ('pro' → 'senior' em 2026-08-31, spec leitura-ampliada-padrao; e
 * 'senior' → 'pro' em 2026-09-12, quando o dono aprovou Produtividade como padrão no redesign
 * v4). Nas duas vezes o valor estava escrito à mão em três testes e num comentário em cada um,
 * então trocar o padrão quebrava a suíte em três lugares que não têm nada a dizer sobre QUAL é o
 * padrão — eles falam sobre o recuo funcionar. Este arquivo trava o recuo; quem trava a escolha
 * do padrão é `readAgeProfile` ali embaixo, num teste só.
 */
const PADRAO = 'pro'

const storageQueLanca = () => ({
  getItem() {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  },
})

describe('readAgeProfile', () => {
  it('devolve o perfil guardado quando ele é um dos três válidos', () => {
    for (const p of ['kids', 'pro', 'senior'] as const) {
      instalarStorage(storageCom(p))
      expect(readAgeProfile()).toBe(p)
    }
  })

  it('valor inválido guardado cai no padrão "pro" — o `||` não pegava porque "banana" é truthy', () => {
    instalarStorage(storageCom('banana'))
    expect(readAgeProfile()).toBe(PADRAO)
  })

  it('e o perfil devolvido sempre indexa as tabelas de cópia', () => {
    instalarStorage(storageCom('banana'))
    const perfil = readAgeProfile()
    expect(COPY['now.due.cta'][perfil]).toBeTypeOf('string')
    expect(copyDoPerfil('now.due.cta', perfil)).not.toBe('')
  })

  it('storage bloqueado devolve o padrão sem propagar a exceção', () => {
    instalarStorage(storageQueLanca())
    expect(() => readAgeProfile()).not.toThrow()
    expect(readAgeProfile()).toBe(PADRAO)
  })

  it('storage ausente (chave nunca escrita) cai no padrão', () => {
    instalarStorage(storageCom(null))
    expect(readAgeProfile()).toBe(PADRAO)
  })
})

describe('o padrão do perfil de exibição', () => {
  it('é Produtividade ("pro") — decisão do dono em 2026-09-12, no redesign v4', () => {
    instalarStorage(storageCom(null))
    expect(readAgeProfile()).toBe('pro')
  })
})

describe('readStoredEnum — o mesmo contrato para a posição do menu', () => {
  const POSICOES = ['top', 'bottom', 'left', 'right'] as const

  it('aceita os valores da lista', () => {
    instalarStorage(storageCom('bottom'))
    expect(readStoredEnum('babel.menu_position', POSICOES, 'top')).toBe('bottom')
  })

  it('rejeita valor fora da lista', () => {
    instalarStorage(storageCom('diagonal'))
    expect(readStoredEnum('babel.menu_position', POSICOES, 'top')).toBe('top')
  })

  it('storage bloqueado devolve o padrão sem propagar', () => {
    instalarStorage(storageQueLanca())
    expect(() => readStoredEnum('babel.menu_position', POSICOES, 'top')).not.toThrow()
    expect(readStoredEnum('babel.menu_position', POSICOES, 'top')).toBe('top')
  })
})

describe('readStoredValue', () => {
  it('storage bloqueado é indistinguível de chave ausente', () => {
    instalarStorage(storageQueLanca())
    expect(readStoredValue('babel.sound_enabled')).toBeNull()
  })
})
