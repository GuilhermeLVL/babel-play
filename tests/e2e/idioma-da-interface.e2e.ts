import { expect, test } from '@playwright/test'

import { abrirTela, clicarRobusto } from './_helpers'

/**
 * O SELETOR DE IDIOMA DA INTERFACE, de ponta a ponta (auditoria de 2026-09-07, achado A38).
 *
 * Até aquela mudança a interface era derivada de "Meu idioma": para ler a tela em inglês era preciso
 * declarar que se fala inglês — e isso inverte a direção do microfone e da tradução de todo cartão
 * fichado. O eixo virou escolha própria, e a lista oferecida sai da COBERTURA MEDIDA de cada
 * catálogo (`src/data/i18n/cobertura.json`), não de uma constante: `es` tinha 20 de 705 chaves e
 * era oferecido como se estivesse pronto.
 *
 * A cadeia que este teste percorre é a que nenhum teste unitário cobre inteira: manifesto de
 * cobertura → `IDIOMAS_DA_INTERFACE` → `LangPicker somente={...}` → tela de Ajustes.
 *
 * NO DESENHO NOVO (09/10/2026) cada eixo é um botão (`.q-seletor`, "Eixo: valor escolhido") que abre
 * um diálogo com a busca e a lista (`listbox`) — não há mais a caixa de combinação de antes. Os três
 * moram na aba "Idiomas" dos Ajustes, a que abre primeiro.
 */
test.describe('Idioma da interface', () => {
  test('o seletor existe, não mexe nos outros eixos e só oferece idioma com tradução pronta', async ({ page }) => {
    await abrirTela(page, '/ajustes')

    // Os três eixos convivem na mesma seção, com nomes que não se confundem.
    const gatilho = page.getByRole('button', { name: /^Idioma da interface: / })
    await expect(gatilho, 'o terceiro eixo precisa ter seletor próprio').toBeVisible({ timeout: 10_000 })
    const aprendendo = page.getByRole('button', { name: /^Idioma que estou aprendendo: / })
    const meu = page.getByRole('button', { name: /^Meu idioma: / })
    await expect(aprendendo).toBeVisible()
    await expect(meu).toBeVisible()
    const antes = [await aprendendo.getAttribute('aria-label'), await meu.getAttribute('aria-label')]

    /* `clicarRobusto` e não `click()`: a recompensa entra DEPOIS do primeiro `main` visível (as
       métricas carregam, as conquistas são avaliadas, a fila anima uma por vez), então fechar as
       sobreposições antes não basta. */
    await clicarRobusto(page, gatilho)
    const dialogo = page.getByRole('dialog', { name: 'Idioma da interface' })
    await expect(dialogo).toBeVisible()
    const lista = dialogo.getByRole('listbox')
    await expect(lista).toBeVisible()

    /* A LISTA É CURTA DE PROPÓSITO. O seletor de idioma-alvo oferece 32 idiomas; este oferece só
       aqueles cujo catálogo passou do piso de cobertura. Um idioma a mais aqui é a promessa de uma
       tela traduzida que não existe. */
    const opcoes = await lista.getByRole('option').allInnerTexts()
    expect(opcoes.length, `esperava uma lista curta, veio ${opcoes.length}`).toBeLessThan(6)
    const juntas = opcoes.join(' ').toLowerCase()
    expect(juntas).toContain('português')
    expect(juntas).toContain('english')
    // `es` está no repositório com tradução parcial: existe para traduzir, não para oferecer.
    expect(juntas).not.toContain('español')

    // Abrir e fechar a lista não mexe nos outros dois eixos.
    await page.keyboard.press('Escape')
    await expect(dialogo).toBeHidden()
    expect([await aprendendo.getAttribute('aria-label'), await meu.getAttribute('aria-label')]).toEqual(antes)
  })

  test('a explicação diz o que ficou de fora, em vez de fingir que a lista é o produto inteiro', async ({ page }) => {
    await abrirTela(page, '/ajustes')

    await expect(
      page.getByText(/Traduções em andamento, ainda fora da lista/i),
      'um seletor de dois itens sem explicação parece o catálogo inteiro do produto',
    ).toBeVisible({ timeout: 10_000 })
  })
})
