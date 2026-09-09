import { expect,test } from '@playwright/test';

import { abrirSeletor,apareceEmAte, baralhosNoServidor, clicarRobusto, irParaPraticar } from './_helpers';

/**
 * Baralhos do Anki: cobre o caminho novo (ingestão de baralhos) além da casca já coberta por
 * `fumaca.e2e.ts`. Perfil padrão é sênior (ver `fumaca.e2e.ts`), sem login.
 *
 * O que é SEMPRE verificável (não depende de dado): o botão "Anki" existe no lobby, abre a tela
 * de importação, e "Voltar aos jogos" retorna. O que depende de já existir baralho importado
 * ("Baralhos", "Baralhos do Anki", "Jogar só com este") é condicional — quando o ambiente não tem
 * baralho, o teste registra `test.skip()` com a razão em vez de fingir passar.
 *
 * Os helpers de navegação/overlay moram em `_helpers.ts` (compartilhados com `facetas.e2e.ts`).
 */

test.describe('Anki: importar', () => {
  test('o botão Anki abre a importação, e "Voltar aos jogos" retorna ao lobby', async ({ page }) => {
    test.slow();
    await irParaPraticar(page);

    /* O ANKI MUDOU DE LUGAR E DE NOME: vive no rodapé da gaveta do seletor, como «Trazer do
       Anki». O caminho até ele é parte do que este teste cobre agora. */
    await abrirSeletor(page);
    const botaoAnki = page.getByRole('button', { name: 'Trazer do Anki' });
    // Prazo maior que o padrão: sob a suíte inteira em paralelo o primeiro carregamento pode
    // legitimamente demorar mais que os 5s padrão do Playwright (ver `irParaPraticar`).
    await expect(botaoAnki).toBeVisible({ timeout: 15_000 });
    await clicarRobusto(page, botaoAnki);

    await expect(page.getByRole('button', { name: 'Escolher arquivo' })).toBeVisible();

    await clicarRobusto(page, page.getByRole('button', { name: 'Voltar aos jogos' }));
    await abrirSeletor(page);
    await expect(page.getByRole('button', { name: 'Trazer do Anki' })).toBeVisible();
  });
});

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
    await abrirSeletor(page);
    const botaoBaralhos = page.getByRole('button', { name: 'Gerenciar baralhos' });
    await expect(botaoBaralhos, 'o servidor tem baralho, então a porta "Baralhos" deveria estar na faixa').toBeVisible({ timeout: 10_000 });
    await clicarRobusto(page, botaoBaralhos);

    await expect(
      page.getByText('O que já foi trazido de fora, e quanto de cada um está de fato jogando com você.'),
    ).toBeVisible();

    // O saldo é a promessa central da tela: "N de M ativadas", nunca um total bruto sozinho.
    /* `.first()`: com MAIS DE UM baralho importado o locator casa vários botões, e o modo
       estrito do Playwright faz `waitFor` estourar — o teste então pulava dizendo "nenhum baralho
       tem palavra ativada" numa tela que mostrava 1.795 ativadas. Um skip que mente sobre o
       ambiente é pior que uma falha: esconde cobertura que se acredita ter. */
    const jogarSoComEste = page.getByRole('button', { name: 'Jogar só com este' }).first();
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
    await abrirSeletor(page);
    await expect(page.getByRole('button', { name: 'Trazer do Anki' })).toBeVisible();

    if (nomeBaralho) {
      await expect(page.getByText(nomeBaralho, { exact: false }).first()).toBeVisible();
    } else {
      // Sem o nome, ao menos prova que a porta genérica "Baralhos" virou o chip do recorte.
      await expect(page.getByRole('button', { name: 'Gerenciar baralhos' })).not.toBeVisible();
    }
  });
});
