## Context

Antes desta change (base `perf/gratis-leve`, 29/09/2026):

- **Quatro planos na matriz** (`src/core/planos.ts`): `free`, `essencial` (R$ 19,90, 15 h/mês), `pro`
  (R$ 39,90, 20 h/mês, modelo maior) e `selfhost`. Os nomes `essencial`/`pro` aparecem em ~130 arquivos:
  banco (`subscriptions.plan`), flags (`regras.planos`, `payload.gatilhos[].planos`), ofertas
  (`planoSugerido`), métricas (`ia_custo_usd_total{plano}`), admissão (`pro | essencial | convidado |
alivio`), telas e testes.
- **O webhook decide o plano pelo valor pago** (`planoPeloPreco`, GAP-001), mas só entre os preços MENSAIS.
- **Só há teto por MÊS** (`usageQuota.ts`, janela `AAAA-MM` em UTC). A cota falha fechada
  (`ContadorIndisponivel` → 503) e toda recusa de cota é 402 `quota_exceeded`, que o cliente transforma
  em momento de oferta (`lib/ofertas/eventos.ts`).
- **O A10 já entregou a nuvem de alívio do Grátis** (`FRANQUIA_DE_ALIVIO`, `server/lib/nuvemDeAlivio*`,
  migração 0040), com contadores próprios. Esta change não mexe nela.
- **O custo decide o teto**: na pilha atual (Groq whisper-large-v3-turbo faturado 1,08× a US$ 0,04/h +
  gpt-oss-120b "low" a US$ 0,036 por hora de fala, `docs/auditoria/eval/bancada-2026-09.md`) uma hora de
  legenda transcrita e traduzida custa **~US$ 0,079**. O Premium líquido (R$ 19,90 − Asaas R$ 1,09 −
  Simples ~6% ≈ R$ 17,62 ≈ US$ 3,15 a R$ 5,60/US$) **empata com ~40 h/mês**. As 60 h do "uso justo" só
  cabem com a cascata barata da Fase B (DeepInfra ~US$ 0,024/h) — por isso o teto mensal fica em 40 h até
  o B7 medir.

## Goals / Non-Goals

**Goals:** um plano pago só, de ponta a ponta (matriz, banco, flags, ofertas, telas, métricas); nenhum
assinante antigo perde o acesso; o anual e o 12x com o terreno pronto para o C5 (colunas, ciclo, dedução
pelo valor e pelas parcelas); uso justo DIÁRIO que nunca vende nada; o teto mensal honesto com o custo.

**Non-Goals:** cobrar o anual/12x (C5), o teste de 14 dias (C6), a tela de Planos nova (C7), ofertas v2 e o
portão do perfil protegido (C8), textos jurídicos (C9), o teto de 60 h (depois do B7).

## Decisions

### 1. A matriz v2 (`src/core/planos.ts`)

|                                 | Grátis (`free`)                   | Premium (`premium`)                                  | Self-host (`selfhost`) |
| ------------------------------- | --------------------------------- | ---------------------------------------------------- | ---------------------- |
| Preço                           | —                                 | R$ 19,90/mês · R$ 179/ano                            | —                      |
| Nuvem gerenciada (STT e LLM)    | não (só a nuvem de alívio do A10) | sim                                                  | sim (chave do dono)    |
| `largerModels`                  | não                               | sim                                                  | sim                    |
| `traducaoNuance` / `vozNatural` | não                               | sim                                                  | sim                    |
| YouTube                         | não                               | não (a rota é 403 no hospedado)                      | sim                    |
| STT por mês                     | 0                                 | **144.000 s = 40 h** (`PREMIUM_MONTHLY_STT_SECONDS`) | sem teto               |
| STT por dia (uso justo)         | —                                 | **7.200 s = 2 h** (`PREMIUM_DAILY_STT_SECONDS`)      | —                      |
| Tokens por mês / por dia        | 0 / —                             | 6.000.000 / 300.000                                  | sem teto               |
| Chamadas por mês                | 0                                 | 50.000                                               | sem teto               |
| Armazenamento                   | 500 MB                            | 5 GB                                                 | sem teto               |

- **A conta dos números** (no topo do arquivo, como antes): 40 h × US$ 0,079 = US$ 3,17 ≈ líquido. Tokens:
  US$ 0,036/h ÷ US$ 0,24 por 1M (mistura medida de 80% entrada) ≈ **150 mil tokens por hora de fala** →
  6 M no mês (40 h) e 300 mil no dia (2 h). Chamadas: 40 h ÷ 6 s × 2 = 48.000, com folga para o tutor.
- **O pior caso teórico não fecha, e isto é declarado:** tokens todos de saída (6 M × US$ 0,60 = US$ 3,60)
  mais o STT passam do líquido. O empate é no TÍPICO medido, que é a decisão do dono ("40 h = empate");
  quem segura o pior caso é o orçamento global (`AI_BUDGET_USD_MONTH`/`_DAY`) e o teto diário.
- **O mensal (40 h) morde antes do diário para quem usa 2 h todo dia** (dia 20). Depois do B7 o mensal vai a
  60 h = 30 × 2 h e o diário passa a ser o único teto que um uso intenso encontra.
- **5 GB** de armazenamento: o maior dos dois planos antigos — ninguém do Pro perde espaço.
- **`largerModels: true` no Premium**: o Pro tinha; `LLM_MODEL_GRANDE` continua ausente por padrão, e o nível
  _nuance_ do B3/D1 (`traducaoNuance`) é o caminho do modelo mais forte.
- **Cotas diárias `null` = sem teto no dia** (Grátis, self-host, convidado): nada é contado, nenhuma leitura
  de fuso é feita.
- **`CicloDeCobranca = 'mensal' | 'anual'`** e **`MeioDeCobranca = 'assinatura' | 'parcelamento' |
'pix_automatico'`**: o 12x é ciclo ANUAL pago por PARCELAMENTO; o anual em uma vez é ciclo anual por
  ASSINATURA `YEARLY`.
- **`planoPeloPagamento(valor, { parcelas })` → `{ plano, ciclo } | null`**: R$ 19,90 → Premium mensal;
  R$ 179 → Premium anual; com `parcelas: 12`, a parcela do Asaas (R$ 14,91, ou R$ 14,99 na última — ver a
  sondagem) → Premium anual. Os preços antigos (`PRECOS_LEGADOS`: Essencial 19,90, Pro 39,90) → Premium
  mensal. Qualquer outro valor → `null` (o webhook cai na intenção, como antes).
- **`normalizarPlano(v)`**: nome atual passa; `essencial`/`pro` (`PLANOS_LEGADOS`) viram `premium`; o resto
  é `null`. `ehPlanoDeAssinatura` continua ESTRITO (só os nomes atuais): quem aceita nome antigo chama
  `normalizarPlano` de propósito.

### 2. Servidor e migração 0041

- `subscriptions` ganha `ciclo text NOT NULL DEFAULT 'mensal'`, `meio text` (nulo = concedido pelo admin,
  sem cobrança) e `provider_installment_id text`. As linhas do Asaas com `provider_subscription_id` recebem
  `meio = 'assinatura'`.
- `essencial`/`pro` → `premium` em `subscriptions.plan` e em `flags.regras.planos` (sem repetir `premium`:
  o schema limita a lista a `PLANOS_DA_FLAG.length`, e uma repetição desligaria a flag).
- **`flags.payload` (gatilhos de oferta): os nomes antigos SAEM da lista, em vez de virar `premium`.** Os
  gatilhos que citavam `essencial` eram de VENDA do Pro ("Com um plano pago você continua…"); o Premium é o
  plano de cima e não tem para onde subir. Traduzir literalmente mostraria a quem já paga um texto de venda
  do que ele já tem. Lista que ficaria vazia vira `["premium"]` (o schema exige ao menos um plano). O
  payload novo é do C8.
- **Leitura tolerante** em todo lugar que lê plano de fora do código: `getPlanForUser` (linha antiga ou
  escrita por um processo velho durante o deploy), regras de flag (`z.preprocess`), rota admin, cliente
  (`normalizar` dos entitlements, cache antigo no `localStorage`). É isso que torna o deploy seguro mesmo
  com o banco e o código trocando em momentos diferentes.
- **Admissão**: faixas `premium` (balde inteiro), `gratis` (convidado, Grátis sem alívio e — no C6 — o
  TESTE do Premium: piso `max(0,5, reserva)`) e `alivio` (piso `max(0,8, reserva)`). A env continua
  `IA_ADMISSAO_RESERVA_PRO` (renomear variável de operação apagaria em silêncio um valor já configurado);
  ela passa a dizer "fração que só o pagante alcança".
- **Webhook**: plano e ciclo pelo `planoPeloPagamento`; o período é o vencimento + 35 d (mensal) ou + 370 d
  (anual pago inteiro). O ramo do parcelamento (e o período do 12x) é do C5.
- **Métricas**: o rótulo `plano` sai da matriz (`free | premium | selfhost | convidado`), com nome antigo
  normalizado.

### 3. Cliente

- `PlanoPago = 'premium'`, `PLANOS_PAGOS = ['premium']`. O checkout abre no Premium mensal; as intenções de
  login e o destaque das ofertas guardados com o nome antigo são lidos como Premium.
- "Mudar de plano" sai de "Sua assinatura" (não há outro plano para onde ir); o diálogo volta no C5/C7 como
  "mudar de ciclo". O cartão Premium soma o que o Essencial e o Pro davam; a tela nova é o C7.

### 4. Uso justo por dia (C4)

- **Onde conta:** `usage_counters`, métricas `stt_seconds_dia` e `llm_tokens_dia`, janela `AAAA-MM-DD` no
  fuso GRAVADO da pessoa (`fusoGravado`, o mesmo da ofensiva; `America/Sao_Paulo` sem fuso), lido uma vez
  por requisição (`memoDoRequest`). Métrica própria, e não a mesma com janela diferente, para a poda e o
  diagnóstico nunca misturarem `AAAA-MM` com `AAAA-MM-DD`.
- **A ordem:** reserva o MÊS; depois o DIA; se o dia recusar, DEVOLVE o mês (ninguém paga do mês uma fala
  que não aconteceu). Se o contador do dia cair, o mês também é devolvido e a falha segue fechada (503).
  O estorno e o acerto de tokens voltam para a MESMA janela do dia da reserva, mesmo depois da meia-noite.
- **A recusa é 429 `uso_justo_do_dia`**, com `Retry-After` até a virada do dia local — e não 402: o 402 é
  "o plano não cobre", e vira oferta; o uso justo é "hoje já deu", e não vende nada. O `PausaDaNuvem` do
  cliente pausa pelo `Retry-After` (teto de 15 min, reavaliando), o aparelho assume, e o aviso funcional
  ("A nuvem descansa até amanhã; a legenda segue no aparelho.") aparece uma vez por dia.
- **`/api/me/uso` ganha `hoje`**: `{ janela, fuso, segundosDeAudio, tokensDeLlm }` para plano com teto
  diário; `null` para os outros (nada é contado ali, e "0 usado hoje" seria mentira).

### 5. Anual e 12x (C5)

- **Três formas de pagar**, escolhidas no checkout e mandadas em `POST /api/billing/assinar` como
  `{ ciclo, meio }` (ausentes = o mensal de sempre, para a aba com o bundle anterior):
  - `mensal` + `assinatura` → `criarAssinatura(..., 'mensal')`, `cycle: MONTHLY`, R$ 19,90;
  - `anual` + `assinatura` → `criarAssinatura(..., 'anual')`, `cycle: YEARLY`, R$ 179, `UNDEFINED` (Pix,
    boleto ou cartão), renova em um ano;
  - `anual` + `parcelamento` → `criarParcelamento`, `POST /payments` com `totalValue: 179`,
    `installmentCount: 12` e `billingType: CREDIT_CARD` — **só no cartão** (fora dele cada parcela seria
    uma cobrança avulsa que se deixa de pagar). Sem renovação automática.
  - `pix_automatico` → **501 `pix_automatico_indisponivel`**: não há integração enquanto a conta do serviço
    não for PJ elegível. `parcelamento` com `mensal` → 400.
- A linha guarda **só o id do fluxo da tentativa** (`provider_subscription_id` OU `provider_installment_id`,
  o outro nulo) e o `meio`; o cancelamento e as faturas perguntam ao Asaas por ele.
- **Quem já paga não abre segunda cobrança**: linha do Asaas `active`/`past_due` com id do provedor →
  **409 `ja_assinante`** (a assinatura antiga continuaria cobrando junto). A troca de ciclo é fluxo do C7.
- **Webhook, ramo do parcelamento**: depois da conferência na API (GAP-011, que agora devolve também
  `installment`, `installmentNumber` e `billingType`), `installment` presente e `subscription` ausente vai
  para `aplicarParcela` — ANTES do ramo da compra avulsa. Confere que o valor é parcela do anual
  (`planoPeloPagamento(valor, { parcelas: 12 })`), que é cartão (carnê → `nao-aplicado`, fila do admin) e se
  o parcelamento é o registrado (divergente → aplica o que foi pago e escreve o motivo). O ano é o
  **vencimento da 1ª parcela + 370 d**: a n-ésima parcela volta n − 1 meses (`vencimentoDaPrimeiraParcela`),
  então as 12 confirmações do cartão dão o mesmo fim.
- **Um pagamento nunca encurta o período já pago** (`periodoQueVale`, nos dois ramos): com um fim maior
  ainda concedendo, ele e o ciclo dele ficam (motivo `periodo-mantido`). É o que impede a mensalidade de uma
  assinatura antiga de derrubar o anual.
- **`PAYMENT_REFUNDED` com `installment`** revoga o plano (antes cairia no estorno de créditos).
- **Cancelar** (`encerramentoDeAssinatura.ts`, padrão do dono — **VALIDAR COM O JURÍDICO**):
  - anual `YEARLY`: o caminho de sempre — em 7 dias estorna os R$ 179 e o acesso acaba; depois, para a
    renovação e vale até o `nextDueDate` (um ano), **sem reembolso proporcional**;
  - 12x: em 7 dias, **um** `POST /installments/{id}/refund` estorna o parcelamento inteiro (marca
    `arrependimento:parcelamento:<id>`, reaplicável pela fila do admin), e parcela ainda pendente é removida
    (`DELETE`, repetido uma vez — a sondagem viu 500 e depois 200); depois dos 7 dias **nenhuma escrita no
    Asaas**: a linha fica `canceled` com `cancel_at_period_end = 1`, o ano vale até o fim e as parcelas
    seguem no cartão, sem reembolso proporcional.
- `/status` ganha `assinatura.renovacaoAutomatica` (só assinatura ativa); o 12x não tem `proximaCobranca`.
  `/faturas` do 12x lista as parcelas do parcelamento.

## Sondagem do Asaas (sandbox, 29–30/09/2026)

Script de sondagem fora do repositório; chave lida do `.env.local` pelo processo, nunca impressa; cliente de
teste com o CPF de teste 24971563792; tudo o que foi criado foi removido no fim. Sem dados pessoais abaixo.

**Anual em uma vez — `POST /v3/subscriptions` com `cycle: "YEARLY"`, `value: 179`, `billingType: "UNDEFINED"`:**

- 200; a resposta traz `cycle: "YEARLY"`, `status: "ACTIVE"`, `billingType: "UNDEFINED"`, `fine`/`interest`
  zerados, `checkoutSession: null`.
- A 1ª cobrança nasce NA HORA (`GET /subscriptions/{id}/payments`): `value: 179`, `netValue: 174.95`
  (taxa 1,99% + R$ 0,49 — confere com a conta), `status: "PENDING"`, `subscription` preenchido,
  `installmentNumber: null`, sem campo `installment`.
- **`nextDueDate` já pula um ano** ao gerar a 1ª cobrança (pedido para D → resposta D + 1 ano). É esta a data
  que `/api/billing/status` mostra como "próxima cobrança" — no anual, a renovação.
- Com `billingType: "CREDIT_CARD"` também é 200 (`cycle: "YEARLY"`): o pagador digita o cartão na fatura e
  o Asaas renova sozinho em um ano. Isto é "anual com renovação automática".

**Parcelamento 12x — `POST /v3/payments` com `installmentCount: 12`, `totalValue: 179`:**

- 200, e a resposta é a 1ª PARCELA: `value: 14.91`, `netValue: 13.92`, `installment` (id do parcelamento),
  `installmentNumber: 1`, descrição prefixada "Parcela 1 de 12.", **sem `subscription`**.
- `GET /v3/installments/{id}`: `value: 179`, `netValue: 167.12`, `installmentCount: 12`, `paymentValue:
14.99` (o valor da ÚLTIMA parcela), `expirationDay`, `creditCard: null` até pagar.
- `GET /v3/installments/{id}/payments`: parcelas 1–11 de **R$ 14,91** e a 12ª de **R$ 14,99** (o Asaas TRUNCA
  179/12 e joga a diferença na última: 11 × 14,91 + 14,99 = 179,00), vencimentos mensais a partir de D.
- `GET /v3/payments/{id}` de uma parcela (o que o webhook confere, GAP-011) traz `installment` e
  `installmentNumber` — é o discriminador do ramo de parcelamento no C5 (`subscription` ausente, `installment`
  presente).
- **O meio decide o que o 12x é.** Com `billingType: "CREDIT_CARD"` (sem dados de cartão; o pagador digita na
  fatura) as 12 parcelas são do cartão — o compromisso do ano inteiro é da operadora. Com `UNDEFINED`, `PIX`
  ou `BOLETO` o Asaas também aceita (200), mas cada parcela é uma COBRANÇA À PARTE (um carnê): a pessoa pode
  pagar a 1ª e parar. **Consequência para o C5:** o 12x "sem renovação automática" com período de 370 d só
  vale com `CREDIT_CARD`; um carnê daria o ano pagando R$ 14,91. A confirmação das 12 parcelas do cartão num
  pagamento só (e quantos webhooks chegam) fica para o e2e do C5 com cartão de teste, feito pelo dono na
  fatura do sandbox — não foi feita aqui porque exige digitar cartão.
- Remover o parcelamento (`DELETE /v3/installments/{id}`) devolveu 500 na 1ª tentativa e 200 na 2ª: o C5 deve
  tratar a remoção como repetível.

**Pix Automático — API de autorização à parte:**

- `GET /v3/pix/automatic/authorizations` existe no sandbox (200, lista vazia).
- `POST /v3/pix/automatic/authorizations` com `frequency: "ANNUALLY"`, `paymentCreationMode: "SUBSCRIPTION"`,
  `value: 179`, `contractId`, `startDate`, `customerId` e `immediateQrCode { expirationSeconds, originalValue,
description }` (sem `pixKey`): 200, `status: "CREATED"`, `originType:
"IMMEDIATE_PAYMENT_AND_RECURRING_QR_CODE"`, `retryPolicy: "NOT_ALLOWED"` (padrão), `subscriptionId: null`
  (só nasce quando a autorização fica `ACTIVE`, depois do 1º pagamento), QR (`payload`, `encodedImage`) e
  `immediateQrCode.expirationDate`. `DELETE` cancela (200).
- Frequências aceitas: `WEEKLY | MONTHLY | QUARTERLY | SEMIANNUALLY | ANNUALLY`; status `CREATED | ACTIVE |
CANCELLED | REFUSED | EXPIRED`. **Em produção** a documentação exige conta **Pessoa Jurídica** aprovada, com
  CNPJ ativo há pelo menos seis meses e sem restrição de Pix — o sandbox não confere isso. Por isso o Pix
  Automático fica atrás de flag no C5 e "a confirmar com o Asaas" continua valendo para o anual.

## Risks / Trade-offs

- **Rollback de imagem depois da 0041:** o código anterior não conhece `premium` e trataria o assinante como
  Grátis (com log `plano_desconhecido`). A REVERSÃO da migração (no próprio `.sql`) volta `premium` para
  `essencial` ANTES de trocar a imagem — o Pro antigo volta como Essencial (a mesma cobrança continua; o
  suporte ajusta à mão, se houver algum). Hoje não há assinante real em produção, o que torna o risco pequeno
  agora e é por isso que a renomeação entra agora e não depois do lançamento.
- **Assinante do Pro continua pagando R$ 39,90** por um plano que custa R$ 19,90 — até o dono decidir
  (pendência): baixar o valor da assinatura no Asaas (`POST /v3/subscriptions/{id}` com `value`) ou manter.
- **Tokens do dia/mês derivados** (150 mil tokens por hora de fala): se o tutor pesar mais do que a bancada
  mediu, o teto de tokens morde antes do de segundos. É uma decisão a confirmar com o dono e a medir no B7.
- **Os contadores diários crescem** (2 linhas por assinante por dia). A poda (`usageCountersRepo.prune`) das
  janelas diárias com mais de 35 dias fica para o C9/operação.
- **O dia do aviso no cliente é o do aparelho**, e o do servidor é o fuso gravado da conta: para quem viaja,
  o recado pode reaparecer ou atrasar um dia. O `Retry-After` procura a virada do dia de verdade, inclusive no
  dia da troca de horário de verão (23 h ou 25 h), e o cliente reavalia a cada 15 min de qualquer forma.
- **O aviso do uso justo depende da tela de captura** para aparecer (é ela que mostra o recado); na
  importação o arquivo segue no aparelho em silêncio, como já faz com qualquer recusa da nuvem.
