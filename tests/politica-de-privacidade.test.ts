/**
 * A política de privacidade tem de refletir os operadores de `docs/lgpd/operadores.md`.
 * Os marcadores `[DONO: ...]` são pendências do controlador: só bloqueiam no dia do corte
 * (`LANCAMENTO_FINAL=1`).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const OPERADORES = readFileSync('docs/lgpd/operadores.md', 'utf8')
const POLITICA = readFileSync('public/privacidade.html', 'utf8')

/** Primeira coluna da tabela de operadores, sem negrito nem o parêntese; pula as linhas OPÇÃO. */
function nomesDosOperadores(): string[] {
  const nomes: string[] = []
  for (const linha of OPERADORES.split('\n')) {
    if (!linha.startsWith('|')) continue
    const primeira = (linha.split('|')[1] ?? '').trim()
    if (!primeira.startsWith('**')) continue
    if (/OPÇÃO|opcional/i.test(primeira)) continue
    nomes.push(
      primeira
        .replace(/\*\*/g, '')
        .replace(/\s*\(.*$/, '')
        .trim(),
    )
  }
  return nomes
}

describe('política de privacidade', () => {
  it('extrai os operadores da tabela', () => {
    const nomes = nomesDosOperadores()
    expect(nomes).toEqual(expect.arrayContaining(['Supabase', 'Cloudflare', 'DeepInfra']))
    expect(nomes.length).toBeGreaterThanOrEqual(8)
  })

  it.each(nomesDosOperadores())('cita o operador %s', (nome) => {
    expect(POLITICA.toLowerCase()).toContain(nome.toLowerCase())
  })

  it('não cita a hospedagem que nunca foi ao ar (Fly)', () => {
    expect(POLITICA).not.toMatch(/\bFly(\.io)?\b/i)
  })

  it('tem a seção Anúncios', () => {
    expect(POLITICA).toMatch(/<h2[^>]*>\s*Anúncios\s*<\/h2>/)
  })

  it.runIf(process.env.LANCAMENTO_FINAL === '1')('não sobra marcador [DONO] no dia do corte', () => {
    expect(POLITICA).not.toMatch(/\[DONO/)
    expect(POLITICA).not.toMatch(/<!--\s*DONO/)
    expect(readFileSync('public/termos.html', 'utf8')).not.toMatch(/\[DONO/)
  })
})
