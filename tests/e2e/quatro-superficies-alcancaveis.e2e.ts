import { expect,test } from '@playwright/test';

import { clicarRobusto,fecharSobreposicoes } from './_helpers';

/**
 * AS QUATRO SUPERFÍCIES TÊM PORTA PRÓPRIA, E A PORTA ESTÁ NA BARRA DE CIMA.
 *
 * A auditoria da branch de gamificação (`openspec/audits/2026-09-08-gamificacao.md`) mediu o
 * defeito que este arquivo existe para impedir: o modo padrão daquela tela — o único alcançável,
 * porque a constante que o escolhia nunca era trocada — tinha DUAS abas, "Vestiário" e "Relíquias
 * do Cofre". O Passe e a Loja não tinham porta nenhuma. Não é uma arrumação diferente das mesmas
 * telas: é a perda da única superfície onde Seeds e Créditos são gastos.
 *
 * A onda 2 comparou as duas organizações em tela e ficou com as quatro portas (o porquê está no
 * comentário da barra, em `Loja.tsx`). Este teste prende as duas metades dessa decisão: que as
 * quatro abrem, e que cada uma tem a SUA aba — uma superfície escondida atrás de uma sub-aba
 * passaria no primeiro teste e falharia no terceiro, que é exatamente a diferença que a decisão
 * pesou.
 */
const SUPERFICIES = [
  { url: '/loja/meu-visual', aba: /^Meu visual · \d+$/, marca: /Equipado agora/i },
  { url: '/loja/itens', aba: /^Loja · \d+$/, marca: /Seeds/ },
  { url: '/loja/passe', aba: /^Passe$/, marca: /Temporada 1|Trilha/ },
  { url: '/loja/desafios', aba: /^Desafios · \d+$/, marca: /Como ganhar Seeds e XP/i },
];

test.describe('As quatro superfícies de Personalizar', () => {
  test('cada URL abre a sua superfície', async ({ page }) => {
    test.slow();
    for (const s of SUPERFICIES) {
      await page.goto(s.url);
      await expect(page.getByRole('main')).toBeVisible();
      await fecharSobreposicoes(page);
      await expect(
        page.getByText(s.marca).first(),
        `${s.url} não mostrou o conteúdo da sua superfície`,
      ).toBeVisible();
      /* E a URL sobrevive à navegação: um link salvo tem de voltar ao mesmo lugar. */
      await expect(page).toHaveURL(new RegExp(`${s.url.replace('/', '\\/')}$`));
    }
  });

  test('cada superfície tem a sua própria aba na barra de cima', async ({ page }) => {
    test.slow();
    await page.goto('/loja/meu-visual');
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);
    for (const s of SUPERFICIES) {
      await expect(
        page.getByRole('tab', { name: s.aba }),
        `"${s.url}" perdeu a porta própria — voltou a morar atrás de outra aba`,
      ).toBeVisible();
    }
  });

  /* A ORDEM É A DECISÃO. Ela lê "uso · compra · ganho · ganho": o padrão é a primeira aba, e as
     duas superfícies de recompensa ficam vizinhas. Foi o que os três pilares da branch acertaram,
     trazido sem o custo de esconder uma delas. */
  test('a ordem agrupa por verbo, com o padrão na frente', async ({ page }) => {
    await page.goto('/loja/meu-visual');
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);
    /* `allTextContents()` NÃO espera: ele lê o DOM do instante e devolve `[]` se as abas ainda
       não renderizaram. Esperar uma delas primeiro é o que torna a leitura determinística. */
    await expect(page.getByRole('tab', { name: /^Desafios · \d+$/ })).toBeVisible();
    const rotulos = await page.getByRole('tab').allTextContents();
    const daTela = rotulos.filter((r) => /Meu visual|^Loja|^Passe|Desafios/.test(r));
    expect(daTela.map((r) => r.replace(/ · \d+$/, '').trim())).toEqual([
      'Meu visual', 'Loja', 'Passe', 'Desafios',
    ]);
  });

  test('dá para ir de uma à outra sem sair da tela', async ({ page }) => {
    test.slow();
    await page.goto('/loja/meu-visual');
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);

    await clicarRobusto(page, page.getByRole('tab', { name: /^Passe$/ }));
    await expect(page).toHaveURL(/\/loja\/passe$/);

    await clicarRobusto(page, page.getByRole('tab', { name: /^Desafios · \d+$/ }));
    await expect(page).toHaveURL(/\/loja\/desafios$/);

    await clicarRobusto(page, page.getByRole('tab', { name: /^Loja · \d+$/ }));
    await expect(page).toHaveURL(/\/loja\/itens$/);
  });
});
