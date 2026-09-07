/**
 * STORE LOCAL do modo anônimo — IndexedDB via `idb`.
 *
 * Guarda as MESMAS formas cruas que o servidor devolve (`SessionRow`, `UtteranceRow`, `VocabRow`),
 * mais o mínimo de contabilidade para a migração (`migradaEm`, `idServidor`, `audioPendente`).
 * Assim `sessionToRecording`/`rowToVocabCard` em `data/api.ts` continuam intactos, e o replay
 * para o servidor no 1º login não perde o timestamp real.
 *
 * Por que IndexedDB e não localStorage: uma hora de captura passa dos 5 MB, e o áudio é binário.
 * O áudio é guardado como ArrayBuffer + tipo (não como Blob): `structuredClone` de Blob varia
 * entre ambientes, e ArrayBuffer clona em todos.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface SessaoLocal {
  id: string;
  title: string | null;
  kind: string | null;
  createdAt: number;
  updatedAt: number;
  durationMs: number | null;
  wordCount: number | null;
  sourceLang: string | null;
  targetLang: string | null;
  status: string | null;
  meta: string | null;
  /**
   * O id que o CHAMADOR deu à sessão, quando deu — a chave de idempotência.
   *
   * O Express tem `sessions.origem_local_id` com índice único, e é por ele que reenviar a mesma
   * sessão devolve `jaExistia: true` em vez de duplicar. O efêmero ignorava o campo (auditoria de
   * 2026-09-07, achado A23): as duas pontas da MESMA operação tinham garantias diferentes, e uma
   * migração interrompida e repetida duplicava tudo do lado de cá.
   */
  origemLocalId?: string | null;
  /** Preenchidos pela migração (data/migracao.ts). */
  migradaEm?: number;
  idServidor?: string;
  audioPendente?: boolean;
}

export interface FalaLocal {
  id: string;
  sessionId: string;
  idx: number | null;
  speakerName: string | null;
  source: string | null;
  sourceLang: string | null;
  sourceText: string | null;
  targetLang: string | null;
  translatedText: string | null;
  tStartMs: number | null;
  tEndMs: number | null;
  engine: string | null;
  confidence: number | null;
}

export interface AudioLocal {
  sessionId: string;
  bytes: ArrayBuffer;
  tipo: string;
}

export interface CartaoLocal {
  id: string;
  normKey: string;
  word: string;
  back: string | null;
  sentence: string | null;
  srcLang: string | null;
  tgtLang: string | null;
  clozePrompt: string | null;
  clozeAnswer: string | null;
  box: number | null;
  dueAt: number | null;
  stability: number | null;
  difficulty: number | null;
  reps: number | null;
  lapses: number | null;
  lastReview: number | null;
  sessionId: string | null;
  inDeck: number | null;
  cefrLevel: string | null;
  cefrConfidence: number | null;
  createdAt: number;
  occurrences: number;
}

export interface RevisaoLocal {
  id: string;
  cardId: string;
  reviewedAt: number;
  grade: number;
  prevStability: number | null;
  newStability: number | null;
}

export interface ExercicioLocal {
  id: string;
  createdAt: number;
  roundId: string | null;
  exerciseKind: string | null;
  kind: string | null;
  origem: string | null;
  sessionId: string | null;
  itemRef: string | null;
  cardId: string | null;
  correct: number | null;
  attempts: number | null;
  ms: number | null;
  hinted: number | null;
  score: number | null;
  /** Combo maximo da RODADA (igual em todas as linhas do mesmo roundId). */
  melhorSequencia: number | null;
}

export interface GastoLocal {
  spendId: string;
  amount: number;
  reason: string;
  ref: string | null;
  createdAt: number;
}

interface BabelLocalDB extends DBSchema {
  sessoes: { key: string; value: SessaoLocal; indexes: { porCriacao: number } };
  falas: { key: string; value: FalaLocal; indexes: { porSessao: string } };
  audios: { key: string; value: AudioLocal };
  cartoes: { key: string; value: CartaoLocal; indexes: { porNormKey: string } };
  revisoes: { key: string; value: RevisaoLocal; indexes: { porCartao: string } };
  exercicios: { key: string; value: ExercicioLocal; indexes: { porSessao: string } };
  gastos: { key: string; value: GastoLocal };
  /* Economia v2 (2026-08-28): presença diária e créditos avulsos (conquistas). */
  presencas: { key: number; value: PresencaLocal };
  creditos: { key: string; value: CreditoLocal };
}

export interface PresencaLocal {
  /** Número do dia local (ver `diaLocal` no core). Uma linha por dia. */
  dia: number;
  createdAt: number;
}

export interface CreditoLocal {
  creditoId: string;
  amount: number;
  xp: number;
  reason: string;
  createdAt: number;
}

export const NOME_DO_BANCO = 'babel-local';

let aberto: Promise<IDBPDatabase<BabelLocalDB>> | null = null;

export function abrirStore(): Promise<IDBPDatabase<BabelLocalDB>> {
  aberto ??= openDB<BabelLocalDB>(NOME_DO_BANCO, 2, {
    /* `upgrade` roda para QUALQUER salto de versão: cria só o que falta, para um banco da v1 (já
       com dados) ganhar os stores novos sem perder nada. */
    upgrade(db) {
      const tem = (n: string) => db.objectStoreNames.contains(n as never);
      if (!tem('sessoes')) db.createObjectStore('sessoes', { keyPath: 'id' }).createIndex('porCriacao', 'createdAt');
      if (!tem('falas')) db.createObjectStore('falas', { keyPath: 'id' }).createIndex('porSessao', 'sessionId');
      if (!tem('audios')) db.createObjectStore('audios', { keyPath: 'sessionId' });
      if (!tem('cartoes')) db.createObjectStore('cartoes', { keyPath: 'id' }).createIndex('porNormKey', 'normKey');
      if (!tem('revisoes')) db.createObjectStore('revisoes', { keyPath: 'id' }).createIndex('porCartao', 'cardId');
      if (!tem('exercicios')) db.createObjectStore('exercicios', { keyPath: 'id' }).createIndex('porSessao', 'sessionId');
      if (!tem('gastos')) db.createObjectStore('gastos', { keyPath: 'spendId' });
      // v2 — economia: presença diária e créditos de conquista.
      if (!tem('presencas')) db.createObjectStore('presencas', { keyPath: 'dia' });
      if (!tem('creditos')) db.createObjectStore('creditos', { keyPath: 'creditoId' });
    },
  });
  return aberto;
}

/** Apaga tudo (fim da migração, ou "esquecer este navegador"). */
export async function limparTudo(): Promise<void> {
  const db = await abrirStore();
  const tx = db.transaction(['sessoes', 'falas', 'audios', 'cartoes', 'revisoes', 'exercicios', 'gastos', 'presencas', 'creditos'], 'readwrite');
  await Promise.all([
    tx.objectStore('sessoes').clear(), tx.objectStore('falas').clear(), tx.objectStore('audios').clear(),
    tx.objectStore('cartoes').clear(), tx.objectStore('revisoes').clear(), tx.objectStore('exercicios').clear(),
    tx.objectStore('gastos').clear(), tx.objectStore('presencas').clear(), tx.objectStore('creditos').clear(), tx.done,
  ]);
}

/** Há algo guardado neste navegador? (decide se o modal de migração aparece) */
export async function temDadosLocais(): Promise<boolean> {
  const db = await abrirStore();
  return (await db.count('sessoes')) > 0 || (await db.count('cartoes')) > 0;
}

/** Só para testes: fecha e esquece a conexão (o próximo `abrirStore` reabre). */
export async function fecharStore(): Promise<void> {
  if (!aberto) return;
  (await aberto).close();
  aberto = null;
}
