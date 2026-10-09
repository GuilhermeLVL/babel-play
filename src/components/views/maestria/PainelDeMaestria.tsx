import {
  JOGOS_DA_MAESTRIA,
  type MinigameId,
  type NivelAlcancavel,
  nivelDeMaestria,
  NOME_DO_JOGO_NA_MAESTRIA,
  NOMES_DE_MAESTRIA,
  PESOS_SEEDS,
} from '@core';
import { Gift, Sprout } from 'lucide-react';

import type { MaestriaNoServidor } from '../../../data/api';
import { t } from '../../../lib/i18n';
import { itensDaMaestria } from '../../../lib/maestria';
import { ICONE_DA_MAESTRIA, rotuloDaBarra } from '../../maestria/BarraDeMaestria';
import { Barra } from '../../ui';

/**
 * A ABA MAESTRIA DE PERSONALIZAR (recompensas v2, Task 5.4 — spec 8.1 e 10.3): os 18 jogos com o
 * nível, a barra e a próxima recompensa.
 *
 * OS PONTOS SÃO DO SERVIDOR (a tela de fora chama `sincronizarMaestria` → `GET
 * /api/metrics/maestria`, que também pede os créditos `maestria:` que faltam). Sem resposta — ou numa conta que ainda não jogou — os 18
 * jogos aparecem do mesmo jeito, no zero: "Rumo ao Bronze · 0/30" é informação verdadeira, e a aba
 * vazia seria a pior resposta para quem acabou de chegar.
 *
 * A PRÓXIMA RECOMPENSA sai do catálogo (`itensDaMaestria`) e da regra de Seeds
 * (`PESOS_SEEDS.nivelDeMaestria × nível`), as mesmas que o crédito usa. O nível 1 (Bronze) não
 * entrega peça: entrega o emblema no jogo, e a tela diz isso.
 */

/** O que o próximo nível de um jogo entrega, dito numa linha. `null` no Mestre. */
export function proximaRecompensaDaMaestria(
  jogo: MinigameId,
  pontos: number,
): { nivel: NivelAlcancavel; nome: string; itens: string[]; seeds: number } | null {
  const atual = nivelDeMaestria(pontos).nivel;
  if (atual >= 5) return null;
  const nivel = (atual + 1) as NivelAlcancavel;
  return {
    nivel,
    nome: NOMES_DE_MAESTRIA[nivel - 1],
    itens: itensDaMaestria(jogo, nivel).map((i) => i.nome),
    seeds: PESOS_SEEDS.nivelDeMaestria * nivel,
  };
}

export default function PainelDeMaestria({ jogos }: { jogos: readonly MaestriaNoServidor[] | null | undefined }) {
  const pontosDe = new Map((jogos ?? []).map((j) => [j.jogo, j.pontos]));
  const comNivel = JOGOS_DA_MAESTRIA.filter((j) => nivelDeMaestria(pontosDe.get(j) ?? 0).nivel > 0).length;

  return (
    <section className="secao" data-testid="painel-de-maestria">
      <p className="mut" style={{ fontSize: 13, margin: '0 0 14px', maxWidth: '70ch' }}>
        {t(
          'Cada jogo tem cinco níveis: Bronze, Prata, Ouro, Platina e Mestre. Os pontos vêm dos acertos e da precisão de cada rodada, nunca do tempo jogado.',
        )}{' '}
        <b className="tn" style={{ color: 'var(--ink)' }} data-testid="maestria-com-nivel">
          {t('{n} de {total} jogos com nível', { n: comNivel, total: JOGOS_DA_MAESTRIA.length })}
        </b>
      </p>
      <div className="gauto">
        {JOGOS_DA_MAESTRIA.map((jogo) => {
          const pontos = pontosDe.get(jogo) ?? 0;
          const n = nivelDeMaestria(pontos);
          const Icone = ICONE_DA_MAESTRIA[n.nivel];
          const proxima = proximaRecompensaDaMaestria(jogo, pontos);
          return (
            <article key={jogo} className="cartao p5" data-maestria-jogo={jogo} data-nivel={n.nivel}>
              <div className="linha" style={{ gap: 8, alignItems: 'center' }}>
                <Icone
                  aria-hidden
                  style={{
                    width: 20,
                    height: 20,
                    flex: 'none',
                    color: n.nivel === 0 ? 'var(--ink-muted)' : 'var(--warn-ink)',
                  }}
                />
                <h3 style={{ fontSize: 14.5, fontWeight: 800, flex: 1, minWidth: 0 }}>
                  {NOME_DO_JOGO_NA_MAESTRIA[jogo]}
                </h3>
                <span className="label-mono">{n.nivel === 0 ? t('Sem nível') : NOMES_DE_MAESTRIA[n.nivel - 1]}</span>
              </div>
              <p className="tn mut" style={{ fontSize: 12.5, margin: '8px 0 6px' }}>
                {rotuloDaBarra(pontos)}
              </p>
              <Barra
                pct={n.pctNoNivel}
                tom={n.nivel === 5 ? 'good' : 'accent'}
                tamanho="fina"
                rotuloAcessivel={t('Maestria em {jogo}', { jogo: NOME_DO_JOGO_NA_MAESTRIA[jogo] })}
              />
              <p className="mut" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
                {proxima ? (
                  <>
                    <Gift
                      aria-hidden
                      style={{ display: 'inline', width: 13, height: 13, verticalAlign: -2, marginRight: 4 }}
                    />
                    {t('No {nivel}:', { nivel: proxima.nome })}{' '}
                    <b style={{ color: 'var(--ink)' }}>
                      {proxima.itens.length ? proxima.itens.join(' · ') : t('o emblema no jogo')}
                    </b>{' '}
                    <span className="tn" style={{ whiteSpace: 'nowrap', color: 'var(--good-ink)' }}>
                      <Sprout aria-hidden style={{ display: 'inline', width: 12, height: 12, verticalAlign: -2 }} />+
                      {proxima.seeds}
                    </span>
                  </>
                ) : (
                  t('Mestre: a finalização deste jogo vale em qualquer jogo.')
                )}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
