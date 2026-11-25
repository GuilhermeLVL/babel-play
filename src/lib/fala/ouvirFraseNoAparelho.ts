/**
 * OUVIR UMA FRASE NO APARELHO (openspec `sombra-sem-web-speech`, tarefa 2.2): grava a fala da pessoa em PCM e a
 * transcreve DEPOIS, num modelo local (Moonshine/Whisper). Nada vai à rede: o áudio vive em memória até `parar()` ou
 * `cancelar()` e os buffers são soltos nos dois casos.
 *
 *   const sessao = await ouvirUmaFrase({ lang: 'en-US' });
 *   const { texto, semFala } = await sessao.parar();   // ou sessao.cancelar()
 *
 * Por dentro: `getUserMedia` + AudioWorklet (`public/pcm-capture-worklet.js`) na taxa nativa; ao parar, reamostra para
 * 16 kHz, o VAD (`analisarFala`) decide `semFala` e apara as bordas, e só então `transcribe` decodifica. Sem fala, NÃO
 * decodifica (silêncio decodificado é onde o modelo inventa texto). A saída passa pela guarda de alucinação.
 * Sem MediaRecorder aqui: o "Ouvir minha gravação" segue com o dele, quem chama.
 *
 * As dependências são injetáveis (`deps`) para o teste rodar sem microfone nem modelo.
 */
import { analisarFala, juntarBlocos, reamostrarPara16k, TAXA_DO_MODELO, TETO_DE_SEGUNDOS } from '../../core/fala/pcm';
import { filtrarAlucinacao } from '../../gateway/alucinacao';

export interface FraseOuvida {
  /** O que o modelo ouviu (vazio quando `semFala`). */
  texto: string;
  /** Duração da fala aparada (para o ritmo da nota). */
  duracaoMs: number;
  /** O VAD não achou fala: nada foi decodificado. */
  semFala: boolean;
}

export interface OuvirUmaFrase {
  parar(): Promise<FraseOuvida>;
  /** Descarta tudo, sem decodificar. Idempotente. */
  cancelar(): void;
}

/** O que a captura entrega: a taxa nativa e como parar. */
export interface Captura {
  taxa: number;
  /** Solta o microfone e o contexto. */
  encerrar(): Promise<void>;
}

export interface DependenciasDaSombraLocal {
  /** Abre o microfone e chama `aoBloco` com cada bloco Float32 (taxa nativa). */
  capturar(aoBloco: (bloco: Float32Array) => void): Promise<Captura>;
  /** Decodifica PCM 16 kHz. */
  transcrever(pcm: Float32Array, lang: string): Promise<string>;
}

export interface OpcoesDeOuvir {
  lang: string;
  /** Nível 0..1 do último bloco, para a onda na tela. */
  aoNivel?: (rms: number) => void;
  deps?: Partial<DependenciasDaSombraLocal>;
}

const URL_DO_WORKLET = '/pcm-capture-worklet.js';

/** A captura real: contexto na taxa nativa (o Firefox recusa microfone ligado a contexto de outra taxa). */
async function capturarDoMicrofone(aoBloco: (b: Float32Array) => void): Promise<Captura> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const Contexto =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Contexto();
  const soltar = async () => {
    stream.getTracks().forEach((t) => t.stop());
    try {
      await ctx.close();
    } catch {
      /* já fechado */
    }
  };
  try {
    await ctx.audioWorklet.addModule(URL_DO_WORKLET);
    const fonte = ctx.createMediaStreamSource(stream);
    const no = new AudioWorkletNode(ctx, 'pcm-capture', { numberOfInputs: 1, numberOfOutputs: 0 });
    no.port.onmessage = (e: MessageEvent<Float32Array>) => aoBloco(e.data);
    fonte.connect(no);
    if (ctx.state === 'suspended') await ctx.resume();
  } catch (erro) {
    await soltar();
    throw erro;
  }
  return { taxa: ctx.sampleRate, encerrar: soltar };
}

function rms(b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < b.length; i++) s += b[i]! * b[i]!;
  return Math.sqrt(s / (b.length || 1));
}

export async function ouvirUmaFrase(opcoes: OpcoesDeOuvir): Promise<OuvirUmaFrase> {
  const capturar = opcoes.deps?.capturar ?? capturarDoMicrofone;
  let blocos: Float32Array[] = [];
  let amostras = 0;
  let taxaNativa = TAXA_DO_MODELO;
  const teto = () => amostras >= TETO_DE_SEGUNDOS * taxaNativa;
  const captura = await capturar((b) => {
    if (teto()) return;
    blocos.push(b);
    amostras += b.length;
    opcoes.aoNivel?.(Math.min(1, rms(b) * 6));
  });
  taxaNativa = captura.taxa;
  let encerrada = false;
  const encerrar = async () => {
    if (encerrada) return;
    encerrada = true;
    await captura.encerrar();
  };
  const soltarBuffers = () => {
    blocos = [];
    amostras = 0;
  };

  return {
    async parar() {
      const inicio = encerrada;
      await encerrar();
      const bruto = juntarBlocos(blocos);
      soltarBuffers();
      if (inicio || !bruto.length) return { texto: '', duracaoMs: 0, semFala: true };
      const analise = analisarFala(reamostrarPara16k(bruto, taxaNativa));
      if (analise.semFala) return { texto: '', duracaoMs: 0, semFala: true };
      const transcrever = opcoes.deps?.transcrever ?? transcreverNoAparelho;
      const crua = await transcrever(analise.aparado, opcoes.lang);
      const texto = filtrarAlucinacao(crua, analise.duracaoMs / 1000, opcoes.lang);
      return { texto, duracaoMs: analise.duracaoMs, semFala: false };
    },
    cancelar() {
      soltarBuffers();
      void encerrar();
    },
  };
}

/** Importação tardia: o modelo e o worker só entram no pacote de quem usa a sombra local. */
async function transcreverNoAparelho(pcm: Float32Array, lang: string): Promise<string> {
  const { transcreverFrase } = await import('./transcritorDaSombra');
  return transcreverFrase(pcm, lang);
}
