// @vitest-environment jsdom
/**
 * F2-02 — as três famílias de erro de mídia precisam CHEGAR à pessoa.
 *
 * `src/lib/mediaErrors.ts` foi escrito para traduzir três: o `MediaError` do <audio>, o
 * `DOMException` do `getUserMedia` e os códigos da Web Speech API. Só a do microfone tinha
 * chamador — as outras duas eram texto pronto que nunca aparecia na tela.
 *
 * Estes testes travam os DOIS caminhos novos. Não medem a redação (isso é `mediaErrors.ts`);
 * medem que a mensagem sai de onde a falha acontece.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mediaErrorMessage, speechErrorMessage } from '../src/lib/mediaErrors';

vi.mock('../src/components/Toast', () => ({
  toast: { error: vi.fn(), warn: vi.fn(), ok: vi.fn(), info: vi.fn() },
}));

const { toast } = await import('../src/components/Toast');
const { criarFalante } = await import('../src/lib/falante');
const { WebSpeechStt } = await import('../src/gateway/adapters/webSpeech');

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  Reflect.deleteProperty(window, 'SpeechRecognition');
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance');
});

/**
 * O jsdom implementa `window.speechSynthesis` como ausente e o construtor `SpeechSynthesisUtterance`
 * como INEXISTENTE — e são duas coisas separadas. Dublar só o primeiro fazia `tts.ts:236` estourar
 * `ReferenceError` num `.catch` que ninguém observava: os 6 testes deste arquivo passavam, o
 * relatório dizia "6 passed", **e o processo saía 1**. Levou uma reexecução de `rastrear --provar`
 * para isso aparecer, porque ler a contagem de testes e não o código de saída esconde exatamente
 * esta classe de falha. O dublê precisa cobrir o par inteiro da API, não a metade que o teste toca
 * de forma visível.
 */
function dublarSinteseDeVoz() {
  Object.defineProperty(window, 'speechSynthesis', {
    value: { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    value: class { constructor(public text: string) {} },
    configurable: true, writable: true,
  });
}

/** Um <audio> que ainda não carregou — é o estado em que `falante` registra os listeners. */
function audioNaoCarregado() {
  const el = document.createElement('audio');
  Object.defineProperty(el, 'readyState', { value: 0, configurable: true });
  return el;
}

/** O `error` do elemento só existe DEPOIS da falha; o falante já registrou o listener até lá. */
function falharCarga(el: HTMLAudioElement, code: number) {
  Object.defineProperty(el, 'error', { value: { code }, configurable: true });
  el.dispatchEvent(new Event('error'));
}

describe('MediaError do <audio> — o clipe da gravação que não carrega', () => {
  it('sem voz sintetizada, a falha vira erro visível com a causa traduzida', () => {
    const el = audioNaoCarregado();
    const falante = criarFalante({ current: el }, 'blob:gravacao');
    falante.ouvir({ texto: 'hello', startMs: 0, endMs: 1000 });

    falharCarga(el, 3); // decodificação

    expect(toast.error).toHaveBeenCalledWith(mediaErrorMessage(el));
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toContain('corrompido');
  });

  it('com voz sintetizada é aviso, não erro — houve som, só não o clipe real', () => {
    dublarSinteseDeVoz();
    const el = audioNaoCarregado();
    const falante = criarFalante({ current: el }, 'blob:gravacao');
    falante.ouvir({ texto: 'hello', startMs: 0, endMs: 1000 });

    falharCarga(el, 2); // rede

    expect(toast.error).not.toHaveBeenCalled();
    expect(String(vi.mocked(toast.warn).mock.calls[0][0])).toContain('rede');
  });

  it('avisa UMA vez por falante — o <audio> reemite `error` a cada load()', () => {
    const el = audioNaoCarregado();
    const falante = criarFalante({ current: el }, 'blob:gravacao');
    falante.ouvir({ texto: 'a', startMs: 0, endMs: 500 });
    falharCarga(el, 4);
    falante.ouvir({ texto: 'b', startMs: 500, endMs: 900 });
    el.dispatchEvent(new Event('error'));

    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});

describe('Web Speech — o código cru não dizia o que fazer', () => {
  /** Reconhecedor mínimo: só precisamos alcançar o `onerror` que o adapter instala. */
  function instalarReconhecedor() {
    const instancias: Record<string, unknown>[] = [];
    class Fake {
      lang = '';
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: unknown = null;
      onerror: ((e: { error?: string }) => void) | null = null;
      onend: unknown = null;
      start() {}
      stop() {}
      abort() {}
      constructor() {
        instancias.push(this as unknown as Record<string, unknown>);
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: Fake, configurable: true });
    return instancias;
  }

  const erroDe = (code: string) => {
    const instancias = instalarReconhecedor();
    const onError = vi.fn();
    new WebSpeechStt().startLive('pt-BR', { onPartial: vi.fn(), onFinal: vi.fn(), onError });
    (instancias[0].onerror as (e: { error?: string }) => void)({ error: code });
    return onError;
  };

  it('"not-allowed" sobe traduzido, com o que a pessoa pode fazer', () => {
    const onError = erroDe('not-allowed');
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toBe(speechErrorMessage('not-allowed'));
    expect(onError.mock.calls[0][0].message).toContain('cadeado');
  });

  it('"network" e "language-not-supported" também', () => {
    expect(erroDe('network').mock.calls[0][0].message).toBe(speechErrorMessage('network'));
    expect(erroDe('language-not-supported').mock.calls[0][0].message).toContain('idioma');
  });

  it('"aborted" (parada normal) e "no-speech" (o onend religa) continuam silenciosos', () => {
    expect(erroDe('aborted')).not.toHaveBeenCalled();
    expect(erroDe('no-speech')).not.toHaveBeenCalled();
  });
});
