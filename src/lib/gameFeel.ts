import confetti from 'canvas-confetti';
import { play, SoundEvent } from './soundFx';
import { emitBurst, type BurstKind } from './effects';
import { tremor, flashDeTela, pulsoDeZoom, pontosFlutuantes } from './juice';

/**
 * GAME FEEL ENGINE ("JUICE") — BABEL PLAY
 *
 * Módulo unificado de alta fidelidade sensorial para minigames de idiomas:
 * 1. 🎊 Chuva de Confetes 3D Realista (canvas-confetti)
 * 2. 📳 Haptic Feedback (navigator.vibrate)
 * 3. 📳 Parametric Screen Shake (Tremores de impacto e câmera)
 * 4. 🎵 Pitch-Shifting Audio Escalation (Web Audio com escala musical de semitons por combo)
 * 5. 🔥 Multiplicadores de Combo Dinâmicos e Modo Febre (Fever Mode)
 */

export type ShakeIntensity = 'soft' | 'medium' | 'heavy';
export type HapticType = 'soft' | 'success' | 'combo' | 'heavy' | 'error';

/** Dispara feedback háptico tátil em dispositivos móveis (ignorado silenciosamente se não suportado) */
export function triggerHaptic(type: HapticType = 'soft'): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.vibrate) return;

  try {
    switch (type) {
      case 'soft':
        navigator.vibrate(12);
        break;
      case 'success':
        navigator.vibrate([15, 30, 20]);
        break;
      case 'combo':
        navigator.vibrate([20, 30, 25, 30, 40]);
        break;
      case 'heavy':
        navigator.vibrate([50, 30, 50]);
        break;
      case 'error':
        navigator.vibrate([80, 40, 100]);
        break;
    }
  } catch {
    // Degradação graciosa
  }
}

/** Dispara chuva de confetes 3D com a paleta harmonizada do Babel Play */
export function triggerConfetti(options?: confetti.Options): void {
  try {
    // Paleta elegante do Babel Play: terracota, índigo, esmeralda, dourado, violeta
    const colors = ['#f59e0b', '#10b981', '#6366f1', '#ec4899', '#3b82f6', '#14b8a6'];
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.7 },
      colors,
      disableForReducedMotion: true,
      ...options,
    });
  } catch {
    // Fallback silencioso
  }
}

/** Explosão de vitória dupla pelos canhões laterais da tela */
export function triggerVictoryConfetti(): void {
  try {
    const end = Date.now() + 1.2 * 1000;
    const colors = ['#f59e0b', '#10b981', '#6366f1', '#f43f5e'];

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  } catch {
    // Fallback silencioso
  }
}

/** Aplica Screen Shake físico em um elemento ou container */
export function triggerShake(target: HTMLElement | null, intensity: ShakeIntensity = 'medium'): void {
  if (!target) return;
  const amplitudes: Record<ShakeIntensity, number> = {
    soft: 3,
    medium: 6,
    heavy: 12,
  };
  tremor(target, amplitudes[intensity]);
}

/**
 * Disparo sensorial completo de ACERTO ("Juiced Hit")
 * Conecta áudio com pitch aumentado por combo, faíscas em coordenadas exatas,
 * pulso háptico e números flutuantes!
 */
export function playJuicedHit(
  combo: number,
  coords?: { x: number; y: number },
  customText?: string
): void {
  const x = coords?.x ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 200);
  const y = coords?.y ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 200);

  // Escalonamento musical de semitons: cada nível de combo sobe +1 semitom!
  const transpose = Math.min(combo, 8);
  play('success', { transpose });

  // Haptic
  triggerHaptic(combo >= 3 ? 'combo' : 'success');

  // Partículas locais
  emitBurst(x, y, combo >= 3 ? 'combo' : 'xp');

  // Pontos flutuantes
  const texto = customText || (combo > 1 ? `${combo}x COMBO!` : '+100');
  pontosFlutuantes(texto, x, y, 'bom');

  // Zoom da câmera em combos altos (Fever Mode)
  if (combo >= 4) {
    pulsoDeZoom();
  }
}

/**
 * Disparo sensorial completo de ERRO ("Juiced Error")
 * Conecta buzzer áspero, vibração háptica de advertência,
 * tremor violento de tela e flash de câmera.
 */
export function playJuicedError(
  target: HTMLElement | null,
  coords?: { x: number; y: number },
  customText?: string
): void {
  const x = coords?.x ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 200);
  const y = coords?.y ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 200);

  play('error');
  triggerHaptic('error');
  triggerShake(target, 'heavy');
  flashDeTela();

  if (customText) {
    pontosFlutuantes(customText, x, y, 'ruim');
  }
}

/**
 * Disparo completo de VITÓRIA OU FIM DE RODADA PERFEITA
 */
export function playJuicedVictory(): void {
  play('fanfarra');
  triggerHaptic('combo');
  triggerVictoryConfetti();
  pulsoDeZoom();
}

/**
 * Helper para calcular multiplicador de pontos pelo combo
 */
export function calculateMultiplier(combo: number): number {
  if (combo >= 6) return 5; // FEVER MODE
  if (combo >= 4) return 3;
  if (combo >= 2) return 2;
  return 1;
}
