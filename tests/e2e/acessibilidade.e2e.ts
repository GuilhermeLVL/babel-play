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

/**
 * A FILA DE RECOMPENSAS NÃO PODE SUBIR DURANTE A VARREDURA — e a solução não é clicar mais rápido.
 *
 * Com banco descartável o app entrega as conquistas de boas-vindas no boot ("Primeira captura",
 * "Nível 2!"), num modal com backdrop. Isso não é ruído cosmético: o backdrop escurece a página, e
 * o axe passa a medir TODO o texto de trás contra um fundo esmaecido. O resultado eram violações
 * de contraste que não existem — verificado injetando o axe na página com o modal fechado: zero
 * violações em `/sobre` e `/planos`, tanto em 375×812 quanto em 1280×800.
 *
 * Tentativas anteriores falharam por atacarem o sintoma: `.exclude()` do modal só impede que ELE
 * seja checado, não desfaz o escurecimento; e fechar em laço é uma corrida contra a remontagem do
 * componente a cada item da fila.
 *
 * Aqui a fila simplesmente não nasce: o app só mostra o que não está em `babel.recompensas_vistas`
 * (`RecompensaDesbloqueada.tsx:47`), e `addInitScript` roda ANTES de qualquer script da página.
 * As chaves vêm do catálogo real (`core/learning/conquistas.ts`) e dos níveis — se uma conquista
 * nova for criada sem entrar nesta lista, o teste volta a falhar dizendo "um modal continuou
 * aberto", que é a mensagem certa para mandar alguém atualizar aqui.
 */
const CONQUISTAS = [
  'primeira-captura', 'ouvinte', 'caderno-cheio', 'revisor', 'sem-erro', 'perfeccionista',
  'maratonista', 'constante', 'colecionador', 'poliglota', 'duelista', 'cliente',
  'nivel-5', 'nivel-10',
];
const RECOMPENSAS_VISTAS = [
  ...CONQUISTAS.map((id) => `conquista:${id}`),
  ...Array.from({ length: 60 }, (_, n) => `nivel:${n + 1}`),
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((vistas: string[]) => {
    try {
      localStorage.setItem('babel.recompensas_vistas', JSON.stringify(vistas));
    } catch { /* sem storage: o laço de fechamento abaixo ainda tenta */ }
  }, RECOMPENSAS_VISTAS);
});

for (const rota of ROTAS) {
  test(`axe: ${rota.nome} (${rota.caminho}) sem violacao seria ou critica`, async ({ page }) => {
    await page.goto(rota.caminho);
    await expect(page.getByRole('main')).toBeVisible();

    /* A TELA PRECISA ESTAR ASSENTADA ANTES DA VARREDURA, e uma chamada só não garante isso.
       Com banco vazio o app dispara uma FILA de conquistas no boot ("Primeira captura"…), e cada
       modal entra animado: fecha-se um e o próximo sobe, inclusive durante o scan. */
    const dialogos = page.locator('div[role="dialog"]');
    /* "Resgatar tudo e continuar" DRENA A FILA; o "Fechar" só tira o de cima.
       Com banco novo o app tem uma fila inteira de conquistas para entregar, e fechar uma por uma
       é uma corrida contra o próprio app — foi assim que o modal continuava subindo no meio do
       scan. O botão de resgatar existe exatamente para consumir tudo de uma vez
       (`lib/galeria/textos.ts:28`), e num banco descartável creditar seeds não custa nada. */
    const resgatarTudo = page.getByRole('button', { name: /Resgatar tudo e continuar/i });
    for (let i = 0; i < 15; i++) {
      if ((await dialogos.count()) === 0) break;
      if (await resgatarTudo.first().isVisible().catch(() => false)) {
        await resgatarTudo.first().click({ timeout: 2000 }).catch(() => {});
      } else {
        await fecharSobreposicoes(page);
      }
      /* 600 ms, e não 200: entre um resgate e o próximo o modal REMONTA com a recompensa seguinte,
         e um laço mais apertado corre contra a re-renderização — clica no botão do modal que está
         saindo e acha que nada aconteceu. Medido na mão: a fila de um banco novo ("Primeira
         captura" → "Nível 2!") drena em dois cliques com esse intervalo. */
      await page.waitForTimeout(600);
    }
    /* SE UM MODAL FICAR ABERTO, O TESTE PARA AQUI — e a mensagem diz por quê.
       Excluir o modal do axe (tentativa anterior) NÃO resolvia: `.exclude()` impede que ele seja
       CHECADO, mas não remove o escurecimento que ele projeta sobre a página. Com o backdrop no ar,
       todo texto atrás dele passa a ter contraste reduzido de verdade, e o axe reportava o herói
       inteiro de `/sobre` como violação — um defeito que não existe com o modal fechado
       (verificado injetando o axe na página: zero violações em 1280×800 e em 375×812).
       Medir a rota com um modal por cima não mede a rota. */
    await expect(
      dialogos,
      'um modal continuou aberto e escureceria a pagina inteira durante a varredura',
    ).toHaveCount(0, { timeout: 10_000 });

    /* VARRE TODAS AS ABAS, uma por uma — e isto não é zelo, é correção do próprio teste.
       A aba ativa PERSISTE entre execuções. Com "Consumo do mês" aberta, a tabela de comparação
       de `/planos` nem chega a renderizar, e o axe varria uma tela onde o defeito não existia:
       o teste passava sozinho e falhava na suíte inteira, pela mesma revisão de código. Um teste
       cuja cobertura muda em silêncio conforme o estado deixado por outro é pior que nenhum,
       porque dá confiança sem dar garantia. Percorrendo as abas, o que ele cobre não depende de
       onde a sessão anterior parou. */
    /* ESPERAR A ANIMAÇÃO DE ENTRADA TERMINAR — a última causa de falha fantasma.
       As telas entram com `animate-in fade-in duration-300`. Medir no meio da transição é medir
       texto em opacidade parcial: o axe compõe a cor com o fundo e acusa contraste que não existe
       depois que a animação assenta. Era isso que fazia o conjunto de elementos reprovados MUDAR a
       cada corrida — `/sobre` falhava ora no kicker, ora no parágrafo, ora no nome.
       As animações INFINITAS ficam de fora do critério de propósito: os blobs decorativos do herói
       nunca terminam, e esperar por eles travaria o teste para sempre. */
    await page
      .waitForFunction(
        () =>
          document
            .getAnimations()
            .filter((a) => a.effect?.getComputedTiming?.().iterations !== Infinity)
            .every((a) => a.playState === 'finished' || a.playState === 'idle'),
        undefined,
        { timeout: 5000 },
      )
      .catch(() => {});

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
