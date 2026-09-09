import { expect,test } from '@playwright/test';

import { clicarRobusto,fecharSobreposicoes } from './_helpers';

/**
 * "COMO EU CONSIGO ISTO?" — a pergunta que o Inventário passou a responder (onda 1 de 08/09).
 *
 * O acervo mostrava só o que já era seu. Uma peça de conquista, ou de nível alto, não aparecia em
 * tela NENHUMA antes de ser obtida: a Loja lista o que se compra, e conquista e nível não se
 * compram. Agora a grade tem os dois estados e a peça trancada explica a rota.
 *
 * Este teste vai pelo caminho do usuário — abre `/loja/meu-visual`, liga o catálogo completo,
 * escolhe uma peça trancada — porque a parte que quebra num refactor é justamente a ligação: o
 * `verTudo` que deixa de filtrar, o cartão que some, o botão que não chega ao destino.
 */
test.describe('Rota de aquisição no Inventário', () => {
  test('o catálogo completo mostra o que ainda não é meu, com cadeado', async ({ page }) => {
    test.slow();
    await page.goto('/loja/meu-visual');
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);

    const meuAcervo = page.getByRole('button', { name: /^Meu acervo \(\d+\)$/ });
    const tudoQueExiste = page.getByRole('button', { name: /^Tudo que existe \(\d+\)$/ });
    await expect(meuAcervo).toBeVisible();
    await expect(tudoQueExiste).toBeVisible();

    /* O padrão é o acervo próprio: a pergunta mais frequente nesta tela continua sendo "o que eu
       tenho". Se o padrão inverter, a tela de Personalizar abre cheia de cadeado. */
    await expect(meuAcervo).toHaveAttribute('aria-pressed', 'true');

    const quantosMeus = Number((await meuAcervo.textContent())!.match(/\((\d+)\)/)![1]);
    const quantosExistem = Number((await tudoQueExiste.textContent())!.match(/\((\d+)\)/)![1]);
    expect(quantosExistem, 'o catálogo tem de ser maior que o acervo de quem começa').toBeGreaterThan(quantosMeus);

    await clicarRobusto(page, tudoQueExiste);
    await expect(page.getByText('Clique numa peça trancada para ver como se consegue.')).toBeVisible();
  });

  test('a peça trancada diz o canal e leva à tela que entrega', async ({ page }) => {
    test.slow();
    await page.goto('/loja/meu-visual');
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);
    await clicarRobusto(page, page.getByRole('button', { name: /^Tudo que existe \(\d+\)$/ }));

    // A grade ordena os meus primeiro, então a última peça é sempre uma trancada.
    const trancada = page.locator('button[title*="trancado; clique para ver como se consegue"]').last();
    await expect(trancada).toBeVisible();
    await clicarRobusto(page, trancada);

    // O painel lateral passa a mostrar o selo e o canal por onde a peça chega.
    await expect(page.getByText('Trancado', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Só por conquista|Prateleira paga|Nível ou atalho|Recompensa de estudo/).first(),
    ).toBeVisible();

    /* O BOTÃO TEM DE CHEGAR. Um CTA que não navega é pior do que nenhum: ele gasta a intenção da
       pessoa e devolve a mesma tela. */
    const ir = page.getByRole('button', { name: /^(Ver em Conquistas|Ver na Loja|Ver no Passe)$/ });
    await expect(ir).toBeVisible();
    await clicarRobusto(page, ir);
    await expect(page).toHaveURL(/\/loja\/(desafios|itens|passe)$/);
  });

  test('o cabeçalho de temporada escreve o nome da moeda e o custo do nível', async ({ page }) => {
    await page.goto('/loja/passe');
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);

    /* O RÓTULO ESCRITO é o conserto: até aqui o que dizia qual moeda era qual era o `title`, que
       exige mouse parado e não existe no toque. */
    await expect(page.getByText('Seeds', { exact: true }).first()).toBeVisible();

    /* A unidade na conta que falta. "faltam 1364" podia ser XP, Seeds ou palavras. */
    await expect(page.getByText(/faltam \d+ XP/)).toBeVisible();

    /* O GOAL-GRADIENT É CONDICIONAL, e o teste respeita a condição: quem já passou da última
       década do catálogo não tem próxima recompensa, e a barra não pode inventar uma. A fixture
       deste e2e está no nível 15, acima do topo da curva — então aqui a ausência é o esperado, e
       a presença da linha para um nível abaixo do topo fica coberta por `progressao.test.ts`. */
    const linha = page.getByText(/peças? de graça no nv\. \d+/);
    /* O nível sai do rótulo mono "nv. N" da barra (`CabecalhoDeTemporada.tsx`), que é único e
       explícito. O primeiro número solto da página não é o nível: numa conta recém-nascida (o
       runner da CI) ele era outro contador, o teste lia ">= 10" e cobrava a ausência da linha
       num nível 1 — que a tem, e deve ter. */
    const rotulo = (await page.getByText(/^nv\. \d+$/).first().textContent()) ?? 'nv. 1';
    const nivel = Number(rotulo.replace(/\D/g, '')) || 1;
    if (nivel < 10) await expect(linha).toBeVisible();
    else await expect(linha).toHaveCount(0);
  });
});
