import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ContextoDeConquistas } from '@core';
import type { AppMetrics, RecordeDoJogo } from '../../data/api';
import type { ThemeType, FonteType } from '../appearance';
import type { MenuPositionType } from '../../components/shell/navItems';
import { toast } from '../../components/Toast';
import { recompensasVistas, chaveDaRecompensa, EVENTO_DROP_GANHO, type Recompensa, type DetalheDoDrop } from '../../components/RecompensaDesbloqueada';
import { montarContextoDeConquistas, verificarConquistas } from '../conquistas';
import { desbloqueado } from '../desbloqueios';
import { recompensasDoNivelCompleto, itemDaConquista } from '../galeria/progressao';
import type { ContextoDeEquipar } from '../galeria/equipar';
import { CATALOGO_DA_LOJA } from '../loja';
import { comemorar } from '../juice';
import { play } from '../soundFx';
import { emitBurst } from '../effects';
import type { DerivedProgress } from '../progress';

export interface DependenciasDasRecompensas {
  metrics: AppMetrics | null;
  recordes: RecordeDoJogo[];
  progress: DerivedProgress;
  setVersaoDasMetricas: Dispatch<SetStateAction<number>>;
  setTheme: (t: ThemeType) => void;
  setFonte: (f: FonteType) => void;
  setMenuPosition: (p: MenuPositionType) => void;
  setIsStudioOpen: (v: boolean) => void;
}

export interface EstadoDasRecompensas {
  ctxConquistas: ContextoDeConquistas | null;
  filaDeRecompensas: Recompensa[];
  setFilaDeRecompensas: Dispatch<SetStateAction<Recompensa[]>>;
  lojaAba: string | null;
  setLojaAba: Dispatch<SetStateAction<string | null>>;
  abrirEstudio: () => void;
  equiparCtx: ContextoDeEquipar;
}

/**
 * Conquistas, recompensas, drops, aba da Loja e o contexto único de equipar. Os efeitos ficam na
 * mesma ordem em que rodavam no `App` — o que muda de nível é o de baixo, e ele depende de o de
 * cima já ter enfileirado.
 */
export function useRecompensas(deps: DependenciasDasRecompensas): EstadoDasRecompensas {
  const { metrics, recordes, progress, setVersaoDasMetricas, setTheme, setFonte, setMenuPosition, setIsStudioOpen } = deps;

  /* CONQUISTAS — avaliadas a cada métrica nova; o crédito é idempotente no servidor. */
  const ctxConquistas = useMemo<ContextoDeConquistas | null>(
    () => (metrics ? montarContextoDeConquistas({ metricas: metrics, nivel: progress.level, recordes }) : null),
    [metrics, progress.level, recordes],
  );
  useEffect(() => {
    if (!ctxConquistas) return;
    void verificarConquistas(ctxConquistas).then((novas) => {
      /* v3: a conquista é ENTREGUE no modal de resgate (com "Equipar agora" no exclusivo), não
         num toast que some. A fila mostra uma por vez e espera a rodada fechar. */
      const vistas = recompensasVistas();
      const entradas: Recompensa[] = novas
        .map((c): Recompensa => ({ tipo: 'conquista', id: c.id, nome: c.nome, emoji: c.emoji, seeds: c.recompensa.seeds, xp: c.recompensa.xp, item: itemDaConquista(c.id) }))
        .filter((r) => !vistas.has(chaveDaRecompensa(r)));
      if (entradas.length) setFilaDeRecompensas((f) => [...f, ...entradas]);
    });
  }, [ctxConquistas]);

  /** v3: fila do modal de resgate (nível/conquista/bau) e o contexto único de equipar. */
  const [filaDeRecompensas, setFilaDeRecompensas] = useState<Recompensa[]>([]);

  /* O BAU DA RODADA entra na mesma fila do nivel e da conquista: o `Play` anuncia o que o servidor
     sorteou e aqui o id vira item do catalogo. Sem isto o drop creditava e ninguem via. */
  useEffect(() => {
    const ouvir = (e: Event) => {
      const d = (e as CustomEvent<DetalheDoDrop>).detail;
      const item = CATALOGO_DA_LOJA.find((i) => i.id === d?.itemId);
      if (!item) return;
      const r: Recompensa = { tipo: 'drop', roundId: d.roundId, seeds: d.seeds, item };
      if (recompensasVistas().has(chaveDaRecompensa(r))) return;
      setFilaDeRecompensas((f) => [...f, r]);
      setVersaoDasMetricas((v) => v + 1);
    };
    window.addEventListener(EVENTO_DROP_GANHO, ouvir);
    return () => window.removeEventListener(EVENTO_DROP_GANHO, ouvir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [lojaAba, setLojaAba] = useState<string | null>(null);
  /**
   * PORTA ÚNICA do Estúdio de Layout (brecha B2, spec galeria-gating-fechado): eram cinco
   * callsites passando `abrirEstudio` cru — a proteção morava só em QUEM
   * renderizava o botão, e o Estúdio de nível 10 abria por qualquer entrada nova. Agora o gate
   * mora na porta: fora do nível, diz o que falta em vez de abrir.
   */
  const abrirEstudio = () => {
    const nivelAtual = progress.available ? progress.level : 1;
    if (!desbloqueado(nivelAtual, 'estudio', 'abrir')) {
      toast.warn(`O Estúdio de Layout abre no nível 10 — você está no ${nivelAtual}. Ele também está na Loja.`);
      return;
    }
    setIsStudioOpen(true);
  };
  // Sem useMemo: os setters são redefinidos a cada render (não são useCallback) e o objeto é barato.
  const equiparCtx: ContextoDeEquipar = {
    setTheme, setFonte, setMenuPosition, onOpenStudio: abrirEstudio,
    nivel: progress.available ? progress.level : 1, saldo: progress.available ? progress.seeds : 0,
  };

  /* SUBIU DE NÍVEL → festa + o que destravou. O último nível visto fica no navegador; na primeira
     visita só registra (ninguém "sobe" para o nível atual). Aparência é recompensa (desbloqueios). */
  useEffect(() => {
    if (!progress.available) return;
    let visto = 0;
    try { visto = Number(localStorage.getItem('babel.nivel_visto')) || 0; } catch { /* sem storage */ }
    if (visto === 0) { try { localStorage.setItem('babel.nivel_visto', String(progress.level)); } catch { /* idem */ } return; }
    if (progress.level > visto) {
      try { localStorage.setItem('babel.nivel_visto', String(progress.level)); } catch { /* idem */ }
      /* v3: cada nível subido vira UMA entrada no modal de resgate, com TUDO que abriu (Loja +
         galeria — `recompensasDoNivelCompleto`), e "Equipar agora" por item. O toast saiu. */
      const vistas = recompensasVistas();
      const entradas: Recompensa[] = [];
      for (let n = visto + 1; n <= progress.level; n++) {
        const r: Recompensa = { tipo: 'nivel', nivel: n, itens: recompensasDoNivelCompleto(n) };
        if (!vistas.has(chaveDaRecompensa(r))) entradas.push(r);
      }
      if (entradas.length) setFilaDeRecompensas((f) => [...f, ...entradas]);
      else comemorar('subiuNivel', null, { tremer: true });
    }
  }, [progress.available, progress.level]);

  /**
   * SUBIDA DE NÍVEL — o único momento que a app comemora com força.
   *
   * Detectado comparando o nível derivado entre atualizações de métrica (ver lib/progress). O
   * `useRef` guarda o nível ANTERIOR: sem ele, a primeira carga dispararia a comemoração para
   * quem já estava no nível 27 há meses.
   */
  const prevLevelRef = useRef<number | null>(null);
  useEffect(() => {
    if (!progress.available) return;
    const anterior = prevLevelRef.current;
    prevLevelRef.current = progress.level;
    if (anterior !== null && progress.level > anterior) {
      play('levelUp');
      emitBurst(window.innerWidth / 2, window.innerHeight * 0.35, 'levelUp');
    }
  }, [progress.available, progress.level]);

  return { ctxConquistas, filaDeRecompensas, setFilaDeRecompensas, lojaAba, setLojaAba, abrirEstudio, equiparCtx };
}
