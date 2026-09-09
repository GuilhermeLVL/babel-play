/**
 * Contrato da capability `learning` — TIPOS agnósticos de plataforma, liftados do
 * app desktop (`../Tradutor/src/shared/learning/contract.ts`). O mapa de canais IPC
 * do Electron (`LEARNING_IPC`) foi DESCARTADO no lift (local-shaped; na web os
 * contratos viram rotas HTTP). Ver `docs/estrategia-reuso-web.md`.
 */


/* `CachedAnalysis` FOI REMOVIDO daqui junto com a tabela `analyses` (migração 0026).
 *
 * O tipo era um resquício do lift do app desktop, e o próprio comentário dizia "no desktop era
 * cifrada em disco; na web vai para `analyses`". Não ia: nunca houve rota, nunca houve escrita,
 * e a tabela fechou com zero linhas. A análise de sessão é do CLIENTE — quem a quiser persistir
 * escreve a rota e o tipo no mesmo dia, com o formato que a rota realmente aceitar. */

/**
 * Métricas agregadas de DADOS REAIS (metrics-pipeline). Contrato ÚNICO entre o servidor
 * (`computeProfile`) e o cliente (`fetchMetrics`) — antes duplicado nos dois lados e JÁ divergindo
 * (M-06: o cliente tinha `seedsGastas?` opcional; o servidor sempre computa → obrigatório).
 * Honestidade como tipo: contagens são determinísticas; retenção é probabilística e carrega `confidence`.
 */
export interface AppMetrics {
  sessions: number
  wordsCaptured: number
  deckSize: number
  newCards: number
  dueToday: number
  reviews: number
  correctReviews: number
  /** itens de exercício/minigame que NÃO viraram revisão de SRS (evita dupla contagem). */
  drillItems: number
  drillCorrect: number
  /** grade>=3 / total (0..1) — determinístico (contagem). */
  accuracy: number
  accuracyConfidence: number
  /** dias consecutivos com revisão, a partir de hoje. */
  streakDays: number
  /** Total de seeds JÁ GASTAS. O servidor sempre computa; `deriveProgress` faz ganhas − gastas. */
  seedsGastas: number
  /**
   * Ids dos itens da Loja comprados, derivados do log de gastos (`reason: 'loja:<id>'`).
   * B4 fechada (economia-de-creditos 1.2): o servidor é a fonte da posse; o localStorage vira
   * espelho hidratado. Opcional pela mesma regra da economia v2: ausência = lista vazia, não erro.
   */
  itensComprados?: string[]
  /**
   * Cromas comprados (`croma:<item>:<matiz>`), derivados do mesmo razão. Opcional pela regra da
   * economia v2: ausência é lista vazia, nunca erro.
   */
  cromasComprados?: string[]

  /**
   * NÍVEL DE CADA APRIMORAMENTO, derivado do mesmo log (`aprimoramento:<alvo>:<n>`).
   *
   * Vivia só em `localStorage`: o gasto era gravado e nada lia de volta, então editar a chave
   * dava Nv.3 em tudo — e trocar de navegador perdia o que foi pago de verdade.
   */
  aprimoramentos?: Record<string, number>

  /* ── ECONOMIA v2 (2026-08-28). OPCIONAIS de propósito: o servidor efêmero (IndexedDB) já os
     calcula; a edição completa (Postgres) passa a calculá-los numa entrega própria, e até lá
     `deriveProgress` trata ausência como zero — nunca como erro. ── */
  /** Dias distintos com presença registrada. */
  presencas?: number
  /** Sequência ATUAL de dias de presença (termina hoje). */
  streakPresenca?: number
  /** Maior sequência de presença já feita. */
  maiorSequenciaPresenca?: number
  /** Marcos de 7 dias seguidos já alcançados (histórico, nunca diminui). */
  sequencias7?: number
  /** Minutos totais de sessão gravada. */
  capturaMinutos?: number
  /** Minutos de captura PREMIADOS (teto diário aplicado). */
  capturaMinutosPremiados?: number
  /** Rodadas de jogo 100% certas (com o mínimo de itens do jogo). */
  rodadasPerfeitas?: number
  /** Créditos avulsos (conquistas) já somados. */
  seedsCreditadas?: number
  xpCreditado?: number
  /** Idiomas distintos das sessões gravadas (conquista "Poliglota"). */
  idiomas?: number
  /** média de estabilidade FSRS (dias) das cartas revisadas. */
  avgStability: number
  /** retenção prevista média (0..1) — PROBABILÍSTICA. */
  avgRetention: number
  avgRetentionConfidence: number
  /** vocabulário adicionado por semana (para o gráfico de evolução). */
  vocabByWeek: Array<{ weekStart: number; count: number }>
  /** tempo total de fala (ms) somado dos enunciados com timing — determinístico. */
  speakingMs: number
  /** Tempo de áudio OUVIDO ('tab') — o par passivo de speakingMs, que agora é só o mic
      (spec progresso-de-idioma). Opcional: servidores antigos e o efêmero podem não mandar. */
  listeningMs?: number
  /** Ranking das palavras que o usuário mais erra (lapses + dificuldade FSRS + notas ruins);
      só cartões com >= 2 revisões entram — a base fraca fica declarada pela ausência. */
  palavrasDificeis?: Array<{ cardId: string; word: string; lapses: number; revisoes: number; fracaoDeErro: number; pontuacao: number }>
  /** Taxa de acerto por tipo de exercício (mínimo 3 itens por tipo), pior primeiro. */
  acertoPorExercicio?: Array<{ kind: string; total: number; acerto: number }>
  /** palavras por minuto (fala) — determinístico, mas confiança cai com amostra curta. */
  wpm: number
  wpmConfidence: number
  /** palavras distintas no deck (determinístico). */
  uniqueWords: number
  /** distribuição por nível CEFR das cartas do deck (ESTIMATIVA — baixa confiança). */
  levelDistribution: Array<{ level: string; count: number }>
  levelConfidence: number
  asOf: number

  /**
   * DE ONDE ESTES NÚMEROS VÊM. Sem este campo não havia como uma tela saber se estava exibindo
   * dado da conta inteira ou de uma gravação — e a aba de métricas da Sessão exibia os dois
   * misturados, sem distinção visual.
   */
  escopo: EscopoDeMetricas

  /**
   * SOBRE QUANTOS ITENS a métrica foi calculada.
   *
   * Existe porque "1.753 de 1.902 cartões ficaram FORA do cálculo" era uma frase solta, em cinza,
   * no rodapé de um painel — e o painel liderava com quatro palavras "que precisam de atenção"
   * calculadas sobre 8% do acervo. Virando campo do contrato, todo componente recebe a base e
   * pode exibi-la junto do número, em vez de depender de alguém lembrar de escrever a ressalva.
   */
  base: BaseDeCalculo
}

export type EscopoDeMetricas = 'global' | 'sessao'

export interface BaseDeCalculo {
  /** Itens que entraram no cálculo. */
  considerados: number
  /** Itens existentes no escopo. `total - considerados` é o que ficou de fora. */
  total: number
}


/** Bandas CEFR válidas. */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'




/** Resultado de uma rodada de exercício (practice-hub). */
export interface ExerciseResult {
  kind: 'read-aloud' | 'blocks' | 'dictation' | 'compose' | 'fill-blank' | 'active-production'
  correct: boolean
  /** Score por instância 0..1 (opcional → migração aditiva). */
  score?: number
  /** Formato de progressão do exercício. */
  exerciseKind?: 'mc' | 'typing' | 'active-production'
}











/** Intervalos Leitner (dias) por box 1..5. */
export const LEITNER_DAYS = [1, 2, 4, 8, 16]

/* ─────────────────────────── NOTAS DE ANKI: UM VOCABULARIO SO ───────────────────────────
 *
 * O ESTADO DA NOTA era declarado em tres lugares que discordavam (auditoria de 2026-09-07,
 * achado A21): o cliente tipava `'ativa' | 'arquivada' | 'descartada'`, o schema Zod aceitava
 * `'arquivada' | 'ativa' | 'ausente_no_arquivo'`, e a coluna do banco guarda os tres do schema.
 * Resultado medido: filtrar por "Descartadas" na tela respondia 400, e o selo "descartada" da
 * lista nunca aparecia — a nota descartada era exibida como "arquivada", sem o motivo.
 *
 * `descartada` NAO e um estado da coluna: e um RECORTE derivado (`motivo_descarte` preenchido).
 * A distincao importa e esta escrita na tela: descartada = a regua de qualidade recusou, da para
 * corrigir o mapeamento e reimportar; ausente_no_arquivo = a nota sumiu do arquivo desde o ultimo
 * import, que e historico, nao defeito. Por isso sao dois tipos: o que a coluna guarda, e o que a
 * lista aceita filtrar.
 */

/** O que a coluna `anki_notes.estado` guarda. */
export const ESTADOS_DE_NOTA_ANKI = ['ativa', 'arquivada', 'ausente_no_arquivo'] as const
export type EstadoDeNotaAnki = typeof ESTADOS_DE_NOTA_ANKI[number]

/** O que a lista aceita filtrar: os estados mais o recorte derivado `descartada`. */
export const FILTROS_DE_NOTA_ANKI = [...ESTADOS_DE_NOTA_ANKI, 'descartada'] as const
export type FiltroDeNotaAnki = typeof FILTROS_DE_NOTA_ANKI[number]

/**
 * O CURSOR DE PAGINACAO, OPACO.
 *
 * O repositorio devolvia `{ valor, id }` e o cliente tipava `string`: a tela mandava de volta
 * `[object Object]` e nunca o `cursorId`, entao a segunda pagina repetia a primeira para sempre
 * (achado A21, medido). Cursor e detalhe de implementacao do servidor — quem pagina so precisa
 * devolver o que recebeu, e por isso ele viaja como UMA string opaca.
 */
export function cursorDeNotas(valor: number, id: string): string {
  return `${valor}:${id}`
}

export function lerCursorDeNotas(bruto: string | undefined | null): { valor: number; id: string } | null {
  if (!bruto) return null
  const corte = bruto.indexOf(':')
  if (corte <= 0) return null
  const valor = Number(bruto.slice(0, corte))
  const id = bruto.slice(corte + 1)
  return Number.isFinite(valor) && id ? { valor, id } : null
}

/**
 * O MELHOR PLACAR já feito num jogo, numa fonte. Chave = `exerciseKind`.
 *
 * MORA NO CORE porque as três pontas precisam concordar sobre ele: o Express
 * (`server/db/repositories/exerciseResults.ts`), o modo sem conta (`src/data/efemero/servidor.ts`)
 * e o cliente (`src/data/api.ts`), que o consome para decidir a conquista "Duelista".
 *
 * Antes de 07/09 havia duas declarações: a do cliente tinha `melhorCombo`, `precisao` e
 * `ultimaEm`; a do servidor não — e o servidor era quem respondia. `melhorCombo ?? 0` lia um campo
 * que nunca chegava, e a conquista nunca disparava na conta logada. Os três campos são opcionais
 * porque uma base sem rodadas novas não tem combo gravado; ausente é ausente, não zero.
 */
export interface RecordeDoJogo {
  exerciseKind: string
  melhorPontos: number
  /** Quando a melhor rodada aconteceu (epoch-ms). */
  melhorEm: number
  /** Rodadas DISTINTAS já jogadas — `score` é por item, então contar linhas mentiria. */
  rodadas: number
  /** Combo máximo já alcançado no jogo. Ausente quando nenhuma rodada gravou combo. */
  melhorCombo?: number
  /** % de acerto entre todos os itens respondidos; `null` quando não há item respondido. */
  precisao?: number | null
  /** Quando o jogo foi jogado pela última vez (epoch-ms). */
  ultimaEm?: number
}
