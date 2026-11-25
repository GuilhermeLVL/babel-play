/**
 * O workflow semanal da latência publicada CONTRA O CÓDIGO (openspec `latencia-publicada-por-aparelho`, tarefa 3.1): cron semanal,
 * token de LEITURA separado do token de escrita, publicação só com `LATENCIA_PUBLICAR=1`, a visão do dono nunca no bucket
 * público, e os comandos casam com as opções do script.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

const RAIZ = join(__dirname, '..')
const texto = readFileSync(join(RAIZ, '.github/workflows/publicar-latencia.yml'), 'utf8')
const wf = yaml.load(texto) as {
  on: { schedule: { cron: string }[]; workflow_dispatch: { inputs: Record<string, { default?: unknown }> } }
  permissions: Record<string, string>
  jobs: {
    publicar: {
      environment: string
      env: Record<string, string>
      steps: { name?: string; run?: string; if?: string; env?: Record<string, string> }[]
    }
  }
}
const passos = wf.jobs.publicar.steps

describe('publicar-latencia.yml', () => {
  it('roda uma vez por semana e sob demanda, com o dry-run como padrão manual', () => {
    expect(wf.on.schedule).toHaveLength(1)
    expect(wf.on.schedule[0]!.cron).toMatch(/^\d+ \d+ \* \* 1$/)
    expect(wf.on.workflow_dispatch.inputs.so_conferir!.default).toBe(true)
  })

  it('só lê o repositório e usa o Environment', () => {
    expect(wf.permissions).toEqual({ contents: 'read' })
    expect(wf.jobs.publicar.environment).toContain('inputs.ambiente')
  })

  it('o token de leitura do Analytics Engine nunca é o de escrita do R2, e só o passo de upload vê o de escrita', () => {
    const leitura = passos.filter((p) => p.env?.CLOUDFLARE_API_TOKEN === '${{ secrets.CLOUDFLARE_API_TOKEN }}')
    expect(leitura.length).toBeGreaterThanOrEqual(2)
    const upload = passos.find((p) => p.run?.includes('wrangler r2 object put'))!
    expect(upload.env?.CLOUDFLARE_API_TOKEN).toBe('${{ secrets.CLOUDFLARE_R2_TOKEN }}')
    expect(upload.if).toContain("vars.LATENCIA_PUBLICAR == '1'")
    expect(upload.if).toContain('inputs.so_conferir != true')
    expect(passos.filter((p) => p.env?.CLOUDFLARE_API_TOKEN === '${{ secrets.CLOUDFLARE_R2_TOKEN }}')).toHaveLength(1)
  })

  it('o agregado público e a visão do dono vão para buckets diferentes e a do dono nunca é cacheada', () => {
    const run = passos.find((p) => p.run?.includes('wrangler r2 object put'))!.run!
    expect(run).toContain('"$BUCKET/latencia.json"')
    expect(run).toContain('"$BUCKET_DONO/latencia-dono.json"')
    expect(run).not.toMatch(/\$BUCKET\/latencia-dono/)
    expect(run).toMatch(/latencia-dono\.json.*private, no-store/)
    expect(run).toContain('--remote')
  })

  it('os comandos usam opções que o script conhece e o dataset de staging fora de produção', () => {
    const script = readFileSync(join(RAIZ, 'scripts/producao/publicar-latencia.mjs'), 'utf8')
    for (const p of passos.filter((p) => p.run?.includes('publicar-latencia.mjs'))) {
      for (const opcao of p.run!.match(/--[a-z-]+/g) ?? []) expect(script).toContain(`'${opcao}'`)
    }
    expect(wf.jobs.publicar.env.DATASET).toContain('frasy_metricas_staging')
    const wrangler = readFileSync(join(RAIZ, 'wrangler.jsonc'), 'utf8')
    expect(wrangler).toContain('"dataset": "frasy_metricas"')
    expect(wrangler).toContain('"dataset": "frasy_metricas_staging"')
  })
})
