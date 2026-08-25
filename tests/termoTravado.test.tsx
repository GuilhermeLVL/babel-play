// @vitest-environment jsdom
/**
 * O JOGO TRAVAVA: A LINHA FICAVA CHEIA E O ENVIAR MORRIA.
 *
 * Relato: "às vezes o usuário não consegue enviar a palavra, fica preso — e acontece sobretudo
 * quando pede dica, apaga a dica e reescreve".
 *
 * A CAUSA. `proximaVaga(a, de)` devolve `de` quando não acha vaga nenhuma, e `de` chega como
 * `pos + 1`. Com a linha cheia e o cursor na última casa, isso devolve `tamanho` — um índice
 * FORA da linha. `digitar` então escreve em `atual[tamanho]` e o array CRESCE além do tabuleiro.
 *
 * A partir daí a tela e o estado discordam: a grade desenha `resposta.length` casas e mostra a
 * palavra completa, mas `preenchido = atual.every(l => l !== '')` percorre uma casa a mais, que
 * é invisível. Basta apagar uma vez para essa casa extra ficar vazia — e o botão de enviar morre
 * com a linha visivelmente cheia. Não há tecla que a preencha à vista: a pessoa fica presa.
 *
 * A dica é o gatilho mais comum porque `pedirDica` chama `proximaVaga(n, d.posicao + 1)`; quando
 * a letra revelada cai na última casa, o cursor já sai fora da linha antes de qualquer digitação.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import TermoGame from '../src/components/minigames/TermoGame'
import type { RodadaTermo } from '../src/core'

/**
 * RELÓGIO CONTROLADO. `fecharGrupo` agenda um `setTimeout` de 1500–2400 ms para a pessoa ler o
 * resultado antes de a tela trocar. Com o relógio real, esse callback era executado ou não conforme
 * a suíte terminasse antes ou depois do disparo — e a cobertura deste arquivo saía bimodal entre
 * duas execuções idênticas. Aqui o tempo só passa quando o teste manda.
 */
beforeEach(() => {
  vi.useFakeTimers()
  /* `dicaDeLetra` SORTEIA a posição revelada. Com o sorteio solto, quantas casas `proximaVaga`
     percorre depois da dica mudava a cada execução — a segunda metade da bimodalidade medida. */
  vi.spyOn(Math, 'random').mockReturnValue(0)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** Passa o tempo do intervalo mais longo (2400 ms, o do erro) dentro de `act`. */
const passarAPausaDoResultado = () => act(() => { vi.advanceTimersByTime(2400) })

/** Três palavras de 4 letras: o mínimo que monta a escada (`planoDaEscada`). */
const RODADAS: RodadaTermo[] = [
  { cardId: 'c1', palavra: 'casa', resposta: 'CASA', pista: 'onde se mora', lang: 'pt' },
  { cardId: 'c2', palavra: 'mesa', resposta: 'MESA', pista: 'móvel', lang: 'pt' },
  { cardId: 'c3', palavra: 'vela', resposta: 'VELA', pista: 'ilumina', lang: 'pt' },
]

function montar() {
  const onFinish = vi.fn()
  render(<TermoGame rodadas={RODADAS} ageProfile="pro" onFinish={onFinish} onExit={vi.fn()} />)
  return { onFinish }
}

const teclar = (letra: string) => fireEvent.keyDown(window, { key: letra })
const enviarBtn = () => screen.getByRole('button', { name: /enviar palpite/i }) as HTMLButtonElement

/** As casas da linha em digitação — o que a PESSOA vê, que é a fonte de verdade da queixa. */
function casasVisiveis(): string[] {
  return screen.getAllByRole('button')
    .filter(b => /^Posição \d/.test(b.getAttribute('aria-label') ?? ''))
    .map(c => (c.textContent ?? '').trim())
}
const linhaVisivel = () => casasVisiveis().join('')
const linhaCheiaAVista = () => casasVisiveis().every(l => l !== '')

describe('a linha nunca pode crescer além do tabuleiro', () => {
  it('digitar uma letra a mais NÃO cria uma casa invisível', () => {
    montar()
    'CASA'.split('').forEach(teclar)
    expect(linhaVisivel()).toBe('CASA')

    teclar('X')   // a tecla que sobra — o dedo escapou, ou a palavra era mais curta do que parecia

    /* A prova de que a letra extra não foi guardada num lugar invisível: um único Backspace tem
       de tirar a ÚLTIMA letra visível. Se o 'X' tiver virado uma 5ª casa, o backspace some com
       ela e a linha continua "CASA" à vista — que é o começo do estado sem saída. */
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(linhaVisivel(), 'o backspace apagou uma casa invisível').toBe('CAS')
  })

  it('apagar depois da letra extra não pode travar o envio — é o relato exato', () => {
    montar()
    'CASA'.split('').forEach(teclar)
    teclar('X')
    fireEvent.keyDown(window, { key: 'Backspace' })

    /* A INVARIANTE: linha cheia à vista ⇒ o envio existe. O contrário é o estado sem saída —
       a pessoa vê a palavra inteira, aperta Enter e não acontece nada. */
    if (linhaCheiaAVista()) {
      expect(enviarBtn().disabled, `linha "${linhaVisivel()}" cheia à vista e o enviar morto`).toBe(false)
    }
  })

  it('a tecla que sobra NÃO estraga a palavra já escrita', () => {
    /* Com o cursor parado na última casa por conta própria, uma tecla a mais é sobra — repetição
       de tecla, dedo escapando. Sobrescrever ali custaria uma tentativa em silêncio: a pessoa
       digitou certo, aperta Enter e erra sem saber por quê. */
    montar()
    'CASA'.split('').forEach(teclar)
    teclar('X')
    expect(linhaVisivel()).toBe('CASA')

    fireEvent.keyDown(window, { key: 'Enter' })
    // Acertou: a resposta toma o lugar da pista no tabuleiro.
    expect(screen.getAllByText('CASA').length).toBeGreaterThan(0)

    // O degrau fechado agenda a subida. Sem avançar o relógio, o callback ficaria pendente e a
    // cobertura dependeria de quem terminasse primeiro.
    expect(screen.getByLabelText('degrau 1 de 2')).toBeTruthy()
    passarAPausaDoResultado()
    expect(screen.getByLabelText('degrau 2 de 2')).toBeTruthy()
  })

  it('mas CLICAR numa casa continua deixando corrigir, mesmo com a linha cheia', () => {
    /* A outra metade da regra. Ignorar toda tecla numa linha cheia seria simples e erraria: quem
       escreveu "CASX" e clica no X está pedindo para trocar aquela letra. */
    montar()
    'CASX'.split('').forEach(teclar)
    const ultima = screen.getAllByRole('button').filter(b => /^Posição 4/.test(b.getAttribute('aria-label') ?? ''))[0]
    fireEvent.click(ultima)
    teclar('A')

    expect(linhaVisivel()).toBe('CASA')
    expect(enviarBtn().disabled).toBe(false)
  })
})

describe('a dica não pode empurrar o cursor para fora da linha', () => {
  it('pedir dica com a linha cheia, apagar e reescrever continua enviável', () => {
    montar()
    'CASA'.split('').forEach(teclar)
    // A dica sobre a linha já cheia: `proximaVaga` não acha vaga e devolve um índice fora dela.
    fireEvent.click(screen.getByRole('button', { name: /pedir dica/i }))

    fireEvent.keyDown(window, { key: 'Backspace' })
    teclar('A')

    expect(linhaCheiaAVista(), `linha "${linhaVisivel()}" deveria estar cheia`).toBe(true)
    expect(enviarBtn().disabled, 'depois da dica + apagar + reescrever o envio morreu').toBe(false)
  })

  it('e a linha nunca guarda mais casas do que a palavra — a invariante por trás de tudo', () => {
    montar()
    'CASA'.split('').forEach(teclar)
    for (const t of ['X', 'Y', 'Z']) teclar(t)
    // Quatro backspaces esvaziam uma palavra de quatro letras. Nem mais, nem menos.
    for (let i = 0; i < 4; i++) fireEvent.keyDown(window, { key: 'Backspace' })
    expect(linhaVisivel(), 'sobrou letra de uma casa que não existe').toBe('')
  })
})
