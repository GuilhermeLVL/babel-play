import { test, expect } from '@playwright/test';
import { clicarRobusto, fecharSobreposicoes } from './_helpers';

/**
 * O SELETOR DE IDIOMA DA INTERFACE, de ponta a ponta (auditoria de 2026-09-07, achado A38).
 *
 * Até esta mudança a interface era derivada de "Meu idioma": para ler a tela em inglês era preciso
 * declarar que se fala inglês — e isso inverte a direção do microfone e da tradução de todo cartão
 * fichado. O eixo virou escolha própria, e a lista oferecida sai da COBERTURA MEDIDA de cada
 * catálogo (`src/data/i18n/cobertura.json`), não de uma constante: `es` tinha 20 de 705 chaves e
 * era oferecido como se estivesse pronto.
 *
 * A cadeia que este teste percorre é a que nenhum teste unitário cobre inteira: manifesto de
 * cobertura → `IDIOMAS_DA_INTERFACE` → `LangPicker somente={...}` → tela de Ajustes.
 */
test.describe('Idioma da interface', () => {
  test('o seletor existe, não mexe nos outros eixos e só oferece idioma com tradução pronta', async ({ page }) => {
    await page.goto('/ajustes');
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);

    // Os três eixos convivem na mesma seção, com nomes que não se confundem.
    const gatilho = page.getByRole('combobox', { name: 'Idioma da interface' });
    await expect(gatilho, 'o terceiro eixo precisa ter seletor próprio').toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('combobox', { name: 'Idioma que estou aprendendo' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Meu idioma' })).toBeVisible();

    /* `clicarRobusto` e nao `click()`: o diálogo de recompensa entra DEPOIS do primeiro `main`
       visível (as métricas carregam, as conquistas são avaliadas, a fila anima uma por vez), então
       fechar as sobreposições antes não basta — quando o crédito de conquista passou a funcionar
       de verdade, este clique começou a ser interceptado por um overlay que ainda não existia no
       momento em que o teste o procurou. */
    await clicarRobusto(page, gatilho);
    const lista = page.getByRole('listbox');
    await expect(lista).toBeVisible();

    /* A LISTA É CURTA DE PROPÓSITO. O seletor de idioma-alvo oferece 32 idiomas; este oferece só
       aqueles cujo catálogo passou do piso de cobertura. Um idioma a mais aqui é a promessa de uma
       tela traduzida que não existe. */
    const opcoes = await lista.getByRole('option').allInnerTexts();
    expect(opcoes.length, `esperava uma lista curta, veio ${opcoes.length}`).toBeLessThan(6);
    const juntas = opcoes.join(' ').toLowerCase();
    expect(juntas).toContain('português');
    expect(juntas).toContain('english');
    // `es` está no repositório com 3% traduzido: existe para traduzir, não para oferecer.
    expect(juntas).not.toContain('español');
  });

  test('a explicação diz o que ficou de fora, em vez de fingir que a lista é o produto inteiro', async ({ page }) => {
    await page.goto('/ajustes');
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);

    await expect(
      page.getByText(/Traduções em andamento, ainda fora da lista/i),
      'um seletor de dois itens sem explicação parece o catálogo inteiro do produto',
    ).toBeVisible({ timeout: 10_000 });
  });
});
