# Planos v4, etapa 1 (matriz, cobrança, teste e tela atrás de `venda_planos_v4`) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Com a chave `venda_planos_v4` ligada (só no staging), o Frasy vende o Plus (R$ 14,90/mês · R$ 149,00/ano), mostra a Família e o Pro como "em breve", deixa de vender Essencial/Premium/Ao Vivo, o teste de 14 dias passa a ser do Plus e o servidor cobra e concede o plano certo pelo valor. Com a chave desligada, nada muda.

**Architecture:** Os planos novos entram em `PLAN_MATRIX` (fonte única, `src/core/planos.ts`); "em breve" = plano na matriz cuja flag de abertura nunca foi ligada; "fim de venda" dos v3 = campo novo `encerradoPor`. A tela já é dirigida por dados (`ORDEM_DOS_PLANOS` filtrada por `aVenda`); ganha os ramos dos ids novos e o modo v4 (três cartões + Família como linha). Os recursos de IA novos (explicação da frase, resumo→cartões) são a etapa 2: aqui aparecem como "em breve" dentro do cartão do Plus.

**Tech Stack:** TS, React 19, Express, Drizzle (SQLite/PGlite em testes, Postgres em produção), Vitest, Playwright.

**Spec:** `docs/specs/2026-10-24-planos-v4.md` (aprovada 24/10/2026; perguntas 2 e 3 pela recomendação: teste do Plus; Pro "em breve" sem preço). Mapa do código com arquivo:linha: `.superpowers/sdd/2026-10-24-planos-v4-etapa-1/mapa-do-codigo.md`.

## Global Constraints

- Ids: `plus`, `familia`, `pro4` (rótulos "Plus", "Família", "Pro"). NUNCA o id `pro` (alias legado de `premium`, `PLANOS_LEGADOS`).
- Preços: Plus 14,90 / 149,00; Família 24,90 / 249,00; Pro 34,90 / 349,00. Anual = 10 mensalidades. 12x (`PARCELAS_DO_ANUAL`).
- Flags: `venda_planos_v4` (vende Plus; encerra Essencial, Premium e Ao Vivo); `venda_familia` e `venda_pro4` (abrem Família/Pro; nascem desligadas e NÃO são ligadas nesta etapa). Toda flag nova nasce desligada (migração SQLite + journal + seed PG).
- Cotas (QuotasDoPlano): Plus `sttSegundosMes` 28.800 (8 h), `sttSegundosDia` 7.200, `tokensMes` 2.000.000, `tokensDia` 200.000, `vozCaracteresMes` 150.000, `vozCaracteresDia` 15.000, chamadas e armazenamento no meio entre Essencial e Premium. Família: stt 43.200 s/mês (12 h), tokens 3.000.000, voz 600.000. Pro: stt 72.000 s/mês (20 h), dia 7.200, tokens 3.000.000, voz 600.000. Entitlements Plus = os do Premium menos `interpreteAutomatico`; Família = Plus; Pro = Premium (`interpreteAutomatico` true).
- Perfil protegido (menor ou idade não declarada) nunca vê preço, oferta ou "peça aos pais" (motor de ofertas + `perfilProtegido`). Copy pela skill `.claude/skills/copy-br-etica/SKILL.md`.
- Gemini proibido; nenhum texto promete recurso que não existe: o que não existe diz "em breve".
- pt-BR; toda frase de UI por `t()` com en/es/ar em `public/i18n` + regenerar xx/cobertura.
- Preço literal só onde `tests/precos-de-um-lugar-so.test.ts` permite (o preço vem da matriz).
- Nunca enfraquecer teste; os testes v3 continuam passando com a chave v4 desligada.
- Commits na main com `git pull --rebase` antes do push; nunca matar o pid do dev server alheio (data/pg); e2e em porta e banco próprios (`PORT=… BASE_URL=… DATABASE_URL=pglite:<dir próprio>`).

## Review Focus

1. Webhook com valor que casa com mais de um plano (parcela 12,49 do Plus × Premium): nunca concede o plano errado.
2. Chave v4 ligada + pessoa que já tem Premium (staging): a tela mostra a assinatura dela e não quebra; trocar só oferece o que está à venda.
3. Perfil protegido com a chave v4 ligada: nenhum preço, nem a linha da Família, nem "em breve" com preço.
4. Chave v4 desligada: tela, checkout, teste e ofertas idênticos aos de hoje (testes v3 verdes).
5. Anual desligado (`ANUAL_ENABLED` falso) com v4: o Plus aparece só mensal.

---

### Task 1: Matriz v4, fim de venda dos v3, flags e modelo de custo

**Files:** `src/core/planos.ts`, `src/core/flags.ts`, migração SQLite nova (`server/db/migrations-sqlite/` + `meta/_journal.json`) e seed PG (seguir o padrão da 0048 e de `migrations-pg/`), `scripts/ia/simular-custo.ts`, `server/lib/tetoUsdDaConta.ts` (+ `.env.production.example`/`server/lib/config.ts` se as variáveis forem listadas lá), testes `tests/planos-matriz.test.ts` e um novo `tests/planos-v4-matriz.test.ts`.

- Constantes `FLAG_VENDA_PLANOS_V4 = 'venda_planos_v4'`, `FLAG_VENDA_FAMILIA = 'venda_familia'`, `FLAG_VENDA_PRO4 = 'venda_pro4'`.
- `DefinicaoDePlano.encerradoPor?: readonly string[]`: o plano sai de `planosAVenda` quando QUALQUER flag dessa lista está ligada. Essencial, Premium e Ao Vivo ganham `encerradoPor: [FLAG_VENDA_PLANOS_V4]`.
- Entradas `plus` (`flagsDeVenda: [v4]`), `familia` (`[v4, venda_familia]`), `pro4` (`[v4, venda_pro4]`), com os valores das Global Constraints. Ordem na matriz: free, essencial, premium, aovivo, plus, familia, pro4, selfhost.
- `planoPeloPagamento` deixa de devolver o primeiro da ordem quando o valor casa com mais de um plano: assinatura nova `planoPeloPagamento(valor, { parcelas?, preferido?: PlanoPago | null })` → se casa com um só, ele; se com vários, o `preferido` quando estiver entre eles; senão `null` (ambíguo). Exportar `valoresCobraveis(plano)` (mensal, anual, parcela padrão e última).
- `PLANO_DO_TESTE` vira `planoDoTeste(flagLigada: (k: string) => boolean): PlanoPago` (`plus` com v4 ligada, `premium` sem). Manter `PLANO_DO_TESTE` exportado como `'premium'` só se algum chamador sem flags precisar (justificar no relatório).
- `TETO_USD_MES_PLUS`, `_FAMILIA`, `_PRO4` lidos como os demais (sem valor → mesmo padrão dos outros).
- `simular-custo.ts`: aceita `--plus --familia --pro4` (assinantes) e calcula com as cotas da matriz, o pior custo de R$ 0,65/h de nuvem da spec e o anual = 10 mensalidades; imprime a margem do anual por plano.
- Testes (novo arquivo): (a) os 6 valores cobráveis v4 (3 mensais, 3 anuais) identificam o plano; (b) `planosAVenda` com v4 ligada = `['plus']` (anual à parte); com v4 + venda_familia + venda_pro4 = `['plus','familia','pro4']`; com v4 desligada = o de hoje; (c) a parcela 12,49 é ambígua entre Plus e Premium → `null` sem preferido, `plus` com `preferido:'plus'`, `premium` com `preferido:'premium'`; (d) um teste que enumera TODOS os valores cobráveis de todos os planos pagos e falha se aparecer colisão nova além da Plus×Premium conhecida; (e) com cota cheia no pior custo, a margem do anual de Plus, Família e Pro é ≥ 0 (função pura exportada pelo modelo de custo ou reproduzida no teste a partir da matriz); (f) `planoDoTeste`.

### Task 2: Servidor — venda, webhook, teste de 14 dias

**Files:** `server/routes/billing.ts` (`planosAVendaPara`, /assinar, /trocar, /teste, /status), `server/lib/billingEventos.ts` (:314, :687), `server/lib/entitlements.ts` (:99-102), `server/lib/testePremium.ts`, `server/lib/usageQuota.ts` (só se o plano do teste for lido lá), `server/routes/me.ts`; testes de integração novos `tests/integration/planos-v4-venda.test.ts`.

**Interfaces:** consome `planoPeloPagamento(valor,{parcelas,preferido})`, `planoDoTeste(flagLigada)`, `encerradoPor` da Task 1.

- `planosAVendaPara(req)` respeita `encerradoPor`. /assinar e /trocar recusam (503 `plano_indisponivel`) Premium/Essencial com v4 ligada e Família/Pro sem as flags deles.
- Webhook: passa como `preferido` o plano da intenção/assinatura pendente que já existe no fluxo (ver como "intenção" é guardada hoje); valor ambíguo sem preferido NÃO concede (registra e mantém o estado, como já faz com valor desconhecido) — nunca cai em `planoPagoMaisBarato()` quando houve valor ambíguo.
- Teste de 14 dias: o plano concedido é `planoDoTeste(flagLigada)` avaliado na concessão e gravado; quem começou o teste no Premium segue no Premium até acabar. Mesma `FRANQUIA_DO_TESTE`.
- Testes de integração: assinar Plus mensal e anual (12x) com v4 ligada → assinatura `plus`; webhook com parcela 12,49 de um checkout Plus → `plus`; mesmo valor sem intenção → não concede; assinar Premium com v4 ligada → 503; Família/Pro → 503; teste com v4 → `plus`, sem v4 → `premium`; os testes v3 existentes seguem verdes.

### Task 3: Tela de Planos v4, checkout e ofertas

**Files:** `src/components/views/Planos.tsx`, `src/components/views/planos/{quatroPlanos.ts,dados.ts,Checkout.tsx,DialogoTrocar.tsx,…}`, `src/styles/polimentoPlanos4.css`, `src/lib/assinatura.ts`, `src/lib/planoDoCheckout.ts`, `src/core/ofertas.ts`, `src/lib/ofertas/*`, `src/components/ofertas/HostDeOfertas.tsx`, os pontos com `'premium'` fixo do mapa (LiveCapture, ModoInterprete, Analysis, CardDePlanos, TrilhoDoQuest, InicioDoQuest, loja, intencaoDeLogin) e a captura (`quemTemONivel`/FolhaDoCadeado); i18n; testes `tests/planos-tela-v4.test.tsx` + `tests/e2e-publico/planos-v4.e2e.ts`.

**Interfaces:** consome a matriz/flags da Task 1 e `/api/billing/status.planosAVenda` da Task 2. Produz `planoDeEntrada(flagLigada): PlanoPago` (o plano que as ofertas e os "Ver o plano" sugerem: `plus` com v4, `premium` sem), em `src/core/planos.ts` ou `src/lib/assinatura.ts`.

- Modo v4 (chave ligada): três cartões — Grátis, Plus, Pro ("em breve", sem preço e sem botão de compra; uma frase do que ele vai ter) — e a Família como linha abaixo do Plus ("para até 4 pessoas · R$ 24,90/mês · em breve", sem botão). Recomendado: Plus.
- Cartão do Plus, pela tabela da spec: o que já existe hoje vira item normal (Nuance + polir + glossário, tutor por texto/iChat, voz natural até 150 mil caracteres, 8 h de nuvem, sem anúncios); explicação da frase no contexto e resumo→cartões aparecem como "em breve" (etapa 2). Grátis: tudo no aparelho sem limite, com o modelo Preciso; a amostra de IA só aparece quando existir (etapa 2).
- Comparação e FAQ v4: anual "2 meses grátis" (10 mensalidades), teste de 14 dias do Plus sem cartão, Pix Automático só se já existir no checkout (não prometer), cancelar em um toque.
- Checkout aceita `plus` (mensal e anual 12x); `planoDoCheckout` restaura `plus`.
- Ofertas, selo do teste e cópias "14 dias de Premium" usam `planoDeEntrada`/`planoDoTeste`; com a chave desligada, idênticos a hoje.
- Perfil protegido: nenhum preço, nenhuma linha da Família, nenhum "em breve" com preço, nenhuma oferta (motor já recusa; cobrir com teste).
- Testes: v4 ligada → cartões Grátis/Plus/Pro, Família como linha, nenhum botão de compra em Pro/Família, Plus com 14,90 e 149,00; v4 desligada → snapshot de comportamento igual ao de hoje (testes v3 existentes verdes); protegido → nenhum "R$"; checkout Plus monta; e2e público com a prova `babel.px.planosAVendaDeProva` (ou a flag) em 375 e 1280, axe sem violação grave.

### Task 4: Fechamento

- `verificador` (typecheck, lint, test, build), revisão final, ligar `venda_planos_v4` no staging (Admin → Flags ou `operacao.cjs flags ligar`), deploy staging, conferir a tela no staging.
