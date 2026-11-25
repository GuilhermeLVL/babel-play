/** A coleção que vai ao R2 é exatamente a que o LICENSES.md descreve, na chave que o app monta. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  chaveDaColecao,
  conferirColecao,
  lerRegistroDeLicencas,
  PASTA_DA_COLECAO,
} from '../scripts/avatar/publicar-colecao-no-r2'
import { COLECAO_CURADA } from '../src/data/avatar/colecao'
import { urlDoModeloDaColecao } from '../src/lib/avatar/fontes'

const registro = lerRegistroDeLicencas(readFileSync(join(PASTA_DA_COLECAO, 'LICENSES.md'), 'utf8'))
const ids = COLECAO_CURADA.map((m) => m.id)
const lerDoDisco = (a: string) => readFileSync(join(PASTA_DA_COLECAO, a))

describe('publicar-colecao-no-r2', () => {
  it('a chave no bucket é o caminho que o app pede depois de VITE_AVATARES_URL', () => {
    for (const id of ids) expect(urlDoModeloDaColecao(id)).toBe(`/avatares/${chaveDaColecao(id)}`)
  })

  it('o LICENSES.md registra todos os modelos do catálogo', () => {
    expect(registro.size).toBeGreaterThanOrEqual(ids.length)
    for (const id of ids) expect(registro.has(`${id}.vrm`)).toBe(true)
  })

  it('a coleção do disco confere com o registro: nada a recusar', () => {
    const { objetos, problemas } = conferirColecao(ids, registro, lerDoDisco)
    expect(problemas).toEqual([])
    expect(objetos.map((o) => o.chave).sort()).toEqual(ids.map(chaveDaColecao).sort())
  })

  it('arquivo adulterado, ausente ou sem linha no registro é recusado', () => {
    const [primeiro] = ids
    const adulterado = conferirColecao([primeiro], registro, () => Buffer.from('outro conteúdo'))
    expect(adulterado.objetos).toEqual([])
    expect(adulterado.problemas[0]).toContain('SHA-256')
    expect(conferirColecao([primeiro], registro, () => null).problemas[0]).toContain('ausente')
    expect(conferirColecao(['inexistente'], registro, lerDoDisco).problemas[0]).toContain('sem linha')
  })
})
