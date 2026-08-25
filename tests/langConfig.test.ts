import { describe, it, expect } from 'vitest';
import { langConfigFrom, DEFAULT_LANG_CONFIG } from '../src/lib/langConfig';

describe('langConfigFrom', () => {
  it('settings.targetLanguage é autoritativo sobre o blob ui', () => {
    const cfg = langConfigFrom({ captureSourceLang: 'pt-BR', captureTargetLang: 'fr-FR' }, 'en-US');
    expect(cfg).toEqual({ mine: 'pt-BR', studying: 'en-US' });
  });

  it('cai no blob ui quando targetLanguage está vazio', () => {
    const cfg = langConfigFrom({ captureSourceLang: 'pt-BR', captureTargetLang: 'fr-FR' }, null);
    expect(cfg.studying).toBe('fr-FR');
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
