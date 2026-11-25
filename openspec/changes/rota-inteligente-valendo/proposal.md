> **Só spec (25/11/2026).** Aberta no fechamento de `planos-v3-e-rota-inteligente` (decisão do dono 7, recomendação assumida). Nenhum
> código nasce aqui antes de `roteador-adaptativo-em-sombra` sair da sombra; `politicaDeRota.ts` e `pipelineDeFala.ts` ficam reservados.

## Why

A política de rota (`src/core/rota/politicaDeRota.ts`) existe, roda em modo sombra e é conferida contra a decisão real
(`src/lib/captura/conferenciaDaRota.ts`), mas nada a deixa decidir: `politicaLigada` nunca é passado como `true` e a flag
`rota_inteligente` não tem migração. Dois fatos novos desde 09/10 mudam o que "valendo" significa:

- `stt_aparelho_primeiro` (migração PG 0010) já faz o aparelho primeiro no Parakeet, com `src/core/rota/audioDificil.ts`; a política
  precisa reconhecer essa decisão, não contrariá-la.
- `parciais-incrementais` (flags `parciais_parakeet` e `parciais_vivos`, desligadas) muda o que é "parcial": a política precisa
  conhecê-los antes de a flag abrir, para não decidir como se não existissem.

## What Changes

- Flag `rota_inteligente` (migração, desligada) lida por `politicaLigada`; desligada, zero divergência da conferência.
- A política decide em `pipelineDeFala`, `traducaoDaFala` e no gateway quando ligada, com a tabela aparelho × plano × tarefa × estado.
- Abertura por percentual, com reversão ensaiada (flag off).
- Sobras da transparência: botão "Testar sem internet" na folha "Como isto funciona" (5.2 antiga), textos nos catálogos (5.5) e a
  correção determinística de vocabulário (Q.7), mais as medições em aparelho real (Q.3, Q.4).

## Non-Goals

- Nuvem ao vivo e plano Ao Vivo: abandonados (ver `tasks.md` de `planos-v3-e-rota-inteligente`, grupo 10).
- Mudar cotas, preços ou planos: só `src/core/planos.ts`, e nesta change não muda.
- Moonshine v2 em fluxo (Q.5 antiga): abandonada, o inglês já fica no aparelho.

## Impact

Código: `politicaDeRota.ts`, `pipelineDeFala.ts`, `traducaoDaFala`, gateway, `FolhaComoFunciona.tsx`, catálogos i18n. Banco: só a
migração da flag. Depende de `roteador-adaptativo-em-sombra` (medições 4.1 a 4.3 e staging, [B] e [D]). Menores: o perfil protegido
continua só no aparelho em qualquer estado da flag.
