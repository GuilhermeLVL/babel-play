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
type Ouvinte = () => void;

const ouvintes = new Set<Ouvinte>();

/** Registra quem quer saber da próxima falha. Devolve a função que solta o registro. */
export function aoFalharANuvemDoStt(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Chamado pelo adaptador groq-whisper a cada falha que não é cancelamento. Nunca lança. */
export function avisarFalhaDaNuvemDoStt(): void {
  for (const o of [...ouvintes]) {
    try {
      o();
    } catch {
      /* um ouvinte quebrado não impede os outros nem a transcrição */
    }
  }
}
