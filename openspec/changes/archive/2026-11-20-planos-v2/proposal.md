## Why

Os planos de lançamento (Essencial R$ 19,90 com 15 h/mês de transcrição na nuvem, Pro R$ 39,90 com 20 h)
não convencem o dono: "15–20 h" parece pouco, vender "qualidade melhor" pega mal, e dois planos pagos
quase iguais obrigam a pessoa a fazer uma conta que ela não quer fazer. A decisão do dono (29/09/2026,
plano `functional-doodling-crane`, Fase C):

- **Grátis + Premium.** O Pro sai; o Família fica para depois.
- **Premium R$ 19,90/mês ou R$ 179/ano**, teste de 14 dias sem cartão, "sem limite no dia a dia" com **uso
  justo de ~2 h/dia de nuvem** — passando disso a legenda segue no aparelho, sem venda nenhuma.
- **Grátis:** 3 h/mês de nuvem para aparelho fraco (já entregue no A10, `FRANQUIA_DE_ALIVIO`) e o aparelho
  sem limite.

O código tem hoje `essencial` e `pro` espalhados por matriz, banco, flags, ofertas, telas e métricas; o
webhook deduz o plano do valor pago só entre dois preços mensais; e não existe teto por DIA — só por mês.

## What Changes

Esta change cobre a Fase C inteira; os itens **C0–C4** são o núcleo e entram primeiro.

- **C0 — spec, ADR e sondagem.** Esta change, o ADR 0011 e a sondagem real do sandbox do Asaas (anual
  `YEARLY`, parcelamento 12x e Pix Automático), registrada em `design.md`.
- **C1 — matriz v2** (`src/core/planos.ts`): planos `free | premium | selfhost`; `PLANOS_LEGADOS` e
  `normalizarPlano()` leem `essencial`/`pro` como `premium`; `precoAnualBrl: 179`, `CicloDeCobranca`,
  `MeioDeCobranca`; cotas DIÁRIAS (`sttSegundosDia: 7200`, `tokensDia`); entitlements `traducaoNuance` e
  `vozNatural`; `planoPeloPagamento(valor, { parcelas })` devolve `{ plano, ciclo }`; as variáveis por
  plano passam a ser `PREMIUM_*` (mais `*_DAILY_*`).
- **C2 — servidor + migração 0041:** `subscriptions` ganha `ciclo`, `meio` e `provider_installment_id`;
  linhas `essencial`/`pro` viram `premium`, também em `flags.regras` e `flags.payload`; entitlements,
  admin, admissão (o teste do C6 entra como Grátis), métricas e webhook falam o plano novo. Assinatura
  antiga continua valendo: um pagamento no valor antigo (R$ 19,90 ou R$ 39,90) resolve para `premium`.
- **C3 — cliente:** assinatura, entitlements, flags, ofertas, intenção de login, checkout e as telas que
  citavam os dois planos passam a funcionar com um plano pago só (o checkout abre no Premium mensal). A
  tela de Planos nova é o C7.
- **C4 — uso justo por dia:** `usage_counters` com janela `AAAA-MM-DD` no fuso da pessoa; reserva o mês e
  depois o dia, e devolve o mês se o dia recusar; recusa **429 `uso_justo_do_dia`** (não 402), sem oferta
  de venda; o cliente pausa a nuvem e mostra um aviso funcional curto; `/api/me/uso` ganha `hoje`.
- **C5–C9 (depois, em cima deste núcleo):** anual e 12x no checkout e no webhook; teste de 14 dias
  (`testes_premium`); tela de Planos nova; ofertas v2 e o portão do perfil protegido; docs e jurídico.

## Non-Goals

- **O teto de 60 h/mês.** Só depois do B7 (custo medido na cascata barata). Até lá o teto mensal do Premium
  é o empate de custo na pilha atual — **40 h**, ajustável por `PREMIUM_MONTHLY_STT_SECONDS`.
- **Cobrar o anual e o 12x** (C5), **o teste de 14 dias** (C6) e **a tela nova** (C7) — aqui só o que eles
  precisam encontrar pronto.
- **Pix Automático em produção:** exige conta PJ elegível (ver `design.md`); fica atrás de flag no C5.
- **Migrar as assinaturas do Pro no Asaas para R$ 19,90.** A cobrança recorrente de R$ 39,90 continua até
  o dono decidir (pendência registrada no `design.md`).

## Impact

`src/core/planos.ts`, `src/core/flags.ts`, `src/core/ofertas.ts`, `src/core/temporada.ts`,
`src/core/usoJusto.ts` (novo), `server/lib/{entitlements,usageQuota,billingEventos,config,storageQuota,flags}.ts`,
`server/ai/{admissao,reservaDeNuvem,sttProxy}.ts`, `server/http/metricas.ts`, `server/routes/{admin,billing,me}.ts`,
`server/db/{schema.ts,migrations/0041_*}`, `src/lib/{assinatura,entitlements,intencaoDeLogin,planoDoCheckout,uso}.ts`,
`src/lib/ofertas/*`, `src/components/views/planos/*`, `src/components/views/Planos.tsx`, adaptadores de nuvem
(`src/gateway/adapters/{groqWhisper,serverLlmMt}.ts`), `.env*.example`, `docs/adr/0011-*`.
