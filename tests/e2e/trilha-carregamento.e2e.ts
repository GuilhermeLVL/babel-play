import { test, expect } from '@playwright/test';
import { irParaPraticar, clicarRobusto, abrirSeletor } from './_helpers';

/**
 * A trilha passa a carregar sob demanda. O modo de falha dessa mudança é SILENCIOSO: a contagem
 * pisca zero, ou um jogo anuncia "sem material" durante o carregamento — mensagem falsa, não só
 * feia. Este teste existe para que isso não passe despercebido.
 */
test.describe('Trilha carregada sob demanda', () => {
  test('a contagem do curso nunca passa por zero ao escolher a fonte', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);
    await abrirSeletor(page);

    const curso = page.getByRole('group', { name: 'de onde vêm' })
      .getByRole('button', { name: /Curso de palavras/ });
    await expect(curso).toBeVisible({ timeout: 15_000 });

    // A contagem já tem de estar certa ANTES de clicar: ela vem do índice, não do dado.
    const antes = (await curso.textContent() ?? '').replace(/\D/g, '');
    expect(Number(antes), 'o curso deve anunciar o tamanho antes de a trilha carregar').toBeGreaterThan(0);

    /* Amostra a linha de resumo enquanto a fonte troca. Se em algum quadro ela disser 0, o
       carregamento está vazando para a tela. */
    const zerou: string[] = [];
    const amostrar = setInterval(async () => {
      const t = await page.locator('body').innerText().catch(() => '');
      const m = t.match(/jogando com\s+([\d.]+)/i);
      if (m && Number(m[1].replace(/\./g, '')) === 0) zerou.push(m[1]);
    }, 120);

    await clicarRobusto(page, curso);
    await page.waitForTimeout(2500);
    clearInterval(amostrar);

    expect(zerou, 'a contagem passou por zero durante o carregamento').toHaveLength(0);
  });

  test('nenhum jogo anuncia "sem material" enquanto a trilha carrega', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);
    await abrirSeletor(page);

    const curso = page.getByRole('group', { name: 'de onde vêm' })
      .getByRole('button', { name: /Curso de palavras/ });
    await clicarRobusto(page, curso);

    // Logo depois do clique é a janela em que o dado ainda não chegou.
    await page.waitForTimeout(200);
    const durante = await page.locator('body').innerText();
    expect(durante).not.toContain('nenhuma palavra deste recorte serve');

    await page.waitForTimeout(2500);
    const grade = page.locator('#grade-de-jogos');
    await expect(grade).toBeVisible();
    expect((await grade.textContent() ?? '').length).toBeGreaterThan(0);
  });
});
