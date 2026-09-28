import {
  LIMIARES_DE_MAESTRIA,
  type MinigameId,
  NIVEIS_DE_MAESTRIA_ALCANCAVEIS,
  type NivelAlcancavel,
  type NivelDeMaestria,
  nivelDeMaestria,
  NOMES_DE_MAESTRIA,
} from '@core';
import { Award, Crown, Gem, type LucideIcon, Medal, Trophy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { celebrar } from '../../lib/comemoracao';
import { EVENTO_MAESTRIA_SUBIU } from '../../lib/filaDeRecompensas';
import { t } from '../../lib/i18n';
import { movimentoReduzido } from '../../lib/juice';

/**
 * A BARRA DE MAESTRIA DE UM JOGO (recompensas v2, onda 3 — spec 8.1).
 *
 * Aparece no fim da rodada (com o ganho desta rodada) e na antessala (só a posição). Os pontos são
 * os do SERVIDOR (`GET /api/metrics/maestria`); o ganho é `pontosDeMaestria` sobre os mesmos
 * acertos e o mesmo combo que a rodada acabou de gravar — a conta que o servidor refaz.
 *
 * Ao cruzar um limiar, a barra é quem comemora (`celebrar({ tipo: 'maestria' })`) e anuncia a
 * subida (`EVENTO_MAESTRIA_SUBIU`); o `useRecompensas` põe a recompensa do nível na fila do modal,
 * que abre quando a pessoa sai do fim da rodada. Movimento reduzido: a barra pula direto para o
 * valor final, sem transição.
 */

/** O ícone de cada nível (0 = ainda sem nível: a medalha apagada). */
export const ICONE_DA_MAESTRIA: Record<NivelDeMaestria, LucideIcon> = {
  0: Medal,
  1: Medal,
  2: Award,
  3: Trophy,
  4: Gem,
  5: Crown,
};

/** Espera antes de a barra andar: o tempo de o fim da rodada assentar na tela. */
export const ATRASO_DO_GANHO_MS = 900;

/** Os níveis cruzados entre dois totais de pontos, em ordem. */
export function subidasDeMaestria(antes: number, depois: number): NivelAlcancavel[] {
  return NIVEIS_DE_MAESTRIA_ALCANCAVEIS.filter(
    (n) => antes < LIMIARES_DE_MAESTRIA[n - 1] && depois >= LIMIARES_DE_MAESTRIA[n - 1],
  );
}

/** "Prata · 140/220", "Rumo ao Bronze · 12/30", "Mestre · 640". */
export function rotuloDaBarra(pontos: number): string {
  const n = nivelDeMaestria(pontos);
  if (n.nivel === 0) return t('Rumo ao Bronze · {pontos}/{proximo}', { pontos: n.pontos, proximo: n.proximo ?? 0 });
  const nome = NOMES_DE_MAESTRIA[n.nivel - 1];
  return n.proximo === null ? `${nome} · ${n.pontos}` : `${nome} · ${n.pontos}/${n.proximo}`;
}

interface Props {
  jogo: MinigameId;
  /** Pontos do jogo ANTES desta rodada (do servidor). */
  pontos: number;
  /** O que esta rodada soma. Ausente na antessala. */
  ganho?: number;
}

export default function BarraDeMaestria({ jogo, pontos, ganho = 0 }: Props) {
  const [mostrado, setMostrado] = useState(pontos);
  const anunciado = useRef(false);
  const reduzido = movimentoReduzido();

  useEffect(() => {
    setMostrado(pontos);
    if (ganho <= 0) return;
    const alvo = pontos + ganho;
    const id = window.setTimeout(() => {
      setMostrado(alvo);
      if (anunciado.current) return;
      anunciado.current = true;
      const subidas = subidasDeMaestria(pontos, alvo);
      if (!subidas.length) return;
      celebrar({ tipo: 'maestria', jogo, nivel: subidas[subidas.length - 1] });
      for (const nivel of subidas) {
        window.dispatchEvent(new CustomEvent(EVENTO_MAESTRIA_SUBIU, { detail: { jogo, nivel } }));
      }
    }, ATRASO_DO_GANHO_MS);
    return () => window.clearTimeout(id);
  }, [jogo, pontos, ganho]);

  const n = nivelDeMaestria(mostrado);
  const Icone = ICONE_DA_MAESTRIA[n.nivel];
  return (
    <div className="barra-maestria" data-maestria={jogo} data-nivel={n.nivel}>
      <div className="entre" style={{ gap: 8 }}>
        <span className="linha" style={{ gap: 6, alignItems: 'center' }}>
          <Icone
            aria-hidden
            style={{ width: 18, height: 18, color: n.nivel === 0 ? 'var(--ink-muted)' : 'var(--warn-ink)' }}
          />
          <span className="label-mono">{t('Maestria')}</span>
          <b className="tn" style={{ fontSize: 13.5 }}>
            {rotuloDaBarra(mostrado)}
          </b>
        </span>
        {ganho > 0 && <span className="badge ok tn">+{ganho}</span>}
      </div>
      <div
        className="hud-progresso"
        role="progressbar"
        aria-label={t('Maestria neste jogo')}
        aria-valuenow={mostrado}
        aria-valuemax={n.proximo ?? mostrado}
      >
        <span style={{ width: `${n.pctNoNivel}%`, transition: reduzido ? 'none' : 'width .8s ease-out' }} />
      </div>
    </div>
  );
}
