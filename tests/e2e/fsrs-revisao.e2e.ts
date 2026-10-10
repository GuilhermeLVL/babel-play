import { expect, test } from '@playwright/test'

import { type CartaoNoServidor, listarCartoes, semearSessaoComCartoes } from './_fixtures'
import { abrirTela, clicarRobusto } from './_helpers'

/**
 * A REVISÃO ESPAÇADA, de ponta a ponta: abrir `/cartoes/estudar`, avaliar um cartão e ver o
 * agendamento mudar no SERVIDOR.
 *
 * A revisão mora na tela Cartões desde 10/10/2026 (`/cartoes/estudar`; o endereço de antes,
 * `/revisar`, continua abrindo a rodada e quem o prende é `cartoes.e2e.ts`).
 *
 * O que o teste prende é o caminho que a auditoria de 2026-09-07 corrigiu (achado A53): a nota
 * dada na tela vai por `POST /api/vocab/:id/review`, o FSRS-5 roda no servidor e o `dueAt` do
 * cartão sai do "agora" para o futuro. Antes existia um FSRS aproximado no cliente que mostrava um
 * agendamento que não era o do banco.
 *
 * NO DESENHO NOVO (09/10/2026) a tela é `RevisaoDoQuest` (`data-testid="revisao-no-quest"`, com o
 * estado em `data-estado`: carregando, vazio, fora, rodada, fim). Na rodada, o topo traz a conta
 * "N / total" (`.qr-conta`) e o cartão mostra a palavra em `.termo`. O formato do exercício vem do
 * "Tipo de cartão" das opções (padrão: Lembrar — "Mostrar resposta" e as notas do FSRS; Digitar pede a
 * TRADUÇÃO; Escolher dá alternativas); o teste trata os três para não depender da escolha.
 */

let sessionId = ''
let cartoes: CartaoNoServidor[] = []

test.beforeAll(async () => {
  ;({ sessionId, cartoes } = await semearSessaoComCartoes())
})

test.describe('Revisão FSRS', () => {
  test('avaliar um cartão avança o progresso e move o due no servidor', async ({ page }) => {
    test.slow()
    const antes = await listarCartoes()
    const porId = new Map(antes.map((c) => [c.id, c]))

    await abrirTela(page, '/cartoes/estudar')
    const tela = page.getByTestId('revisao-no-quest')
    await expect(tela).toHaveAttribute('data-estado', /^(rodada|fora)$/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

    /* `/cartoes/estudar` É o "Revisar agora": a rodada abre sozinha, ou a tela diz quantas há e o botão
       principal a começa. O teste reprova se nenhum dos dois. */
    if ((await tela.getAttribute('data-estado')) === 'fora') {
      await clicarRobusto(page, tela.locator('.q-vazio .q-ctl.pri'))
    }
    await expect(tela, 'a revisão deveria abrir numa rodada').toHaveAttribute('data-estado', 'rodada', {
      timeout: 10_000,
    })
    const conta = tela.locator('.qr-conta')
    await expect(conta, 'a rodada deveria abrir no cartão 1').toHaveText(/^1 \/ \d+$/)
    const totalNaFila = Number(((await conta.textContent()) ?? '').match(/\/ (\d+)/)?.[1] ?? 0)
    expect(totalNaFila, 'a fila deveria ter ao menos um cartão').toBeGreaterThanOrEqual(1)

    /* Qual cartão está na tela: a palavra aparece em `.termo` (e no corpo, em qualquer formato). Outras
       suítes da mesma execução (e o outro viewport) avaliam cartões deste servidor, então a fila NÃO é
       sempre "todos os cartões da fixture": é o que estiver vencido — ou novo — quando a tela abre. */
    const noBaralho = antes.filter((c) => c.inDeck == null || c.inDeck === 1)
    const cartao = tela.getByRole('region', { name: 'Cartão' })
    const termo = (
      await cartao
        .locator('.termo')
        .first()
        .innerText()
        .catch(() => '')
    ).trim()
    let alvo = noBaralho.find((c) => c.word === termo)
    if (!alvo) {
      for (const c of noBaralho) {
        const visivel = await cartao
          .getByText(new RegExp(`\\b${c.word}\\b`, 'i'))
          .first()
          .isVisible()
          .catch(() => false)
        if (visivel) {
          alvo = c
          break
        }
      }
    }
    expect(alvo, `o cartão aberto ("${termo}") deveria ser uma palavra do baralho do servidor`).toBeTruthy()

    const mostrar = cartao.getByRole('button', { name: /Mostrar resposta/i })
    const digitar = cartao.getByLabel('Digite a tradução')
    if (await mostrar.isVisible().catch(() => false)) {
      await clicarRobusto(page, mostrar)
      await clicarRobusto(
        page,
        cartao.getByRole('group', { name: 'Quão fácil foi lembrar' }).getByRole('button', { name: /^Bom/ }),
      )
    } else if (await digitar.isVisible().catch(() => false)) {
      await digitar.fill(alvo!.back ?? '')
      await clicarRobusto(page, cartao.getByRole('button', { name: /Verificar/ }))
      await clicarRobusto(page, page.getByRole('button', { name: /Avançar/ }))
    } else {
      // Múltipla escolha: a opção certa é a própria palavra.
      await clicarRobusto(page, cartao.getByRole('button', { name: alvo!.word, exact: true }))
      await clicarRobusto(page, page.getByRole('button', { name: /Avançar/ }))
    }

    if (totalNaFila > 1)
      await expect(conta, 'a conta deveria avançar para o cartão 2').toHaveText(/^2 \/ \d+$/, { timeout: 10_000 })
    else await expect(tela, 'fila de um: a rodada fecha').toHaveAttribute('data-estado', 'fim', { timeout: 10_000 })

    /* O SERVIDOR É A FONTE: o cartão avaliado tem de ter `reps` maior e `dueAt` no futuro. */
    await expect
      .poll(
        async () => {
          const depois = await listarCartoes()
          const avaliado = depois.find((c) => c.id === alvo!.id)
          const original = porId.get(alvo!.id)
          if (!avaliado || !original) return 'cartão sumiu'
          const repsSubiu = (avaliado.reps ?? 0) > (original.reps ?? 0)
          const dueMoveu = (avaliado.dueAt ?? 0) > (original.dueAt ?? 0) && (avaliado.dueAt ?? 0) > Date.now()
          return repsSubiu && dueMoveu
            ? 'ok'
            : `reps ${original.reps}->${avaliado.reps}, due ${original.dueAt}->${avaliado.dueAt}`
        },
        { timeout: 10_000, message: 'o servidor deveria ter reagendado o cartão avaliado' },
      )
      .toBe('ok')
    expect(sessionId).not.toBe('')
    expect(cartoes.length, 'a fixture deveria ter semeado os cartões').toBeGreaterThan(0)
  })
})
