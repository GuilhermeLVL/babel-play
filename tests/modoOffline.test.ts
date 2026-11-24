import { describe, expect, it } from 'vitest'

import { capacidadesSemRede, type EstadoDeRede } from '../src/core/modoOffline'

const base: EstadoDeRede = {
  online: false,
  modeloDeFalaBaixado: true,
  modeloDeTraducaoBaixado: true,
  motorLocalDisponivel: true,
}
const de = (e: Partial<EstadoDeRede>) =>
  Object.fromEntries(capacidadesSemRede({ ...base, ...e }).map((c) => [c.recurso, c]))

describe('capacidadesSemRede', () => {
  it('offline com modelos baixados: o local funciona e a IA na nuvem não', () => {
    const c = de({})
    expect(c.transcricao.funciona).toBe(true)
    expect(c.traducao.funciona).toBe(true)
    expect(c.jogos.funciona).toBe(true)
    expect(c.leitor.funciona).toBe(true)
    expect(c.ia).toEqual({ recurso: 'ia', funciona: false, motivo: 'sem-rede' })
  })

  it('offline sem o modelo de fala: só a transcrição falha, com o motivo', () => {
    const c = de({ modeloDeFalaBaixado: false })
    expect(c.transcricao).toEqual({ recurso: 'transcricao', funciona: false, motivo: 'modelo-nao-baixado' })
    expect(c.traducao.funciona).toBe(true)
  })

  it('offline sem o modelo de tradução: só a tradução falha', () => {
    const c = de({ modeloDeTraducaoBaixado: false })
    expect(c.traducao.motivo).toBe('modelo-nao-baixado')
    expect(c.transcricao.funciona).toBe(true)
  })

  it('sem motor local, o modelo baixado não basta (o motivo é o motor)', () => {
    const c = de({ motorLocalDisponivel: false })
    expect(c.transcricao.motivo).toBe('sem-motor-local')
    expect(c.traducao.motivo).toBe('sem-motor-local')
  })

  it('online: a nuvem funciona, mas o local ainda depende do modelo', () => {
    const c = de({ online: true, modeloDeFalaBaixado: false })
    expect(c.ia.funciona).toBe(true)
    expect(c.transcricao.funciona).toBe(false)
  })

  it('sempre devolve os 5 recursos na mesma ordem', () => {
    expect(capacidadesSemRede(base).map((c) => c.recurso)).toEqual(['transcricao', 'traducao', 'jogos', 'leitor', 'ia'])
  })
})
