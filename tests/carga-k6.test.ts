import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// O k6 não importa em Node (módulos `k6/*`): as asserções são textuais.
const ler = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8')

describe('carga k6 contra o staging', () => {
  const k6 = ler('scripts/perf/carga.k6.js')

  it('usa tokens por VU, cabeçalho Authorization, VUS e contador de 429', () => {
    expect(k6).toMatch(/__ENV\.TOKENS/)
    expect(k6).toMatch(/Authorization/)
    expect(k6).toMatch(/erros_429/)
    expect(k6).toMatch(/__ENV\.VUS/)
  })

  it('staging-medicoes importa os helpers de _supabase-usuario.mjs', () => {
    expect(ler('scripts/perf/staging-medicoes.mjs')).toMatch(/from '\.\/_supabase-usuario\.mjs'/)
  })
})
