/**
 * TRADUÇÃO INCREMENTAL (V3 `traducao_incremental`): mask-k e "não regride", funções puras com casos à mão.
 */
import { describe, expect, it } from 'vitest'

import { K_DO_MASK, traducaoIncremental } from '../src/core/traducao/traducaoIncremental'

const t = (anterior: string, nova: string, extra: object = {}) =>
  traducaoIncremental({ confirmado: 'x', anterior, nova, ...extra })

describe('traducaoIncremental', () => {
  it('k padrão é 2', () => expect(K_DO_MASK).toBe(2))

  it('esconde as 2 últimas palavras de um prefixo não final', () => {
    expect(t('', 'Where is the train station')).toBe('Where is the')
  })

  it('poucas palavras: nada a mostrar, fica o anterior', () => {
    expect(t('', 'Where is')).toBe('')
    expect(t('Where', 'Where is')).toBe('Where')
  })

  it('o prefixo cresce: a tradução avança com o mask', () => {
    const a = t('', 'Where is the train station')
    expect(a).toBe('Where is the')
    expect(t(a, 'Where is the train station near here')).toBe('Where is the train station')
  })

  it('a pontuação que sobra no corte sai', () => {
    expect(t('', 'Well, where is the station?')).toBe('Well, where is')
  })

  it('só encolhe: não regride', () => {
    expect(t('Where is the train', 'Where is the station')).toBe('Where is the train')
    expect(t('Where is the train', 'Where is the station now')).toBe('Where is the train')
  })

  it('troca que mostra ao menos tanto quanto a tela: vale; que mostra menos: mantém', () => {
    expect(t('Where is the train', 'Where was the old station now')).toBe('Where was the old')
    expect(t('Where is the train station', 'Where was the old')).toBe('Where is the train station')
  })

  it('caixa e acento não contam como troca', () => {
    expect(t('Onde fica a', 'onde fica a estação agora')).toBe('Onde fica a')
    expect(t('Onde fica a', 'onde fica a estação agora de novo')).toBe('onde fica a estação agora')
  })

  it('confirmado vazio: nada muda', () => {
    expect(traducaoIncremental({ confirmado: ' ', anterior: 'Hi there', nova: 'Hi there you' })).toBe('Hi there')
  })

  it('final: sem máscara', () => {
    expect(t('', 'Where is it', { final: true })).toBe('Where is it')
  })

  it('k é parâmetro', () => {
    expect(t('', 'a b c d', { k: 1 })).toBe('a b c')
    expect(t('', 'a b c d', { k: 0 })).toBe('a b c d')
  })

  it('idioma sem espaço: um caractere por palavra', () => {
    expect(t('', '你好世界朋友')).toBe('你好世界')
    expect(t('', '今日は天気です', { k: 3 })).toBe('今日は天')
    expect(t('你好世界', '你好')).toBe('你好世界')
  })

  it('misto: palavra latina conta uma, ideograma conta um', () => {
    expect(t('', 'hello 世界 你好')).toBe('hello 世界')
  })
})
