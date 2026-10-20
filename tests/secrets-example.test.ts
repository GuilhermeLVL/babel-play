/**
 * `.secrets.example.json` (modelo do `wrangler secret bulk`) lista só NOMES e precisa bater com o que
 * `server/lib/config.ts` declara como obrigatório (`producao`/`modo-publico`) ou `impede-servico`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { nomesDosSecretsObrigatorios } from '../server/lib/config'

describe('.secrets.example.json', () => {
  it('lista exatamente as variáveis que config.ts marca como produção/modo-publico/impede-servico', () => {
    const exemplo = JSON.parse(readFileSync('.secrets.example.json', 'utf8')) as Record<string, string>
    expect(Object.keys(exemplo).sort()).toEqual(nomesDosSecretsObrigatorios())
    expect(Object.values(exemplo).every((v) => v === '')).toBe(true)
  })
})
