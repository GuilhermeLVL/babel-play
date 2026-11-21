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

- [x] 3.1 `assinatura`, `entitlements` (com os entitlements novos), `flags`, `ofertas`, `intencaoDeLogin`,
      `planoDoCheckout`, `planos/funil`
- [x] 3.2 Telas que citavam Essencial/Pro funcionando com um plano pago só (checkout no Premium mensal)

## C4 — Uso justo por dia

- [x] 4.1 Janela `AAAA-MM-DD` no fuso da pessoa; reserva mês → dia; devolve o mês se o dia recusar
- [x] 4.2 429 `uso_justo_do_dia` com `Retry-After`, sem oferta; STT, tradução e tutor
- [x] 4.3 Cliente: `PausaDaNuvem` pausa, aviso funcional via i18n, nenhum momento de oferta
- [x] 4.4 `/api/me/uso` com `hoje`

## C5 — Anual e 12x (branch `feat/c-anual-e-teste`)

- [x] 5.1 `criarAssinatura(..., ciclo)` com `YEARLY`; `criarParcelamento` (12x só com `CREDIT_CARD` — ver a sondagem)
- [x] 5.2 Webhook: ramo do parcelamento (`installment` presente, `subscription` ausente), `provider_installment_id`
- [x] 5.3 Período: mensal = vencimento + 35 d; anual e 12x = vencimento + 370 d (o 12x ancorado na 1ª parcela)
- [x] 5.4 Reembolso de 7 dias cobre o anual e o parcelamento inteiro (`encerramentoDeAssinatura.ts`)
- [x] 5.5 Anual depois de 7 dias: cancela a renovação, mantém até o fim, sem reembolso proporcional (jurídico)
- [x] 5.6 Pix Automático: NÃO integrado — `/assinar` com `meio: 'pix_automatico'` responde 501
      `pix_automatico_indisponivel` até a conta PJ ser elegível (a flag entra com a integração)
- [x] 5.7 Checkout: Mensal / Anual em uma vez / Anual em 12x no cartão, com `ciclo` e `meio` no pedido

## C6 — Teste de 14 dias sem cartão (branch `feat/c-anual-e-teste`)

- [x] 6.1 Tabela `testes_premium` (não reusa `trialing`) e `marcas_de_teste` (HMAC do e-mail) — migração 0043
- [x] 6.2 Começa com um toque (`POST /api/billing/teste`); `fim_do_teste` em D-3 e D0; nunca cobra sozinho;
      menor: "peça ao responsável" (o responsável vinculado ativa com `paraUsuario`)
- [x] 6.3 `planoDeAdmissao(plano, alivio, teste = true)` → faixa `gratis` (STT, tradução e tutor)
- [x] 6.4 LGPD: `docs/lgpd/ropa.csv` (T12) e `public/privacidade.html` — a marca, a finalidade e os 730 dias

## C7 — Tela de Planos nova (branch `feat/c-tela-de-planos`)

- [x] 7.1 Título do produto, seletor Mensal/Anual ("equivale a 3 meses grátis", da matriz); colunas Grátis
      ("Tradução rápida ao vivo") e Premium ("Tradução Nuance"); sem `%`, sem "qualidade", sem o `Medidor`
      (`tests/planos-tela-v2.test.tsx`)
- [x] 7.2 Nota do uso justo AO LADO de "sem limite" (CDC), no cartão, na tabela e no checkout; checkout abre no
      período escolhido; faixa, "Sua assinatura", cancelamento e confirmação falando de ciclo e meio
      (`tests/conta-fala-do-ciclo.test.tsx`)
- [x] 7.3 O teste de 14 dias com um toque no cartão do Premium; o estado `teste` da conta (não é assinatura)
- [x] 7.4 Troca de ciclo com assinatura ativa: o caminho honesto, sem rota nova (`DialogoCiclo`) — cancelar a
      renovação e assinar o outro ciclo no fim do período; o 12x não troca (não renova)

## C8 — Ofertas (branch `feat/c-tela-de-planos`)

- [x] 8.1 `planoSugerido`: free → `teste` (o servidor deixa testar: `/api/billing/status`, lembrado por 1 h em
      `lib/ofertas/teste.ts`) ou `premium`; o selo diz "Sugerido: 14 dias de Premium grátis, sem cartão"
- [x] 8.2 Portão novo: a CONTA de perfil protegido só recebe o funcional, com o texto EMBUTIDO (o da flag pode
      vender) e sem plano sugerido (`perfil_protegido` no motor)
- [x] 8.3 Payload v2 de `oferta_planos` via migração 0045 (textos do Premium, sem qualidade, `variante: v2`; só a
      linha da semente)
- [x] 8.4 O `fim_do_teste` do C6 integrado na tela: a faixa "Premium · teste" diz a mesma frase de D-3/D0

## C9 — Docs e jurídico (branch `feat/c-tela-de-planos`)

- [x] 9.1 `docs/LANCAMENTO.md`, `ofertas.md`, `monetizacao.md`, `flags.md`; `scripts/custo/modelo.mjs` na matriz v2
      (Premium mensal/anual/12x, teto de 40 h até o B7, uso justo de 2 h/dia, teste de 14 dias, alívio de 3 h do
      Grátis), com as tabelas em `openspec/changes/planos-v2/custo/` (as de 25/09 ficam como o retrato da matriz v1)
- [x] 9.2 `termos.html` v5: §3 (Grátis e Premium, mensal/anual/12x, troca de ciclo, preço travado), §3.1
      (arrependimento do ano e do parcelamento inteiros), §3.2 (cancelamento por ciclo: depois dos 7 dias, sem
      reembolso proporcional; o 12x segue no cartão), §3.4, §3.5 (teste de 14 dias sem cobrança automática), §4 (uso
      justo) e §5 (sem "números de qualidade"); "texto a validar com o jurídico" em comentário HTML. `privacidade.html`:
      a tabela sem Essencial/Pro e a normalização do e-mail da marca do teste (a marca, o HMAC e os 730 dias do C6
      conferem com o código)
- [x] 9.3 Poda das janelas diárias de `usage_counters`: `podarJanelasDiarias` (`server/lib/usageQuota.ts`), diária no
      processo que prepara os dados (`server.ts`); ficam hoje, ontem e anteontem, e o mês não é tocado

## Portões (cada item)

- [x] testes relacionados · `tsc` · `typecheck:estrito` · `typecheck:core` · eslint · prettier
- [x] `migracoes/conferir.mjs` · `contrato-api.mjs` · i18n (`pseudo --check`, `orfas`, `cobertura --check`)
- [x] `build:estatica` + `orcamento-bundle.mjs` (JS inicial ≤ 180 KB gzip)
