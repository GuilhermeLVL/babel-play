# ADR 0011 — Vender um plano pago só (Premium), com uso justo diário, e o anual pelos dois fluxos do Asaas

- **Data:** 2026-09-29
- **Estado:** proposto
- **Change OpenSpec:** `planos-v2`

> Número 0011, e não 0010: o plano aprovado (`functional-doodling-crane`, B7) reserva o ADR 0010 para a troca de
> provedores de IA com o custo medido.

## Contexto

Até aqui o app vendia Essencial (R$ 19,90, 15 h/mês de transcrição na nuvem) e Pro (R$ 39,90, 20 h/mês e o
modelo maior), com teto só por mês (`server/lib/usageQuota.ts`, janela `AAAA-MM` em UTC) e toda recusa de cota
como 402 `quota_exceeded`, que o cliente transforma em oferta (`src/lib/ofertas/eventos.ts`). O dono achou os
planos pouco atraentes — "15–20 h" parece pouco e dois planos quase iguais pedem uma conta que a pessoa não quer
fazer — e decidiu em 29/09/2026: Grátis + **Premium R$ 19,90/mês ou R$ 179/ano**, "sem limite no dia a dia" com
**uso justo de ~2 h/dia**.

Medido: uma hora de legenda na pilha atual custa ~US$ 0,079 (Groq whisper-large-v3-turbo faturado 1,08× a
US$ 0,04/h + gpt-oss-120b "low" a US$ 0,036/h, `docs/auditoria/eval/bancada-2026-09.md`); o Premium líquido
(≈ US$ 3,15) empata em ~40 h/mês. Sondado no sandbox do Asaas em 29–30/09 (`openspec/changes/planos-v2/design.md`):
o anual em uma vez é uma assinatura `cycle: YEARLY`; o 12x é um PARCELAMENTO (`installmentCount`), outro recurso,
com parcelas truncadas (11 × R$ 14,91 + R$ 14,99); o Pix Automático é uma API de autorização à parte
(`/v3/pix/automatic/authorizations`, aceita `ANNUALLY`) que em produção exige conta PJ elegível.

## Decisão

O app vende **um plano pago só, `premium`**, e lê os nomes antigos (`essencial`, `pro`) como ele em toda
fronteira (banco, flags, admin, cache do cliente). O Premium tem **teto diário** (7.200 s de STT e 300 mil
tokens, no dia local da pessoa) além do mensal, e a recusa do dia é **429 `uso_justo_do_dia`**, que nunca vira
oferta: a nuvem pausa e o aparelho assume. O teto **mensal fica em 40 h** (o empate de custo) até o B7 medir a
cascata barata; aí sobe para 60 h. O plano e o CICLO saem do valor pago (`planoPeloPagamento`), e o anual existe
nos dois fluxos do Asaas: assinatura `YEARLY` (renova) e parcelamento em 12x no cartão (não renova).

## Alternativas consideradas

- **Manter Essencial e Pro, só com mais horas.** Não resolve a queixa: continua pedindo a conta de "qual dos
  dois", e o Pro a R$ 39,90 não se sustenta contra um Premium com uso justo.
- **Uso justo só mensal (60 h).** Sem teto diário, um uso contínuo de 24 h por dia queima as 60 h em dois dias e
  meio, e a pessoa descobre o limite no meio do mês; com 2 h/dia o limite é previsível e volta amanhã.
- **Recusar o dia com 402.** O 402 é "o plano não cobre" e o cliente o transforma em venda — oferecer o próprio
  Premium a quem já paga por ele. O 429 com `Retry-After` já é o contrato de "agora não" (`PausaDaNuvem`).
- **60 h de teto mensal já.** Na pilha atual 60 h custam ~US$ 4,74 por assinante, acima do líquido: prejuízo em
  todo assinante intenso até a Fase B baratear o custo.
- **12x como carnê (Pix/boleto por parcela).** O Asaas aceita, mas cada parcela é uma cobrança à parte que a
  pessoa pode deixar de pagar; dar o ano inteiro pela 1ª parcela seria vender o anual por R$ 14,91.

## Consequências

Melhor: uma decisão só na tela; o limite do dia é previsível e não vende nada; o anual cabe nos dois fluxos
sem inventar cobrança; assinante antigo não perde acesso nem espaço (5 GB, o maior dos dois antigos).

Pior: o assinante do Pro continua pagando R$ 39,90 até o dono decidir baixar a assinatura no Asaas; o pior caso
TEÓRICO de tokens (tudo saída) não fecha no líquido — quem segura é o orçamento global e o teto diário; um
rollback de imagem depois da migração 0041 exige rodar a REVERSÃO antes (o código anterior não conhece
`premium`); duas linhas de contador por assinante por dia.

Proibido: escrever um nome de plano à mão fora da matriz; recusar uso justo com 402; conceder o ano inteiro por
uma parcela que não seja de cartão; subir o teto mensal acima do empate sem o custo medido.

## Como isto é cobrado

`tests/planos-matriz.test.ts` (matriz v2, `normalizarPlano`, `planoPeloPagamento` com as parcelas da
sondagem, 40 h sem env); `tests/integration/uso-justo-do-dia.test.ts` (2 h no dia → 429 `uso_justo_do_dia`, o mês
devolvido, `Retry-After`, `/api/me/uso` com `hoje`, tradução e STT); `tests/uso-justo-cliente.test.ts` (o 429 não
vira oferta, a nuvem pausa, o aviso aparece uma vez); `tests/integration/planos-v2-migracao.test.ts` (0041
renomeia `subscriptions`, `flags.regras` e `flags.payload` sem repetir plano, e é idempotente);
`tests/integration/billing-webhook.test.ts` (pagamento no valor antigo concede Premium); o inventário de
configuração (`config-inventario.test.ts`) exige as `PREMIUM_*` e não aceita mais as `ESSENCIAL_*`/`PRO_*`.
