/**
 * Tradução de falhas de mídia para português acionável.
 *
 * Três famílias de erro DIFERENTES caem aqui, e é fácil confundi-las:
 *
 *   1. `MediaError` do elemento <audio>/<video> — falha ao CARREGAR/DECODIFICAR um áudio já gravado.
 *      Chega como `el.error.code` (1..4), nunca como exceção.
 *   2. `DOMException` do `getUserMedia` — falha ao ABRIR o microfone. É o caso que deixava a tela
 *      inalterada quando o usuário clicava em "gravar".
 *   3. Códigos de erro da Web Speech API (`SpeechRecognitionErrorEvent.error`) — strings, não exceções.
 *
 * Toda mensagem diz o que o usuário pode FAZER. Quando o erro não identifica a causa, a mensagem é
 * genérica de propósito — nunca chutamos um motivo.
 */

/** Traduz o `MediaError` do <audio> em algo que o usuário consiga agir em cima. */
export function mediaErrorMessage(el: HTMLMediaElement | null): string {
  switch (el?.error?.code) {
    case 1: return 'A carga do áudio foi abortada.';
    case 2: return 'Erro de rede ao baixar o áudio desta sessão.';
    case 3: return 'O áudio desta sessão está corrompido e não pôde ser decodificado.';
    case 4: return 'O navegador não suporta o formato do áudio desta sessão.';
    default: return 'Não foi possível carregar o áudio desta sessão.';
  }
}

/**
 * Traduz a rejeição do `getUserMedia` (microfone). O `name` do DOMException é a ÚNICA fonte de
 * causa aqui — sem ele, mensagem genérica.
 */
export function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Permissão do microfone negada. Libere o microfone no cadeado da barra de endereços e tente de novo.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Nenhum microfone encontrado. Conecte um microfone (ou escolha outro dispositivo de entrada) e tente de novo.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'O microfone existe, mas o sistema não conseguiu abri-lo, outro programa pode estar usando-o. Feche-o e tente de novo.';
    case 'OverconstrainedError':
      return 'O microfone escolhido não atende às restrições pedidas. Selecione outro dispositivo de entrada.';
    case 'SecurityError':
      return 'O navegador bloqueou o microfone nesta página. É preciso HTTPS (ou localhost) para gravar.';
    case 'AbortError':
      return 'A captura do microfone foi interrompida pelo sistema.';
    default:
      return 'Não foi possível acessar o microfone.';
  }
}

/** Códigos da Web Speech API que NÃO são falha: o usuário parou, ou simplesmente não falou. */
type SpeechErrorCode = string;

/** Traduz `SpeechRecognitionErrorEvent.error`. Devolve `null` para 'aborted' (parada normal). */
export function speechErrorMessage(code: SpeechErrorCode): string | null {
  switch (code) {
    case 'aborted': return null;
    case 'no-speech':
      return 'Não ouvi nada. Fale mais perto do microfone e tente de novo.';
    case 'audio-capture':
      return 'Nenhum microfone disponível para o reconhecimento de fala. Conecte um e tente de novo.';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Permissão do microfone negada. Libere o microfone no cadeado da barra de endereços e tente de novo.';
    case 'network':
      return 'O reconhecimento de fala do navegador não conseguiu acessar a rede. Verifique sua conexão.';
    case 'language-not-supported':
      return 'O navegador não reconhece fala neste idioma.';
    default:
      return 'O reconhecimento de fala falhou.';
  }
}
