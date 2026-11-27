/**
 * O MODO TRADUÇÃO (openspec `leitura-assistida`, fatia B): soltar a seleção traduz sozinho, depois de uma pausa curta
 * (250 ms), e uma seleção nova CANCELA a anterior: só a tradução da seleção atual chega à tela, e nunca há pedido duplicado.
 * Puro: o relógio e a tradução entram por parâmetro.
 */
export const ATRASO_DO_MODO_TRADUCAO_MS = 250;

export type EstadoDaTraducao =
  | { fase: 'ociosa' }
  | { fase: 'carregando' }
  | { fase: 'pronta'; texto: string }
  | { fase: 'falhou' };

export interface Relogio {
  setTimeout: (f: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export interface OpcoesDaTraducaoAutomatica {
  /** Traduz o texto; `null` = não deu. Quem chama pode já guardar em cache. */
  traduzir: (texto: string) => Promise<string | null>;
  aoMudar: (e: EstadoDaTraducao) => void;
  atrasoMs?: number;
  relogio?: Relogio;
}

export function criarTraducaoAutomatica(o: OpcoesDaTraducaoAutomatica) {
  const relogio: Relogio = o.relogio ?? {
    setTimeout: (f, ms) => setTimeout(f, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  };
  let geracao = 0;
  let timer: unknown = null;
  const limpar = () => {
    if (timer != null) relogio.clearTimeout(timer);
    timer = null;
  };
  return {
    /** Agenda a tradução de `texto`; substitui qualquer pedido pendente ou em andamento. */
    agendar(texto: string, atrasoMs = o.atrasoMs ?? ATRASO_DO_MODO_TRADUCAO_MS) {
      limpar();
      const minha = ++geracao;
      o.aoMudar({ fase: 'carregando' });
      timer = relogio.setTimeout(() => {
        timer = null;
        void o
          .traduzir(texto)
          .catch(() => null)
          .then((r) => {
            if (minha !== geracao) return; // a seleção mudou: este resultado não vale mais
            o.aoMudar(r ? { fase: 'pronta', texto: r } : { fase: 'falhou' });
          });
      }, atrasoMs);
    },
    /** A seleção saiu: nada pendente chega à tela. */
    cancelar() {
      geracao++;
      limpar();
      o.aoMudar({ fase: 'ociosa' });
    },
  };
}
