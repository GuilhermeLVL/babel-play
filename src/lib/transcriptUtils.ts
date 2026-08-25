export interface TranscriptSettings {
  fontSize: 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
  textColor: 'standard' | 'highContrast' | 'sepia' | 'ocean' | 'neon';
  fontFamily: 'sans' | 'serif' | 'mono';
  displayOrder: 'original-first' | 'translated-first';
  hideOriginal: boolean;
}

export const DEFAULT_TRANSCRIPT_SETTINGS: TranscriptSettings = {
  fontSize: 'medium',
  textColor: 'standard',
  fontFamily: 'sans',
  displayOrder: 'original-first',
  hideOriginal: false,
};

export function getTranscriptStyleClasses(settings: TranscriptSettings) {
  let sizeClasses = {
    original: 'text-[15px]',
    translated: 'text-[13px]',
  };
  if (settings.fontSize === 'small') {
    sizeClasses = { original: 'text-[13px]', translated: 'text-[11px]' };
  } else if (settings.fontSize === 'large') {
    sizeClasses = { original: 'text-[18px]', translated: 'text-[15px]' };
  } else if (settings.fontSize === 'xlarge') {
    sizeClasses = { original: 'text-[22px]', translated: 'text-[18px]' };
  } else if (settings.fontSize === 'xxlarge') {
    sizeClasses = { original: 'text-[28px]', translated: 'text-[22px]' };
  }

  let fontClass = 'font-sans';
  if (settings.fontFamily === 'serif') {
    fontClass = 'font-serif';
  } else if (settings.fontFamily === 'mono') {
    fontClass = 'font-mono';
  }

  let colorClasses = {
    container: '',
    original: 'text-ink font-medium',
    translated: 'text-ink-muted italic',
  };
  // Presets de leitura da transcrição (Alto Contraste/Sépia/Oceano/Neon) são INDEPENDENTES do tema de
  // 6 cores do app — por isso não usam os tokens --color-* (que mudariam a "cara" do preset conforme
  // o tema ativo, o oposto do que o usuário pediu ao escolher "Sépia"). As cores vêm de variáveis CSS
  // fixas declaradas em src/index.css (--transcript-*), não mais de hex cru espalhado aqui.
  if (settings.textColor === 'highContrast') {
    colorClasses = {
      container: 'bg-white text-black p-4 rounded-xl border-2 border-black shadow-none',
      original: 'text-black font-extrabold bg-[var(--transcript-highlight)] px-1',
      translated: 'text-black/90 font-bold underline decoration-dotted',
    };
  } else if (settings.textColor === 'sepia') {
    colorClasses = {
      container: 'bg-[var(--transcript-sepia-bg)] text-[var(--transcript-sepia-text)] p-4 rounded-xl border border-[var(--transcript-sepia-border)]',
      original: 'text-[var(--transcript-sepia-text)] font-semibold',
      translated: 'text-[var(--transcript-sepia-text-soft)] italic',
    };
  } else if (settings.textColor === 'ocean') {
    colorClasses = {
      container: 'bg-[var(--transcript-ocean-bg)] text-[var(--transcript-ocean-text)] p-4 rounded-xl border border-[var(--transcript-ocean-border)]',
      original: 'text-[var(--transcript-ocean-text)] font-semibold',
      translated: 'text-[var(--transcript-ocean-text-soft)] italic',
    };
  } else if (settings.textColor === 'neon') {
    colorClasses = {
      container: 'bg-[var(--transcript-neon-bg)] text-[var(--transcript-neon-text)] p-4 rounded-xl border border-[var(--transcript-neon-border)] font-mono',
      original: 'text-[var(--transcript-neon-original)] font-bold bg-[var(--transcript-neon-chip)]/80 px-1.5 py-0.5 rounded',
      translated: 'text-[var(--transcript-neon-translated)] font-mono bg-[var(--transcript-neon-chip)]/80 px-1.5 py-0.5 rounded',
    };
  }

  return { sizeClasses, fontClass, colorClasses };
}
