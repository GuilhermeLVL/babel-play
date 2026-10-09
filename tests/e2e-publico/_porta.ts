/**
 * O CAMINHO ATÉ A PORTA DE LOGIN NO DESENHO NOVO — o que os e2e do modo público dividem.
 *
 * Sem conta, o app abre direto (soft gate D10). A casca é o trilho de ícones (`nav.q-trilho`), e a
 * entrada para o login fica no painel "Mais" (`.q-mais`), no bloco da conta
 * (`data-testid="conta-no-quest"`, `src/components/shell/TrilhoDoQuest.tsx`): quem está sem conta vê
 * ali "Entrar ou criar conta". O menu da conta de antes ("Sua conta") não existe mais.
 */
import { expect, type Page } from '@playwright/test'

/**
 * Abre o "Mais" pelo trilho e toca em "Entrar ou criar conta". `frase` traduz os nomes (o
 * pseudo-idioma do `login-pseudo`); sem ela, o português.
 */
export async function abrirPortaDeLogin(page: Page, frase: (pt: string) => string = (pt) => pt) {
  await page.locator('nav.q-trilho .q-mais-botao').click({ timeout: 60_000 })
  const mais = page.getByRole('dialog', { name: frase('Mais destinos') })
  await expect(mais).toBeVisible()
  await mais
    .getByTestId('conta-no-quest')
    .getByRole('button', { name: frase('Entrar ou criar conta') })
    .click()
  await expect(page.getByTestId('login-do-quest')).toBeVisible()
  await expect(page.getByRole('heading', { name: frase('Entrar'), exact: true })).toBeVisible()
}
