## Why

O teste de 14 dias acaba nos 14 dias OU na franquia de nuvem (`FRANQUIA_DO_TESTE`, 3 h), mas o aviso de fim só falava do
prazo (D-3 e D0). Quem gastava as 3 h antes via o aviso de cota do MÊS ("a cota volta no dia 1º"), que não é verdade para o
teste. Pendência 2.1 da change `teste-por-uso`.

A pendência 2.3 (teto em dólar por conta nos planos pagos) pede uma trava em unidade de dinheiro. O dono ainda não definiu o
número: `docs/estrategia-comercial-e-custos-br.md` traz o custo máximo por plano (US$ 0,29 Essencial, US$ 1,76 Premium), não
um teto nem uma margem de segurança. Por isso entra só a estrutura, DESLIGADA.

## What Changes

- **Aviso do fim do teste por uso** (`src/core/ofertas.ts`, `src/lib/ofertas/fimDoTeste.ts`, `HostDeOfertas`): duas fases novas do
  momento `fim_do_teste`, `uso_perto` (a partir de 80% da franquia) e `uso_acabou` (100%). Quem está no teste recebe estas no
  lugar de `cota_proxima`/`fim_de_cota`. Texto honesto e sem pressão: o que segue (a legenda no aparelho, sem limite), que nada é
  cobrado sozinho e o caminho para os planos. Funcional: vale com a flag de ofertas desligada. Usa `GET /api/me/uso`, que já
  devolve o teto do teste.
- **Teto em dólar por conta** (`server/lib/tetoUsdDaConta.ts`, `server/ai/reservaDeNuvem.ts`, `orcamentoDeIa.ts`): variáveis
  `TETO_USD_MES_ESSENCIAL`, `TETO_USD_MES_PREMIUM` e `TETO_USD_MES_AOVIVO` (US$ por conta e por mês). **Ausentes = desligado**:
  nada é contado, nada é recusado, nenhuma escrita nova. Ligado, o gasto entregue soma por conta no mês e, ao atingir o teto, o
  LLM (tradução, tutor, polimento), o STT e a voz recusam com 402 `teto_usd_da_conta`; o cliente cai no aparelho. O log leva
  só plano e valores.

## Non-Goals

- Escolher o número do teto (decisão do dono) e ligá-lo em produção.
- Mudar cotas, preços ou a franquia do teste.
- Oferta de compra para menores ou contas restritas (continuam só com o aviso funcional).
- Limite por dispositivo no teste (pendência 2.2).

## Impact

- `src/core/ofertas.ts`, `src/lib/ofertas/fimDoTeste.ts`, `src/components/ofertas/HostDeOfertas.tsx`, `public/i18n/en.json` (e `xx.json`).
- `server/lib/tetoUsdDaConta.ts` (novo), `server/lib/orcamentoDeIa.ts`, `server/ai/reservaDeNuvem.ts` e os cinco núcleos de IA que reservam.
- Sem migração: o contador novo usa `usage_counters`.
- Risco: ligar o teto no meio do mês começa a contar daquele momento. O gasto contado é a estimativa de `registrarGastoDeIa`.
