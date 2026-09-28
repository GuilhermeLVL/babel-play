/**
 * MEMÓRIA EM CAMADAS: a do usuário (exata → aproximada) na frente, a SEMENTE do Tatoeba atrás,
 * só leitura (harness adaptativo §1.2, degrau M2).
 *
 * Ordem: exata do usuário → exata da semente → aproximada do usuário → aproximada da semente. A
 * exata ganha da aproximada mesmo vindo da semente: é tradução humana da MESMA frase, enquanto a
 * aproximada é a tradução de outra frase parecida.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { ATRIBUICAO_TATOEBA } from '../src/lib/traducao/atribuicaoTatoeba'
import { LIMIAR_APROXIMADA_NUVEM } from '../src/lib/traducao/memoriaAproximada'
import { criarArmazemEmMemoria } from '../src/lib/traducao/memoriaDeTraducao'
import { criarMemoriaEmCamadas } from '../src/lib/traducao/memoriaEmCamadas'
import { criarSemente, lerSementeTsv, MOTOR_DA_SEMENTE } from '../src/lib/traducao/sementeDeTraducao'

const esperar = () => new Promise((r) => setTimeout(r, 0))

const TSV = [
  '# Tatoeba (https://tatoeba.org), CC BY 2.0 FR',
  'Good morning.\tBom dia.',
  'I think we should really go back home before it gets dark.\tAcho que devíamos voltar para casa antes de escurecer.',
  'Thank you.\tObrigado.',
].join('\n')

function semente(tsv = TSV) {
  const carregar = vi.fn(async (_par: string) => tsv)
  // Sem o adiamento para o ocioso: aqui a carga começa na hora (o adiamento tem teste próprio).
  return { s: criarSemente({ carregar, agendar: (f) => f() }), carregar }
}

describe('semente do Tatoeba', () => {
  it('lê o TSV (ignora comentário e linha torta)', () => {
    expect(lerSementeTsv(`${TSV}\nsem tab\n\n`)).toHaveLength(3)
  })

  it('carrega preguiçosa: a primeira consulta do par não espera o download, a seguinte acerta', async () => {
    const { s, carregar } = semente()
    expect(carregar).not.toHaveBeenCalled()
    expect(await s.exata('en|pt|good morning')).toBeUndefined()
    await esperar()
    expect(carregar).toHaveBeenCalledWith('en-pt')
    expect((await s.exata('en|pt|good morning'))?.texto).toBe('Bom dia.')
    expect(carregar).toHaveBeenCalledTimes(1)
  })

  it('serve as duas direções do mesmo arquivo', async () => {
    const { s } = semente()
    await s.exata('pt|en|bom dia')
    await esperar()
    expect((await s.exata('pt|en|bom dia'))?.texto).toBe('Good morning.')
  })

  it('par sem semente não baixa nada', async () => {
    const { s, carregar } = semente()
    expect(await s.exata('ja|ko|konnichiwa')).toBeUndefined()
    await esperar()
    expect(carregar).not.toHaveBeenCalled()
  })

  it('a semente publicada existe, tem a atribuição e cabe no orçamento', async () => {
    const { gzipSync } = await import('node:zlib')
    const arquivo = readFileSync(path.resolve(__dirname, '..', 'public', 'semente-traducao', 'en-pt.tsv'), 'utf8')
    expect(arquivo.slice(0, 400)).toMatch(/Tatoeba.*CC BY 2\.0 FR/)
    expect(lerSementeTsv(arquivo).length).toBeGreaterThan(1000)
    expect(gzipSync(arquivo).length).toBeLessThanOrEqual(150 * 1024)
  })
})

describe('camadas: prioridade e marcação', () => {
  it('a exata do usuário vem antes da semente', async () => {
    const usuario = criarArmazemEmMemoria()
    await usuario.gravar('en|pt|good morning', 'Bom dia!!', 'server-llm-mt')
    const { s } = semente()
    const m = criarMemoriaEmCamadas({ usuario, semente: s })
    await m.buscar('en|pt|good morning') // dispara a carga
    await esperar()
    const r = await m.buscar('en|pt|good morning')
    expect(r).toMatchObject({ texto: 'Bom dia!!', aproximada: false, camada: 'usuario' })
  })

  it('sem a do usuário, a exata da semente (motor "tatoeba")', async () => {
    const { s } = semente()
    const m = criarMemoriaEmCamadas({ usuario: criarArmazemEmMemoria(), semente: s })
    await m.buscar('en|pt|thank you')
    await esperar()
    expect(await m.buscar('en|pt|thank you')).toMatchObject({
      texto: 'Obrigado.',
      motor: MOTOR_DA_SEMENTE,
      aproximada: false,
      camada: 'semente',
    })
  })

  it('a exata da semente ganha da aproximada do usuário', async () => {
    const usuario = criarArmazemEmMemoria()
    const { s } = semente()
    const m = criarMemoriaEmCamadas({ usuario, semente: s })
    await m.gravar('en|pt|thank you!', 'Valeu!', 'server-llm-mt')
    await m.buscar('en|pt|thank you')
    await esperar()
    expect((await m.buscar('en|pt|thank you'))?.camada).toBe('semente')
  })

  it('aproximada do usuário: marcada, com a similaridade', async () => {
    const usuario = criarArmazemEmMemoria()
    const m = criarMemoriaEmCamadas({ usuario, semente: null })
    await m.gravar(
      'en|pt|can you please send me the final report before the meeting tomorrow',
      'Pode me mandar o relatório final antes da reunião amanhã?',
      'server-llm-mt',
    )
    const r = await m.buscar('en|pt|can you please send me the final reports before the meeting tomorrow')
    expect(r).toMatchObject({ aproximada: true, camada: 'usuario' })
    expect(r!.similaridade).toBeGreaterThanOrEqual(0.9)
    expect(r!.similaridade).toBeLessThan(1)
  })

  it('aproximada perigosa (negação) é falta', async () => {
    const m = criarMemoriaEmCamadas({ usuario: criarArmazemEmMemoria(), semente: null })
    await m.gravar(
      'en|pt|i do really want to go back home before it gets dark',
      'Eu quero muito voltar...',
      'server-llm-mt',
    )
    expect(await m.buscar("en|pt|i don't really want to go back home before it gets dark")).toBeUndefined()
  })

  it('aproximada da semente, depois de carregada', async () => {
    const { s } = semente()
    const m = criarMemoriaEmCamadas({ usuario: criarArmazemEmMemoria(), semente: s })
    const chave = 'en|pt|i think we should realy go back home before it gets dark'
    await m.buscar(chave)
    await esperar()
    expect(await m.buscar(chave)).toMatchObject({ camada: 'semente', aproximada: true })
  })

  it('quem paga: só motor aceito e limiar da nuvem (0,97)', async () => {
    const usuario = criarArmazemEmMemoria()
    const { s, carregar } = semente()
    const m = criarMemoriaEmCamadas({ usuario, semente: s })
    await m.gravar(
      'en|pt|can you please send me the final report before the meeting tomorrow',
      'Nuvem',
      'server-llm-mt',
    )
    await m.gravar('en|pt|good morning', 'Bom manhã', 'opus-mt-local')
    const nuvem = { limiar: LIMIAR_APROXIMADA_NUVEM, aceitarMotor: (x: string) => x === 'server-llm-mt' }
    // 0,92 de similaridade: serve ao grátis, não a quem paga.
    expect(
      await m.buscar('en|pt|can you please send me the final reports before the meeting tomorrow', nuvem),
    ).toBeUndefined()
    // Motor local recusado; a semente nem é baixada para quem não a aceita.
    expect(await m.buscar('en|pt|good morning', nuvem)).toBeUndefined()
    await esperar()
    expect(carregar).not.toHaveBeenCalled()
  })

  it('a chave guardada antes (IndexedDB de outra sessão) entra no índice aproximado', async () => {
    const usuario = criarArmazemEmMemoria()
    await usuario.gravar(
      'en|pt|can you please send me the final report before the meeting tomorrow',
      'X',
      'server-llm-mt',
    )
    const m = criarMemoriaEmCamadas({ usuario, semente: null })
    expect(await m.buscar('en|pt|can you please send me the final reports before the meeting tomorrow')).toMatchObject({
      aproximada: true,
    })
  })
})

describe('atribuição do Tatoeba (CC BY 2.0 FR exige)', () => {
  it('a tela Sobre mostra o crédito e o catálogo em inglês o traduz', () => {
    expect(ATRIBUICAO_TATOEBA).toMatch(/Tatoeba/)
    expect(ATRIBUICAO_TATOEBA).toMatch(/CC BY 2\.0 FR/)
    const sobre = readFileSync(path.resolve(__dirname, '..', 'src', 'components', 'views', 'Sobre.tsx'), 'utf8')
    expect(sobre).toMatch(/t\(ATRIBUICAO_TATOEBA\)/)
    const en = JSON.parse(readFileSync(path.resolve(__dirname, '..', 'public', 'i18n', 'en.json'), 'utf8'))
    expect(en[ATRIBUICAO_TATOEBA]).toMatch(/Tatoeba.*CC BY 2\.0 FR/)
  })
})
