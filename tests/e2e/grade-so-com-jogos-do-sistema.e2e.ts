import { test, expect } from '@playwright/test';
import { irParaPraticar } from './_helpers';

/**
 * A GRADE SÓ MOSTRA O QUE O SISTEMA GARANTE (auditoria de 2026-09-07, achado A02).
 *
 * Nove jogos "culturais" ocupavam metade da grade de `/jogar` com o selo "100% Funcional" e não
 * passavam por sistema nenhum: a rodada não nascia em `montarRodada`, o `RoundReport` era
 * descartado por um `onFinish` sem argumentos, e o banco real não tinha uma única rodada deles
 * registrada. Meia hora de Karuta não virava um item de XP, um cartão revisado ou um recorde.
 *
 * Eles saíram da grade até entrarem no sistema (a decisão e o contrato de volta estão em
 * `openspec/changes/jogos-culturais-dentro-do-sistema/design.md`). Este teste é a catraca: quem
 * religar um deles à tela sem passar pelo pipeline vê o gate vermelho, não um card novo em
 * produção.
 */
const CULTURAIS = [
  'Karuta', 'Koffer', 'Choseong', 'Taboo', 'Shiritori',
  'Cadavre', 'Bao', 'Tense Tennis', 'Vitendawili',
];

test.describe('Grade de jogos', () => {
  test('não anuncia jogo que não registra progresso', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);

    const corpo = page.getByRole('main');
    await expect(corpo).toBeVisible();

    // O selo era a afirmação falsa mais direta da tela.
    await expect(page.getByText('100% Funcional')).toHaveCount(0);

    // A aba que existia só para eles.
    await expect(page.getByRole('tab', { name: /Jogos do Mundo/i })).toHaveCount(0);

    for (const nome of CULTURAIS) {
      await expect(
        corpo.getByText(nome, { exact: false }),
        `"${nome}" voltou à grade sem passar por montarRodada/aoTerminar`,
      ).toHaveCount(0);
    }
  });

  test('as categorias que sobraram são as dos jogos que registram', async ({ page }) => {
    await irParaPraticar(page);
    await expect(page.getByRole('tab', { name: 'Todos' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Clássicos' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Favoritos' })).toBeVisible();
  });
});
