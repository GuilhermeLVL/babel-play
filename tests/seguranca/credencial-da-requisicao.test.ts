/**
 * QUEM TRAZ CREDENCIAL — o filtro do limitador de falhas de auth (`server/lib/credencialDaRequisicao.ts`).
 *
 * O `authMiddleware` só reconhece UM canal: o cabeçalho `Authorization`. Qualquer conteúdo nele conta
 * como credencial (falhar fechado: esquema errado também é tentativa); cabeçalho ausente, vazio ou só
 * com espaços não conta. Cookie e query string não são lidos pelo `authMiddleware`, então não são canal.
 */
import { describe, expect, it } from 'vitest'

import { requisicaoTrazCredencial } from '../../server/lib/credencialDaRequisicao'

function req(headers: Record<string, string>) {
  const minusculos = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return { header: (nome: string) => minusculos[nome.toLowerCase()] }
}

describe('requisicaoTrazCredencial', () => {
  it('Bearer com token conta', () => {
    expect(requisicaoTrazCredencial(req({ authorization: 'Bearer abc.def.ghi' }))).toBe(true)
  })

  it('o nome do cabeçalho não diferencia maiúsculas', () => {
    expect(requisicaoTrazCredencial(req({ Authorization: 'Bearer x' }))).toBe(true)
  })

  it('esquema errado (Basic, token cru, "Bearer" sem token) conta: falhar fechado', () => {
    expect(requisicaoTrazCredencial(req({ authorization: 'Basic dXNlcjpzZW5oYQ==' }))).toBe(true)
    expect(requisicaoTrazCredencial(req({ authorization: 'abc.def.ghi' }))).toBe(true)
    expect(requisicaoTrazCredencial(req({ authorization: 'Bearer' }))).toBe(true)
    expect(requisicaoTrazCredencial(req({ authorization: 'Bearer ' }))).toBe(true)
  })

  it('sem nenhum cabeçalho não conta', () => {
    expect(requisicaoTrazCredencial(req({}))).toBe(false)
  })

  it('cabeçalho vazio ou só com espaços não conta', () => {
    expect(requisicaoTrazCredencial(req({ authorization: '' }))).toBe(false)
    expect(requisicaoTrazCredencial(req({ authorization: '   ' }))).toBe(false)
  })

  it('cookie e outros cabeçalhos não são canal do authMiddleware', () => {
    expect(requisicaoTrazCredencial(req({ cookie: 'authorization=Bearer x; token=y', apikey: 'z' }))).toBe(false)
  })
})
