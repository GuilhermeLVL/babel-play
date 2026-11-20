/**
 * A AGENDA DAS CHAMADAS AUTOMÁTICAS DO ASSISTENTE AO VIVO (Fase C2) — quem decide QUANDO uma linha final vai à nuvem.
 *
 * As regras do orçamento (spec, "Recomendações para a tela"):
 *  - só linha FINAL (quem filtra é quem oferece: `planejarChamadas` recusa parcial);
 *  - com ESPERA (debounce): a linha só é pedida depois de `esperaMs` sem outra linha final chegando. Numa conversa
 *    rápida, a linha atropelada pela seguinte não é pedida — ninguém teve tempo de lê-la, e a chamada custaria do teto
 *    do dia da pessoa;
 *  - UMA chamada por linha, nunca duas (o cliente ainda guarda a resposta em cache por texto);
 *  - NADA enquanto a janela está pausada, escondida ou fechada: a linha que esperava volta a valer ao continuar.
 *
 * Sem React: os testes rodam com relógio falso.
 */
export const ESPERA_DO_ASSISTENTE_MS = 700;

export interface AgendaDoAssistente<F extends { id: string }> {
  /** Uma linha final nova (ou a mesma de novo: ignorada se já foi pedida). */
  oferecer(fala: F): void;
  /** Pausada, escondida ou fechada (true): nada sai; ao voltar (false), a linha que esperava é pedida. */
  pausar(pausado: boolean): void;
  /** Já pedida? (para os testes e para não repetir) */
  pedida(id: string): boolean;
  destruir(): void;
}

export function criarAgenda<F extends { id: string }>(o: {
  executar: (fala: F) => void;
  esperaMs?: number;
  pausado?: boolean;
}): AgendaDoAssistente<F> {
  const espera = o.esperaMs ?? ESPERA_DO_ASSISTENTE_MS;
  const pedidas = new Set<string>();
  let pendente: F | null = null;
  let relogio: ReturnType<typeof setTimeout> | null = null;
  let pausado = o.pausado ?? false;
  let viva = true;

  const parar = () => {
    if (relogio) clearTimeout(relogio);
    relogio = null;
  };
  const agendar = () => {
    parar();
    if (!pendente || pausado || !viva) return;
    relogio = setTimeout(() => {
      relogio = null;
      const f = pendente;
      if (!f || pausado || !viva || pedidas.has(f.id)) return;
      pendente = null;
      pedidas.add(f.id);
      o.executar(f);
    }, espera);
  };

  return {
    oferecer(fala) {
      if (!viva || pedidas.has(fala.id)) return;
      pendente = fala;
      agendar();
    },
    pausar(p) {
      pausado = p;
      if (p) parar();
      else agendar();
    },
    pedida: (id) => pedidas.has(id),
    destruir() {
      viva = false;
      parar();
      pendente = null;
    },
  };
}
