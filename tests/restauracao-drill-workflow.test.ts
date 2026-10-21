import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

const caminho = join(__dirname, '..', '.github/workflows/restauracao-drill.yml')
const texto = readFileSync(caminho, 'utf8')
const wf = yaml.load(texto) as {
  on: { workflow_dispatch: { inputs: Record<string, { default?: string }> } }
  jobs: Record<
    string,
    {
      environment?: string
      services?: Record<string, { image: string }>
      steps: Array<{ name?: string; if?: string; run?: string }>
    }
  >
}
const job = Object.values(wf.jobs)[0]

describe('restauracao-drill.yml', () => {
  it('só roda sob demanda, com os dois inputs', () => {
    expect(Object.keys(wf.on)).toEqual(['workflow_dispatch'])
    expect(Object.keys(wf.on.workflow_dispatch.inputs)).toEqual(['arquivo', 'idade_maxima_dias'])
    expect(wf.on.workflow_dispatch.inputs.idade_maxima_dias.default).toBe('8')
  })

  it('usa o Environment restauracao', () => {
    expect(job.environment).toBe('restauracao')
  })

  it('nunca sobe o dump como artefato (tem dados pessoais)', () => {
    expect(texto).not.toMatch(/upload-artifact/)
  })

  it('apaga o banco do exercício com if: always()', () => {
    const limpeza = job.steps.find((s) => s.if === 'always()')
    expect(limpeza?.run).toMatch(/dropdb/)
  })

  it('restaura num postgres:17 de serviço', () => {
    expect(job.services?.postgres.image.startsWith('postgres:17')).toBe(true)
  })

  it('não leva credencial real: só os segredos do Environment', () => {
    expect(texto).toMatch(/secrets\.R2_LEITURA_ACCESS_KEY_ID/)
    expect(texto).not.toMatch(/R2_S3_ACCESS_KEY_ID|SUPABASE_DB_PASSWORD/)
  })
})
