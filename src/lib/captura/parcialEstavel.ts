/**
 * A TRADUÇÃO PARCIAL ESTÁVEL do intérprete (chave `parcialTraduzido`, Intérprete v3). Enquanto a pessoa fala,
 * o reconhecedor devolve o texto até agora a cada ~1 s, e ele muda a cada leitura. Traduzir todo parcial custa
 * uma chamada de tradução por refinamento e faz o texto cinza piscar; por isso só se traduz o que está ESTÁVEL:
 *   - as DUAS últimas leituras da fala são iguais (o reconhecedor parou de mexer nesse trecho);
 *   - e o texto termina numa fronteira de oração: pontuação final ou 6 palavras ou mais;
 *   - no máximo UMA tradução por janela de 1,2 s por fala;
 *   - e no máximo `teto` traduções por sessão (a tradução parcial é sempre local, mas o teto protege o
 *     aparelho e vale também se um dia ela for à nuvem); ao atingi-lo, os parciais param e os finais seguem.
 *
 * Função pura: o relógio (ms) entra por parâmetro e a chave de cada fala é do chamador (o `seq` do VAD).
 */

/** A janela entre duas traduções parciais da mesma fala. */
const JANELA_MS = 1200;
/** Palavras a partir das quais um texto sem pontuação já conta como uma oração. */
const PALAVRAS_DE_UMA_ORACAO = 6;
/** Traduções parciais por sessão. */
const TETO_POR_SESSAO = 80;

interface EstadoDaFala {
  ultimo: string;
  iguais: number;
  /** O último texto traduzido e quando — para não repetir e para a janela. */
  traduzido: string;
  traduzidoEm: number;
}

const normalizar = (texto: string): string => texto.replace(/\s+/g, ' ').trim();

/** O texto termina numa fronteira de oração? */
function terminaEmOracao(texto: string): boolean {
  if (/[.,;:!?…。！？]["')\]”’]*$/.test(texto)) return true;
  return texto.split(' ').length >= PALAVRAS_DE_UMA_ORACAO;
}

export interface TradutorDeParciais {
  /**
   * Uma leitura do parcial da fala `fala`, no instante `agoraMs`. Devolve o texto a traduzir, ou `null`
   * (ainda instável, dentro da janela, já traduzido ou teto atingido).
   */
  ler(fala: string, texto: string, agoraMs: number): string | null;
  /** A fala acabou: o estado dela sai da memória. */
  encerrar(fala: string): void;
  /** O teto da sessão foi atingido: nenhum parcial é mais traduzido. */
  esgotado(): boolean;
}

export function criarTradutorDeParciais(o: { janelaMs?: number; teto?: number } = {}): TradutorDeParciais {
  const janela = o.janelaMs ?? JANELA_MS;
  const teto = o.teto ?? TETO_POR_SESSAO;
  const falas = new Map<string, EstadoDaFala>();
  let feitas = 0;

  return {
    ler(fala, texto, agoraMs) {
      const t = normalizar(texto);
      if (!t || feitas >= teto) return null;
      const e = falas.get(fala) ?? { ultimo: '', iguais: 0, traduzido: '', traduzidoEm: -Infinity };
      e.iguais = e.ultimo === t ? e.iguais + 1 : 1;
      e.ultimo = t;
      falas.set(fala, e);
      if (e.iguais < 2 || !terminaEmOracao(t)) return null;
      if (t === e.traduzido || agoraMs - e.traduzidoEm < janela) return null;
      e.traduzido = t;
      e.traduzidoEm = agoraMs;
      feitas++;
      return t;
    },
    encerrar: (fala) => void falas.delete(fala),
    esgotado: () => feitas >= teto,
  };
}
