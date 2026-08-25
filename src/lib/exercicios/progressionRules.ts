import { VocabCard, ExerciseFormat } from '../../types';

export const STABILITY_THRESHOLD_DEFAULT = 10;

export function stabilityThreshold(): number {
  const saved =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('practice.activeProduction.stabilityThreshold')
      : null;
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return STABILITY_THRESHOLD_DEFAULT;
}

export function formatForCard(card: VocabCard): ExerciseFormat {
  const stability = card.stability ?? card.fsrsStability;
  if (stability === undefined || stability < 3) {
    return 'mc';
  }
  if (stability >= 3 && stability < stabilityThreshold()) {
    return 'typing';
  }
  return 'active-production';
}
