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
        (adaptador) => concluir(!!adaptador),
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

/** Só para testes: esquece a resposta guardada. */
export function esquecerAdaptadorWebGpu(): void {
  resposta = null;
  conhecido = undefined;
}
