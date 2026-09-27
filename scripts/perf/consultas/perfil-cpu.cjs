/* eslint-disable @typescript-eslint/no-require-imports -- sonda CommonJS pré-carregada com --require */
/* global require, process, setInterval */
/**
 * PERFIL DE CPU POR JANELA — o equivalente a `node --cpu-prof`, mas recortado na janela medida
 * (auditoria de performance do backend, 26/09/2026). Pré-carregado no servidor sob carga:
 *
 *   CPU_PROF_DIR=<pasta> node -r ./scripts/perf/consultas/perfil-cpu.cjs dist-server/server.cjs
 *
 * POR QUE NÃO `--cpu-prof` PURO: ele só grava o `.cpuprofile` quando o processo SAI normalmente, e os
 * scripts de carga encerram o servidor com `kill()` — no Windows, TerminateProcess, sem saída normal e
 * sem arquivo. E mesmo quando grava, mistura boot, rampa e esvaziamento com a janela que interessa.
 *
 * COMO: `inspector.Session` + `Profiler` (a mesma fonte de dados do `--cpu-prof`, mesmo formato,
 * abre no DevTools e em `resumir-perfil.mjs`). Um timer `unref` olha a pasta a cada 250 ms:
 *   - `iniciar` aparece → `Profiler.start`;
 *   - `parar` aparece  → `Profiler.stop` e grava `<pasta>/servidor-<pid>.cpuprofile`, depois `pronto`.
 * Com `CPU_PROF_INICIO=1`, começa a gravar JÁ no carregamento (o perfil do BOOT: crie `parar` quando
 * o servidor responder). Quem cria e apaga os arquivos-sinal é o gerador de carga (ver `--cpu-prof-dir` em `suite/rodar.mjs` e
 * `escala/carga-servidor.mjs`). Intervalo de amostragem: `CPU_PROF_US` (padrão 1000 µs, o do Node).
 */
'use strict';
const dir = process.env.CPU_PROF_DIR;
if (dir) {
  const { existsSync, writeFileSync, mkdirSync, rmSync } = require('node:fs');
  const path = require('node:path');
  const inspector = require('node:inspector');
  mkdirSync(dir, { recursive: true });
  const sessao = new inspector.Session();
  sessao.connect();
  let estado = 'parado';
  const post = (m, p) => new Promise((ok, erro) => sessao.post(m, p ?? {}, (e, r) => (e ? erro(e) : ok(r))));
  if (process.env.CPU_PROF_INICIO === '1') {
    // O `post` do inspector é síncrono na própria thread: o perfil começa antes do `require` do servidor.
    sessao.post('Profiler.enable');
    sessao.post('Profiler.setSamplingInterval', { interval: Number(process.env.CPU_PROF_US || 1000) });
    sessao.post('Profiler.start');
    estado = 'gravando';
  }
  setInterval(async () => {
    try {
      if (estado === 'parado' && existsSync(path.join(dir, 'iniciar'))) {
        estado = 'iniciando';
        await post('Profiler.enable');
        await post('Profiler.setSamplingInterval', { interval: Number(process.env.CPU_PROF_US || 1000) });
        await post('Profiler.start');
        estado = 'gravando';
      } else if (estado === 'gravando' && existsSync(path.join(dir, 'parar'))) {
        estado = 'parando';
        const { profile } = await post('Profiler.stop');
        writeFileSync(path.join(dir, `servidor-${process.pid}.cpuprofile`), JSON.stringify(profile));
        rmSync(path.join(dir, 'iniciar'), { force: true });
        writeFileSync(path.join(dir, 'pronto'), String(process.pid));
        estado = 'feito';
      }
    } catch (e) {
      try {
        writeFileSync(path.join(dir, 'erro'), String(e?.stack ?? e));
      } catch {
        /* sonda nunca derruba o servidor */
      }
    }
  }, 250).unref();
}
