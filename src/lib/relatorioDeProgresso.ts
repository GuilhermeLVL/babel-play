import type { AppMetrics } from '@core';

/**
 * RELATÓRIO DE PROGRESSO EM TEXTO (spec progresso-de-idioma).
 *
 * O botão "Exportar Relatório" existia sem onClick — um controle falso, da mesma família dos que
 * as auditorias anteriores removeram. Em vez de removê-lo, ele ganhou o que prometia: um resumo
 * TEXTUAL dos dados reais, feito para sair do app (colar num chat, num diário, numa IA de
 * estudo). Zero LLM aqui dentro: número que não existe vira frase dizendo isso, nunca invenção.
 */

const min = (ms: number) => Math.round(ms / 60_000);

export function gerarRelatorioDeProgresso(m: AppMetrics): string {
  const linhas: string[] = [];
  const data = new Date().toLocaleDateString('pt-BR');
  linhas.push(`RELATÓRIO DE ESTUDO — Babel Play · ${data}`);
  linhas.push('');

  linhas.push('== Vocabulário ==');
  linhas.push(`Palavras no deck: ${m.deckSize} (${m.newCards} novas, ${m.dueToday} prontas para revisar)`);
  linhas.push(`Revisões feitas: ${m.reviews}${m.reviews > 0 ? ` · acerto ${Math.round((m.correctReviews / m.reviews) * 100)}%` : ''}`);
  if (m.avgRetentionConfidence > 0) {
    linhas.push(`Retenção média estimada: ${Math.round(m.avgRetention * 100)}% (confiança ${Math.round(m.avgRetentionConfidence * 100)}%)`);
  } else {
    linhas.push('Retenção: sem base ainda — nenhum cartão revisado o bastante.');
  }
  linhas.push('');

  linhas.push('== Tempo com o idioma ==');
  const ativo = min(m.speakingMs);
  const passivo = min(m.listeningMs ?? 0);
  linhas.push(`Falando (sua voz): ${ativo} min${m.wpm > 0 ? ` · ritmo ${m.wpm} palavras/min` : ''}`);
  linhas.push(`Ouvindo (áudio de terceiros): ${passivo} min`);
  if (ativo + passivo > 0) {
    linhas.push(`Proporção ativa: ${Math.round((ativo / Math.max(1, ativo + passivo)) * 100)}% do tempo total`);
  }
  linhas.push('');

  const dificeis = m.palavrasDificeis ?? [];
  linhas.push('== Palavras que mais custam ==');
  if (dificeis.length === 0) {
    linhas.push('Nenhuma com base suficiente (entra no ranking quem tem 2+ revisões e erros).');
  } else {
    for (const p of dificeis.slice(0, 8)) {
      linhas.push(`- ${p.word}: ${p.lapses} esquecimento${p.lapses === 1 ? '' : 's'}, ${Math.round(p.fracaoDeErro * 100)}% de erro em ${p.revisoes} revisões`);
    }
  }
  linhas.push('');

  const porEx = m.acertoPorExercicio ?? [];
  if (porEx.length > 0) {
    linhas.push('== Acerto por tipo de exercício (pior primeiro) ==');
    for (const e of porEx) linhas.push(`- ${e.kind}: ${e.acerto}% em ${e.total} itens`);
    linhas.push('');
  }

  linhas.push(`Ofensiva: ${m.streakDays} dia${m.streakDays === 1 ? '' : 's'} · gerado pelo Babel Play a partir dos seus dados reais (nada estimado por IA).`);
  return linhas.join('\n');
}

/** Baixa o relatório como .txt — o caminho que funciona igual em todo navegador. */
export function baixarRelatorio(m: AppMetrics): void {
  const blob = new Blob([gerarRelatorioDeProgresso(m)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `babel-play-relatorio-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
