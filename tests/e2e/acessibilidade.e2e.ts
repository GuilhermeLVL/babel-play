import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { fecharSobreposicoes } from './_helpers';

/**
 * ACESSIBILIDADE AUTOMATIZADA — a primeira do projeto.
 *
 * O repositório já travava CONTRASTE por teste (`tests/contrastePaletas.test.ts` mede os pares de
 * token em 7 temas × claro/escuro com limiar 4,5:1) e já tinha teste de primitivos
 * (`tests/primitivosDeUi.test.tsx`). Mas nada travava o resto do que torna uma tela operável:
 * papel, nome acessível, rótulo de campo, ordem de foco, `aria-*` coerente, região landmark.
 * Sem isso, "acessível" era afirmação sem medição — e a auditoria anterior já tinha encontrado uma
 * tela sem porta de saída na dock mobile.
 *
 * O QUE ESTE TESTE NÃO É. Não é prova de acessibilidade: o axe pega uma fatia do problema (as
 * regras decidíveis por máquina) e se RECUSA a opinar sobre o resto. Teclado, leitor de tela e
 * sentido do texto alternativo continuam exigindo gente. O que ele garante é que a fatia
 * automatizável não regride em silêncio.
 *
 * LIMIAR: falha em `serious` e `critical`. `minor`/`moderate` entram no relatório mas não
 * derrubam — começar exigindo zero em tudo, num app com 13 telas que nunca passou por axe, só
 * produziria um teste que alguém desliga na primeira semana.
 *
 * Roda nos 3 viewports do `playwright.config.ts` (375 / 768 / 1280): a dock mobile e a barra de
 * desktop são markups diferentes, e a auditoria achou o furo justamente na dock.
 */

/** Rotas que não exigem conta nem estado de sessão — ver `App.tsx:289,304,320,322`. */
const ROTAS = [
  { caminho: '/', nome: 'Início' },
  { caminho: '/jogar', nome: 'Jogar' },
  { caminho: '/planos', nome: 'Planos' },
  { caminho: '/sobre', nome: 'Sobre' },
  { caminho: '/ajustes', nome: 'Ajustes' },
] as const;

for (const rota of ROTAS) {
  test(`axe: ${rota.nome} (${rota.caminho}) sem violacao seria ou critica`, async ({ page }) => {
    await page.goto(rota.caminho);
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);

    /* VARRE TODAS AS ABAS, uma por uma — e isto não é zelo, é correção do próprio teste.
       A aba ativa PERSISTE entre execuções. Com "Consumo do mês" aberta, a tabela de comparação
       de `/planos` nem chega a renderizar, e o axe varria uma tela onde o defeito não existia:
       o teste passava sozinho e falhava na suíte inteira, pela mesma revisão de código. Um teste
       cuja cobertura muda em silêncio conforme o estado deixado por outro é pior que nenhum,
       porque dá confiança sem dar garantia. Percorrendo as abas, o que ele cobre não depende de
       onde a sessão anterior parou. */
    const abas = page.getByRole('tab');
    const quantas = await abas.count();

    const varrer = async () =>
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations;

    const encontradas = [...(await varrer())];
    for (let i = 0; i < quantas; i++) {
      const aba = abas.nth(i);
      if (!(await aba.isVisible().catch(() => false))) continue;
      await aba.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(150);
      encontradas.push(...(await varrer()));
    }

    /* Uma violação repetida em várias abas é um defeito só. */
    const resultado = {
      violations: [...new Map(encontradas.map((v) => [v.id + v.nodes[0]?.target.join(), v])).values()],
    };

    const graves = resultado.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    /* O RELATORIO COMPLETO VAI PARA DISCO SEMPRE, nao so quando falha.
       Na primeira integracao com o gate este teste falhou em /planos e passou ao ser rodado
       sozinho — e o detalhe da violacao nao existia em lugar nenhum, porque o reporter `list` so
       guarda a mensagem do `expect`. Sem o dump, diagnosticar intermitencia vira adivinhacao.
       Guarda tambem `minor`/`moderate`, que nao derrubam o teste mas mostram a tendencia. */
    await test.info().attach(`axe-${rota.nome}`, {
      body: JSON.stringify(
        resultado.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          alvos: v.nodes.map((n) => ({ seletor: n.target.join(' '), resumo: n.failureSummary })),
        })),
        null,
        2,
      ),
      contentType: 'application/json',
    });

    /* A mensagem precisa dizer O QUE consertar e ONDE. Um "expected 3 to be 0" manda a próxima
       pessoa reabrir o navegador para descobrir o que o teste já sabia. */
    const detalhe = graves
      .map((v) => {
        const alvos = v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n      ');
        return `  [${v.impact}] ${v.id}: ${v.help}\n      ${alvos}\n      ${v.helpUrl}`;
      })
      .join('\n');

    expect(graves.map((v) => v.id), `violações em ${rota.caminho}:\n${detalhe}`).toEqual([]);
  });
}
