/**
 * O RITMO DA LEGENDA — a fila de exibição das Legendas flutuantes (ei/leg).
 *
 * O defeito que isto corrige: a janelinha mostrava só as 1–2 últimas falas, e cada fala nova
 * empurrava a anterior para fora na hora. Numa conversa rápida a legenda sumia antes de dar
 * tempo de ler. Agora cada fala fica na tela PELO MENOS o tempo de leitura dela (caracteres ÷
 * velocidade, contando a tradução quando ela aparece), e a seguinte espera a vez em vez de
 * sobrescrever. O parcial da fala atual cresce no lugar: o mesmo id não volta para a fila nem
 * reinicia o relógio.
 *
 * PURO de propósito: sem React, sem relógio próprio. Quem chama passa `agora` e agenda o próximo
 * passo com `proximaEmMs`; pausar é simplesmente não chamar `avancar`. É isso que deixa o teste
 * decidir o tempo em vez de esperar por ele.
 *
 * A fila tem teto (`FILA_MAXIMA`): se a pessoa fala mais rápido do que dá para ler, as mais
 * antigas da fila vão direto ao histórico (continuam lá para voltar e ler), e o atraso da legenda
 * em relação à fala fica limitado — legenda de dois minutos atrás não serve para nada.
 */

export type Leitura = 'lenta' | 'normal' | 'rapida';

/** Caracteres por segundo de cada ritmo. 15/s é a média de legenda de TV adulta. */
export const CARACTERES_POR_SEGUNDO: Record<Leitura, number> = { lenta: 10, normal: 15, rapida: 22 };
/** Nem a fala de uma palavra some antes disto. */
export const MINIMO_MS = 1500;
/** Nem a fala enorme segura a fila por mais que isto. */
export const MAXIMO_MS = 12_000;
/** Quantas falas podem esperar a vez; além disso, as mais antigas entram direto no histórico. */
export const FILA_MAXIMA = 3;

/** O que o ritmo precisa de cada fala: quem é e quanto texto há para ler. */
export interface FalaDoRitmo {
  id: string;
  /** Original + tradução quando ela está à mostra. */
  caracteres: number;
}

export interface EstadoDoRitmo {
  /** As falas que já entraram na tela, na ordem da lista (o histórico). */
  reveladas: string[];
  /** A fala em destaque: a última que entrou. */
  atual: string | null;
  /** Quando a atual entrou (ms, o mesmo relógio de `agora`). */
  desdeMs: number;
}

export const RITMO_VAZIO: EstadoDoRitmo = { reveladas: [], atual: null, desdeMs: 0 };

export function tempoDeLeitura(caracteres: number, leitura: Leitura): number {
  const ms = Math.round((Math.max(0, caracteres) / CARACTERES_POR_SEGUNDO[leitura]) * 1000);
  return Math.min(MAXIMO_MS, Math.max(MINIMO_MS, ms));
}

/** Abrir a janela no meio da captura: o que já foi dito aparece de uma vez, sem enfileirar o passado. */
export function iniciarRitmo(falas: readonly FalaDoRitmo[], agora: number): EstadoDoRitmo {
  return saltarParaOFim(RITMO_VAZIO, falas, agora);
}

/** Retomar depois de pausar: tudo o que chegou entra, e a mais recente vira a atual. */
export function saltarParaOFim(estado: EstadoDoRitmo, falas: readonly FalaDoRitmo[], agora: number): EstadoDoRitmo {
  if (!falas.length) return { ...RITMO_VAZIO };
  const ultima = falas[falas.length - 1].id;
  const mesmaAtual = estado.atual === ultima && estado.reveladas.length === falas.length;
  return { reveladas: falas.map((f) => f.id), atual: ultima, desdeMs: mesmaAtual ? estado.desdeMs : agora };
}

/** Quantas falas esperam a vez. */
export function pendentes(estado: EstadoDoRitmo, falas: readonly FalaDoRitmo[]): number {
  const vistas = new Set(estado.reveladas);
  let n = 0;
  for (const f of falas) if (!vistas.has(f.id)) n++;
  return n;
}

/**
 * Um passo do ritmo. Revela no máximo UMA fala da fila (a mais antiga) quando a atual já cumpriu
 * o tempo de leitura, e diz daqui a quanto o próximo passo tem algo a fazer (`null` = fila vazia).
 * Devolve o MESMO objeto de estado quando nada mudou — o chamador pode comparar por identidade.
 */
export function avancar(
  estado: EstadoDoRitmo,
  falas: readonly FalaDoRitmo[],
  agora: number,
  leitura: Leitura,
): { estado: EstadoDoRitmo; proximaEmMs: number | null } {
  const presentes = new Set(falas.map((f) => f.id));
  let reveladas = estado.reveladas.every((id) => presentes.has(id))
    ? estado.reveladas
    : estado.reveladas.filter((id) => presentes.has(id));
  let { atual, desdeMs } = estado;
  if (atual && !presentes.has(atual)) atual = null;

  const vistas = new Set(reveladas);
  const fila = falas.filter((f) => !vistas.has(f.id));
  const revelar = (ids: string[]) => {
    for (const id of ids) vistas.add(id);
    reveladas = falas.filter((f) => vistas.has(f.id)).map((f) => f.id);
    atual = ids[ids.length - 1];
    desdeMs = agora;
  };

  if (fila.length > FILA_MAXIMA) {
    revelar(fila.splice(0, fila.length - FILA_MAXIMA).map((f) => f.id));
  } else if (fila.length && !atual) {
    revelar([fila.shift()!.id]);
  } else if (fila.length) {
    const daAtual = falas.find((f) => f.id === atual)!;
    if (agora - desdeMs >= tempoDeLeitura(daAtual.caracteres, leitura)) revelar([fila.shift()!.id]);
  }

  const mudou = reveladas !== estado.reveladas || atual !== estado.atual || desdeMs !== estado.desdeMs;
  const novo = mudou ? { reveladas, atual, desdeMs } : estado;
  if (!fila.length || !novo.atual) return { estado: novo, proximaEmMs: null };
  const daAtual = falas.find((f) => f.id === novo.atual)!;
  return {
    estado: novo,
    proximaEmMs: Math.max(0, novo.desdeMs + tempoDeLeitura(daAtual.caracteres, leitura) - agora),
  };
}

/**
 * O pedaço do histórico que a janela mostra. Seguindo o fim (`cursor` nulo): as `quantas` últimas,
 * com a atual em foco. Voltando no histórico: a janela termina no cursor, e `novasDepois` conta
 * as que vieram depois (o "N novas ↓").
 */
export function janelaDaLegenda(
  reveladas: readonly string[],
  quantas: number,
  cursor: string | null,
  atual: string | null,
): { ids: string[]; foco: string | null; novasDepois: number } {
  const i = cursor ? reveladas.indexOf(cursor) : -1;
  if (i < 0) {
    return { ids: reveladas.slice(-quantas), foco: atual ?? reveladas[reveladas.length - 1] ?? null, novasDepois: 0 };
  }
  return {
    ids: reveladas.slice(Math.max(0, i - quantas + 1), i + 1),
    foco: reveladas[i],
    novasDepois: reveladas.length - 1 - i,
  };
}
