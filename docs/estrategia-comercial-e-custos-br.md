# Estratégia comercial e de custos para o lançamento no Brasil

Versão de 17/10/2026. Reúne a conta de custo (medida), o pacote e o teste (acessíveis e que dão lucro), os gatilhos de venda
(éticos), o controle de gasto e o que falta fazer. **Convenção:** _[medido]_ saiu de chamada real ou do código; _[fonte]_ tem
URL no fim; _[hipótese]_ é raciocínio meu, a validar com o produto no ar. Nada aqui contradiz as decisões do dono em
`openspec/changes/planos-v3-e-rota-inteligente/design.md` (preços, Ao Vivo fechado, anúncios desligados, só retenção zero, nunca Gemini).

## 1. A ideia central

**O grátis custa zero; a nuvem é a amostra de qualidade que vira assinatura.** O app roda no aparelho (transcrição e tradução
locais), então o uso gratuito não tem custo marginal. A nuvem só entra onde melhora de verdade (idioma que o aparelho erra, aparelho
fraco, tradução com nuance, voz natural) e é o que o plano pago vende. O teste mostra essa diferença por poucas horas, não por
14 dias de Premium inteiro.

## 2. Quanto custa de verdade _[medido, 17/10/2026]_

Uma hora de legenda na nuvem (transcrição + tradução), pelo OpenRouter com retenção zero:

|                                                                                       | Por hora  |
| ------------------------------------------------------------------------------------- | --------- |
| Conservador (Whisper turbo a US$ 0,04/h faturado 1,08×, Gemma 4 com 150 mil tokens/h) | US$ 0,058 |
| Esperado (Whisper turbo no provedor de US$ 0,012/h)                                   | US$ 0,028 |
| Antes (Groq + `gpt-oss`)                                                              | US$ 0,079 |

Custo máximo por pessoa no mês, pelas cotas da matriz v3:

|                      | Cota de nuvem                            | Custo máx. (cons. / esp.) | Receita líquida | Margem no pior caso |
| -------------------- | ---------------------------------------- | ------------------------- | --------------- | ------------------- |
| Grátis               | só alívio, aparelho fraco, teto US$ 0,13 | US$ 0,13                  | 0               | custo               |
| Essencial R$ 9,90    | 5 h                                      | US$ 0,29 / 0,14           | US$ 1,47        | US$ 1,18 (80%)      |
| Premium R$ 19,90     | 20 h + voz até US$ 0,60                  | US$ 1,76 / 1,16           | US$ 3,15        | US$ 1,39 (44%)      |
| **Teste de 14 dias** | **3 h + voz 30 mil car.**                | **US$ 0,20 / 0,10**       | 0               | custo               |

A receita líquida é a do projeto (R$ 8,22 e R$ 17,62 após Asaas e Simples, a R$ 5,60/US$). O teste custava até US$ 1,76 por
pessoa; **agora acaba no que vier primeiro, os 14 dias ou 3 h** (implementado, `FRANQUIA_DO_TESTE`).

Crédito a manter por 1.000 usuários ativos em 30 dias (teto conservador + 5,5% de taxa do OpenRouter _[hipótese: não verifiquei a taxa]_

- 20% de folga, com 100 testes novos no mês, já com o teto novo do teste): **3% pagantes US$ 72 · 8% US$ 126 · 15% US$ 205**
  (com o teste antigo de 20 h eram US$ 120 · 174 · 254). Mesmo com 3% de pagantes o pior caso fecha no zero a zero (+ US$ 4); o uso
  típico (70% do teto) dá lucro em todas as misturas. Reproduza e varie com `npm run ia:custo -- --usuarios 1000 --essencial 50 --premium 30`.

## 3. O pacote para a realidade brasileira

- **Preços.** Manter Essencial R$ 9,90 e Premium R$ 19,90 _[decisão do dono]_. O Super Duolingo é R$ 14,99/mês e R$ 179,90/ano
  _[fonte]_: o Essencial fica abaixo da âncora, o Premium no teto da faixa. A faixa de R$ 15 a 20 como limite psicológico é
  _[hipótese]_.
- **Como cobrar.** Cartão no mensal: o Pix de R$ 1,99 consome 20% de R$ 9,90, contra ~8% do cartão _[fonte: taxas do Asaas; conta minha]_.
  Pix **só no anual**, com 5 a 10% de desconto à vista (a taxa vira 2,5% de R$ 79,90) e 12x no cartão (3,99% + R$ 0,49). Anual
  R$ 79,90 / R$ 149,90 ≈ 33% / 37% de desconto, bem acima do Super. **Hoje o anual está fechado** (`ANUAL_ENABLED`) até o parecer
  jurídico; abrir é o maior ganho de caixa e de retenção.
- **Pix Automático** só depois: o Asaas o oferece para PJ com 6 meses de CNPJ ou mais, e a adoção ainda é baixa
  (14 mil recebedores) _[fonte]_. Não conte com ele no lançamento.
- **Mais horas pelo mesmo preço** (a alavanca de marketing que o corte de custo permite): Essencial 8 h e Premium 30 h custam
  no pior caso US$ 0,46 e US$ 2,34 contra US$ 1,47 e US$ 3,15 de receita. Só depois de medir o uso real; é decisão do dono.
- **Grátis.** Ilimitado no aparelho (custo zero). A nuvem de alívio (3 h, só aparelho fraco, ≤ US$ 0,13) segue como está. Anúncios
  ficam desligados até domínio, rede e consulta jurídica.
- **Menores de 18 anos:** perfil protegido, sem compra; o responsável decide. O ECA Digital (Lei 15.211/2025) está em vigor
  desde 17/03/2026 _[fonte, texto literal a conferir no Planalto]_: sem recompensa aleatória paga, sem perfilamento para anúncio.

## 4. O teste que não quebra o caixa

**Por uso, não por tempo.** Dura o que vier primeiro: 14 dias ou 3 h de nuvem (e 30 mil caracteres de voz). Mantém os recursos
do Premium (nuance, voz natural, intérprete) para a pessoa **sentir a diferença**; só a nuvem é amostra. Sem cartão, uma vez por
e-mail (marca HMAC, já existe), volta ao Grátis sem perder nada. Custo ≤ US$ 0,20, contra US$ 1,76.

Break-even: com custo de teste de US$ 0,10 a 0,20 e margem de US$ 1,0 a 1,4 por assinante/mês, o teste se paga com **cerca de
2 a 5% de conversão** em ~4 meses de retenção _[hipótese]_. Os 2 a 5% de freemium→pago de apps de idioma são estimativa fraca
_[fonte]_; o benchmark de teste sem cartão não existe nas fontes que achei. **Meça antes de acreditar**: % que usa as 3 h,
% que volta no dia 7, teste→pago.

## 5. Gatilhos e linguagem (benefício, não recurso; sem manipular)

O momento certo de falar de plano é **depois de valor entregue**, nunca no instante da recusa (o código já evita: 429 e 503
não viram oferta). Mensagens em português do Brasil, no tom de ajuda, com o fato e a saída:

1. Boas-vindas: "Assista do seu jeito. A legenda acompanha e você aprende sem pausar."
2. Início do teste: "Suas primeiras 3 horas de nuvem são por nossa conta. Sem cartão."
3. Saldo visível (já existe: o chip "Nuvem: restam X de Y", com barra, e a folha de nível na captura, e o medidor na tela de Planos; aparecem com a venda dos planos v3 aberta, e **ainda não conferi no navegador com a venda aberta**): "Você usou 2 h de 3. Quando acabar, a legenda continua no aparelho."
4. Valor percebido (depois de uma boa sessão): "Hoje você entendeu um episódio inteiro e salvou 23 palavras."
5. Antes do fim do teste: "Seu teste acaba em 3 dias. Nada é cobrado sozinho; se quiser seguir com a nuvem, o Essencial é R$ 9,90."
6. Preço em contexto: "Menos que um lanche por mês. Cancele em dois toques."
7. Anual no Pix: "Pague uma vez no Pix e economize cerca de 33%."
8. Retenção: "Revisamos as palavras que você estava prestes a esquecer."
9. Escolas e cursinhos: "Condição especial para professores e turmas." (canal de aquisição, _[hipótese]_)
10. Cancelamento: "Seu progresso é seu. Se cancelar, ele fica guardado."

**Linha segura _[recomendação minha, não parecer jurídico]_:** sem urgência falsa nem contagem regressiva, sem culpa em notificação,
sem cobrança surpresa, cancelamento tão fácil quanto a contratação, nada de pressão sobre menores. Revisar com advogado a oferta a menores.

## 6. Gestão inteligente do custo (camadas, da mais barata à mais cara)

1. **Aparelho primeiro**: transcrição e tradução locais (custo zero); o chinês traduz no aparelho pelo pivô zh→en→pt.
2. **Cache de tradução** (servidor e cliente, já existe): a frase repetida não paga de novo. _Meça o acerto_ (`ia_cache_traducao_total`).
3. **Cascata barata** (`ops/ia-provedores.openrouter.json`): Whisper turbo (transcrição), Gemma 4 e Llama (tradução e tutor), `gpt-oss-120b` só na nuance para quem paga. Nunca Gemini, nunca `:free` que treina.
4. **VAD**: só a fala vai à nuvem, nunca o silêncio (o Whisper devolve vazio em silêncio e ruído, _[medido]_).
5. **Cota por plano e uso justo do dia (2 h)**: acabou, a legenda segue no aparelho; nada bloqueia.
6. **Admissão**: baldes por modelo, reserva de 20% para quem paga, `IA_EM_VOO_STT=2` (a captura dupla recebia 429 com 1).
7. **Degradação a 70% e 90% do orçamento**: quem paga desce ao degrau mais barato; **a 100% a nuvem fecha e o app segue no aparelho**.
8. **Teto real**: o crédito pré-pago do OpenRouter, sem recarga automática, com limite por chave.

**Orçamento (`AI_BUDGET_USD_MONTH`/`_DAY`):** igual ao crédito do mês; o diário em ≈ mensal ÷ 20 (um dia de pico de 2× a média ainda cabe).
Para o lançamento pequeno os US$ 40 / 4 do exemplo servem; para ~1.000 ativos, de US$ 72 a 205 conforme a mistura (§2).

**Lacunas que o código ainda tem** (mapeadas em 17/10/2026): (a) roteamento por valor e por custo: a política de rota está em modo sombra
(`rota_inteligente`), e `routeStt` ainda manda tudo à nuvem quando há nuvem, sem olhar plano nem custo; (b) teto em dólar por conta nos
planos pagos (hoje só convidado e alívio); (c) cache de transcrição: não há (compatível com áudio pessoal); (d) aviso de fim do teste
**por uso** (hoje só D-3 e D0); (e) conferir no navegador o chip de saldo de nuvem com a venda dos planos v3 aberta (ele já existe no código); (f) o canal do alerta (Alertmanager) é pendência do dono.

## 7. O que medir (e o alerta de cada um)

| Métrica                                        | Por quê                              | Fonte                                |
| ---------------------------------------------- | ------------------------------------ | ------------------------------------ |
| Custo de nuvem por usuário ativo e por plano   | a conta do §2                        | `ia_custo_usd_total{plano}`          |
| Horas de nuvem por plano vs. cota              | testar "mais horas pelo mesmo preço" | `GET /api/me/uso`, `usage_counters`  |
| Acerto do cache de tradução                    | cada acerto é US$ 0                  | `ia_cache_traducao_total`            |
| % de sessões só no aparelho                    | o grátis custa zero                  | métricas da captura                  |
| Teste→pago, uso das 3 h, volta no dia 7        | break-even do §4                     | funil de ofertas (`oferta_exibida`…) |
| Gasto anômalo por usuário                      | abuso                                | `ia_gasto_anomalo_usuario_total`     |
| Pagamento por meio (cartão/Pix), inadimplência | taxa e churn                         | Asaas                                |

## 8. Prioridades

**Antes de abrir a venda (P0):** (1) pôr o crédito no OpenRouter e ajustar `AI_BUDGET_*` ao §2; (2) Alertmanager (e-mail ou Telegram);
(3) política de privacidade (provedor deixa de ser a Groq) e parecer jurídico; (4) medir o uso real no beta fechado.
**Logo depois (P1):** abrir o anual com Pix e 12x; aviso de fim do teste por uso; teto em dólar por conta nos pagos.
**Depois (P2):** roteamento por valor (usar a nuvem só quando o aparelho está ruim); "mais horas pelo mesmo preço"; canal de escolas e cursinhos; Pix Automático.

## 9. Riscos e o que não sei

- Preço em R$ de Babbel, Busuu, Memrise, Cambly, Preply, Fluency e Open English; renda e propensão a pagar; CAC e CPI no Brasil;
  benchmark de teste sem cartão e por uso; inadimplência por meio de pagamento; a taxa do OpenRouter sobre créditos.
- O mercado é sensível a preço e a âncora é o Duolingo mais promoções de banco _[fonte]_; 49% dos assinantes já cancelaram por insatisfação
  _[fonte]_, então o valor percebido no primeiro uso decide.
- Os números de custo supõem 70% do tempo com fala e uso de 70% do teto nos pagantes _[hipótese]_; os preços são de lista em 17/10/2026,
  e o OpenRouter escolhe o provedor.

## Fontes

Preços do Super Duolingo: fastcompanybrasil.com (Duolingo Max no Brasil), canaltech.com.br, olhardigital.com.br. Taxas do Asaas:
asaas.com/precos-e-taxas. Pix Automático: docs.asaas.com/docs/pix-automatico; adoção, nossomeio.com.br. Meios de pagamento e cancelamento:
Vindi/Opinion Box (mai/2025). Benchmarks de conversão: revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026. ECA Digital:
planalto.gov.br (Lei 15.211/2025, a conferir) e machadomeyer.com.br (factsheet). Preços de modelos e provedores com retenção zero:
openrouter.ai/api/v1/models e /api/v1/endpoints/zdr, consultados em 17/10/2026.
