# Prontidão para produção — Fase 3: custo (25/09/2026)

Branch `auditoria/prontidao-producao`. O modelo é `scripts/custo/modelo.mjs`, em Node puro e sem dependências. Para rodar:
`node scripts/custo/modelo.mjs`. Ele gera `fase3-custo.csv` (formato longo, com 533 linhas) e `fase3-custo-tabelas.md` (tabelas T1 a T7). Os números
deste relatório saem dessas tabelas. Para mudar uma premissa, edite o objeto `P` no topo do script; cada campo tem a fonte comentada ao lado.

Há três tipos de premissa, sempre identificados:

- **Medido:** número de bancada ou de carga.
- **Fonte:** arquivo:linha, ou URL consultada em 25/09/2026.
- **HIPÓTESE:** uso real ainda não medido, porque o app não lançou. Toda hipótese entra na sensibilidade.

## 0. Resumo para decisão

1. **Por assinante, todo plano fecha positivo no uso leve, no típico e no teto de tokens.** No pior caso absoluto, em que o
   pool de tokens inteiro vira saída, o **Essencial sobra só R$ 3,89** antes do custo fixo (planos.ts:37 estimava folga de ~R$ 3,90
   com câmbio de 5,60 e Asaas de R$ 1,09; aqui o câmbio é menor, mas entram IOF e Pix de R$ 1,99). O Pro sobra R$ 14,76.
2. **O Langfuse sem amostragem custa mais que a própria IA.** Cada chamada gera 2 unidades (trace + geração,
   `server/lib/langfuse.ts:24-26`). O Essencial típico faz ~7.300 chamadas/mês, o que dá **R$ 6,29 de Langfuse contra R$ 2,79 de IA**. Com Langfuse, o
   pior caso absoluto fica **negativo**: Essencial −R$ 11,61 e Pro −R$ 5,91. Com 1.000 cadastrados, o Langfuse custa US$ 321/mês; com 10.000,
   até US$ 3.025/mês. Esse valor é teto: a página de preços cita descontos progressivos, mas não publica os valores. **Amostrar antes de ligar**,
   com 10% das chamadas e 100% dos erros, derruba o ponto de equilíbrio de 73 para 33 cadastrados.
3. **O custo fixo do lançamento está subestimado.** O preço do Fly em São Paulo tem multiplicador de 1,615 sobre o compute, e a RAM sobe para US$ 6/GB
   a partir de 01/10/2026. Com isso, o shared-cpu-1x de 1 GB custa **US$ 10,81**, e não os US$ 5,70 de `docs/LANCAMENTO.md:25`. O performance-1x custa **US$ 53,31**.
   O fixo no patamar de 10 cadastrados fica em **R$ 198,61/mês**.
4. **O ponto de equilíbrio é de 73 cadastrados** (≈ 22 pagantes) no mix-base 70/20/10. Mas **a camada gratuita da Groq não chega
   lá**: os 1.000 pedidos/dia de LLM atendem ~8 assinantes Essencial típicos no app inteiro (T4). Sem o upgrade para a camada Developer, ou
   sem créditos na OpenRouter (a chave está expirada, bancada-2026-09.md:131), **não dá para vender a quantidade que paga a infra**.
5. **O orçamento de IA sugerido (US$ 40, LANCAMENTO.md:212) cobre ~290 cadastrados** (≈ 87 pagantes) no uso-base. Acima disso, a
   nuvem fecha no meio do mês (`orcamentoDeIa.ts:108`). O teto precisa crescer com o número de pagantes (§6).
6. **O free e o convidado quase não custam hoje.** A nuvem responde 402 a quem não paga (`server/ai/sttProxy.ts:116-117`,
   `server/ai/mtProxy.ts:122-123`, `server/routes/tutor.ts:102`), e o convidado roda em memória local (`src/core/tetoAnonimo.ts:4-6`). O free
   custa de R$ 0,01 a R$ 0,11/mês de armazenamento e banda. O prejuízo que ele gera é o **rateio do fixo**, não a IA. A cota de nuvem proposta
   (§4) custa de R$ 0,02 a R$ 0,36 por usuário/mês, com teto em US$ por usuário e um pool global por dia.

## 1. Premissas

### 1.1 Preços e medições

| Item | Valor | Fonte |
|---|---|---|
| Câmbio | R$ 5,1991/US$ (PTAX venda 25/09/2026; faixa do mês 5,0856–5,1991) | Banco Central, API Olinda PTAX, consultada em 25/09/2026. `planos.ts:26` planeja com 5,60, dentro do cenário +20% |
| IOF em compra internacional no cartão | 3,5% sobre todo gasto em US$ | Decreto 12.499/2025 (pwc.com.br, wise.com/br, consultados em 25/09/2026) |
| STT whisper-large-v3-turbo | US$ 0,04/h, mínimo de 10 s por requisição | console.groq.com/docs/speech-to-text (25/09/2026); `server/lib/orcamentoDeIa.ts:44,55` |
| Faturado ÷ real | 1,08 com VAD de 800 ms | **Medido**: `docs/auditoria/eval/bancada-2026-09.md:62` |
| gpt-oss-120b (Groq) | US$ 0,15 na entrada, 0,075 na entrada em cache, 0,60 na saída, por 1M tokens | console.groq.com/docs/model/openai/gpt-oss-120b (25/09/2026); `orcamentoDeIa.ts:42` |
| Tradução, raciocínio "low" | US$ 0,036 por hora de fala | **Medido**: bancada-2026-09.md:77 |
| Teto de tokens | 80% entrada / 20% saída (o pior absoluto é 100% saída) | `src/core/planos.ts:35-36` |
| Tutor | ~1.500 tokens/mensagem, divididos em 1.200 de entrada e 300 de saída | **Não medido**. Pior caso por pergunta: 3.300 + 900 tokens ≈ US$ 0,001 (`server/ai/funcoesDeIa.ts:16-21`) |
| Falas por hora | 600 (6 s por fala), 2 chamadas por fala | `planos.ts:38` |
| Groq, camada gratuita (a de hoje) | STT: 28.800 s de áudio/dia e 2.000 req/dia. gpt-oss-120b: 1.000 req/dia e 200 mil tokens/dia, **por organização** | console.groq.com/docs/rate-limits (25/09/2026) |
| OpenRouter, gpt-oss-120b | Endpoints ZDR de US$ 0,03/0,17 (AkashML, CoreWeave) até 0,35/0,75 (Cerebras); Groq a 0,15/0,60; taxa de 5,5% na compra de crédito | `openrouter.ai/api/v1/endpoints/zdr` e openrouter.ai/pricing (25/09/2026) |
| Áudio | Opus 24 kbps ≈ 11 MB/h, retenção de 90 dias (≈ 3 meses guardados) | fase2-escala.md:130; `server/lib/config.ts:831` |
| Cloudflare R2 | US$ 0,015/GB-mês; classe A a US$ 4,50/M; classe B a US$ 0,36/M; 10 GB, 1M A e 10M B grátis; egress zero | developers.cloudflare.com/r2/pricing (25/09/2026) |
| Litestream | Envia o WAL a cada 1 s (padrão); 1 PUT por intervalo com escrita | litestream.io/reference/config (25/09/2026); `litestream.yml:15` |
| Escritas | 0,076 × cadastrados por segundo no pico; média = pico × 0,25 (**HIPÓTESE**) | fase2-escala.md:80 |
| Fly (a partir de 01/10/2026) | Ashburn: shared-cpu-1x 256 MB a US$ 2,19; performance-1x 2 GB a US$ 33,00; RAM a US$ 6/GB-mês; **São Paulo × 1,615384615** | fly.io/pricing-update (seletor de região; 25/09/2026). **Premissa**: o multiplicador vale também para a RAM extra |
| Fly: volume, snapshots e egress | Volume a US$ 0,15/GB; snapshots a US$ 0,08/GB (10 GB grátis); egress na América do Sul a US$ 0,04/GB | docs.fly.io/about/pricing (25/09/2026) |
| Supabase Pro | US$ 25 com US$ 10 de crédito de compute (cobre o Micro). Small US$ 15, Medium 60, Large 110. 8 GB de disco incluídos, depois US$ 0,125/GB. 100 mil MAU | supabase.com/pricing (25/09/2026) |
| Resend | Free: 3.000 e-mails/mês e 100/dia. Pro: US$ 20 com 50.000 | resend.com/pricing (25/09/2026) |
| Sentry | Developer: 5.000 erros. Team: US$ 26/mês no plano anual | sentry.io/pricing (25/09/2026) |
| Langfuse | Hobby: 50 mil unidades. Core: US$ 29 com 100 mil, depois US$ 8 por 100 mil | langfuse.com/pricing (25/09/2026) |
| Asaas | Pix: R$ 0,99 nos 3 primeiros meses, **R$ 1,99 depois**. Cartão à vista: R$ 0,49 + 2,99% (1,99% na promoção). Sem mensalidade | asaas.com/precos-e-taxas e blog.asaas.com/taxas-asaas (25/09/2026). O modelo usa o preço cheio |
| Simples Nacional | Anexo III (6% na 1ª faixa, com Fator R ≥ 28%) ou Anexo V (15,5%); alíquota efetiva pela faixa de RBT12 | `planos.ts:26` ("~6%"); tabelas 2026 em contabilizei.com.br e blog.esimplesauditoria.com.br (25/09/2026) |
| IBS/CBS | O Simples **não** recolhe as alíquotas de teste em 2026 | reformatributaria.com (25/09/2026); LC 214/2025 |
| Domínio e UptimeRobot | R$ 40/ano e US$ 0 | `docs/LANCAMENTO.md:33-34` |

### 1.2 Hipóteses de uso

Todas estão no objeto `P` e entram na sensibilidade.

- **Perfis por mês**, em horas de fala na nuvem / mensagens ao tutor:
  - Essencial: leve 1,5 h / 20 msg, típico 6 h / 100 msg, teto 15 h + 3M tokens.
  - Pro: leve 2 h / 30 msg, típico 8 h / 150 msg, teto 20 h + 5M tokens.
  - Horas gravadas = horas de fala.
  - Free: 1 h, 4 h e até a cota de 500 MB.
  - Banco: 0,5, 1,5 e 3,9 MB por usuário. Os 3,9 MB são o usuário pesado medido (fase2:80).
  - Egress da API pelo Fly: de 20 a 300 MB (**a medir**).
- **Mix dos cadastrados**: 70% free, 20% Essencial, 10% Pro. Há 1 convidado para cada cadastrado. Dentro de cada plano, 50% leve, 40% típico e 10% teto.
- **Pagamento**: 50% Pix e 50% cartão. **E-mails**: 2 por cadastrado/mês. **Erros**: 0,5 por cadastrado/mês.
- **Pesos dos modelos no R2**: 3 GB (**a medir**). **Backup diário**: 30 dias, gzip a 0,3.

### 1.3 Infra fixa por patamar

Fonte: fase2-escala.md:84-87 e ADR 0006.

| Patamar | Compute | Banco | Observação |
|---|---|---|---|
| 10 e 100 | 1× shared-cpu-1x 1 GB (GRU) | SQLite no volume de 3 GB + Litestream | Com 100 cadastrados a CPU fica em 44% da base (fase2:85) |
| 1.000 | 1× performance-1x 2 GB | Postgres Supabase **Small** | Gatilho do ADR 0006:24-26 (1.000 ativos). O tamanho do Postgres é **a medir** |
| 10.000 | 5× performance-1x (2,7 núcleos ÷ 60% = 5) | Postgres **Large** (dedicado) | A fila fica numa tabela `jobs` do próprio banco (ADR 0007:22), sem Redis. Carga no Postgres **não medida** |

## 2. Por usuário/mês (T1)

O custo variável inclui IA, armazenamento, banda e banco. A margem é calculada **sem** o custo fixo e com o Simples na 1ª faixa.

| Plano / perfil | IA (US$) STT + tradução + tutor | Variável | Asaas | Simples | Langfuse (marginal) | **Margem** |
|---|---|---|---|---|---|---|
| Convidado, qualquer perfil | 0 | R$ 0,00 | — | — | 0 | R$ 0,00 |
| Free, leve / típico / teto | 0 | R$ 0,01 / 0,03 / 0,11 | — | — | 0 | −R$ 0,01 / −0,03 / −0,11 |
| Essencial, leve | 0,065 + 0,054 + 0,007 | R$ 0,69 | R$ 1,54 | R$ 1,19 | R$ 1,57 | **R$ 16,48** |
| Essencial, típico | 0,259 + 0,216 + 0,036 | R$ 2,79 | R$ 1,54 | R$ 1,19 | R$ 6,29 | **R$ 14,38** |
| Essencial, teto | 0,648 + 0,720 | R$ 7,47 | R$ 1,54 | R$ 1,19 | R$ 15,50 | **R$ 9,70** |
| Pro, leve | 0,086 + 0,072 + 0,011 | R$ 0,92 | R$ 1,84 | R$ 2,39 | R$ 2,09 | **R$ 34,75** |
| Pro, típico | 0,346 + 0,288 + 0,054 | R$ 3,74 | R$ 1,84 | R$ 2,39 | R$ 8,39 | **R$ 31,93** |
| Pro, teto | 0,864 + 1,200 | R$ 11,23 | R$ 1,84 | R$ 2,39 | R$ 20,66 | **R$ 24,44** |

**Pior caso absoluto**, com o pool de tokens inteiro em saída (Essencial US$ 1,80, Pro US$ 3,00):

| Plano | Sem Langfuse | Com Langfuse sem amostragem |
|---|---|---|
| Essencial | R$ 3,89 | **−R$ 11,61** |
| Pro | R$ 14,76 | −R$ 5,91 |

A coluna Langfuse **não** entra na margem da tabela porque o custo dele é em degrau por patamar. Ela aparece à parte para mostrar a ordem de grandeza.

**Pix contra cartão.** Depois da promoção, o Pix de R$ 1,99 é **mais caro** que o cartão no Essencial (R$ 0,49 + 2,99% × 19,90 = R$ 1,09, que é o número de `planos.ts:26`). No Pro, o cartão custa R$ 1,68.

## 3. Patamares (T3)

Mix 70/20/10, com 1 convidado por cadastrado.

| Cadastrados | Pagantes | Receita | Fixo de infra | IA | Asaas | Simples | Custo total | **Resultado** | Margem |
|---|---|---|---|---|---|---|---|---|---|
| 10 | 3 | R$ 79,70 | R$ 198,61 | R$ 7,40 | R$ 4,91 | 6,0% | R$ 215,70 | **−R$ 136,00** | −171% |
| 100 | 30 | R$ 797,00 | R$ 504,61 | R$ 73,97 | R$ 49,12 | 6,0% | R$ 675,51 | **R$ 121,49** | 15% |
| 1.000 | 300 | R$ 7.970 | R$ 2.216,67 | R$ 739,68 | R$ 491,15 | 6,0% | R$ 3.925,70 | **R$ 4.044,30** | 51% |
| 10.000 | 3.000 | R$ 79.700 | R$ 18.782,68 | R$ 7.396,82 | R$ 4.911,51 | 12,3% (4ª faixa) | R$ 40.873,02 | **R$ 38.826,98** | 49% |

**Composição do fixo** (US$/mês), sempre com o Supabase a 25:

| Cadastrados | Fly | R2 | Langfuse | Outros itens |
|---|---|---|---|---|
| 10 | 10,81 + volume 0,45 | 0 | 0 | — |
| 100 | 10,81 + 0,45 | 0,12 de armazenamento + **5,42 de classe A (Litestream)** | **51,04** | — |
| 1.000 | 53,31 + 1,50 | 1,91 | **321,40** | Postgres Small +5, egress 3,20 |
| 10.000 | 266,54 | 20,09 | **3.025** | Postgres Large +100, egress 31,96, Resend Pro 20 |

**Ponto de equilíbrio: 73 cadastrados** (≈ 22 pagantes). Para cobrir o fixo com a infra de cada faixa, o modelo varre de 1 a 20.000 cadastrados.

## 4. Onde o free e o convidado dão prejuízo, e a proposta de limites

**Hoje**, o convidado não custa nada ao servidor: a nuvem é recusada e os dados moram no navegador. O free custa só o áudio guardado
(até 500 MB, que dão US$ 0,0075/mês no R2) e a banda. Os dois dão prejuízo **só pelo rateio do fixo**, e o fixo não depende deles até o limite de
CPU (fase2:84-86). O risco de custo **não está** no free de hoje. Ele aparece em dois momentos:

- quando a Fase 7 abrir a nuvem ao convidado;
- quando o Langfuse passar a contar as chamadas dele.

**Proposta** (tabela T2; está em `P.proposta` para ajustar):

| | Convidado | Free logado |
|---|---|---|
| Cota de nuvem, com STT e tradução no mesmo pool | **10 min/mês** | **30 min/mês** |
| Tutor | 5 mensagens/mês | 20 mensagens/mês |
| Teto por usuário | **US$ 0,02/mês** | **US$ 0,05/mês** |
| Custo por usuário, do leve ao teto | R$ 0,02–0,08 | R$ 0,08–0,36 |
| Identidade da cota | dispositivo + IP (a cota do convidado é burlável limpando o navegador; quem garante o limite é o pool global) | conta |

As regras de funcionamento são quatro:

- **Pool global por dia** para free e convidado somados: `max(US$ 0,50, 5% da receita líquida do mês ÷ 30)`. Isso dá US$ 0,50/dia com
  10 e com 100 cadastrados, US$ 2,17 com 1.000 e US$ 20,13 com 10.000. A demanda média fica em US$ 0,01 / 0,10 / 1,03 / 10,35 por dia (T6), dentro do pool.
  Esgotado o pool, o usuário cai no motor local. É o mesmo caminho da resposta 503/429 que já existe (`orcamentoDeIa.ts:117-119`).
- **Prioridade abaixo do pagante** na admissão, que já está implementada com prioridade por plano (fase2 §7, `fdd57ae`). O convidado só usa o
  saldo que sobra acima da reserva.
- **Enquanto a Groq estiver na camada gratuita, a cota de nuvem do free e do convidado é 0.** A capacidade de hoje não atende nem os
  pagantes (T4).
- **Langfuse do free e do convidado com amostragem de 1%**, porque o custo de observação é maior que o da IA.

Com a proposta ligada, o resultado cai R$ 52 com 100 cadastrados, R$ 525 com 1.000 e R$ 5.247 com 10.000. Cerca de dois terços dessa
queda são Langfuse sem amostragem; a IA do free e do convidado custa R$ 167/mês com 1.000 cadastrados (T6). O equilíbrio passa de 73 para 83 cadastrados.

## 5. Economias (T7)

| Medida | Ganho | Base / status |
|---|---|---|
| **Amostrar o Langfuse** (10%, com 100% dos erros) | US$ 321 → 51/mês com 1.000 cadastrados; o equilíbrio vai de 73 para 33 | Calculado. 2 unidades por chamada (`langfuse.ts:24-26`) |
| **Litestream com `sync-interval` de 10 s** | Classe A: US$ 5,42 → 0 com 100 cadastrados (~2,2M PUTs → ~0,26M). A perda máxima sobe de ~1 s para ~10 s | Calculado. Decisão de RPO do dono |
| **Cache de tradução sem contexto para falas curtas** | A tradução é 42,3% da IA do Essencial típico. Cada 10 p.p. de acerto no cache economizam 4,2% da IA. Hoje o acerto na fala é ~0, porque o contexto entra na chave (`server/ai/cacheDeTraducao.ts:84`) | **A medir**: taxa de repetição de falas curtas sem contexto. Também dá para instrumentar a chance de acerto com um contador de chaves "sem contexto" |
| **Prompt caching da Groq** | Automático, com −50% na entrada em cache; o prefixo mínimo é de 128 a 1.024 tokens, conforme o modelo. A entrada pesa 49% do custo da fala (350/90 tokens, `planos.ts:27`). Se 60% da entrada for prefixo em cache, a tradução cai 14,8% | **A medir**: ler `cached_tokens` na resposta. O `system` tem de vir primeiro e estável, com o contexto depois. O prefixo pode ficar abaixo do mínimo |
| **Cache por hash de áudio** | ~0 ao vivo, porque a fala não se repete. Só vale para retranscrição e importação | **A medir**: importações repetidas |
| **gpt-oss-20b para frases curtas** | −50% (US$ 0,018 contra 0,036/h), mas −0,033 de COMET no gold (bancada:79,87) | **A medir**: qualidade só no recorte de frases curtas |
| **Endpoint ZDR mais barato na OpenRouter** | Até −72% em tradução e tutor (0,03/0,17 + 5,5% contra 0,15/0,60) | **A medir**: a quantização e a qualidade desses provedores não passaram pela bancada |
| **Plano anual** | ~R$ 16,91 a menos por ano de taxa por assinante Essencial | Calculado. O preço anual é decisão do dono |
| **Mover mais para o navegador** | Até 100% da parte movida, com perda de qualidade medida: WER 4,9% → 13,5% em inglês com o Moonshine; COMET 0,917 → 0,847 com o opus-mt | Decisão de produto (bancada:44-46,77-81) |
| VAD de 800 ms | **Já aplicado**: 2,06× → 1,08× faturado | bancada:62 |

## 6. Sensibilidade (T5)

Resultado mensal em R$.

| Cenário | 10 | 100 | 1.000 | 10.000 | Equilíbrio (cadastrados) |
|---|---|---|---|---|---|
| Base | −136,00 | 121,49 | 4.044,30 | 38.826,98 | 73 |
| Câmbio −20% | −95,46 | 236,54 | 4.634,90 | 44.062,22 | 52 |
| Câmbio +20% | −176,53 | 6,44 | 3.453,70 | 33.591,75 | 99 |
| Uso 2× (limitado pelas cotas) | −297,03 | −39,26 | 2.437,78 | 22.753,42 | 114 |
| Anexo V (Fator R < 28%) | −143,57 | 45,77 | 3.287,15 | 33.695,48 | 88 |
| 100% Pix | −137,06 | 110,90 | 3.938,45 | 37.768,50 | 75 |
| Langfuse desligado | −136,00 | 396,14 | 5.773,78 | 55.104,72 | 33 |
| Langfuse com amostragem de 10% | −136,00 | 396,14 | 5.499,13 | 53.375,24 | 33 |
| Proposta de free/convidado ligada | −137,67 | 69,02 | 3.519,65 | 33.580,44 | 83 |
| **Pior combinado**: câmbio +20%, uso 2× e Anexo V | −377,35 | −262,18 | 768,72 | 9.171,97 | **289** |

**Leitura.** Nenhum cenário isolado inverte o resultado a partir de 1.000 cadastrados. As duas variáveis que mais movem o equilíbrio são
o **uso** (73 → 114) e o **Langfuse** (73 → 33 quando amostrado).

**Orçamento de IA.** Com o uso-base, a IA custa US$ 0,137 por cadastrado/mês. Os US$ 40 sugeridos (LANCAMENTO.md:212)
cobrem ~290 cadastrados, e o padrão de US$ 20 (`config.ts:942`) cobre ~145. **Proposta**: definir `AI_BUDGET_USD_MONTH` pelo número de pagantes ×
pior caso de `planos.ts`, e revisar a cada virada de mês. Em uso típico, um patamar mais barato seria pagantes × US$ 1,0.

## 7. O que depende do upgrade da Groq (restrição de hoje)

A chave é da camada gratuita (bancada-2026-09.md:130). O limite é por **organização**, ou seja, vale para o app inteiro:

| | Teto grátis/mês | Demanda com 10 cadastrados | com 100 | com 1.000 |
|---|---|---|---|---|
| STT (28.800 s/dia de áudio ÷ 1,08) | 222 h | 16 h | 155 h | 1.550 h |
| LLM (1.000 req/dia) | 30.000 req | 9.475 | **94.750** | 947.500 |

Um Essencial típico pede 3.600 traduções/mês, e **o teto de LLM atende ~8 deles**. Com 100 cadastrados, a demanda de LLM é 3× o teto;
o STT ainda cabe. O ponto de equilíbrio (73 cadastrados, ~22 pagantes) **fica acima da capacidade grátis**. Consequências:

- **Custo de IA hoje é US$ 0** (bancada:38), mas a oferta é limitada. Os custos deste modelo usam os preços por token e por hora das
  páginas de modelo da Groq. A página de limites só diz que a camada Developer dá limites maiores; ela não traz preço à parte. A
  camada Developer não está disponível para este projeto hoje, e isso é uma restrição dada.
- **Sem o upgrade**, a única saída paga para o LLM é a OpenRouter, com crédito pré-pago. A chave atual está expirada (bancada:131). Hoje o **STT não tem
  reserva na nuvem** (ADR 0008): excedido o limite, o usuário cai no Whisper local.
- **A admissão já degrada bem.** O teste com 25 STT simultâneos devolveu 20 atendidos e 5 respostas 429 `nuvem_ocupada` (fase2 §7). O problema é
  comercial: vender 15 h a quem receberá o modelo local na maior parte do tempo.
- **Recomendação**: não abrir a venda antes de uma das duas coisas acontecer:
  1. o upgrade da Groq;
  2. crédito na OpenRouter com a tradução validada na bancada no endpoint ZDR escolhido.

  Até lá, o free e o convidado ficam sem nuvem.

## 8. Riscos do modelo

- **Uso real desconhecido.** Os perfis são hipóteses; o cenário "uso 2×" mostra o impacto. **O tutor não foi medido.** Em 1.500
  tokens/mensagem, ele é 7% da IA do Essencial típico.
- **Fly em GRU.** O multiplicador de 1,615 aplicado à RAM extra é premissa: a página fala em "compute prices". O preço novo vale a partir de 01/10/2026.
- **Postgres Small/Large e 5 máquinas com 10.000 cadastrados** saem da extrapolação da fase2. A carga no Postgres não foi medida.
- **Langfuse com 10.000 cadastrados** é teto: os descontos progressivos não estão publicados.
- **IOF** aplicado a todo gasto em US$. O spread do cartão não está modelado (o cenário de câmbio +20% o cobre).
- **Simples.** Os 6% valem só com Fator R ≥ 28%, que exige pró-labore ou folha ≥ 28% da receita. Sem isso, entra o Anexo V e o equilíbrio vai para 88 cadastrados.
  Com 10.000 cadastrados, a RBT12 de R$ 956 mil leva à 4ª faixa (12,3% efetivo).
- **Asaas.** O modelo usa o preço cheio. Nos 3 primeiros meses o Pix é R$ 0,99 e o cartão é 1,99%, então o resultado real é um pouco melhor.
- **Litestream e classe A** dependem da hipótese de média ÷ pico = 0,25. Com 1.000 cadastrados, o banco já estaria no Postgres, sem Litestream.

## Arquivos

- `scripts/custo/modelo.mjs`: o modelo, com as premissas e as fontes no topo.
- `openspec/audits/2026-09-25-prontidao/fase3-custo.csv`: todos os números, em formato longo.
- `openspec/audits/2026-09-25-prontidao/fase3-custo-tabelas.md`: as tabelas T1 a T7 geradas (não editar à mão).
