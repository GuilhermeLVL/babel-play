/**
 * ENVIO DE ERRO AO SENTRY SEM O SDK — o protocolo de envelope, puro (Fase 5 do lançamento).
 *
 * POR QUE NÃO `@sentry/node` + `@sentry/react`. Três motivos, na ordem do que pesou:
 *
 *   1. PRIVACIDADE POR CONSTRUÇÃO. O SDK coleta por padrão breadcrumbs de console, de `fetch` e de
 *      navegação (com URL e query), contexto de requisição e, no navegador, pode inferir o IP. Aqui
 *      só sai o que ESTE arquivo monta: a linha de erro que o logger já saneou (allowlist de campos
 *      + `redigirErro`), sem usuário, sem requisição, sem breadcrumb. É o `beforeSend` levado ao
 *      limite: não há o que filtrar porque nada além disso é coletado.
 *   2. PESO. `@sentry/node` 10 traz OpenTelemetry inteiro para o runtime, e o `Dockerfile` poda
 *      dependência de servidor com cuidado; `@sentry/react` somaria dezenas de KB ao bundle.
 *   3. O encaixe JÁ EXISTIA: `registrarSinkDeErro` (server/lib/logger.ts) entrega todo `error`
 *      saneado a um destino externo, e os erros do navegador já chegam ao mesmo funil por
 *      `POST /api/erros-do-cliente`.
 *
 * O preço, escrito: sem tracing de performance (a latência por rota fica no `/metrics`) e sem
 * source maps (a pilha do navegador vai minificada). Os dois são ligáveis depois sem mudar o funil.
 *
 * Protocolo: https://develop.sentry.dev/sdk/data-model/envelopes/ — cabeçalho do envelope, cabeçalho
 * do item e o evento, um JSON por linha, com a chave pública na query (`sentry_key`).
 */

export interface DsnDoSentry {
  /** `https://o123.ingest.us.sentry.io` */
  origem: string;
  projeto: string;
  chavePublica: string;
}

/** `https://<chave>@<host>/<projeto>` → partes, ou `null` se não for um DSN. */
export function interpretarDsn(dsn: string | undefined): DsnDoSentry | null {
  /* Regex e não `new URL`: o núcleo não tem DOM nem Node (`src/core/tsconfig.json`), e `URL` não é
     da biblioteca ES. O formato do DSN é fixo o bastante para isso. */
  const m = /^(https?):\/\/([A-Za-z0-9]+)@([A-Za-z0-9.-]+(?::\d+)?)\/(\d+)\/?$/.exec(dsn?.trim() ?? '');
  if (!m) return null;
  return { origem: `${m[1]}://${m[3]}`, projeto: m[4], chavePublica: m[2] };
}

/** Para onde o envelope vai. A chave pública na query dispensa cabeçalho de autenticação. */
export function urlDoEnvelope(d: DsnDoSentry): string {
  return `${d.origem}/api/${d.projeto}/envelope/?sentry_key=${encodeURIComponent(d.chavePublica)}&sentry_version=7`;
}

export interface EventoDoSentry {
  /** 32 hex, sem hífen. */
  eventId: string;
  /** segundos desde a época */
  timestamp: number;
  platform: 'node' | 'javascript';
  level: 'error' | 'warning';
  mensagem: string;
  ambiente?: string;
  release?: string;
  tags?: Record<string, string>;
  extra?: Record<string, string>;
  /** agrupa por evento + rota em vez de pela mensagem (que traz id e número) */
  fingerprint?: string[];
}

/** Monta o envelope (3 linhas JSON). Nenhum campo de usuário, de requisição ou de IP existe aqui. */
export function montarEnvelope(e: EventoDoSentry, agora: Date): string {
  const evento = {
    event_id: e.eventId,
    timestamp: e.timestamp,
    platform: e.platform,
    level: e.level,
    logger: 'babel-play',
    message: { formatted: e.mensagem },
    ...(e.ambiente ? { environment: e.ambiente } : {}),
    ...(e.release ? { release: e.release } : {}),
    ...(e.tags && Object.keys(e.tags).length ? { tags: e.tags } : {}),
    ...(e.extra && Object.keys(e.extra).length ? { extra: e.extra } : {}),
    ...(e.fingerprint ? { fingerprint: e.fingerprint } : {}),
    /* `infer_ip: never` pede ao Sentry que NÃO preencha o IP de quem enviou. O projeto também
       precisa de "Prevent Storing of IP Addresses" ligado (docs/LANCAMENTO.md) — cinto e suspensório. */
    sdk: { name: 'babel-play.envelope', version: '1.0.0', settings: { infer_ip: 'never' } },
  };
  return [
    JSON.stringify({ event_id: e.eventId, sent_at: agora.toISOString() }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(evento),
  ].join('\n');
}

/**
 * Teto por janela: um laço de erro não pode virar milhares de eventos (o plano gratuito do Sentry
 * tem cota mensal, e estourá-la apaga justamente os erros seguintes). Devolve `true` quando pode enviar.
 */
export function criarLimitador(maximoPorMinuto: number, relogio: () => number = () => Date.now()): () => boolean {
  let janela = 0;
  let enviados = 0;
  return () => {
    const agora = relogio();
    if (agora - janela >= 60_000) {
      janela = agora;
      enviados = 0;
    }
    if (enviados >= maximoPorMinuto) return false;
    enviados += 1;
    return true;
  };
}
