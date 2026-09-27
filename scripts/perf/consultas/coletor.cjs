/* eslint-disable @typescript-eslint/no-require-imports -- sonda CommonJS pré-carregada com --require */
/* global require, process, setInterval */
/**
 * COLETOR DE CONSULTAS — pré-carregado no processo sob medição, NUNCA em produção
 * (auditoria de performance do backend, 26/09/2026).
 *
 *   node -r ./scripts/perf/consultas/coletor.cjs dist-server/server.cjs              # servidor sob carga
 *   NODE_OPTIONS="-r ./scripts/perf/consultas/coletor.cjs" npx vitest run ...        # suíte de testes
 *
 * Com `COLETOR_DIR` definido, embrulha o driver SÍNCRONO `libsql` (o mesmo módulo que o
 * `@libsql/client` carrega para `file:`) e mede CADA instrução no ponto em que ela ocupa o event loop:
 *   - `Database#prepare` (o `@libsql/client` prepara a instrução de novo em TODA execução — sem cache);
 *   - `Statement#all/run/get` (a execução em si, incluindo materializar as linhas);
 *   - `Database#exec` (PRAGMAs, BEGIN/COMMIT das transações).
 * O tempo de uma instrução = prepare + execução. SQL normalizado: espaços colapsados, listas `in (?, ?, …)`
 * e `values (…), (…)` viram uma forma só — a mesma consulta com 3 ou 300 ids conta como uma.
 *
 * POR REQUISIÇÃO: embrulha `http.Server#emit('request')` num `AsyncLocalStorage`; como o driver é
 * síncrono, toda instrução executada dentro do handler cai no contexto da requisição dela. No `finish`
 * da resposta registra, por rota (método + caminho com segmentos que contêm dígito trocados por `:id`):
 * número de requisições, instruções por requisição (soma/máx), ms de banco por requisição e as
 * instruções REPETIDAS dentro de uma mesma requisição (o sinal de N+1).
 *
 * Grava `COLETOR_DIR/consultas-<pid>.json` a cada 2 s (timer `unref`) e na saída do processo. Quem
 * agrega e roda o EXPLAIN é `analisar.mjs`.
 */
'use strict';
const dir = process.env.COLETOR_DIR;
if (dir) {
  const { writeFileSync, mkdirSync } = require('node:fs');
  const path = require('node:path');
  const http = require('node:http');
  const { AsyncLocalStorage } = require('node:async_hooks');
  const Database = require('libsql');

  mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, `consultas-${process.pid}-${Date.now().toString(36)}.json`);
  const als = new AsyncLocalStorage();
  const hr = () => process.hrtime.bigint();
  const RESERVATORIO = 5000;

  /** SQL normalizado: a chave de agregação. */
  const normalizar = (sql) =>
    String(sql)
      .replace(/\s+/g, ' ')
      .replace(/\bin \((\?(, )?)+\)/gi, 'in (?…)')
      .replace(/values (\((?:[^()]|\([^()]*\))*\)(, )?)+/gi, 'values (…)')
      .trim();

  /** @type {Map<string, {n:number, ms:number, amostras:number[], linhasMax:number, linhas:number, rotas:Set<string>, exemplo:string}>} */
  const porSql = new Map();
  /** @type {Map<string, {req:number, instrucoes:number, instrucoesMax:number, msBanco:number, msBancoMax:number, msTotal:number, repetidas:Map<string, number>, amostrasMs:number[], amostrasInstr:number[]}>} */
  const porRota = new Map();

  function registrar(sql, ns, linhas) {
    const chave = normalizar(sql);
    const ms = Number(ns) / 1e6;
    let e = porSql.get(chave);
    if (!e)
      porSql.set(
        chave,
        (e = { n: 0, ms: 0, amostras: [], linhasMax: 0, linhas: 0, rotas: new Set(), exemplo: String(sql) }),
      );
    e.n++;
    e.ms += ms;
    e.linhas += linhas;
    if (linhas > e.linhasMax) e.linhasMax = linhas;
    if (e.amostras.length < RESERVATORIO) e.amostras.push(ms);
    else {
      const j = Math.floor(Math.random() * e.n);
      if (j < RESERVATORIO) e.amostras[j] = ms;
    }
    const ctx = als.getStore();
    if (ctx) {
      ctx.instr.push(chave);
      ctx.msBanco += ms;
    } else e.rotas.add('(fora de requisição)');
  }

  // ── driver ────────────────────────────────────────────────────────────────────────────────
  const prepare = Database.prototype.prepare;
  Database.prototype.prepare = function (sql) {
    const t = hr();
    const st = prepare.call(this, sql);
    st.__sql = sql;
    st.__prepNs = hr() - t;
    return st;
  };
  const exec = Database.prototype.exec;
  Database.prototype.exec = function (sql) {
    const t = hr();
    try {
      return exec.call(this, sql);
    } finally {
      registrar(sql, hr() - t, 0);
    }
  };
  const sonda = new Database(':memory:');
  const Stmt = Object.getPrototypeOf(sonda.prepare('select 1'));
  sonda.close();
  for (const m of ['all', 'run', 'get']) {
    const orig = Stmt[m];
    Stmt[m] = function (...args) {
      const t = hr();
      let r;
      try {
        r = orig.apply(this, args);
        return r;
      } finally {
        const prep = this.__prepNs ?? 0n;
        this.__prepNs = 0n; // o prepare conta só na primeira execução da instrução
        const linhas = m === 'all' && Array.isArray(r) ? r.length : m === 'get' && r ? 1 : 0;
        if (this.__sql) registrar(this.__sql, hr() - t + prep, linhas);
      }
    };
  }

  // ── requisições ──────────────────────────────────────────────────────────────────────────
  const rotaDe = (req) => {
    const p = String(req.originalUrl ?? req.url ?? '').split('?')[0];
    return `${req.method} ${p
      .split('/')
      .map((s) => (/\d/.test(s) ? ':id' : s))
      .join('/')}`;
  };
  let aoTerminarRequisicao = () => {};
  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (ev, req, res) {
    if (ev !== 'request') return emit.apply(this, arguments);
    const ctx = { instr: [], msBanco: 0, t0: hr() };
    const args = arguments;
    res.once('finish', () => {
      const rota = rotaDe(req);
      let r = porRota.get(rota);
      if (!r)
        porRota.set(
          rota,
          (r = {
            req: 0,
            instrucoes: 0,
            instrucoesMax: 0,
            msBanco: 0,
            msBancoMax: 0,
            msTotal: 0,
            repetidas: new Map(),
            amostrasMs: [],
            amostrasInstr: [],
          }),
        );
      r.req++;
      r.instrucoes += ctx.instr.length;
      r.instrucoesMax = Math.max(r.instrucoesMax, ctx.instr.length);
      r.msBanco += ctx.msBanco;
      r.msBancoMax = Math.max(r.msBancoMax, ctx.msBanco);
      const total = Number(hr() - ctx.t0) / 1e6;
      r.msTotal += total;
      if (r.amostrasMs.length < RESERVATORIO) {
        r.amostrasMs.push(total);
        r.amostrasInstr.push(ctx.instr.length);
      }
      const cont = new Map();
      for (const s of ctx.instr) {
        cont.set(s, (cont.get(s) ?? 0) + 1);
        porSql.get(s)?.rotas.add(rota);
      }
      for (const [s, n] of cont) if (n > 1) r.repetidas.set(s, Math.max(r.repetidas.get(s) ?? 0, n));
      aoTerminarRequisicao();
    });
    return als.run(ctx, () => emit.apply(this, args));
  };

  // ── gravação ─────────────────────────────────────────────────────────────────────────────
  const gravar = () => {
    try {
      writeFileSync(
        arquivo,
        JSON.stringify({
          pid: process.pid,
          argv: process.argv.slice(1, 3),
          sql: [...porSql].map(([sql, e]) => ({ sql, ...e, rotas: [...e.rotas] })),
          rotas: [...porRota].map(([rota, r]) => ({ rota, ...r, repetidas: [...r.repetidas] })),
        }),
      );
    } catch {
      /* coletor nunca derruba o processo medido */
    }
  };
  setInterval(gravar, 2000).unref();
  process.on('exit', gravar);
  /* O vitest e o `kill()` dos scripts de carga no Windows encerram o processo sem o evento `exit`
     (TerminateProcess). Duas redes: gravar quando o cliente do banco FECHA (o `encerrar` dos harnesses)
     e, com COLETOR_SINCRONO=1 (suíte de testes, onde o custo não importa), a cada resposta. */
  const close = Database.prototype.close;
  Database.prototype.close = function () {
    gravar();
    return close.call(this);
  };
  if (process.env.COLETOR_SINCRONO === '1') aoTerminarRequisicao = gravar;
}
