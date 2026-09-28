/* eslint-disable @typescript-eslint/no-require-imports -- DNS falso CommonJS pré-carregado com --require */
/* global require, process */
/**
 * DNS FALSO — pré-carregado SÓ no servidor sob carga (`node -r scripts/perf/suite/dns-falso.cjs`).
 * Não toca código de produção.
 *
 * O STT gerenciado passa pela guarda anti-SSRF (`server/ai/ssrf.ts`) antes de chamar o provedor, e
 * ela recusa, com razão, `127.0.0.1`. Para a suíte chamar o PROVEDOR FALSO local sem desligar a
 * guarda, o nome `DNS_FALSO_HOST` (padrão `provedor-falso.test`, TLD reservado pela RFC 2606)
 * RESOLVE SEMPRE para 203.0.113.10 (TEST-NET-3, público para a guarda) — no `dns/promises.lookup`
 * da guarda de nome e no `dns.lookup` do socket — e só a CONEXÃO troca esse endereço por
 * 127.0.0.1, dentro do `net.connect`, DEPOIS de o `lookup` ter respondido.
 *
 * POR QUE NA CONEXÃO, e não mais no DNS (cf592b5, 26/09). Antes o `dns.lookup` devolvia 127.0.0.1
 * direto: a guarda conferia uma resolução e o `fetch` conectava por outra. Era exatamente a janela
 * de DNS rebinding que o `despachanteSeguro` fechou — ele confere o IP no `lookup` do PRÓPRIO
 * socket, e passou a ver o 127.0.0.1 e a recusar. Desde então todo STT da suíte voltava 502
 * (`stt:502`, provedor falso com `stt: {}`) e a carga reprovava por erro. O `lookup` do despachante
 * continua rodando e conferindo aqui; a troca acontece depois dele, só para este nome.
 * Qualquer outro nome segue para o resolvedor e para a conexão normais.
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
  process.nextTick(() => (todos ? cb(null, [{ address: PUBLICO, family: 4 }]) : cb(null, PUBLICO, 4)))
}

const lookupPromessaOriginal = dnsp.lookup
dnsp.lookup = async function lookupFalsoPromessa(host, opcoes) {
  if (host !== HOST) return lookupPromessaOriginal(host, opcoes)
  const r = { address: PUBLICO, family: 4 }
  return opcoes && typeof opcoes === 'object' && opcoes.all ? [r] : r
}

/* A CONEXÃO: o endereço público que o `lookup` deu a este nome vira o loopback onde o provedor
   falso escuta. Com `lookup` próprio (o `despachanteSeguro`), ele roda e confere normalmente e só a
   resposta é traduzida; sem (o `fetch` comum, que usa o `dns.lookup` acima), o destino já sai
   como o IP literal. */
const net = require('node:net')
const LOOPBACK = '127.0.0.1'
const paraLoopback = (endereco) => (endereco === PUBLICO ? LOOPBACK : endereco)
const connectOriginal = net.connect
function connectFalso(...args) {
  const opcoes = args[0]
  if (opcoes && typeof opcoes === 'object' && !Array.isArray(opcoes) && opcoes.host === HOST) {
    const lookupDoChamador = opcoes.lookup
    args[0] =
      typeof lookupDoChamador === 'function'
        ? {
            ...opcoes,
            lookup(host, o, cb) {
              if (typeof o === 'function') [o, cb] = [{}, o]
              lookupDoChamador(host, o, (err, endereco, familia) => {
                if (err) return cb(err, endereco, familia)
                if (Array.isArray(endereco))
                  return cb(null, endereco.map((e) => ({ ...e, address: paraLoopback(e.address) })))
                cb(null, paraLoopback(endereco), familia)
              })
            },
          }
        : { ...opcoes, host: LOOPBACK }
  }
  return connectOriginal.apply(this, args)
}
net.connect = connectFalso
net.createConnection = connectFalso
