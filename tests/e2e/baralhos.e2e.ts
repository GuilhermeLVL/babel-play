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
  /* O CLIQUE PRECISA DE TIMEOUT, e a falta dele custou 90 segundos de teste travado: o diálogo de
     recompensa pode estar POR CIMA deste botão, e um `click()` sem prazo fica esperando a
     interceptação sumir até o teste inteiro estourar — sem dizer que o problema era o overlay.
     Com prazo curto e falha engolida, quem chama tenta de novo depois de fechar as sobreposições,
     que é exatamente o laço de `irParaPraticar`. */
  const fecharSemMudar = page.getByRole('button', { name: 'Fechar sem mudar nada' });
  if (await fecharSemMudar.isVisible().catch(() => false)) {
    await fecharSemMudar.click({ timeout: 2000 }).catch(() => {});
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

/**
 * O BOTÃO APARECE DEPOIS DO DADO CHEGAR, e é isso que separa um pulo honesto de um teste decorativo.
 *
 * "Baralhos" e "Jogar só com este" só existem depois de `listarBaralhosAnki()` responder — uma
 * chamada assíncrona disparada no `useEffect` da tela. `isVisible()` é uma leitura INSTANTÂNEA e
 * não espera: usá-la para decidir o `test.skip` fazia o teste pular SEMPRE, inclusive num ambiente
 * com baralho importado. Ou seja, o caminho condicional nunca era exercitado e o "2 skipped" dava
 * a impressão tranquilizadora de que só faltava dado.
 *
 * Aqui a espera é curta e limitada: dá à chamada a chance de responder, e se ela responder VAZIA o
 * pulo volta a ser o que devia ser — "não há baralho neste ambiente".
 */
async function apareceEmAte(alvo: Locator, ms = 5000): Promise<boolean> {
  return alvo.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
}

/**
 * QUEM DECIDE SE HÁ BARALHO É O SERVIDOR, não a ausência de um botão na tela.
 *
 * Perguntar à interface ("o botão apareceu?") faz o teste pular por qualquer motivo — dado que não
 * chegou, diálogo por cima, animação atrasada — todos relatados como "não há baralho neste
 * ambiente". É um pulo que mente, e o pior tipo: some justamente quando há um defeito de verdade,
 * porque um botão que deveria existir e não aparece vira "ambiente sem dado".
 *
 * Perguntando à API, o pulo passa a significar o que diz, e o caso "o servidor TEM baralho mas a
 * tela não mostra" — que é um bug — vira FALHA, que é o que um teste existe para fazer.
 */
async function baralhosNoServidor(page: Page): Promise<{ quantos: number; porque: string }> {
  const r = await page.request.get('/api/anki/decks').catch((e) => ({ erro: String(e) }) as never);
  if (!('ok' in r)) return { quantos: 0, porque: `a chamada a /api/anki/decks falhou: ${(r as { erro: string }).erro}` };
  if (!r.ok()) return { quantos: 0, porque: `/api/anki/decks respondeu HTTP ${r.status()}` };
  const corpo = await r.text().catch(() => '');
  let decks: unknown = null;
  try { decks = JSON.parse(corpo); } catch { return { quantos: 0, porque: `/api/anki/decks devolveu algo que não é JSON: ${corpo.slice(0, 120)}` }; }
  if (!Array.isArray(decks)) return { quantos: 0, porque: `/api/anki/decks devolveu ${typeof decks}, não uma lista` };
  return { quantos: decks.length, porque: decks.length ? '' : 'o servidor não tem nenhum baralho importado' };
}

test.describe('Baralhos do Anki (condicional a haver baralho já importado)', () => {
  /**
   * UM TESTE, UMA IDA. Isto já foram DOIS testes — abrir a tela, e depois o recorte — e cada um
   * repetia a mesma navegação e o mesmo portão. Como a entrada em `/jogar` atravessa uma fila de
   * diálogos de recompensa que animam em tempos variáveis, dobrar a navegação dobrava a chance de
   * tropeçar neles, e o segundo teste pulava por motivo ambiental enquanto o primeiro passava —
   * dois resultados diferentes para o mesmo caminho, que é o retrato de um teste instável.
   * Uma ida cobre as duas coisas, porque a segunda parte começa exatamente onde a primeira termina.
   */
  test('abre a tela, mostra o saldo, e "Jogar só com este" volta ao lobby com o baralho na faixa', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);

    /* O PULO PRECISA DIZER O MOTIVO REAL. "Não há baralho neste ambiente" é a explicação certa só
       quando o servidor de fato não tem nenhum; quando a chamada falha ou responde outra coisa, a
       mesma frase esconde um defeito atrás de uma justificativa tranquilizadora. */
    const acervo = await baralhosNoServidor(page);
    test.skip(
      acervo.quantos === 0,
      `Caso não alcançável sem criar dado (o que este teste não faz) — ${acervo.porque}`,
    );

    // Há baralho no servidor: a porta TEM de existir. Se não existir, é defeito, não falta de dado.
    const botaoBaralhos = page.getByRole('button', { name: 'Baralhos' });
    await expect(botaoBaralhos, 'o servidor tem baralho, então a porta "Baralhos" deveria estar na faixa').toBeVisible({ timeout: 10_000 });
    await clicarRobusto(page, botaoBaralhos);

    await expect(
      page.getByText('O que já foi trazido de fora, e quanto de cada um está de fato jogando com você.'),
    ).toBeVisible();

    // O saldo é a promessa central da tela: "N de M ativadas", nunca um total bruto sozinho.
    const jogarSoComEste = page.getByRole('button', { name: 'Jogar só com este' });
    const saldoAtivadas = page.getByText(/\d+\s+de\s+\d+\s+ativadas/);
    const temRecorte = await apareceEmAte(jogarSoComEste);
    const temSaldo = (await saldoAtivadas.count().catch(() => 0)) > 0;
    expect(temRecorte || temSaldo, 'esperava o botão "Jogar só com este" ou o saldo "N de M ativadas" no cartão do baralho').toBe(true);

    test.skip(
      !temRecorte,
      'O baralho do servidor não tem palavra ativada, então não há o que recortar — a segunda metade deste caso não é alcançável sem criar dado.',
    );

    // Lê o nome no cartão ANTES de clicar, para conferir que é ele que aparece na faixa depois.
    const cartao = page.locator('.card-panel').filter({ has: jogarSoComEste }).first();
    const nomeBaralho = (await cartao.locator('p').first().textContent().catch(() => null))?.trim();

    await clicarRobusto(page, jogarSoComEste);
    await expect(page.getByRole('button', { name: 'Anki', exact: true })).toBeVisible();

    if (nomeBaralho) {
      await expect(page.getByText(nomeBaralho, { exact: false }).first()).toBeVisible();
    } else {
      // Sem o nome, ao menos prova que a porta genérica "Baralhos" virou o chip do recorte.
      await expect(page.getByRole('button', { name: 'Baralhos', exact: true })).not.toBeVisible();
    }
  });
});
