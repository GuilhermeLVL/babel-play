/**
 * ESPELHO SEM CONTA — rodadas de jogo, histórico por item e recordes.
 *
 * Metade de `src/data/rotas/exercicios.ts`: as MESMAS rotas de exercicio sobre o IndexedDB.
 *
 * Rotas: POST `/api/exercises/rodada`, GET `/api/exercises/results`,
 * GET `/api/exercises/historico`, GET `/api/exercises/recordes`.
 */
import { type Json,json, lerJson, num, str, uuid } from '../nucleo';
import { abrirStore, type ExercicioLocal } from '../store';

function exercicioDe(base: Json, item: Json, agora: number): ExercicioLocal {
  return {
    id: uuid(), createdAt: agora,
    roundId: str(base.roundId), exerciseKind: str(base.exerciseKind) ?? str(item.exerciseKind),
    kind: str(item.kind) ?? str(base.kind), origem: str(base.origem), sessionId: str(base.sessionId),
    itemRef: str(item.itemRef), cardId: str(item.cardId), correct: num(item.correct), attempts: num(item.attempts),
    ms: num(item.ms), hinted: num(item.hinted), score: num(item.score) ?? num(base.score),
    melhorSequencia: num(base.melhorSequencia),
  };
}

export async function gravarRodada(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const itens = Array.isArray(p.itens) ? (p.itens as Json[]) : [];
  const db = await abrirStore();
  const agora = Date.now();
  const tx = db.transaction('exercicios', 'readwrite');
  for (const it of itens) await tx.store.put(exercicioDe(p, it, agora));
  await tx.done;
  return json({ ok: true, gravados: itens.length });
}

/* `POST /api/exercises/results` SAIU (07/09). Ela era o gravador POR ITEM, anterior a `/rodada`,
   e o Express a removeu na mudanca `servicos-sem-duplicata` — o cliente passou a gravar tudo por
   `/rodada`. Manter o espelho de uma rota que o servidor real nao tem e o mesmo tipo de
   divergencia que esta change existe para fechar, so que na direcao contraria: sem conta
   funcionaria algo que com conta responde 404. */

export async function listarResultados(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const db = await abrirStore();
  const sessionId = url.searchParams.get('sessionId');
  const origem = url.searchParams.get('origem');
  /* O MESMO TETO DO SERVIDOR (`TETO_PADRAO_DE_RESULTADOS`, 200). Sem ele o modo anonimo seria o
     unico lugar onde a rota ainda devolve a tabela inteira — e a divergencia apareceria como "no
     anonimo trava, com conta nao", que e o tipo de diferenca que este espelho existe para nao ter.
     O teto so vale no caminho SEM filtro, como no Express: filtrar por sessao ou fonte ja limita. */
  const limite = Number(url.searchParams.get('limite')) || 200;
  let linhas = await db.getAll('exercicios');
  const filtrado = Boolean(sessionId || origem);
  if (sessionId) linhas = linhas.filter((l) => l.sessionId === sessionId);
  else if (origem) linhas = linhas.filter((l) => l.origem === origem);
  const ordenadas = linhas.sort((a, b) => b.createdAt - a.createdAt);
  return json(filtrado ? ordenadas : ordenadas.slice(0, limite));
}

export async function historicoPorItem(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const db = await abrirStore();
  const origem = url.searchParams.get('origem');
  const desde = Number(url.searchParams.get('desde') ?? 0) || 0;
  const linhas = (await db.getAll('exercicios'))
    .filter((l) => l.itemRef && (!origem || l.origem === origem) && l.createdAt >= desde)
    .sort((a, b) => a.createdAt - b.createdAt);
  /* SELEÇÃO v2: além de vezes/erros, a régua de retorno precisa de ERROS SEGUIDOS (contados do
     fim) e de quantas RODADAS do mesmo jogo já passaram desde o último erro. As rodadas são
     contadas por `roundId` distinto do mesmo `exerciseKind` depois da linha errada. */
  const agregado = new Map<string, { itemRef: string; vezes: number; erros: number; ultimaEm: number; ultimoAcerto: boolean; errosSeguidos: number; rodadasDesdeUltimoErro: number; _ultimoErroEm: number; _jogo: string | null }>();
  for (const l of linhas) {
    const h = agregado.get(l.itemRef!) ?? { itemRef: l.itemRef!, vezes: 0, erros: 0, ultimaEm: 0, ultimoAcerto: false, errosSeguidos: 0, rodadasDesdeUltimoErro: 0, _ultimoErroEm: 0, _jogo: null };
    h.vezes += 1;
    if (l.correct !== 1) { h.erros += 1; h.errosSeguidos += 1; h._ultimoErroEm = l.createdAt; h._jogo = l.exerciseKind; }
    else h.errosSeguidos = 0;
    h.ultimaEm = l.createdAt;
    h.ultimoAcerto = l.correct === 1;
    agregado.set(l.itemRef!, h);
  }
  for (const h of agregado.values()) {
    if (!h._ultimoErroEm) continue;
    const rodadas = new Set<string>();
    for (const l of linhas) if (l.roundId && l.exerciseKind === h._jogo && l.createdAt > h._ultimoErroEm) rodadas.add(l.roundId);
    h.rodadasDesdeUltimoErro = rodadas.size;
  }
  return json([...agregado.values()].map(({ _ultimoErroEm: _a, _jogo: _b, ...h }) => h));
}

export async function recordes(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const db = await abrirStore();
  const origem = url.searchParams.get('origem');
  const linhas = (await db.getAll('exercicios')).filter((l) => l.exerciseKind && (!origem || l.origem === origem));
  const porJogo = new Map<string, { exerciseKind: string; melhorPontos: number; melhorEm: number; melhorCombo: number; certos: number; total: number; ultimaEm: number; rodadas: Set<string> }>();
  for (const l of linhas) {
    const r = porJogo.get(l.exerciseKind!) ?? { exerciseKind: l.exerciseKind!, melhorPontos: 0, melhorEm: 0, melhorCombo: 0, certos: 0, total: 0, ultimaEm: 0, rodadas: new Set<string>() };
    if ((l.score ?? 0) > r.melhorPontos) { r.melhorPontos = l.score ?? 0; r.melhorEm = l.createdAt; }
    if ((l.melhorSequencia ?? 0) > r.melhorCombo) r.melhorCombo = l.melhorSequencia ?? 0;
    if (l.correct != null) { r.total += 1; if (l.correct === 1) r.certos += 1; }
    if (l.createdAt > r.ultimaEm) r.ultimaEm = l.createdAt;
    r.rodadas.add(l.roundId ?? l.id);
    porJogo.set(l.exerciseKind!, r);
  }
  return json([...porJogo.values()].map((r) => ({
    exerciseKind: r.exerciseKind, melhorPontos: r.melhorPontos, melhorEm: r.melhorEm,
    melhorCombo: r.melhorCombo, precisao: r.total > 0 ? Math.round((r.certos / r.total) * 100) : null,
    ultimaEm: r.ultimaEm, rodadas: r.rodadas.size,
  })));
}
