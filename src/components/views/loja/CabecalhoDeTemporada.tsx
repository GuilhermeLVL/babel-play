/* DO MODULO, e nao do barril (achado A43): o cabeçalho só precisa da régua da temporada. */
import { NIVEIS_DA_TEMPORADA, recompensaDaTrilha, XP_POR_NIVEL_DA_TEMPORADA } from '@core/temporada';
import { Coins, Infinity as Infinito, Plus, Sparkles, Sprout } from 'lucide-react';

import type { TemporadaNoServidor } from '../../../data/api';
import type { Carteira } from '../../../lib/carteira';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { palavraDeNivel } from '../../../lib/galeria/textos';
import { t } from '../../../lib/i18n';

/**
 * O CABEÇALHO DE TEMPORADA (protótipo aprovado em 01/09, tarefa 3.4).
 *
 * TRÊS COISAS NUMA LINHA SÓ, que antes estavam em três lugares: que temporada é, quanto você tem
 * de cada moeda, e onde está o seu nível. O topo antigo tinha dois cartões de saldo, um blob
 * decorativo e a próxima recompensa — informação boa, arrumação de tela de configuração. Passe de
 * jogo põe a carteira no canto e a barra em destaque, porque é a barra que responde "falta
 * quanto?".
 *
 * SEM CONTAGEM REGRESSIVA AQUI. A temporada tem datas desde a onda 5 das recompensas v2
 * (`core/temporada.ts`), e quem as mostra é a faixa da própria trilha (`PasseDeTemporada`) — com a
 * contagem de dias só para adulto. O cabeçalho repete a promessa que continua valendo: o que você
 * ganha não expira.
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
 *
 * ── O NÍVEL É O DA TEMPORADA (recompensas v2, 27/09) ──────────────────────────────────────────
 *
 * A barra mostrava o nível da CONTA ("Nível 1 · 0/100 XP · a seguir: Linear Indigo") mesmo antes
 * de a temporada começar — o progresso da conta vestido de temporada. Agora ela lê o que o
 * servidor somou na janela (`GET /api/metrics/temporada`): nível, XP no nível e a próxima casa
 * da trilha grátis. Fora das datas (e enquanto carrega, ou sem resposta) não há barra nenhuma:
 * quem fala é a faixa "Próxima temporada em N dias" do `PasseDeTemporada`, que já cuida do perfil
 * protegido. O nível da conta continua em Conquistas ("Como subir de nível").
 */

/** A próxima casa da trilha grátis acima do nível atual, ou `null` na trilha completa. */
function proximaCasa(nivel: number, temporadaId: string): { nivel: number; rotulo: string } | null {
  for (let nv = nivel + 1; nv <= NIVEIS_DA_TEMPORADA; nv++) {
    const r = recompensaDaTrilha(nv, 'gratis', temporadaId);
    if (!r) continue;
    return { nivel: nv, rotulo: 'seeds' in r ? t('+{n} Seeds', { n: r.seeds }) : r.nome };
  }
  return null;
}

export default function CabecalhoDeTemporada({
  estado,
  saldo,
  carteira,
  aoComprarCreditos,
}: {
  /** O que o servidor disse da temporada (`useTemporada`): `undefined` carregando, `null` sem resposta. */
  estado: TemporadaNoServidor | null | undefined;
  /** Seeds — derivadas do progresso, como sempre foram. */
  saldo: number;
  carteira: Carteira;
  aoComprarCreditos?: () => void;
}) {
  const atual = estado?.temporada ?? null;
  /* A temporada em curso ou a próxima; `null` sem nenhuma anunciada. */
  const temporada = atual ?? estado?.proxima ?? null;
  const questNovo = useQuestNovo();

  /* NO META QUEST (telas novas): o mesmo conteúdo nas peças do desenho do headset. As duas carteiras são
     pílulas de 48 px; a de Créditos é o próprio botão de comprar (o "+" de 20 px não é um alvo no Quest). */
  if (questNovo)
    return (
      <section className="q-secao">
        <header>
          <div>
            <h2>
              {temporada ? t('Temporada {n} · {nome}', { n: temporada.numero, nome: temporada.nome }) : t('Temporada')}
            </h2>
            <p>{t('o que você ganha não expira')}</p>
          </div>
          <span className="q-chip qp-seeds">
            <Sprout aria-hidden />
            <b className="tn">{saldo}</b> Seeds
          </span>
          {carteira.disponivel &&
            (aoComprarCreditos ? (
              <button
                type="button"
                className="q-chip qp-creditos"
                onClick={aoComprarCreditos}
                aria-label="Comprar Créditos"
              >
                <Coins aria-hidden />
                {/* Enquanto o servidor não responde é "—", nunca 0: zero é uma afirmação. */}
                <b className="tn">{carteira.creditos ?? '—'}</b> Créditos
                <Plus aria-hidden />
              </button>
            ) : (
              <span className="q-chip qp-creditos">
                <Coins aria-hidden />
                <b className="tn">{carteira.creditos ?? '—'}</b> Créditos
              </span>
            ))}
        </header>
        {atual && estado && <BarraDaTemporada xp={estado.xp} nivel={estado.nivel} temporadaId={atual.id} quest />}
      </section>
    );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <b className="font-display font-black text-[15px] text-ink">
            {temporada ? t('Temporada {n} · {nome}', { n: temporada.numero, nome: temporada.nome }) : t('Temporada')}
          </b>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-2.5 py-0.5 text-[11px] text-ink-muted">
            <Infinito className="w-3 h-3 text-accent" aria-hidden /> {t('o que você ganha não expira')}
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
              title="Créditos — a moeda comprada: a prateleira paga."
            >
              <Coins className="w-4 h-4 text-premium shrink-0" aria-hidden />
              <span className="flex flex-col leading-none">
                <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-premium-ink">
                  Créditos
                </span>
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

      {/* ── A BARRA DO NÍVEL DA TEMPORADA — só durante a temporada ── */}
      {atual && estado && <BarraDaTemporada xp={estado.xp} nivel={estado.nivel} temporadaId={atual.id} />}
    </section>
  );
}

function BarraDaTemporada({
  xp,
  nivel,
  temporadaId,
  quest = false,
}: {
  xp: number;
  nivel: number;
  temporadaId: string;
  /** No headset: as mesmas contas, nas peças do desenho novo. */
  quest?: boolean;
}) {
  const completa = nivel >= NIVEIS_DA_TEMPORADA;
  const noNivel = completa ? XP_POR_NIVEL_DA_TEMPORADA : Math.max(0, xp - nivel * XP_POR_NIVEL_DA_TEMPORADA);
  const pct = Math.min(100, Math.round((noNivel / XP_POR_NIVEL_DA_TEMPORADA) * 100));
  const proxima = proximaCasa(nivel, temporadaId);
  const palavra = palavraDeNivel();
  const seguinte = Math.min(NIVEIS_DA_TEMPORADA, nivel + 1);
  const progresso = completa
    ? t('trilha completa')
    : t('{xp} / {total} XP · faltam {falta} XP', {
        xp: noNivel,
        total: XP_POR_NIVEL_DA_TEMPORADA,
        falta: XP_POR_NIVEL_DA_TEMPORADA - noNivel,
      });
  if (quest)
    return (
      <div className="q-cartao qp-nivel-da-temporada">
        <div className="qp-cracha" data-testid="nivel-da-temporada">
          <b>{nivel}</b>
          <span>{palavra}</span>
        </div>
        <div className="qp-pilha">
          <div className="qp-nivel-linha">
            <b>{t('{palavra} {n} da temporada', { palavra, n: nivel })}</b>
            <span className="q-rotulo">{progresso}</span>
          </div>
          <div
            className="q-barra"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemax={100}
            aria-label={t('Progresso para o nível {n} da temporada', { n: seguinte })}
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="qp-nota">
            {proxima && (
              <span data-testid="proxima-da-temporada">
                {t('a seguir: {item}, no nível {n} da temporada', { item: proxima.rotulo, n: proxima.nivel })}
                {' · '}
              </span>
            )}
            {t('sobe com o XP de estudo ganho na temporada')}
          </p>
        </div>
      </div>
    );
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 shrink-0 rounded-2xl bg-accent text-accent-contrast flex flex-col items-center justify-center shadow-btn"
          data-testid="nivel-da-temporada"
        >
          <span className="font-display font-black text-2xl leading-none tabular-nums">{nivel}</span>
          <span className="text-[8px] font-black uppercase tracking-[0.14em] opacity-90 mt-0.5">{palavra}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline gap-3 flex-wrap mb-1.5">
            <span className="flex items-baseline gap-2 flex-wrap">
              <b className="font-display font-black text-[15px] text-ink">
                {t('{palavra} {n} da temporada', { palavra, n: nivel })}
              </b>
              {proxima && (
                <span className="text-[12px] text-ink-muted" data-testid="proxima-da-temporada">
                  {t('a seguir: {item}, no nível {n} da temporada', { item: proxima.rotulo, n: proxima.nivel })}
                </span>
              )}
            </span>
            <span className="font-mono text-[12px] text-ink-muted tabular-nums">{progresso}</span>
          </div>
          <div
            className="h-3 rounded-full bg-canvas border border-border-subtle overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemax={100}
            aria-label={t('Progresso para o nível {n} da temporada', { n: seguinte })}
          >
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between items-center gap-2 mt-1">
            <span className="font-mono text-[10px] text-ink-faint">nv. {nivel}</span>
            <span className="text-[11px] text-accent-ink flex items-center gap-1 text-center">
              <Sparkles className="w-3 h-3 shrink-0" aria-hidden />
              {t('sobe com o XP de estudo ganho na temporada')}
            </span>
            <span className="font-mono text-[10px] text-ink-faint">nv. {seguinte}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
