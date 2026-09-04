import { describe, expect, it, beforeEach } from 'vitest';
import { t, tp, registrarCatalogo, usarIdioma, idiomaDaInterface, ehRTL, numero } from '../src/lib/i18n';

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
  /* A chave é a forma PLURAL portuguesa, e o valor traz as formas do idioma de destino. Duas
     chaves separadas (uma por forma) não comportariam russo, que tem três, nem árabe, que tem
     seis — por isso o valor é um objeto de categorias CLDR. */
  beforeEach(async () => {
    registrarCatalogo('en', {
      '{n} palavras prontas': { one: '{n} word ready', other: '{n} words ready' },
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

describe('plural nos idiomas que não cabem em duas formas', () => {
  it('russo escolhe entre one/few/many pelo CLDR', async () => {
    registrarCatalogo('ru', {
      '{n} palavras': { one: '{n} слово', few: '{n} слова', many: '{n} слов' },
    });
    await usarIdioma('ru');
    expect(tp(1, '{n} palavra', '{n} palavras')).toBe('1 слово');   // one
    expect(tp(3, '{n} palavra', '{n} palavras')).toBe('3 слова');   // few
    expect(tp(5, '{n} palavra', '{n} palavras')).toBe('5 слов');    // many
    expect(tp(21, '{n} palavra', '{n} palavras')).toBe('21 слово'); // one de novo
  });

  it('árabe tem seis formas e usa a que o número pede', async () => {
    registrarCatalogo('ar', {
      '{n} palavras': { zero: 'لا كلمات', one: 'كلمة', two: 'كلمتان', few: '{n} كلمات', many: '{n} كلمة', other: '{n} كلمة' },
    });
    await usarIdioma('ar');
    expect(tp(0, '{n} palavra', '{n} palavras')).toBe('لا كلمات');
    expect(tp(2, '{n} palavra', '{n} palavras')).toBe('كلمتان');
    expect(tp(3, '{n} palavra', '{n} palavras')).toBe('3 كلمات');
  });

  it('japonês tem uma forma só, e não quebra por isso', async () => {
    registrarCatalogo('ja', { '{n} palavras': { other: '{n}語' } });
    await usarIdioma('ja');
    expect(tp(1, '{n} palavra', '{n} palavras')).toBe('1語');
    expect(tp(9, '{n} palavra', '{n} palavras')).toBe('9語');
  });

  it('sem tradução, decide entre as duas frases portuguesas', async () => {
    await usarIdioma('pt');
    expect(tp(1, '{n} palavra', '{n} palavras')).toBe('1 palavra');
    expect(tp(2, '{n} palavra', '{n} palavras')).toBe('2 palavras');
  });

  it('categoria ausente no catálogo cai em other, não em vazio', async () => {
    registrarCatalogo('ru', { '{n} palavras': { one: '{n} слово' } });
    await usarIdioma('ru');
    expect(tp(5, '{n} palavra', '{n} palavras')).toBe('{n} palavras'.replace('{n}', '5'));
  });
});

describe('o que muda junto com o idioma', () => {
  it('árabe e hebraico são da direita para a esquerda', () => {
    expect(ehRTL('ar')).toBe(true);
    expect(ehRTL('he-IL')).toBe(true);
    expect(ehRTL('en')).toBe(false);
  });

  it('número segue o idioma da interface', async () => {
    await usarIdioma('pt');
    expect(numero(2733)).toBe('2.733');
    await usarIdioma('en');
    expect(numero(2733)).toBe('2,733');
  });
});
