## Context

Hoje: `type Plan` no servidor (`subscriptions.ts:8`), lista `PLANS` duplicada no guard
(`server/lib/entitlements.ts:24`), tipo e lista do cliente com `anonimo` a mais
(`src/lib/entitlements.ts:21,47`), `z.enum` do admin (`admin.ts:55`) e comentário no schema — cinco
cópias. `getEntitlements` é um booleano `paid` que liga 4 flags de uma vez
(`server/lib/entitlements.ts:52-62`). As quotas são três funções `if (plan === 'pro')`.

## Goals / Non-Goals

**Goals:** uma fonte de verdade; plano Essencial funcionando de ponta a ponta (entitlement, quota,
UI, admin); disponibilidade de STT honesta com o plano; falha barulhenta em vez de degradação
silenciosa quando um plano for desconhecido.

**Non-Goals:** cobrança (E3); mudar preços de quota do Pro; landing; migrar `anonimo` (é estado do
CLIENTE, não plano de assinatura — fica fora da matriz).

## Decisions

**1. A matriz vive em `src/core/planos.ts`, módulo puro.** O servidor já importa de `src/lib/`
(`promptComunicativo.ts` em `mtProxy.ts`) — o precedente existe e o Vite/tsx resolvem dos dois
lados. `src/core/` é a camada isomórfica do projeto. Nada de I/O, nada de `process.env` no módulo:
os overrides por env são aplicados pelo CHAMADOR do servidor (quotas), porque `process.env` no
bundle do cliente é mentira estática.

**2. `anonimo` fica fora da matriz.** É identidade do cliente sem conta, não plano de assinatura.
O tipo do cliente continua `PlanoDeAssinatura | 'anonimo'` — a matriz cobre só o que o servidor
pode atribuir.

**3. Quotas na matriz em UNIDADES, com override por env no servidor.** A matriz declara os
defaults (`chamadasMes`, `sttSegundosMes`, `armazenamentoMb`; `null` = ilimitado). As funções de
quota do servidor leem a matriz e aplicam `PRO_MONTHLY_*`/`ESSENCIAL_*` quando presentes — a
semântica atual (env vence) não muda para o Pro.

**4. Plano desconhecido continua degradando para `free` no servidor — mas passa a LOGAR.** Falhar
fechado (500) numa linha de banco corrompida derrubaria a conta inteira do usuário; degradar para
`free` é seguro e agora deixa rastro (`event: 'plano_desconhecido'`). No cliente, `normalizar()`
deixa de descartar a resposta: plano fora da lista vira `free` + flags do servidor — a UI mostra o
que o servidor mandou em vez de fechar tudo.

**5. `/stt/available` responde por USUÁRIO.** `sttDeNuvemConfigurado() && (hasEntitlement(user,
'managedCloudStt') || temCredencialByok(user))`. O contrato do cliente não muda (`r.ok`), só a
verdade da resposta. O espelho exato da correção já feita no MT.

## Risks / Trade-offs

- **Import cruzado servidor→`src/core`**: risco de alguém futuro colocar I/O na matriz. Mitigação:
  cabeçalho explícito + o teste de paridade importa dos dois lados e falharia num require de Node.
- **`essencial` gravado no banco antes do deploy do webhook**: só o admin concede planos hoje, então
  o risco de linha órfã é zero até o E3.
- **BYOK no `/stt/available`**: checar credenciais adiciona uma ida ao banco por chamada — aceitável
  (a rota é chamada uma vez por início de captura).
