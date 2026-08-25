import { describe, it, expect, beforeEach, vi } from 'vitest';
import { expectedModelIds } from '../src/gateway/modelCache';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe('expectedModelIds', () => {
  it('default: whisper-tiny + par EN→ROMANCE', () => {
    expect(expectedModelIds('en', 'pt')).toEqual([
      'onnx-community/whisper-tiny',
      'Xenova/opus-mt-en-ROMANCE',
    ]);
  });

  it('respeita o override babel.whisperModel (o bug do falso "Baixando")', () => {
    store.set('babel.whisperModel', 'onnx-community/whisper-base');
    expect(expectedModelIds('pt', 'en')).toEqual([
      'onnx-community/whisper-base',
      'Xenova/opus-mt-ROMANCE-en',
    ]);
  });

  it('par sem opus-mt local não espera modelo de MT', () => {
    expect(expectedModelIds('ja', 'pt')).toEqual(['onnx-community/whisper-tiny']);
  });

  it('aceita BCP-47 completo', () => {
    expect(expectedModelIds('en-US', 'pt-BR')).toContain('Xenova/opus-mt-en-ROMANCE');
  });
});
