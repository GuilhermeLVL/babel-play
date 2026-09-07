import type { AppMetrics } from '@core';
import type { VocabCard } from '../types';
// `as dataDaUI` porque este arquivo ja tem uma variavel local `data`.
import { data as dataDaUI, numero, t, tp } from './i18n';

/**
 * RELATÓRIO DE PROGRESSO EM TEXTO (spec progresso-de-idioma).
 *
 * O botão "Exportar Relatório" existia sem onClick — um controle falso, da mesma família dos que
 * as auditorias anteriores removeram. Em vez de removê-lo, ele ganhou o que prometia: um resumo
 * TEXTUAL dos dados reais, feito para sair do app (colar num chat, num diário, numa IA de
 * estudo). Zero LLM aqui dentro: número que não existe vira frase dizendo isso, nunca invenção.
 */

const min = (ms: number) => Math.round(ms / 60_000);

/**
 * O CADERNO É O QUE O BOTÃO PROMETE.
 *
 * "Exportar Meu Caderno" gerava um .txt com agregados e NENHUMA palavra — o usuário pedia o
 * caderno e recebia o boletim. As palavras são opcionais no tipo porque o relatório continua
 * válido sem elas (a tela pode não ter o deck carregado ainda), mas quando existem, elas são o
 * conteúdo principal e vêm primeiro.
 */
export function gerarRelatorioDeProgresso(m: AppMetrics, cartoes: ReadonlyArray<VocabCard> = []): string {
  const linhas: string[] = [];
  const data = dataDaUI(new Date());
  linhas.push(t('RELATÓRIO DE ESTUDO — Babel Play · {data}', { data }));
  linhas.push('');

  linhas.push(t('== Vocabulário =='));
  linhas.push(t('Palavras no deck: {total} ({novas} novas, {prontas} prontas para revisar)', {
    total: numero(m.deckSize), novas: numero(m.newCards), prontas: numero(m.dueToday),
  }));
  linhas.push(m.reviews > 0
    ? t('Revisões feitas: {n} · acerto {pct}%', { n: numero(m.reviews), pct: Math.round((m.correctReviews / m.reviews) * 100) })
    : t('Revisões feitas: {n}', { n: numero(m.reviews) }));
  if (m.avgRetentionConfidence > 0) {
    linhas.push(t('Retenção média estimada: {pct}% (confiança {conf}%)', {
      pct: Math.round(m.avgRetention * 100), conf: Math.round(m.avgRetentionConfidence * 100),
    }));
  } else {
    linhas.push(t('Retenção: sem base ainda — nenhum cartão revisado o bastante.'));
  }
  linhas.push('');

  linhas.push(t('== Tempo com o idioma =='));
  const ativo = min(m.speakingMs);
  const passivo = min(m.listeningMs ?? 0);
  linhas.push(m.wpm > 0
    ? t('Falando (sua voz): {min} min · ritmo {wpm} palavras/min', { min: numero(ativo), wpm: numero(m.wpm) })
    : t('Falando (sua voz): {min} min', { min: numero(ativo) }));
  linhas.push(t('Ouvindo (áudio de terceiros): {min} min', { min: numero(passivo) }));
  if (ativo + passivo > 0) {
    linhas.push(t('Proporção ativa: {pct}% do tempo total', {
      pct: Math.round((ativo / Math.max(1, ativo + passivo)) * 100),
    }));
  }
  linhas.push('');

  const dificeis = m.palavrasDificeis ?? [];
  linhas.push(t('== Palavras que mais custam =='));
  if (dificeis.length === 0) {
    linhas.push(t('Nenhuma com base suficiente (entra no ranking quem tem 2+ revisões e erros).'));
  } else {
    for (const p of dificeis.slice(0, 8)) {
      linhas.push(`- ${p.word}: ` + t('{lapsos}, {pct}% de erro em {revisoes} revisões', {
        lapsos: tp(p.lapses, '{n} esquecimento', '{n} esquecimentos'),
        pct: Math.round(p.fracaoDeErro * 100),
        revisoes: numero(p.revisoes),
      }));
    }
  }
  linhas.push('');

  const porEx = m.acertoPorExercicio ?? [];
  if (porEx.length > 0) {
    linhas.push(t('== Acerto por tipo de exercício (pior primeiro) =='));
    for (const e of porEx) linhas.push(`- ${e.kind}: ` + t('{pct}% em {n} itens', { pct: e.acerto, n: numero(e.total) }));
    linhas.push('');
  }

  if (cartoes.length > 0) {
    linhas.push('== ' + tp(cartoes.length, 'Meu caderno ({n} palavra)', 'Meu caderno ({n} palavras)') + ' ==');
    for (const c of cartoes) {
      const verso = (c.translation ?? '').trim();
      // Sem verso é informação, não linha faltando: é o que o usuário precisa consertar.
      linhas.push(verso ? `- ${c.word} — ${verso}` : `- ${c.word} — ` + t('(sem tradução)'));
    }
    linhas.push('');
  }

  linhas.push(
    tp(m.streakDays, 'Ofensiva: {n} dia', 'Ofensiva: {n} dias')
    + ' · ' + t('gerado pelo Babel Play a partir dos seus dados reais (nada estimado por IA).'),
  );
  return linhas.join('\n');
}

/** Baixa o relatório como .txt — o caminho que funciona igual em todo navegador. */
export function baixarRelatorio(m: AppMetrics, cartoes: ReadonlyArray<VocabCard> = []): void {
  const blob = new Blob([gerarRelatorioDeProgresso(m, cartoes)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `babel-play-relatorio-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
