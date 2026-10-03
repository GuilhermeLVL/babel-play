> **Fase 2 de 6 do "Intérprete v3".** Depende da Fase 1 só para mostrar o parcial na lista; o motor é independente.
> Plano: `C:\Users\Guilh\.claude\plans\faca-um-brain-storm-temporal-crystal.md`.

## Why

O tempo do fim da fala até a voz traduzida é ~1,9 s na nuvem, e o pior pedaço é fixo: o VAD espera **800 ms de
silêncio** para fechar a fala (a bancada mediu que 450 ms piora o erro de 18% para 20,5% e dobra o custo de nuvem).
Silêncio fixo erra para os dois lados: corta quem pausa para pensar e demora quando a frase já acabou. Além disso, a
tradução e a voz só começam depois da fala inteira, e o app não mostra nada traduzido enquanto a pessoa ainda fala.

## What Changes

- **Fim de fala inteligente.** Um modelo de turno sobre o áudio (Smart Turn v3, ONNX, ~8 MB, CPU, no navegador)
  decide se a fala terminou. A fala fecha **cedo quando o modelo diz "completa"** e espera até o teto antigo quando diz
  "incompleta". O silêncio mínimo cai de 800 para ~300 ms, sem aumentar fragmentos enviados à nuvem.
- **Piso dinâmico.** O silêncio mínimo se adapta às pausas da própria pessoa (média móvel), dentro de limites.
- **Tradução parcial estável.** Com o texto parcial estável (duas leituras iguais, fim de oração), traduz o trecho e
  mostra em cinza; a versão final substitui. No máximo uma chamada de tradução por janela, para não estourar custo.
- **Voz por frase.** A tradução final é partida em frases; a primeira começa a ser lida enquanto as outras ainda
  sintetizam, em ordem, cancelando tudo se a pessoa falar de novo (barge-in).
- **Aquecimento.** Ao abrir `/interprete`, carregar VAD, modelo de turno e destravar a voz da nuvem antes do primeiro toque.
- **Medidor por sessão.** Guardar o tempo de cada etapa (VAD, STT, tradução, voz), o motor e o custo estimado, e
  mostrar no `/diagnostico`. Nada de texto, só metadados.
- **Portão de qualidade.** Nada vira padrão sem a bancada: WER no máximo igual ao de 800 ms e custo de nuvem ≤ 1,08×.
  Atrás da chave `babel.interprete.fimInteligente`, desligada até passar.

## Capabilities

### New Capabilities
- `fim-de-fala-inteligente`: decidir o fim da fala por modelo de áudio, com piso dinâmico, teto e queda para o VAD fixo.
- `traducao-parcial-estavel`: tradução em trechos a partir do parcial estável, mostrada em cinza e substituída pelo final.
- `voz-por-frase`: leitura da tradução frase a frase, em streaming, com cancelamento e ordem garantida.
- `medidor-da-sessao-de-voz`: tempos por etapa, motor e custo estimado por fala e por sessão.

### Modified Capabilities
<!-- Nenhuma: o comportamento do modo intérprete ainda mora na change `modo-interprete` (não arquivada). -->

## Impact

- `src/gateway/capture/systemAudio.ts` (VAD, `REDENCAO_MS`, ganchos de fim de fala), novo
  `src/gateway/capture/fimDeFala.ts` (modelo de turno em worker) e `piso dinâmico` puro e testável.
- `src/lib/captura/pipelineDeFala.ts`, `traducaoDaFala.ts`, `controleDoInterprete.ts`, `src/lib/voz/filaDeFala.ts`,
  `vozDaNuvem.ts`, `tempoAteAVoz.ts`; `gateway/capture/captureMetrics.ts` e `telemetriaDeCaptura.ts`.
- Dependência: o modelo ONNX do Smart Turn (BSD-2) servido como ativo estático; `onnxruntime-web` já é usado pelo VAD.
- Bancada: `scripts/eval-fala/bancada/` ganha `fim-de-fala.mjs` (WER, fragmentos por fala, tempo até o fechamento).
- Pré-requisito: o teste do modo automático com áudio real (`modo-interprete`, tarefa 7.8) deve estar feito.
