import { expect, type Page,test } from '@playwright/test';

import { fecharSobreposicoes } from './_helpers';

/**
 * O TESTE DE i18n QUE NÃO PRECISA DE TRADUTOR.
 *
 * Com o pseudo-idioma (`xx`, gerado por `scripts/i18n/pseudo.mjs`) toda frase traduzível vira
 * `[Ĵögö dá mémóríá ······]`: acentuada e ~40% mais longa. Duas falhas aparecem sozinhas:
 *
 *  1. **String que escapou da extração** — continua em português limpo no meio do texto acentuado.
 *     É o único jeito de achar as que ainda não passam por `t()` sem ler 121 arquivos.
 *  2. **Layout que quebra com texto longo** — o alemão ocupa ~30% mais que o português, e este app
 *     tem `truncate max-w-[180px]` e botões `min-w-[160px]`. A expansão antecipa o estrago.
 *
 * O teste FALHA no item 2 e apenas RELATA o item 1: são ~1.400 strings ainda não migradas, e um
 * gate vermelho por isso seria ruído constante até a migração terminar. O relatório é o mapa de
 * onde migrar em seguida.
 */

/**
 * Mede overflow real: o conteúdo é mais largo que a caixa que deveria contê-lo.
 *
 * SÓ TEXTO DE INTERFACE conta, e o pseudo-idioma é o próprio discriminador: rótulo traduzido sai
 * acentuado (`[Ĵögö …]`), palavra e definição do usuário saem como estão. A primeira versão desta
 * função reprovava `"To defer means to arrange for an action…"` cortado num card de vocabulário —
 * conteúdo do usuário truncado é comportamento DESEJADO, não defeito de layout. Sem esse filtro o
 * teste vira ruído e se aprende a ignorá-lo.
 */
async function elementosQueEstouram(page: Page) {
  return page.evaluate(() => {
    const DO_PSEUDO = /[öñšžĴĜÁÉÍÖÜÇÑ·]/;
    const fora: Array<{ texto: string; sobra: number; classe: string }> = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, a, th, td, label, h1, h2, h3, p, span')) {
      const texto = (el.textContent ?? '').trim();
      if (!texto || texto.length < 3) continue;
      if (!DO_PSEUDO.test(texto)) continue;
      // Só elementos que de fato cortam ou seguram o texto — `overflow: visible` não quebra nada.
      const estilo = getComputedStyle(el);
      const corta = estilo.overflow !== 'visible' || estilo.textOverflow === 'ellipsis';
      if (!corta) continue;
      const sobra = el.scrollWidth - el.clientWidth;
      if (sobra > 2) fora.push({ texto: texto.slice(0, 60), sobra, classe: el.className.slice(0, 80) });
    }
    return fora;
  });
}

/** Frase em português limpo (com acento nosso, sem os do pseudo) = string que não passa por t(). */
async function stringsNaoTraduzidas(page: Page) {
  return page.evaluate(() => {
    const SOTAQUE = /[öñšžĴĜÁÉÍÖÜÇÑ·]/;
    const PORTUGUES = /[ãõçâêôáéíóú]/i;
    const achadas = new Set<string>();
    const anda = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = anda.nextNode(); n; n = anda.nextNode()) {
      const texto = (n.textContent ?? '').trim();
      if (texto.length < 4 || SOTAQUE.test(texto)) continue;
      if (PORTUGUES.test(texto)) achadas.add(texto.slice(0, 70));
    }
    return [...achadas];
  });
}

/* `?ui=xx` força o idioma da interface sem tocar na preferência da conta — ver
   `useIdiomaDaInterfaceSeguindoOPerfil`. O idioma vem do SERVIDOR, então mexer em localStorage
   aqui não teria efeito nenhum. */
const COM_PSEUDO = '/jogar?ui=xx';

/**
 * As telas varridas, e por que estas.
 *
 * A auditoria de layout apontou os pontos de risco de expansao: `IChat` (`truncate max-w-[180px]`
 * em nome de tela), `Planos` (tabela `min-w-[520px]` puramente textual), `Reading`
 * (`<select max-w-[260px]>`), `Metrics`/`Library` (rotulos densos). Varrer so `/jogar` daria verde
 * sem tocar em nenhum deles — a tela de jogos e justamente a mais folgada.
 */
const TELAS = [
  { nome: 'jogar', url: '/jogar?ui=xx' },
  { nome: 'vocabulario', url: '/vocabulario?ui=xx' },
  { nome: 'biblioteca', url: '/biblioteca?ui=xx' },
  { nome: 'ajustes', url: '/ajustes?ui=xx' },
  { nome: 'planos', url: '/planos?ui=xx' },
];

/**
 * O PSEUDO PRECISA ESTAR ATIVO, e isto precisa ser verificado antes de tudo.
 *
 * Um teste de layout que roda em português passa sempre — e passa pelo motivo errado, que é
 * exatamente o falso-verde que este repositório documenta em `audit/rules/ast-grep`. Se o catálogo
 * não carregar, os dois testes abaixo diriam "nenhum estouro" sobre uma tela que nem foi expandida.
 */
async function entrarComPseudo(page: Page, url = COM_PSEUDO) {
  await page.goto(url);
  await fecharSobreposicoes(page);
  await page.waitForTimeout(1800);
  const lang = await page.evaluate(() => document.documentElement.lang);
  expect(lang, 'o pseudo-idioma não carregou — o teste rodaria sobre a tela em português').toBe('xx');
}

test.describe('Pseudo-localização', () => {
  for (const tela of TELAS) {
    test(`${tela.nome}: nada corta com texto 40% mais longo`, async ({ page }) => {
      test.slow();
      await entrarComPseudo(page, tela.url);

      const estouros = await elementosQueEstouram(page);
      const relatorio = estouros
        .sort((a, b) => b.sobra - a.sobra)
        .map((e) => `  ${e.sobra}px sobrando · "${e.texto}" · ${e.classe}`)
        .join('\n');

      expect(
        estouros,
        `[${tela.nome}] Texto 40% mais longo (o que o alemão faz) não coube:\n${relatorio}\n`,
      ).toHaveLength(0);
    });
  }

  test('relata as strings que ainda não passam por t()', async ({ page }) => {
    await entrarComPseudo(page);

    const cruas = await stringsNaoTraduzidas(page);
    /* NÃO falha de propósito: ~1.400 strings ainda não foram migradas, e um vermelho constante
       viraria ruído que se aprende a ignorar. O valor aqui é o mapa — a lista sai no relatório do
       Playwright e diz exatamente o que migrar em seguida. */
    test.info().annotations.push({
      type: 'strings sem t()',
      description: cruas.length ? `${cruas.length} nesta tela:\n${cruas.join('\n')}` : 'nenhuma',
    });
    expect(cruas.length).toBeGreaterThanOrEqual(0);
  });
});
