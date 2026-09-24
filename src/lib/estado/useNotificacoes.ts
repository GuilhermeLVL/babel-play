import { useEffect, useRef } from 'react';

import { chaveDaRecompensa, type Recompensa } from '../../components/RecompensaDesbloqueada';
import type { AppMetrics } from '../../data/api';
import { t, tp } from '../i18n';
import { jaNotificado, notificar } from '../notificacoes';
import type { DerivedProgress } from '../progress';

/** Dia local "2026-09-24" — a chave das notificações que valem por dia. */
function hojeLocal(agora = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

/** A hora a partir da qual uma ofensiva sem estudo no dia é dita "em risco". */
const HORA_DO_RISCO = 18;

/** O texto de cada recompensa entregue — o mesmo fato que o modal de resgate mostra. */
export function notificacaoDaRecompensa(r: Recompensa) {
  const chave = `recompensa:${chaveDaRecompensa(r)}`;
  if (r.tipo === 'conquista')
    return {
      chave,
      tipo: 'conquista' as const,
      icone: 'award' as const,
      tom: 'good' as const,
      titulo: t('Conquista: {nome}', { nome: r.nome }),
      detalhe: t('+{seeds} Seeds e +{xp} XP.', { seeds: r.seeds, xp: r.xp }),
      ir: 'loja',
      dado: { aba: 'conquistas' },
    };
  if (r.tipo === 'nivel')
    return {
      chave,
      tipo: 'conquista' as const,
      icone: 'trending-up' as const,
      tom: 'rare' as const,
      titulo: t('Você subiu para o nível {n}', { n: r.nivel }),
      detalhe: r.itens.length
        ? tp(r.itens.length, '{n} item liberado em Personalizar.', '{n} itens liberados em Personalizar.')
        : t('Veja o que mudou em Personalizar.'),
      ir: 'loja',
      dado: { aba: 'personalizar' },
    };
  return {
    chave,
    tipo: 'conquista' as const,
    icone: 'gift' as const,
    tom: 'warn' as const,
    titulo: t('Baú da rodada: {nome}', { nome: r.item.nome }),
    detalhe: r.seeds ? t('+{seeds} Seeds.', { seeds: r.seeds }) : t('Já está em Personalizar.'),
    ir: 'loja',
    dado: { aba: 'personalizar' },
  };
}

/**
 * OS FATOS QUE VIRAM NOTIFICAÇÃO — só o que o app já produz:
 *   · palavras vencidas hoje (`metrics.dueToday`), uma por dia, atualizada se o número mudar;
 *   · conquista, nível e baú, no momento em que entram na fila de recompensas;
 *   · ofensiva em risco: ofensiva ativa, nada estudado hoje e já passou das 18h (uma por dia).
 * A sessão salva é registrada no próprio `handleSaveRecording` (ver `notificarSessaoSalva`).
 */
export function useNotificacoes({
  metrics,
  progress,
  filaDeRecompensas,
}: {
  metrics: AppMetrics | null;
  progress: DerivedProgress;
  filaDeRecompensas: Recompensa[];
}): void {
  const vencidas = metrics?.dueToday ?? 0;
  useEffect(() => {
    if (!metrics || vencidas <= 0) return;
    notificar({
      chave: `revisao:${hojeLocal()}`,
      tipo: 'revisao',
      icone: 'target',
      titulo: tp(vencidas, '{n} palavra esperando revisão', '{n} palavras esperando revisão'),
      detalhe: t('Voltaram a vencer hoje. Uma rodada curta resolve.'),
      ir: 'study',
    });
  }, [metrics, vencidas]);

  const vistas = useRef(new Set<string>());
  useEffect(() => {
    for (const r of filaDeRecompensas) {
      const n = notificacaoDaRecompensa(r);
      if (vistas.current.has(n.chave) || jaNotificado(n.chave)) continue;
      vistas.current.add(n.chave);
      notificar(n);
    }
  }, [filaDeRecompensas]);

  const { available, streakDays, practicedToday } = progress;
  useEffect(() => {
    if (!available || streakDays <= 0 || practicedToday) return;
    const verificar = () => {
      const agora = new Date();
      if (agora.getHours() < HORA_DO_RISCO) return;
      const chave = `ofensiva:${hojeLocal(agora)}`;
      if (jaNotificado(chave)) return;
      notificar({
        chave,
        tipo: 'revisao',
        icone: 'flame',
        tom: 'warn',
        titulo: tp(streakDays, 'Sua ofensiva de {n} dia está em risco', 'Sua ofensiva de {n} dias está em risco'),
        detalhe: t('Uma revisão ou uma rodada hoje mantém a sequência.'),
        ir: 'study',
      });
    };
    verificar();
    const id = window.setInterval(verificar, 10 * 60_000);
    return () => window.clearInterval(id);
  }, [available, streakDays, practicedToday]);
}

/** A sessão que acabou de ser salva (captura encerrada ou importação processada). */
export function notificarSessaoSalva(rec: { id: string; title?: string }): void {
  notificar({
    chave: `sessao:${rec.id}`,
    tipo: 'sessao',
    icone: 'library',
    tom: 'rare',
    titulo: t('Sessão salva: {titulo}', { titulo: rec.title?.trim() || t('sem título') }),
    detalhe: t('Está na Biblioteca, com vocabulário e jogos prontos.'),
    ir: 'analysis',
    dado: { id: rec.id },
  });
}
