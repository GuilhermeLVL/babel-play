/**
 * ESPELHO SEM CONTA — cartões, revisão FSRS e paginação do acervo.
 *
 * Metade de `src/data/rotas/vocabulario.ts`: as MESMAS rotas `/api/vocab/*` sobre o IndexedDB.
 *
 * Rotas: GET `/api/vocab`, GET `/api/vocab/pagina`, GET `/api/vocab/inicio-da-contagem`,
 * POST `/api/vocab/bulk-add`, PATCH/DELETE `/api/vocab/:id`, POST `/api/vocab/:id/review`.
 *
 * `/api/vocab/relabel` NÃO tem espelho — está justificada em `tests/contratos/rotas-espelhadas`
 * (escrita cruzada no acervo, só com conta), e é essa ausência declarada que a tabela guarda.
 */
/**
 * A MESMA CHAVE DO SERVIDOR — agora de verdade (auditoria de 2026-09-07, achado A24).
 *
 * O comentário aqui dizia "mesma chave do servidor" e a implementação diferia em TRÊS pontos: a
 * ordem dos campos era invertida (`palavra|lang` contra `lang|palavra`), a pontuação não era
 * removida, e o idioma entrava como locale inteiro em vez da base. "Água!" em `pt-BR` era uma
 * carta aqui e outra lá — e a conta só era feita na MIGRAÇÃO, onde o estrago aparece: quem estudou
 * sem conta e depois criou uma via o acervo duplicar palavras que já tinha.
 *
 * Comentário que afirma paridade sem teste que a prove envelhece para mentira. A implementação
 * agora é uma só (`core/texto/palavra.ts`) e `tests/paridade-anonima.test.ts` a trava.
 */
import { chaveDedup } from '@core/texto/palavra';

import { Fsrs5Strategy, type Grade, type SchedulingState } from '../../../core/learning/scheduler';
import { estadoDoTeto, motivoDoTeto } from '../../../core/tetoAnonimo';
import { type Json,json, lerJson, num, str, uuid } from '../nucleo';
import { abrirStore, type CartaoLocal } from '../store';
export { chaveDedup };

/**
 * A chave que ESTA VERSÃO gravava, para reconhecer cartas antigas uma última vez.
 *
 * Some quando não houver mais base anônima anterior a 2026-09-07 — e some sozinha: cada carta
 * encontrada por aqui é regravada com a chave nova no mesmo fluxo que a encontrou.
 */
function chaveDedupLegada(word: string, srcLang: string | null | undefined): string {
  const w = (word ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return `${w}|${(srcLang ?? '').toLowerCase()}`;
}

async function acharPelaChaveAntiga(
  // O nome do índice é literal ('porNormKey'), não `string`: o `IDBPObjectStore` do `idb` tipa
  // `index()` pelos índices declarados no schema, e um parâmetro `string` não casa com isso.
  store: { index: (nome: 'porNormKey') => { get: (k: string) => Promise<CartaoLocal | undefined> } },
  word: string,
  srcLang: string | null | undefined,
): Promise<CartaoLocal | undefined> {
  const legada = chaveDedupLegada(word, srcLang);
  return legada ? store.index('porNormKey').get(legada) : undefined;
}

export async function listarCartoes(): Promise<Response> {
  const db = await abrirStore();
  return json(await db.getAll('cartoes'));
}

export async function adicionarCartoes(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const entrada = Array.isArray(p.cards) ? (p.cards as Json[]) : [];
  const db = await abrirStore();

  /* Mesmo teto, outro recurso. A recusa é do LOTE inteiro e não parcial de propósito: fichar
     metade das palavras que a pessoa marcou, em silêncio, seria pior do que recusar e explicar. */
  const jaFichadas = await db.count('cartoes');
  const tetoP = estadoDoTeto('palavras', jaFichadas);
  if (!tetoP.cabe) {
    return json({ error: motivoDoTeto('palavras'), codigo: 'TETO_ANONIMO', recurso: 'palavras', ...tetoP }, 507);
  }

  const agora = Date.now();
  const skipped: Array<{ word: string; motivo: string }> = [];
  const resultado = new Map<string, CartaoLocal>();
  const tx = db.transaction('cartoes', 'readwrite');
  for (const c of entrada) {
    const word = str(c.word)?.trim() ?? '';
    if (!word) { skipped.push({ word: String(c.word ?? ''), motivo: 'palavra vazia' }); continue; }
    const srcLang = str(c.srcLang);
    const normKey = chaveDedup(word, srcLang);
    const existente = resultado.get(normKey)
      ?? (await tx.store.index('porNormKey').get(normKey))
      /* CARTA GRAVADA COM A CHAVE ANTIGA. A forma da chave mudou (ver `chaveDedup`), então uma
         carta guardada antes desta versão não é encontrada pelo índice — e sem esta busca ela
         duplicaria uma vez, justamente para quem já usava o modo sem conta. A varredura é barata:
         o modo anônimo tem teto de 80 palavras (`TETO_ANONIMO`). */
      ?? (await acharPelaChaveAntiga(tx.store, word, srcLang));
    if (existente) {
      const atualizado: CartaoLocal = {
        ...existente, occurrences: existente.occurrences + 1,
        back: existente.back || str(c.back), sentence: existente.sentence || str(c.sentence),
      };
      await tx.store.put(atualizado);
      resultado.set(normKey, atualizado);
      continue;
    }
    const novo: CartaoLocal = {
      id: uuid(), normKey, word, back: str(c.back), sentence: str(c.sentence), srcLang, tgtLang: str(c.tgtLang),
      clozePrompt: str(c.clozePrompt), clozeAnswer: str(c.clozeAnswer), box: 1, dueAt: agora,
      stability: null, difficulty: null, reps: null, lapses: null, lastReview: null,
      sessionId: str(c.sessionId), inDeck: 1, cefrLevel: null, cefrConfidence: null, createdAt: agora, occurrences: 1,
    };
    await tx.store.put(novo);
    resultado.set(normKey, novo);
  }
  await tx.done;
  return json({ cards: [...resultado.values()], skipped });
}

export async function editarCartao(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const db = await abrirStore();
  const c = await db.get('cartoes', m[1]);
  if (!c) return json({ error: 'card não encontrado' }, 404);
  const novo: CartaoLocal = {
    ...c,
    back: typeof p.back === 'string' ? p.back : c.back,
    inDeck: typeof p.inDeck === 'boolean' ? (p.inDeck ? 1 : 0) : c.inDeck,
  };
  await db.put('cartoes', novo);
  return json(novo);
}

/** O estado do agendador lido do cartão local. Métricas também o usa (retenção prevista). */
export function estadoDe(c: CartaoLocal): SchedulingState {
  return {
    box: c.box ?? 1, dueAt: c.dueAt ?? 0,
    stability: c.stability ?? undefined, difficulty: c.difficulty ?? undefined,
    reps: c.reps ?? undefined, lapses: c.lapses ?? undefined, lastReview: c.lastReview ?? undefined,
  };
}

export async function revisarCartao(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const grade = num(p.grade);
  if (grade !== 1 && grade !== 2 && grade !== 3 && grade !== 4) return json({ error: 'grade inválido' }, 400);
  const db = await abrirStore();
  const c = await db.get('cartoes', m[1]);
  if (!c) return json({ error: 'card não encontrado' }, 404);
  const agora = Date.now();
  const prev = estadoDe(c);
  const next = Fsrs5Strategy.review(prev, grade as Grade, agora);
  const novo: CartaoLocal = {
    ...c, box: next.box, dueAt: next.dueAt, stability: next.stability ?? null, difficulty: next.difficulty ?? null,
    reps: next.reps ?? null, lapses: next.lapses ?? null, lastReview: next.lastReview ?? null,
  };
  const tx = db.transaction(['cartoes', 'revisoes'], 'readwrite');
  await tx.objectStore('cartoes').put(novo);
  await tx.objectStore('revisoes').put({
    id: uuid(), cardId: c.id, reviewedAt: agora, grade, prevStability: prev.stability ?? null, newStability: next.stability ?? null,
  });
  await tx.done;
  return json(novo);
}

/**
 * O CATALOGO DE PALAVRAS paginado — busca, filtros e ordenacao.
 *
 * No servidor real isto e SQL com cursor composto; aqui e o mesmo contrato sobre um array. A ordem
 * de aplicacao e a dele (filtra, conta o total, ordena, corta a pagina) porque o `total` que a tela
 * mostra e o do FILTRO, nao o do acervo — mostrar o acervo inteiro acima de uma lista de doze seria
 * a mesma contagem desonesta que o resto do app ja corrigiu.
 */
export async function paginaDeCartoes(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const db = await abrirStore();
  const q = url.searchParams;
  const limite = Math.min(Math.max(Number(q.get('limite') ?? 200) || 200, 1), 500);
  const ordem = (q.get('ordem') ?? 'recentes') as 'recentes' | 'frequentes' | 'dificuldade' | 'alfabetica';
  const busca = (q.get('q') ?? '').trim().toLowerCase();
  const niveis = (q.get('niveis') ?? '').split(',').filter(Boolean);
  const cursorId = q.get('cursorId');

  let cartoes = (await db.getAll('cartoes')).filter((c) => c.inDeck !== 0);
  if (busca) {
    // Palavra E traducao: procurar "alavanc" tem de achar tanto "leverage" quanto o verso.
    cartoes = cartoes.filter((c) => c.word.toLowerCase().includes(busca) || (c.back ?? '').toLowerCase().includes(busca));
  }
  if (niveis.length) {
    // 'ausente' e um filtro legitimo: "o que eu tenho sem nivel" e uma pergunta real.
    const querAusente = niveis.includes('ausente');
    const reais = niveis.filter((n) => n !== 'ausente');
    cartoes = cartoes.filter((c) => (c.cefrLevel ? reais.includes(c.cefrLevel) : querAusente));
  }
  /* `origens` NAO e aplicado aqui, e isto e uma ausencia declarada: a procedencia mora em
     `vocab_occurrences`, que o modo sem conta nao tem — ele guarda a contagem no cartao, nao a
     linha do tempo. Filtrar por origem devolveria uma lista vazia em vez de dizer que nao sabe. */

  const total = cartoes.length;
  const valorDe = (c: CartaoLocal): number | string | null =>
    ordem === 'recentes' ? c.createdAt
      : ordem === 'frequentes' ? c.occurrences
        : ordem === 'dificuldade' ? (c.difficulty ?? null)
          : c.word;

  cartoes.sort((a, b) => {
    const va = valorDe(a); const vb = valorDe(b);
    if (ordem === 'alfabetica') return String(va).localeCompare(String(vb)) || a.id.localeCompare(b.id);
    return (Number(vb ?? 0) - Number(va ?? 0)) || a.id.localeCompare(b.id);
  });

  /* O cursor e por ID e nao por valor: a lista ja esta ordenada em memoria, entao "continue depois
     daquele item" e uma posicao, nao um predicado. No servidor o cursor precisa ser composto
     porque a ordenacao acontece no SQL. */
  if (cursorId) {
    const i = cartoes.findIndex((c) => c.id === cursorId);
    if (i >= 0) cartoes = cartoes.slice(i + 1);
  }

  const temMais = cartoes.length > limite;
  const pagina = cartoes.slice(0, limite);
  const ultimo = pagina[pagina.length - 1];
  return json({
    itens: pagina,
    total,
    proximoCursor: temMais && ultimo ? { valor: valorDe(ultimo), id: ultimo.id } : null,
  });
}

/**
 * QUANDO A CONTAGEM DE ENCONTROS COMECOU A VALER.
 *
 * A tela usa isto para nao afirmar "visto 1 vez" sobre um cartao anterior a contagem. Sem conta
 * NAO HA acervo legado: o IndexedDB nasceu depois da contagem, entao todo cartao daqui tem
 * `occurrences` de verdade. `totalLegado` e zero porque e verdade, nao porque nao sabemos contar.
 */
export async function inicioDaContagemLocal(): Promise<Response> {
  const db = await abrirStore();
  const cartoes = await db.getAll('cartoes');
  const inicioEm = cartoes.length ? Math.min(...cartoes.map((c) => c.createdAt)) : null;
  return json({ inicioEm, totalLegado: 0, total: cartoes.length });
}

/** Apaga um cartao. Sem `deleted_at`: no navegador o apagar e apagar. */
export async function apagarCartao(m: RegExpMatchArray): Promise<Response> {
  const db = await abrirStore();
  const c = await db.get('cartoes', m[1]);
  if (!c) return json({ error: 'cartao nao encontrado' }, 404);
  await db.delete('cartoes', m[1]);
  /* As revisoes dele vao junto: uma revisao orfa contaria para as metricas de um cartao que nao
     existe mais, e o servidor real derruba as duas coisas com a mesma FOREIGN KEY. */
  for (const r of await db.getAll('revisoes')) if (r.cardId === m[1]) await db.delete('revisoes', r.id);
  return json({ ok: true });
}
