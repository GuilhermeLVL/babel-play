# eval-modelos-v1 — comparação de modelos de tradução

Primeira comparação entre motores de tradução deste produto. O motor em uso (`openai/gpt-oss-120b`)
tinha entrado como substituto de um que a Groq moveu para enterprise, medido só contra o tradutor
local — nunca contra outro candidato.

Reproduzir:

```bash
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-traducao-llm.mjs --modelos a,b,c
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/julgar-traducao.mjs
```

Especificação: `openspec/changes/bancada-multi-modelo/`.

---

## 1. O achado que não é sobre modelo nenhum

**O mesmo `gpt-oss-120b` custa US$ 0,029 por mil falas no OpenRouter e US$ 0,107 na Groq.**

Nenhuma troca de modelo, nenhuma perda de qualidade: só o roteador. É a economia mais barata de
todas, e independe de qualquer decisão de qualidade.

## 2. Candidatos, 16 casos de fala (primeira passada, para ELIMINAR)

| modelo | chrF++ | US$/mil falas | prompt |
|---|---|---|---|
| `z-ai/glm-5.3-flash` | 87,6% | 0,068 | comunicativo |
| **`openai/gpt-oss-120b`** (em uso) | 85,4% | **0,029** | comunicativo |
| `qwen/qwen3.7-flash` (sem raciocínio) | 80,1% | **0,008** | comunicativo |
| `openai/gpt-oss-20b` | 79,1% | 0,034 | comunicativo |
| `deepseek/deepseek-v4-flash` | 77,2% | 0,022 | comunicativo |
| `tencent/hy-mt2-7b` | 72,9% | **0,005** | Hunyuan-MT |
| `z-ai/glm-4.7-flash` | 69,4% | 0,020 | comunicativo |
| `tencent/hy-mt2-1.8b` | 65,6% | 0,003 | Hunyuan-MT |
| `inclusionai/ling-3.0-flash` | 64,6% | 0,007 | comunicativo |

Fora do ranking por falha: `z-ai/glm-5.2:free`, `minimax/minimax-m3:free` e
`google/gemma-4-31b-it:free` — todos com 429 do provedor. **Camada gratuita não sustenta medição**,
e por consequência não sustentaria produção.

### O DeepSeek não é barato para este uso

Fama à parte: `deepseek-v4-flash` sai a US$ 0,022 e perde para o `qwen3.7-flash` a US$ 0,008 e
para o motor atual. A reputação de "modelo chinês barato" não sobreviveu à medição.

### Os modelos DEDICADOS a tradução perdem para os generalistas

O `Hunyuan-MT` venceu 30 de 31 categorias do WMT2025 e é o mais barato do lote — mas aqui fica 12
pontos atrás. A razão é estrutural e estava prevista: ele é um tradutor puro, **sem system prompt e
sem janela de contexto**. Este produto não pede tradução fiel de frase isolada; pede intérprete de
conversa informal, com as falas anteriores para resolver pronome e gênero. O que o torna campeão em
benchmark de tradução é exatamente o que não serve aqui.

Ele foi medido com o template dos seus autores, não com o nosso prompt — forçá-lo ao nosso mediria
a resistência dele a uma instrução que não foi treinado para receber.

## 3. Não há vencedor entre os dois primeiros

Executando o mesmo gold set várias vezes com o **mesmo modelo**:

| modelo | execuções | média | amplitude |
|---|---|---|---|
| `z-ai/glm-5.3-flash` | 3 | 86,4% | **±1,0** |
| `openai/gpt-oss-120b` | 3 | 84,6% | **±11,3** |

A diferença entre eles (1,8 ponto) cabe folgadamente dentro da variação de um deles consigo mesmo.
**Empate técnico** — e a bancada agora recusa apresentar ranking nesse caso.

Confirmado por **segunda métrica independente**, o juiz local (`qwen2.5:14b-instruct` no Ollama,
cego quanto ao modelo, fora do conjunto de candidatos):

| modelo | juiz (0-5) | chrF++ |
|---|---|---|
| `z-ai/glm-5.3-flash` | **4,77** | 86,7% |
| `openai/gpt-oss-120b` | **4,73** | 80,2% |

Quatro centésimos de diferença. Duas métricas independentes dizem a mesma coisa: **estes dois
modelos são equivalentes para este produto.**

A única diferença que se sustenta é a **consistência**: ±1,0 contra ±11,3. Para um produto ao vivo,
oscilar 11 pontos entre execuções é pior que uma média um pouco menor.

## 4. O chrF++ subestima este produto — com evidência

O juiz e a métrica de superfície discordam num padrão sistemático:

| origem | saiu | chrF++ | juiz |
|---|---|---|---|
| It's raining cats and dogs | **Tá chovendo pra caramba** | 32% | 4,7 |
| I'd appreciate it if you could send the report | **Se você puder mandar o relatório, eu agradeço** | 44% | 5,0 |
| I live in a small house near the river | **Moro numa casinha perto do rio** | 55% | 5,0 |
| So, like, I was gonna go, but then I didn't | **Então, eu ia sair, mas não fui** | 56% | 5,0 |

Todas são traduções boas; algumas melhores que a referência. O chrF++ mede distância até UMA
referência, e fala natural se afasta dela por natureza. **Os 85,2% medidos antes são piso, não
teto.**

E o inverso, que eu não previa: *"I read it yesterday"* → *"Eu li ontem"* tem chrF++ de **72%** e
nota **2,0** do juiz — o objeto sumiu. Texto parecido com a referência, sentido incompleto.

**Consequência de método:** para rankear modelos neste produto, o juiz é a métrica primária e o
chrF++ é o controle. O contrário premiaria quem copia a referência.

## 5. Uma armadilha de produção que a bancada encontrou

Modelo de raciocínio gasta o orçamento de tokens **pensando**, e devolve HTTP 200 com conteúdo
vazio quando não sobra nada. Medido: o `qwen3.7-flash` gasta 593 tokens para responder "Boa
sorte!". Com `max_tokens: 1200` — o valor de `mtProxy.ts` — os casos longos voltavam vazios.

Impacto no custo: o mesmo modelo custa **US$ 0,140/mil com raciocínio e US$ 0,008 sem** — 17× — sem
perda de qualidade (80,1% contra os 25,5% aparentes, que eram falhas contadas como nota zero).

`gpt-oss` e `glm-5.3-flash` **não permitem desligar** o raciocínio (HTTP 400: *"Reasoning is
mandatory for this endpoint"*), então essa alavanca não se aplica a eles.

---

## 6. Um modelo GRATUITO empata com o que pagamos

Primeira comparação em **corpus único** (o gold set de 60 casos) e com **as duas métricas**:

| modelo | chrF++ | juiz (0-5) | US$/mil falas |
|---|---|---|---|
| `minimax/minimax-m3:free` | **71,9%** | 4,67 | **0,000** |
| `openai/gpt-oss-120b` (em produção) | 69,5% | **4,76** | 0,029 |

**As duas métricas discordam** — o chrF++ prefere o gratuito, o juiz prefere o pago — e as duas
diferenças (2,4 pontos e 0,09) cabem dentro da variação que este mesmo gold set já mostrou. É
empate, agora entre um modelo pago e um gratuito.

Por categoria, o gratuito: literal 5,00 · registro 4,80 · gênero 4,73 · fala espontânea 4,63 ·
idiomático 4,60 · **pronome 4,27** (o mais fraco, e é o que depende de contexto entre frases).

### O que impede adotá-lo hoje NÃO é qualidade

É **confiabilidade**. Na mesma sessão, três modelos gratuitos (`glm-5.2:free`,
`gemma-4-31b-it:free`, e antes o próprio conjunto `:free`) responderam **HTTP 429 do provedor** e
ficaram inutilizáveis por janelas inteiras. Uma camada gratuita que some no meio de uma medição
sumiria também no meio de uma conversa de um assinante.

O caminho que os números sugerem, e que ainda não foi testado: **gratuito como motor primário, pago
como reserva na cascata**. O gateway já sabe fazer isso — é a mesma estrutura de fallback com
disjuntor que roteia `chrome-translator → opus-mt → server-llm-mt`. Isso reduziria o custo de
tradução sem apostar a experiência do assinante numa cota de terceiro.

## O que ficou por medir, e por quê

- **FLORES-200 (200 frases)**: a bateria parou na 84ª chamada — a conta do OpenRouter ficou sem
  saldo. Os finalistas não foram comparados em corpus grande, e é isso que separaria os empates.
- **Gold set de 60 casos**: rodado com `minimax-m3:free` e `gpt-oss-120b` (seção 6). Os demais
  candidatos dependem de saldo.
- **Repetições no corpus de 60**: cada modelo rodou UMA vez ali. Os empates da seção 6 são
  coerentes com a variação já medida, mas não foram confirmados por repetição.
- **Latência**: não medida como número de produção. Camada gratuita tem limite de requisição, e
  latência ali descreve a cota, não o modelo.

## Honestidade sobre estes números

- **16 casos não rankeiam 9 modelos.** Esta passada serve para ELIMINAR (os que ficaram abaixo de
  70% e os que falharam), nunca para escolher. A escolha exige o corpus grande.
- **As notas do juiz estão comprimidas** (4,73 e 4,77 de 5): há efeito de teto, e a rubrica
  provavelmente é generosa demais para separar modelos bons. Serve para confirmar empate, não para
  desempatar.
- **O gold set é meu**, e as discordâncias da seção 4 mostram exatamente esse limite: minhas
  referências não são as únicas traduções corretas.
- **Preços são de 2026-08-30**, lidos do catálogo ao vivo. Este documento nasce de um caso em que um
  modelo inteiro saiu do plano self-serve em poucos dias.

---

## Anexo — uma economia que eu propus e que NÃO se sustenta

O plano previa "agrupar enunciados até 10 s antes de enviar à nuvem, cortando ~40% da conta de
STT", por causa do mínimo de 10 segundos faturados por requisição.

**Verificado no código: não dá, e o motivo é o produto.** A nuvem é usada só no caminho AO VIVO — a
importação de mídia transcreve pelo Whisper local (`src/gateway/offlineTranscribe.ts:14`, usa
`WhisperLocalStt`). Agrupar ao vivo significa segurar a primeira fala esperando a segunda, o que
atrasa a legenda na tela em vários segundos. Trocar a experiência principal do produto por **US$
0,27 por usuário/mês** é um mau negócio.

A oportunidade que sobra é a oposta e vale mais: **a importação poderia usar a nuvem**, onde o
agrupamento é livre porque nada é ao vivo — e onde a qualidade salta de 57,2% para 24,0% de WER.
Isso aumenta custo, então é decisão de produto, não correção.
