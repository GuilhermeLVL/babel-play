/**
 * ESPELHO DO VAD — para começar o decode final ANTES de o VAD fechar a fala.
 *
 * O Silero só fecha a fala depois de `redemptionMs` (800 ms) de silêncio: 0,78 s de espera fixa em
 * toda legenda, 31% do tempo entre o fim da fala e a tradução (auditoria de latência 2026-09-26).
 * Baixar a redenção para 450 ms NÃO é opção: a bancada de 2026-09 mediu o WER local subindo de 18,0%
 * para 20,5% (cada respiração vira um enunciado). A saída é ESPECULAR: com ~450 ms de silêncio,
 * decodificar já o que o final vai decodificar, sem fechar o segmento. Se a fala continuar, o
 * resultado vai fora; se o VAD fechar, ele é o final.
 *
 * Para isso é preciso saber, ANTES do fim, qual áudio o VAD vai entregar. Este espelho reproduz o
 * `FrameProcessor` do `@ricky0123/vad-web` 0.0.30 (`dist/frame-processor.js`) quadro a quadro, a
 * partir do evento `onFrameProcessed` (probabilidade + quadro): o mesmo buffer de pré-fala, o mesmo
 * contador de redenção, os mesmos limiares. A JANELA ESPECULATIVA é o buffer no quadro em que o
 * contador de silêncio chega a `especulativoMs`; o áudio que o VAD entrega no fim começa por ela
 * (é ela mais os quadros de silêncio que faltavam). Quem usa confere isso amostra a amostra antes de
 * aproveitar o decode (`ehPrefixo`) — se o espelho e a biblioteca divergirem um dia, cai no final de
 * sempre, nunca num texto de outra janela.
 *
 * O FINAL passa a ser o decode dessa janela (a fala + ~0,4 s de silêncio, em vez de + ~0,8 s): o
 * mesmo texto com ou sem especulação, por construção. A bancada (`stt.mjs` com `+esp`) mede se tirar
 * esse silêncio do fim muda o WER.
 */

export interface OpcoesDoEspelho {
  positiveSpeechThreshold: number;
  negativeSpeechThreshold: number;
  redemptionMs: number;
  preSpeechPadMs: number;
  /** Silêncio (dentro da redenção) a partir do qual a janela especulativa é entregue. */
  especulativoMs: number;
  /**
   * FIM DE FALA INTELIGENTE: o silêncio candidato, em ms (o piso de `pisoDoSilencio.ts`). Função, não número:
   * o piso anda com a pessoa e é lido a cada pausa. Sem ela, o espelho não consulta ninguém.
   */
  consultaMs?: () => number;
  /** O silêncio chegou ao candidato (uma vez por pausa): hora de perguntar ao modelo de turno. */
  aoConsultar?: () => void;
  /** Uma pausa DENTRO da fala terminou com a pessoa voltando a falar (duração em ms): alimenta o piso. */
  aoVoltarDaPausa?: (ms: number) => void;
}

export type EventoDoEspelho = 'especular' | 'cancelar' | null;

export class EspelhoDoVad {
  private buffer: Float32Array[] = [];
  private falando = false;
  private contador = 0;
  /** A janela especulativa já foi entregue nesta pausa (e ainda vale)? */
  private especulou = false;
  /** Já se consultou o modelo nesta pausa? (uma consulta por pausa) */
  private consultou = false;
  /** Duração de um quadro (ms), do último visto — a pausa se mede em quadros. */
  private msPorQuadro = 0;

  constructor(private readonly opcoes: OpcoesDoEspelho) {}

  /** Quadros de uma duração, com a MESMA conta da biblioteca (`Math.floor(ms / msPorQuadro)`). */
  private quadros(ms: number, amostras: number): number {
    const msPorQuadro = amostras / 16;
    return Math.floor(ms / msPorQuadro);
  }

  /**
   * Um quadro processado pelo VAD (chamar do `onFrameProcessed`, na ordem). Devolve `especular`
   * quando a janela especulativa fica pronta, `cancelar` quando a fala volta depois dela.
   */
  quadro(prob: number, frame: Float32Array): EventoDoEspelho {
    const { positiveSpeechThreshold, negativeSpeechThreshold, redemptionMs, preSpeechPadMs, especulativoMs } =
      this.opcoes;
    let evento: EventoDoEspelho = null;
    this.buffer.push(frame);
    const ehFala = prob >= positiveSpeechThreshold;
    this.msPorQuadro = frame.length / 16;
    if (ehFala) {
      // Uma pausa de dentro da fala acabou: a pessoa voltou antes da redenção.
      if (this.falando && this.contador > 0) this.opcoes.aoVoltarDaPausa?.(this.contador * this.msPorQuadro);
      this.contador = 0;
      this.consultou = false;
      if (this.especulou) {
        this.especulou = false;
        evento = 'cancelar';
      }
    }
    if (ehFala && !this.falando) this.falando = true;
    if (prob < negativeSpeechThreshold && this.falando) {
      this.contador++;
      if (this.contador >= this.quadros(redemptionMs, frame.length)) {
        // O VAD fecha aqui (fim de fala ou ruído curto): o buffer recomeça.
        this.reiniciar();
        return evento;
      }
      if (!this.especulou && this.contador === this.quadros(especulativoMs, frame.length)) {
        this.especulou = true;
        evento = 'especular';
      }
      const consulta = this.opcoes.consultaMs;
      if (consulta && !this.consultou && this.contador >= this.quadros(consulta(), frame.length)) {
        this.consultou = true;
        this.opcoes.aoConsultar?.();
      }
    }
    if (!this.falando) {
      const max = this.quadros(preSpeechPadMs, frame.length);
      while (this.buffer.length > max) this.buffer.shift();
    }
    return evento;
  }

  /** Silêncio acumulado na pausa de agora (ms); 0 quando se está falando. */
  get silencioMs(): number {
    return this.contador * this.msPorQuadro;
  }

  /** O áudio que o VAD entregaria se fechasse agora (pré-fala + fala + silêncio até aqui). */
  janela(): Float32Array {
    let n = 0;
    for (const q of this.buffer) n += q.length;
    const out = new Float32Array(n);
    let o = 0;
    for (const q of this.buffer) {
      out.set(q, o);
      o += q.length;
    }
    return out;
  }

  /** Fim de fala, ruído descartado, corte forçado, pausa ou mudo: tudo recomeça (como na biblioteca). */
  reiniciar(): void {
    this.buffer = [];
    this.falando = false;
    this.contador = 0;
    this.especulou = false;
    this.consultou = false;
  }
}

/** `a` é exatamente o começo de `b`? (amostra a amostra — é o que garante a mesma janela) */
export function ehPrefixo(a: Float32Array, b: Float32Array): boolean {
  if (a.length === 0 || a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
