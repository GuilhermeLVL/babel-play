/**
 * FIM DE FALA INTELIGENTE — o cliente do modelo de turno (Smart Turn v3, ONNX, num Web Worker).
 *
 * O Silero continua detectando o silêncio; este módulo só responde "a frase acabou?" quando o silêncio chega
 * ao candidato (o piso, ~300 ms). `fechar: true` fecha a fala agora; `fechar: false` deixa o VAD seguir até o
 * teto de silêncio (800 ms): o VAD fixo de hoje é SEMPRE a rede de segurança, então nada aqui pode travar a
 * conversa. Os motivos (sem texto, só categorias) vão para o log da captura e para o resumo da sessão.
 *
 *   modelo ausente (não carregou / sem Worker) ..... fechar:false  → VAD fixo
 *   idioma fora da lista aprovada .................. fechar:false  → VAD fixo
 *   prazo estourado (o worker não respondeu) ....... fechar:false  → VAD fixo
 *   erro numa inferência ........................... fechar:true   (fail open, como o projeto de origem);
 *                                                    duas seguidas desligam o modelo na sessão
 *
 * A LISTA DE IDIOMAS e o LIMIAR vêm da bancada (`scripts/eval-fala/bancada/fim-de-fala.mjs`, relatório em
 * `docs/auditoria/eval/bancada-2026-09.md`): o modelo foi treinado em 23 idiomas, mas só se aprova o que se mediu.
 */
import { JANELA_AMOSTRAS } from './melDoSmartTurn';

/** O que o worker aceita e devolve (o contrato com `fimDeFalaWorker.ts`). */
export type MensagemParaOWorker =
  | { tipo: 'carregar'; url: string }
  | { tipo: 'consultar'; id: number; pcm: Float32Array };
export type MensagemDoWorker =
  | { tipo: 'pronto' }
  | { tipo: 'resultado'; id: number; p: number; ms: number }
  | { tipo: 'erro'; id?: number; mensagem: string };

/** A parte do `Worker` que se usa — para o teste trocar por um falso. */
export interface WorkerDeFimDeFala {
  onmessage: ((e: MessageEvent<MensagemDoWorker>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(msg: MensagemParaOWorker, transfer?: Transferable[]): void;
  terminate(): void;
}

/** Onde o app serve o modelo (`public/smart-turn/`, publicado pelo build da edição estática). */
const URL_DO_MODELO = '/smart-turn/smart-turn-v3.2-cpu.onnx';

/** `p >= LIMIAR` fecha a fala. Escolhido na bancada: acima disto o custo de uma frase partida supera o ganho. */
export const LIMIAR_DE_FIM_DE_FALA = 0.7;

/** Idiomas em que a bancada aprovou o modelo (código base de dois caracteres). Fora deles, VAD fixo. */
export const IDIOMAS_APROVADOS: readonly string[] = ['pt', 'en'];

/** Passou de tanto sem resposta, o VAD fixo manda (a inferência leva dezenas de ms; isto é só a trava). */
const PRAZO_PADRAO_MS = 1500;
const FALHAS_PARA_DESLIGAR = 2;

const base = (codigo: string): string => codigo.trim().toLowerCase().split(/[-_]/)[0];

/** TODOS os idiomas da conversa estão na lista? (no automático o app não sabe qual dos lados fala) */
export function idiomasAprovados(codigos: readonly string[]): boolean {
  return codigos.length > 0 && codigos.every((c) => IDIOMAS_APROVADOS.includes(base(c)));
}

export type MotivoDoFim =
  | 'modelo'
  | 'modelo ausente'
  | 'modelo desligado'
  | 'idioma fora da lista'
  | 'falha na inferência'
  | 'prazo';

export interface VeredictoDeFim {
  fechar: boolean;
  motivo: MotivoDoFim;
  /** Probabilidade de "completa", quando o modelo respondeu. */
  p?: number;
}

export interface OpcoesDoFimDeFala {
  /** Cria o worker (padrão: o de verdade). */
  criarWorker?: () => WorkerDeFimDeFala;
  prazoMs?: number;
}

export interface FimDeFala {
  /** Carrega o modelo SEM enviar nada (ao abrir o intérprete). Devolve se ficou pronto. */
  aquecer(): Promise<boolean>;
  /** A frase acabou? `pcm` é o áudio da fala até agora (só os últimos 8 s vão ao modelo). */
  consultar(pcm: Float32Array, idiomas: readonly string[]): Promise<VeredictoDeFim>;
  /** Quantas vezes cada motivo apareceu na sessão (o medidor; sem texto). */
  motivos(): Readonly<Record<string, number>>;
  fechar(): void;
}

const workerDeVerdade = (): WorkerDeFimDeFala =>
  new Worker(new URL('./fimDeFalaWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerDeFimDeFala;

export function criarFimDeFala(opcoes: OpcoesDoFimDeFala = {}): FimDeFala {
  const criar = opcoes.criarWorker ?? workerDeVerdade;
  const prazoMs = opcoes.prazoMs ?? PRAZO_PADRAO_MS;
  let worker: WorkerDeFimDeFala | null = null;
  let pronto: Promise<boolean> | null = null;
  /** O modelo já respondeu "pronto"? Consultar NUNCA espera o carregamento: a pausa não pode esperar 8 MB. */
  let carregado = false;
  let proximoId = 0;
  let falhasSeguidas = 0;
  let desligado = false;
  const pendentes = new Map<number, (m: MensagemDoWorker) => void>();
  let aoCarregar: ((m: MensagemDoWorker) => void) | null = null;
  const contagem: Record<string, number> = {};
  const contar = (motivo: MotivoDoFim): void => {
    contagem[motivo] = (contagem[motivo] ?? 0) + 1;
  };

  const carregar = (): Promise<boolean> => {
    if (pronto) return pronto;
    pronto = new Promise<boolean>((resolve) => {
      try {
        worker = criar();
      } catch {
        resolve(false);
        return;
      }
      const w = worker;
      aoCarregar = (m) => {
        carregado = m.tipo === 'pronto';
        resolve(carregado);
      };
      w.onmessage = (e) => {
        const m = e.data;
        if (m.tipo === 'resultado' || (m.tipo === 'erro' && m.id !== undefined)) pendentes.get(m.id!)?.(m);
        else aoCarregar?.(m);
      };
      w.onerror = () => resolve(false);
      w.postMessage({ tipo: 'carregar', url: URL_DO_MODELO });
    });
    return pronto;
  };

  const registrar = (v: VeredictoDeFim): VeredictoDeFim => {
    contar(v.motivo);
    return v;
  };

  return {
    aquecer: carregar,
    motivos: () => ({ ...contagem }),
    async consultar(pcm, idiomas) {
      if (desligado) return registrar({ fechar: false, motivo: 'modelo desligado' });
      if (!idiomasAprovados(idiomas)) return registrar({ fechar: false, motivo: 'idioma fora da lista' });
      if (!carregado || !worker) {
        void carregar(); // sem aquecimento prévio: começa agora, serve nas próximas pausas
        return registrar({ fechar: false, motivo: 'modelo ausente' });
      }
      const id = ++proximoId;
      // Cópia dos últimos 8 s: o buffer é TRANSFERIDO ao worker, e quem chamou ainda precisa do seu.
      const janela = pcm.slice(Math.max(0, pcm.length - JANELA_AMOSTRAS));
      const w = worker;
      const resposta = await new Promise<MensagemDoWorker | null>((resolve) => {
        const timer = setTimeout(() => {
          pendentes.delete(id);
          resolve(null);
        }, prazoMs);
        pendentes.set(id, (m) => {
          clearTimeout(timer);
          pendentes.delete(id);
          resolve(m);
        });
        w.postMessage({ tipo: 'consultar', id, pcm: janela }, [janela.buffer]);
      });
      if (!resposta) return registrar({ fechar: false, motivo: 'prazo' });
      if (resposta.tipo === 'resultado') {
        falhasSeguidas = 0;
        return registrar({ fechar: resposta.p >= LIMIAR_DE_FIM_DE_FALA, motivo: 'modelo', p: resposta.p });
      }
      if (++falhasSeguidas >= FALHAS_PARA_DESLIGAR) desligado = true;
      return registrar({ fechar: true, motivo: 'falha na inferência' });
    },
    fechar() {
      for (const [, f] of pendentes) f({ tipo: 'erro', mensagem: 'encerrado' });
      worker?.terminate();
      worker = null;
    },
  };
}
