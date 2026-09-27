import { rotuloDaMaestria } from '@core';
import { useEffect, useRef } from 'react';

import { chaveDaRecompensa, type Recompensa } from '../../components/RecompensaDesbloqueada';
import type { AppMetrics } from '../../data/api';
import { t, tp } from '../i18n';
import { jaNotificado, notificar } from '../notificacoes';
import { podeAvisarOfensiva, registrarAvisoDeOfensiva } from '../ofensiva';
import type { DerivedProgress } from '../progress';
import { perfilProtegido } from '../protecaoDoMenor';

/** Dia local "2026-09-24" — a chave das notificações que valem por dia. */
function hojeLocal(agora = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

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
  if (r.tipo === 'maestria')
    return {
      chave,
      tipo: 'conquista' as const,
      icone: 'trending-up' as const,
      tom: 'warn' as const,
      titulo: t('Maestria: {nivel}', { nivel: rotuloDaMaestria(r.jogo, r.nivel) }),
      detalhe: t('+{seeds} Seeds.', { seeds: r.seeds }),
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
 *   · ofensiva em risco: ofensiva ativa, nada estudado hoje, entre 18h e 22h (uma por dia —
 *     `lib/ofensiva`; nunca entre 22h e 8h).
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
      /* PERFIL PROTEGIDO (Fase 4 — ECA Digital): sem pressão por sequência para menor (ou idade
         desconhecida). Conferido a cada verificação porque a idade pode chegar depois da montagem. */
      if (perfilProtegido()) return;
      const agora = new Date();
      if (!podeAvisarOfensiva({ streakDays, estudouHoje: practicedToday }, agora)) return;
      const chave = `ofensiva:${hojeLocal(agora)}`;
      registrarAvisoDeOfensiva(agora);
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
