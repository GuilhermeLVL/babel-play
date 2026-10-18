export const STABILITY_THRESHOLD_DEFAULT = 10;

export function stabilityThreshold(): number {
  const saved =
    typeof localStorage !== 'undefined' ? localStorage.getItem('practice.activeProduction.stabilityThreshold') : null;
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return STABILITY_THRESHOLD_DEFAULT;
}
