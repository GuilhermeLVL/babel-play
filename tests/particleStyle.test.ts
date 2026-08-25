import { describe, it, expect } from 'vitest';
import {
  resolveParticleStyle,
  PARTICLE_PRESETS,
  MIN_AMBIENT_ALPHA_DARK,
  MIN_AMBIENT_ALPHA_LIGHT,
} from '../src/lib/effects';
import type { ThemeType } from '../src/lib/appearance';

const TEMAS = Object.keys(PARTICLE_PRESETS) as ThemeType[];

describe('resolveParticleStyle — nenhum tema pode ficar invisível', () => {
  /**
   * O BUG RELATADO: "as partículas só aparecem num tema". Não era impressão — `vercel` (0.06) e
   * `notion` (0.07) foram calibrados no escuro e, sobre fundo claro, opacidade nessa faixa é
   * invisível na prática. Este teste é a rede que impede a recaída, inclusive em tema futuro.
   */
  it('todo tema, nos DOIS modos, respeita o piso de opacidade', () => {
    for (const tema of TEMAS) {
      for (const escuro of [true, false]) {
        const r = resolveParticleStyle(tema, escuro);
        const piso = escuro ? MIN_AMBIENT_ALPHA_DARK : MIN_AMBIENT_ALPHA_LIGHT;
        expect(r.alpha[0], `${tema} / ${escuro ? 'escuro' : 'claro'}`).toBeGreaterThanOrEqual(piso);
        expect(r.alpha[1]).toBeGreaterThanOrEqual(r.alpha[0]);
        expect(r.alpha[1]).toBeLessThanOrEqual(0.85); // teto: pó, não confete
      }
    }
  });

  it('os temas monocromáticos eram os invisíveis — e agora passam do piso', () => {
    for (const tema of ['vercel', 'notion'] as ThemeType[]) {
      expect(PARTICLE_PRESETS[tema].alpha[0]).toBeLessThan(MIN_AMBIENT_ALPHA_LIGHT); // era invisível
      expect(resolveParticleStyle(tema, false).alpha[0]).toBeGreaterThanOrEqual(MIN_AMBIENT_ALPHA_LIGHT);
    }
  });

  it('o claro compensa o fundo: mais opaco que o escuro', () => {
    for (const tema of TEMAS) {
      const claro = resolveParticleStyle(tema, false);
      const escuro = resolveParticleStyle(tema, true);
      expect(claro.alpha[0]).toBeGreaterThanOrEqual(escuro.alpha[0]);
    }
  });

  it('a composição segue o modo: soma luz no escuro, normal no claro', () => {
    for (const tema of TEMAS) {
      expect(resolveParticleStyle(tema, true).composite).toBe('lighter');
      expect(resolveParticleStyle(tema, false).composite).toBe('source-over');
    }
  });

  it('o halo só vale no escuro (no claro vira borrão pálido)', () => {
    for (const tema of TEMAS) {
      expect(resolveParticleStyle(tema, false).glow).toBe(false);
      expect(resolveParticleStyle(tema, true).glow).toBe(PARTICLE_PRESETS[tema].glow);
    }
  });

  it('preserva a identidade do tema: token de cor, contagem e tamanho intactos', () => {
    for (const tema of TEMAS) {
      const r = resolveParticleStyle(tema, true);
      expect(r.colorToken).toBe(PARTICLE_PRESETS[tema].colorToken);
      expect(r.ambientCount).toBe(PARTICLE_PRESETS[tema].ambientCount);
      expect(r.size).toEqual(PARTICLE_PRESETS[tema].size);
    }
  });

  it('tema desconhecido cai no neutro em vez de quebrar', () => {
    const r = resolveParticleStyle('inexistente' as ThemeType, true);
    expect(r.colorToken).toBe(PARTICLE_PRESETS.custom.colorToken);
  });
});
