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
import { redigirErro } from '../core/redacao';
import { criarLimitador, interpretarDsn, montarEnvelope, urlDoEnvelope } from '../core/sentry';
import { apiFetch } from '../data/api';
import { estadoDeIdentidade } from './identidade';

/**
 * SENTRY DIRETO DO NAVEGADOR (Fase 5) — ligado só com `VITE_SENTRY_DSN` no build.
 *
 * O relatório já chega ao Sentry pelo servidor (`/api/erros-do-cliente` → logger → sink). O envio
 * direto cobre o caso em que o servidor é que caiu: aí a rota de relatório também não responde, e
 * sem este caminho a queda seria invisível do lado de quem a sente.
 *
 * O MESMO RECORTE do relatório ao servidor, e mais nada: id, tipo, mensagem truncada, a primeira
 * linha da pilha e o pathname — tudo passado por `redigirErro` (a mesma regra do diário do
 * servidor). Sem usuário, sem IP (`infer_ip: never`), sem breadcrumb. E só com CONTA: no modo sem
 * conta a promessa é que nada sai deste navegador (ver o topo deste arquivo), e ela vale aqui também.
 */
const DSN_DO_NAVEGADOR = interpretarDsn(import.meta.env?.VITE_SENTRY_DSN as string | undefined);
const podeEnviarAoSentry = criarLimitador(10);

function gerarIdDeEvento(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function enviarAoSentry(id: string, tipo: string, mensagem: string, origem?: string, tela?: string): void {
  if (!DSN_DO_NAVEGADOR || estadoDeIdentidade() !== 'conta' || !podeEnviarAoSentry()) return;
  const agora = new Date();
  /* Redigida UMA vez e usada em todo campo — a primeira versão redigia a mensagem e mandava a crua
     no `fingerprint`, e o teste pegou o e-mail saindo por ali. */
  const redigida = redigirErro(mensagem);
  const corpo = montarEnvelope(
    {
      eventId: gerarIdDeEvento(),
      timestamp: agora.getTime() / 1000,
      platform: 'javascript',
      level: 'error',
      mensagem: `${tipo}: ${redigida}`,
      ambiente: import.meta.env?.MODE,
      tags: { tipo, ...(tela ? { tela } : {}) },
      extra: { id, ...(origem ? { origem: redigirErro(origem) } : {}) },
      fingerprint: [tipo, redigida.slice(0, 80)],
    },
    agora,
  );
  try {
    /* `text/plain` mantém a requisição "simples" (sem preflight); `omit` não leva cookie de ninguém. */
    void fetch(urlDoEnvelope(DSN_DO_NAVEGADOR), {
      method: 'POST',
      body: corpo,
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {
      /* reporte que falha morre aqui */
    });
  } catch {
    /* idem */
  }
}

/** Teto por sessão de página: um laço de erro geraria centenas por minuto. */
const MAX_POR_SESSAO = 15;
let enviados = 0;
const vistos = new Set<string>();

/** Id curto que o usuário consegue LER e citar no suporte — aparece na tela de erro. */
export function novoIdDeErro(): string {
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function reportarErro(tipo: 'render' | 'promise' | 'erro-global', mensagem: string, origem?: string): string {
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
  }).catch(() => {
    /* reporte que falha morre aqui, de propósito */
  });
  enviarAoSentry(
    id,
    tipo,
    msg,
    origem?.slice(0, 200),
    typeof location !== 'undefined' ? location.pathname.slice(0, 80) : undefined,
  );
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
