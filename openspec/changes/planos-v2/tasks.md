> Plano aprovado: `functional-doodling-crane` (Fase C). Os padrões recomendados da seção "Decisões do dono
> que ficam para o início da Fase C" valem (anual `YEARLY` em uma vez + 12x sem renovação automática; anual
> depois de 7 dias cancela a renovação e mantém o acesso até o fim, sem reembolso proporcional — **validar
> com o jurídico**; teste começa com um toque; variantes pt-PT/es só no Premium).
> Branch do núcleo (C0–C4): `feat/c-planos-v2-nucleo`.

## C0 — Spec, ADR e sondagem

- [x] 0.1 Esta change (`proposal`, `design`, `tasks`, delta de `matriz-de-planos`)
- [x] 0.2 ADR 0011 (`docs/adr/0011-um-plano-pago-com-uso-justo-diario.md`); o 0010 fica para o B7, como no plano
- [x] 0.3 Sondagem real no sandbox do Asaas: `YEARLY`, 12x (`installmentCount`) e Pix Automático — `design.md`

## C1 — Matriz v2 (`src/core/planos.ts`)

- [x] 1.1 `free | premium | selfhost`, `PLANOS_LEGADOS`, `normalizarPlano()`
- [x] 1.2 `precoAnualBrl: 179`, `CicloDeCobranca`, `MeioDeCobranca`, `PARCELAS_DO_ANUAL`
- [x] 1.3 Cotas diárias (`sttSegundosDia: 7200`, `tokensDia`) e o teto mensal de 40 h com a conta no topo
- [x] 1.4 Entitlements `traducaoNuance` e `vozNatural`
- [x] 1.5 `planoPeloPagamento(valor, { parcelas })` → `{ plano, ciclo }` (preços antigos → Premium mensal)
- [x] 1.6 `VARIAVEIS_POR_PLANO` → `PREMIUM_*`, com `*_DAILY_STT_SECONDS` e `*_DAILY_LLM_TOKENS`

## C2 — Servidor + migração 0041

- [x] 2.1 `subscriptions.ciclo`, `meio`, `provider_installment_id`; `essencial`/`pro` → `premium` em
      `subscriptions`, `flags.regras` e `flags.payload`
- [x] 2.2 Leitura tolerante: `getPlanForUser`, regras de flag, rota admin
- [x] 2.3 Admissão `premium | gratis | alivio` (o teste do C6 entra como `gratis`)
- [x] 2.4 Métricas, webhook (`planoPeloPagamento`, ciclo e período), `/status` e `/faturas` com o ciclo
- [x] 2.5 Assinatura antiga continua valendo (webhook de R$ 19,90 ou R$ 39,90 → Premium)

## C3 — Cliente

- [ ] 3.1 `assinatura`, `entitlements` (com os entitlements novos), `flags`, `ofertas`, `intencaoDeLogin`,
      `planoDoCheckout`, `planos/funil`
- [ ] 3.2 Telas que citavam Essencial/Pro funcionando com um plano pago só (checkout no Premium mensal)

## C4 — Uso justo por dia

- [ ] 4.1 Janela `AAAA-MM-DD` no fuso da pessoa; reserva mês → dia; devolve o mês se o dia recusar
- [ ] 4.2 429 `uso_justo_do_dia` com `Retry-After`, sem oferta; STT, tradução e tutor
- [ ] 4.3 Cliente: `PausaDaNuvem` pausa, aviso funcional via i18n, nenhum momento de oferta
- [ ] 4.4 `/api/me/uso` com `hoje`

## C5 — Anual e 12x (depois)

- [ ] 5.1 `criarAssinatura(..., ciclo)` com `YEARLY`; `criarParcelamento` (12x só com `CREDIT_CARD` — ver a sondagem)
- [ ] 5.2 Webhook: ramo do parcelamento (`installment` presente, `subscription` ausente), `provider_installment_id`
- [ ] 5.3 Período: mensal = vencimento + 35 d; anual e 12x = vencimento + 370 d
- [ ] 5.4 Reembolso de 7 dias cobre o anual e o parcelamento inteiro (`encerramentoDeAssinatura.ts`)
- [ ] 5.5 Anual depois de 7 dias: cancela a renovação, mantém até o fim, sem reembolso proporcional (jurídico)
- [ ] 5.6 Pix Automático atrás de flag (conta PJ elegível)

## C6 — Teste de 14 dias sem cartão (depois)

- [ ] 6.1 Tabela `testes_premium` (não reusa `trialing`) e `marcas_de_teste` (HMAC do e-mail)
- [ ] 6.2 Começa com um toque; `fim_do_teste` em D-3 e D0; nunca cobra sozinho; menor: "peça ao responsável"
- [ ] 6.3 `planoDeAdmissao(plano, alivio, teste = true)` → faixa `gratis`

## C7 — Tela de Planos nova (depois)

- [ ] 7.1 Seletor Mensal/Anual; sem `%`, sem "qualidade", sem o `Medidor` (teste automático)
- [ ] 7.2 Nota do uso justo AO LADO de "sem limite" (CDC); checkout e conta falando de ciclo

## C8 — Ofertas (depois)

- [ ] 8.1 `planoSugerido`: free → `teste` ou `premium`; perfil protegido só recebe ofertas funcionais
- [ ] 8.2 Payload novo de `oferta_planos` via migração

## C9 — Docs e jurídico (depois)

- [ ] 9.1 `docs/LANCAMENTO.md`, `ofertas.md`, `monetizacao.md`, `flags.md`, `scripts/custo/modelo.mjs`
- [ ] 9.2 `termos.html` §3 (anual, teste, uso justo, 12x) e `privacidade.html` (a marca do teste)
- [ ] 9.3 Poda das janelas diárias de `usage_counters`

## Portões (cada item)

- [ ] testes relacionados · `tsc` · `typecheck:estrito` · `typecheck:core` · eslint · prettier
- [ ] `migracoes/conferir.mjs` · `contrato-api.mjs` · i18n (`pseudo --check`, `orfas`, `cobertura --check`)
- [ ] `build:estatica` + `orcamento-bundle.mjs` (JS inicial ≤ 180 KB gzip)
