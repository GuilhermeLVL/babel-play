## 1. Prazo e franquia

- [x] 1.1 `DIAS_DO_TESTE_PREMIUM = 3` e `FRANQUIA_DO_TESTE` de 1 h com a conta de custo (`src/core/planos.ts`)
- [x] 1.2 Trilho com `{dias}` interpolado; site público com "1 hora" no singular (`scripts/site/paginas.ts`)
- [x] 1.3 Aviso de fim do teste em D-1 e D0 (`fimDoTeste.ts`, `ofertas.ts`, `FaixaDaConta.tsx`)
- [x] 1.4 Catálogos `en`/`es`/`ar` com as chaves novas; `xx.json` regenerado; órfãs e cobertura em dia
- [x] 1.5 Termos (3.5), política de privacidade, READMEs, docs vivas, ROPA T12, skill `custo-de-ia`, vitrine

## 2. Freio contra a fábrica de contas

- [x] 2.1 Lista curta de caixas descartáveis (`server/lib/dominiosDescartaveis.ts`), no `POST /teste` e no `/status`
- [x] 2.2 E-mail confirmado pela Admin API, injetável, fechado em erro (`emailConfirmado`, `server/lib/testePremium.ts`)
- [x] 2.3 Marca já usada responde antes da consulta à rede
- [x] 2.4 Teto por IP pseudonimizado no dia (`TESTES_PREMIUM_POR_IP_DIA`, padrão 5) em `usage_counters`

## 3. Testes

- [x] 3.1 `tests/teste-premium-antiabuso.test.ts`: normalização (`a.b+x@GoogleMail.com` = `ab@gmail.com`), descartáveis, números
- [x] 3.2 `tests/integration/teste-premium.test.ts`: 3 dias, 1 h, descartável, não confirmado, Supabase fora, marca sem rede, teto por IP
- [x] 3.3 Testes de tela e ofertas com 3 dias e D-1; snapshots de `/api/billing/status`

## 4. Depende do dono

- [ ] 4.1 Validar com o jurídico a redação nova dos termos (3.5) e da política de privacidade (teste)
- [ ] 4.2 Conferir `SUPABASE_SERVICE_ROLE_KEY` nos secrets do Worker de produção antes do deploy
- [ ] 4.3 Decidir captcha no cadastro (Turnstile) se o abuso aparecer nos números
- [ ] 4.4 Atualizar o modelo de custo `scripts/custo/modelo.mjs` (ainda modela o teste antigo de 14 dias × 2 h)
