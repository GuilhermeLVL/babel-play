// @vitest-environment jsdom
/**
 * REDE CAÍDA NÃO PODE SER APRESENTADA COMO CONTEÚDO VAZIO.
 *
 * `CatalogoDePalavras.tsx:113` já tinha nomeado o defeito na sua própria tela: "antes os três
 * fetches faziam `.catch(() => [])` e rede caída era indistinguível de baralho vazio". O mesmo
 * padrão sobrevivia em `Study.tsx`, que fazia `.catch(() => setVocabCards([]))` — e com o wi-fi
 * fora anunciava "Nenhuma palavra no deck ainda", isto é, dizia ao usuário que o vocabulário dele
 * tinha sumido.
 *
 * É a mesma família de defeito que `semConteudoFabricado.test.ts` e `contagemHonesta.test.ts`
 * perseguem, pela porta dos fundos: em vez de INVENTAR um número, a tela inventa um ZERO. Um
 * `Vazio` exibido no lugar de um `Erro` é conteúdo fabricado.
 *
 * Este teste trava o primitivo. A cobertura de cada TELA que o consome é responsabilidade dos
 * testes daquela tela; aqui garante-se que o vocabulário compartilhado sabe dizer "não sei".
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Erro from '../src/components/ui/Erro'

afterEach(cleanup)

describe('primitivo Erro', () => {
  it('anuncia-se como alerta — sem role, o leitor de tela espera um conteúdo que nunca vem', () => {
    render(<Erro titulo="Não consegui carregar seu vocabulário." />)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('mostra o detalhe técnico, que é o que se cola no suporte', () => {
    render(<Erro titulo="Falhou." detalhe="503 Service Unavailable" />)
    expect(screen.getByText('503 Service Unavailable')).toBeTruthy()
  })

  it('sem detalhe, não escreve "undefined" na tela', () => {
    const { container } = render(<Erro titulo="Falhou." />)
    expect(container.textContent).not.toContain('undefined')
    expect(container.textContent).not.toContain('null')
  })

  it('oferece a porta de saída e ela de fato chama de volta', () => {
    const tentar = vi.fn()
    render(<Erro titulo="Falhou." aoTentarDeNovo={tentar} />)
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }))
    expect(tentar).toHaveBeenCalledTimes(1)
  })

  it('sem ação possível, não finge um botão que não leva a nada', () => {
    render(<Erro titulo="Falhou." />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('as telas que liam falha como vazio', () => {
  /* Varredura de CÓDIGO, não de render: montar `Study` inteiro exigiria simular o app todo, e o
     que precisa ser travado aqui é justamente a linha que voltaria a mentir.
     SEM COMENTÁRIOS, pelo mesmo motivo que `semConteudoFabricado.test.ts:29`: este repositório
     documenta densamente o que removeu, e o comentário de `Study.tsx` cita o
     `.catch(() => setVocabCards([]))` antigo textualmente. Varrer o arquivo cru acusaria a própria
     explicação — e ensinaria a próxima pessoa a apagar o comentário para o teste passar. */
  const fonte = (p: string) =>
    readFileSync(join(process.cwd(), p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('Study nao converte falha de fetchDeck em deck vazio', () => {
    const s = fonte('src/components/views/Study.tsx')
    expect(s).not.toContain('.catch(() => setVocabCards([]))')
    expect(s).toContain('setErroDoDeck')
  })

  it('Study renderiza o erro ANTES do vazio', () => {
    /* A ordem é o conserto: com o vazio primeiro, a falha de rede volta a ser exibida como
       "você não tem palavras", mesmo com o estado de erro existindo no componente. */
    const s = fonte('src/components/views/Study.tsx')
    const erro = s.indexOf('erroDoDeck ? (')
    const vazio = s.indexOf('Nenhuma palavra no deck ainda.')
    expect(erro).toBeGreaterThan(-1)
    expect(vazio).toBeGreaterThan(-1)
    expect(erro).toBeLessThan(vazio)
  })

  it('CatalogoDePalavras segue usando o primitivo, sem markup proprio duplicado', () => {
    const s = fonte('src/components/views/vocab/CatalogoDePalavras.tsx')
    expect(s).toContain('<Erro')
    expect(s).not.toContain('bg-error-soft/10 p-3')
  })
})
