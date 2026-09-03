import { describe, expect, it, beforeEach } from 'vitest';
import { t, tp, registrarCatalogo, usarIdioma, idiomaDaInterface } from '../src/lib/i18n';

/**
 * A chave é o texto português, e é isso que este arquivo trava: uma tradução ausente devolve a
 * frase original, nunca vazio nem um identificador. É o que permite migrar uma tela por vez.
 */
describe('t', () => {
  beforeEach(async () => {
    registrarCatalogo('en', {
      'Jogo da memória': 'Memory game',
      '{n} palavras prontas': '{n} words ready',
      '{n} palavra pronta': '{n} word ready',
    });
    await usarIdioma('pt');
  });

  it('em português devolve o próprio texto, sem catálogo nenhum', () => {
    expect(t('Jogo da memória')).toBe('Jogo da memória');
  });

  it('traduz quando há catálogo', async () => {
    await usarIdioma('en');
    expect(t('Jogo da memória')).toBe('Memory game');
  });

  it('frase sem tradução cai no português, não em vazio', async () => {
    await usarIdioma('en');
    expect(t('Caça-palavras')).toBe('Caça-palavras');
  });

  it('interpola valores', async () => {
    await usarIdioma('en');
    expect(t('{n} palavras prontas', { n: 42 })).toBe('42 words ready');
  });

  it('deixa a chave intacta quando o valor não vem', () => {
    expect(t('{n} palavras prontas')).toBe('{n} palavras prontas');
  });

  it('idioma sem catálogo fica em português', async () => {
    await usarIdioma('ja');
    expect(idiomaDaInterface()).toBe('pt');
    expect(t('Jogo da memória')).toBe('Jogo da memória');
  });

  it('aceita variante regional', async () => {
    await usarIdioma('en-US');
    expect(t('Jogo da memória')).toBe('Memory game');
  });
});

describe('tp', () => {
  beforeEach(async () => {
    registrarCatalogo('en', {
      '{n} palavras prontas': '{n} words ready',
      '{n} palavra pronta': '{n} word ready',
    });
    await usarIdioma('en');
  });

  it('escolhe a forma pelo número e interpola n', () => {
    expect(tp(1, '{n} palavra pronta', '{n} palavras prontas')).toBe('1 word ready');
    expect(tp(5, '{n} palavra pronta', '{n} palavras prontas')).toBe('5 words ready');
  });

  it('em português também escolhe a forma certa', async () => {
    await usarIdioma('pt');
    expect(tp(1, '{n} palavra pronta', '{n} palavras prontas')).toBe('1 palavra pronta');
    expect(tp(3, '{n} palavra pronta', '{n} palavras prontas')).toBe('3 palavras prontas');
  });
});
