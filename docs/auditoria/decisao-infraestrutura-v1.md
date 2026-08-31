# Decisão de infraestrutura — pagamento, banco e IA

Documento para **decidir**, não para medir. Preços verificados em 2026-08-30. O que você precisa
escolher está em três tabelas; o resto é contexto e recomendação.

Premissas do produto, já medidas em `viabilidade-producao-v1.md` e `eval-producao-v1.md`: custo de
IA por assinante pesado ≈ **US$ 1,31/mês (~R$ 7)**, e a vantagem do plano pago é real (transcrição
57% → 24% de erro; tradução 57% → 85%).

---

## 1. Pagamento — a decisão mais urgente

Você tem CNPJ, então as opções nacionais estão abertas. **Num ticket baixo como R$ 19,90, a taxa
fixa pesa mais que o percentual** — é isso que separa as opções.

| Provedor | Cartão recorrente | Custo em R$ 19,90 | Pix | Observação |
|---|---|---|---|---|
| **Asaas** | 1,99% + R$ 0,49 | **R$ 0,89 (4,5%)** | Pix recorrente desde jan/2026 | Feito para cobrança recorrente |
| Mercado Pago (D+30) | 3,99% | R$ 0,79 (4,0%) | sim | D+30 prende o caixa 30 dias |
| Mercado Pago (imediato) | 4,99% | R$ 0,99 (5,0%) | sim | |
| Stripe | 3,99% + R$ 0,39 + 0,7% Billing | **R$ 1,32 (6,6%)** | 1,19%, **só por convite** | Melhor API e documentação |
| AbacatePay | R$ 0,80 por Pix | R$ 0,80 (4,0%) | foco em Pix | Novo, menor rastro de produção |

**Recomendação: Asaas.** Não é a melhor API do lote — a da Stripe é —, mas é a que foi desenhada
para o problema que você tem: assinatura recorrente de ticket baixo no Brasil, com Pix recorrente,
webhook e régua de cobrança (recuperação de pagamento falhado). A Stripe custa **48% mais caro por
assinatura** neste ticket e o Pix dela depende de convite, o que num produto brasileiro em 2026 é
uma limitação séria — Pix já passou o cartão como meio mais usado.

Se a intenção for vender fora do Brasil desde o início, a conta inverte e a Stripe volta.

**Prazo de implementação, uma vez escolhido:** o banco já tem a tabela `subscriptions` com coluna
`provider`, e `server/routes/me.ts:186` já marca o lugar do webhook. O trabalho é o webhook, a tela
de assinatura e os testes de idempotência — não é arquitetura nova.

## 2. Banco de dados — não mude nada

Hoje: **libsql (SQLite) local, ou Turso** quando `DATABASE_URL` não começa com `file:`
(`server/db/db.ts:28-30`). O Drizzle já abstrai, e a portabilidade para Postgres está declarada
como futura em `drizzle.config.ts:4-5`.

| Opção | Plano gratuito | Serve? |
|---|---|---|
| **Turso** (atual) | 5 GB, 500 M linhas lidas/mês, 10 M escritas | **Sim, com folga larga** |
| Neon (Postgres) | 0,5 GB por projeto, 100 h de CPU/mês | Sim, mas menor |
| Supabase Postgres | — | Já usado só para identidade |

**Recomendação: ficar no Turso.** O gratuito comporta milhares de usuários deste produto — a
aplicação grava sessões, falas e cartões de vocabulário, não mídia (o áudio vai para disco). Migrar
para Postgres agora seria trabalho sem problema correspondente.

**A dívida real do banco não é o motor, é a operação**: não há rotina de backup automatizada nem
teste de restauração. Isso importa mais que a escolha de fornecedor.

## 3. Serviços de IA — a decisão já está medida

| Camada | Hoje | Recomendado | Por quê |
|---|---|---|---|
| STT nuvem | Groq `whisper-large-v3-turbo` | **manter** | US$ 0,04/h é o piso do mercado; o segundo mais barato cobra 2,5× mais |
| LLM tradução | Groq `gpt-oss-120b` | **mesmo modelo, via OpenRouter** | US$ 0,029 contra US$ 0,107 por mil falas — 3,7× |
| STT local | `whisper-base` no navegador | manter | é o plano gratuito, e custa zero |
| Tradução local | `opus-mt` no navegador | manter | idem |

**A troca de roteador já está pronta**: `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`. Não foi
ativada porque a conta do OpenRouter está sem saldo, e trocar agora derrubaria a tradução de nuvem.
Com saldo, é uma variável de ambiente.

**Um empate que vale acompanhar:** o `minimax/minimax-m3:free` empatou com o modelo pago nas duas
métricas, a custo zero (`eval-modelos-v1.md`, seção 6). O que impede adotá-lo é confiabilidade — a
camada gratuita é intermitente, some por janelas inteiras. O desenho que resolve isso é
**gratuito primário, pago como reserva na cascata**, que o gateway já sabe fazer com disjuntor.
Ainda não implementado.

---

## Custo mensal projetado, com tudo somado

| Item | Custo |
|---|---|
| Cloudflare Pages (front, banda ilimitada) | R$ 0 |
| Cloud Run (API, escala a zero; 2 M requisições grátis/mês) | R$ 0 até escalar |
| Turso (banco) | R$ 0 |
| Supabase (identidade, até 50 k usuários ativos) | R$ 0 |
| Domínio | ~R$ 40/ano |
| IA por assinante pesado | ~R$ 7/mês |
| Taxa de pagamento (Asaas, R$ 19,90) | R$ 0,89 |

**Margem por assinante a R$ 19,90: ~R$ 12 (60%)**, contando o perfil pesado. O assinante médio
custa metade disso.

**O ponto de equilíbrio é um assinante.** A infraestrutura fixa é zero até haver escala.

## O que decidir, em ordem

1. **Provedor de pagamento** — sem isso, nada de cobrança avança. Recomendação: Asaas.
2. **Preço** — R$ 19,90 é onde a margem aguenta um usuário pesado sem depender da média.
3. **Quando ligar a cobrança** — a recomendação anterior (lançar limitado primeiro) continua de pé,
   mas mais fraca: a vantagem do plano pago agora está medida nos dois eixos, então há o que vender.

## O que NÃO precisa de decisão sua

Banco (fica), STT (fica), e a troca de roteador do LLM (já preparada, aguarda saldo).
