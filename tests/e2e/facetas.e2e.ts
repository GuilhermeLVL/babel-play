import { test, expect } from '@playwright/test';
import { irParaPraticar, clicarRobusto, apareceEmAte, baralhosNoServidor } from './_helpers';

/**
 * A fileira RECORTE do lobby `/jogar` (onda facetada): pílulas "Pedindo revisão"/"Nunca vistas",
 * a linha-resumo "N no recorte · [baralho ·] idioma", e a PERSISTÊNCIA do recorte por baralho
 * (chave `localStorage['babel.filtro_da_pratica']`) através de F5 — a capacidade nova; antes do
 * ajuste de hoje o chip do baralho evaporava num reload.
 *
 * O que é SEMPRE verificável (não depende de dado): a fileira RECORTE existe fora da aba Curso, as
 * pílulas alternam `aria-pressed` e gravam no localStorage, e a linha "no recorte" mostra um
 * número. O que depende de já existir baralho importado no servidor (mesmo gate honesto de
 * `baralhos.e2e.ts` — pergunta à API `/api/anki/decks`, nunca à ausência de um botão) é a
 * persistência do recorte por baralho através do F5 — condicional, com `test.skip()` dizendo o
 * motivo quando o ambiente não tem baralho.
 *
 * Estado limpo ao final de cada teste: outros testes e o dono da suíte de baralhos usam a mesma
 * base, então um `afterEach` zera `babel.filtro_da_pratica` e recarrega.
 */

const CHAVE_FILTRO = 'babel.filtro_da_pratica';

test.afterEach(async ({ page }) => {
  await page.evaluate((chave) => localStorage.removeItem(chave), CHAVE_FILTRO).catch(() => {});
  await page.reload().catch(() => {});
});

test.describe('Facetas do acervo: fileira RECORTE', () => {
  test('a fileira RECORTE existe no lobby, a pílula "Pedindo revisão" alterna aria-pressed e persiste, e "no recorte" mostra um número', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);

    // A fileira só aparece quando há mais de uma fonte oferecida (baralho + trilha, tipicamente),
    // e a trilha chega de uma chamada assíncrona — por isso o prazo maior aqui, não porque o
    // elemento seja instável.
    const grupoRecorte = page.getByRole('group', { name: 'Recortes do acervo desta rodada' });
    await expect(grupoRecorte, 'a fileira RECORTE deveria existir no lobby fora da aba Curso').toBeVisible({ timeout: 15_000 });

    const pilulaPedindoRevisao = grupoRecorte.getByRole('button', { name: 'Pedindo revisão' });
    await expect(pilulaPedindoRevisao).toBeVisible();

    // A pílula pode nascer desabilitada (sem material — motivo no `title`); só faz sentido testar
    // o clique quando ela está habilitada. Se estiver bloqueada, o teste registra por que em vez
    // de fingir que exercitou o toggle.
    const bloqueada = await pilulaPedindoRevisao.isDisabled();
    test.skip(
      bloqueada,
      `"Pedindo revisão" nasceu desabilitada neste ambiente (${await pilulaPedindoRevisao.getAttribute('title')}) — não há como exercitar o toggle sem dado.`,
    );

    // Estado inicial: desligada (o teste zera o localStorage antes de cada ida via afterEach do
    // teste anterior; na primeira execução da suíte parte do que o ambiente já tiver).
    const pressionadaAntes = (await pilulaPedindoRevisao.getAttribute('aria-pressed')) === 'true';

    // Liga (ou desliga, se já estava ligada por uma execução anterior) e confere o aria-pressed.
    await clicarRobusto(page, pilulaPedindoRevisao);
    await expect(pilulaPedindoRevisao).toHaveAttribute('aria-pressed', String(!pressionadaAntes));

    const filtroLigado = await page.evaluate((chave) => {
      const cru = localStorage.getItem(chave);
      return cru ? JSON.parse(cru) : null;
    }, CHAVE_FILTRO);
    expect(filtroLigado?.recorte?.pedindoRevisao, 'o toggle ligado deveria estar gravado em localStorage').toBe(!pressionadaAntes);

    // Desliga de volta e confere que o localStorage acompanha.
    await clicarRobusto(page, pilulaPedindoRevisao);
    await expect(pilulaPedindoRevisao).toHaveAttribute('aria-pressed', String(pressionadaAntes));

    const filtroDesligado = await page.evaluate((chave) => {
      const cru = localStorage.getItem(chave);
      return cru ? JSON.parse(cru) : null;
    }, CHAVE_FILTRO);
    expect(filtroDesligado?.recorte?.pedindoRevisao, 'o toggle desligado deveria acompanhar em localStorage').toBe(pressionadaAntes);

    // A linha-resumo "N no recorte" existe e mostra um número.
    const linhaResumo = page.getByText(/\d+\s+no recorte/);
    await expect(linhaResumo).toBeVisible();
  });

  test('o recorte por baralho persiste através de F5, e "Voltar a jogar com todo o acervo" limpa (condicional a haver baralho no servidor)', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);

    const acervo = await baralhosNoServidor(page);
    test.skip(
      acervo.quantos === 0,
      `Caso não alcançável sem criar dado (o que este teste não faz) — ${acervo.porque}`,
    );

    const botaoBaralhos = page.getByRole('button', { name: 'Baralhos' });
    await expect(botaoBaralhos, 'o servidor tem baralho, então a porta "Baralhos" deveria estar na faixa').toBeVisible({ timeout: 10_000 });
    await clicarRobusto(page, botaoBaralhos);

    await expect(
      page.getByText('O que já foi trazido de fora, e quanto de cada um está de fato jogando com você.'),
    ).toBeVisible();

    const jogarSoComEste = page.getByRole('button', { name: 'Jogar só com este' });
    const temRecorte = await apareceEmAte(jogarSoComEste);
    test.skip(
      !temRecorte,
      'Nenhum baralho do servidor tem palavra ativada, então não há o que recortar — caso não alcançável sem criar dado.',
    );

    const cartao = page.locator('.card-panel').filter({ has: jogarSoComEste }).first();
    const nomeBaralho = (await cartao.locator('p').first().textContent().catch(() => null))?.trim();
    test.skip(!nomeBaralho, 'Não deu para ler o nome do baralho no cartão para comparar depois — caso não alcançável sem dado legível.');

    await clicarRobusto(page, jogarSoComEste);
    await expect(page.getByRole('button', { name: 'Anki', exact: true })).toBeVisible();

    // O chip do nome do baralho e o resumo com ele visíveis ANTES do reload.
    await expect(page.getByRole('button', { name: nomeBaralho!, exact: false })).toBeVisible();
    const linhaResumoComBaralho = page.getByText(new RegExp(`\\d+\\s+no recorte.*${escapaRegex(nomeBaralho!)}`));
    await expect(linhaResumoComBaralho).toBeVisible();

    const filtroAntesDoReload = await page.evaluate((chave) => localStorage.getItem(chave), CHAVE_FILTRO);
    expect(filtroAntesDoReload, 'o recorte por baralho deveria estar gravado antes do F5').not.toBeNull();

    // A CAPACIDADE NOVA: um F5 mantém o chip do baralho e o nome no resumo — antes evaporava.
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();

    const chipDoBaralho = page.getByRole('button', { name: nomeBaralho!, exact: false });
    await expect(chipDoBaralho, 'o chip do baralho deveria sobreviver ao F5 (persistência nova)').toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(new RegExp(`\\d+\\s+no recorte.*${escapaRegex(nomeBaralho!)}`)),
      'o resumo "no recorte" deveria continuar mostrando o nome do baralho depois do F5',
    ).toBeVisible();

    // "Voltar a jogar com todo o acervo" limpa: o resumo perde o nome do baralho.
    const botaoLimpar = page.getByRole('button', { name: 'Voltar a jogar com todo o acervo' });
    await expect(botaoLimpar).toBeVisible();
    await clicarRobusto(page, botaoLimpar);

    await expect(
      page.getByText(new RegExp(`\\d+\\s+no recorte.*${escapaRegex(nomeBaralho!)}`)),
      'depois de limpar, o resumo não deveria mais conter o nome do baralho',
    ).not.toBeVisible();
  });
});

function escapaRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
