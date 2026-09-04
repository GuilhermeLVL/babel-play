## Why

O produto terá um terceiro plano — **Essencial, R$ 9,90/mês** (decisão do dono, 2026-08-31):
tradução na nuvem (a maior queixa medida: idiomático 27%→83%) com transcrição local. Os gates
`managedCloudLlm` e `managedCloudStt` já são independentes no servidor, então o plano é natural.

Mas a lista de planos está **copiada à mão em 5 lugares**, e 4 falham em silêncio: uma assinatura
com plano desconhecido degrada para `free` (`server/lib/entitlements.ts:44`), o cliente descarta a
resposta inteira (`src/lib/entitlements.ts:53`), e as quotas devolvem zero. Adicionar um plano sem
consolidar primeiro semearia exatamente essa classe de bug.

E há um defeito que o plano novo tornaria gritante: `/api/ai/stt/available` responde "disponível"
sem checar o plano do usuário — um Essencial seria roteado para o STT de nuvem e receberia 402 no
meio da captura ao vivo.

## What Changes

- **`PLAN_MATRIX` única** em módulo puro compartilhado (`src/core/planos.ts`), importado por
  servidor e cliente — planos, entitlements, quotas e rótulos num lugar só. As 5 cópias manuais
  passam a derivar dela.
- **Plano `essencial`**: `managedCloudLlm` ligado, resto desligado; 12.000 chamadas/mês; 0 segundos
  de STT de nuvem; 1 GB de armazenamento. Tetos sobrescrevíveis por env (`ESSENCIAL_*`).
- **Correção do `/stt/available`**: disponível = chave no servidor **E** (`managedCloudStt` do
  usuário OU credencial BYOK).
- **`Planos.tsx` com 3 colunas**, números medidos em cada uma.
- **BREAKING** interno: `getEntitlements(plan)` deixa de ser booleano `paid` e passa a ler a matriz.

## Capabilities

### New Capabilities
- `matriz-de-planos`: fonte única de planos, entitlements e quotas, compartilhada entre servidor e
  cliente, com plano intermediário Essencial e disponibilidade de STT que respeita o plano.

### Modified Capabilities
<!-- openspec/specs/ ainda não tem specs principais; nada a modificar. -->

## Impact

- Servidor: `server/lib/entitlements.ts`, `usageQuota.ts`, `storageQuota.ts`, `routes/admin.ts`,
  `routes/ai.ts`.
- Cliente: `src/lib/entitlements.ts`, `src/lib/uso.ts`, `src/components/views/Planos.tsx`.
- Novo: `src/core/planos.ts` (puro, sem I/O — o padrão de `promptComunicativo.ts`).
- Testes: `plan-mt-enforcement`, `plan-stt-enforcement`, `usage-quota`, `quota-enforcement`,
  `entitlements-cliente` atualizados; teste novo de paridade da matriz.
- Sem migração de banco: `subscriptions.plan` é texto livre; `essencial` entra sem DDL.
