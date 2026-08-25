/**
 * A PORTA DE SAÍDA DE UM JOGO BLOQUEADO.
 *
 * Uma carta cinza que só diz a causa é um diagnóstico sem alavanca — foi a queixa literal ("os
 * jogos ficam cinza e não tem uma explicação"). O que este arquivo trava é a REGRA de qual saída
 * cabe: uma por carta, a mais barata primeiro, e **nenhuma** quando não existe ação honesta.
 *
 * O caso que mais importa é o último: `sem-voz` e `audio-carregando` NÃO ganham botão. É fácil
 * "melhorar" isso oferecendo algo genérico e transformar a carta num botão que mente.
 */
import { describe, it, expect } from 'vitest'
import { comoDesbloquear, type ContextoDeDesbloqueio } from '../src/core/minigames/desbloqueio'
import type { EstadoDoJogo } from '../src/core/minigames/estadoDosJogos'
import { MINIGAMES } from '../src/core/minigames/types'

/** Memória pede 4 pares; é o `minItems` contra o qual "tem o bastante" é medido. */
const PRECISA = MINIGAMES.memory.minItems

function bloqueado(p: Partial<EstadoDoJogo> = {}): EstadoDoJogo {
  return {
    id: 'memory', ok: false, disponiveis: 1, faltam: PRECISA - 1,
    fonte: 'baralho', tamanhoDaRodada: 0, ...p,
  }
}

const CTX: ContextoDeDesbloqueio = {
  fonteId: 'baralho', outrosIdiomas: [], naOutraFonte: 0,
  descartados: 0, gravacoes: 0,
}

describe('quando não existe ação, não existe botão', () => {
  it('jogo liberado não tem porta', () => {
    expect(comoDesbloquear(bloqueado({ ok: true }), CTX)).toBeNull()
  })

  it('sem voz sintetizada — o navegador é que não tem, não a pessoa', () => {
    expect(comoDesbloquear(bloqueado({ motivo: 'sem-voz' }), { ...CTX, gravacoes: 9, descartados: 99 })).toBeNull()
  })

  it('áudio ainda baixando — resolve sozinho em segundos', () => {
    expect(comoDesbloquear(bloqueado({ motivo: 'audio-carregando' }), { ...CTX, gravacoes: 9 })).toBeNull()
  })
})

describe('a ordem: o conserto mais barato primeiro', () => {
  it('1º — trocar de idioma, quando o material já existe pronto em outro', () => {
    const d = comoDesbloquear(bloqueado(), {
      ...CTX,
      outrosIdiomas: [{ lang: 'en', jogaveis: 600 }],
      naOutraFonte: 2784, descartados: 40, gravacoes: 5,   // tudo o mais também disponível
    })
    expect(d?.acao).toBe('trocar-idioma')
    expect(d?.lang).toBe('en')
  })

  it('e escolhe o idioma com MAIS material, não o primeiro da lista', () => {
    const d = comoDesbloquear(bloqueado(), {
      ...CTX, outrosIdiomas: [{ lang: 'es', jogaveis: 12 }, { lang: 'en', jogaveis: 600 }],
    })
    expect(d?.lang).toBe('en')
  })

  it('idioma que também não tem o bastante NÃO é oferecido — seria trocar cinza por cinza', () => {
    const d = comoDesbloquear(bloqueado(), {
      ...CTX, outrosIdiomas: [{ lang: 'es', jogaveis: PRECISA - 1 }], descartados: 7,
    })
    expect(d?.acao).toBe('revisar-descartes')
  })

  it('2º — a outra ponta do binário', () => {
    const d = comoDesbloquear(bloqueado(), { ...CTX, naOutraFonte: 2784, descartados: 40, gravacoes: 5 })
    expect(d?.acao).toBe('trocar-fonte')
    expect(d?.paraFonte).toBe('trilha')
  })

  it('e da trilha a outra ponta é o contrário', () => {
    const d = comoDesbloquear(bloqueado(), { ...CTX, fonteId: 'trilha', naOutraFonte: 300 })
    expect(d?.paraFonte).toBe('gravacoes')
  })

  it('3º — a pilha de descartados, com o número no rótulo', () => {
    const d = comoDesbloquear(bloqueado(), { ...CTX, descartados: 22, gravacoes: 5 })
    expect(d?.acao).toBe('revisar-descartes')
    expect(d?.rotulo).toContain('22')
  })

  it('4º — sem material em lugar nenhum, o caminho é criar', () => {
    expect(comoDesbloquear(bloqueado(), CTX)?.acao).toBe('gravar')
  })
})

describe('jogo de FRASE tem a sua própria escada', () => {
  it('escolher uma gravação — é de lá que vêm as frases', () => {
    const d = comoDesbloquear(bloqueado({ fonte: 'falas' }), { ...CTX, gravacoes: 5 })
    expect(d?.acao).toBe('escolher-gravacao')
  })

  it('mas NÃO dentro de uma sessão — ali a fonte é fixa por decisão de produto', () => {
    const d = comoDesbloquear(bloqueado({ fonte: 'falas' }), { ...CTX, fonteId: 'sessao', gravacoes: 5 })
    expect(d?.acao).toBe('gravar')
  })

  it('NUNCA oferece trocar de idioma — medido ao vivo, e era um botão que mentia', () => {
    /* Em português o Caça-conectores bloqueado por falta de legenda recebia "Jogar em inglês",
       porque a regra comparava com a contagem de PALAVRAS do outro idioma. As frases vêm da
       gravação, não do baralho: o botão levaria para outra tela igualmente bloqueada. */
    const d = comoDesbloquear(bloqueado({ fonte: 'falas' }), {
      ...CTX, outrosIdiomas: [{ lang: 'en', jogaveis: 600 }], gravacoes: 5,
    })
    expect(d?.acao).toBe('escolher-gravacao')
  })

  it('nem revisar descartes — a curadoria é de palavras, e o que falta é legenda', () => {
    const d = comoDesbloquear(bloqueado({ fonte: 'falas' }), { ...CTX, descartados: 40, gravacoes: 2 })
    expect(d?.acao).toBe('escolher-gravacao')
  })
})

describe('a trilha não tem frase', () => {
  it('oferece escolher uma gravação — trocar de idioma não resolveria', () => {
    const d = comoDesbloquear(
      bloqueado({ motivo: 'trilha-sem-frase', fonte: 'falas' }),
      { ...CTX, fonteId: 'trilha', outrosIdiomas: [{ lang: 'en', jogaveis: 600 }], gravacoes: 3 },
    )
    expect(d?.acao).toBe('escolher-gravacao')
  })

  it('e mandar gravar quando não há nenhuma', () => {
    const d = comoDesbloquear(bloqueado({ motivo: 'trilha-sem-frase', fonte: 'falas' }), { ...CTX, fonteId: 'trilha' })
    expect(d?.acao).toBe('gravar')
  })
})

describe('o rótulo', () => {
  it('usa o nome do idioma em português quando quem chama sabe traduzir', () => {
    const d = comoDesbloquear(bloqueado(), {
      ...CTX, outrosIdiomas: [{ lang: 'en', jogaveis: 600 }],
      nomeDoIdioma: (l) => (l === 'en' ? 'inglês' : l),
    })
    expect(d?.rotulo).toBe('Jogar em inglês')
  })

  it('cai para o código sem o tradutor, em vez de quebrar', () => {
    const d = comoDesbloquear(bloqueado(), { ...CTX, outrosIdiomas: [{ lang: 'en', jogaveis: 600 }] })
    expect(d?.rotulo).toBe('Jogar em en')
  })

  it('toda porta tem rótulo não-vazio — botão sem texto é botão invisível', () => {
    const cenarios: ContextoDeDesbloqueio[] = [
      { ...CTX, outrosIdiomas: [{ lang: 'en', jogaveis: 600 }] },
      { ...CTX, naOutraFonte: 900 },
      { ...CTX, descartados: 3 },
      { ...CTX, fonteId: 'baralho', gravacoes: 2 },
      CTX,
    ]
    for (const c of cenarios) {
      const d = comoDesbloquear(bloqueado({ fonte: 'falas' }), c)
      expect(d?.rotulo?.length, JSON.stringify(c)).toBeGreaterThan(0)
    }
  })
})
