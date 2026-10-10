# Medições no aparelho: reconhecimento de fala no navegador

Medido em 09/10/2026 (noite), na máquina do dono, num Chrome de verdade com WebGPU. Responde às ações
1, 2 e 4 de `2026-10-09-qualidade-no-gratis-e-roteamento.md` e às medições 1 e 2 da seção 9 de
`openspec/changes/planos-v3-e-rota-inteligente/design.md`.

Tudo o que está em tabela aqui **rodou de verdade** nesta máquina. O que vem de fonte externa está
marcado como "não medido". Nenhum código de produto foi alterado, nenhuma chave foi usada e nada foi
pago.

## Resumo

| Pergunta | Resposta | Número principal |
|---|---|---|
| 1. O defeito do fp16 no WebGPU nos atinge? | **Sim. Não usar `hybrid-fp16` no WebGPU.** | Whisper base, português: 99,5% de erro em fp16 contra 18,2% em fp32, nas mesmas 100 falas. O mesmo arquivo fp16 fora da GPU dá texto idêntico ao fp32 em 100 de 100 falas. |
| 2. O Parakeet v3 roda no navegador e vale a troca? | **Roda (com onnxruntime-web direto, não com a nossa biblioteca). Adotar em português e espanhol no computador, depois de medir num notebook fraco.** | Português: 5,8% [4,6–7,1] em WASM contra 10,8% do Whisper small e 18,2% do base. 11 vezes mais rápido que a fala em 4 threads. |
| 3. Moonshine v2 abre na nossa biblioteca? | **Abre só por um export de terceiro, sem o fluxo. Não adotar agora.** | Inglês: 11,7% contra 13,6% do Moonshine atual; diferença −1,8 [−4,7; +0,6], empate. Duas vezes mais lento e 2,5 vezes maior. |

## 1. Como foi medido

**Máquina.** Windows 11 Pro (build 26100), AMD Ryzen 5 5600 (6 núcleos, 12 threads), 16 GB de RAM,
AMD Radeon RX 6800 16 GB, driver 32.0.21045.1000.

**Navegador.** Google Chrome 154.0.8037.93 (o instalado, `channel: 'chrome'` do Playwright 1.62.1),
sem janela (headless novo), perfil próprio da bancada. Adaptador devolvido por
`navigator.gpu.requestAdapter()`: `vendor: amd`, `architecture: rdna-2`, não é o de reserva,
`shader-f16` presente, `maxBufferSize` 2 GiB. Página com isolamento de origem igual ao de produção
(COOP `same-origin` + COEP `credentialless`), logo com SharedArrayBuffer e threads no WASM.

**Bibliotecas.** As de `node_modules`, servidas à página sem empacotar de novo:
`@huggingface/transformers` 4.2.0 (`dist/transformers.js`) e `onnxruntime-web`
1.26.0-dev.20260416-b7804b056c. 4 threads no WASM (o teto do app), salvo onde digo outra coisa.

**Fidelidade ao app.** A página repete `src/gateway/adapters/whisperWorker.ts` e `moonshine.ts`: os
mesmos presets de dtype (`hybrid` = encoder fp32 + decoder q4; `hybrid-fp16` = encoder fp16 + decoder
q4; `q8`), sessão com otimização `basic` no q8, decode guloso com `no_repeat_ngram_size: 3` e
`repetition_penalty: 1.15`, teto de tokens por duração, idioma sempre informado, aquecimento antes de
medir, revisões fixadas de `revisoesDosModelos.ts`. O texto cru volta para o Node, que aplica o
`filtrarAlucinacao` de produção e calcula o erro.

**Áudio.** As mesmas falas da bancada de setembro: FLEURS `pt_br` e `en_us` (CC-BY-4.0), semente
20260924, as 100 primeiras da amostra. Os WAV não estavam mais no disco; foram refeitos do parquet do
FLEURS já guardado em `%LOCALAPPDATA%\babel-bancada\cache\fleurs-raw`, e conferidos: os 100 ids e os
100 textos de referência batem com `docs/auditoria/eval/bancada-2026-09/stt_local_dtypes.json`.
Espanhol: FLEURS `es_419`, 100 falas, amostra nova (não havia espanhol na bancada de transcrição).

| Conjunto | Falas | Áudio | Palavras | Fala mais longa |
|---|---|---|---|---|
| fleurs_pt | 100 | 21,0 min | 2.378 | 29,9 s |
| fleurs_en | 100 | 16,8 min | 2.238 | 23,6 s |
| fleurs_es | 100 | 20,5 min | 2.620 | 25,0 s |

**Métricas.** Erro por palavra (WER) com a normalização de `src/core/eval/wer.ts`; intervalo de 95%
por bootstrap de 1000 reamostras e diferença **pareada** fala a fala (`src/core/eval/bootstrap.ts`),
como em setembro. Fator de tempo real = tempo de decodificação ÷ duração do áudio (0,1 = dez vezes
mais rápido que a fala); não inclui carga nem aquecimento.

**Prova de que a página mede o mesmo que a bancada de setembro.** Whisper base `hybrid` em português,
100 falas: 18,2% [15,8–20,6] aqui (Chrome, WebGPU) e 18,2% [15,8–20,6] em setembro (Node, CPU).

**Ressalvas que valem para tudo abaixo.**
- Uma máquina só, e é um computador com placa de vídeo boa. Nada aqui foi medido em celular, Quest,
  notebook sem GPU, GPU Intel, Adreno, Mali ou Apple.
- Fala lida e limpa (FLEURS). Não é conversa, vídeo nem áudio com ruído.
- Havia outro agente rodando testes leves na máquina. O erro não muda com isso; o fator de tempo real
  pode ter oscilado alguns pontos percentuais.
- "Memória do Chrome" é a soma do que todos os processos do Chrome da bancada ocupavam na RAM no fim
  do conjunto (navegador, aba e processo de GPU). É uma foto, não o pico, e não é memória de vídeo.

## 2. Pergunta 1: fp16 contra fp32 no encoder do Whisper, no WebGPU

Mesmas 100 falas por idioma, mesmo decoder (q4), mesmas opções. Só muda o encoder e onde ele roda.

| Sistema | Português, WER % [IC 95%] | Inglês, WER % [IC 95%] | Fator de tempo real (pt / en) |
|---|---|---|---|
| Whisper base, `hybrid` (encoder fp32), WebGPU | 18,2 [15,8–20,6] | 21,5 [18,4–24,5] | 0,069 / 0,062 |
| Whisper base, `hybrid-fp16` (encoder fp16), **WebGPU** | **99,5 [99,2–99,8]** | **98,0 [97,5–98,4]** | 0,016 / 0,021 |
| Whisper base, `hybrid-fp16`, WASM (controle) | 18,2 [15,8–20,6] | 21,5 [18,4–24,5] | 0,160 / 0,169 |
| Whisper base, `q8`, WASM (referência) | 18,8 [16,4–21,1] | 22,6 [19,4–25,8] | 0,139 / 0,122 |
| Whisper tiny, `hybrid`, WebGPU | 29,1 [25,6–33,0] | 20,0 [17,0–22,7] | 0,051 / 0,048 |
| Whisper tiny, `hybrid-fp16`, **WebGPU** | **82,2 [77,2–87,6]** | **54,9 [47,9–62,7]** | 0,039 / 0,047 |

Diferenças pareadas (100 falas cada):

| Comparação | Português | Inglês |
|---|---|---|
| base fp16 WebGPU − base fp32 WebGPU | +81,3 pontos [78,9; 83,8] | +76,4 pontos [73,4; 79,6] |
| tiny fp16 WebGPU − tiny fp32 WebGPU | +53,2 pontos [48,0; 58,7] | +35,0 pontos [28,5; 42,1] |
| base fp16 **WASM** − base fp32 WebGPU | 0,0; texto idêntico em 100 de 100 | 0,0; texto idêntico em 100 de 100 |
| base q8 WASM − base fp32 WebGPU | +0,6 [−1,0; +2,0], empate | +1,1 [−1,1; +3,3], empate |

**O que sai na tela.** No base em fp16 no WebGPU, o texto de cada fala inteira é uma palavra só: em
português, "A" em 65 falas, "que" em 34 e "V" em 1; em inglês, "The" em 53, "I" em 17, "And" em 10.
O filtro de alucinação ainda apaga boa parte (66 das 100 saem vazias em português). É o sintoma
descrito na issue #1590 (texto incompleto, um segmento só). No tiny o texto sai longo, mas errado
("Alguns, os cusairos, mais uma barra bem...").

**Onde está o defeito.** O arquivo `encoder_model_fp16.onnx` está bom: rodando no WASM ele devolve
exatamente o texto do fp32. O erro aparece só quando esse encoder roda no WebGPU. Mudar o nível de
otimização de grafo do ONNX Runtime (`basic` e `disabled`) não corrige (5 falas cada, mesmo
resultado: "A", "A", "A", "que", "A").

Achado lateral: o encoder fp16 no WASM **não abre** com a otimização padrão. Mensagem:

```
Can't create a session. ERROR_CODE: 1, ERROR_MESSAGE: .../onnxruntime/core/graph/graph_utils.cc:30
GetIndexFromName ... Attempting to get index by a name which does not exist:
InsertedPrecisionFreeCast_/layer_norm/Constant_output_0 for node:
/layers.0/self_attn_layer_norm/Mul/SimplifiedLayerNormFusion/
```

Com `graphOptimizationLevel: 'basic'` ele abre. Só interessa se alguém quiser usar o fp16 no WASM para
economizar download (41 MB contra 82 MB no encoder do base); nesta máquina ele ficou mais lento que o
q8 (0,160 contra 0,139).

**Conclusão: NÃO ADOTAR a rota `hybrid-fp16` no WebGPU.** O defeito nos atinge, com a versão que o app
usa, e não é perda de alguns pontos: a legenda fica inutilizável.

O que isto prova e o que não prova:
- Prova: Chrome 154, Windows, GPU AMD (D3D12), transformers.js 4.2.0, Whisper base e tiny.
- Não prova: que a GPU do celular ou do Quest erra igual. A rota `hybrid-fp16` hoje só é escolhida
  fora do computador (`usarGpuNoAparelho` em `sttRouter.ts`), e nenhum desses aparelhos foi medido.
  Mas o defeito está no caminho WebGPU da biblioteca, não no arquivo; sem medição que mostre o
  contrário num aparelho, o seguro é tratar fp16 no WebGPU como quebrado em todos.
- Leitura de código, não medição: `outroBackend()` em `sttRouter.ts` também devolve `hybrid-fp16`
  quando o regulador troca de WASM para WebGPU no meio da sessão em aparelho com `shader-f16`. E o
  vigia de `whisperLocal.ts` pega GPU travada ou perdida, não texto errado: este defeito passa por ele.

Alternativas medidas aqui para a mesma rota: `hybrid` (encoder fp32) no WebGPU, que funciona e baixa
209 MB no base em vez de 168 MB; ou `q8` no WASM, que empata em erro com o fp32 e baixa 80 MB.

## 3. Pergunta 2: Parakeet TDT 0.6b v3 no navegador

### 3.1 O que existe no Hugging Face (consultado em 09/10/2026)

| Repositório | Licença | Arquivos e tamanho | Data |
|---|---|---|---|
| `istupakov/parakeet-tdt-0.6b-v3-onnx` (commit `8f23f0c0`) | CC-BY-4.0 | `encoder-model.int8.onnx` 652,2 MB; `decoder_joint-model.int8.onnx` 18,2 MB; `nemo128.onnx` 0,14 MB; `vocab.txt` 0,09 MB. Também fp32: `encoder-model.onnx` 41,8 MB + `encoder-model.onnx.data` 2.435 MB; `decoder_joint-model.onnx` 72,5 MB | criado em 16/08/2025, último commit em 17/02/2026 |
| `striimit/parakeet-tdt-0.6b-v3-webgpu` (commit `d233168f`) | CC-BY-4.0 | `encoder-model.fp16.onnx` 1.239,2 MB; `decoder_joint-model.onnx` 72,5 MB; `nemo128_conv.onnx` 1,19 MB; `vocab.txt` 0,09 MB | 27/08/2026 |
| `jimmy927/parakeet-tdt-0.6b-v3-onnx-fp16` | CC-BY-4.0 | encoder fp16 1.239,0 MB; decoder fp16 36,3 MB | 05/10/2026, não testado |
| `Olicorne/parakeet-tdt-0.6b-v3-optimized-onnx` | não conferida | várias quantizações, entre elas `w4a8/encoder-model.w4a8.onnx` 383,4 MB | 07/10/2026, não testado |

A licença CC-BY-4.0 exige atribuição (NVIDIA pelo modelo; istupakov pelo export).

### 3.2 Roda com a nossa biblioteca?

**Não.** O `@huggingface/transformers` 4.2.0 só conhece `parakeet_ctc` (`ParakeetForCTC`); não há a
arquitetura TDT no pacote instalado (conferido no `dist/transformers.js`). O Parakeet v3 é TDT.

**Roda com onnxruntime-web direto**, a mesma versão que a biblioteca já traz, com o laço de
decodificação TDT guloso escrito à mão (o de `scripts/eval-fala/bancada/parakeet.mjs`, portado para a
página: cerca de 60 linhas).

### 3.3 Onde quebra

Uma coisa quebrou, e tem saída:

- **O extrator de áudio do export original não abre no onnxruntime-web.** `nemo128.onnx` (usa o
  operador STFT) falha na criação da sessão, em WASM:

  ```
  Can't create a session. ERROR_CODE: 9, ERROR_MESSAGE: Could not find an implementation for
  Cast(13) node with name 'node_Cast_6'
  ```

  Saída: o `nemo128_conv.onnx` (o mesmo extrator escrito com convolução, do projeto onnx-asr,
  redistribuído no repositório `striimit`). Com ele tudo abre. Todos os números abaixo usam esse
  arquivo, inclusive os de int8.

Não quebrou: carga do encoder int8 de 652 MB no WASM (3,2 s do disco local), carga do encoder fp16 de
1,24 GB no WebGPU (5,8 s do disco local), memória, operadores do encoder e do decoder.

O relato de terceiros de que "o int8 dá resultado errado no WebGPU" **não se reproduziu aqui**: o int8
no WebGPU deu o mesmo erro do int8 no WASM (75 textos idênticos em 100). Mas ficou 2,3 vezes mais
lento que no WASM, então não há motivo para usá-lo.

### 3.4 Resultado

Parakeet sem dica de idioma (ele detecta sozinho); Whisper com o idioma informado, como no app.

**Português (100 falas)**

| Sistema | WER % [IC 95%] | Fator de tempo real | Download | Memória do Chrome |
|---|---|---|---|---|
| **Parakeet v3 int8, WASM** | **5,8 [4,6–7,1]** | 0,089 | 672 MB | 2,0 GB |
| **Parakeet v3 fp16, WebGPU** | **5,0 [3,8–6,4]** | 0,016 | 1.313 MB | 5,0 GB |
| Parakeet v3 int8, WebGPU | 5,7 [4,6–7,0] | 0,203 | 672 MB | 3,5 GB |
| Whisper small `hybrid`, WebGPU | 10,8 [9,1–12,5] | 0,108 | 589 MB | 2,9 GB |
| Whisper base `hybrid`, WebGPU | 18,2 [15,8–20,6] | 0,069 | 209 MB | 2,2 GB |
| Whisper base `q8`, WASM | 18,8 [16,4–21,1] | 0,139 | 80 MB | 1,0 GB |

**Espanhol (100 falas)**

| Sistema | WER % [IC 95%] | Fator de tempo real |
|---|---|---|
| **Parakeet v3 int8, WASM** | **4,5 [3,6–5,6]** | 0,090 |
| **Parakeet v3 fp16, WebGPU** | **4,2 [3,2–5,3]** | 0,016 |
| Whisper small `hybrid`, WebGPU | 9,3 [7,9–10,8] | 0,110 |
| Whisper base `hybrid`, WebGPU | 15,5 [13,6–17,4] | 0,073 |
| Whisper base `q8`, WASM | 16,0 [13,9–18,1] | 0,165 |

**Inglês (100 falas)**

| Sistema | WER % [IC 95%] | Fator de tempo real |
|---|---|---|
| Parakeet v3 int8, WASM | 7,1 [5,6–8,5] | 0,094 |
| Parakeet v3 fp16, WebGPU | 6,3 [5,0–7,7] | 0,017 |
| Moonshine base `q8`, WASM (o de hoje) | 13,6 [10,5–17,2] | 0,069 |
| Whisper base `hybrid`, WebGPU | 21,5 [18,4–24,5] | 0,062 |

**Diferenças pareadas (negativo = Parakeet erra menos)**

| Comparação | Português | Espanhol | Inglês |
|---|---|---|---|
| Parakeet int8 WASM − Whisper small WebGPU | −5,0 [−6,5; −3,5] | −4,8 [−6,0; −3,5] | não medido |
| Parakeet int8 WASM − Whisper base WebGPU | −12,5 [−14,5; −10,5] | −10,9 [−12,8; −9,1] | −14,5 [−17,5; −11,2] |
| Parakeet int8 WASM − Whisper base q8 WASM | −13,1 [−15,0; −11,1] | −11,4 [−13,4; −9,6] | −15,6 [−19,0; −12,1] |
| Parakeet fp16 WebGPU − Whisper small WebGPU | −5,8 [−7,2; −4,3] | −5,1 [−6,2; −4,0] | não medido |
| Parakeet fp16 WebGPU − Parakeet int8 WASM | −0,7 [−1,5; +0,04], empate | −0,3 [−0,9; +0,2], empate | −0,8 [−2,1; +0,6], empate |
| Parakeet int8 WASM − Moonshine base | | | −6,5 [−9,7; −3,7] |

Todas as diferenças contra o Whisper e contra o Moonshine são significativas (o intervalo não cruza
zero). A diferença entre as duas versões do Parakeet não é.

**Com menos threads (só 30 falas de português: indicativo de velocidade, não de erro)**

| Sistema | 1 thread | 2 threads | 4 threads (100 falas) |
|---|---|---|---|
| Parakeet v3 int8, WASM | 0,265 | 0,145 | 0,089 |
| Whisper base `q8`, WASM | 0,247 | 0,166 | 0,139 |

Com uma thread só, o Parakeet int8 ainda roda quase 4 vezes mais rápido que a fala neste processador,
e empata em velocidade com o Whisper base q8.

**Onde vai o tempo do Parakeet (média por fala em português).** int8 no WASM: 1.068 ms no encoder e
46 ms no decoder. fp16 no WebGPU: 111 ms no encoder e 77 ms no decoder (o decoder fica no WASM nos
dois casos).

### 3.5 Conclusão

**ADOTAR, em duas condições, o Parakeet v3 int8 no WASM como "preciso local" de português e espanhol
no computador.**

A favor, medido: metade do erro do Whisper small e um terço do erro do base, nos dois idiomas; mais
rápido que o small na GPU mesmo rodando só no processador; não depende de placa de vídeo, logo serve
o computador sem GPU que hoje fica no base; download parecido com o do small (672 MB contra 589 MB).

As duas condições, que esta medição não cobre:
1. **Medir num notebook comum sem placa de vídeo.** O Ryzen 5 5600 é um processador de mesa forte.
   O fator 0,265 com uma thread sugere folga, mas é desta máquina.
2. **Medir memória e áudio real.** 2,0 GB de RAM somando os processos do Chrome é o dobro do Whisper
   base q8 (1,0 GB). E o FLEURS é fala lida; falta português de conversa, vídeo e ruído.

A versão fp16 no WebGPU **não compensa** hoje: empata em erro com a int8, dobra o download (1,3 GB) e
ocupou 5,0 GB de RAM. Só faria sentido se a velocidade (0,016) fosse necessária para texto parcial por
janela deslizante, e isso não foi medido.

**Em inglês** o Parakeet também venceu o Moonshine base (7,1% contra 13,6%, significativo). Isso
contradiz a etapa 5 de setembro, que deu empate (10,3% contra 10,9% em 300 falas, em Node). Aqui são
as 100 primeiras falas e o Moonshine rodou em q8 no navegador. Trato o inglês como **inconclusivo**:
vale repetir com as 300 falas antes de mexer na rota de inglês, onde o Moonshine tem 67 MB contra 672.

O que não foi medido no Parakeet: francês e alemão (não há áudio na bancada; seriam cerca de 700 MB de
download por idioma); celular, iPhone e Quest (672 MB não é para eles); trechos sem fala no navegador
(em setembro, em Node, ele alucinou em 7,9% contra 22,2% do Whisper base); áudio acima de 35 s (limite
do encoder exportado; a fala mais longa aqui tem 29,9 s); texto parcial durante a fala; tempo de
primeira carga pela rede (os arquivos foram servidos do disco local); sessão longa; a variante w4a8
de 383 MB.

## 4. Pergunta 3: Moonshine v2 em fluxo

### 4.1 Existe arquivo que a nossa biblioteca abra?

- **Oficial, não.** Os repositórios `moonshine-ai/moonshine-streaming-{tiny,small,medium}` (MIT,
  10–11/02/2026) só têm `model.safetensors`. O `onnx-community` não tem nenhum Moonshine de fluxo; só
  os da primeira geração.
- **A biblioteca não conhece a arquitetura.** No `@huggingface/transformers` 4.2.0 instalado só existe
  o tipo `moonshine`; não há `moonshine_streaming`.
- **De terceiro, sim, com um desvio.** `Workmind/moonshine-streaming-small-ONNX` (MIT, commit
  `bfd8beba`, 30/07/2026): o `config.json` declara `model_type: "moonshine"` de propósito, para a
  biblioteca carregar pelo caminho da primeira geração. Arquivos em q8:
  `encoder_model_quantized.onnx` 74,9 MB e `decoder_model_merged_quantized.onnx` 90,8 MB (mais
  `tokenizer.json` 3,8 MB): 170 MB, contra 67 MB do Moonshine base de hoje. O próprio autor avisa que
  o export é de fala inteira, **não é de fluxo**, e que o áudio precisa ser completado até um múltiplo
  de 80 amostras (fiz isso na página).
- Há também `Masterx/moonshine-streaming-*-ONNX` (MIT, 05/10/2026), em cinco grafos para codificar o
  áudio aos poucos. É para onnxruntime direto, não abre na nossa biblioteca, e o autor diz que o
  encoder não roda no DirectML. Não testei.

### 4.2 Resultado (inglês, 100 falas, WASM, q8)

| Sistema | WER % [IC 95%] | Fator de tempo real | p95 por fala | Download |
|---|---|---|---|---|
| Moonshine base (o de hoje) | 13,6 [10,5–17,2] | 0,069 | 1,2 s | 67 MB |
| Moonshine v2 small (export Workmind) | 11,7 [9,2–14,8] | 0,136 | 2,9 s | 170 MB |

Diferença pareada: −1,8 pontos [−4,7; +0,6]. **Empate** (o intervalo cruza zero).

### 4.3 Conclusão

**NÃO ADOTAR agora.** Abre e funciona, mas pelo único caminho que a nossa biblioteca aceita o v2 não
entrega o que o tornava interessante (texto durante a fala), custa o dobro do tempo e 2,5 vezes o
download, e o ganho de erro não se distingue do acaso com 100 falas. Além disso é um export de um
terceiro pequeno, com a configuração reescrita para enganar o carregador.

Reabrir quando houver suporte oficial a `moonshine_streaming` na biblioteca, ou se decidirmos escrever
um motor próprio sobre onnxruntime-web (o mesmo trabalho que o Parakeet pede). Nesse caso o candidato
a medir é o de cinco grafos, que é o de fluxo de verdade.

Não medido: os modelos tiny e medium, espanhol e alemão, atraso até a primeira palavra, fluxo real.

## 5. Fala do navegador processada no aparelho: como testar à mão em 5 minutos

Não dá para medir sem interface (o Chrome sem janela não tem o serviço de fala nem a permissão de
microfone). Passo a passo para o dono, no Chrome normal e depois no Edge:

1. Abra uma página `https://` qualquer (por exemplo `https://babel-play.pages.dev`), aperte F12 e vá
   à aba Console.
2. Cole e rode:

   ```js
   const SR = window.SpeechRecognition || window.webkitSpeechRecognition
   console.log('tem available():', typeof SR?.available, '| tem phrases:', 'phrases' in SR.prototype,
     '| tem processLocally:', 'processLocally' in SR.prototype)
   for (const lang of ['pt-BR', 'pt-PT', 'en-US', 'es-ES', 'es-MX', 'fr-FR', 'de-DE']) {
     for (const processLocally of [true, false]) {
       try {
         console.log(lang, processLocally ? 'no aparelho' : 'padrão',
           await SR.available({ langs: [lang], processLocally }))
       } catch (e) { console.log(lang, processLocally, 'ERRO', e.name, e.message) }
     }
   }
   ```

3. Anote a resposta de cada linha. `available` = pronto; `downloadable` = existe, mas falta baixar o
   pacote; `downloading` = baixando; `unavailable` = não existe para esse idioma.
4. Se `pt-BR` no aparelho der `downloadable`, rode (precisa de um clique na página antes):
   `await SR.install({ langs: ['pt-BR'], processLocally: true })` e repita o passo 2.
5. Abra `chrome://on-device-internals` e `chrome://components` (procure "SODA") e anote os idiomas e
   as versões que aparecem.
6. Teste de verdade, com o Wi-Fi desligado, se o passo 3 deu `available`:

   ```js
   const r = new SR(); r.lang = 'pt-BR'; r.processLocally = true; r.interimResults = true
   r.onresult = (e) => console.log([...e.results].map((x) => x[0].transcript).join(' '))
   r.onerror = (e) => console.log('erro', e.error); r.start()
   ```

   Fale uma frase. Se o texto aparecer sem internet, o reconhecimento é mesmo local.
7. Repita no Edge estável e no Edge Dev. O que decide é a linha `pt-BR no aparelho`.

## 6. O que não foi medido, e por quê

| Item | Motivo |
|---|---|
| fp16 no WebGPU em celular e Quest | Só havia esta máquina. É a medição que falta para a pergunta 1 ficar fechada nos aparelhos onde a rota é usada. |
| Parakeet em francês e alemão | Sem áudio na bancada; fora do tempo. O script aceita `--extras fr_fr,de_de`. |
| Parakeet em notebook sem GPU, celular, Quest | Só havia esta máquina. |
| Trechos sem fala (alucinação) no navegador | Os sons do ESC-50 da bancada não estão mais no disco; não refiz. |
| Pico de memória e memória de vídeo | Medi só a foto da RAM dos processos do Chrome no fim de cada conjunto. |
| Tempo de primeira carga pela rede | Os pesos do Parakeet foram servidos do disco local; os do Whisper vieram do Hugging Face, mas não cronometrei o download em separado. |
| 30 trechos reais de pt-BR com gabarito à mão | Não existem ainda (2 horas de trabalho do dono, previstas no relatório de 09/10). |
| Sessão longa (30 min), texto parcial, atraso até a primeira palavra | Fora do escopo desta rodada. |
| `SpeechRecognition.available()` | Precisa de navegador com interface; roteiro na seção 5. |

## 7. Como repetir

```bash
# 1. Áudio (lê o parquet do FLEURS em %LOCALAPPDATA%\babel-bancada\cache\fleurs-raw; baixa se faltar)
python scripts/eval-fala/bancada/navegador/preparar-audio.py --n 100 --es

# 2. Conferir o adaptador WebGPU
node scripts/eval-fala/bancada/navegador/rodar.mjs --sonda --sem-janela

# 3. Pergunta 1
node scripts/eval-fala/bancada/navegador/rodar.mjs --sem-janela \
  --sistemas whisper-base:hybrid:webgpu,whisper-base:hybrid-fp16:webgpu,whisper-base:q8:wasm,whisper-base:hybrid-fp16:wasm+basica,whisper-tiny:hybrid:webgpu,whisper-tiny:hybrid-fp16:webgpu \
  --conjuntos fleurs_pt,fleurs_en

# 4. Pergunta 2 (o primeiro uso baixa 2 GB de ONNX do Parakeet)
node scripts/eval-fala/bancada/navegador/rodar.mjs --sem-janela \
  --sistemas parakeet-v3:int8:wasm,parakeet-v3:fp16:webgpu --conjuntos fleurs_pt,fleurs_es,fleurs_en
node scripts/eval-fala/bancada/navegador/rodar.mjs --sem-janela \
  --sistemas parakeet-v3:int8:webgpu,parakeet-v3-stft:int8:wasm --conjuntos fleurs_pt
node scripts/eval-fala/bancada/navegador/rodar.mjs --sem-janela \
  --sistemas whisper-small:hybrid:webgpu,whisper-base:hybrid:webgpu,whisper-base:q8:wasm --conjuntos fleurs_pt,fleurs_es
node scripts/eval-fala/bancada/navegador/rodar.mjs --sem-janela --threads 1 --limite 30 \
  --sistemas parakeet-v3:int8:wasm,whisper-base:q8:wasm --conjuntos fleurs_pt

# 5. Pergunta 3
node scripts/eval-fala/bancada/navegador/rodar.mjs --sem-janela \
  --sistemas moonshine-base:q8:wasm,moonshine-v2-small:q8:wasm --conjuntos fleurs_en

# 6. Erro, intervalos e diferenças pareadas ("a>b" = a − b)
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/navegador/pontuar.mjs \
  --pares "whisper-base:hybrid-fp16:webgpu>whisper-base:hybrid:webgpu,parakeet-v3:int8:wasm>whisper-small:hybrid:webgpu,moonshine-v2-small:q8:wasm>moonshine-base:q8:wasm"
```

Opções do `rodar.mjs`: `--limite N` (menos falas), `--refazer` (ignora o que já foi medido; sem ela a
rodada retoma de onde parou), `--porta` (padrão 4517), `--threads` (padrão 4), sem `--sem-janela` o
Chrome abre com janela. O sufixo `+basica` ou `+desligada` no nome do sistema muda a otimização de
grafo do ONNX Runtime. O servidor local só escuta em 127.0.0.1 e é encerrado no fim de cada rodada.

**Onde está cada coisa**

| O quê | Onde |
|---|---|
| Scripts | `scripts/eval-fala/bancada/navegador/` (`preparar-audio.py`, `servidor.mjs`, `pagina.html`, `rodar.mjs`, `pontuar.mjs`) |
| Resultado pontuado | `docs/auditoria/eval/bancada-2026-10-navegador/resumo.json` (números) e `casos.json` (texto de cada fala) |
| Bruto por sistema e conjunto | `%LOCALAPPDATA%\babel-bancada\navegador\resultados\` |
| Falas e manifestos | `%LOCALAPPDATA%\babel-bancada\navegador\stt\` (108 MB) |
| Pesos do Whisper e do Moonshine | cache do perfil do Chrome da bancada, `%LOCALAPPDATA%\babel-bancada\navegador\perfil-chrome\` (1,8 GB em disco) |
| Pesos do Parakeet | `%LOCALAPPDATA%\babel-bancada\cache\modelos\parakeet\` (1,9 GB) |

Baixado nesta rodada: cerca de 3,3 GB (1,98 GB do Parakeet; cerca de 1,3 GB de Whisper tiny, base e
small e dos dois Moonshine). Nada disso está no repositório. Para liberar o espaço, basta apagar as
pastas `perfil-chrome` e `cache\modelos\parakeet`.
