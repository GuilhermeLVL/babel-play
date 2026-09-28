/**
 * ESPELHO SEM CONTA — o perfil de métricas e a curva de XP.
 *
 * Metade de `src/data/rotas/metricas.ts`: as MESMAS rotas de metrica de LEITURA, calculadas sobre
 * o IndexedDB com as funções do core que o servidor real também chama. As rotas de Seeds e de
 * presença moram em `./economia.ts`: o caminho HTTP delas começa igual, mas o domínio é a
 * economia, e o cliente faz o mesmo corte (`src/data/rotas/economia.ts`).
 *
 * Rotas: GET `/api/metrics/profile`, GET `/api/metrics/xp`.
 */
import type { AppMetrics } from '../../../core/learning/contract';
import { diaNumeroNoFuso, marcosDeSequencia, palavrasPremiadas, sequencias } from '../../../core/learning/economia';
import { historicoDeXp, type LinhasDoHistorico } from '../../../core/learning/historicoDeXp';
import { Fsrs5Strategy } from '../../../core/learning/scheduler';
import { sessaoRendeXp } from '../../../core/learning/xp';
import { ehRodadaPerfeita } from '../../../core/minigames/grade';
import { numeroDoDia, ofensivaComCongelamento } from '../../../core/missoes';
import { fusoGravadoLocal } from '../fuso';
import { contarPalavras, DIA, json } from '../nucleo';
import { abrirStore } from '../store';
import { estadoDe } from './vocabulario';

/**
 * A CURVA DE XP — a mesma funcao do servidor real (`historicoDeXp`, do core).
 *
 * Esta rota nao existia aqui: a aba de Progresso levava um 501 e o grafico ficava vazio para quem
 * estuda sem conta. O que faltava nao era o dado — as tres colecoes estao no IndexedDB — era
 * alguem soma-las. Copiar a agregacao do servidor resolveria a tela e criaria a segunda verdade;
 * a formula foi para o core e as duas pontas passaram a chama-la.
 */
export async function historicoDeXpLocal(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const balde = url.searchParams.get('balde') === 'semana' ? 'semana' : 'dia';
  const desde = Number(url.searchParams.get('desde') ?? 0) || undefined;
  return json(historicoDeXp(await linhasDoHistoricoLocal(), { balde, desde }));
}

/** Palavras salvas (cartão no baralho com `sessionId`) por sessão — a régua de `sessaoRendeXp`. */
function salvasPorSessao(cartoes: ReadonlyArray<{ sessionId?: string | null; inDeck?: number | null }>): Map<string, number> {
  const n = new Map<string, number>();
  for (const c of cartoes) if (c.inDeck !== 0 && c.sessionId) n.set(c.sessionId, (n.get(c.sessionId) ?? 0) + 1);
  return n;
}

/** As linhas com carimbo que a curva de XP soma — e que a temporada soma dentro da janela dela. */
export async function linhasDoHistoricoLocal(): Promise<LinhasDoHistorico> {
  const db = await abrirStore();
  const [sessoes, cartoes, revisoes, exercicios] = await Promise.all([
    db.getAll('sessoes'), db.getAll('cartoes'), db.getAll('revisoes'), db.getAll('exercicios'),
  ]);
  const salvas = salvasPorSessao(cartoes);
  return {
    sessoes: sessoes.map((s) => ({ em: s.createdAt, palavras: s.wordCount ?? 0, palavrasSalvas: salvas.get(s.id) ?? 0 })),
    revisoes: revisoes.map((r) => ({ em: r.reviewedAt ?? 0, certa: (r.grade ?? 0) >= 3 })),
    /* `kind === 'drill'` e o mesmo discriminador das duas pontas: um item que gravou nota no
       agendador JA esta em `revisoes`, e conta-lo de novo inflaria a curva. */
    itensDeJogo: exercicios.filter((e) => e.kind === 'drill').map((e) => ({ em: e.createdAt, certo: e.correct === 1 })),
  };
}

/** A ofensiva com congelamento: dias de prática + dias com `meta:<dia>` creditada (core). */
export function ofensivaEfemera(diasDePratica: Iterable<number>, creditos: ReadonlyArray<{ creditoId: string }>, agora: number, fuso: string) {
  return ofensivaComCongelamento({
    diasDePratica,
    diasDeMeta: creditos
      .filter((c) => c.creditoId.startsWith('meta:'))
      .map((c) => numeroDoDia(c.creditoId.slice('meta:'.length)))
      .filter((d): d is number => d !== null),
    hoje: diaNumeroNoFuso(agora, fuso),
  });
}

/**
 * O QUE AS MISSÕES DO DIA LEEM, sem conta — o mesmo formato de `dadosDasMissoes` do Express:
 * carimbos de revisão e de palavra salva dos últimos 3 dias, metas creditadas e a ofensiva com
 * congelamento (dias de prática contados como em `perfilEfemero`).
 */
export async function dadosDasMissoesEfemeros(fuso: string): Promise<{
  revisoes: number[];
  palavrasSalvas: number[];
  metasCreditadas: string[];
  ofensiva: { atual: number; congelamentos: 0 | 1 | 2 };
}> {
  const db = await abrirStore();
  const agora = Date.now();
  const [cartoes, revisoes, exercicios, creditos] = await Promise.all([
    db.getAll('cartoes'), db.getAll('revisoes'), db.getAll('exercicios'), db.getAll('creditos'),
  ]);
  const idsDoDeck = new Set(cartoes.map((c) => c.id));
  const revs = revisoes.filter((r) => idsDoDeck.has(r.cardId)).map((r) => r.reviewedAt);
  const palavras = cartoes.filter((c) => c.inDeck !== 0 && c.sessionId).map((c) => c.createdAt);
  const diasDePratica = new Set<number>([
    ...palavras.map((t) => diaNumeroNoFuso(t, fuso)),
    ...revs.map((t) => diaNumeroNoFuso(t, fuso)),
    ...exercicios.filter((e) => e.roundId).map((e) => diaNumeroNoFuso(e.createdAt, fuso)),
  ]);
  const desde = agora - 3 * DIA;
  const { atual, congelamentos } = ofensivaEfemera(diasDePratica, creditos, agora, fuso);
  return {
    revisoes: revs.filter((t) => t >= desde).sort((a, b) => a - b),
    palavrasSalvas: palavras.filter((t) => t >= desde).sort((a, b) => a - b),
    metasCreditadas: creditos.map((c) => c.creditoId).filter((id) => id.startsWith('meta:')).map((id) => id.slice(5)).sort(),
    ofensiva: { atual, congelamentos },
  };
}

/**
 * O PERFIL, como OBJETO — e a rota como casca dele.
 *
 * Era só uma rota, e por isso o próprio modo sem conta não conseguia consultar o que ele mesmo
 * calcula: para decidir um crédito é preciso saber o nível, e o nível vem daqui. Devolver
 * `Response` era o formato certo para o cliente e o errado para o código ao lado.
 */
export async function perfilEfemero(sessionId: string | null): Promise<AppMetrics> {
  const db = await abrirStore();
  const agora = Date.now();
  /* O fuso GRAVADO (revisão de 27/09): dia de prática, ofensiva e marcos no dia de quem estuda —
     a mesma régua do Express, que não pode usar o fuso do processo. */
  const fuso = fusoGravadoLocal();
  const [sessoesTodas, cartoesTodos, revisoes, falasTodas, exercicios, gastos, presencas, creditos] = await Promise.all([
    db.getAll('sessoes'), db.getAll('cartoes'), db.getAll('revisoes'), db.getAll('falas'), db.getAll('exercicios'), db.getAll('gastos'),
    db.getAll('presencas'), db.getAll('creditos'),
  ]);
  const sessoes = sessionId ? sessoesTodas.filter((s) => s.id === sessionId) : sessoesTodas;
  const cartoes = sessionId ? cartoesTodos.filter((c) => c.sessionId === sessionId) : cartoesTodos;
  const falas = sessionId ? falasTodas.filter((f) => f.sessionId === sessionId) : falasTodas;
  const noDeck = cartoes.filter((c) => c.inDeck !== 0);
  const idsDoDeck = new Set(cartoes.map((c) => c.id));
  const revs = revisoes.filter((r) => idsDoDeck.has(r.cardId));
  const corretas = revs.filter((r) => r.grade >= 3).length;
  const drills = sessionId ? exercicios.filter((e) => e.sessionId === sessionId) : exercicios;
  const certosEmExercicio = drills.filter((e) => e.correct === 1).length;
  const totalAvaliado = revs.length + drills.length;
  const accuracy = totalAvaliado ? (corretas + certosEmExercicio) / totalAvaliado : 0;
  /* ITENS DE JOGO = só as linhas `kind: 'drill'`, como no Express (e como o `historicoDeXp` daqui
     já fazia). A linha `srs` é telemetria de um item que JÁ virou revisão: contá-la também dava
     XP duas vezes ao mesmo acerto no modo sem conta — e a raspadinha dizia outro número. */
  const itensDeJogo = drills.filter((e) => e.kind === 'drill');
  const drillCorrect = itensDeJogo.filter((e) => e.correct === 1).length;

  const dias = new Set(revs.map((r) => Math.floor(r.reviewedAt / DIA)));
  let streakDays = 0;
  for (let d = Math.floor(agora / DIA); dias.has(d); d -= 1) streakDays += 1;

  /* ── ECONOMIA v2 + RECOMPENSAS v2 (27/09): a mesma conta do Express. Presença é só estatística;
     a ofensiva e os marcos contam DIAS DE PRÁTICA; minuto gravado não paga nada. ── */
  let capturaMinutos = 0;
  for (const s of sessoes) {
    const min = (s.durationMs ?? 0) / 60_000;
    if (min > 0) capturaMinutos += min;
  }
  // Palavras salvas da captura por dia local; o teto diário vive no core (`palavrasPremiadas`).
  const palavrasPorDia = new Map<number, number>();
  for (const c of noDeck) {
    if (!c.sessionId) continue;
    const d = diaNumeroNoFuso(c.createdAt, fuso);
    palavrasPorDia.set(d, (palavrasPorDia.get(d) ?? 0) + 1);
  }
  const palavrasSalvasPremiadas = palavrasPremiadas(palavrasPorDia.values());
  const diasDePratica = new Set<number>(palavrasPorDia.keys());
  for (const r of revs) diasDePratica.add(diaNumeroNoFuso(r.reviewedAt, fuso));
  for (const e of drills) if (e.roundId) diasDePratica.add(diaNumeroNoFuso(e.createdAt, fuso));
  const seq = sequencias(diasDePratica, diaNumeroNoFuso(agora, fuso));
  const sequencias7 = marcosDeSequencia(diasDePratica, 7);
  const acertosRecentes = [
    ...revs.filter((r) => r.grade >= 3).map((r) => r.reviewedAt),
    ...itensDeJogo.filter((e) => e.correct === 1).map((e) => e.createdAt),
  ].filter((t) => t >= agora - 3 * DIA).sort((a, b) => a - b);
  // Rodada perfeita = todos os itens certos E tamanho ≥ mínimo do jogo (senão uma rodada de 1
  // item viraria fábrica de "perfeitas").
  const porRodada = new Map<string, { kind: string | null; total: number; certos: number }>();
  for (const e of drills) {
    if (!e.roundId) continue;
    const r = porRodada.get(e.roundId) ?? { kind: e.exerciseKind, total: 0, certos: 0 };
    r.total += 1;
    if (e.correct === 1) r.certos += 1;
    porRodada.set(e.roundId, r);
  }
  let rodadasPerfeitas = 0;
  /* A régua é a do core (`ehRodadaPerfeita`), a mesma do Express e da raspadinha. */
  for (const r of porRodada.values()) if (ehRodadaPerfeita(r.kind, r.total, r.certos)) rodadasPerfeitas += 1;
  const seedsCreditadas = creditos.reduce((n, c) => n + c.amount, 0);
  const xpCreditado = creditos.reduce((n, c) => n + c.xp, 0);
  // A ofensiva que a tela mostra conta DIAS DE PRÁTICA (revisão, rodada ou palavra salva), com o
  // congelamento das metas cumpridas (recompensas v2, onda 5) — a mesma conta do Express.
  streakDays = Math.max(streakDays, seq.atual, ofensivaEfemera(diasDePratica, creditos, agora, fuso).atual);

  const revisados = noDeck.filter((c) => c.stability != null);
  const avgStability = revisados.length ? revisados.reduce((n, c) => n + (c.stability ?? 0), 0) / revisados.length : 0;
  const retencoes = revisados.map((c) => Fsrs5Strategy.predictedRetention(estadoDe(c), agora)).filter((r): r is number => typeof r === 'number');
  const avgRetention = retencoes.length ? retencoes.reduce((a, b) => a + b, 0) / retencoes.length : 0;

  const semanas = new Map<number, number>();
  for (const c of cartoes) { const w = Math.floor(c.createdAt / (7 * DIA)) * 7 * DIA; semanas.set(w, (semanas.get(w) ?? 0) + 1); }
  const speakingMs = falas.reduce((n, f) => n + (f.tStartMs != null && f.tEndMs != null && f.tEndMs > f.tStartMs ? f.tEndMs - f.tStartMs : 0), 0);
  const palavrasFaladas = contarPalavras(falas.filter((f) => f.tStartMs != null && f.tEndMs != null));
  const wpm = speakingMs > 0 ? palavrasFaladas / (speakingMs / 60_000) : 0;
  const niveis = new Map<string, number>();
  for (const c of noDeck) if (c.cefrLevel) niveis.set(c.cefrLevel, (niveis.get(c.cefrLevel) ?? 0) + 1);

  /* Só sessão com palavra salva rende XP (revisão de 27/09) — a régua do core, como no Express. */
  const salvas = salvasPorSessao(cartoes);
  const m: AppMetrics = {
    sessions: sessoes.length,
    sessoesComPalavraSalva: sessoes.filter((s) => sessaoRendeXp(salvas.get(s.id) ?? 0)).length,
    wordsCaptured: sessoes.reduce((n, s) => n + (s.wordCount ?? 0), 0),
    deckSize: noDeck.length,
    newCards: noDeck.filter((c) => c.stability == null).length,
    dueToday: noDeck.filter((c) => (c.dueAt ?? 0) <= agora).length,
    reviews: revs.length,
    correctReviews: corretas,
    drillItems: itensDeJogo.length,
    drillCorrect,
    accuracy,
    accuracyConfidence: Math.min(1, totalAvaliado / 20),
    streakDays,
    seedsGastas: gastos.reduce((n, g) => n + g.amount, 0),
    // Paridade com o servidor real (B4): posse derivada do log de compras da Loja.
    itensComprados: [...new Set(gastos.map((g) => g.reason).filter((r) => r.startsWith('loja:')).map((r) => r.slice('loja:'.length)))],
    presencas: presencas.length,
    streakPresenca: seq.atual,
    maiorSequenciaPresenca: seq.maior,
    sequencias7,
    capturaMinutos: Math.round(capturaMinutos),
    palavrasSalvasPremiadas,
    acertosRecentes,
    rodadasPerfeitas,
    seedsCreditadas,
    xpCreditado,
    idiomas: new Set(sessoes.map((s) => s.sourceLang).filter((l): l is string => !!l)).size,
    avgStability,
    avgRetention,
    avgRetentionConfidence: Math.min(1, retencoes.length / 20),
    vocabByWeek: [...semanas.entries()].sort((a, b) => a[0] - b[0]).map(([weekStart, count]) => ({ weekStart, count })),
    revisoesRecentes: revs
      .map((r) => r.reviewedAt)
      .filter((t) => t >= agora - 8 * DIA)
      .sort((a, b) => a - b),
    speakingMs,
    wpm,
    wpmConfidence: Math.min(1, speakingMs / 300_000),
    uniqueWords: new Set(noDeck.map((c) => c.normKey)).size,
    levelDistribution: [...niveis.entries()].map(([level, count]) => ({ level, count })),
    levelConfidence: 0,
    asOf: agora,
    escopo: sessionId ? 'sessao' : 'global',
    base: { considerados: revisados.length, total: noDeck.length },
  };
  return m;
}

export async function metricas(_m: RegExpMatchArray, url: URL): Promise<Response> {
  return json(await perfilEfemero(url.searchParams.get('sessao')));
}
