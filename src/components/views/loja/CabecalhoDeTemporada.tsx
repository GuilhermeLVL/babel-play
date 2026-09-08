import { Sprout, Coins, Plus, Infinity as Infinito, Sparkles } from 'lucide-react';
import { palavraDeNivel } from '../../../lib/galeria/textos';
import { proximaRecompensa } from '../../../lib/galeria/progressao';
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
 *
 * ── O QUE MUDOU EM 08/09 (volta da branch de gamificação) ────────────────────────────────────
 *
 * A MOEDA GANHOU NOME NA TELA. As duas moedas eram um ícone e um número, e o que dizia qual era
 * qual era o `title` — que exige mouse parado, não existe no toque e não é lido por ninguém com
 * pressa. Agora cada uma tem o rótulo escrito acima do número e o fundo na sua própria cor
 * (`good` para Seeds, `premium` para Créditos), que são as mesmas cores que `ORIGEM` usa para
 * responder "como se consegue" em todas as outras telas.
 *
 * O GOAL-GRADIENT: a barra passou a dizer o que vem no próximo nível, pelo nome do item mais raro
 * e pela contagem (`proximaRecompensa`). "Faltam 120 XP" informa o custo; "faltam 120 XP para o
 * tema Aurora e mais 3 itens" informa o motivo — e era essa metade que faltava.
 *
 * DUAS COISAS DA BRANCH FORAM DESCARTADAS, e o motivo fica aqui para não voltarem por engano:
 *  · O cartão de Créditos passava a renderizar SEMPRE, mostrando "—" quando a carteira não existe.
 *    Anunciar uma moeda que a instalação não tem é oferecer o que não se pode entregar: em
 *    self-host e no modo sem conta o cartão continua fora da tela, como estava.
 *  · O valor virava `carteira.creditos ?? 0` — "0 Créditos" enquanto a resposta do servidor não
 *    chegou. Zero é uma afirmação, e afirma justamente o contrário do provável para quem comprou.
 *    O invariante da casa é `'—'` enquanto não se sabe.
 * Também não voltou a palavra "NÍVEL" cravada no crachá: `palavraDeNivel()` existe porque o
 * perfil infantil chama a mesma coisa por outro nome, e cravar apaga isso.
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
  const faltamXp = progress.available ? Math.max(0, progress.xpForLevel - progress.xpIntoLevel) : 0;
  /* `null` no topo da curva: quando não há mais nível com item, a barra não promete nada — o
      goal-gradient some em vez de inventar um alvo. */
  const proxima = proximaRecompensa(nivel);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <b className="font-display font-black text-[15px] text-ink">
            Temporada {temporada.numero} · {temporada.nome}
          </b>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-2.5 py-0.5 text-[11px] text-ink-muted">
            <Infinito className="w-3 h-3 text-accent" aria-hidden /> sem prazo — o que você ganha não expira
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center gap-2 rounded-xl border border-good bg-good-soft px-3 py-1.5"
            title="Seeds — vêm de praticar e revisar. Não se compram com dinheiro."
          >
            <Sprout className="w-4 h-4 text-good shrink-0" aria-hidden />
            <span className="flex flex-col leading-none">
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-good-ink">Seeds</span>
              <b className="font-mono font-bold text-[14px] text-good tabular-nums">{saldo}</b>
            </span>
          </div>

          {carteira.disponivel && (
            <div
              className="flex items-center gap-2 rounded-xl border border-premium bg-premium-soft px-3 py-1.5"
              title="Créditos — a moeda comprada: o Passe Premium e a prateleira paga."
            >
              <Coins className="w-4 h-4 text-premium shrink-0" aria-hidden />
              <span className="flex flex-col leading-none">
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-premium-ink">Créditos</span>
                <b className="font-mono font-bold text-[14px] text-premium tabular-nums">
                  {/* Enquanto o servidor não responde é "—", nunca 0: zero é uma afirmação. */}
                  {carteira.creditos ?? '—'}
                </b>
              </span>
              {aoComprarCreditos && (
                <button
                  onClick={aoComprarCreditos}
                  aria-label="Comprar Créditos"
                  title="Comprar Créditos"
                  className="w-5 h-5 ms-0.5 rounded-md bg-premium text-white flex items-center justify-center cursor-pointer hover:brightness-110"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── A BARRA DE NÍVEL — o bloco grande é o nível, porque é ele que a pessoa procura ── */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-accent text-accent-contrast flex flex-col items-center justify-center shadow-btn">
            <span className="font-display font-black text-2xl leading-none tabular-nums">{nivel}</span>
            <span className="text-[8px] font-black uppercase tracking-[0.14em] opacity-90 mt-0.5">
              {palavraDeNivel()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline gap-3 flex-wrap mb-1.5">
              <span className="flex items-baseline gap-2 flex-wrap">
                <b className="font-display font-black text-[15px] text-ink">
                  {palavraDeNivel()} {nivel}
                </b>
                {proxima && (
                  <span className="text-[12px] text-ink-muted">
                    a seguir: <b className="text-accent-ink">{proxima.destaque.nome}</b>, no {palavraDeNivel().toLowerCase()} {proxima.nivel}
                  </span>
                )}
              </span>
              <span className="font-mono text-[12px] text-ink-muted tabular-nums">
                {progress.available
                  ? `${progress.xpIntoLevel} / ${progress.xpForLevel} XP · faltam ${faltamXp} XP`
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
            <div className="flex justify-between items-center gap-2 mt-1">
              <span className="font-mono text-[10px] text-ink-faint">nv. {nivel}</span>
              {proxima && (
                <span className="text-[11px] text-accent-ink flex items-center gap-1 text-center">
                  <Sparkles className="w-3 h-3 shrink-0" aria-hidden />
                  {proxima.itens.length === 1
                    ? `1 peça de graça no nv. ${proxima.nivel}`
                    : `${proxima.itens.length} peças de graça no nv. ${proxima.nivel}`}
                </span>
              )}
              <span className="font-mono text-[10px] text-ink-faint">nv. {nivel + 1}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
