/**
 * TETOS DE LEITURA — a metade da pilha que a matriz rota × guarda não olhava.
 *
 * Auditoria de segurança de 2026-09-26 (`openspec/audits/2026-09-26-seguranca/relatorio.md`). Os
 * limitadores que já existiam cobrem ESCRITA (`writeLimiter`, que pula GET/HEAD por desenho), rotas
 * de IA, falha de autenticação e três rotas públicas. Nenhuma LEITURA autenticada tinha teto, e
 * quatro delas custam caro:
 *
 *   - `GET /api/me/exportar` monta a conta inteira em memória a cada chamada;
 *   - `GET /api/images/search` faz uma chamada de saída ao Openverse por requisição — o servidor
 *     vira amplificador contra um terceiro, e é o IP dele que acaba bloqueado;
 *   - `GET /api/sessions/utterances/all` e `GET /api/vocab` devolvem listas inteiras;
 *   - `GET /api/rank/:jogo` é pública e vai ao banco sem balde nenhum.
 *
 * DOIS TIPOS DE BALDE, e a escolha é sobre o PREÇO DO PRÓPRIO LIMITADOR:
 *
 *   - LEITURA GERAL e PLACAR PÚBLICO ficam na MEMÓRIA do processo. O store do banco
 *     (`rateLimitStore.ts`) faz um UPSERT por requisição; pôr isso em TODO GET dobraria as escritas
 *     no SQLite justamente no caminho que se quer proteger — o mesmo raciocínio que tirou o
 *     `limitadorDeFalhas` do `skipSuccessfulRequests`. O preço aceito: com `CLUSTER_WORKERS=N` o teto
 *     efetivo é N vezes o declarado. Continua sendo um teto; sem ele não havia nenhum.
 *   - EXPORTAÇÃO e IMAGENS vão para o BANCO, com balde próprio: são raras (o custo de uma escrita a
 *     mais some perto do custo delas) e o teto precisa valer igual em todos os workers.
 */
import type { RequestHandler } from 'express'
import rateLimit from 'express-rate-limit'

import {
  chaveDoRequest,
  createDbRateLimitStore,
  METRIC_RATELIMIT_EXPORTAR,
  METRIC_RATELIMIT_IMAGENS,
} from './rateLimitStore'

/**
 * Leituras autenticadas por usuário e por minuto. 300 é 5 por segundo SUSTENTADAS: uma tela que
 * abre dispara uma dezena de GETs, o cliente relê flags e entitlements a cada poucos minutos, e o
 * teste de caracterização mais pesado (IDOR, uma conta percorrendo todas as rotas) fica longe dele.
 * Um laço, não.
 */
export const TETO_DE_LEITURA_POR_MINUTO = 300

/** Exportações da conta por usuário e por HORA. O titular exporta uma vez; 5 cobre repetir um download que falhou. */
export const TETO_DE_EXPORTACAO_POR_HORA = 5

/** Buscas de imagem por usuário e por minuto — cada uma é uma chamada de saída ao Openverse. */
export const TETO_DE_BUSCA_DE_IMAGEM_POR_MINUTO = 60

/** Leituras do placar público por IP e por minuto. */
export const TETO_DO_PLACAR_POR_MINUTO = 120

const comuns = { standardHeaders: true, legacyHeaders: false, keyGenerator: chaveDoRequest } as const

/**
 * QUAIS VERBOS um limitador conta, pendurado no próprio middleware.
 *
 * A matriz rota × guarda (`tests/seguranca/_matriz.ts`) lê a pilha do Express e não enxerga o
 * `skip` de dentro do limitador: sem esta marca, um limitador só de leitura montado em `/api`
 * "cobriria" toda escrita na leitura dela, e o portão de escrita sem teto passaria por vacuidade.
 * Ausente = conta todos os verbos.
 */
export type VerbosDoLimitador = 'leitura' | 'escrita'

export function marcarVerbos<T extends RequestHandler>(limitador: T, verbos: VerbosDoLimitador): T {
  return Object.assign(limitador, { verbosDoLimitador: verbos })
}

/** GET/HEAD autenticados, por usuário, em memória. Escrita segue no `writeLimiter`. */
export function limitadorDeLeitura(): RequestHandler {
  return marcarVerbos(
    rateLimit({
      ...comuns,
      windowMs: 60_000,
      limit: TETO_DE_LEITURA_POR_MINUTO,
      skip: (req) => req.method !== 'GET' && req.method !== 'HEAD',
      message: { error: 'muitas leituras em pouco tempo; tente de novo em instantes', code: 'muitas_leituras' },
    }),
    'leitura',
  )
}

/** `GET /api/me/exportar`, por usuário, no banco. */
export function limitadorDeExportacao(): RequestHandler {
  return rateLimit({
    ...comuns,
    windowMs: 60 * 60_000,
    limit: TETO_DE_EXPORTACAO_POR_HORA,
    store: createDbRateLimitStore(METRIC_RATELIMIT_EXPORTAR),
    message: {
      error: 'a exportação da conta pode ser pedida poucas vezes por hora; tente de novo mais tarde',
      code: 'muitas_exportacoes',
    },
  })
}

/** `GET /api/images/search`, por usuário, no banco. O cliente cai direto no Openverse com um 429. */
export function limitadorDeBuscaDeImagem(): RequestHandler {
  return rateLimit({
    ...comuns,
    windowMs: 60_000,
    limit: TETO_DE_BUSCA_DE_IMAGEM_POR_MINUTO,
    store: createDbRateLimitStore(METRIC_RATELIMIT_IMAGENS),
    message: { error: 'muitas buscas de imagem em pouco tempo', code: 'muitas_buscas_de_imagem' },
  })
}

/**
 * `GET /api/rank/:jogo`, por IP, em memória. Antes do auth não há usuário — a chave cai no IP, e é
 * por isso que depende de `TRUST_PROXY` estar certo atrás de proxy (sem ele todos dividem um balde
 * e o efeito de um laço é o placar responder 429 para todo mundo por um minuto — degrada o placar,
 * não o app). O POST do placar continua no `writeLimiter` e na trava de um envio por minuto.
 */
export function limitadorDoPlacar(): RequestHandler {
  return marcarVerbos(
    rateLimit({
      ...comuns,
      windowMs: 60_000,
      limit: TETO_DO_PLACAR_POR_MINUTO,
      skip: (req) => req.method !== 'GET' && req.method !== 'HEAD',
      message: { error: 'muitas leituras do placar em pouco tempo', code: 'muitas_leituras' },
    }),
    'leitura',
  )
}
