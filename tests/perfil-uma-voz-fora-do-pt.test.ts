import { describe, expect, it, beforeEach } from 'vitest';
import { copyDoPerfil } from '../src/lib/profile';
import { registrarCatalogo, usarIdioma } from '../src/lib/i18n';

/**
 * Os três registros (kids/pro/senior) são de PORTUGUÊS. Fora dele traduz-se um só — a voz `pro` —
 * porque a nuance que separa "Seu baralho está vazio" de "Você ainda não guardou palavras" depende
 * de sensibilidade nativa e não sobrevive a tradução por máquina. Traduzir os três custaria 3× para
 * entregar três variações aleatórias da mesma frase.
 */
describe('uma voz só fora do português', () => {
  beforeEach(async () => {
    registrarCatalogo('en', { 'Seu deck está vazio, adicione palavras primeiro.': 'Your deck is empty — add some words first.' });
    await usarIdioma('pt');
  });

  it('em português cada perfil mantém a sua redação', () => {
    const kids = copyDoPerfil('block.emptyDeck', 'kids');
    const pro = copyDoPerfil('block.emptyDeck', 'pro');
    const senior = copyDoPerfil('block.emptyDeck', 'senior');
    expect(new Set([kids, pro, senior]).size).toBe(3);
    expect(kids).toContain('baralho');
    expect(senior).toContain('Grave');
  });

  it('em inglês os três recebem a tradução da voz pro', async () => {
    await usarIdioma('en');
    const traduzido = 'Your deck is empty — add some words first.';
    expect(copyDoPerfil('block.emptyDeck', 'pro')).toBe(traduzido);
    expect(copyDoPerfil('block.emptyDeck', 'kids')).toBe(traduzido);
    expect(copyDoPerfil('block.emptyDeck', 'senior')).toBe(traduzido);
  });

  it('sem tradução, o estrangeiro vê o português da voz pro — não o do seu perfil', async () => {
    await usarIdioma('en');
    // 'block.noTranscript' não está no catálogo: cai no fallback, que é a chave `pro`.
    expect(copyDoPerfil('block.noTranscript', 'kids')).toBe(copyDoPerfil('block.noTranscript', 'pro'));
  });

  it('a interpolação continua funcionando nos dois caminhos', async () => {
    await usarIdioma('pt');
    expect(copyDoPerfil('block.notMature', 'pro', { n: 7 })).toContain('7');
    await usarIdioma('en');
    expect(copyDoPerfil('block.notMature', 'kids', { n: 7 })).toContain('7');
  });
});
