import { expect, type Page,test } from '@playwright/test';

import { mapaDoBaralho,semearCartoes } from './_fixtures';
import { clicarRobusto, fecharSobreposicoes,irParaPraticar } from './_helpers';

/**
 * UMA SESSAO DE JOGO INTEIRA, do lobby ao fim da rodada — tres jogos, tres mecanicas.
 *
 * O que nenhuma suite cobria: o clique na carta do lobby chegar a um jogo montado com o baralho
 * de verdade, o jogo produzir um `RoundReport` e a tela de fim de rodada (`ScratchReward`, com o
 * "N de N" e "Voltar aos jogos") aparecer. Os testes unitarios provam cada peca; este prova a
 * costura, e nos tres viewports — a mesa da Memoria vira 3 colunas no celular e o Termo troca o
 * teclado fisico pelo de tela.
 *
 * DETERMINISMO. A Memoria embaralha, mas cada carta carrega o texto no `title` (mesmo virada para
 * baixo), e o teste conhece o baralho que semeou — entao ele le a mesa e fecha os pares sem errar.
 * No Termo a pista de cada tabuleiro e a traducao, e o teste digita a palavra que corresponde. O
 * tour guiado de cada jogo e marcado como feito ANTES de abrir a tela (`babel_tour_<jogo>`) e a
 * antessala fica no padrao (pular), senao cada jogo abriria com um overlay de explicacao.
 */

/* Lidos do SERVIDOR, nao da fixture: o banco nasce com tres cartoes de demonstracao que entram
   nas rodadas junto com os semeados (ver `mapaDoBaralho`). */
let MAPA = new Map<string, string>();
let POR_TRADUCAO = new Map<string, string>();

test.beforeAll(async () => {
  await semearCartoes();
  ({ traducaoDe: MAPA, palavraDe: POR_TRADUCAO } = await mapaDoBaralho());
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    for (const jogo of ['memory', 'termo', 'bao']) {
      try { localStorage.setItem(`babel_tour_${jogo}`, '1'); } catch { /* storage bloqueado */ }
    }
    try { localStorage.removeItem('babel.pular_antessala'); } catch { /* idem */ }
  });
});

/** A carta do lobby: o botao com o titulo EXATO do jogo (o de "Como se joga" tem prefixo). */
async function abrirJogo(page: Page, titulo: string) {
  const carta = page.locator('#grade-de-jogos').getByRole('button', { name: titulo, exact: true });
  await expect(carta, `a carta "${titulo}" deveria estar na grade`).toBeVisible({ timeout: 15_000 });
  await expect(carta, `a carta "${titulo}" deveria estar liberada com 12 palavras no baralho`).toBeEnabled();
  await clicarRobusto(page, carta);
}

/** A tela de fim de rodada — `ScratchReward`, que vem antes do resumo detalhado. */
function fimDaRodada(page: Page) {
  return page.getByText(/Fim da rodada|Rodada concluída/).first();
}

async function voltarAoLobby(page: Page) {
  /* A raspadinha (`ScratchReward`) so mostra as saidas DEPOIS de revelada. O link de texto
     "revelar sem raspar" e a saida por teclado, e a unica deterministica — raspar exige mover o
     ponteiro ate 55% do canvas ficar transparente. */
  const revelar = page.getByRole('button', { name: 'revelar sem raspar' });
  if (await revelar.isVisible().catch(() => false)) await clicarRobusto(page, revelar);
  await clicarRobusto(page, page.getByRole('button', { name: 'Voltar aos jogos' }));
  await fecharSobreposicoes(page);
  await expect(page.getByRole('button', { name: 'Fonte' })).toBeVisible({ timeout: 15_000 });
}

test.describe('Sessao de jogo', () => {
  test('Memoria: abre com o baralho, fecha todos os pares e chega ao fim da rodada', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);
    await abrirJogo(page, 'Jogo da memória');

    await expect(page.getByRole('button', { name: 'Sair do jogo' })).toBeVisible({ timeout: 10_000 });
    const placar = page.getByText(/^0\/\d+ pares$/);
    await expect(placar, 'o placar deveria nascer em 0/N pares').toBeVisible();

    const cartas = page.locator('[data-tour="mesa"] > button');
    const total = await cartas.count();
    expect(total % 2, 'a mesa tem de ter um numero par de cartas').toBe(0);
    expect(total).toBeGreaterThanOrEqual(8);

    /* LER A MESA: o `title` do texto interno existe mesmo com a carta virada para baixo. */
    const titulos: string[] = [];
    for (let i = 0; i < total; i++) {
      titulos.push(((await cartas.nth(i).locator('span[title]').first().getAttribute('title')) ?? '').trim());
    }
    const palavrasNaMesa = titulos.filter((t) => MAPA.has(t));
    expect(palavrasNaMesa.length, `a mesa deveria ser feita das palavras semeadas; titulos: ${titulos.join(' | ')}`).toBe(total / 2);

    for (const palavra of palavrasNaMesa) {
      const idxPalavra = titulos.indexOf(palavra);
      const traducao = MAPA.get(palavra)!;
      const idxTraducao = titulos.findIndex((t) => t.toLowerCase() === traducao.toLowerCase());
      expect(idxTraducao, `nao achei a carta da traducao "${traducao}" de "${palavra}" na mesa`).toBeGreaterThanOrEqual(0);
      await cartas.nth(idxPalavra).click();
      await cartas.nth(idxTraducao).click();
      await page.waitForTimeout(150);
    }

    await expect(page.getByText(new RegExp(`^${total / 2}/${total / 2} pares$`))).toBeVisible({ timeout: 5000 });
    await expect(fimDaRodada(page), 'a tela de fim de rodada deveria aparecer').toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: new RegExp(`^${total / 2} de ${total / 2}$`) })).toBeVisible();
    await voltarAoLobby(page);
  });

  test('Termo: abre com a escada, aceita a palavra digitada e chega ao fim da rodada', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);
    await abrirJogo(page, 'Escrever a palavra');

    await expect(page.getByRole('button', { name: 'Sair do jogo' })).toBeVisible({ timeout: 10_000 });
    const tabuleiro = page.locator('[data-tour="tabuleiro"]');
    await expect(tabuleiro).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar palpite' })).toBeVisible();

    /* Cada tabuleiro mostra a pista (traducao) enquanto aberto e a palavra em maiusculas quando
       fecha. O laco digita a palavra do primeiro tabuleiro aberto e repete ate a rodada acabar.
       Doze voltas cobrem a escada mais longa (1 + 2 + 4 tabuleiros) com folga. */
    const pistas = page.locator('[data-tour="tabuleiro"] > div > div > p:first-of-type');
    let digitadas = 0;
    for (let volta = 0; volta < 12; volta++) {
      if (await fimDaRodada(page).isVisible().catch(() => false)) break;
      await pistas.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      const textos = (await pistas.allTextContents()).map((t) => t.trim());
      const aberta = textos.find((t) => !MAPA.has(t.toLowerCase()) && POR_TRADUCAO.has(t.toLowerCase()));
      if (!aberta) {
        // Pode ser a transicao entre degraus ("Subiu!"): espera e tenta de novo.
        await page.waitForTimeout(900);
        continue;
      }
      const palavra = POR_TRADUCAO.get(aberta.toLowerCase())!;
      await page.keyboard.type(palavra, { delay: 30 });
      await page.keyboard.press('Enter');
      digitadas++;
      await page.waitForTimeout(900);
    }
    expect(digitadas, 'esperava digitar pelo menos uma palavra no Termo').toBeGreaterThan(0);
    await expect(fimDaRodada(page), 'a escada deveria terminar na tela de fim de rodada').toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /^\d+ de \d+$/ })).toBeVisible();
    await voltarAoLobby(page);
  });

  test('Bao (cultural): abre com o baralho, mostra as covas e "Sair" devolve ao lobby', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);
    await abrirJogo(page, 'Bao: monte a palavra');

    const sair = page.getByRole('button', { name: 'Sair do jogo' });
    await expect(sair).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('As covas trazem os pedaços da palavra fora de ordem. Semeie na ordem certa.')).toBeVisible();
    /* Ha covas para semear: os pedacos sao botoes fora do cabecalho. */
    const botoes = page.locator('div.fixed.inset-0 button');
    expect(await botoes.count(), 'a tela do Bao deveria ter as covas como botoes').toBeGreaterThan(3);

    await clicarRobusto(page, sair);
    await fecharSobreposicoes(page);
    await expect(page.getByRole('button', { name: 'Fonte' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#grade-de-jogos')).toBeVisible();
  });
});
