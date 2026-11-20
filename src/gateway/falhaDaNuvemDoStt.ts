/**
 * "A NUVEM DO STT FALHOU" — o sinal que acorda a reserva local preguiçosa (celular e Quest).
 *
 * Com a nuvem como motor principal, o modelo local só é preciso quando ela falha. Nos aparelhos em
 * que baixar e segurar a reserva custa caro (`lib/captura/reservaLocal.ts`), a captura não baixa
 * nada de início e ouve este sinal: na PRIMEIRA falha — HTTP de erro (402 de cota, 429, 503 do
 * disjuntor do servidor, 5xx) ou rede — a reserva começa a carregar. A pausa do adaptador
 * (`PausaDaNuvem`, o disjuntor do cliente) sempre começa numa falha, então também passa por aqui.
 *
 * Um conjunto de ouvintes no módulo, e não um evento de `window`: o adaptador roda no teste de Node
 * e na importação, onde não há janela, e quem ouve precisa soltar ao trocar de rota.
 */
/**
 * Por que a nuvem PAUSOU: `cota` (402, ou 429 de teto do dia/uso justo), `indisponivel` (503),
 * `falhas` (a 3ª 5xx seguida) ou `ocupada` (429 `nuvem_ocupada`: a admissão cheia ou a colisão da
 * captura dupla — passa em segundos e não justifica carregar um modelo de 2 GB).
 */
export type MotivoDaPausaDaNuvem = 'cota' | 'indisponivel' | 'falhas' | 'ocupada';

/** O que a falha diz: `pausou` = a nuvem entrou em pausa (não foi um soluço), e o `motivo` dela. */
export interface FalhaDaNuvemDoStt {
  pausou: boolean;
  /** Só com `pausou`. */
  motivo?: MotivoDaPausaDaNuvem;
}
type Ouvinte = (falha: FalhaDaNuvemDoStt) => void;

const ouvintes = new Set<Ouvinte>();
const ouvintesDaVolta = new Set<() => void>();

/** Registra quem quer saber da próxima falha. Devolve a função que solta o registro. */
export function aoFalharANuvemDoStt(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Chamado pelo adaptador groq-whisper a cada falha que não é cancelamento. Nunca lança. */
export function avisarFalhaDaNuvemDoStt(falha: FalhaDaNuvemDoStt = { pausou: false }): void {
  for (const o of [...ouvintes]) {
    try {
      o(falha);
    } catch {
      /* um ouvinte quebrado não impede os outros nem a transcrição */
    }
  }
}

/**
 * Quem quer saber de cada resposta BOA da nuvem (a reserva pesada sai quando a nuvem volta estável).
 * Devolve a função que solta o registro.
 */
export function aoResponderANuvemDoStt(ouvinte: () => void): () => void {
  ouvintesDaVolta.add(ouvinte);
  return () => {
    ouvintesDaVolta.delete(ouvinte);
  };
}

/** Chamado pelo adaptador groq-whisper a cada resposta boa. Nunca lança. */
export function avisarRespostaDaNuvemDoStt(): void {
  for (const o of [...ouvintesDaVolta]) {
    try {
      o();
    } catch {
      /* idem */
    }
  }
}
