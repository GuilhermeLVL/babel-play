## 1. Implementação

- [x] 1.1 `FRANQUIA_DO_TESTE` com a conta de custo (`src/core/planos.ts`)
- [x] 1.2 Teto "em teste" nas quatro reservas e em `/api/me/uso` (`usageQuota.ts`, `me.ts`)
- [x] 1.3 Testes de integração: tetos, recusa no teto, estorno, assinante, voz (`tests/integration/teste-premium.test.ts`)

## 2. Pendências

- [ ] 2.1 Aviso de fim do teste por USO (hoje só D-3 e D0): a 80% das 3 h, com o texto "suas horas de teste estão acabando"
- [ ] 2.2 Limite por dispositivo/rede no teste (anti-abuso além do e-mail)
- [ ] 2.3 Teto em dólar por conta nos planos pagos (hoje só o convidado e o alívio têm)
