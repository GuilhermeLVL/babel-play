import { describe, it, expect } from 'vitest';
import { routeStt, WHISPER_MODELS } from '../src/gateway/sttRouter';

const base = {
  contentLang: 'pt',
  autoDetect: false,
  quality: 'auto' as const,
  hasWebGpu: true,
  cloudAvailable: true,
  profileId: 'free-web',
};

describe('routeStt — a régua de qualidade por idioma', () => {
  it('inglês em auto fica no tiny local (rápido e suficiente)', () => {
    const r = routeStt({ ...base, contentLang: 'en' });
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.tiny, preferCloud: false });
  });

  it('não-EN em auto com nuvem disponível → nuvem primeiro, reserva base', () => {
    const r = routeStt({ ...base, contentLang: 'pt' });
    expect(r.preferCloud).toBe(true);
    expect(r.localModel).toBe(WHISPER_MODELS.base);
  });

  it('não-EN sem nuvem → small no WebGPU', () => {
    const r = routeStt({ ...base, cloudAvailable: false });
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.small, preferCloud: false });
  });

  it('não-EN sem nuvem e SEM WebGPU → base (small é lento demais em WASM)', () => {
    const r = routeStt({ ...base, cloudAvailable: false, hasWebGpu: false });
    expect(r.localModel).toBe(WHISPER_MODELS.base);
  });

  it('multi-idioma (autoDetect) conta como não-EN mesmo com contentLang en', () => {
    const r = routeStt({ ...base, contentLang: 'en', autoDetect: true });
    expect(r.preferCloud).toBe(true);
  });

  it('perfil Privado/Local NUNCA prefere nuvem, em nenhuma qualidade', () => {
    for (const quality of ['auto', 'cloud'] as const) {
      const r = routeStt({ ...base, profileId: 'local-private', quality });
      expect(r.preferCloud).toBe(false);
    }
  });

  it('qualidade "fast" força tiny mesmo em PT', () => {
    expect(routeStt({ ...base, quality: 'fast' }).localModel).toBe(WHISPER_MODELS.tiny);
  });

  it('qualidade "accurate" força o melhor local e ignora a nuvem', () => {
    const r = routeStt({ ...base, quality: 'accurate' });
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.small, preferCloud: false });
  });

  it('qualidade "cloud" sem nuvem disponível degrada honesto para o melhor local', () => {
    const r = routeStt({ ...base, quality: 'cloud', cloudAvailable: false });
    expect(r.preferCloud).toBe(false);
    expect(r.localModel).toBe(WHISPER_MODELS.small);
    expect(r.label).toContain('indisponível');
  });

  it('BCP-47 completo é normalizado (en-US → inglês)', () => {
    expect(routeStt({ ...base, contentLang: 'en-US' }).preferCloud).toBe(false);
  });
});
