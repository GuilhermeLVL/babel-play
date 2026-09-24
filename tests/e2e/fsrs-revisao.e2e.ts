import { expect, test } from '@playwright/test'

import { type CartaoNoServidor, listarCartoes, semearSessaoComCartoes } from './_fixtures'
import { clicarRobusto, fecharSobreposicoes } from './_helpers'

/**
 * A REVISAO ESPACADA, de ponta a ponta: abrir `/revisar`, avaliar um cartao e ver o agendamento
 * mudar no SERVIDOR.
 *
 * O que o teste prende e o caminho que a auditoria de 2026-09-07 corrigiu (achado A53): a nota
 * dada na tela vai por `POST /api/vocab/:id/review`, o FSRS-5 roda no servidor e o `dueAt` do
 * cartao sai do "agora" para o futuro. Antes existia um FSRS aproximado no cliente que mostrava um
 * agendamento que nao era o do banco.
 *
 * O formato do exercicio (flashcard, digitacao ou multipla escolha) vem do "Tipo de cartao" das
 * opcoes da revisao (padrao: Lembrar; "Automatico" usa `formatForCard`); o teste trata os tres
 * para nao depender da escolha.
 */

let sessionId = ''
let cartoes: CartaoNoServidor[] = []

test.beforeAll(async () => {
  ;({ sessionId, cartoes } = await semearSessaoComCartoes())
})

test.describe('Revisao FSRS', () => {
  test('avaliar um cartao avanca o progresso e move o due no servidor', async ({ page }) => {
    test.slow()
    const antes = await listarCartoes()
    const porId = new Map(antes.map((c) => [c.id, c]))

    await page.goto('/revisar')
    await expect(page.getByRole('main')).toBeVisible()
    await fecharSobreposicoes(page)

    /* A tela abre na gravacao mais recente (`recordings[0]`), que e a da fixture. `/revisar` e tela
       propria (prototipo `T.revisao`): sem o cabecalho da sessao, entao quem prova que e a sessao
       certa e a palavra no cartao, conferida contra os cartoes vencidos no servidor mais abaixo. */
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1, { timeout: 15_000 })

    /* `/revisar` E o "Revisar agora" (prototipo aprovado): a rodada abre sozinha, sem menu antes.
       A fila traz os VENCIDOS primeiro (e o baralho inteiro so quando nada venceu). Se ela nao abrir
       sozinha, o botao "Revisar agora" da faixa e a porta — e o teste reprova se nenhum dos dois. */
    const progresso = page.getByText(/^Revisão · \d+ de \d+$/)
    // `waitFor`, não `isVisible`: este não espera (o `timeout` dele é ignorado) e perdia a tela carregando.
    const abriuSozinha = await progresso
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false)
    if (!abriuSozinha) {
      await clicarRobusto(page, page.getByRole('button', { name: /Começar a repetir|Revisar agora|Treinar agora/ }))
    }
    await expect(progresso, 'a revisao deveria abrir no cartao 1').toBeVisible({ timeout: 10_000 })
    const textoAntes = (await progresso.textContent()) ?? ''
    const totalNaFila = Number(textoAntes.match(/de (\d+)/)?.[1] ?? 0)
    expect(totalNaFila, 'a fila deveria ter ao menos um cartao').toBeGreaterThanOrEqual(1)
    /* Vencido = no baralho e com `dueAt` no passado (mesma regra de `isDueNow`). Outros testes da
       mesma execucao (e o outro viewport) avaliam cartoes deste servidor, entao a fila NAO e sempre
       "todos os cartoes da sessao": e o que deles estiver vencido quando a tela abre. */
    const agora = Date.now()
    const daSessao = new Set(cartoes.map((c) => c.id))
    const vencidos = antes.filter((c) => daSessao.has(c.id) && c.inDeck && c.dueAt != null && c.dueAt <= agora)
    if (vencidos.length > 0)
      expect(totalNaFila, 'a fila deveria trazer todos os vencidos').toBeGreaterThanOrEqual(vencidos.length)
    expect(textoAntes).toMatch(/^Revisão · 1 de/)

    /* Qual cartao esta na tela: a palavra aparece no corpo em qualquer formato. */
    const corpo = page.getByRole('main')
    let alvo: CartaoNoServidor | undefined
    const candidatos = vencidos.length > 0 ? vencidos : antes.filter((c) => daSessao.has(c.id) && c.inDeck)
    for (const c of candidatos) {
      if (
        await corpo
          .getByText(new RegExp(`\\b${c.word}\\b`, 'i'))
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        alvo = c
        break
      }
    }
    expect(
      alvo,
      vencidos.length > 0 ? 'o cartao aberto deveria ser um vencido' : 'nenhuma palavra do baralho no cartao aberto',
    ).toBeTruthy()

    const mostrar = page.getByRole('button', { name: /Mostrar resposta/i })
    const digitar = page.getByPlaceholder('Digite a palavra...')
    if (await mostrar.isVisible().catch(() => false)) {
      await clicarRobusto(page, mostrar)
      await clicarRobusto(page, page.getByRole('button', { name: /^Bom/ }))
    } else if (await digitar.isVisible().catch(() => false)) {
      await digitar.fill(alvo!.word)
      await digitar.press('Enter')
      await clicarRobusto(page, page.getByRole('button', { name: 'Avançar' }))
    } else {
      // Multipla escolha: a opcao certa e a propria palavra.
      await clicarRobusto(page, corpo.getByRole('button', { name: alvo!.word, exact: true }))
      await clicarRobusto(page, page.getByRole('button', { name: 'Avançar' }))
    }

    if (totalNaFila > 1)
      await expect(progresso, 'o indicador deveria avancar para o cartao 2').toHaveText(/^Revisão · 2 de/, {
        timeout: 10_000,
      })
    else
      await expect(page.getByText('Rodada concluída').first(), 'fila de um: a rodada fecha').toBeVisible({
        timeout: 10_000,
      })

    /* O SERVIDOR E A FONTE: o cartao avaliado tem de ter `reps` maior e `dueAt` no futuro. */
    await expect
      .poll(
        async () => {
          const depois = await listarCartoes()
          const avaliado = depois.find((c) => c.id === alvo!.id)
          const original = porId.get(alvo!.id)
          if (!avaliado || !original) return 'cartao sumiu'
          const repsSubiu = (avaliado.reps ?? 0) > (original.reps ?? 0)
          const dueMoveu = (avaliado.dueAt ?? 0) > (original.dueAt ?? 0) && (avaliado.dueAt ?? 0) > Date.now()
          return repsSubiu && dueMoveu
            ? 'ok'
            : `reps ${original.reps}->${avaliado.reps}, due ${original.dueAt}->${avaliado.dueAt}`
        },
        { timeout: 10_000, message: 'o servidor deveria ter reagendado o cartao avaliado' },
      )
      .toBe('ok')
    expect(sessionId).not.toBe('')
    expect(cartoes.length, 'a fixture deveria ter semeado os cartoes').toBeGreaterThan(0)
  })
})
