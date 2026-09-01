import { Sprout, Coins, Plus, Infinity as Infinito } from 'lucide-react';
import { palavraDeNivel } from '../../../lib/galeria/textos';
import type { Carteira } from '../../../lib/carteira';
import type { DerivedProgress } from '../../../lib/progress';

/**
 * O CABEÇALHO DE TEMPORADA (protótipo aprovado em 01/09, tarefa 3.4).
 *
 * TRÊS COISAS NUMA LINHA SÓ, que antes estavam em três lugares: que temporada é, quanto você tem
 * de cada moeda, e onde está o seu nível. O topo antigo tinha dois cartões de saldo, um blob
 * decorativo e a próxima recompensa — informação boa, arrumação de tela de configuração. Passe de
 * jogo põe a carteira no canto e a barra em destaque, porque é a barra que responde "falta
 * quanto?".
 *
 * SEM CONTAGEM REGRESSIVA. Passes de jogo pressionam com um relógio; aqui não existe data de fim
 * no modelo (`TEMPORADA_ATUAL` é um rótulo) e inventar um prazo seria um controle falso — pior,
 * seria mentir para apressar. A linha diz o contrário: o que você ganhou não expira.
 *
 * O "+" da carteira só aparece quando existe algo para comprar (`carteira.disponivel`): em
 * self-host e no modo sem conta, a moeda comprada não existe e o botão não deve prometer loja.
 */

export default function CabecalhoDeTemporada({
  progress, saldo, carteira, temporada, aoComprarCreditos,
}: {
  progress: DerivedProgress;
  /** Seeds — derivadas do progresso, como sempre foram. */
  saldo: number;
  carteira: Carteira;
  temporada: { nome: string; numero: number };
  aoComprarCreditos?: () => void;
}) {
  const nivel = progress.available ? progress.level : 1;
  const pct = progress.available ? progress.levelPct : 0;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-baseline gap-2.5 flex-1 min-w-[180px] flex-wrap">
          <b className="font-display font-black text-[15px] text-ink">
            Temporada {temporada.numero} · {temporada.nome}
          </b>
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
            <Infinito className="w-3.5 h-3.5" aria-hidden /> sem prazo — o que você ganha não expira
          </span>
        </div>

        <div className="flex gap-2">
          <span
            className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-1.5"
            title="Seeds — a moeda que vem de estudar"
          >
            <Sprout className="w-4 h-4 text-good" aria-hidden />
            <b className="font-mono font-bold text-[14px] text-good tabular-nums">{saldo}</b>
          </span>
          {carteira.disponivel && (
            <span
              className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-1.5"
              title="Créditos — a moeda comprada, só para enfeite"
            >
              <Coins className="w-4 h-4 text-premium" aria-hidden />
              <b className="font-mono font-bold text-[14px] text-premium tabular-nums">
                {/* Enquanto o servidor não responde é "—", nunca 0: zero é uma afirmação. */}
                {carteira.creditos ?? '—'}
              </b>
              {aoComprarCreditos && (
                <button
                  onClick={aoComprarCreditos}
                  aria-label="Comprar Créditos"
                  className="w-5 h-5 rounded-md bg-premium text-white flex items-center justify-center cursor-pointer hover:brightness-110"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden />
                </button>
              )}
            </span>
          )}
        </div>
      </div>

      {/* ── A BARRA DE NÍVEL — o bloco grande é o nível, porque é ele que a pessoa procura ── */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 shrink-0 rounded-2xl bg-accent text-accent-contrast flex flex-col items-center justify-center shadow-btn">
          <span className="font-display font-black text-2xl leading-none tabular-nums">{nivel}</span>
          <span className="text-[8px] font-black uppercase tracking-[0.14em] opacity-90 mt-0.5">
            {palavraDeNivel()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline gap-3 flex-wrap mb-1.5">
            <b className="font-display font-black text-[15px] text-ink">
              {palavraDeNivel()} {nivel}
            </b>
            <span className="font-mono text-[12px] text-ink-muted tabular-nums">
              {progress.available
                ? `${progress.xpIntoLevel} / ${progress.xpForLevel} XP · faltam ${Math.max(0, progress.xpForLevel - progress.xpIntoLevel)}`
                : '…'}
            </span>
          </div>
          <div
            className="h-3 rounded-full bg-canvas border border-border-subtle overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemax={100}
            aria-label={`Progresso para ${palavraDeNivel().toLowerCase()} ${nivel + 1}`}
          >
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[10px] text-ink-faint">nv. {nivel}</span>
            <span className="font-mono text-[10px] text-ink-faint">nv. {nivel + 1}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
