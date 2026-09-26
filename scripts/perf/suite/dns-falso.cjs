/* eslint-disable @typescript-eslint/no-require-imports -- DNS falso CommonJS pré-carregado com --require */
/* global require, process */
/**
 * DNS FALSO — pré-carregado SÓ no servidor sob carga (`node -r scripts/perf/suite/dns-falso.cjs`).
 * Não toca código de produção.
 *
 * O STT gerenciado passa pela guarda anti-SSRF (`server/ai/ssrf.ts`) antes de chamar o provedor, e
 * ela recusa, com razão, `127.0.0.1`. Para a suíte chamar o PROVEDOR FALSO local sem desligar a
 * guarda, o nome `DNS_FALSO_HOST` (padrão `provedor-falso.test`, TLD reservado pela RFC 2606):
 *   - na checagem da guarda (`dns/promises.lookup`) resolve para 203.0.113.10 (TEST-NET-3, público
 *     para a guarda);
 *   - na conexão de verdade (`dns.lookup`, que o `fetch` usa) resolve para 127.0.0.1.
 * Qualquer outro nome segue para o resolvedor normal. A guarda continua valendo para todo o resto.
 */
'use strict'
const dns = require('node:dns')
const dnsp = require('node:dns/promises')

const HOST = process.env.DNS_FALSO_HOST || 'provedor-falso.test'
const PUBLICO = '203.0.113.10'

const lookupOriginal = dns.lookup
dns.lookup = function lookupFalso(host, opcoes, cb) {
  if (host !== HOST) return lookupOriginal.apply(this, arguments)
  if (typeof opcoes === 'function') cb = opcoes
  const todos = typeof opcoes === 'object' && opcoes !== null && opcoes.all
  process.nextTick(() => (todos ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)))
}

const lookupPromessaOriginal = dnsp.lookup
dnsp.lookup = async function lookupFalsoPromessa(host, opcoes) {
  if (host !== HOST) return lookupPromessaOriginal(host, opcoes)
  const r = { address: PUBLICO, family: 4 }
  return opcoes && typeof opcoes === 'object' && opcoes.all ? [r] : r
}
