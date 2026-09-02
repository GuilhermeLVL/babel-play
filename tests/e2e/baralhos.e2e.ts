import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Baralhos do Anki: cobre o caminho novo (ingestão de baralhos) além da casca já coberta por
 * `fumaca.e2e.ts`. Perfil padrão é sênior (ver `fumaca.e2e.ts`), sem login.
 *
 * O que é SEMPRE verificável (não depende de dado): o botão "Anki" existe no lobby, abre a tela
 * de importação, e "Voltar aos jogos" retorna. O que depende de já existir baralho importado
 * ("Baralhos", "Baralhos do Anki", "Jogar só com este") é condicional — quando o ambiente não tem
 * baralho, o teste registra `test.skip()` com a razão em vez de fingir passar.
 */

/**
 * Fecha diálogos que podem aparecer sobrepostos: o de recompensa/conquista (`RecompensaDesbloqueada`,
 * título "Conquista feita" ou "Nível N!", botão com `aria-label="Fechar"`) entra ANIMADO, então
 * pode não estar visível ainda no instante do `goto` — por isso isso é chamado mais de uma vez, não
 * só logo após a navegação.
 */
async function fecharSobreposicoes(page: Page) {
  const dialogoRecompensa = page.locator('div[role="dialog"][aria-labelledby="recompensa-titulo"]');
  const fecharRecompensa = dialogoRecompensa.getByRole('button', { name: 'Fechar' });
  for (let i = 0; i < 40; i++) {
    if (await fecharRecompensa.isVisible().catch(() => false)) {
      await fecharRecompensa.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(100);
    } else {
      break;
    }
  }

  // O modal "O que você vai praticar" pode ou não abrir (só abre quando há mais de uma fonte e
  // nenhuma preferência salva ainda) — trata os dois casos sem falhar.
  const fecharSemMudar = page.getByRole('button', { name: 'Fechar sem mudar nada' });
  if (await fecharSemMudar.isVisible().catch(() => false)) {
    await fecharSemMudar.click();
  }
}

/**
 * Clica robusto a diálogos de recompensa que continuam surgindo (fila de conquistas, uma por
 * vez, cada uma animando com atraso) — tenta clicar, e se um overlay interceptar o clique, fecha
 * overlays e tenta de novo, em vez de deixar o Playwright martelar o mesmo clique por 30s.
 */
async function clicarRobusto(page: Page, locator: Locator) {
  for (let i = 0; i < 10; i++) {
    try {
      await locator.click({ timeout: 3000 });
      return;
    } catch {
      await fecharSobreposicoes(page);
      await page.waitForTimeout(200);
    }
  }
  await locator.click();
}

async function irParaPraticar(page: Page) {
  await page.goto('/jogar');
  await expect(page.getByRole('main')).toBeVisible();

  // Tanto a recompensa quanto "O que você vai praticar" podem animar/entrar em momentos
  // diferentes do primeiro `main` visível — repete até a faixa do lobby (botão "Anki") aparecer
  // ou esgotar as tentativas.
  const botaoAnki = page.getByRole('button', { name: 'Anki', exact: true });
  for (let i = 0; i < 6; i++) {
    await fecharSobreposicoes(page);
    if (await botaoAnki.isVisible().catch(() => false)) break;
    await page.waitForTimeout(300);
  }
}

test.describe('Anki: importar', () => {
  test('o botão Anki abre a importação, e "Voltar aos jogos" retorna ao lobby', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);

    const botaoAnki = page.getByRole('button', { name: 'Anki', exact: true });
    await expect(botaoAnki).toBeVisible();
    await clicarRobusto(page, botaoAnki);

    await expect(page.getByRole('button', { name: 'Escolher arquivo' })).toBeVisible();

    await clicarRobusto(page, page.getByRole('button', { name: 'Voltar aos jogos' }));
    await expect(page.getByRole('button', { name: 'Anki', exact: true })).toBeVisible();
  });
});

test.describe('Baralhos do Anki (condicional a haver baralho já importado)', () => {
  test('a tela "Baralhos do Anki" abre e mostra o cabeçalho e o estado do baralho', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);

    const botaoBaralhos = page.getByRole('button', { name: 'Baralhos' });
    const existeBotaoBaralhos = await botaoBaralhos.isVisible().catch(() => false);

    test.skip(
      !existeBotaoBaralhos,
      'Não há baralho Anki importado neste ambiente — o botão "Baralhos" só aparece quando existe ao menos um baralho, então este caso não é alcançável sem criar dado (o que este teste não faz).',
    );

    await clicarRobusto(page, botaoBaralhos);

    await expect(
      page.getByText('O que já foi trazido de fora, e quanto de cada um está de fato jogando com você.'),
    ).toBeVisible();

    const jogarSoComEste = page.getByRole('button', { name: 'Jogar só com este' });
    const saldoAtivadas = page.getByText(/\d+\s+de\s+\d+\s+ativadas/);
    const temRecorte = await jogarSoComEste.isVisible().catch(() => false);
    const temSaldo = (await saldoAtivadas.count().catch(() => 0)) > 0;
    expect(temRecorte || temSaldo, 'esperava o botão "Jogar só com este" ou o saldo "N de M ativadas" no cartão do baralho').toBe(true);
  });

  test('"Jogar só com este" volta ao lobby com o nome do baralho na faixa', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);

    const botaoBaralhos = page.getByRole('button', { name: 'Baralhos' });
    const existeBotaoBaralhos = await botaoBaralhos.isVisible().catch(() => false);

    test.skip(
      !existeBotaoBaralhos,
      'Não há baralho Anki importado neste ambiente — sem o botão "Baralhos" não há como chegar em "Jogar só com este" sem criar dado.',
    );

    await clicarRobusto(page, botaoBaralhos);
    await expect(page.getByText('Baralhos do Anki')).toBeVisible();

    const jogarSoComEste = page.getByRole('button', { name: 'Jogar só com este' });
    const existeRecorte = await jogarSoComEste.isVisible().catch(() => false);

    test.skip(
      !existeRecorte,
      'O baralho encontrado não expõe "Jogar só com este" nesta execução (ex.: nenhuma palavra ativada ainda) — nada a recortar sem criar dado.',
    );

    // Pega o nome do baralho a partir do cartão antes de clicar, para conferir depois na faixa.
    const cartao = page.locator('.card-panel').filter({ has: jogarSoComEste }).first();
    const nomeBaralho = (await cartao.locator('p').first().textContent().catch(() => null))?.trim();

    await clicarRobusto(page, jogarSoComEste);

    await expect(page.getByRole('button', { name: 'Anki', exact: true })).toBeVisible();

    if (nomeBaralho) {
      await expect(page.getByText(nomeBaralho, { exact: false }).first()).toBeVisible();
    } else {
      // Se não deu para ler o nome do cartão, ao menos confirma que a porta "Baralhos" virou o
      // chip do recorte (deixou de mostrar o rótulo genérico "Baralhos").
      await expect(page.getByRole('button', { name: 'Baralhos', exact: true })).not.toBeVisible();
    }
  });
});
