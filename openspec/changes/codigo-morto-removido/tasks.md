> **Entregue.** Esta era a última da auditoria, e rodou por último de propósito: o que sobra
> depende do que as outras aproveitaram. A previsão se confirmou — o inventário de 07/09 estava
> vencido, e foi refeito do zero antes de qualquer remoção. As decisões estão em `design.md`.

## 1. Inventario pos-changes

- [x] 1.1 `knip`, `madge --circular/--orphans`, `depcheck`, `eslint` e `ast-grep scan` rodados de novo, com os números antes e depois de configurar em `design.md`. **O primeiro trabalho foi escrever `knip.json`:** sem ele a ferramenta não sabia que testes, scripts e os três workers são pontos de entrada, e chamava de morto tudo que só eles usam (44 arquivos "sem uso" viraram 10; 144 exports viraram 48). Agir sobre a saída de uma ferramenta não configurada teria removido código vivo. Depois disso, cada símbolo foi conferido com busca por palavra inteira: dos 48, 43 eram órfãos de verdade.
- [x] 1.2 Decisões em `design.md`: `ocr.ts`/`tesseract.js` REMOVIDOS (a change `vision-ocr-web` que o comentário citava nunca existiu — nem aberta nem arquivada); `@axe-core/playwright` REMOVIDO (uma catraca de acessibilidade merece a própria mudança, com decisão sobre as violações que vai achar; instalar dependência "para depois" é o padrão que esta change acaba); `/api/admin/*` FICAM — "sem tela" não é "sem leitor", elas são um console de operador com teste de RBAC, e duas delas nasceram nesta mesma rodada como o caminho documentado de operar.

## 2. Remocoes

- [x] 2.1 Arquivos sem importador: `src/gateway/ocr.ts` e `src/core/learning/cefr.ts` (o `estimateCefr` @deprecated, que só aparecia em comentários de quem o substituiu). Os 15 que a auditoria listava já tinham saído com as mudanças anteriores e a limpeza da árvore.
- [x] 2.2 54 exports e tipos sem uso, em três lotes verificados por typecheck e suíte a cada lote. Entre eles o resto do Leitner (`LeitnerStrategy`, `getScheduler`, `getNextCard`, `gradeFromCorrect`, `isNewCard`), nove interfaces do contrato liftado do app desktop, três atalhos de som "de compatibilidade" sem um único chamador, e `ABAS_QUE_EXIGEM_CONTA`/`abaExigeConta` — um par que declarava uma trava que nada aplicava, e que por isso fazia quem lesse o arquivo concluir que a trava existia.
- [ ] 2.3 Rotas sem consumidor. **Decidido que ficam**, com o motivo em `design.md`: as de admin são console de operador; `distribuicao-dificuldade` passou a medir algo real quando `recalcularDificuldade` ganhou gatilho; `:id/ocorrencias` lê tabela viva com repositório testado. `POST /api/ai/llm/chat/completions` (achada pelo teste de paridade de rotas) é a única sem leitor de verdade e fica registrada aqui — remover uma rota de gateway sem saber se algum operador a chama é decisão de quem opera.
- [x] 2.4 Dependências sem uso: `tesseract.js` e `@axe-core/playwright`. Os outros seis que o `depcheck` acusava eram ferramentas de linha de comando chamadas por `npx` e por script — falso positivo, e agora declarados em `knip.json`.
- [x] 2.5 Os DOIS ciclos, e não só o previsto. `filtro.ts ↔ source.ts` era de tipo (some no build, mas o grafo continua cíclico); `loja.ts ↔ desbloqueios.ts` era de valor — dois módulos que só carregam se o outro já tiver carregado, funcionando pela ordem em que o bundler resolveu avaliá-los. `madge --circular` devolve vazio.

## 3. Erros engolidos e lint

- [x] 3.1 Os 7 `catch {}` de `soundFx.ts` **já não existiam**: hoje são 2, os dois com motivo escrito, e a regra `catch-vazio` do ast-grep não acha nenhum no repositório inteiro. O achado envelheceu com as mudanças anteriores, e isso fica dito em vez de virar trabalho inventado.
- [x] 3.2 155 avisos → **0**, e `--max-warnings 0` no script de lint. 142 eram mecânicos (tratados por script guiado pelo JSON do eslint, com transformação declarada); 13 exigiram leitura, e o que ela achou não era formatação: um tutor inteiro em `Reading.tsx` com chamada de LLM que nada renderizava e nada chamava, um mapa de recordes em `Play.tsx` que ia à rede a cada toque para jogar a resposta fora, e seis jogos calculando um progresso que não desenhavam. As três supressões de `exhaustive-deps` que ficaram dizem, na linha de cima, o que pioraria se a dependência entrasse — e uma supressão MORTA foi removida do `BlitzGame`.

## 4. Gates

- [x] 4.1 `npm run morto:arquivos` (knip: arquivos, dependências, imports não declarados) e `npm run morto:ciclos` (madge) no `ci.yml`. **A cobrança é sobre arquivo, dependência e ciclo — não sobre export sem uso**, e o porquê está em `design.md`: export sem chamador é ruído de barril e gatear nele produziria falha por algo que não é defeito, com a resposta previsível de alguém desligar o gate inteiro. Verificado que o gate MORDE: um arquivo órfão injetado faz o passo sair com código 1.
- [x] 4.2 Suíte verde (2.903), typecheck, typecheck:core, lint sem aviso, build, i18n, audit:gate, ast-grep e e2e 18/18.
