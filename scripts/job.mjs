#!/usr/bin/env node
/**
 * RODA UM JOB DO REGISTRO À MÃO, no Node (`server/jobs/registro.ts`):
 *
 *   npm run job -- <nome>        (ex.: npm run job -- limpezaDiaria)
 *   npm run job                  (sem nome: lista os jobs, com cron e se a condição vale aqui)
 *
 * Passa pelo MESMO `executarJob` do agendador e do `scheduled` do Worker: respeita a condição do job
 * (o mesmo `.env` do servidor) e a lease (se outra passada estiver rodando, sai como `pulado`). Sai com 0
 * em `ok` ou `pulado`, 1 em `falhou`, 2 em nome desconhecido. Roda com `tsx` (o `npm run job` já chama).
 */
import 'dotenv/config'

import { fecharBanco } from '../server/db/db.ts'
import { executarJob } from '../server/jobs/executar.ts'
import { JOBS } from '../server/jobs/registro.ts'

const nome = process.argv[2]

if (!nome) {
  for (const j of JOBS) {
    const ligado = j.condicao ? j.condicao(process.env) : true
    console.log(`${j.nome.padEnd(28)} ${j.cron.padEnd(12)} ${ligado ? 'ligado' : 'desligado (condição)'}`)
  }
  process.exit(0)
}

if (!JOBS.some((j) => j.nome === nome)) {
  console.error(`job desconhecido: ${nome}. Jobs: ${JOBS.map((j) => j.nome).join(', ')}`)
  process.exit(2)
}

let r
try {
  r = await executarJob(nome)
  console.log(JSON.stringify(r))
} finally {
  await fecharBanco().catch(() => {})
}
process.exit(r.estado === 'falhou' ? 1 : 0)
