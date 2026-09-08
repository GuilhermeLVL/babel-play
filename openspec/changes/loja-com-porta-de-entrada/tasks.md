# Tarefas — onda 2

## 1. Montar as duas organizações

- [x] 1.1 Chave temporária de bancada (`src/lib/organizacaoDaLoja.ts`), cercada por
      `import.meta.env.DEV`, com a condição de remoção escrita no próprio arquivo
- [x] 1.2 Organização em três pilares: Recompensas (Passe e Desafios como sub-abas) · Loja ·
      Meu visual, com o sub-seletor centrado
- [x] 1.3 Seletor visível na tela para alternar entre as duas
- [x] 1.4 As duas exercitadas por e2e nas quatro superfícies, para a comparação ser sobre
      arrumação e não sobre uma delas estar quebrada

## 2. Decidir vendo

- [x] 2.1 Medir a terceira organização da branch (`GamificacaoHub`) antes de compará-la: duas
      abas, sem porta para Passe nem para Loja — fora da comparação, com o motivo registrado
- [x] 2.2 Comparação no navegador, nas duas, com captura
- [x] 2.3 Decisão: ficam as quatro portas; entra o agrupamento por verbo que os pilares acertaram
- [x] 2.4 Reordenar para `Meu visual · Loja · Passe · Desafios`, com o porquê na barra

## 3. Limpar a bancada

- [x] 3.1 `src/lib/organizacaoDaLoja.ts` removido
- [x] 3.2 Seletor removido da tela; nenhuma referência a `emPilares`/`abaVisivel` sobrou
- [x] 3.3 Conteúdo do Passe e dos Desafios montado uma vez só

## 4. Portões

- [x] 4.1 `npm run typecheck` e `typecheck:core`
- [x] 4.2 `rtk proxy npm run lint` — 0 avisos
- [x] 4.3 `npx vitest run`
- [x] 4.4 `morto:arquivos` e `morto:ciclos`
- [x] 4.5 i18n (os quatro), `audit:gate`, `ast-grep`, `build`, `workflows:validar`
- [x] 4.6 e2e por JSON
