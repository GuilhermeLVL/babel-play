# Medições de nuvem: transcrição e tradução pagas, contra o que roda no aparelho

Medido em 09/10/2026 (noite), da máquina do dono, com a chave do OpenRouter dele (limite de US$ 1).
Complementa `2026-10-09-medicoes-no-aparelho.md`: as mesmas falas, a mesma pontuação, agora pela nuvem.

Tudo o que está em tabela **rodou de verdade** nesta rodada, salvo as linhas marcadas "setembro" ou
"aparelho", que vêm de medições anteriores e entram só como par. Preço de tabela aparece sempre como
"preço listado", nunca como custo medido. Nenhum código de produto foi alterado.

## Resumo

| Pergunta | Resposta | Número principal |
|---|---|---|
| A nuvem transcreve melhor que o aparelho em português e espanhol? | **Melhor que o Whisper do aparelho; empata com o Parakeet local.** | Português: nuvem 5,2% de erro contra 18,2% (Whisper base), 10,8% (small) e 5,8% (Parakeet). Diferença contra o Parakeet: −0,6 ponto [−1,8; +0,7], empate. |
| E em inglês? | **Pela rota padrão do OpenRouter, pior que tudo o que roda no aparelho.** A causa é o provedor, não o modelo. | 27,8% [22,1–33,9] contra 7,1% do Parakeet local. O OpenRouter mandou 91 de 100 falas para a DeepInfra, que devolveu texto cortado no áudio gravado baixo (30,1% nessas 91); as 9 que caíram na Groq deram 4,8%. |
| Dá para escolher o provedor da transcrição no OpenRouter? | **Não.** | Pedido com `only: ['groq']` foi atendido e cobrado pela DeepInfra. O campo `provider` da transcrição só aceita `zdr`, `data_collection` e `options`. |
| A tradução por modelo de linguagem é melhor que a local? | **Sim no COMET (sentido), empate no chrF++ (letras).** | COMET +0,042 nas duas direções com o gpt-oss-120b, significativo. chrF++ +1,9 e +1,2, empate. |
| Quanto custou? | **US$ 0,029 dos US$ 0,30 autorizados.** | Transcrição: US$ 0,0146 por hora de áudio (medido). Tradução: US$ 0,02 a 0,03 por 1.000 frases (medido). |

## 1. Como foi medido

**De onde.** A mesma máquina das medições do aparelho (Ryzen 5 5600, Windows 11), pela internet
residencial do dono. A latência de nuvem inclui o envio e a volta por essa rede.

**Chave e teto.** Os scripts leem a chave do `.env` do dono em tempo de execução e a usam só no
cabeçalho de autorização. Nada a imprime ou grava; o retrato de `/api/v1/key` guarda só os números.
Teto de US$ 0,30 num livro-caixa em disco: cada chamada reserva o pior caso antes de sair e acerta
pelo custo que o OpenRouter devolve (`usage.cost`). Cada lote teve previsão antes e 3 itens de ensaio.
No máximo uma nova tentativa por item (nenhuma foi necessária: zero erros de HTTP nos 803 pedidos pagos).

**Retenção zero.** Todo pedido foi com retenção zero e sem coleta de dados. Na transcrição:
`provider: {"zdr": true, "data_collection": "deny"}`. Na tradução: o `provider` da produção
(`data_collection: deny`, `zdr: true`, `ignore` dos dois provedores do Google). Nenhum pedido foi
recusado por isso. O áudio e os textos são do FLEURS (público, CC-BY-4.0).

**Transcrição.** `POST https://openrouter.ai/api/v1/audio/transcriptions`, modelo
`openai/whisper-large-v3-turbo`, formulário igual ao do `sttProxy.ts` da produção: o WAV de 16 kHz
mono, `language`, `temperature: 0`, `response_format: verbose_json`. Um pedido por vez. As 300 falas
da bancada do aparelho (100 de português, 100 de inglês, 100 de espanhol). Pontuação com as mesmas
peças de `navegador/pontuar.mjs`: `filtrarAlucinacao` de produção, erro por palavra (WER) de
`src/core/eval/wer.ts`, intervalo de 95% por bootstrap de 1000 reamostras e diferença **pareada** fala
a fala contra os sistemas de `bancada-2026-10-navegador/casos.json`.

**Tradução.** O FLEURS é paralelo: as 100 falas de inglês e as 100 de português têm os mesmos 100 ids.
As transcrições de referência formam o par, e são exatamente as 100 primeiras frases que a bancada de
setembro usou (conferido: 100 ids e 100 textos iguais). Três sistemas, 100 frases por direção:

- `openai/gpt-oss-120b` e `openai/gpt-oss-20b` pelo OpenRouter, com o pedido da produção montado por
  `bancada/nuvem.mjs` (as funções do servidor): prompt comunicativo, temperatura 0,2, `max_tokens`
  proporcional, raciocínio em esforço baixo. São os dois modelos que a produção cita e os mais baratos
  entre eles no catálogo de hoje;
- o tradutor local do app (`Xenova/opus-mt-en-ROMANCE` e `ROMANCE-en`, q8, feixe 2), rodado de novo
  em Node, na CPU, com a mesma função da bancada de setembro. As 200 traduções saíram idênticas às de
  setembro.

Métricas, as de setembro: chrF++ de `src/core/eval/chrf.ts` por frase, e COMET
(`Unbabel/wmt22-comet-da`) com BLEU e chrF++ do sacreBLEU. Intervalo por bootstrap e diferença pareada
frase a frase.

**Preços listados em `GET /api/v1/models` e `/api/v1/endpoints/zdr` (09/10/2026, não é custo medido).**

| Modelo | Preço listado | Endpoints de retenção zero |
|---|---|---|
| `openai/whisper-large-v3-turbo` | US$ 0,00000333 por segundo na DeepInfra (0,012/h); US$ 0,0000111 na Groq (0,04/h, mínimo de 10 s por pedido) | 2 |
| `openai/gpt-oss-120b` | de US$ 0,03 a 0,35 por milhão de tokens de entrada; de 0,17 a 0,95 de saída | 22 (fora o Google) |
| `openai/gpt-oss-20b` | de US$ 0,02 a 0,075 de entrada; de 0,10 a 0,30 de saída | 9 (fora o Google) |

## 2. Transcrição pela nuvem

### 2.1 Resultado

| Idioma | WER % [IC 95%] | Latência mediana | Latência p90 | Custo do lote | US$ por hora de áudio |
|---|---|---|---|---|---|
| Português (100 falas, 21,0 min) | **5,2 [4,0–6,4]** | 1.192 ms | 2.097 ms | US$ 0,00513 | 0,0146 |
| Espanhol (100 falas, 20,5 min) | **5,6 [4,4–6,9]** | 1.207 ms | 2.142 ms | US$ 0,00486 | 0,0142 |
| Inglês (100 falas, 16,8 min) | **27,8 [22,1–33,9]** | 981 ms | 1.573 ms | US$ 0,00423 | 0,0151 |

Custo total das 300 falas (58,4 min): **US$ 0,01422**, ou US$ 0,0146 por hora de áudio. Nenhuma falha,
nenhuma nova tentativa. Em inglês, 3 falas voltaram vazias.

**Quem atendeu.** O OpenRouter não diz na resposta, mas o preço por segundo denuncia: 274 falas a
US$ 0,00000333/s (DeepInfra) e 26 a US$ 0,0000111/s (Groq). A Groq cobrou o mínimo de 10 s nas falas
curtas. As 26 falas da Groq (9% do total) custaram 25% da conta.

### 2.2 No aparelho × nuvem, por idioma

Diferença pareada nas mesmas 100 falas. Negativo = a nuvem erra menos.

**Português**

| Contra (no aparelho) | WER do aparelho | Nuvem − aparelho | Significativa? | Latência mediana do aparelho |
|---|---|---|---|---|
| Whisper base, WebGPU | 18,2 [15,8–20,6] | −13,1 [−15,0; −11,1] | sim, nuvem melhor | 839 ms |
| Whisper small, WebGPU | 10,8 [9,1–12,5] | −5,6 [−6,9; −4,4] | sim, nuvem melhor | 1.316 ms |
| Parakeet v3 int8, WASM | 5,8 [4,6–7,1] | −0,6 [−1,8; +0,7] | não, empate | 1.077 ms |
| Parakeet v3 fp16, WebGPU | 5,0 [3,8–6,4] | +0,1 [−0,9; +1,2] | não, empate | 189 ms |

**Espanhol**

| Contra (no aparelho) | WER do aparelho | Nuvem − aparelho | Significativa? | Latência mediana do aparelho |
|---|---|---|---|---|
| Whisper base, WebGPU | 15,5 [13,6–17,4] | −9,9 [−11,7; −8,1] | sim, nuvem melhor | 845 ms |
| Whisper small, WebGPU | 9,3 [7,9–10,8] | −3,7 [−4,9; −2,5] | sim, nuvem melhor | 1.263 ms |
| Parakeet v3 int8, WASM | 4,5 [3,6–5,6] | +1,0 [0,00; +1,95] | não, no limite (o intervalo encosta em zero) | 1.025 ms |
| Parakeet v3 fp16, WebGPU | 4,2 [3,2–5,3] | +1,4 [+0,6; +2,1] | sim, **aparelho melhor** | 182 ms |

**Inglês** (não há Whisper small de inglês na bancada do aparelho)

| Contra (no aparelho) | WER do aparelho | Nuvem − aparelho | Significativa? | Latência mediana do aparelho |
|---|---|---|---|---|
| Whisper base, WebGPU | 21,5 [18,4–24,5] | +6,2 [+0,1; +13,3] | sim, **aparelho melhor** | 602 ms |
| Moonshine base, WASM | 13,6 [10,5–17,2] | +14,2 [+8,2; +21,0] | sim, **aparelho melhor** | 637 ms |
| Parakeet v3 int8, WASM | 7,1 [5,6–8,5] | +20,7 [+15,3; +26,8] | sim, **aparelho melhor** | 905 ms |

A latência do aparelho é só o tempo de decodificação nesta máquina (com placa de vídeo boa). A da
nuvem é o pedido inteiro pela rede. Em nenhum idioma a nuvem foi mais rápida que o Parakeet local.

### 2.3 Por que o inglês desabou: o provedor, não o modelo

As falas de inglês do FLEURS são gravadas muito baixo: volume mediano de −60 dBFS, contra −25 em
português e −24 em espanhol. Na rota padrão o texto volta cortado ("Some cruises, Berlin. brochures.")
ou vazio (uma fala de 20 s voltou sem nada). Três evidências de que é o provedor:

| Evidência | Inglês, WER % | Fonte |
|---|---|---|
| As 91 falas que o OpenRouter mandou para a DeepInfra | 30,1 | esta rodada |
| As 9 falas que ele mandou para a Groq | 4,8 | esta rodada (9 falas: indicativo) |
| O mesmo modelo, direto na Groq, nas mesmas 100 falas | 4,9 [3,8–6,1] | **setembro**, `bancada-2026-09/stt_nuvem_limpo.json` |
| Rota padrão com o volume normalizado antes de enviar (diagnóstico) | 6,1 [4,8–7,5] | esta rodada |

O diagnóstico de volume: o mesmo lote de inglês, com o pico de cada WAV levado a −3 dBFS em memória
antes do envio (ganho de até 40 dB). O erro caiu de 27,8% para 6,1%, sem falas vazias. Com o volume
normalizado, a nuvem empata com o Parakeet local (−0,9 ponto [−2,2; +0,3]) e vence o Moonshine
(−7,4 [−10,5; −4,6]). **Esse número não é comparável de forma justa com o aparelho**: os modelos locais
foram medidos com o áudio original e também poderiam melhorar com ganho. Serve para localizar a causa.

Em português a mesma comparação com setembro dá: OpenRouter hoje 5,2% contra Groq direto 4,1%;
diferença +1,1 ponto [+0,4; +1,8], significativa. Pequena, mas a rota do OpenRouter é pior nos dois
idiomas em que há par.

**Não dá para contornar pelo pedido.** Tentei prender o provedor com `only: ['groq']` em 3 falas:
foram atendidas e cobradas pela DeepInfra, com o mesmo texto cortado. A documentação do SDK confirma
que o `provider` da transcrição só tem `zdr`, `data_collection` e `options`.

Latência, também contra setembro: a Groq direta respondeu com mediana de 365 ms; pelo OpenRouter hoje a
mediana foi de 981 a 1.207 ms. Rodadas em dias diferentes; indicativo.

## 3. Tradução

### 3.1 Resultado (100 frases por direção)

| Direção | Sistema | COMET [IC 95%] | chrF++ [IC 95%] | BLEU | Latência mediana | p90 | US$ por 1.000 frases | US$ por hora de fala |
|---|---|---|---|---|---|---|---|---|
| en→pt | opus-mt local | 0,858 [0,842–0,871] | 63,4 [60,7–66,1] | 41,0 | 628 ms | 1.015 ms | 0 | 0 |
| en→pt | gpt-oss-120b | **0,900** [0,890–0,908] | 65,3 [62,8–68,1] | 46,9 | 1.341 ms | 2.819 ms | 0,0275 | 0,0111 |
| en→pt | gpt-oss-20b | 0,889 [0,873–0,903] | 64,5 [61,6–67,5] | 46,1 | 1.810 ms | 5.977 ms | 0,0224 | 0,0090 |
| pt→en | opus-mt local | 0,849 [0,834–0,865] | 63,5 [60,8–66,4] | 39,7 | 506 ms | 720 ms | 0 | 0 |
| pt→en | gpt-oss-120b | **0,891** [0,882–0,899] | 64,6 [62,2–67,4] | 42,1 | 1.462 ms | 2.537 ms | 0,0329 | 0,0125 |
| pt→en | gpt-oss-20b | 0,889 [0,879–0,899] | 64,9 [62,5–67,5] | 43,3 | 2.009 ms | 7.297 ms | 0,0194 | 0,0073 |

"Por hora de fala" usa a conta de setembro: 9.000 palavras por hora de conversa. É derivado do custo
medido por palavra, não medido em conversa real.

Custo total medido: gpt-oss-120b US$ 0,00604 (200 frases); gpt-oss-20b US$ 0,00418 (200 frases).
Por frase: US$ 0,000028 a 0,000033 no 120b e US$ 0,000019 a 0,000022 no 20b.

O tradutor local levou 588 ms (en→pt) e 436 ms (pt→en) de mediana **por frase** na CPU desta máquina,
em Node. No navegador de um aparelho fraco é mais lento; não foi medido aqui.

### 3.2 Nuvem × local, diferença pareada

| Comparação | en→pt | pt→en |
|---|---|---|
| COMET: 120b − local | **+0,042 [+0,031; +0,054], significativa** | **+0,042 [+0,028; +0,056], significativa** |
| COMET: 20b − local | **+0,031 [+0,017; +0,046], significativa** | **+0,040 [+0,027; +0,055], significativa** |
| COMET: 20b − 120b | −0,011 [−0,025; +0,001], empate | −0,002 [−0,007; +0,003], empate |
| chrF++: 120b − local | +1,9 [−0,7; +4,4], empate | +1,2 [−0,9; +3,4], empate |
| chrF++: 20b − local | +1,0 [−1,9; +3,6], empate | +1,5 [−0,7; +3,8], empate |
| chrF++: 20b − 120b | −0,9 [−3,5; +1,7], empate | +0,3 [−1,4; +2,1], empate |

As duas métricas discordam, e a bancada de setembro já explicava por quê: o chrF++ conta letras iguais
e pune paráfrase, e o prompt da produção pede paráfrase ("traduza o sentido"). O COMET mede sentido. A
leitura honesta: a nuvem traduz melhor em sentido, por uma margem que o acaso não explica, e não
consegue mostrar vantagem na métrica de letras.

### 3.3 O que apareceu no caminho

- **O 20b é mais barato, mas mais lento e menos estável.** p90 de 6,0 e 7,3 s contra 2,5 e 2,8 s do
  120b. Sete das 200 frases do 20b passaram dos 12 s do timeout da produção (1 em 200 no 120b); nesses
  casos o app cairia no tradutor local.
- **Uma resposta vazia no 20b** (en→pt): gastou os 405 tokens de `max_tokens` raciocinando e não
  escreveu a tradução (`finish_reason: length`). Conta como frase vazia nos números acima. É o defeito
  que o comentário de `parametrosDoProvedor.ts` descreve; o esforço baixo não o eliminou.
- **O OpenRouter espalha os pedidos.** As 200 frases do 120b passaram por 17 provedores diferentes; as
  do 20b, por 7. Qualidade e latência são a média dessa mistura, e ela pode mudar de um dia para outro.
- **O 120b em fala lida mudou desde setembro.** Em setembro, direto na Groq, o 120b ficou abaixo do
  opus-mt em chrF++ nas 150 frases de en→pt daquela rodada (55,3 contra 62,8). Hoje, pelo OpenRouter, ficou acima.
  Pedido diferente (o de setembro era anterior ao ajuste de 29/09) e provedores diferentes: não são
  pareáveis, e eu não medi a causa.

## 4. O que isso diz sobre o que justifica pagar

Só o que estes números sustentam, em fala lida e limpa:

1. **Transcrição em português e espanhol: pagar só se justifica onde o Parakeet não roda.** Contra o
   Whisper base e small do aparelho, a nuvem reduz o erro a menos da metade, com diferença
   significativa. Contra o Parakeet local ela empata em português e perde por pouco em espanhol. O
   Parakeet pede 672 MB de download e 2 GB de RAM, e foi medido só neste computador: no celular, no
   Quest e no notebook fraco, onde hoje roda o Whisper base, a nuvem é o ganho medido (de 18% para 5%
   de erro em português), a US$ 0,0146 por hora de áudio.
2. **Transcrição pelo OpenRouter não é um caminho confiável hoje.** Não se escolhe o provedor, e o
   provedor que ele prefere (o mais barato) devolveu texto cortado em áudio baixo. Um usuário com
   microfone fraco ou longe da boca cairia nisso. Se a transcrição paga for adiante, os números
   apontam para contratar o provedor direto (a Groq direta deu 4,1% e 4,9% em setembro, com 365 ms)
   ou normalizar o volume antes do envio, que aqui resolveu. O app normaliza o volume? Não conferi.
3. **Tradução: a nuvem entrega sentido melhor, por centavos.** +0,04 de COMET nas duas direções,
   significativo, por US$ 0,02 a 0,03 a cada 1.000 frases. O preço é 1 a 2,5 s de espera por frase
   contra 0,5 s do local.
4. **Entre os dois modelos, o 120b.** Empata com o 20b em qualidade, custa US$ 0,005 a 0,014 a mais
   por 1.000 frases, e é bem mais previsível na latência e sem resposta vazia.
5. **O custo de nuvem medido é pequeno.** Transcrição mais tradução (120b) somam cerca de US$ 0,026
   por hora de conversa, com a ressalva de que a parte da tradução é derivada de palavras por hora.
   Fica dentro da faixa pesquisada na seção 3 de `2026-10-09-aparelhos-planos-e-nuvem.md`.

## 5. Gasto

Os três retratos de `GET /api/v1/key`:

| Momento | Hora (UTC) | `limit` | `usage` | `limit_remaining` |
|---|---|---|---|---|
| Antes de qualquer pedido | 10/10 02:07:56 | 1 | 0 | 1 |
| Meio (transcrição feita, antes do lote de tradução) | 10/10 02:22:11 | 1 | 0,018916135 | 0,981083865 |
| Depois do último pedido pago | 10/10 02:39:47 | 1 | 0,029074403 | 0,970925597 |

**Gasto total: US$ 0,0291**, 9,7% do teto de US$ 0,30. O livro-caixa dos scripts soma US$ 0,029075; a
conta do OpenRouter, US$ 0,029074.

| Lote | Pedidos | Previsão de pior caso | Custo real |
|---|---|---|---|
| Transcrição, 300 falas | 300 | US$ 0,041 | US$ 0,01422 |
| Sonda de provedor (`only: groq`, ignorado) | 3 | US$ 0,0004 | US$ 0,00011 |
| Diagnóstico de volume, inglês | 100 | US$ 0,013 | US$ 0,00452 |
| Tradução gpt-oss-120b, 200 frases | 200 | US$ 0,138 | US$ 0,00604 |
| Tradução gpt-oss-20b, 200 frases | 200 | US$ 0,038 | US$ 0,00418 |
| **Total** | **803** | | **US$ 0,02907** |

A previsão é o pior caso (o endpoint de retenção zero mais caro e a saída no teto de tokens), por isso
fica muito acima do real. As consultas ao catálogo e à chave são grátis e não entram na conta.

## 6. O que não foi medido

| Item | Motivo |
|---|---|
| Cada provedor de transcrição isolado nas 300 falas | O endpoint não deixa escolher o provedor. A separação DeepInfra × Groq vem do preço cobrado por fala; as 26 falas da Groq são poucas. |
| A Groq e a DeepInfra direto, hoje | Só havia a chave do OpenRouter. O par "Groq direto" é de setembro. |
| Modelos locais com o volume normalizado | O diagnóstico de volume só passou pela nuvem. |
| Whisper small em inglês | Não está na bancada do aparelho. |
| Áudio real (conversa, ruído, vídeo), trechos sem fala, falas acima de 30 s | Só FLEURS, fala lida. O volume baixo do inglês é o único "defeito de gravação" do conjunto. |
| Áudio comprimido (Opus), como o app enviaria de um celular | Enviei WAV de 16 kHz sem compressão (300 a 900 KB por fala). |
| A triagem de segmentos da produção (`triarSegmentos`) | Apliquei só o `filtrarAlucinacao`, como a bancada do aparelho. Os números por segmento estão no bruto. |
| Transcrição com texto durante a fala | O endpoint devolve a fala inteira. |
| Latência de outra rede ou de celular | Uma máquina, uma rede. |
| Tradução com contexto de falas anteriores, gíria e conversa | Frases soltas de notícia e enciclopédia. O gold de conversa de setembro não foi repetido. |
| Tradução de e para espanhol | Só en↔pt, como pedido. |
| Outros modelos de linguagem (Qwen, Gemma) | Ficaram de fora: o pedido era os dois mais baratos que a produção cita. |
| O Parakeet v3 pela nuvem | Existe no catálogo (preço listado de US$ 0,09/h, não medido). |
| Variação entre execuções | Temperatura 0,2 e provedores sorteados: cada lote rodou uma vez. |

## 7. Como repetir

```bash
# Saldo da chave (grátis; grava só os números)
node scripts/eval-fala/bancada/nuvem/retrato.mjs --rotulo antes

# Medição 1: ensaio de 3 falas por idioma, depois o lote
node scripts/eval-fala/bancada/nuvem/stt.mjs --limite 3
node scripts/eval-fala/bancada/nuvem/stt.mjs
node scripts/eval-fala/bancada/nuvem/stt.mjs --conjuntos fleurs_en --ganho   # diagnóstico de volume

# Medição 2: ensaio, lote de nuvem, e o tradutor local
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/nuvem/mt.mjs --sistemas openrouter:openai/gpt-oss-120b,openrouter:openai/gpt-oss-20b --limite 3
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/nuvem/mt.mjs --sistemas openrouter:openai/gpt-oss-120b,openrouter:openai/gpt-oss-20b
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/nuvem/mt.mjs --sistemas local:opus-mt

# Pontuação (WER, chrF++, pareados) e COMET
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/nuvem/pontuar.mjs
python scripts/eval-fala/bancada/nuvem/pontuar-comet.py   # Python com unbabel-comet 2.2.7 e sacrebleu 2.6.0
```

Os scripts retomam de onde pararam: rodar de novo não paga de novo o que já está no bruto. O teto de
US$ 0,30 vale sobre `gasto.json`, que acumula.

| O quê | Onde |
|---|---|
| Scripts | `scripts/eval-fala/bancada/nuvem/` (`comum.mjs`, `retrato.mjs`, `stt.mjs`, `mt.mjs`, `pontuar.mjs`, `pontuar-comet.py`) |
| Números pontuados | `docs/auditoria/eval/bancada-2026-10-nuvem/resumo.json`, `casos.json`, `comet.json` |
| Retratos da chave e livro-caixa | `retratos.json` e `gasto.json`, na mesma pasta |
| Bruto por sistema | `docs/auditoria/eval/bancada-2026-10-nuvem/bruto/` (texto, tempo, custo e uso de cada pedido; nenhum cabeçalho) |
| Pesos do opus-mt | `%LOCALAPPDATA%\babel-bancada\cache\modelos\transformers\` (fora do repositório) |

O COMET rodou num ambiente Python temporário na pasta de rascunho da sessão (o ambiente da bancada de
setembro não existe mais no disco), com o modelo que já estava no cache do Hugging Face.
