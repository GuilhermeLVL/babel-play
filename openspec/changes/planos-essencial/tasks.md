## 1. A matriz

- [x] 1.1 `src/core/planos.ts`: `PLAN_MATRIX` pura (planos, entitlements, quotas em unidades,
      rótulos), sem I/O e sem `process.env`
- [x] 1.2 Teste de paridade servidor↔cliente importando a matriz dos dois lados

## 2. Servidor deriva da matriz

- [x] 2.1 `server/lib/entitlements.ts`: `getEntitlements` lê a matriz; plano desconhecido → `free`
      + log `plano_desconhecido`
- [x] 2.2 `server/lib/usageQuota.ts`: `capForPlan` e `capSegundosParaPlano` leem a matriz, com
      override por env (`PRO_*`, `ESSENCIAL_*`)
- [x] 2.3 `server/lib/storageQuota.ts`: idem para armazenamento
- [x] 2.4 `server/routes/admin.ts`: `z.enum` derivado das chaves da matriz
- [x] 2.5 `.env.example` documenta as envs novas

## 3. Cliente deriva da matriz

- [x] 3.1 `src/lib/entitlements.ts`: tipo, `PLANOS`, `PLAN_LABELS` e `normalizar()` derivados;
      resposta com plano desconhecido não é mais descartada
- [x] 3.2 `src/components/views/Planos.tsx`: tabela com 3 colunas e números medidos

## 4. O bug do /stt/available

- [x] 4.1 `server/routes/ai.ts`: disponível = chave no servidor E (entitlement OU BYOK)
- [x] 4.2 Teste: `essencial` sem BYOK recebe indisponível; `pro` recebe disponível; BYOK libera

## 5. Verificação

- [x] 5.1 Testes quebrados atualizados (`plan-mt-enforcement`, `plan-stt-enforcement`,
      `usage-quota`, `quota-enforcement`, `entitlements-cliente`)
- [x] 5.2 Suíte completa + typecheck + lint + `ast-grep scan` + `openspec validate planos-essencial`
