<!-- GERADO por `node scripts/custo/modelo.mjs` — não editar à mão. -->
Câmbio R$ 5,20 × (1 + IOF 3,5%) = R$ 5,38 por US$ pago no cartão.

## T1 — Por usuário/mês, HOJE (convidado e free sem nuvem)

| plano | perfil | h fala nuvem | msgs tutor | STT US$ | tradução US$ | tutor US$ | áudio retido MB | armaz+banda+banco US$ | variável R$ | Asaas R$ | Simples 6,0% R$ | Langfuse marg. R$ | margem R$ (sem fixo) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| convidado | leve | 0,00 | 0 | 0,000 | 0,000 | 0,000 | 0 | 0,000 | 0,00 | 0,00 | 0,00 | 0,00 | -0,00 |
| convidado | tipico | 0,00 | 0 | 0,000 | 0,000 | 0,000 | 0 | 0,000 | 0,00 | 0,00 | 0,00 | 0,00 | -0,00 |
| convidado | teto | 0,00 | 0 | 0,000 | 0,000 | 0,000 | 0 | 0,000 | 0,00 | 0,00 | 0,00 | 0,00 | -0,00 |
| free | leve | 0,00 | 0 | 0,000 | 0,000 | 0,000 | 33 | 0,001 | 0,01 | 0,00 | 0,00 | 0,00 | -0,01 |
| free | tipico | 0,00 | 0 | 0,000 | 0,000 | 0,000 | 132 | 0,005 | 0,03 | 0,00 | 0,00 | 0,00 | -0,03 |
| free | teto | 0,00 | 0 | 0,000 | 0,000 | 0,000 | 500 | 0,020 | 0,11 | 0,00 | 0,00 | 0,00 | -0,11 |
| essencial | leve | 1,50 | 20 | 0,065 | 0,054 | 0,007 | 50 | 0,002 | 0,69 | 1,54 | 1,19 | 1,57 | 16,48 |
| essencial | tipico | 6,00 | 100 | 0,259 | 0,216 | 0,036 | 198 | 0,007 | 2,79 | 1,54 | 1,19 | 6,29 | 14,38 |
| essencial | teto | 15,00 | 0 | 0,648 | 0,720 | 0,000 | 495 | 0,020 | 7,47 | 1,54 | 1,19 | 15,50 | 9,70 |
| pro | leve | 2,00 | 30 | 0,086 | 0,072 | 0,011 | 66 | 0,002 | 0,92 | 1,84 | 2,39 | 2,09 | 34,75 |
| pro | tipico | 8,00 | 150 | 0,346 | 0,288 | 0,054 | 264 | 0,008 | 3,74 | 1,84 | 2,39 | 8,39 | 31,93 |
| pro | teto | 20,00 | 0 | 0,864 | 1,200 | 0,000 | 660 | 0,022 | 11,23 | 1,84 | 2,39 | 20,66 | 24,44 |

Pior caso absoluto do LLM no teto (tudo saída, planos.ts:35): Essencial US$ 1,80, Pro US$ 3,00.
Margem no pior absoluto (sem fixo): Essencial R$ 3,89 sem Langfuse e R$ -11,61 com Langfuse sem amostragem; Pro R$ 14,76 e R$ -5,91.

## T2 — Por usuário/mês com a PROPOSTA de cota de nuvem para convidado e free

| plano | perfil | h fala nuvem | msgs tutor | STT US$ | tradução US$ | tutor US$ | áudio retido MB | armaz+banda+banco US$ | variável R$ | Asaas R$ | Simples 6,0% R$ | Langfuse marg. R$ | margem R$ (sem fixo) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| convidado | leve | 0,05 | 2 | 0,002 | 0,002 | 0,001 | 0 | 0,000 | 0,02 | 0,00 | 0,00 | 0,05 | -0,02 |
| convidado | tipico | 0,17 | 5 | 0,007 | 0,006 | 0,002 | 0 | 0,000 | 0,08 | 0,00 | 0,00 | 0,18 | -0,08 |
| convidado | teto | 0,17 | 5 | 0,007 | 0,006 | 0,002 | 0 | 0,000 | 0,08 | 0,00 | 0,00 | 0,18 | -0,08 |
| free | leve | 0,15 | 6 | 0,006 | 0,005 | 0,002 | 33 | 0,001 | 0,08 | 0,00 | 0,00 | 0,16 | -0,08 |
| free | tipico | 0,50 | 20 | 0,022 | 0,018 | 0,007 | 132 | 0,005 | 0,28 | 0,00 | 0,00 | 0,53 | -0,28 |
| free | teto | 0,50 | 20 | 0,022 | 0,018 | 0,007 | 500 | 0,020 | 0,36 | 0,00 | 0,00 | 0,53 | -0,36 |
| essencial | leve | 1,50 | 20 | 0,065 | 0,054 | 0,007 | 50 | 0,002 | 0,69 | 1,54 | 1,19 | 1,57 | 16,48 |
| essencial | tipico | 6,00 | 100 | 0,259 | 0,216 | 0,036 | 198 | 0,007 | 2,79 | 1,54 | 1,19 | 6,29 | 14,38 |
| essencial | teto | 15,00 | 0 | 0,648 | 0,720 | 0,000 | 495 | 0,020 | 7,47 | 1,54 | 1,19 | 15,50 | 9,70 |
| pro | leve | 2,00 | 30 | 0,086 | 0,072 | 0,011 | 66 | 0,002 | 0,92 | 1,84 | 2,39 | 2,09 | 34,75 |
| pro | tipico | 8,00 | 150 | 0,346 | 0,288 | 0,054 | 264 | 0,008 | 3,74 | 1,84 | 2,39 | 8,39 | 31,93 |
| pro | teto | 20,00 | 0 | 0,864 | 1,200 | 0,000 | 660 | 0,022 | 11,23 | 1,84 | 2,39 | 20,66 | 24,44 |

## T3 — Patamares (mix 70,0% free / 20,0% Essencial / 10,0% Pro; 1 convidado por cadastrado; perfis 50,0% leve / 40,0% típico / 10,0% teto)

| cadastrados | pagantes | receita R$ | fixo infra R$ | IA R$ | Asaas R$ | Simples | custo total R$ | resultado R$ | margem |
|---|---|---|---|---|---|---|---|---|---|
| 10 | 3 | 79,70 | 198,61 | 7,40 | 4,91 | 6,0% = 4,78 | 215,70 | -136,00 | -170,6% |
| 100 | 30 | 797,00 | 504,61 | 73,97 | 49,12 | 6,0% = 47,82 | 675,51 | 121,49 | 15,2% |
| 1.000 | 300 | 7970,00 | 2216,67 | 739,68 | 491,15 | 6,0% = 478,20 | 3925,70 | 4044,30 | 50,7% |
| 10.000 | 3.000 | 79700,00 | 18782,68 | 7396,82 | 4911,51 | 12,3% = 9782,00 | 40873,02 | 38826,98 | 48,7% |

Fixo de infra por item (US$/mês):

- 10 · fly_maquinas 10,81 · fly_volume 0,45 · supabase 25,00 · r2_armazenamento 0,00 · r2_classe_a 0,00 · fly_egress 0,03 · resend 0,00 · sentry 0,00 · langfuse 0,00
- 100 · fly_maquinas 10,81 · fly_volume 0,45 · supabase 25,00 · r2_armazenamento 0,12 · r2_classe_a 5,42 · fly_egress 0,32 · resend 0,00 · sentry 0,00 · langfuse 51,04
- 1.000 · fly_maquinas 53,31 · fly_volume 1,50 · supabase 25,00 · supabase_compute_extra 5,00 · supabase_disco_extra 0,00 · r2_armazenamento 1,91 · r2_classe_a 0,00 · fly_egress 3,20 · resend 0,00 · sentry 0,00 · langfuse 321,40
- 10.000 · fly_maquinas 266,54 · fly_volume 0,75 · supabase 25,00 · supabase_compute_extra 100,00 · supabase_disco_extra 0,55 · r2_armazenamento 20,09 · r2_classe_a 0,00 · fly_egress 31,96 · resend 20,00 · sentry 0,00 · langfuse 3025,00

**Ponto de equilíbrio (base):** 73 cadastrados.

## T4 — Demanda de nuvem × camada GRATUITA da Groq (restrição atual)

| cadastrados | h de fala STT/mês | teto grátis STT h/mês | req LLM/mês | teto grátis req LLM/mês | veredito |
|---|---|---|---|---|---|
| 10 | 16 | 222 | 9.475 | 30.000 | cabe |
| 100 | 155 | 222 | 94.750 | 30.000 | NÃO cabe |
| 1.000 | 1.550 | 222 | 947.500 | 30.000 | NÃO cabe |
| 10.000 | 15.500 | 222 | 9.475.000 | 30.000 | NÃO cabe |

Um Essencial típico pede 3.600 traduções/mês; o teto grátis de 1.000 req/dia (30.000/mês) atende ~8 assinantes típicos no app inteiro.

## T5 — Sensibilidade: resultado mensal (R$) por patamar e ponto de equilíbrio

| cenário | 10 cad. | 100 cad. | 1.000 cad. | 10.000 cad. | equilíbrio (cad.) |
|---|---|---|---|---|---|
| base | -136,00 | 121,49 | 4044,30 | 38826,98 | 73 |
| câmbio −20% | -95,46 | 236,54 | 4634,90 | 44062,22 | 52 |
| câmbio +20% | -176,53 | 6,44 | 3453,70 | 33591,75 | 99 |
| uso 2× | -297,03 | -39,26 | 2437,78 | 22753,42 | 114 |
| Anexo V (Fator R < 28%) | -143,57 | 45,77 | 3287,15 | 33695,48 | 88 |
| 100% Pix | -137,06 | 110,90 | 3938,45 | 37768,50 | 75 |
| Langfuse desligado | -136,00 | 396,14 | 5773,78 | 55104,72 | 33 |
| Langfuse com amostragem 10% | -136,00 | 396,14 | 5499,13 | 53375,24 | 33 |
| proposta free/convidado ligada | -137,67 | 69,02 | 3519,65 | 33580,44 | 83 |
| pior combinado (câmbio +20%, uso 2×, Anexo V) | -377,35 | -262,18 | 768,72 | 9171,97 | 289 |

## T6 — Proposta de nuvem para free/convidado: custo mensal e pool global por dia

| cadastrados | IA free+convidado R$/mês | pool global US$/dia | demanda média US$/dia | veredito |
|---|---|---|---|---|
| 10 | 1,67 | 0,50 | 0,01 | cabe |
| 100 | 16,70 | 0,50 | 0,10 | cabe |
| 1.000 | 167,05 | 2,17 | 1,03 | cabe |
| 10.000 | 1670,50 | 20,13 | 10,35 | cabe |

## T7 — Economias propostas

| medida | ganho estimado | status |
|---|---|---|
| Cache de tradução sem contexto para falas curtas | MT = 42,3% da IA do Essencial típico; cada 10 p.p. de acerto = 4,2% da IA | a medir (taxa de repetição de falas curtas) |
| Cache por hash de áudio | fala ao vivo nunca repete; só retranscrição/importação | a medir (importações repetidas) |
| Prompt caching da Groq (automático, −50% na entrada em cache, mín. 128–1.024 tokens) | entrada = 49,3% do custo por fala; se 60% da entrada for prefixo em cache: −14,8% na tradução | a medir (`cached_tokens` na resposta; prefixo pode ser menor que o mínimo) |
| gpt-oss-20b para frases curtas | US$ 0,018/h vs 0,036/h (−50%), mas −0,033 COMET no gold (bancada:79,87) | a medir (qualidade só em frases curtas) |
| Provedor ZDR mais barato na OpenRouter (gpt-oss-120b US$ 0,03/0,17 + 5,5% de taxa) | até −72% na tradução e tutor | a medir (qualidade/quantização não medidas na bancada) |
| Amostrar Langfuse em 10% (erros 100%) | 1.000 cadastrados: US$ 321,40 → 51,04/mês | calculado |
| Litestream sync-interval 1 s → 10 s | 100 cadastrados: classe A US$ 5,42 → 0,00/mês (perda máx. 10 s) | calculado |
| Plano anual (1 cobrança Asaas em vez de 12) | Essencial: R$ 16,91 a menos por ano em taxa fixa+Pix (aprox.) | calculado (preço anual é decisão do dono) |
| Mover STT/tradução para o navegador (Moonshine en, opus-mt) | até 100% da parte movida; custa WER 4,9%→13,5% (en) e COMET 0,917→0,847 | decisão de produto (bancada:44-46,77-81) |

Fly (01/10/2026, São Paulo): shared-cpu-1x 1 GB = US$ 10,81/mês; performance-1x 2 GB = US$ 53,31/mês. docs/LANCAMENTO.md:25 usa US$ 5,70 (preço de Ashburn antigo, sem o multiplicador de GRU).
