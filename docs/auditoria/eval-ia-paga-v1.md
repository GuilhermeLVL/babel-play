# eval-ia-paga-v1 — qualidade × custo × latência da IA paga (LLM-as-judge, rodada 1)

24/10/2026. Fase A do plano de qualidade da IA paga. Mede as quatro funções de nuvem que quem paga mais sente —
**explicação da frase**, **resumo da sessão**, **outras formas (alternativas)** e **legenda ao vivo** — com os MESMOS
prompts e leitores de produção, um juiz LLM com rubrica binária e as métricas do que aparece na tela.

**Gasto total da rodada: US$ 1,92** (teto autorizado: US$ 5; livro-caixa com reserva antes de cada chamada).

Reproduzir (a chave vem só do ambiente):

```bash
OPENROUTER_API_KEY=… node node_modules/tsx/dist/cli.mjs scripts/eval-ia/rodar.mjs --funcao todas --teto-usd 5
node node_modules/tsx/dist/cli.mjs scripts/eval-ia/rodar.mjs --relatorio          # refaz tudo do bruto, sem rede
node node_modules/tsx/dist/cli.mjs scripts/eval-ia/rodar.mjs --calibrar <planilha preenchida.csv>
```

Brutos e tabelas completas em `docs/auditoria/eval/ia-paga-v1/` (`decisao-<função>.md` tem todas as colunas).

---

## 1. A recomendação (provisória até a calibração humana)

| Função            | Hoje                 | Recomendado                              | Por quê                                                                                                                                                                                   | Custo por pagante/mês (cota cheia)   |
| ----------------- | -------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Explicação**    | `gpt-oss-120b` (low) | **`deepseek-v4.1-flash` sem raciocínio** | Nota 0,98 contra 0,89; **gramática certa em 97% contra 63%**; espera p95 6,3 s contra 8,0 s; 0% de erro na tela. É o melhor e o único não-inferior que chega a tempo e sem falha crítica. | R$ 0,29 (hoje R$ 0,10)               |
| **Outras formas** | `gpt-oss-120b` (low) | **`deepseek-v4.1-flash` sem raciocínio** | Nota 0,97 contra 0,94 (empate no IC), mas o juiz pareado prefere 25 × 4 (11 empates) e a espera p95 cai de 8,3 s para 4,4 s. Custo por 1M tokens cabe no modelo.                          | US$ 0,09 por 1.000 usos (hoje 0,046) |
| **Resumo**        | `gpt-oss-120b` (low) | **manter**                               | É o melhor (0,99) e o mais barato. Só 15 sessões: os candidatos ficam dentro do ruído.                                                                                                    | R$ 0,05                              |
| **Legenda**       | `gemma-4-26b`        | **manter**                               | Mesma nota do `gpt-oss-120b` na Groq/Cerebras (Δ 0,000), maior chrF++ (79,2) e 2,6× mais barato.                                                                                          | US$ 0,029 por hora de fala           |

Em uma linha: **trocar a explicação e as outras formas para o DeepSeek V4.1 Flash sem raciocínio; manter resumo e
legenda.** A troca da explicação corrige o que mais importa ao aprendiz — hoje uma em cada três explicações afirma algo
gramaticalmente falso (exemplos na §4) — e custa R$ 0,19 a mais por pagante que usa a cota inteira.

**Por que "provisória":** o plano exige κ ≥ 0,6 entre juiz e humano antes de o juiz decidir troca. A planilha cega de
30 casos está pronta (`planilha-calibracao.csv`), mas não foi anotada. A concordância entre os DOIS juízes ficou entre
0,18 e 0,49 (§5). Os veredictos grandes (gramática 63% × 97%, inválidas de 47% no DeepSeek com raciocínio) são robustos
a isso; os pequenos (alternativas, resumo) não.

**O que a troca exige no código (Fase C, fora deste trabalho):** o DeepSeek pensa por padrão. Medido "como a produção
mandaria hoje" (sem parâmetro), ele gasta até 1.111 tokens raciocinando, fica 3× mais caro, estoura o timeout em 10% das
explicações e devolve resposta inválida em 5% (explicação), 33% (alternativas) e 47% (resumo). A versão medida aqui
(`@none`) manda `reasoning: { enabled: false }`; `parametrosDoProvedor` precisa levar esse parâmetro para o modelo
junto com a troca no registro (`ops/ia-provedores.openrouter.json`, níveis `nuance` da explicação e das alternativas).

---

## 2. A regra de decisão

Diretriz do dono (24/10): **modelos baratos sempre que possível, pensando na experiência de quem usa.** A regra
(código em `scripts/eval-ia/estatistica.mjs`, com teste):

1. **Melhor** = maior nota média da rubrica (fração de critérios atendidos; resposta que a produção recusaria = 0).
2. **Não-inferior** = o IC 95% do bootstrap **pareado** (mesmos casos, `bootstrapPareado`) da diferença contra o melhor
   fica inteiro acima de **−0,05**.
3. **Falha crítica** (não se troca por preço): num critério crítico — **gramática correta, gíria não inventada, idioma
   de saída, segurança (injeção e perfil menor)** — pior que o melhor com IC pareado excluindo 0, ou mais de 10 pontos
   abaixo dele.
4. **Chega a tempo** (sem relaxamento): no máximo 5% das respostas acima do timeout da produção (15 s explicação e
   alternativas, 30 s resumo, 12 s legenda) — acima disso a pessoa vê erro ou a reserva.
5. **Custo que cabe**: US$ por 1M tokens da cota ≤ o que `scripts/ia/modeloDeCusto.ts` cobra (R$ 1,40 ÷ 5,6 = US$ 0,25);
   legenda ≤ US$ 0,05 por hora de fala (o teto da bancada).
6. **SLO de latência** (proposta da Fase C): p95 ≤ 4 s explicação e alternativas, 8 s resumo, 1,5 s legenda.
7. **Recomendado = o MAIS BARATO** (US$ por 1.000 usos) que passa em 2–6. Ninguém passa → relaxa o SLO, depois o custo
   (o relatório diz qual). Qualidade, crítico e timeout nunca relaxam.

Contra a produção vale também a regra B5 da bancada (`bancada/decisao.mjs` → `decidir`): troca **por qualidade** só se o
IC pareado excluir 0 para cima. Resultado na §3.

**Nenhum candidato passou em todas as exigências.** O SLO de 4 s não é cumprido nem pela produção de hoje (p95 8,0 s na
explicação). Na explicação, o DeepSeek sem raciocínio passou com o SLO e o custo relaxados: p95 de 6,3 s e US$ 0,286 por
1M tokens, 14% acima do modelo de custo (efeito na margem: §6).

---

## 3. Resultados por função

Nota = fração de critérios atendidos (média dos dois juízes). Δ vs produção = IC 95% pareado. "Inválida" = a leitura de
produção recusou a resposta (502 `resposta_invalida` na tela). Latência = espera total que a pessoa tem hoje (a
produção não usa streaming); TTFT = primeiro pedaço, se houvesse streaming.

### Explicação da frase (60 frases: 40 en, 20 es; 30 sem gíria, 5 injeções, 5 de perfil menor)

| Sistema                                          |     Nota | Δ vs produção               | Gramática | Gíria certa | Inválida | Passa timeout | Espera p50 · p95 | US$/1.000 | US$/1M tok |
| ------------------------------------------------ | -------: | --------------------------- | --------: | ----------: | -------: | ------------: | ---------------- | --------: | ---------: |
| `gpt-oss-120b` (produção)                        |     0,89 | —                           |   **63%** |         90% |       0% |            0% | 3,1 · 8,0 s      |     0,060 |      0,094 |
| **`deepseek-v4.1-flash@none`**                   | **0,98** | **+0,087 [+0,056, +0,121]** |   **97%** |         96% |       0% |            0% | 2,1 · 6,3 s      |     0,175 |      0,286 |
| `deepseek-v4.1-flash` (como a produção mandaria) |     0,92 | +0,023 [−0,039, +0,076]     |       89% |         89% |       5% |           10% | 6,0 · 23,7 s     |     0,575 |      0,477 |
| `glm-5.3-flash`                                  |     0,95 | +0,058 [+0,026, +0,095]     |       93% |         98% |       0% |       **20%** | 7,1 · 23,1 s     |     0,176 |      0,177 |
| `qwen3-next-80b-a3b-instruct`                    |     0,95 | +0,056 [+0,017, +0,099]     |       89% |         97% |       0% |            0% | 1,7 · 2,3 s      |     0,250 |      0,424 |
| `mistral-small-2603`                             |     0,89 | −0,004 [−0,040, +0,032]     |   **66%** |         94% |       0% |            0% | 1,8 · 3,0 s      |     0,121 |      0,207 |

- O GLM e o Qwen também superam a produção, mas o GLM passa do timeout de 15 s em 20% das explicações (a pessoa veria
  erro ou a reserva) e o Qwen custa mais por uso que o DeepSeek, com gramática 89%. O Mistral Small é rápido e barato,
  mas erra a gramática tanto quanto a produção.
- Segurança: 100% em todos, menos o DeepSeek com raciocínio (95%, as respostas inválidas). Nenhum obedeceu às 5
  injeções nem saiu do tom com o perfil menor.

### Resumo da sessão (15 sessões, 8 a 28 falas; uma bilíngue, uma com injeção, uma de perfil menor)

| Sistema                       |     Nota | Δ vs produção           | Inválida | Espera p50 · p95 | Palavras-alvo nos cartões | US$/1.000 | US$/1M tok |
| ----------------------------- | -------: | ----------------------- | -------: | ---------------- | ------------------------: | --------: | ---------: |
| **`gpt-oss-120b` (produção)** | **0,99** | —                       |       0% | 4,7 · 13,3 s     |                       73% |     0,149 |      0,104 |
| `qwen3-next-80b-a3b-instruct` |     0,98 | −0,011 [−0,050, +0,017] |       0% | 2,9 · 4,7 s      |                       74% |     0,651 |      0,488 |
| `mistral-small-2603`          |     0,97 | −0,022 [−0,061, 0,000]  |       0% | 2,8 · 5,2 s      |                       65% |     0,302 |      0,250 |
| `deepseek-v4.1-flash@none`    |     0,93 | −0,067 [−0,206, +0,011] |       7% | 2,5 · 12,1 s     |                       84% |     0,480 |      0,344 |
| `glm-5.3-flash`               |     0,86 | −0,133 [−0,333, +0,006] |      13% | 7,7 · 24,8 s     |                       80% |     0,194 |      0,111 |
| `deepseek-v4.1-flash`         |     0,53 | −0,461 [−0,728, −0,189] |  **47%** | 7,7 · 28,8 s     |                       84% |     1,097 |      0,484 |

O resumo é a função em que o `gpt-oss-120b` vai melhor; com 15 sessões o IC é largo, e nenhum candidato justifica a
troca. A única queixa de experiência é a espera p95 de 13 s (acima do SLO de 8 s).

### Outras formas (40 frases; 8 com registro pedido, 4 injeções, 4 que dependem do contexto)

| Sistema                        |     Nota | Δ vs produção           | Preferência pareada (V·E·D) | Inválida | Espera p50 · p95 | US$/1.000 | US$/1M tok |
| ------------------------------ | -------: | ----------------------- | --------------------------- | -------: | ---------------- | --------: | ---------: |
| `gpt-oss-120b` (produção)      |     0,94 | —                       | —                           |       0% | 2,9 · 8,3 s      |     0,046 |      0,099 |
| **`deepseek-v4.1-flash@none`** | **0,97** | +0,029 [−0,019, +0,090] | **25 · 11 · 4**             |       0% | 1,7 · 4,4 s      |     0,090 |      0,233 |
| `glm-5.3-flash`                |     0,96 | +0,017 [−0,056, +0,081] | 23 · 10 · 7                 |       3% | 5,0 · 38,8 s     |     0,112 |      0,146 |
| `mistral-small-2603`           |     0,95 | +0,008 [−0,038, +0,063] | 12 · 17 · 9                 |       0% | 1,5 · 2,3 s      |     0,068 |      0,175 |
| `qwen3-next-80b-a3b-instruct`  |     0,92 | −0,021 [−0,063, +0,031] | 13 · 12 · 15                |       0% | 1,4 · 2,2 s      |     0,147 |      0,369 |
| `deepseek-v4.1-flash`          |     0,67 | −0,275 [−0,413, −0,154] | 18 · 9 · 13                 |      33% | 4,9 · 19,8 s     |     0,541 |      0,560 |

Pela regra, só o DeepSeek sem raciocínio é não-inferior ao melhor (o Mistral Small e a produção ficam a 1 ponto da
margem). É a decisão mais frágil das quatro: a rubrica empata, quem desempata é o juiz pareado e a latência. Se a
calibração humana não confirmar, **manter a produção aqui é igualmente defensável** (é a mais barata).

### Legenda ao vivo (gold de conversa, 60 frases en→pt)

| Sistema                             |     Nota | Δ vs produção           |   chrF++ | Espera p50 · p95 | US$/h de fala |
| ----------------------------------- | -------: | ----------------------- | -------: | ---------------- | ------------: |
| **`gemma-4-26b-a4b-it` (produção)** | **0,96** | —                       | **79,2** | 1,1 · 2,1 s      |     **0,029** |
| `gpt-oss-120b` só Groq/Cerebras     |     0,96 | 0,000 [−0,025, +0,027]  |     74,7 | 0,9 · 1,5 s      |         0,073 |
| `mistral-small-2603`                |     0,92 | −0,041 [−0,070, −0,009] |     62,1 | 1,0 · 1,7 s      |         0,022 |

O `gpt-oss-120b` na Groq/Cerebras é o único dentro do SLO de 1,5 s, com a mesma qualidade, mas custa 2,6× e passa do
teto de US$ 0,05/h. É o candidato natural para a "rápida+" só de pagantes da Fase C, se a latência ao vivo for a queixa.
O Mistral Small é inferior e teve 10% de 429 do provedor. O resumo da bancada de fala (`bancada/resumo.mjs`) lê o bruto
`bruto-legenda-mt.json` e dá a mesma leitura no chrF++ (`resumo-bancada.md`).

---

## 4. Como o usuário sente

Cada métrica do harness, ligada ao que aparece na tela:

| Métrica                                                 | O que a pessoa vê                                                                  | Explicação: produção → recomendado                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Resposta inválida**                                   | "Não deu para explicar agora" (502 `resposta_invalida`), e o uso foi consumido     | 0% → 0% (o DeepSeek COM raciocínio: 5%; no resumo, 47%) |
| **Passa do timeout da produção**                        | A folha fica girando e cai na reserva ou em erro                                   | 0% → 0% (GLM: 20%)                                      |
| **Espera total p50 / p95**                              | Quanto tempo a folha da frase fica carregando (sem streaming, é o que vale hoje)   | 3,1 / 8,0 s → 2,1 / 6,3 s                               |
| **TTFT p50 / p95**                                      | Quanto levaria para o texto começar a aparecer, se a explicação fosse em streaming | 1,6 / 3,9 s → 0,8 / 3,1 s                               |
| **Caracteres e "cabe sem rolar"** (≤ 900 na explicação) | Se a explicação cabe na folha do celular sem rolar mais de uma tela                | 395 → 476 caracteres; 100% cabem nos dois               |
| **Palavras por frase**                                  | Leitura de aprendiz: frases longas cansam                                          | 17,0 → 13,7                                             |
| **Critério "adequada ao aprendiz"**                     | Linguagem simples, sem jargão                                                      | 73% → 94%                                               |
| **Gramática correta / gíria não inventada**             | Se o que a tela ENSINA está certo                                                  | 63% / 90% → 97% / 96%                                   |
| **Idioma de saída** (heurística + juiz)                 | Explicação em português, e não em inglês                                           | 98–100% → 100%                                          |
| **Custo por 1.000 usos**                                | Nada na tela; é o que o plano paga                                                 | US$ 0,060 → 0,175                                       |

Exemplos reais do que a produção ensina hoje (os dois juízes reprovaram 15 de 60 explicações na gramática):

- _"It's raining cats and dogs out there."_ → "Frase no **presente simples** ('It's raining')… verbo no gerúndio" — é
  presente contínuo.
- _"You'd better leave now or you'll miss the bus."_ → "combina o **condicional** 'You'd better'" — é _had better_,
  conselho, não condicional.
- _"I would appreciate it if you could send the report."_ → "verbo no **passado simples** 'could send'" — é modal de
  cortesia.
- _"He's low-key annoyed about it."_ → "'low-key' **adjetivo**" — aqui modifica _annoyed_, é advérbio.

---

## 5. O juiz: quem julgou, concordância e limites

- **Juízes**: `mistralai/mistral-medium-3.1` (principal) e `deepseek/deepseek-v4.1-flash` sem raciocínio (segundo),
  temperatura 0, só endpoints ZDR. A nota de cada caso é a **média dos dois** (o mesmo instrumento para todos os
  candidatos). O pareado de preferência usa sempre um juiz de família diferente dos dois lados.
- **Autopreferência medida** (nota a mais para a própria família, descontada a severidade): Mistral −0,027 / −0,024 /
  +0,022 / +0,003 e DeepSeek −0,025 / −0,011 / −0,034 (explicação / resumo / alternativas / legenda). Nenhum favorece a
  própria família de forma relevante; o Mistral é, em geral, o mais severo.
- **Viés de posição**: no pareado nas duas ordens, 17% a 48% dos pares mudaram de lado com a troca de posição e contaram
  como empate. Sem a segunda ordem, esses viravam "vitórias" falsas.
- **κ juiz × juiz**: explicação 0,33, resumo 0,18, alternativas 0,47, legenda 0,49, com acordo bruto de 92% a 98%. O κ é
  baixo em parte pelo paradoxo da prevalência (quase tudo "atende"), mas critérios subjetivos concordam pouco de fato:
  "adequada ao aprendiz" κ 0,10, "sentido correto" 0,16; os objetivos concordam bem (idioma 0,67, segurança 1,00,
  gramática 0,49). **Abaixo de 0,6: o juiz ainda não está calibrado para decidir sozinho.**
- **Calibração humana pendente**: `planilha-calibracao.csv` (30 casos, 186 linhas, cega: sem modelo nem veredito). O
  dono preenche a coluna `humano` com 1/0 e roda `--calibrar`; o harness imprime o κ geral e por critério.
- **Correções feitas no meio da rodada** (registradas porque mudam como ler o bruto): o segundo juiz começou COM
  raciocínio e devolveu vazio em 12% das rubricas (gastava os 1.600 tokens pensando); foi trocado pela versão sem
  raciocínio e refeito. O leitor da rubrica passou a aceitar o número do critério ("1", "2") no lugar do nome.

---

## 6. Custo por usuário pagante e `npm run ia:custo`

- **Por pagante que esgota a cota de estudo** (300 explicações e 60 resumos por mês, `src/core/planos.ts`), pelo custo
  medido: explicação R$ 0,10 hoje → **R$ 0,29** com o DeepSeek sem raciocínio; resumo R$ 0,05 (sem troca). Nos planos de
  R$ 14,90 a R$ 34,90, a diferença é de 1% a 1,3% do preço.
- **O modelo de custo** cobra a IA de texto por token da cota: R$ 1,40 por 1M (US$ 0,25). O DeepSeek sem raciocínio custou
  **US$ 0,286 por 1M** na explicação (R$ 1,60) e US$ 0,233 nas alternativas (cabe). No pior caso — TODA a cota de tokens
  pelo preço da explicação —, a IA de texto sobe R$ 0,40/mês no Plus (2M tokens) e R$ 0,60 na Família e no Pro (3M).
- **Margem do anual** (`ia:custo`, cota cheia, pior custo): Plus R$ 32,49 → R$ 27,69; Família R$ 47,25 → R$ 40,05; Pro
  R$ 27,45 → R$ 20,25. **Todas continuam ≥ 0.**
- **Misturas de 3/8/15% de pagantes** (`ia:custo -- --usuarios 1000 --essencial/--premium` em 60/40): margem no pior caso
  US$ 0,17 / 64,06 / 154,51, **inalteradas** (o modelo dos planos Essencial/Premium não inclui IA de texto). Só com
  Plus: US$ −10,76 / 35,33 / 99,86 hoje → −12,90 / 29,62 / 89,15 com a troca. **O negativo da mistura de 3% só com Plus já
  existe hoje**, sem a troca (vem do custo do Grátis) — ver §8.
- Se a troca for aprovada, o mais simples é subir `CUSTO_BRL_POR_MILHAO_DE_TOKENS` para R$ 1,60 (ou medir o preço
  combinado das funções), para o modelo continuar um teto verdadeiro.

---

## 7. Limitações

- **Juiz não calibrado contra humano** (κ pendente); κ entre juízes de 0,18 a 0,49.
- **Amostras pequenas**: 15 sessões de resumo e 40 alternativas dão IC largo; a explicação (60) e a legenda (60) são
  as mais firmes.
- **Golds escritos por uma pessoa** (o agente), revisados só por consistência; o gabarito pode ter falhas (um juiz já
  discordou de um fato do gabarito sobre "tomar el pelo").
- **Uma execução por modelo**, temperatura de produção: a variação entre execuções não foi medida (no
  `eval-modelos-v1` o gpt-oss variou ±11 pontos de chrF++ entre execuções).
- **Latência pelo OpenRouter de São Paulo, num só horário**: o provedor sorteado muda o número (o OpenRouter escolhe por
  preço); o p95 é indicativo, não SLO medido em produção.
- **Custo pelo roteamento padrão do OpenRouter** (por preço entre os ZDR); o teto reservado foi o do endpoint ZDR mais
  caro.
- **Ajuste fora da produção**: `deepseek@none` e `gpt-oss~groq+cerebras` mandam parâmetros que a produção ainda não manda.
- Funções não medidas: polimento e tutor.

## 8. Fora do escopo, registrado

- A mistura de 3% de pagantes **só com Plus** já fecha negativa no pior caso hoje (`ia:custo`: US$ −10,76), sem
  relação com esta troca.
- A rota das alternativas não acrescenta a instrução de segurança para menores (a explicação e o resumo acrescentam);
  hoje a Nuance é paga e o pagante é adulto, mas um membro menor do plano Família chegaria sem ela.
- Explicação e alternativas da produção têm p95 de 8 s: acima do SLO de 4 s proposto para a Fase C, com o modelo atual.

## Arquivos

`scripts/eval-ia/` (harness), `tests/eval/ia-paga-*.test.ts` (testes puros), `tests/eval/fixtures/gold-{explicacao,resumo,alternativas}-v1.jsonl`
(golds), `docs/auditoria/eval/ia-paga-v1/` (brutos, decisões, concordância, planilha de calibração, resumo da bancada
de fala para a legenda).
