# Apagar o legado (leia antes de tocar em qualquer arquivo)

Decisão do dono (08/10/2026): o desenho novo passa a ser o **único**, em computador, headset e celular,
sem chave. `questNovo()` e `useQuestNovo()` (`src/lib/dispositivo/telaNovaDoQuest.ts`) já devolvem
sempre `true`. Falta tirar do código o que só existia para o desenho de antes.

## O que cada agente faz, só nos arquivos da sua lista

1. **Tirar a pergunta.** Onde houver `useQuestNovo()` / `questNovo()`, o ramo do desenho novo fica e o
   outro sai inteiro: o `if (!questNovo)`, o JSX de sempre, o componente `…DeSempre`, as funções, os
   tipos, as constantes, os imports e os textos que só o ramo antigo usava. Não deixe `const questNovo
   = true` nem `if (true)`: simplifique até a pergunta sumir.
2. **Apagar arquivos que ficaram sem uso** (componentes, CSS, utilitários), um a um, com
   `git rm <arquivo>`. NUNCA apague pasta em bloco (`rm -rf`, `git rm -r`). Antes de apagar, confira
   com Grep que ninguém mais importa o arquivo. Liste no relatório cada arquivo apagado.
3. **CSS**: regra que só valia fora do desenho novo, ou que pendurava o tabuleiro antigo
   (`[data-qj='…']` dos jogos antigos, `.qm-*`, `.qj-fim`, `.quest-fim`…), sai. Regra sob
   `html[data-quest-novo='true']` continua como está (não troque o prefixo: outros arquivos e testes
   dependem dele). `src/styles/prototipo.css` é GERADO e ainda serve às telas novas: não edite.
4. **O que é do APARELHO não é legado.** `noHeadset()`, `noComputador()`, `noCelular()`,
   `recursosDoAparelho()`, `perfilDoDispositivo()` continuam: decidem limite de aparelho (teclado,
   microfone, voz), não o desenho.
5. **Não mude o desenho novo.** Nenhuma mudança de marcação, texto, estilo ou comportamento do ramo que
   fica. Se achar um defeito, anote no relatório; não conserte de passagem.
6. **Testes da sua lista.** Com a chave fixa, os testes que descreviam o desenho de antes falham. Para
   cada um: se trava APARÊNCIA ou marcação do desenho antigo, apague o teste (ou o arquivo inteiro, com
   `git rm`, se não sobrar nada); se trava REGRA de verdade (pontuação, o que conta como acerto, o que
   é gravado, permissão, cobrança, privacidade, acessibilidade), reescreva contra a tela nova, sem
   perder a garantia. Não apague garantia de regra para "ficar verde": diga no relatório o que não
   conseguiu reescrever. Os testes `tests/polimento*.test.*`, `tests/*DoPrototipo.test.tsx` e
   `tests/quest*.test.tsx` já descrevem o desenho novo: mantêm-se (tire deles só o preparo que ligava a
   chave, se atrapalhar).
7. **Sem `tsc`, sem build, sem a suíte inteira** (máquina com pouca memória; quem roda é o
   orquestrador). Pode rodar: `rtk proxy npx vitest run <seus testes>` (até uns 15 arquivos por vez),
   `rtk proxy npx eslint --max-warnings 0 <seus arquivos>`, `rtk proxy npx prettier --write <seus
   arquivos>`. O ESLint acusa import e variável sem uso: é o seu melhor aviso de sobra.
8. **Sem commit, push, stash ou checkout.** Outros agentes trabalham na mesma pasta. Temporários com o
   seu prefixo, apagados no fim (arquivos, não pastas).
9. Armadilhas: `String.replace(a, b)` com `$$` no texto novo vira `$` (use `split(a).join(b)`); crase em
   `node -e "…"` some no bash (use arquivo temporário); prettier com `semi: true` em `src/` e
   `semi: false` em `tests/`.

## Fora do seu alcance (peça no relatório)

`public/i18n/*.json`, `src/data/i18n/*`, `fidelidade/*.md`, `src/styles/polimento/*`,
`scripts/polimento/*`, `tests/e2e*` (só liste os que dependem do que você apagou), e qualquer arquivo
que não esteja na sua lista.

## O relatório

- Arquivos apagados (lista completa) e arquivos alterados.
- Quantos `useQuestNovo()`/`questNovo()` sobraram nos seus arquivos (o alvo é zero) e por quê.
- Testes: apagados (com o motivo: aparência), reescritos (com a regra que guardam), e os que ainda
  falham.
- Saída final do vitest dos seus testes e do ESLint dos seus arquivos.
- e2e que dependem do que saiu. Defeitos do desenho novo que você viu e não tocou.
