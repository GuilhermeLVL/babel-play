# Como portar uma tela do protótipo (leia antes de tocar em qualquer arquivo)

O dono desenhou o protótipo `docs/prototipos/polimento-movimento.html` e quer o app **idêntico** a ele:
mesma marcação, mesmos textos, mesmos números de animação. Uma versão "parecida" já foi rejeitada.

**Fontes do protótipo** (leia o código, não adivinhe):
`C:\Users\Guilh\OneDrive\Área de Trabalho\babel-play-lab\docs\prototipos\polimento-movimento-src\*.js|css`.
A especificação extraída dele está em `fidelidade/casca-e-telas.md` e `fidelidade/jogos.md`.

## Regras

1. **O CSS do protótipo já está no app**, copiado por script para `src/styles/polimento/*.css` (não edite
   esses arquivos: são gerados). Ele vale sob `html[data-px='on']`. Para o CSS valer, o componente React
   precisa ter **os mesmos elementos e classes** que o protótipo monta (`px-*`, `q-*`, `pj-*`, `rl-*`…).
2. **O comportamento em JS do protótipo é portado função por função**, com os mesmos valores (ms, px,
   curva, quadros) e um comentário com `arquivo:linha` de origem. Reuse `src/lib/polimento/base.ts`
   (`anima`, `limpar`, `contar`, `MOLA`, `MOLA_SUAVE`, `EO`, `EIO`, `EG`, `polido`, `reduz`),
   `folha.ts`, `dialogos.ts`, `telas.ts`. Não invente curva nem duração.
3. **A aparência é a do protótipo; o dado é o real.** Onde o protótipo tem dado de mentira (números
   fixos, nota sorteada), a tela mostra o dado do app com a mesma forma.
4. **O que o app tem e o protótipo não mostra sai da tela nova e NÃO é portado.** Anote no relatório
   (tela, item, onde estava, o que fazia). O que não se vê continua funcionando (gravar, salvar, atalhos).
5. **O desenho antigo fica intacto por enquanto**: mexa só no ramo do desenho novo (`useQuestNovo()`),
   ou crie o componente novo e escolha por `useQuestNovo()`, como `culturais/TenseTennisGame.tsx` faz
   com `RaliDoPrototipo.tsx` (o exemplo a seguir para jogos).
6. **Sem emoji; ícones `lucide-react`.** Textos de interface passam por `t()`/`tp()` de `src/lib/i18n`.
7. **Só toque nos arquivos da sua lista.** Estes são de mais de uma tela e são do orquestrador: não
   edite, peça no relatório o que precisa neles: `src/styles/quest.css`, `questBase.css`,
   `questConta.css`, `src/styles/polimento/*`, `views/ajustes/quest/AbasDoQuest.tsx`,
   `views/play/quest/pecasDoQuest.tsx`, `shell/TrilhoDoQuest.tsx`, `src/App.tsx`,
   `scripts/polimento/trazer-css.mjs`, `public/i18n/*.json`, `src/data/i18n/*`, `fidelidade/*.md`,
   `src/lib/polimento/base.ts`. CSS novo que seja só da sua tela vai num arquivo seu, importado pelo
   seu componente (nunca por `main.tsx`).
8. **Não faça commit, push, `git stash`, `git checkout` nem apague arquivos.** Outros agentes estão
   trabalhando na mesma pasta ao mesmo tempo.
9. **Máquina com pouca memória.** NÃO rode `tsc`, `npm run build`, a suíte inteira nem o lint do
   projeto todo. Pode rodar: o teste do seu arquivo (`rtk proxy npx vitest run tests/<seu>.test.tsx`),
   `rtk proxy npx eslint --max-warnings 0 <seus arquivos>`, `rtk proxy npx prettier --write <seus arquivos>`
   e o comparador abaixo. Um de cada vez.
10. Armadilhas: crase dentro de `node -e "..."` some no bash (use um arquivo `_x.cjs` e apague depois);
    prettier com `semi: true` em `src/` e `semi: false` em `tests/`.

## Prova lado a lado (obrigatória)

O app está em `http://localhost:3177` (não derrube). Escreva um roteiro em
`scripts/polimento/roteiros/<sua-tela>.json` e rode
`node scripts/polimento/comparar.mjs scripts/polimento/roteiros/<sua-tela>.json`
(formato do roteiro no topo de `scripts/polimento/comparar.mjs`; exemplo: `roteiros/inicio.json`).
Ele abre o app e o protótipo na mesma medida, com "reduzir movimento" pedido ao sistema e armazenamento
vazio, e lista o que difere em caixas, estilos e animações. As capturas ficam em
`test-results/comparar/<nome>/` (olhe as duas imagens com a ferramenta Read). `--so app` ou `--so proto`
mostra um lado só, útil para descobrir os seletores do protótipo.
No protótipo, a navegação é por clique (`{"texto": "Jogar"}`, `{"clicar": "[data-px='...']"}`) e os
jogos abrem por `"busca": "?jogo=<id>"`. No app local: `babel.liberado=1` já é gravado pelo comparador;
`babel_tour_<jogo>=1` marca a primeira partida como vista.
Diferença aceita: só a que vem de dado real (texto, quantidade, largura por causa de barra de rolagem).

## O relatório que você devolve

- O que ficou idêntico e a saída final do comparador (as diferenças que restaram e por quê).
- Arquivos criados e alterados.
- **Pedidos ao orquestrador**: textos novos para o inglês (`"português": "english"`), mudanças nos
  arquivos compartilhados (o trecho exato), itens para `ficou-de-fora.md`.
- O que NÃO deu para fazer, dito sem rodeio. Não diga "feito" sem ter visto no comparador.
