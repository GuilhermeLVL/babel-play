/**
 * O filtro de saída das funções de IA que não são o tutor (change `filtro-tutor-menores`, tarefa 4.1): o auxiliar
 * `recusaSeSaidaBarrada` e a garantia ESTRUTURAL de que todo núcleo de IA que fala com perfil protegido o chama.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { TETO_DO_TEXTO_MODERADO } from '../server/ai/moderacao/moderarSaidaDoTutor'
import { recusaSeSaidaBarrada, textosDoValor } from '../server/ai/nucleo/saidaFiltrada'

const ctx = () => {
  const anotacoes: unknown[] = []
  return { ctx: { requestId: 'r1', rastro: { anotar: (a: unknown) => void anotacoes.push(a) } as any }, anotacoes }
}

describe('textosDoValor', () => {
  it('junta toda string, de objetos e listas aninhados, inclusive as chaves', () => {
    expect(textosDoValor({ a: 'um', b: ['dois', { c: 'três' }], n: 4 })).toEqual([
      'a',
      'um',
      'b',
      'dois',
      'c',
      'três',
      'n',
    ])
  })
  it('profundidade absurda não estoura nem escapa: o resto vira JSON conferido', () => {
    let fundo: unknown = 'http://x.com'
    for (let i = 0; i < 40; i++) fundo = { k: fundo }
    expect(textosDoValor(fundo).join(' ')).toContain('http://x.com')
  })
})

describe('recusaSeSaidaBarrada', () => {
  const suja = { porQue: 'ok', itens: [{ termo: 'a', sentido: 'Add me on WhatsApp: +55 11 98765-4321' }] }

  it('perfil protegido: barra texto aninhado, devolve 502 saida_filtrada e anota o rastro', async () => {
    const { ctx: c, anotacoes } = ctx()
    const r = await recusaSeSaidaBarrada(c, 'explicacao', true, suja)
    expect(r).toMatchObject({ ok: false, status: 502 })
    expect(JSON.stringify(r)).toContain('saida_filtrada')
    expect(JSON.stringify(r)).not.toContain('98765')
    expect(anotacoes).toEqual([{ saidaFiltrada: 'contato_externo' }])
  })

  it('diário (tarefa 2.3): retorno com contato externo vira 502 saida_filtrada para perfil protegido; adulto passa', async () => {
    const retorno = {
      elogio: 'Ótimo! Me adiciona no discord: ana#1234 ou ana@exemplo.net',
      pontos: [{ trecho: 'I go', tipo: 'tempoVerbal', dica: 'Olhe o verbo.', exemplo: 'I went' }],
      resolvidos: [],
    }
    const barrada = await recusaSeSaidaBarrada(ctx().ctx, 'diario', true, retorno)
    expect(barrada).toMatchObject({ ok: false, status: 502 })
    expect(JSON.stringify(barrada)).toContain('saida_filtrada')
    expect(JSON.stringify(barrada)).not.toContain('discord')
    expect(await recusaSeSaidaBarrada(ctx().ctx, 'diario', false, retorno)).toBeNull()
  })

  it('o que só aparece depois de decodificar o JSON também é barrado', async () => {
    const lido = JSON.parse('{"t":"veja \\u0068ttp://exemplo-ruim.com/x"}')
    expect(await recusaSeSaidaBarrada(ctx().ctx, 'resumo', true, lido)).not.toBeNull()
  })

  it('contato ou link partido em dois campos é barrado (o texto juntado também é conferido)', async () => {
    const contato = { a: 'me chama no (11) 98765', b: '4321 que eu respondo' }
    expect(await recusaSeSaidaBarrada(ctx().ctx, 'explicacao', true, contato)).toMatchObject({ status: 502 })
    const link = ['http', '://exemplo-ruim.com/x']
    expect(await recusaSeSaidaBarrada(ctx().ctx, 'explicacao', true, { x: link[0], y: link[1] })).not.toBeNull()
    expect(await recusaSeSaidaBarrada(ctx().ctx, 'explicacao', true, [link[0], link[1]])).not.toBeNull()
  })

  it('texto juntado acima do teto do moderador é barrado (fail-closed), mesmo com cada campo abaixo', async () => {
    const metade = 'a '.repeat(6_000)
    const campos = [metade, metade, metade]
    expect(campos.every((c) => c.length < TETO_DO_TEXTO_MODERADO)).toBe(true)
    expect(await recusaSeSaidaBarrada(ctx().ctx, 'resumo', true, campos)).not.toBeNull()
  })

  it('vários campos limpos passam', async () => {
    const limpa = ['Despedida natural entre amigos.', 'até mais', 'later']
    expect(await recusaSeSaidaBarrada(ctx().ctx, 'resumo', true, limpa)).toBeNull()
  })

  it('adulto: nada é conferido', async () => {
    expect(await recusaSeSaidaBarrada(ctx().ctx, 'explicacao', false, suja)).toBeNull()
  })

  it('texto limpo de aula passa para o perfil protegido', async () => {
    const limpa = { porQue: 'Despedida natural entre amigos.', itens: [{ termo: 'later', sentido: 'até mais' }] }
    expect(await recusaSeSaidaBarrada(ctx().ctx, 'explicacao', true, limpa)).toBeNull()
  })
})

describe('todo núcleo que fala com menor chama o filtro', () => {
  const NUCLEOS: Array<[string, string]> = [
    ['explicarFrase', 'explicacao'],
    ['resumirSessao', 'resumo'],
    ['escrita', 'escrita'],
    ['diario', 'diario'],
    ['sugerirAlternativas', 'alternativas'],
    ['polirLote', 'polimento'],
    ['parceiroDeLeitura', 'leitura'],
    ['assistenteAoVivo', 'assistente'],
  ]
  it.each(NUCLEOS)('%s confere a saída (%s) antes de sair', (arquivo, funcao) => {
    const src = readFileSync(`server/ai/nucleo/${arquivo}.ts`, 'utf8')
    expect(src).toContain(`recusaSeSaidaBarrada(ctx, '${funcao}', menor,`)
  })
  it('o assistente não abre fluxo para perfil protegido', () => {
    const src = readFileSync('server/ai/nucleo/assistenteAoVivo.ts', 'utf8')
    expect(src).toContain('const emFluxo = fluxo && !menor')
  })
})
