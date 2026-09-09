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
import { diaLocal, marcosDeSequencia, minutosPremiados, sequencias } from '../../../core/learning/economia';
import { historicoDeXp } from '../../../core/learning/historicoDeXp';
import { Fsrs5Strategy } from '../../../core/learning/scheduler';
import { MINIGAMES } from '../../../core/minigames/types';
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
  const db = await abrirStore();
  const [sessoes, revisoes, exercicios] = await Promise.all([
    db.getAll('sessoes'), db.getAll('revisoes'), db.getAll('exercicios'),
  ]);
  const balde = url.searchParams.get('balde') === 'semana' ? 'semana' : 'dia';
  const desde = Number(url.searchParams.get('desde') ?? 0) || undefined;
  return json(historicoDeXp({
    sessoes: sessoes.map((s) => ({ em: s.createdAt, palavras: s.wordCount ?? 0 })),
    revisoes: revisoes.map((r) => ({ em: r.reviewedAt ?? 0, certa: (r.grade ?? 0) >= 3 })),
    /* `kind === 'drill'` e o mesmo discriminador das duas pontas: um item que gravou nota no
       agendador JA esta em `revisoes`, e conta-lo de novo inflaria a curva. */
    itensDeJogo: exercicios.filter((e) => e.kind === 'drill').map((e) => ({ em: e.createdAt, certo: e.correct === 1 })),
  }, { balde, desde }));
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
  const drillCorrect = drills.filter((e) => e.correct === 1).length;
  const totalAvaliado = revs.length + drills.length;
  const accuracy = totalAvaliado ? (corretas + drillCorrect) / totalAvaliado : 0;

  const dias = new Set(revs.map((r) => Math.floor(r.reviewedAt / DIA)));
  let streakDays = 0;
  for (let d = Math.floor(agora / DIA); dias.has(d); d -= 1) streakDays += 1;

  /* ── ECONOMIA v2: presença, tempo de captura premiado, rodadas perfeitas, créditos. ── */
  const diasDePresenca = presencas.map((x) => x.dia);
  const seq = sequencias(diasDePresenca, diaLocal(agora));
  const sequencias7 = marcosDeSequencia(diasDePresenca, 7);
  // Minutos de captura por dia local; o teto diário vive no core (`minutosPremiados`).
  const minutosPorDia = new Map<number, number>();
  let capturaMinutos = 0;
  for (const s of sessoes) {
    const min = (s.durationMs ?? 0) / 60_000;
    if (min <= 0) continue;
    capturaMinutos += min;
    const d = diaLocal(s.createdAt);
    minutosPorDia.set(d, (minutosPorDia.get(d) ?? 0) + min);
  }
  const capturaMinutosPremiados = Math.floor(minutosPremiados(minutosPorDia.values()));
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
  for (const r of porRodada.values()) {
    /* Com `r.kind === ''` o `&&` devolve a própria string vazia, e o `>=` a coage para 0. O
       `Number()` reproduz EXATAMENTE essa coerção e tira o `string` do tipo de `minimo`. */
    const minimo = Number((r.kind && (MINIGAMES as Record<string, { minItems?: number } | undefined>)[r.kind]?.minItems) ?? 3);
    if (r.total >= minimo && r.certos === r.total) rodadasPerfeitas += 1;
  }
  const seedsCreditadas = creditos.reduce((n, c) => n + c.amount, 0);
  const xpCreditado = creditos.reduce((n, c) => n + c.xp, 0);
  // A ofensiva que a tela mostra é a MAIOR entre revisar e aparecer: aparecer todo dia também conta.
  streakDays = Math.max(streakDays, seq.atual);

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

  const m: AppMetrics = {
    sessions: sessoes.length,
    wordsCaptured: sessoes.reduce((n, s) => n + (s.wordCount ?? 0), 0),
    deckSize: noDeck.length,
    newCards: noDeck.filter((c) => c.stability == null).length,
    dueToday: noDeck.filter((c) => (c.dueAt ?? 0) <= agora).length,
    reviews: revs.length,
    correctReviews: corretas,
    drillItems: drills.length,
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
    capturaMinutosPremiados,
    rodadasPerfeitas,
    seedsCreditadas,
    xpCreditado,
    idiomas: new Set(sessoes.map((s) => s.sourceLang).filter((l): l is string => !!l)).size,
    avgStability,
    avgRetention,
    avgRetentionConfidence: Math.min(1, retencoes.length / 20),
    vocabByWeek: [...semanas.entries()].sort((a, b) => a[0] - b[0]).map(([weekStart, count]) => ({ weekStart, count })),
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
