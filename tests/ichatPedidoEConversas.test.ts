/**
 * O iCHAT DO PROTÓTIPO — as regras puras que o app real preserva por fora do modelo.
 *
 * P2 (toda resposta cita a origem), P3 ("não sei" é resposta), P4 (ação só com confirmação), o
 * rastro sem repetição, a busca com "achado em" e a migração das conversas do iChat anterior.
 */
import { describe, expect, it } from 'vitest'

import {
  achadoEm,
  carregarConversas,
  filtrarConversas,
  migrarDoFormatoAntigo,
  novaConversa,
  quandoLegivel,
  rastrear,
  salvarConversas,
  semMarcacao,
  tituloDaPergunta,
} from '../src/lib/ichat/conversas'
import {
  ferramentasDaTela,
  lerPedido,
  origemDaResposta,
  propostaDoPedido,
  rotuloDaFerramenta,
} from '../src/lib/ichat/pedido'

class Armazem {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
}
const armazem = () => new Armazem() as unknown as Storage

describe('lerPedido', () => {
  const caderno = ['leverage', 'deadline', 'go']

  it('a ficha !ação manda; sem ficha, o verbo da pergunta decide', () => {
    expect(lerPedido('qualquer coisa', [{ sig: '!', id: 'jogar', rot: 'jogar' }], caderno).acao).toBe('jogar')
    expect(lerPedido('O que revisar hoje?', [], caderno).acao).toBe('revisar')
    expect(lerPedido('Resuma esta sessão', [], caderno).acao).toBe('resumir')
    expect(lerPedido('Crie uma frase com as minhas palavras', [], caderno).acao).toBe('frase')
    expect(lerPedido('bom dia', [], caderno).acao).toBeNull()
  })

  it('a palavra vem da ficha @ ou é reconhecida inteira na pergunta (nunca pedaço de outra)', () => {
    expect(lerPedido('o que significa?', [{ sig: '@', id: 'deadline', rot: 'deadline' }], caderno).palavra).toBe(
      'deadline',
    )
    expect(lerPedido('o que é leverage?', [], caderno).palavra).toBe('leverage')
    expect(lerPedido('leveraged buyout', [], caderno).palavra).toBeNull()
    // palavra curta demais não é reconhecida solta ("go" em "good")
    expect(lerPedido('good morning, go!', [], caderno).palavra).toBeNull()
  })

  it('P3: pagamento, senha e cartão de CRÉDITO são lacuna; o cartão do caderno não', () => {
    expect(lerPedido('qual a senha?', [], caderno).lacuna).toBe(true)
    expect(lerPedido('meu cartão de crédito', [], caderno).lacuna).toBe(true)
    expect(lerPedido('o que é este cartão do caderno?', [], caderno).lacuna).toBe(false)
  })
})

describe('origem, etapa e proposta', () => {
  const pedido = (p: Partial<ReturnType<typeof lerPedido>>) => ({ acao: null, palavra: null, lacuna: false, ...p })
  const base = { sessao: null, palavrasNoCaderno: 3, auto: true, nomeDaTela: 'Jogar' }

  it('P2: a origem é o material enviado', () => {
    expect(origemDaResposta({ ...base, pedido: pedido({ palavra: 'leverage' }) })).toBe('seu caderno · “leverage”')
    expect(origemDaResposta({ ...base, pedido: pedido({ acao: 'revisar' }) })).toBe('fila de revisão')
    expect(origemDaResposta({ ...base, pedido: pedido({ acao: 'jogar' }) })).toBe('seu caderno · 3 palavras')
    expect(origemDaResposta({ ...base, sessao: 'Reunião', pedido: pedido({ acao: 'resumir' }) })).toBe(
      'transcrição de “Reunião”',
    )
    expect(origemDaResposta({ ...base, pedido: pedido({}) })).toBe('contexto da tela Jogar')
    expect(origemDaResposta({ ...base, auto: false, pedido: pedido({}) })).toBe('conhecimento geral do tutor')
  })

  it('a etapa "consultando…" segue o pedido', () => {
    expect(rotuloDaFerramenta(pedido({ palavra: 'x' }), false)).toBe('consultando seu caderno')
    expect(rotuloDaFerramenta(pedido({ acao: 'revisar', palavra: 'x' }), false)).toBe('consultando a fila de revisão')
    expect(rotuloDaFerramenta(pedido({}), true)).toBe('lendo a transcrição')
    expect(rotuloDaFerramenta(pedido({}), false)).toBeNull()
  })

  it('P4: a proposta usa o número real e some quando não há o que revisar', () => {
    expect(propostaDoPedido(pedido({ acao: 'revisar' }), 5)).toEqual({
      rot: 'Abrir revisão com 5 palavras',
      tipo: 'revisar',
    })
    expect(propostaDoPedido(pedido({ acao: 'revisar' }), 0)).toBeNull()
    expect(propostaDoPedido(pedido({ palavra: 'leverage' }), 2)?.tipo).toBe('palavra')
    expect(propostaDoPedido(pedido({ acao: 'jogar' }), 0)?.rot).toBe('Abrir o Memória')
    expect(propostaDoPedido(pedido({ acao: 'frase' }), 9)).toBeNull()
  })

  it('ferramentas por tela, nos grupos do protótipo', () => {
    expect(ferramentasDaTela('analysis').map(([s]) => s)).toEqual(['Entender esta sessão', 'Praticar', 'Organizar'])
    expect(ferramentasDaTela('play').map(([s, i]) => [s, i.map((f) => f.id)])).toEqual([
      ['Praticar', ['jogar', 'frase']],
      ['Entender', ['explicar']],
    ])
    expect(ferramentasDaTela('settings')[0][1].map((f) => f.id)).toEqual(['revisar', 'jogar'])
  })
})

describe('conversas', () => {
  it('o rastro não repete o mesmo item seguido e guarda a palavra', () => {
    let c = novaConversa()
    c = rastrear(c, 'tela', 'Jogar')
    const igual = rastrear(c, 'tela', 'Jogar')
    expect(igual).toBe(c)
    c = rastrear(c, 'palavra', 'leverage', 'B2')
    c = rastrear(c, 'tela', 'Jogar')
    expect(c.rastro.map((r) => r.rot)).toEqual(['Jogar', 'leverage', 'Jogar'])
    expect(c.palavras).toEqual(['leverage'])
  })

  it('busca por título ou trecho, fixadas primeiro, com "achado em"', () => {
    const a = {
      ...novaConversa(),
      id: 'a',
      titulo: 'Sobre prazos',
      msgs: [{ de: 'ia' as const, txt: 'deadline é prazo' }],
    }
    const b = { ...novaConversa(), id: 'b', titulo: 'Outra', fixada: true, msgs: [] }
    expect(filtrarConversas([a, b], '').map((x) => x.id)).toEqual(['b', 'a'])
    expect(filtrarConversas([a, b], 'DEADLINE').map((x) => x.id)).toEqual(['a'])
    expect(achadoEm(a, 'deadline')).toBe('deadline é prazo')
    expect(achadoEm(a, '')).toBe('')
  })

  it('título, "quando" e prévia sem marcação', () => {
    expect(tituloDaPergunta('curta')).toBe('curta')
    expect(tituloDaPergunta('x'.repeat(50))).toBe(`${'x'.repeat(38)}…`)
    const agora = new Date(2026, 8, 24, 15, 0).getTime()
    expect(quandoLegivel(agora - 30_000, agora)).toBe('agora')
    expect(quandoLegivel(new Date(2026, 8, 24, 9, 5).getTime(), agora)).toBe('hoje, 09:05')
    expect(quandoLegivel(new Date(2026, 8, 23, 22, 0).getTime(), agora)).toBe('ontem')
    expect(quandoLegivel(new Date(2026, 7, 2).getTime(), agora)).toBe('02/08')
    expect(semMarcacao('**IA local** em [ollama.com](https://ollama.com)')).toBe('IA local em ollama.com')
  })

  it('persiste e relê; sem nada salvo nasce uma conversa nova', () => {
    const s = armazem()
    const vazio = carregarConversas(s)
    expect(vazio.conversas).toHaveLength(1)
    expect(vazio.atual).toBe(vazio.conversas[0].id)
    const c = { ...novaConversa(), titulo: 'Guardada' }
    salvarConversas([c], c.id, s)
    expect(carregarConversas(s).conversas[0].titulo).toBe('Guardada')
  })

  it('migra o iChat anterior uma vez, sem as boas-vindas fixas', () => {
    const antigo = [
      {
        id: 'default',
        title: 'Conversa Babel Principal',
        createdAt: '2026-09-01T10:00:00.000Z',
        messages: [
          { role: 'assistant', content: 'Olá! Sou seu Babel iChat, o assistente…' },
          { role: 'user', content: 'o que é roadmap?' },
          { role: 'assistant', content: 'Roteiro.' },
        ],
      },
      {
        id: 'vazia',
        title: 'Nada',
        messages: [{ role: 'assistant', content: 'Iniciei um novo contexto de conversação…' }],
      },
    ]
    const migradas = migrarDoFormatoAntigo(antigo)
    expect(migradas).toHaveLength(1)
    expect(migradas[0].msgs).toEqual([
      { de: 'eu', txt: 'o que é roadmap?' },
      { de: 'ia', txt: 'Roteiro.' },
    ])
    const s = armazem()
    s.setItem('ichat_sessions', JSON.stringify(antigo))
    expect(carregarConversas(s).conversas[0].titulo).toBe('Conversa Babel Principal')
  })
})
