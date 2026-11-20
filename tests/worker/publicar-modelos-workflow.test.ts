/**
 * O workflow que publica os modelos do Bergamot no R2 CONTRA O CÓDIGO:
 *  - o bucket é o que `scripts/cloudflare/r2.mjs` cria para os modelos;
 *  - o passo usa o modo `--via=wrangler` (sem chaves S3) e só o token da Cloudflare do Environment;
 *  - o objeto sobe com o `wrangler r2 object put --remote`, no mesmo layout que o app monta.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

import { argsDoWrangler, chaveNoBucket, todosOsPares } from '../../scripts/modelos/publicar-bergamot-no-r2'

const RAIZ = join(__dirname, '..', '..')
const texto = readFileSync(join(RAIZ, '.github/workflows/publicar-modelos.yml'), 'utf8')
const wf = yaml.load(texto) as {
  on: { workflow_dispatch: { inputs: Record<string, { default?: string; options?: string[] }> } }
  jobs: { publicar: { environment: string; env: Record<string, string>; steps: { run?: string }[] } }
}

describe('publicar-modelos.yml', () => {
  it('é manual, com ambiente staging|production e pares (padrão all)', () => {
    const inputs = wf.on.workflow_dispatch.inputs
    expect(inputs.ambiente.options).toEqual(['staging', 'production'])
    expect(inputs.pares.default).toBe('all')
  })

  it('roda no Environment escolhido, com o token e a conta da Cloudflare dele', () => {
    const job = wf.jobs.publicar
    expect(job.environment).toBe('${{ inputs.ambiente }}')
    expect(job.env.CLOUDFLARE_API_TOKEN).toBe('${{ secrets.CLOUDFLARE_API_TOKEN }}')
    expect(job.env.CLOUDFLARE_ACCOUNT_ID).toBe('${{ secrets.CLOUDFLARE_ACCOUNT_ID }}')
  })

  it('publica no bucket de modelos do r2.mjs via wrangler, sem chaves S3', () => {
    const r2 = readFileSync(join(RAIZ, 'scripts/cloudflare/r2.mjs'), 'utf8')
    expect(r2).toContain("const MODELOS = 'frasy-modelos'")
    const passo = wf.jobs.publicar.steps.map((s) => s.run ?? '').find((r) => r.includes('publicar-bergamot-no-r2'))
    expect(passo).toContain('--bucket=frasy-modelos')
    expect(passo).toContain('--via=wrangler')
    expect(texto).not.toMatch(/S3_(ENDPOINT|ACCESS_KEY_ID|SECRET_ACCESS_KEY)/)
  })

  it('npm ci sem baixar o binário do onnxruntime-node', () => {
    expect(texto).toMatch(/ONNXRUNTIME_NODE_INSTALL: skip/)
  })
})

describe('publicar-bergamot-no-r2 --via=wrangler', () => {
  it('monta o put remoto com o tipo e o cache imutável, na chave do layout do app', () => {
    const [par, cfg] = Object.entries(todosOsPares())[0]
    const nome = Object.values(cfg.arquivos)[0].nome
    const chave = chaveNoBucket(par, cfg.execucao, nome)
    const args = argsDoWrangler('frasy-modelos', chave, '/tmp/x', 'application/gzip')
    expect(args.slice(0, 5)).toEqual(['wrangler', 'r2', 'object', 'put', `frasy-modelos/${chave}`])
    expect(args).toContain('--remote')
    expect(args[args.indexOf('--content-type') + 1]).toBe('application/gzip')
    expect(args[args.indexOf('--cache-control') + 1]).toContain('immutable')
  })
})
