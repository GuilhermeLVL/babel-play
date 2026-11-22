## Why

Migaku ("1 desconhecida"), Language Reactor e Trancy (palavras novas do vídeo por frequência) e o Refold (sentence mining
i+1) convergem: a frase com EXATAMENTE UMA palavra desconhecida é o melhor cartão, e a palavra que mais aparece rende mais.
O Frasy já sabe quanto da sessão a pessoa conhece (`cobertura-em-sessoes-e-livros`), mas não diz o que estudar dela
(relatório `docs/pesquisa/2026-11-ecossistema-de-aprendizado/engenharia-reversa-extensoes.md`).

## What Changes

- **Core puro** `src/core/leitura/paraEstudarDaSessao.ts`: das falas, do idioma e do conjunto de conhecidas, devolve (a) as
  frases i+1 com a palavra-alvo e (b) as palavras novas por frequência. Mesma régua da cobertura (funcionais, nomes próprios,
  flexão por lema, elisão) e mesmo portão de honestidade (idioma sem espaço, pouco texto: `null`).
- **Hook** `useParaEstudarDaSessao`: o mesmo portão da cobertura (conta e sessões mínimas), calculado em tempo ocioso.
- **UI** `src/components/views/analise/ParaEstudarDaSessao.tsx`, na tela da sessão (aba Transcrição), recolhida: abas
  "Frases com 1 palavra nova" e "Palavras novas". "Guardar como cartão" usa o mesmo fluxo da folha da palavra
  (`salvarNaFolha`), com a frase como contexto; "Já sei" usa `alternarMarcacao`. Nenhuma rota nova.
- **i18n**: chaves em `en`, `es` e `ar`.

## Fora do escopo

Idiomas sem espaço entre palavras; agrupar flexões na lista de palavras; níveis CEFR fora do inglês (a lista só existe nele).
