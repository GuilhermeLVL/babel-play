## Why

A tela de Planos existe e o fluxo de assinar está pronto, mas a descoberta é fraca: uma linha
discreta no Hub, um botão em Ajustes e um item no menu do avatar — o próprio dono não a achou.
Falta o padrão de mercado: um card visível dizendo que há planos, a partir de quanto, e onde
assinar.

## What Changes

- Componente `CardDePlanos` reutilizável; preço lido de `PLAN_MATRIX` (fonte única).
- Hub: a linha discreta (`Hub.tsx:307-320`) vira card visível.
- MenuDaConta: item Planos ganha "a partir de R$ 9,90/mês".
- Banner quando qualquer quota passa de 90%% (`Planos.tsx:110` já calcula).
- Regras: só para `free`/`anonimo`; nunca para assinante ou self-host; dispensável com memória
  em localStorage; nada de popup no primeiro carregamento.
