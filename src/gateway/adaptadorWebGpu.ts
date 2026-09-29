/**
 * HÁ UMA GPU DE VERDADE? — `navigator.gpu` não responde isso.
 *
 * `navigator.gpu` só diz que o NAVEGADOR conhece a API WebGPU. Quem diz se há um adaptador que a
 * sirva é `navigator.gpu.requestAdapter()`, e a resposta pode ser `null`: navegador sem interface
 * (headless), GPU na lista negra do Chrome, driver antigo, área de trabalho remota. Medido na
 * auditoria de latência (2026-09-26, `openspec/audits/2026-09-26-latencia-legenda/relatorio.md`):
 * com `navigator.gpu` presente e SEM adaptador, o roteador escolhia o Whisper small para WebGPU, o
 * worker falhava com "no available backend found" e a captura nunca mostrava legenda — as falas
 * ficavam guardadas para sempre. E o small em WASM, a outra saída, não é tempo real (18,6 s p50).
 *
 * A pergunta é assíncrona e pode demorar (o Chrome inicializa o processo da GPU), então a resposta
 * fica em cache pela vida da página e tem PRAZO: sem resposta no prazo, conta como "sem GPU" — errar
 * para o lado do WASM custa um modelo menor; errar para o lado da GPU custava a legenda inteira.
 */

/** Prazo padrão para o `requestAdapter()` responder. Na RX 6800 medida ele responde em dezenas de ms. */
export const PRAZO_DO_ADAPTADOR_MS = 2500;

interface GpuDoNavegador {
  requestAdapter?: () => Promise<unknown>;
}

let resposta: Promise<boolean> | null = null;
let conhecido: boolean | undefined;
/** O objeto que o `requestAdapter()` entregou — a sonda lê dele `shader-f16` e limites sem perguntar de novo. */
let adaptadorGuardado: unknown = null;

function gpuDe(escopo: unknown): GpuDoNavegador | undefined {
  return (escopo as { navigator?: { gpu?: GpuDoNavegador } } | undefined)?.navigator?.gpu;
}

/**
 * `true` só quando o navegador ENTREGA um adaptador WebGPU dentro do prazo. Nunca lança. A primeira
 * chamada pergunta; as seguintes reaproveitam a mesma resposta.
 */
export function temAdaptadorWebGpu(prazoMs = PRAZO_DO_ADAPTADOR_MS): Promise<boolean> {
  if (resposta) return resposta;
  const gpu = gpuDe(globalThis);
  if (!gpu?.requestAdapter) {
    conhecido = false;
    resposta = Promise.resolve(false);
    return resposta;
  }
  resposta = new Promise<boolean>((resolve) => {
    let feito = false;
    const concluir = (v: boolean) => {
      if (feito) return;
      feito = true;
      conhecido = v;
      resolve(v);
    };
    const relogio = setTimeout(() => concluir(false), prazoMs);
    Promise.resolve()
      .then(() => gpu.requestAdapter!())
      .then(
        (adaptador) => {
          adaptadorGuardado = adaptador ?? null;
          concluir(!!adaptador);
        },
        () => concluir(false),
      )
      .finally(() => clearTimeout(relogio));
  });
  return resposta;
}

/**
 * A melhor resposta SÍNCRONA disponível, para rótulos e estimativas de tamanho na tela: a medida,
 * se a pergunta já voltou; senão, a presença da API (e a pergunta é disparada para a próxima vez).
 */
export function webGpuProvavel(): boolean {
  if (conhecido !== undefined) return conhecido;
  void temAdaptadorWebGpu();
  return !!gpuDe(globalThis)?.requestAdapter;
}

/** O que a sonda do aparelho quer saber do adaptador (ver `lib/dispositivo/sonda.ts`). */
export interface InfoDoAdaptadorWebGpu {
  /** `adapter.features.has('shader-f16')`: pesos em fp16 na GPU (metade da memória e da banda). */
  shaderF16: boolean;
  /**
   * Os tetos de buffer do adaptador. Um modelo cujo maior tensor passa de `maxStorageBufferBindingSize`
   * não roda ali — dá para recusar ANTES de baixar (o que o WebLLM faz). `null` = não informados.
   */
  limites: { maxStorageBufferBindingSize: number; maxBufferSize: number } | null;
  /** `adapter.info.vendor`/`architecture` ('' quando o navegador esconde): entram na impressão do aparelho. */
  fornecedor: string;
  arquitetura: string;
  /**
   * O adaptador de RESERVA (`isFallbackAdapter`: rasterizador em software, SwiftShader). Existe, mas
   * não é GPU: o Whisper nele é mais lento que no WASM. Ausente em registros antigos = `false`.
   */
  reserva?: boolean;
}

/**
 * Lê o adaptador SEM confiar na forma: getter que lança, `features` que não é Set, limite que não é
 * número — tudo vira "desconhecido". Pura (recebe o objeto), para testar sem GPU.
 */
export function extrairInfoDoAdaptador(adaptador: unknown): InfoDoAdaptadorWebGpu {
  const ler = <T>(f: () => T, reserva: T): T => {
    try {
      return f() ?? reserva;
    } catch {
      return reserva; // getter de adaptador perdido (`device.lost`) ou de navegador antigo: sinal ausente
    }
  };
  const a = adaptador as {
    features?: { has?: (n: string) => boolean };
    limits?: Record<string, unknown>;
    info?: { vendor?: unknown; architecture?: unknown; isFallbackAdapter?: unknown };
    /** O campo antigo (antes de ir para `info`, Chrome < 136). */
    isFallbackAdapter?: unknown;
  };
  const shaderF16 = ler(() => typeof a.features?.has === 'function' && a.features.has('shader-f16') === true, false);
  const limites = ler(() => {
    const l = a.limits;
    const bind = l?.maxStorageBufferBindingSize;
    const buf = l?.maxBufferSize;
    return typeof bind === 'number' && bind > 0 && typeof buf === 'number' && buf > 0
      ? { maxStorageBufferBindingSize: bind, maxBufferSize: buf }
      : null;
  }, null);
  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    shaderF16,
    limites,
    fornecedor: ler(() => texto(a.info?.vendor), ''),
    arquitetura: ler(() => texto(a.info?.architecture), ''),
    reserva: ler(() => a.info?.isFallbackAdapter === true || a.isFallbackAdapter === true, false),
  };
}

/** A informação do adaptador (mesma pergunta em cache de `temAdaptadorWebGpu`); `null` sem adaptador. */
export async function infoDoAdaptadorWebGpu(prazoMs = PRAZO_DO_ADAPTADOR_MS): Promise<InfoDoAdaptadorWebGpu | null> {
  return (await temAdaptadorWebGpu(prazoMs)) && adaptadorGuardado ? extrairInfoDoAdaptador(adaptadorGuardado) : null;
}

/** Só para testes: esquece a resposta guardada. */
export function esquecerAdaptadorWebGpu(): void {
  resposta = null;
  conhecido = undefined;
  adaptadorGuardado = null;
}
