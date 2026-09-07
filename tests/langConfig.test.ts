import { describe, it, expect } from 'vitest';
import { langConfigFrom, idiomasDaInterfaceOferecidos, DEFAULT_LANG_CONFIG } from '../src/lib/langConfig';

/**
 * TRÊS EIXOS, UMA FONTE CADA (auditoria de 2026-09-07, achado A38).
 *
 * O idioma-alvo era gravado em três campos — `settings.targetLanguage`, `ui.captureTargetLang` e
 * `ui.praticaLang` — por três telas diferentes, e no banco real eles divergiam. O leitor único
 * passa a ter uma ordem declarada: o campo autoritativo manda, os espelhos são só compatibilidade
 * com linhas antigas (o modo anônimo guarda settings no IndexedDB, onde migração SQL não chega).
 */
describe('langConfigFrom', () => {
  it('settings.targetLanguage é autoritativo sobre os espelhos do blob ui', () => {
    const cfg = langConfigFrom({ captureSourceLang: 'pt-BR', captureTargetLang: 'fr-FR', praticaLang: 'de' }, 'en-US');
    expect(cfg.mine).toBe('pt-BR');
    expect(cfg.studying).toBe('en-US');
  });

  it('cai no espelho da Captura quando targetLanguage está vazio', () => {
    const cfg = langConfigFrom({ captureSourceLang: 'pt-BR', captureTargetLang: 'fr-FR' }, null);
    expect(cfg.studying).toBe('fr-FR');
  });

  it('cai no espelho da tela de jogos quando é o único que existe (linha antiga, IndexedDB)', () => {
    const cfg = langConfigFrom({ captureSourceLang: 'pt-BR', praticaLang: 'ja' }, null);
    expect(cfg.studying.startsWith('ja')).toBe(true);
  });

  it('normaliza ISO-639-1 curto para BCP-47', () => {
    const cfg = langConfigFrom({ captureSourceLang: 'pt' }, 'en');
    expect(cfg.mine).toContain('-');
    expect(cfg.studying).toContain('-');
  });

  it('sem nada, usa o padrão (um palpite em UM lugar só)', () => {
    expect(langConfigFrom(null, undefined)).toEqual(DEFAULT_LANG_CONFIG);
  });
});

/**
 * O TERCEIRO EIXO. A interface era derivada de "Meu idioma" sem alternativa: para ler a tela em
 * inglês era preciso declarar que se fala inglês — e isso inverte a direção do microfone e da
 * tradução de todo cartão. Agora é escolha própria, com o comportamento antigo como padrão.
 */
describe('idioma da interface', () => {
  it('sem escolha, segue "Meu idioma" — ninguém que nunca abriu o seletor vê diferença', () => {
    const cfg = langConfigFrom({ captureSourceLang: 'es-ES' }, 'en-US');
    expect(cfg.daInterface).toBe('es-ES');
  });

  it('a escolha explícita vence, e não muda o idioma que se fala nem o que se estuda', () => {
    const cfg = langConfigFrom({ captureSourceLang: 'pt-BR', uiLang: 'en-US' }, 'ja-JP');
    expect(cfg.daInterface).toBe('en-US');
    expect(cfg.mine).toBe('pt-BR');
    expect(cfg.studying).toBe('ja-JP');
  });

  it('só oferece idioma cujo catálogo passou do piso de cobertura', () => {
    const oferecidos = idiomasDaInterfaceOferecidos().map((c) => c.split('-')[0]);
    expect(oferecidos).toContain('pt');
    expect(oferecidos).toContain('en');
    // `es` tem 20 de 705 chaves: oferecê-lo é prometer uma tela que não existe (achado A38).
    expect(oferecidos).not.toContain('es');
    expect(oferecidos).not.toContain('ar');
  });
});
