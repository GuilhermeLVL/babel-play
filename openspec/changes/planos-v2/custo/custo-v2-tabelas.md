<!-- GERADO por `node scripts/custo/modelo.mjs` — não editar à mão. -->
Câmbio R$ 5,20 × (1 + IOF 3,5%) = R$ 5,38 por US$ pago no cartão.

## T1 — Por usuário/mês, HOJE (nuvem grátis desligada: sem alívio nem convidado na nuvem)

O Premium é o assinante MÉDIO do mix de ciclos (60,0% mensal, 25,0% anual à vista, 15,0% anual em 12x). O teste não tem receita. O teto do Premium é 40 h (o mês de 40 h morde antes das 2 h/dia × 30); o do teste, 28 h (14 × 2 h).

| plano | perfil | h fala nuvem | msgs tutor | STT US$ | tradução US$ | tutor US$ | áudio retido MB | armaz+banda+banco US$ | variável R$ | receita/mês R$ | Asaas R$ | Simples 6,0% R$ | Langfuse marg. R$ | margem R$ (sem fixo) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| convidado | leve | 0,00 | 0 | 0,000 | 0,000 | 0,000 | 0 | 0,000 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | -0,00 |
| convidado | tipico | 0,00 | 0 | 0,000 | 0,000 | 0,000 | 0 | 0,000 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | -0,00 |
| convidado | teto | 0,00 | 0 | 0,000 | 0,000 | 0,000 | 0 | 0,000 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | -0,00 |
| free | leve | 0,00 | 0 | 0,000 | 0,000 | 0,000 | 33 | 0,001 | 0,01 | 0,00 | 0,00 | 0,00 | 0,00 | -0,01 |
| free | tipico | 0,00 | 0 | 0,000 | 0,000 | 0,000 | 132 | 0,005 | 0,03 | 0,00 | 0,00 | 0,00 | 0,00 | -0,03 |
| free | teto | 0,00 | 0 | 0,000 | 0,000 | 0,000 | 500 | 0,020 | 0,11 | 0,00 | 0,00 | 0,00 | 0,00 | -0,11 |
| teste | leve | 2,80 | 10 | 0,121 | 0,101 | 0,004 | 92 | 0,002 | 1,22 | 0,00 | 0,00 | 0,00 | 2,90 | -1,22 |
| teste | tipico | 11,20 | 70 | 0,484 | 0,403 | 0,025 | 370 | 0,008 | 4,95 | 0,00 | 0,00 | 0,00 | 11,63 | -4,95 |
| teste | teto | 28,00 | 0 | 1,210 | 1,008 | 0,000 | 924 | 0,020 | 12,04 | 0,00 | 0,00 | 0,00 | 28,93 | -12,04 |
| premium | leve | 4,00 | 30 | 0,173 | 0,144 | 0,011 | 132 | 0,003 | 1,78 | 17,91 | 1,15 | 1,07 | 4,16 | 13,90 |
| premium | tipico | 16,00 | 150 | 0,691 | 0,576 | 0,054 | 528 | 0,012 | 7,17 | 17,91 | 1,15 | 1,07 | 16,66 | 8,50 |
| premium | teto | 40,00 | 0 | 1,728 | 1,440 | 0,000 | 1.320 | 0,032 | 17,22 | 17,91 | 1,15 | 1,07 | 41,33 | -1,54 |

Pior caso absoluto do LLM no teto do Premium (tudo saída): US$ 3,60 no mês.

## T1b — O Premium por ciclo (R$ por mês, sem o fixo)

| ciclo | receita/mês | Asaas/mês | Simples/mês | margem típico (16 h) | margem no teto (40 h) |
|---|---|---|---|---|---|
| mensal | 19,90 | 1,54 | 1,19 | 9,99 | -0,05 |
| anual | 14,92 | 0,33 | 0,89 | 6,52 | -3,53 |
| anual12x | 14,92 | 0,99 | 0,89 | 5,86 | -4,19 |

O anual é R$ 179,00 ÷ 12 = R$ 14,92 por mês: "equivale a 3 meses grátis" contra 12 × R$ 19,90 = R$ 238,80. O 12x paga R$ 11,88 por ano ao Asaas (sondagem do sandbox).

## T1c — O teste de 14 dias: custo por teste e quantos meses de assinatura o pagam

| perfil | h de nuvem nos 14 dias | custo do teste R$ | meses de assinatura típica |
|---|---|---|---|
| leve | 2,80 | 1,22 | 0,14 |
| tipico | 11,20 | 4,95 | 0,58 |
| teto | 28,00 | 12,04 | 1,42 |

Conversão teste → assinatura não medida (HIPÓTESE): com o teste típico acima, cada ponto percentual de conversão paga o seu próprio teste em poucos meses; o pior caso é quem usa as 28 h e não assina.

## T2 — Por usuário/mês com a nuvem GRÁTIS ligada (alívio do Grátis + convidado)

O alívio conta a média do Grátis: 30,0% dos aparelhos são fracos (HIPÓTESE) e usam até 3 h, com teto de US$ 0,13 por conta. O convidado: 10 min e teto de US$ 0,02.

| plano | perfil | h fala nuvem | msgs tutor | STT US$ | tradução US$ | tutor US$ | áudio retido MB | armaz+banda+banco US$ | variável R$ | receita/mês R$ | Asaas R$ | Simples 6,0% R$ | Langfuse marg. R$ | margem R$ (sem fixo) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| convidado | leve | 0,05 | 2 | 0,002 | 0,002 | 0,001 | 0 | 0,000 | 0,02 | 0,00 | 0,00 | 0,00 | 0,05 | -0,02 |
| convidado | tipico | 0,17 | 5 | 0,007 | 0,006 | 0,002 | 0 | 0,000 | 0,08 | 0,00 | 0,00 | 0,00 | 0,18 | -0,08 |
| convidado | teto | 0,17 | 5 | 0,007 | 0,006 | 0,002 | 0 | 0,000 | 0,08 | 0,00 | 0,00 | 0,00 | 0,18 | -0,08 |
| free | leve | 0,27 | 0 | 0,012 | 0,010 | 0,000 | 33 | 0,001 | 0,12 | 0,00 | 0,00 | 0,00 | 0,28 | -0,12 |
| free | tipico | 0,49 | 0 | 0,021 | 0,018 | 0,000 | 132 | 0,005 | 0,24 | 0,00 | 0,00 | 0,00 | 0,51 | -0,24 |
| free | teto | 0,49 | 0 | 0,021 | 0,018 | 0,000 | 500 | 0,020 | 0,32 | 0,00 | 0,00 | 0,00 | 0,51 | -0,32 |
| teste | leve | 2,80 | 10 | 0,121 | 0,101 | 0,004 | 92 | 0,002 | 1,22 | 0,00 | 0,00 | 0,00 | 2,90 | -1,22 |
| teste | tipico | 11,20 | 70 | 0,484 | 0,403 | 0,025 | 370 | 0,008 | 4,95 | 0,00 | 0,00 | 0,00 | 11,63 | -4,95 |
| teste | teto | 28,00 | 0 | 1,210 | 1,008 | 0,000 | 924 | 0,020 | 12,04 | 0,00 | 0,00 | 0,00 | 28,93 | -12,04 |
| premium | leve | 4,00 | 30 | 0,173 | 0,144 | 0,011 | 132 | 0,003 | 1,78 | 17,91 | 1,15 | 1,07 | 4,16 | 13,90 |
| premium | tipico | 16,00 | 150 | 0,691 | 0,576 | 0,054 | 528 | 0,012 | 7,17 | 17,91 | 1,15 | 1,07 | 16,66 | 8,50 |
| premium | teto | 40,00 | 0 | 1,728 | 1,440 | 0,000 | 1.320 | 0,032 | 17,22 | 17,91 | 1,15 | 1,07 | 41,33 | -1,54 |

## T3 — Patamares (mix 65,0% Grátis / 5,0% em teste / 30,0% Premium; 1 convidado por cadastrado; perfis 50,0% leve / 40,0% típico / 10,0% teto)

| cadastrados | assinantes | em teste | receita R$ | fixo infra R$ | IA R$ | Asaas R$ | Simples | custo total R$ | resultado R$ | margem |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 3 | 1 | 53,72 | 354,73 | 18,17 | 3,46 | 6,0% = 3,22 | 379,58 | -325,86 | -606,6% |
| 100 | 30 | 5 | 537,20 | 774,84 | 181,71 | 34,58 | 6,0% = 32,23 | 1023,36 | -486,16 | -90,5% |
| 1.000 | 300 | 50 | 5372,00 | 4918,89 | 1817,14 | 345,78 | 6,0% = 322,32 | 7404,13 | -2032,13 | -37,8% |
| 10.000 | 3.000 | 500 | 53720,00 | 45804,74 | 18171,37 | 3457,76 | 10,8% = 5782,20 | 73216,07 | -19496,07 | -36,3% |

Fixo de infra por item (US$/mês):

- 10 · fly_maquinas 10,81 · fly_volume 0,45 · supabase 25,00 · r2_armazenamento 0,00 · r2_classe_a 0,00 · fly_egress 0,03 · resend 0,00 · sentry 0,00 · langfuse 29,01
- 100 · fly_maquinas 10,81 · fly_volume 0,45 · supabase 25,00 · r2_armazenamento 0,24 · r2_classe_a 5,43 · fly_egress 0,31 · resend 0,00 · sentry 0,00 · langfuse 101,14
- 1.000 · fly_maquinas 53,31 · fly_volume 1,50 · supabase 25,00 · supabase_compute_extra 5,00 · supabase_disco_extra 0,00 · r2_armazenamento 3,11 · r2_classe_a 0,00 · fly_egress 3,14 · resend 0,00 · sentry 0,00 · langfuse 822,43
- 10.000 · fly_maquinas 266,54 · fly_volume 0,75 · supabase 25,00 · supabase_compute_extra 100,00 · supabase_disco_extra 0,51 · r2_armazenamento 32,09 · r2_classe_a 0,00 · fly_egress 31,37 · resend 20,00 · sentry 0,00 · langfuse 8035,32

**Ponto de equilíbrio (base):** null cadastrados.

## T4 — Demanda de nuvem × camada GRATUITA da Groq (restrição atual)

| cadastrados | h de fala STT/mês | teto grátis STT h/mês | req LLM/mês | teto grátis req LLM/mês | veredito |
|---|---|---|---|---|---|
| 10 | 42 | 222 | 25.166 | 30.000 | cabe |
| 100 | 415 | 222 | 251.655 | 30.000 | NÃO cabe |
| 1.000 | 4.154 | 222 | 2.516.550 | 30.000 | NÃO cabe |
| 10.000 | 41.540 | 222 | 25.165.500 | 30.000 | NÃO cabe |

Um Premium típico pede 9.600 traduções/mês; o teto grátis de 1.000 req/dia (30.000/mês) atende ~3 assinantes típicos no app inteiro.

## T5 — Sensibilidade: resultado mensal (R$) por patamar e ponto de equilíbrio

| cenário | 10 cad. | 100 cad. | 1.000 cad. | 10.000 cad. | equilíbrio (cad.) |
|---|---|---|---|---|---|
| base | -325,86 | -486,16 | -2032,13 | -19496,07 | null |
| câmbio −20% | -251,95 | -295,52 | -685,59 | -6701,52 | null |
| câmbio +20% | -399,78 | -676,81 | -3378,66 | -32290,63 | null |
| uso 2× | -367,77 | -906,84 | -6237,88 | -61561,78 | null |
| Anexo V (Fator R < 28%) | -330,97 | -537,20 | -2542,47 | -23364,27 | null |
| 100% Pix (mensal e anual à vista) | -326,56 | -493,10 | -2101,54 | -20190,19 | null |
| mais anual (30% mensal, 40% à vista, 30% 12x) | -329,29 | -520,41 | -2374,57 | -22584,20 | null |
| teto de 60 h JÁ (antes do B7, pilha de hoje) | -334,62 | -573,72 | -2907,73 | -28252,15 | null |
| o dobro de contas em teste (10%) | -332,24 | -550,00 | -2670,46 | -25879,18 | null |
| 10% pagantes (85% Grátis, 5% teste) | -190,23 | -433,11 | -1501,67 | -11783,69 | null |
| Langfuse desligado | -169,74 | 58,10 | 2393,44 | 23742,53 | 78 |
| Langfuse com amostragem 10% | -169,74 | -98,03 | 1849,18 | 19316,97 | 143 |
| nuvem grátis ligada (alívio + convidado) | -331,15 | -539,04 | -2560,92 | -24784,05 | null |
| pior combinado (câmbio +20%, uso 2×, Anexo V) | -455,17 | -1232,65 | -8935,91 | -86637,67 | null |

Margem do assinante médio NO TETO: R$ -1,54 com 40 h; R$ -10,07 com 60 h na pilha de hoje — é por isso que o teto só sobe depois do B7.


## T6 — A nuvem grátis ligada: custo mensal e o pool do dia do alívio

Pool do alívio = 20,0% × AI_BUDGET_USD_DAY (US$ 4,00) = US$ 0,80/dia; os outros 80% ficam para quem paga. Suba o orçamento do dia junto com a receita.

| cadastrados | IA Grátis+convidado R$/mês | pool do alívio US$/dia | demanda do alívio US$/dia | veredito |
|---|---|---|---|---|
| 10 | 1,58 | 0,80 | 0,01 | cabe |
| 100 | 15,81 | 0,80 | 0,07 | cabe |
| 1.000 | 158,07 | 0,80 | 0,65 | cabe |
| 10.000 | 1580,68 | 0,80 | 6,54 | pool corta (segue no aparelho) |

## T7 — Economias propostas

| medida | ganho estimado | status |
|---|---|---|
| Cache de tradução sem contexto para falas curtas | MT = 43,6% da IA do Premium típico; cada 10 p.p. de acerto = 4,4% da IA | a medir (taxa de repetição de falas curtas) |
| Prompt caching da Groq (automático, −50% na entrada em cache, mín. 128–1.024 tokens) | entrada = 49,3% do custo por fala; se 60% da entrada for prefixo em cache: −14,8% na tradução | a medir (`cached_tokens` na resposta; prefixo pode ser menor que o mínimo) |
| Cascata barata da Fase B (DeepInfra ~US$ 0,024/h de fala e tradução) | o que deixa o teto do Premium subir de 40 h para 60 h sem prejuízo | a medir no B5/B7 (bancada com IC pareado) |
| Amostrar Langfuse em 10% (erros 100%) | 1.000 cadastrados: US$ 822,43 → 101,14/mês | calculado |
| Litestream sync-interval 1 s → 10 s | 100 cadastrados: classe A US$ 5,43 → 0,00/mês (perda máx. 10 s) | calculado |
| Anual à vista (1 cobrança Asaas em vez de 12) | taxa do ano: mensal R$ 18,45, anual à vista R$ 3,92, 12x R$ 11,88 | calculado (o 12x, da sondagem do sandbox) |
| Mover STT/tradução para o navegador (Moonshine en, opus-mt) | até 100% da parte movida; custa WER 4,9%→13,5% (en) e COMET 0,917→0,847 | decisão de produto (bancada-2026-09.md) |

Fly (01/10/2026, São Paulo): shared-cpu-1x 1 GB = US$ 10,81/mês; performance-1x 2 GB = US$ 53,31/mês. docs/LANCAMENTO.md usa US$ 5,70 (preço de Ashburn antigo, sem o multiplicador de GRU).
