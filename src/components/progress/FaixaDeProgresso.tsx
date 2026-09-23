import { Bot, Flame, Sprout } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { proximaRecompensa } from '../../lib/galeria/progressao';
import { t, tp } from '../../lib/i18n';
import { type AgeProfileType, copyDoPerfil } from '../../lib/profile';
import { compactNumber, type DerivedProgress } from '../../lib/progress';
import { IconeEmBloco } from '../ui';

/**
 * A FAIXA DE PROGRESSO — nível, XP, ofensiva e seeds.
 *
 * Saiu de dentro de `Hub.tsx` porque passou a ter DOIS leitores: o Início e a tela de Perfil. Duas
 * cópias da mesma faixa divergiriam na primeira mudança de fórmula, e o número que o app mostra
 * sobre o seu progresso não pode depender de por qual porta você entrou.
 *
 * `available: false` vira ESQUELETO, nunca zeros. Um "Nível 1 · 0 XP" durante o carregamento é um
 * número falso, e quem olha não tem como saber que ainda vai mudar — a decisão está registrada em
 * `lib/progress.ts` (`EMPTY_PROGRESS`).
 */
export default function FaixaDeProgresso({
  progress,
  ageProfile,
  className = '',
  destaque = false,
  style,
  children,
}: {
  progress: DerivedProgress;
  ageProfile: AgeProfileType;
  className?: string;
  /** Borda em acento (o Início liga quando há revisão pendente, como no protótipo). */
  destaque?: boolean;
  style?: CSSProperties;
  /** O que vem colado embaixo, na mesma peça — a faixa de revisão do Início. */
  children?: ReactNode;
}) {
  /* Marcação do protótipo aprovado (`T.inicio`): `.cartao` > `.progresso` (`.nivel`, barra e frase,
     `.numeros`), e a faixa de revisão por baixo. `available: false` vira esqueleto com a mesma
     caixa, nunca zeros (`EMPTY_PROGRESS` em lib/progress.ts). */
  const estilo: CSSProperties = {
    ...style,
    ...(destaque ? { borderColor: 'color-mix(in srgb,var(--accent) 45%,var(--border-subtle))' } : {}),
  };
  if (!progress.available) {
    return (
      <section className={`cartao ${className}`} style={estilo} aria-hidden>
        <div className="progresso animate-pulse">
          <div className="h-11 w-44 rounded-2xl bg-surface-hover" />
          <div className="h-[34px] rounded-lg bg-surface-hover" />
          <div className="h-9 w-32 rounded-lg bg-surface-hover" />
        </div>
      </section>
    );
  }

  const levelWord = copyDoPerfil('word.level', ageProfile);
  // Sênior: um conceito só (auditoria de UX, 31/08) — sem os contadores gêmeos nem o teaser.
  const simples = ageProfile === 'senior';
  const proxima = simples ? null : proximaRecompensa(progress.level);
  const faltam = progress.xpForLevel - progress.xpIntoLevel;

  return (
    <section className={`cartao ${className}`} style={estilo} aria-label={t('Seu progresso')}>
      <div className="progresso">
        <div className="nivel">
          <IconeEmBloco icone={Bot} />
          <div>
            <span className="label-mono">
              {levelWord} {progress.level}
            </span>
            <span className="v">
              {progress.xpIntoLevel} / {progress.xpForLevel} XP
            </span>
          </div>
        </div>
        <div>
          <div
            className="barra"
            role="progressbar"
            aria-label={t('Progresso para o {nivel} {n}', { nivel: levelWord.toLowerCase(), n: progress.level + 1 })}
            aria-valuemin={0}
            aria-valuemax={progress.xpForLevel}
            aria-valuenow={progress.xpIntoLevel}
          >
            <span style={{ width: `${progress.levelPct}%` }} />
          </div>
          <p className="mut" style={{ fontSize: 12.5, marginTop: 8 }}>
            {progress.practicedToday
              ? tp(progress.streakDays, 'Você revisou hoje, ofensiva de {n} dia.', 'Você revisou hoje, ofensiva de {n} dias.')
              : t('Uma revisão hoje começa a sua ofensiva.')}{' '}
            {t('Faltam {n} XP', { n: faltam })}
            {proxima && (
              <>
                {' · '}
                {t('próximo:')} <b style={{ color: 'var(--ink)' }}>{proxima.destaque.nome}</b>
              </>
            )}
          </p>
        </div>
        {!simples && (
          <div className="numeros">
            <div>
              <span className="v">
                <Flame style={{ color: 'var(--warn)' }} className={progress.streakDays ? 'chama-acesa' : ''} aria-hidden />
                {progress.streakDays}
              </span>
              <span className="label-mono">{t('Ofensiva')}</span>
            </div>
            <div>
              <span className="v">
                <Sprout style={{ color: 'var(--good)' }} aria-hidden />
                {compactNumber(progress.seeds)}
              </span>
              <span className="label-mono">{t('Seeds')}</span>
            </div>
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
