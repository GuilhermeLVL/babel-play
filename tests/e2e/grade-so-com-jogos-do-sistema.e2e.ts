import { expect,test } from '@playwright/test';

import { irParaPraticar } from './_helpers';

/**
 * A GRADE MOSTRA TODO JOGO QUE O SISTEMA CONHECE, E SO ELE.
 *
 * Em 07/09 os nove culturais sairam da grade porque nao passavam por sistema nenhum: a rodada nao
 * nascia em `montarRodada` e o `RoundReport` era descartado. Em 08/09 eles voltaram reescritos,
 * rodando sobre o baralho e reportando o proprio `gameId`. A catraca inverteu de lado: antes
 * provava que eles NAO estavam na tela; agora prova que estao, e que a grade nao perdeu ninguem.
 */
/* Termo que aparece no titulo do jogo nos TRES perfis (kids/pro/senior): o rotulo muda por
   perfil, entao procurar o nome proprio falharia dependendo de quem esta jogando. */
const CULTURAIS = [
  'Karuta', 'vogais', 'nis de palavras', 'mala', 'Bao',
  'Charada', 'Corrente de palavras', 'Frase maluca', 'proibida',
];

test.describe('Grade de jogos', () => {
  test('nao anuncia jogo que nao registra progresso', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);
    await expect(page.getByRole('main')).toBeVisible();
    // O selo era a afirmacao falsa mais direta da tela, e nao volta.
    await expect(page.getByText('100% Funcional')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Jogos do Mundo/i })).toHaveCount(0);
  });

  test('os nove culturais estao na grade', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);
    const corpo = page.getByRole('main');
    for (const nome of CULTURAIS) {
      await expect(
        corpo.getByText(nome, { exact: false }).first(),
        `"${nome}" nao aparece na grade`,
      ).toBeVisible();
    }
  });

  test('as categorias que sobraram sao as dos jogos que registram', async ({ page }) => {
    await irParaPraticar(page);
    await expect(page.getByRole('tab', { name: 'Todos' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Clássicos' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Favoritos' })).toBeVisible();
  });
});
