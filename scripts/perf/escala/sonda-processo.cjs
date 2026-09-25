/* eslint-disable @typescript-eslint/no-require-imports -- sonda CommonJS pré-carregada com --require */
/* global require, process, setInterval */
/**
 * SONDA DE PROCESSO — pré-carregada no servidor sob medição (`node -r ./scripts/perf/escala/sonda-processo.cjs`).
 * Não toca código de produção: só observa o próprio processo em que é carregada.
 *
 * A cada `SONDA_MS` (padrão 250 ms) grava uma linha JSON em `SONDA_ARQUIVO` com:
 *   t      epoch ms
 *   rss    bytes residentes (o que o OOM killer do Fly conta)
 *   heap   heapUsed · ext external · ab arrayBuffers (onde os corpos de upload moram)
 *   cpu    % de UM núcleo no intervalo ((user+system) / parede) — >100% = threads do libuv/zlib
 *   loopP99 / loopMax  atraso do event loop no intervalo (ms), `monitorEventLoopDelay` a 1 ms
 *   atraso  quanto ESTE tique chegou atrasado (ms) — o histograma não registra um bloqueio que ocupa
 *           a janela inteira (a primeira rodada mostrou `loopMax: 0` com o servidor parado em 100% de
 *           CPU); o atraso do próprio tique registra.
 *
 * O timer é `unref()`: a sonda nunca segura o processo vivo.
 */
'use strict'
const { appendFileSync } = require('node:fs')
const { monitorEventLoopDelay } = require('node:perf_hooks')

const arquivo = process.env.SONDA_ARQUIVO
if (arquivo) {
  const passo = Number(process.env.SONDA_MS || 250)
  const h = monitorEventLoopDelay({ resolution: 1 })
  h.enable()
  let cpu0 = process.cpuUsage()
  let t0 = process.hrtime.bigint()
  let esperado = Date.now() + passo
  const tick = setInterval(() => {
    const t1 = process.hrtime.bigint()
    const d = process.cpuUsage(cpu0)
    const paredeUs = Number(t1 - t0) / 1000
    const m = process.memoryUsage()
    const linha = {
      t: Date.now(),
      rss: m.rss,
      heap: m.heapUsed,
      ext: m.external,
      ab: m.arrayBuffers,
      cpu: Math.round(((d.user + d.system) / paredeUs) * 1000) / 10,
      loopP99: Math.round(h.percentile(99) / 1e4) / 100,
      loopMax: Math.round(h.max / 1e4) / 100,
      atraso: Math.max(0, Date.now() - esperado),
    }
    h.reset()
    esperado = Date.now() + passo
    cpu0 = process.cpuUsage()
    t0 = t1
    try {
      appendFileSync(arquivo, JSON.stringify(linha) + '\n')
    } catch {
      /* sonda nunca derruba o servidor */
    }
  }, passo)
  tick.unref()
}
