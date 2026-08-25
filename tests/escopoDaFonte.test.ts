/**
 * F6 — DENTRO DA SESSÃO, A FONTE É A SESSÃO.
 *
 * O defeito que estes testes travam (achado B2): `Play.tsx` esconde o cabeçalho (`:1497`) e a
 * barra de progresso (`:1905`) quando montado com `embutido`, mas a faixa "De onde vêm as
 * palavras" NÃO tinha essa guarda. Resultado: dentro da aba "Jogos" de uma sessão, a tela
 * continuava oferecendo "Minhas palavras", "Trilha" e um seletor de outra gravação — três
 * formas de sair silenciosamente do escopo, embaixo de um cabeçalho que afirma o contrário.
 *
 * Quem quiser jogar com o baralho inteiro vai à tela Jogar. A troca de escopo passa a ser uma
 * mudança de LUGAR, não um controle escondido dentro de um contexto que promete outra coisa.
 */
import { describe, it, expect } from 'vitest'
import { fontesDisponiveis } from '../src/core/minigames/source'

describe('fontesDisponiveis — quando embutido na Sessão', () => {
  it('oferece SOMENTE a sessão', () => {
    const f = fontesDisponiveis({ embutido: true, temSessao: true, temTrilha: true })
    expect(f).toEqual(['sessao'])
  })

  it('não oferece o baralho inteiro, mesmo com trilha disponível', () => {
    const f = fontesDisponiveis({ embutido: true, temSessao: true, temTrilha: true })
    expect(f).not.toContain('baralho')
    expect(f).not.toContain('trilha')
  })

  it('permitir trocar de gravação também é sair do escopo', () => {
    expect(fontesDisponiveis({ embutido: true, temSessao: true, temTrilha: false, sessoesDisponiveis: 12 }))
      .toEqual(['sessao'])
  })
})

describe('fontesDisponiveis — na tela Jogar (não embutida)', () => {
  it('oferece tudo o que existe', () => {
    const f = fontesDisponiveis({ embutido: false, temSessao: true, temTrilha: true })
    expect(f).toEqual(['baralho', 'sessao', 'trilha'])
  })

  it('omite a sessão quando não há gravação — botão que não faz nada é pior que ausente', () => {
    expect(fontesDisponiveis({ embutido: false, temSessao: false, temTrilha: true }))
      .toEqual(['baralho', 'trilha'])
  })

  it('omite a trilha quando o idioma não tem lista curada', () => {
    expect(fontesDisponiveis({ embutido: false, temSessao: true, temTrilha: false }))
      .toEqual(['baralho', 'sessao'])
  })

  it('o baralho sempre existe — é o único que não depende de nada', () => {
    expect(fontesDisponiveis({ embutido: false, temSessao: false, temTrilha: false }))
      .toEqual(['baralho'])
  })
})

describe('podeTrocarDeGravacao', () => {
  it('nunca, quando embutido — trocar a gravação é trocar o escopo da tela', async () => {
    const { podeTrocarDeGravacao } = await import('../src/core/minigames/source')
    expect(podeTrocarDeGravacao({ embutido: true, sessoesDisponiveis: 12 })).toBe(false)
  })

  it('só quando há mais de uma para escolher', async () => {
    const { podeTrocarDeGravacao } = await import('../src/core/minigames/source')
    expect(podeTrocarDeGravacao({ embutido: false, sessoesDisponiveis: 1 })).toBe(false)
    expect(podeTrocarDeGravacao({ embutido: false, sessoesDisponiveis: 2 })).toBe(true)
  })
})

/**
 * O ADAPTADOR ENTRE DOIS VOCABULÁRIOS.
 *
 * A sala fala a língua de quem joga — "minhas gravações **ou** trilha", e se for gravações,
 * "todas **ou** uma". O core fala a dele: `FonteId` é `'baralho' | 'sessao' | 'trilha'`, e continua
 * sendo, porque `origemAtual` é gravado em `exercise_results` a partir dele — renomear orfanaria o
 * histórico de quem já jogou.
 *
 * Duas representações da mesma coisa só são seguras se a ida e a volta forem exatas. Sem este
 * round-trip, a divergência apareceria como "escolhi uma gravação e voltei para todas" — em
 * silêncio, e só depois de a pessoa confirmar.
 */
describe('o adaptador sala ↔ core', () => {
  it('todas as gravações ↔ baralho', async () => {
    const { fonteDaEscolha, escolhaDaFonte } = await import('../src/core/minigames/source')
    const e = { origem: 'gravacoes' as const, escopo: 'todas' as const, lang: 'en' }
    expect(fonteDaEscolha(e).id).toBe('baralho')
    expect(escolhaDaFonte(fonteDaEscolha(e))).toMatchObject({ origem: 'gravacoes', escopo: 'todas', lang: 'en' })
  })

  it('uma gravação ↔ sessao, carregando o id', async () => {
    const { fonteDaEscolha, escolhaDaFonte } = await import('../src/core/minigames/source')
    const e = { origem: 'gravacoes' as const, escopo: 'uma' as const, lang: 'en', sessionId: 's7' }
    const f = fonteDaEscolha(e)
    expect(f).toMatchObject({ id: 'sessao', sessionId: 's7' })
    expect(escolhaDaFonte(f)).toMatchObject({ origem: 'gravacoes', escopo: 'uma', sessionId: 's7' })
  })

  it('trilha ↔ trilha, carregando o nível', async () => {
    const { fonteDaEscolha, escolhaDaFonte } = await import('../src/core/minigames/source')
    const e = { origem: 'trilha' as const, escopo: 'todas' as const, lang: 'en', nivel: 'B1' as const }
    const f = fonteDaEscolha(e)
    expect(f).toMatchObject({ id: 'trilha', nivel: 'B1' })
    expect(escolhaDaFonte(f)).toMatchObject({ origem: 'trilha', nivel: 'B1' })
  })

  it('a ida e a volta preservam TODAS as escolhas possíveis', async () => {
    const { fonteDaEscolha, escolhaDaFonte } = await import('../src/core/minigames/source')
    const escolhas = [
      { origem: 'gravacoes' as const, escopo: 'todas' as const, lang: 'pt' },
      { origem: 'gravacoes' as const, escopo: 'uma' as const, lang: 'pt', sessionId: 'abc' },
      { origem: 'trilha' as const, escopo: 'todas' as const, lang: 'en' },
      { origem: 'trilha' as const, escopo: 'todas' as const, lang: 'en', nivel: 'A2' as const },
    ]
    for (const e of escolhas) {
      expect(escolhaDaFonte(fonteDaEscolha(e)), JSON.stringify(e)).toMatchObject(e)
    }
  })

  it('"uma gravação" sem id NÃO vira sessão — seria uma fonte vazia sem dizer por quê', async () => {
    const { fonteDaEscolha } = await import('../src/core/minigames/source')
    expect(fonteDaEscolha({ origem: 'gravacoes', escopo: 'uma', lang: 'en' }).id).toBe('baralho')
  })
})
