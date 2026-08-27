import { Bot, Flame, Sprout } from 'lucide-react';
import { compactNumber, type DerivedProgress } from '../../lib/progress';
import type { AgeProfileType } from '../../lib/profile';
import { Barra } from '../ui';

/**
 * A FAIXA DE PROGRESSO — nível, XP, ofensiva e seeds.
 *
 * Saiu de dentro de `Hub.tsx` porque passou a ter DOIS leitores: o Início e a tela de Perfil. Duas
 * cópias da mesma faixa divergiriam na primeira mudança de fórmula, e o número que o app mostra
 * sobre o seu progresso não pode depender de por qual porta você entrou.
 *
 * `available: false` vira ESQUELETO, nunca zeros. Um "Nível 1 · 0 XP" durante o carregamento é um
 * número falso, e quem olha não tem como saber que ainda vai mudar — a decisão é a mesma do
 * `StatPill` do shell e está registrada em `lib/progress.ts` (`EMPTY_PROGRESS`).
 */
export default function FaixaDeProgresso({ progress, ageProfile }: { progress: DerivedProgress; ageProfile: AgeProfileType }) {
  /**
   * O ESQUELETO TEM A MESMA CAIXA DA FAIXA REAL, e não uma altura escolhida a olho.
   *
   * Era `h-20` fixo (80px) contra uma seção `flex-col sm:flex-row` com `p-5`: batia de raspão no
   * desktop e errava por mais de 100px no celular, onde os três blocos empilham — e a diferença
   * virava salto no instante em que as métricas chegavam (parte do CLS 0,311 medido no Início,
   * achado F0-02). Repetindo aqui as mesmas classes de layout, a altura reservada passa a ser
   * calculada pelas mesmas regras nos dois tamanhos de tela; só os três blocos internos são
   * declarados, com a altura que o conteúdo real tem.
   */
  if (!progress.available) {
    return (
      <div
        className="mb-8 card-panel bg-surface p-5 flex flex-col sm:flex-row sm:items-center gap-5 animate-pulse"
        aria-hidden
      >
        {/* As três alturas somam os 196px que a faixa real mede a 412px de largura (medido no
            build de produção, viewport do Lighthouse); a partir de `sm` os blocos ficam lado a
            lado e a maior delas manda, como na faixa real. */}
        <div className="h-11 w-44 rounded-2xl bg-surface-hover shrink-0" />
        <div className="flex-1 min-w-0 h-[34px] rounded-lg bg-surface-hover" />
        <div className="h-9 w-32 rounded-lg bg-surface-hover shrink-0" />
      </div>
    );
  }

  const levelWord = ageProfile === 'senior' ? 'Etapa' : 'Nível';

  return (
    <section
      aria-label="Seu progresso"
      className="mb-8 card-panel bg-surface p-5 flex flex-col sm:flex-row sm:items-center gap-5"
    >
      <div className="flex items-center gap-3 shrink-0">
        <span className="w-11 h-11 rounded-2xl bg-accent-soft text-accent-ink flex items-center justify-center shrink-0" aria-hidden>
          <Bot className="w-5 h-5" />
        </span>
        <div>
          <div className="label-mono">{levelWord} {progress.level}</div>
          <div className="font-display font-black text-ink text-lg leading-tight">
            {progress.xpIntoLevel} / {progress.xpForLevel} XP
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <Barra
          pct={progress.levelPct}
          rotuloAcessivel={`Progresso para ${levelWord.toLowerCase()} ${progress.level + 1}`}
        />
        <p className="text-[11.5px] text-ink-muted mt-1.5">
          {progress.practicedToday
            ? `Você já revisou hoje, ofensiva de ${progress.streakDays} ${progress.streakDays === 1 ? 'dia' : 'dias'}.`
            : 'Uma revisão hoje mantém a sua ofensiva viva.'}
        </p>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="text-center">
          <div className="flex items-center gap-1.5 font-display font-black text-ink text-lg leading-none">
            <Flame className="w-4 h-4 text-warn" aria-hidden /> {progress.streakDays}
          </div>
          <div className="label-mono mt-1">Ofensiva</div>
        </div>
        <div className="text-center">
          <div className="flex items-center gap-1.5 font-display font-black text-ink text-lg leading-none">
            <Sprout className="w-4 h-4 text-good" aria-hidden /> {compactNumber(progress.seeds)}
          </div>
          <div className="label-mono mt-1">Seeds</div>
        </div>
      </div>
    </section>
  );
}
