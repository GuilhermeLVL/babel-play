# ADR 0013 — Vender quatro planos por nível de serviço (Grátis, Essencial, Premium, Ao Vivo), com a venda dos novos fechada por flag

- **Data:** 2026-10-09
- **Estado:** aceito (o dono delegou as decisões em 09/10/2026: `design.md` §11 da change)
- **Change OpenSpec:** `planos-v3-e-rota-inteligente`
- **Substitui:** [ADR 0011](0011-um-plano-pago-com-uso-justo-diario.md) (um plano pago só)

## Contexto

O ADR 0011 vendia Grátis + Premium (R$ 19,90, ou R$ 179 ao ano) com 40 h de nuvem por mês — o EMPATE de custo: uma
hora de legenda custa ~US$ 0,079 e o Premium líquido é ~US$ 3,15 (`src/core/planos.ts`, topo), então todo assinante
intenso saía no zero. O produto passou a ter três níveis de serviço com custos muito diferentes — no aparelho (zero),
nuvem por trechos e nuvem ao vivo — e um preço só não cobre os três. No código, `'premium'` estava escrito à mão na
admissão, no "já assinou" do teste, na intenção padrão do webhook, na lista de planos das flags e no tipo do cliente;
os entitlements do cliente eram copiados em cinco lugares; `essencial` e R$ 39,90 eram lidos como Premium. O servidor
nunca foi implantado (`docs/ESTADO-DO-LANCAMENTO.md`), então este sistema não criou assinatura em nome ou valor antigo.

## Decisão

A matriz tem os planos `free`, `essencial`, `premium`, `aovivo` e `selfhost`, e quem decide o que cada um pode são as
CAPACIDADES e as COTAS que ele declara — o nome do plano só é comparado na matriz e na cobrança.

|                                | Essencial            | Premium              | Ao Vivo              |
| ------------------------------ | -------------------- | -------------------- | -------------------- |
| Mensal / anual                 | R$ 9,90 / R$ 79,90   | R$ 19,90 / R$ 149,90 | R$ 39,90 / só mensal |
| Nuvem por trechos              | 5 h/mês, sob demanda | 20 h/mês             | 20 h/mês             |
| Nuvem ao vivo                  | não                  | não                  | 10 h/mês, SOMADAS    |
| Nuance / intérprete automático | sim / não            | sim / sim            | sim / sim            |
| Voz                            | do aparelho          | neural básica        | neural boa           |
| Anúncios                       | não                  | não                  | não                  |

- **O valor pago decide o plano e o ciclo** (`planoPeloPagamento`), então todo valor cobrável (mensalidade, ano e as
  duas parcelas do 12x) é distinto dos outros. Saem os apelidos e preços que colidem: `essencial` deixa de ser lido
  como Premium (só `pro` continua), e R$ 39,90 e R$ 179 não pagam mais o Premium.
- **Contador por nível:** a nuvem ao vivo conta em `stt_live_seconds`, ao lado de `stt_seconds`, com reserva antes do
  provedor e estorno no mesmo nível. O uso justo do dia (2 h, 429 `uso_justo_do_dia`) continua, e é da nuvem por trechos.
- **Venda fechada:** cada plano declara as flags que abrem a venda dele (`flagsDeVenda`). O Essencial pede
  `venda_planos_v3`; o Ao Vivo pede ela E `stt_ao_vivo` (o serviço de fluxo não foi escolhido). As duas nascem
  desligadas (migração 0048) e `POST /api/billing/assinar` recusa com 503 `plano_indisponivel`. O Premium continua à
  venda; o admin concede qualquer plano. Abrir a venda é ato do dono.
- **O teste de 14 dias** continua sendo do Premium, sem anúncios. **A nuvem de alívio do Grátis** (3 h/mês) fica como
  está até a amostra por anúncio premiado existir (flag `anuncios`). O Grátis continua guardando no servidor.
- **Troca de plano** (etapa 8): vale no próximo ciclo, sem pro-rata.

## Alternativas consideradas

- **Manter um plano pago só e subir o preço.** Quem estuda no computador com placa de vídeo não usa a nuvem que
  justificaria o preço, e quem quer o ao vivo custa mais que qualquer preço único razoável.
- **Manter as 40 h do Premium.** É o empate: sem margem, e o ao vivo ainda somaria custo por cima.
- **Ler `essencial` como Premium e dar outro id ao plano de R$ 9,90.** Deixaria no código um nome que diz uma coisa e
  concede outra; como nada foi implantado, reusar o id é mais limpo que carregar o apelido.
- **Manter R$ 39,90 como "Pro antigo".** O webhook identifica o plano pelo valor: R$ 39,90 pagaria dois planos.
- **Vender o Ao Vivo já.** A rota ao vivo não existe; seria cobrar por uma promessa.
- **Guardar "plano à venda" numa lista à parte.** Seria a sexta cópia; a chave de venda mora na matriz, ao lado do preço.

## Consequências

Melhor: um plano novo entra na matriz e é reconhecido pela admissão, pelas flags, pelo webhook, pelo admin e pelo
cliente sem edição em outro arquivo; cada plano tem margem no teto; o Ao Vivo não é vendido antes de existir.

Pior: o Premium à venda hoje passa de 40 h para 20 h e o anual de R$ 179 para R$ 149,90 no dia do deploy (a tela lê a
matriz); os custos por assinante são ESTIMATIVAS — o uso real precisa ser medido antes de vender anual; a hora ao vivo
não tem custo medido; o Essencial mensal no Pix dá prejuízo; se o dono tiver cobrança MANUAL no Asaas de R$ 39,90
(passaria a conceder o Ao Vivo) ou de R$ 179 (não concede mais o ano), precisa avisar ANTES de abrir a venda; um
rollback de imagem depois da migração 0049 exige rodar a REVERSÃO dela antes (o código anterior não conhece `aovivo`
nas regras de flag e desligaria a flag) e passar para `premium` as assinaturas concedidas em `essencial`/`aovivo`.

Proibido: comparar o nome do plano fora da matriz e da cobrança; dois valores cobráveis iguais; vender plano com chave
de venda desligada; pôr regra `planos` nas flags de venda (quem compra ainda é Grátis).

## Como isto é cobrado

`tests/planos-n-pagos.test.ts` (pagantes e entitlements do cliente derivados; nenhum nome de plano pago à mão nos
arquivos que decidiam por ele); `tests/planos-matriz.test.ts` (os cinco planos, a tabela de capacidades, a escada, os
valores cobráveis todos distintos e cada um pagando o plano dele); `tests/planos-capacidades.test.ts`;
`tests/integration/cota-por-nivel.test.ts` (reserva concorrente e estorno no nível certo);
`tests/integration/planos-v3-rotas.test.ts` (`/api/me/entitlements` e `/api/me/uso` por nível);
`tests/integration/planos-v3-venda.test.ts` (venda fechada e aberta, admin, pagar o barato com a intenção do caro);
`tests/integration/planos-v3-migracao.test.ts` (0049 idempotente, com a reversão executada).
