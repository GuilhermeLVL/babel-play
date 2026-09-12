import { expect, test } from '@playwright/test'

import { clicarRobusto } from './_helpers'

/** O item de navegação, seja ele um link ou um botão, em qualquer das redações por perfil. */
const porNome = (page: import('@playwright/test').Page, nome: RegExp) =>
  page.getByRole('link', { name: nome }).or(page.getByRole('button', { name: nome }))

/**
 * Fumaça: só o que existe hoje, comprovado de verdade (sem login — `npm run dev:local` desliga
 * `VITE_AUTH_REQUIRED`).
 *
 * OS RÓTULOS DEPENDEM DO PERFIL PADRÃO, e ele mudou. Vêm de `src/components/shell/navItems.ts`,
 * onde cada item tem uma redação por perfil: `hub` é "Página Inicial" em sênior e "Início" nos
 * outros dois; `play` é "Praticar" em sênior e "Jogar" nos outros. Este arquivo fixava os rótulos
 * do SÊNIOR porque era ele o padrão da primeira visita — em 12/09 o padrão virou `pro`
 * (spec `leitura-padrao`), e os dois testes passaram a procurar texto que não existe no DOM.
 *
 * A LIÇÃO, e o motivo de a correção ser esta: um teste de fumaça não deve saber qual perfil é o
 * padrão. Ele aceita QUALQUER uma das redações do item — o que ele trava é "a navegação principal
 * aparece e leva à tela", não "o app abre em sênior". Quem trava o padrão é
 * `tests/perfilSeguro.test.ts`, num teste dedicado, que é onde essa decisão deve quebrar.
 */

test('a casca do app carrega e a navegação principal aparece', async ({ page }) => {
  await page.goto('/')

  // A navegação real (nav/rail) expõe os itens como links/botões com role de navegação.
  await expect(porNome(page, /^(Início|Página Inicial)$/)).toBeVisible()
  await expect(porNome(page, /^(Jogar|Praticar)$/)).toBeVisible()
})

test('a navegação leva até a tela de jogos (Praticar) e ela renderiza', async ({ page }) => {
  await page.goto('/')

  const praticar = porNome(page, /^(Jogar|Praticar)$/)
  /* Numa conta que acabou de nascer (o caso do runner da CI), a primeira visita abre o diálogo
     de conquista por cima da navegação e o clique cru fica 30 s esperando o overlay sumir.
     `clicarRobusto` fecha as sobreposições e tenta de novo — o mesmo laço das outras suítes. */
  await clicarRobusto(page, praticar)

  // Prova de renderização: a URL espelha o estado (`src/lib/rotas.ts`) — a view `play` publica
  // `/jogar`, não `/play` — e algo do conteúdo da tela aparece.
  await expect(page).toHaveURL(/\/jogar/)
  await expect(page.getByRole('main')).toBeVisible()
})
