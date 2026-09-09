import { test, expect } from '@playwright/test';
import { fecharSobreposicoes, clicarRobusto } from './_helpers';
import { semearSessaoComCartoes, listarCartoes, type CartaoNoServidor } from './_fixtures';

/**
 * A REVISAO ESPACADA, de ponta a ponta: abrir `/revisar`, avaliar um cartao e ver o agendamento
 * mudar no SERVIDOR.
 *
 * O que o teste prende e o caminho que a auditoria de 2026-09-07 corrigiu (achado A53): a nota
 * dada na tela vai por `POST /api/vocab/:id/review`, o FSRS-5 roda no servidor e o `dueAt` do
 * cartao sai do "agora" para o futuro. Antes existia um FSRS aproximado no cliente que mostrava um
 * agendamento que nao era o do banco.
 *
 * O formato do exercicio (flashcard, digitacao ou multipla escolha) e decidido por
 * `formatForCard` a partir do estado do cartao; o teste trata os tres para nao depender da regra.
 */

let sessionId = '';
let cartoes: CartaoNoServidor[] = [];

test.beforeAll(async () => {
  ({ sessionId, cartoes } = await semearSessaoComCartoes());
});

test.describe('Revisao FSRS', () => {
  test('avaliar um cartao avanca o progresso e move o due no servidor', async ({ page }) => {
    test.slow();
    const antes = await listarCartoes();
    const porId = new Map(antes.map((c) => [c.id, c]));

    await page.goto('/revisar');
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);

    /* A tela abre na gravacao mais recente (`recordings[0]`), que e a da fixture. */
    /* `.first()`: o titulo aparece duas vezes (cabecalho da sessao e cabecalho do treino). */
    await expect(page.getByRole('heading', { name: 'Sessao e2e de revisao' }).first()).toBeVisible({ timeout: 15_000 });

    /* Duas portas para a mesma fila: o painel "Agora" (so com cartao vencido) e a linha do
       exercicio. Cartao recem-criado vence na hora, entao a primeira deveria existir; a segunda
       e o fallback honesto se o relogio do servidor discordar. */
    const comecar = page.getByRole('button', { name: /Começar a repetir|Revisar agora|Treinar agora/ });
    const linhaDoExercicio = page.getByRole('button', { name: /Repetir o que você salvou|Revisão espaçada|Treino de memória/ });
    if (await comecar.isVisible().catch(() => false)) await clicarRobusto(page, comecar);
    else await clicarRobusto(page, linhaDoExercicio);

    const progresso = page.getByText(/^Cartão \d+ de \d+$/);
    await expect(progresso, 'a sessao de estudo deveria abrir no cartao 1').toBeVisible({ timeout: 10_000 });
    const textoAntes = (await progresso.textContent()) ?? '';
    const totalNaFila = Number(textoAntes.match(/de (\d+)/)?.[1] ?? 0);
    expect(totalNaFila, 'a fila deveria ter os cartoes da sessao').toBeGreaterThanOrEqual(cartoes.length);
    expect(textoAntes).toMatch(/^Cartão 1 de/);

    /* Qual cartao esta na tela: a palavra aparece no corpo em qualquer formato. */
    const corpo = page.getByRole('main');
    let alvo: CartaoNoServidor | undefined;
    for (const c of cartoes) {
      if (await corpo.getByText(new RegExp(`\\b${c.word}\\b`, 'i')).first().isVisible().catch(() => false)) { alvo = c; break; }
    }
    expect(alvo, 'nenhuma palavra da sessao esta no cartao aberto').toBeTruthy();

    const mostrar = page.getByRole('button', { name: 'Mostrar Resposta' });
    const digitar = page.getByPlaceholder('Digite a palavra...');
    if (await mostrar.isVisible().catch(() => false)) {
      await clicarRobusto(page, mostrar);
      await clicarRobusto(page, page.getByRole('button', { name: /^Bom/ }));
    } else if (await digitar.isVisible().catch(() => false)) {
      await digitar.fill(alvo!.word);
      await digitar.press('Enter');
      await clicarRobusto(page, page.getByRole('button', { name: 'Avançar' }));
    } else {
      // Multipla escolha: a opcao certa e a propria palavra.
      await clicarRobusto(page, corpo.getByRole('button', { name: alvo!.word, exact: true }));
      await clicarRobusto(page, page.getByRole('button', { name: 'Avançar' }));
    }

    await expect(progresso, 'o indicador deveria avancar para o cartao 2').toHaveText(/^Cartão 2 de/, { timeout: 10_000 });

    /* O SERVIDOR E A FONTE: o cartao avaliado tem de ter `reps` maior e `dueAt` no futuro. */
    await expect.poll(async () => {
      const depois = await listarCartoes();
      const avaliado = depois.find((c) => c.id === alvo!.id);
      const original = porId.get(alvo!.id);
      if (!avaliado || !original) return 'cartao sumiu';
      const repsSubiu = (avaliado.reps ?? 0) > (original.reps ?? 0);
      const dueMoveu = (avaliado.dueAt ?? 0) > (original.dueAt ?? 0) && (avaliado.dueAt ?? 0) > Date.now();
      return repsSubiu && dueMoveu ? 'ok' : `reps ${original.reps}->${avaliado.reps}, due ${original.dueAt}->${avaliado.dueAt}`;
    }, { timeout: 10_000, message: 'o servidor deveria ter reagendado o cartao avaliado' }).toBe('ok');
    expect(sessionId).not.toBe('');
  });
});
