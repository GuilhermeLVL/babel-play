/**
 * O CONTEXTO DE ÁUDIO DO CLIQUE — um `AudioContext` criado e retomado DENTRO do gesto de quem tocou
 * em Iniciar (ou no microfone), guardado até a captura do microfone o tomar.
 *
 * POR QUE. No iPhone (WebKit), um contexto criado fora da ativação do usuário pode ficar 'suspended'
 * para sempre: sem quadros para o VAD, nível 0, a tela em "Ouvindo…" e nenhuma legenda — sem erro
 * nenhum (relato do dono, 2026-09-28). Entre o toque e o `MicVAD.new` havia vários `await` (cache,
 * sonda do navegador, a permissão, o Silero), e o VAD criava o contexto DELE lá no fim; a sonda de
 * nível criava um segundo. Agora o clique cria UM, chama `resume()` antes de qualquer `await`, e a
 * captura o entrega ao VAD (`audioContext` do `@ricky0123/vad-web`, que não fecha o que não criou) e
 * à sonda de nível; quem fecha é o `stop` da captura (o contexto é só dela).
 *
 * Um clique novo fecha o contexto que ninguém tomou (sem vazar um por toque); o motor "Rápido" não o
 * usa (a Web Speech abre o microfone sozinha) e o descarta. Nunca lança.
 */
type CtorDeContexto = new () => AudioContext;

let guardado: AudioContext | null = null;

function fechar(ctx: AudioContext | null): void {
  if (!ctx) return;
  try {
    void Promise.resolve(ctx.close()).catch(() => {});
  } catch {
    /* já fechado */
  }
}

/** Cria e retoma o contexto AGORA (chame no manipulador do clique, antes de qualquer `await`). */
export function abrirContextoDoClique(escopo: unknown = globalThis): AudioContext | null {
  const g = escopo as { AudioContext?: CtorDeContexto; webkitAudioContext?: CtorDeContexto };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (typeof Ctor !== 'function') return null;
  fechar(guardado);
  guardado = null;
  try {
    const ctx = new Ctor();
    try {
      void Promise.resolve(ctx.resume()).catch(() => {});
    } catch {
      /* o resume() síncrono que lança: o contexto segue, a captura tenta de novo */
    }
    guardado = ctx;
    return ctx;
  } catch {
    return null;
  }
}

/** Entrega o contexto guardado UMA vez (depois, `null`). Um contexto já fechado não serve. */
export function tomarContextoDoClique(): AudioContext | null {
  const ctx = guardado;
  guardado = null;
  return ctx && ctx.state !== 'closed' ? ctx : null;
}

/** Fecha o contexto que ninguém tomou (o "Rápido", a captura que não chegou a abrir). */
export function descartarContextoDoClique(): void {
  fechar(guardado);
  guardado = null;
}
