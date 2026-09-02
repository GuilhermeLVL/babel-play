import { test, expect } from '@playwright/test';
import { irParaPraticar, clicarRobusto, apareceEmAte, baralhosNoServidor, abrirSeletor } from './_helpers';

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

    /* A FILEIRA MUDOU DE LUGAR no redesenho de 02/09: ela vive dentro da gaveta do seletor, que
       nasce FECHADA de propósito — quem chega quer jogar, não configurar. O caminho até ela passa
       pelo «Trocar», e é esse caminho que o teste precisa exercitar agora. O botão só existe com
       mais de uma fonte oferecida, e a trilha chega de uma chamada assíncrona: daí o prazo maior,
       não por instabilidade do elemento. */
    const abrirSeletor = page.getByRole('button', { name: 'Trocar' });
    await expect(abrirSeletor, 'o seletor de conteúdo deveria estar no lobby').toBeVisible({ timeout: 15_000 });
    await clicarRobusto(page, abrirSeletor);
    await expect(abrirSeletor).toHaveAttribute('aria-expanded', 'true');

    const grupoRecorte = page.getByRole('group', { name: 'recorte' });
    await expect(grupoRecorte, 'a faceta de recorte deveria aparecer com a gaveta aberta').toBeVisible({ timeout: 10_000 });

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

  test('o recorte por baralho persiste através de F5, e o chip que o ligou também o desliga (condicional a haver baralho no servidor)', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);

    const acervo = await baralhosNoServidor(page);
    test.skip(
      acervo.quantos === 0,
      `Caso não alcançável sem criar dado (o que este teste não faz) — ${acervo.porque}`,
    );

    await abrirSeletor(page);
    const botaoBaralhos = page.getByRole('button', { name: 'Gerenciar baralhos' });
    await expect(botaoBaralhos, 'o servidor tem baralho, então a porta "Baralhos" deveria estar na faixa').toBeVisible({ timeout: 10_000 });
    await clicarRobusto(page, botaoBaralhos);

    await expect(
      page.getByText('O que já foi trazido de fora, e quanto de cada um está de fato jogando com você.'),
    ).toBeVisible();

    /* `.first()`: com MAIS DE UM baralho importado o locator casa vários botões, e o modo
       estrito do Playwright faz `waitFor` estourar — o teste então pulava dizendo "nenhum baralho
       tem palavra ativada" numa tela que mostrava 1.795 ativadas. Um skip que mente sobre o
       ambiente é pior que uma falha: esconde cobertura que se acredita ter. */
    const jogarSoComEste = page.getByRole('button', { name: 'Jogar só com este' }).first();
    const temRecorte = await apareceEmAte(jogarSoComEste);
    test.skip(
      !temRecorte,
      'Nenhum baralho do servidor tem palavra ativada, então não há o que recortar — caso não alcançável sem criar dado.',
    );

    const cartao = page.locator('.card-panel').filter({ has: jogarSoComEste }).first();
    const nomeBaralho = (await cartao.locator('p').first().textContent().catch(() => null))?.trim();
    test.skip(!nomeBaralho, 'Não deu para ler o nome do baralho no cartão para comparar depois — caso não alcançável sem dado legível.');

    await clicarRobusto(page, jogarSoComEste);
    await expect(page.getByRole('button', { name: 'Trocar' })).toBeVisible();

    /* O RESUMO MUDOU DE FORMA no redesenho: o nome do baralho agora vive na linha «jogando com»,
       e o rodapé da gaveta guarda só o total. O que o teste garante continua o mesmo — o recorte
       é anunciado por escrito antes de a rodada começar. */
    const resumoComBaralho = page.getByText(new RegExp(`jogando com[\\s\\S]*${escapaRegex(nomeBaralho!)}`, 'i'));
    await expect(resumoComBaralho, 'a linha «jogando com» deveria nomear o baralho escolhido').toBeVisible();

    const filtroAntesDoReload = await page.evaluate((chave) => localStorage.getItem(chave), CHAVE_FILTRO);
    expect(filtroAntesDoReload, 'o recorte por baralho deveria estar gravado antes do F5').not.toBeNull();

    // A CAPACIDADE NOVA: um F5 mantém o chip do baralho e o nome no resumo — antes evaporava.
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();

    await expect(
      page.getByText(new RegExp(`jogando com[\\s\\S]*${escapaRegex(nomeBaralho!)}`, 'i')),
      'o recorte por baralho deveria sobreviver ao F5 (persistência nova)',
    ).toBeVisible({ timeout: 10_000 });

    /* TIRAR O RECORTE mudou de caminho: o botão "x" solto na faixa saiu, e quem desliga é o
       próprio chip do baralho dentro da gaveta — o mesmo controle que ligou, que é como toda
       faceta se comporta. "limpar tudo" continua existindo para zerar de uma vez. */
    await abrirSeletor(page);
    const chipDoBaralho = page.getByRole('group', { name: 'quais baralhos' })
      .getByRole('button', { pressed: true }).first();
    await expect(chipDoBaralho, 'o baralho escolhido deveria estar marcado na gaveta').toBeVisible();
    await clicarRobusto(page, chipDoBaralho);

    await expect(
      page.getByText(new RegExp(`jogando com[\\s\\S]*${escapaRegex(nomeBaralho!)}`, 'i')),
      'depois de limpar, o resumo não deveria mais nomear o baralho',
    ).not.toBeVisible();
  });
});

function escapaRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
