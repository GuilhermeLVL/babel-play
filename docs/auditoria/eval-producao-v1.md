# eval-producao-v1 — os três eixos medidos NA cópia que vai ao ar

Primeira medição completa de fala nesta cópia (`babel-play-lab`). Até aqui só a tradução local
tinha número aqui; WER e DER só existiam na cópia de engenharia, e um número medido em outro
repositório não descreve este.

Reproduzir (o corpus está em `tests/fixtures/audio/`, fora do git por `.gitignore:75`):

```bash
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-wer.mjs
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-der.mjs
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-traducao.mjs
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-traducao-llm.mjs
```

---

## 1. Transcrição (WER) — 48 falas espontâneas pt-BR do CORAA

| variante | WER | CER | RTF | sub/ins/del |
|---|---|---|---|---|
| tiny / sem dica | 103,1% | 84,5% | 0,09 | 282/19/265 |
| tiny / com dica pt | 84,7% | 66,4% | 0,10 | 238/19/208 |
| base / sem dica | 104,4% | 83,1% | 0,15 | 375/28/170 |
| **base / com dica pt** ← o caminho real | **57,2%** | **36,6%** | 0,16 | 192/35/87 |

**Não houve queda na migração.** O perfil é o mesmo da cópia de engenharia, o que já era esperado:
o modelo e o pré-processamento são idênticos, e o que mudou entre as cópias foi o roteamento.

A causa do português ruim continua visível no log, literalmente: sem dica de idioma o Whisper
imprime `No language specified - defaulting to English (en)` e devolve frases em inglês inventadas.
WER acima de 100% é isso — ele insere mais palavras do que a referência tem.

**O caminho de produção desta cópia é a linha `base / com dica pt`**, porque:
- `sttRouter.ts` desvia do `tiny` quando a voz do usuário não é inglês (`micLang`), e
- `LiveCapture.tsx:1142` já manda a dica no caminho padrão do microfone.

WER por faixa de duração, `base / com dica pt`: 1-2 palavras **167%**, 3-5 76%, 6-10 75%, 11-20 60%,
21+ **39%**. O erro é dominado pelas falas curtíssimas — e o VAD desta aplicação produz exatamente
falas curtas. **A fatia de 1-2 palavras é o próximo alvo real**, e não é o modelo: é a segmentação.

## 2. Falantes (DER) — 7 cenários sintéticos

| cenário | DER | pureza | cobertura | clusters |
|---|---|---|---|---|
| alternancia-2 | 25% | 75% | 75% | 2/2 |
| alternancia-3 | 16% | 83% | 83% | 3/3 |
| mesmo-falante | 0% | 100% | 100% | 1/1 |
| volume-variavel | 0% | 100% | 100% | 1/1 |
| ruido-10db | 0% | 100% | 100% | 2/2 |
| banda-estreita | 25% | 75% | 75% | 2/2 |
| turnos-curtos | 19% | **100%** | 75% | 3/2 |

**DER médio 12,2%** — a correção da fusão se manteve. Antes dela, `turnos-curtos` dava 49% com **um
único cluster para duas pessoas**; agora a pureza é 100% e o erro restante é do tipo oposto
(fragmentação: 3 clusters para 2 falantes). Fragmentar é o erro menos grave dos dois — mostra duas
pessoas como três, em vez de apagar uma.

Robustez confirmada onde importava: volume variável e ruído a 10 dB dão **0%**. Banda estreita
(telefone, 8 kHz) continua a 25% — é o pior caso de microfone e segue em aberto.

## 3. Tradução — local contra nuvem, no mesmo gold set

| categoria | `opus-mt` local | `gpt-oss-120b` nuvem | Δ |
|---|---|---|---|
| **idiomático** | 27,4% | **83,1%** | **+55,7** |
| registro | 32,1% | **87,3%** | **+55,2** |
| gênero | 71,5% | **100,0%** | +28,5 |
| fala espontânea | 55,7% | 82,7% | +27,0 |
| pronome | 75,5% | 78,6% | +3,1 |
| literal (controle) | 83,8% | 85,2% | +1,4 |
| **geral** | **56,6%** | **85,2%** | **+28,6** |

**A queixa original tem solução, e ela é o caminho de nuvem.** "Traduz ao pé da letra" era o
idiomático a 27,4%; com o LLM e o prompt comunicativo vai a 83,1%. O controle (frase literal
simples) quase não se move, que é a assinatura de um ganho real: o LLM não é "melhor em tudo", é
melhor exatamente onde o problema estava.

Vale registrar contra mim mesmo: **as duas saídas que a métrica marcou como fracas são boas.**
*"It's raining cats and dogs"* → **"Tá chovendo pra caramba"** (a referência dizia "chovendo
canivete") e *"a small house"* → **"casinha"** (a referência dizia "casa pequena"). O chrF++ mede
distância de superfície e não sabe que ambas estão certas. Ou seja, **85,2% é um piso**, não um teto.

### O modelo padrão MORREU — verificado contra a API, não só na documentação

`llama-3.3-70b-versatile`, o padrão em `server/ai/mtProxy.ts:63`, `server.ts:266` e `.env.example:30`,
responde para a chave real:

```
model_not_found — The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.
```

A Groq moveu-o para enterprise ("ContactSales"). **A tradução comunicativa de nuvem está fora do ar
neste momento**, e nada no código avisa: o proxy devolve HTTP 502 e a cascata cai silenciosamente
para o `opus-mt` local — ou seja, o produto degrada para a tradução literal que o usuário reclamou,
sem dizer que degradou.

Substituto medido e adotado: **`openai/gpt-oss-120b`** ($0,15/M entrada, $0,60/M saída).

**Armadilha do substituto:** é um modelo de raciocínio, e os tokens de pensamento contam como
SAÍDA. Com `max_tokens: 64` ele devolve **string vazia** — gasta o orçamento inteiro pensando e não
sobra nada para a resposta. O `mtProxy.ts:101` usa 1200, então está seguro; qualquer redução futura
desse teto quebra a tradução em silêncio. `reasoning_effort: 'low'` corta a saída de 133 para 31
tokens no mesmo caso — é a alavanca de custo, e cabe medir se a qualidade aguenta.

---

## O que estes números NÃO provam

- **48 falas e 16 traduções são pouco.** As categorias com 2 casos indicam direção, não magnitude.
  O contraste entre local e nuvem no idiomático (4 casos, +55 pontos) é grande demais para ser ruído,
  mas o valor absoluto não tem essa firmeza.
- **A diarização é sintética**: concatenação de falas, sem sobreposição real nem reverberação de
  sala. Serve para comparar variantes entre si, não para publicar um número absoluto.
- **O gold set de tradução é meu**, não é benchmark público — e as duas "falhas" acima mostram
  exatamente esse limite.
- **Esta seção mede só o Whisper local**, que é o caminho gratuito. O STT de nuvem foi medido na
  rodada 2, abaixo — e a suspeita de que seria "bem melhor" se confirmou por margem larga.

---

## Rodada 2 — o STT de NUVEM, medido (2026-08-30)

O plano pago promete "IA de nuvem, melhor que a local". Isso nunca tinha sido medido; agora tem
número, nos mesmos 48 áudios do CORAA.

| variante | WER | CER | RTF | sub/ins/del |
|---|---|---|---|---|
| tiny / sem dica | 103,1% | 84,5% | 0,11 | 282/19/265 |
| tiny / com dica pt | 84,7% | 66,1% | 0,11 | 244/19/202 |
| base / sem dica | 104,4% | 83,1% | 0,17 | 375/28/170 |
| **base / com dica pt** ← plano grátis | **57,2%** | 36,6% | 0,18 | 192/35/87 |
| **nuvem / com dica pt** ← plano pago | **24,0%** | **13,4%** | 0,57 | 72/16/44 |

**O caminho pago erra menos da metade do que o gratuito.** E o ganho é maior justamente onde o
produto mais sofre — a fala curta, que é o que o VAD entrega:

| faixa | 1-2 | 3-5 | 6-10 | 11-20 | 21+ |
|---|---|---|---|---|---|
| base / com dica | **167%** | 76% | 75% | 60% | 39% |
| nuvem / com dica | **50%** | 26% | 36% | 22% | 18% |

O `base` local é *inutilizável* em enunciado de uma ou duas palavras (167% de WER: inventa mais
palavras do que existem). A nuvem erra metade — ruim em termos absolutos, mas outra categoria.

O RTF da nuvem (0,57 contra 0,18) inclui ida e volta de rede num laço sequencial: é indicativo de
latência, não número de produção, onde as chamadas são concorrentes.

### Três erros MEUS no caminho, todos capazes de inverter a conclusão

A primeira execução deu **64,7% para a nuvem — pior que o local**. Não era o modelo:

1. **Apliquei o filtro de alucinação à nuvem, que em produção não passa por ele.**
   `groqWhisper.ts:79` devolve `json.text` cru; só o caminho local filtra. Eu comparava dois
   pós-processamentos, não dois transcritores.
2. **Chamei o filtro sem o idioma**, nas duas variantes. Sem idioma o teto cai de 8 para 6
   palavras/segundo — o valor calibrado em inglês — e transcrição legítima de fala rápida em
   português é descartada como invenção. A produção passa o idioma (`whisperWorker.ts:204`).
3. **Falha de infraestrutura virava transcrição vazia.** Com 48 áudios seguidos, o limite de
   requisição da Groq derrubava 28 chamadas, e cada recusa entrava na conta como deleção total. Em
   8 áudios, que cabem na cota, a mesma nuvem dava 23,4%.

A lição, de novo: **um harness infiel mede outro produto.** Aqui a diferença foi entre "a nuvem não
vale o que custa" e "a nuvem erra menos da metade".

### O que isto significa para o plano pago

As duas metades agora têm vantagem medida, e não é marketing:

| | grátis (navegador) | pago (nuvem) |
|---|---|---|
| Transcrição (WER) | 57,2% | **24,0%** |
| Tradução (chrF++) | 56,6% | **85,2%** |
| Tradução idiomática | 27,4% | **83,1%** |
| Download inicial | ~230–413 MB | nenhum |
