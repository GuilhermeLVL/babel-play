> **Estado em 2026-09-07** (auditoria `openspec/audits/2026-09-07-coerencia.md`): 1 tarefa aberta (6.2, conferencia no navegador). Achado A16: `/creditos` e aliasado para o Cofre em `Loja.tsx` e `/loja/undefined` aparece por abas fora de `ABA_DA_LOJA`; tratado em `contratos-alinhados-nas-tres-pontas`. Ate la, 6.2 nao passa.

## 1. Endereço para o que está à venda

- [x] 1.1 `/creditos` vira rota própria, abrindo a compra de Créditos
- [x] 1.2 `/planos` passa a valer como alias de `/plano` (hoje cai no Hub em silêncio)
- [x] 1.3 Testes das rotas novas em `tests/rotas.test.ts`

## 2. Navegação

- [x] 2.1 Planos entra em `shell/navItems.ts`
- [x] 2.2 O item some na edição leve (não está em `LEVE`). Em self-host SEM cobrança ele fica e
      leva a uma tela que agora DIZ que não há assinatura — melhor do que sumir e deixar a pessoa
      sem entender por que a opção não existe

## 3. Preço de um lugar só

- [x] 3.1 `Planos.tsx:174,178` derivam de `PLAN_MATRIX`
- [x] 3.2 `MenuDaConta.tsx:145` idem
- [x] 3.3 `Planos.tsx:74` ("500 MB"/"1 GB"/"5 GB") deriva de `quotas.armazenamentoMb`
- [x] 3.4 `SkuDeCredito` de `credits.ts:21` passa a importar de `core/creditos`
- [x] 3.5 Teste que reprova preço literal fora da matriz

## 4. Estado honesto sem cobrança

- [x] 4.1 `ComprarCreditos` e `Assinar` dizem que não há compra, em vez de devolver `null`

## 5. Sobre leva ao que anuncia

- [x] 5.1 O trecho que cita o Passe ganha o preço e o caminho até a compra

## 6. Verificação

- [x] 6.1 `npx vitest run` · `npm run typecheck` · `npm run lint` · `npm run audit:gate` ·
      `npx ast-grep scan -c sgconfig.yml src server server.ts`
- [ ] 6.2 Navegador: `/creditos` e `/planos` abrem, Planos aparece no menu
