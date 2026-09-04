# Viabilidade de produção — quanto custa um usuário, e o que falta para cobrar

Estudo para a decisão de lançar **completo** (conta, planos, cobrança) ou **limitado** (grátis,
sem conta). Todos os preços foram verificados na fonte em 2026-08-30, e todo consumo foi **medido**,
não estimado por analogia.

---

## 1. Os preços, verificados

| Item | Preço | Fonte |
|---|---|---|
| STT `whisper-large-v3-turbo` | **US$ 0,04 / hora de áudio** | documentação da Groq |
| — mínimo faturado | **10 s por requisição** | *"you will still be billed for 10 seconds"* |
| LLM `openai/gpt-oss-120b` | **US$ 0,15 / M entrada · US$ 0,60 / M saída** | documentação da Groq |
| `llama-3.3-70b-versatile` (o padrão antigo) | **não existe mais** — enterprise | testado contra a API |

Consumo **medido** no gold set com o prompt de produção: **329 tokens de entrada + 96 de saída por
fala** → **US$ 0,107 por mil falas traduzidas**.

O mínimo de 10 s é o detalhe que muda tudo: os enunciados do VAD têm ~6 s, então **cada um é
cobrado como 10**. A conta real é ~1,7× a duração falada.

## 2. Custo por usuário, por mês

Um enunciado ≈ 6 s de fala e gera **duas** chamadas (1 STT + 1 tradução).

| Perfil | Fala/mês | Enunciados | STT | Tradução | **Total** |
|---|---|---|---|---|---|
| Leve | 2 h | 1.200 | US$ 0,13 | US$ 0,13 | **US$ 0,26** |
| Médio | 5 h | 3.000 | US$ 0,33 | US$ 0,32 | **US$ 0,65** |
| Pesado | 10 h | 6.000 | US$ 0,67 | US$ 0,64 | **US$ 1,31** |

**≈ R$ 7 por mês no perfil pesado.** Vender a IA de nuvem é viável com folga larga.

Infraestrutura fixa: Cloudflare Pages (banda ilimitada, grátis) + Cloud Run com escala a zero +
Turso e Supabase nos planos gratuitos ≈ **US$ 0**. O único custo garantido é o domínio, ~R$ 40/ano.
**Um assinante já cobre a infraestrutura inteira.**

## 3. O teto atual está dimensionado errado — nos dois sentidos

`PRO_MONTHLY_MANAGED_CALLS` = 1.000, e **STT, tradução e tutor dividem o mesmo contador**
(`sttProxy.ts:51`, `mtProxy.ts:77`, `server.ts:333`). Como cada fala consome duas chamadas:

> **O plano Pro de hoje entrega ~500 falas por mês — cerca de 50 minutos de conversa.**

É pouco demais para justificar uma assinatura, e ao mesmo tempo o teto não protege de nada, porque
não conhece duração: 1.000 chamadas podem ser 3 h ou 7 h de áudio conforme o tamanho dos enunciados.

**Recomendação, com orçamento explícito de US$ 1,50/mês por assinante:**

| Variável | Hoje | Proposto | O que isso compra |
|---|---|---|---|
| `PRO_MONTHLY_MANAGED_CALLS` | 1.000 | **12.000** | ~6.000 falas ≈ 10 h de conversa |
| `PRO_MONTHLY_STT_SECONDS` | (não existia) | **36.000** | teto de gasto: 10 h faturadas = US$ 0,40 |

O teto em segundos é o que fecha o risco de verdade — é ele que impede que uma captura esquecida
aberta 24 h/dia (US$ 28,80/mês só de STT) vire prejuízo.

## 4. O que o plano pago tem para vender — medido

| | Grátis (no navegador) | Pro (nuvem) |
|---|---|---|
| Transcrição | WER **57,2%** (`whisper-base` local) | Groq `whisper-large-v3-turbo` — melhor, ainda não medido |
| Tradução, geral | chrF++ **56,6%** | chrF++ **85,2%** |
| **Tradução idiomática** | **27,4%** | **83,1%** |
| Registro informal | 32,1% | 87,3% |
| Download inicial | ~230–413 MB | **nada** |

**A diferença é real e é justamente a queixa de origem.** "Traduz ao pé da letra" era o idiomático a
27,4%; na nuvem vai a 83,1%. E o Pro poupa o usuário de baixar centenas de megabytes — que para
celular é o argumento mais forte dos dois.

## 5. Preço e margem

| Preço/mês | Custo IA (pesado) | Taxa (~4,99% + R$ 0,50) | **Margem** |
|---|---|---|---|
| R$ 14,90 | R$ 7,10 | R$ 1,24 | R$ 6,56 (44%) |
| **R$ 19,90** | R$ 7,10 | R$ 1,49 | **R$ 11,31 (57%)** |
| R$ 29,90 | R$ 7,10 | R$ 1,99 | R$ 20,81 (70%) |

A coluna de custo usa o perfil **pesado**; o assinante médio custa metade disso. R$ 19,90 é o ponto
em que a margem aguenta um usuário pesado sem depender da média.

**Pagamento:** com CNPJ, as três opções nacionais servem. Stripe tem a melhor API e documentação,
mas **Pix é sob convite para empresas brasileiras** — se Pix for requisito de lançamento, Mercado
Pago ou Pagar.me passam na frente. Taxas na mesma faixa (~4,3–5,5% + fixo).

## 6. O que falta para cobrar de verdade

Em ordem de dependência:

1. **Escolher o provedor** (decisão sua) — nada depende de código até aqui.
2. **Webhook de assinatura** → `subscriptions` (a tabela já existe, com coluna `provider`;
   `server/routes/me.ts:186` já marca o lugar). É o que liga pagamento a `plan`.
3. **Telas**: Planos (comparativo), Uso (quanto do mês já foi), Assinatura. Hoje só existe um bloco
   de leitura em `Settings.tsx:477-491`.
4. **Redimensionar os tetos** (item 3 deste documento).
5. **Avisar quando degrada.** Hoje, se a nuvem falha, a cascata cai calada no `opus-mt` local — o
   assinante volta à tradução literal sem saber que pagou por algo que não recebeu. Isso é o mesmo
   defeito de classe que o modelo morto: silêncio onde devia haver aviso.

## 7. A recomendação

**Lançar limitado primeiro, com a cobrança preparada — não lançar completo de saída.**

O que sustenta isso não é cautela genérica, são os números acima:

- A **edição leve já está pronta e no ar**, e custa zero. Ela não bloqueia nada do resto.
- O produto pago já tem uma vantagem **medida** (85,2% contra 56,6%) — então a proposta de valor não
  é hipótese, é número. Isso pode ser vendido quando você quiser.
- Mas a cobrança é a única parte que **não existe nem um pouco**: sem webhook, sem telas, sem
  provedor escolhido. Construir isso antes de saber se alguém quer o produto é a ordem errada.
- E há um defeito de silêncio a resolver antes de cobrar (item 6.5): cobrar por uma nuvem que cai
  calada é o pior primeiro contato possível com um assinante.

O caminho: **edição leve no ar → medir interesse real → ligar a cobrança quando houver demanda**,
com o custo já instrumentado (o que esta rodada entregou) para que o preço não seja um chute.

---

## Honestidade sobre estes números

- **O consumo de tokens vem de 16 casos curtos.** Falas mais longas gastam mais entrada; a média de
  329 tokens sobe em conversa com contexto acumulado. A ordem de grandeza aguenta, o terceiro
  decimal não.
- **O perfil "10 h/mês" é uma suposição minha**, não um dado de uso — não existe telemetria de uso
  real ainda. É exatamente o que os contadores desta rodada passam a medir.
- **O STT de nuvem não foi medido em qualidade.** Presumo que seja melhor que o `whisper-base`
  local, mas presumir é o que este trabalho inteiro evita. É a próxima medição.
- **Os preços da Groq podem mudar sem aviso** — este documento já nasce de um caso em que um modelo
  inteiro desapareceu do plano self-serve em poucos dias.
