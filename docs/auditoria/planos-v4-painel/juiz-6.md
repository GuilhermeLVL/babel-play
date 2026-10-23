# Juiz 6 — CFO de edtech pequena (fundador solo, sem investimento)

| Critério                       | A        | B        | C        |
| ------------------------------ | -------- | -------- | -------- |
| 1. Valor percebido pelo preço  | 6        | 8        | 7        |
| 2. Clareza                     | 6        | 7        | 9        |
| 3. Justiça com o Grátis        | 9        | 9        | 9        |
| 4. Motivo para upgrade         | 4        | 8        | 7        |
| 5. Risco de dano (10 = nenhum) | 9        | 7        | 8        |
| 6. Sustentabilidade            | 5        | 7        | 5        |
| **Média**                      | **6,50** | **7,67** | **7,50** |

## Justificativa das notas

**A — v3 com o texto certo**

1. Valor 6: o Essencial a R$ 9,90 é barato, mas o que ele vende (5 h de nuvem) perdeu valor agora que o Parakeet local erra ~6 em 100 palavras de graça.
2. Clareza 6: quatro colunas, uma delas fechada, e a voz natural "sim" no Premium e "não" no Essencial; dá para entender, mas não em 10 s.
3. Justiça 9: nada é retirado do Grátis.
4. Upgrade 4: o motivo principal do pago (nuvem) foi canibalizado pelo próprio Grátis; só o tutor iChat sobra como argumento, e ele está escondido numa cota de tokens.
5. Risco 9: mexe pouco, não cria mecanismo novo de pressão.
6. Sustentabilidade 5: o Premium com 20 h + voz natural dá prejuízo no assinante pesado (conta abaixo) e o ticket baixo ancora o mercado em R$ 9,90.

**B — Estudar com IA**

1. Valor 8: Plus a R$ 14,90 empata com o Duolingo Super e entrega algo que o Grátis não tem (explicação da cena, resumo→cartões, correção).
2. Clareza 7: os nomes dizem o objetivo, mas são quatro planos e o Pro tem itens "quando existir".
3. Justiça 9: Grátis intacto.
4. Upgrade 8: o pago passa a vender IA de estudo (custo marginal baixo, valor alto) em vez de horas de nuvem.
5. Risco 7: painel do responsável e conversa por voz com menores exigem cuidado (o dossiê já limita o painel a tempo e palavras, sem o conteúdo ouvido); quatro planos aumentam a chance de cobrança confundida.
6. Sustentabilidade 7: Plus e Família cabem no líquido com folga se a cota da família for compartilhada; o Pro com 30 h + voz no anual não cabe e precisa de ajuste.

**C — Um pago só + família**

1. Valor 7: R$ 19,90 com "tudo de IA" é generoso, talvez generoso demais.
2. Clareza 9: um pago e uma família, decisão em 10 s.
3. Justiça 9: Grátis intacto.
4. Upgrade 7: resolve o problema real (entender o que assisto), mas quem só queria o tutor por texto paga o mesmo que quem quer voz.
5. Risco 8: simples, poucas formas de errar a cobrança; tutor por voz para menor pede o mesmo cuidado de B.
6. Sustentabilidade 5: tutor por voz + voz natural + 20 h a R$ 19,90 (e R$ 159,90/ano) fica negativo no pior caso; sem degrau acima, o usuário pesado não tem para onde subir e paga o mesmo do leve.

## Contas (números do dossiê; o que não está lá eu marco como "suponho")

**Premissas.** Câmbio R$ 5,60. Líquido = preço × 0,94 (Simples 6%) − R$ 1,09 (Asaas); confere com o dossiê (Essencial 8,22; Premium 17,62). Hora de nuvem no pior caso = US$ 0,08 (topo de STT+tradução) + US$ 0,036 (LLM de polimento, ~150 mil tokens/h) = US$ 0,116 ≈ **R$ 0,65/h**; caso central US$ 0,055 ≈ R$ 0,31/h. Mensagem de tutor no pior caso US$ 0,001 = R$ 0,0056. Voz natural no teto do dossiê US$ 0,60/mês = **R$ 3,36**. Suponho: Essencial ~150 mensagens/mês, Plus/Premium ~300, Pro ~400, família 600 compartilhadas; explicação/resumo/correção somam ~R$ 1,12/mês no pior caso; conversa por voz com tutor ~US$ 0,15/h (R$ 0,84/h; o dossiê não dá esse número — **medir antes de lançar**).

**O anual é a restrição que manda.** Em todas as alternativas o anual custa 7,5–8 mensalidades (desconto de 33–38%), e é ele que define a cota segura, porque o assinante anual usa 12 meses de cota com 8 meses de receita.

| Plano                                     | Líquido/mês mensal | Líquido/mês no anual | Custo variável no pior caso, cota cheia   | Margem no anual |
| ----------------------------------------- | ------------------ | -------------------- | ----------------------------------------- | --------------- |
| Essencial A (5 h)                         | 8,22               | 6,17                 | 3,25 + 0,84 = 4,09                        | +2,08           |
| Premium A (20 h + voz)                    | 17,62              | 11,65                | 13,00 + 3,36 + 1,68 = 18,04               | **−6,39**       |
| Plus B (10 h)                             | 12,92              | 9,30                 | 6,50 + 1,68 + 1,12 = 9,30                 | 0,00            |
| Família B (10 h por perfil × 4)           | 22,32              | 15,57                | 37,20                                     | **−21,63**      |
| Família B (15 h compartilhadas)           | 22,32              | 15,57                | 9,75 + 3,36 + 1,12 = 14,23                | +1,34           |
| Pro B (30 h + voz + 5 h tutor voz)        | 31,72              | 21,83                | 19,50 + 3,36 + 4,20 + 2,24 = 29,30        | **−7,47**       |
| Premium C (20 h + voz + 3 h tutor voz)    | 17,62              | 12,43                | 13,00 + 3,36 + 2,52 + 1,68 + 1,12 = 21,68 | **−9,25**       |
| Família C (5 perfis, 20 h compartilhadas) | 31,72              | 21,83                | 21,68 + ~1,7 (mais mensagens) ≈ 23,4      | **−1,6**        |

No caso central (R$ 0,31/h) quase tudo fica positivo; o problema é o assinante pesado, que é exatamente quem compra o anual. Pior caso não é exagero: "2 h/dia" num mês dá 60 h, e o teto mensal é o que segura.

**Cotas máximas seguras.** Regra que eu usaria: no pior custo unitário e com cota cheia, o assinante anual **nunca dá prejuízo** (teto duro), e a meta é que o custo no pior caso fique ≤ 50% do líquido do anual.

| Plano       | Teto duro (empata) com o anual atual | Meta 50% com o anual atual | Meta 50% com anual = 10 mensalidades | Cota que eu aprovaria                                             |
| ----------- | ------------------------------------ | -------------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| Essencial A | 8 h                                  | 3,5 h                      | 4,7 h                                | 5 h (já está) com anual R$ 99,90                                  |
| Premium A   | 10 h                                 | 1 h                        | 4 h                                  | 10 h + 2 h/dia, ou manter 20 h só subindo o anual para ~R$ 199,90 |
| Plus B      | 11,7 h                               | 4,6 h                      | 6,3 h                                | **8 h** (10 h só com anual ~R$ 149)                               |
| Família B   | 18,8 h (compartilhadas)              | 6,8 h                      | 9,8 h                                | **12 h compartilhadas** pelos 4 perfis                            |
| Pro B       | 25 h − tutor voz                     | 8 h                        | 12 h                                 | **20 h + 5 h de tutor por voz**                                   |
| Premium C   | 11,4 h                               | 1,8 h                      | 4,2 h                                | **10 h** e tutor por voz ≤ 2 h, ou não dá para C                  |
| Família C   | 23 h                                 | 6,5 h                      | 10,6 h                               | 15 h compartilhadas                                               |

Mensagens de tutor por texto são baratas (300 mensagens = R$ 1,68 no pior caso): cota de 300–500 é segura em qualquer plano pago. O caro é hora de nuvem e voz.

**Custo fixo e conversão.** Fixo R$ 165/mês. Suponho uso médio de 30% da cota no custo central. Contribuição por assinante: Essencial ≈ R$ 7,50, Plus ≈ R$ 11,50, Pro ≈ R$ 26. Pagantes para cobrir o fixo: ~22 no Essencial, ~15 no Plus, ~7 no Pro. Com conversão de 2–6% do Grátis, B empata o fixo com **250 a 720 usuários ativos no Grátis**; A precisa de **370 a 1.100**. Para um fundador solo, B chega ao ponto de equilíbrio com menos da metade da base.

**Pix Automático.** Economiza só R$ 0,10 por cobrança (0,99 contra 1,09), mas suponho que reduz a falha de cartão (churn involuntário), que em ticket baixo pesa mais que a taxa. Vale oferecer por padrão no mensal.

**Churn e anual.** O anual é bom para o caixa (recebe adiantado, sem investimento) e reduz o churn, mas com desconto de 33% e cota cheia ele é o pior assinante. Corrigir com anual = 10 mensalidades ("2 meses grátis"), ou manter o desconto e baixar a cota mensal do anual — prefiro a primeira, é mais fácil de explicar.

**Canibalização.** Em B, a Família (R$ 24,90) custa 1,67× o Plus; dois adultos que comprariam dois Plus (R$ 29,80) migram para ela, o que só é bom se a cota for compartilhada. Em A, o próprio Grátis canibaliza o Essencial (o pago vende nuvem, o Grátis tem local bom). Em C não há canibalização entre pagos, mas o leve subsidia o pesado.

**Âncora de preço.** R$ 9,90 ancora o Frasy abaixo do Duolingo Super (R$ 14,99) e dificulta subir depois. R$ 14,90 (B) se ancora no mercado sem parecer caro; o Pro a R$ 34,90 fica ao lado do Duolingo Max (R$ 33,33) e do Speak, o que é coerente para quem tem tutor por voz.

## Qual eu escolheria

Eu escolheria **B, com três ajustes**: Plus com 8 h de nuvem (ou 10 h com anual a ~R$ 149), Família com cota compartilhada de 12 h e o Pro com 20 h e conversa por voz com teto medido. B é a única que tira o pago da dependência da hora de nuvem (que o Grátis local esvaziou) e o põe em IA de estudo, onde o custo marginal é de centavos e o valor percebido é alto. Ela também tem o degrau família, que o mercado mostra pagar ~1,9× o individual, e chega ao ponto de equilíbrio do custo fixo com a menor base de Grátis.

## Até 5 recursos que me fariam pagar (ou pagar mais), por custo marginal baixo e valor alto

1. **Resumo da sessão → cartões automáticos com exemplos** — Plus, dentro dos R$ 14,90. Custo de centavos por sessão (uma chamada de LLM) e transforma "assisti" em "estudei"; é o recurso de maior valor por real gasto.
2. **Explicação contextual da frase (por que essa tradução, gramática da cena)** — Plus. Mensagem de tutor custa ~R$ 0,0056 no pior caso; 300 por mês saem por R$ 1,68.
3. **Painel do responsável (tempo e palavras aprendidas, sem o conteúdo ouvido)** — Família, R$ 24,90. Custo marginal quase zero (dados que já existem) e é o que justifica o responsável pagar.
4. **Correção de frases escritas + plano de revisão semanal** — Plus. Texto, barato, e cria hábito sem precisar de pressão.
5. **Conversa por voz com tutor a partir da cena** — Pro, R$ 34,90, **só depois de medir o custo por hora**; é o único recurso de custo alto que sustenta ticket alto (Speak, Duolingo Max).

## O que me faria desconfiar ou cancelar

1. Cota que acaba sem aviso no meio de uma sessão, ou "ilimitado" que na prática tem teto escondido: vira reclamação e reembolso, e reembolso no Asaas custa a taxa duas vezes.
2. Prejuízo estrutural no assinante anual pesado (Premium de A e de C como estão): cada usuário entusiasmado piora o caixa, e eu teria de cortar cota depois, o que é pior que lançar com cota menor.
3. Recursos anunciados "quando existir" ou voz "pronta, desligada" na tela de venda: quem paga por isso e não recebe pede o dinheiro de volta.

## Frase que eu gostaria de ler na tela de planos

"Legenda e tradução no seu aparelho são grátis para sempre; no Plus, a IA transforma o que você assistiu em revisão."
