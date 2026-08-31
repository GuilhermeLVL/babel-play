/**
 * RELATÓRIO DE ERROS DO NAVEGADOR — a outra ponta do laço (E4).
 *
 * O QUE ISTO FECHA. Erro de render ia para o console do usuário e morria lá; rejeição de promise
 * nem isso. O dono descobria erro de produção por reclamação. Agora `window.onerror`,
 * `unhandledrejection` e o ErrorBoundary reportam para `POST /api/erros-do-cliente`, que alimenta
 * o MESMO diário dos erros de servidor.
 *
 * O QUE NÃO SAI DAQUI: payload nenhum do usuário. Mensagem truncada, primeira linha da stack e o
 * pathname da SPA — sem query string, sem texto de fala, sem nada digitado. A postura "não existe
 * telemetria" continua verdadeira: só ERRO viaja.
 *
 * Passa pelo funil `apiFetch` como tudo: no modo SEM CONTA o funil desvia para o servidor em
 * memória, que não conhece a rota — ou seja, quem não tem conta não reporta nada para fora, o que
 * é coerente com a promessa de privacidade daquele modo. Se o próprio reporte falhar, morre em
 * silêncio: reagir a erro de reporte só gera mais reporte.
 */
import { apiFetch } from '../data/api';

/** Teto por sessão de página: um laço de erro geraria centenas por minuto. */
const MAX_POR_SESSAO = 15;
let enviados = 0;
const vistos = new Set<string>();

/** Id curto que o usuário consegue LER e citar no suporte — aparece na tela de erro. */
export function novoIdDeErro(): string {
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function reportarErro(
  tipo: 'render' | 'promise' | 'erro-global',
  mensagem: string,
  origem?: string,
): string {
  const id = novoIdDeErro();
  const msg = String(mensagem || 'erro sem mensagem').slice(0, 300);

  // Dedupe: o MESMO erro repetindo (render que quebra em loop) reporta uma vez só.
  const chave = `${tipo}|${msg}`;
  if (vistos.has(chave) || enviados >= MAX_POR_SESSAO) return id;
  vistos.add(chave);
  enviados += 1;

  void apiFetch('/api/erros-do-cliente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      tipo,
      mensagem: msg,
      origem: origem?.slice(0, 200),
      tela: typeof location !== 'undefined' ? location.pathname.slice(0, 80) : undefined,
    }),
  }).catch(() => { /* reporte que falha morre aqui, de propósito */ });
  return id;
}

/** Primeira linha ÚTIL de uma stack — o resto é bundle minificado, ruído no diário. */
function origemDe(err: unknown): string | undefined {
  const stack = (err as Error)?.stack;
  if (!stack) return undefined;
  const linha = stack.split('\n').find((l) => l.trim().startsWith('at')) ?? stack.split('\n')[1];
  return linha?.trim();
}

/** Instala os ganchos globais. Chamado uma vez, no boot (main.tsx). */
export function instalarRelatorioDeErros(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (ev) => {
    reportarErro('erro-global', ev.message || String(ev.error), origemDe(ev.error) ?? `${ev.filename}:${ev.lineno}`);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const razao = ev.reason;
    reportarErro('promise', (razao as Error)?.message ?? String(razao), origemDe(razao));
  });
}
