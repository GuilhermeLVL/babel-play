# Tempo de carga dos modelos de STT e de MT, por fase

Tarefa 4.4 da change `lab-medicao-legenda-traduzida`. Origem: `medido`, desktop (Mac Apple M5 Pro, 15 núcleos, 24 GB, Darwin 27;
Chromium do Playwright 159, headless, sem WebGPU: perfil `desktop-sem-gpu`). Build do commit `efd0c702` (com as marcas
`frasy:modelo:*`). Áudio do fixture `fleurs-en-8` tocando como microfone falso; cada configuração roda duas vezes com o MESMO perfil de
navegador: `frio` (perfil novo, sem `--cache-modelos`: os pesos vêm da rede de verdade, Hugging Face Hub) e `quente` (mesmo perfil, pesos
já no Cache Storage). Uma rodada por célula: serve para ordem de grandeza e para a base do SLO, não para variância.

Comando de cada rodada: `medir.mjs --rotulo <cfg>.<frio|quente> --perfil <dir> --headless --url http://127.0.0.1:4183 <cfg>`;
tabela: `carga-de-modelos.mjs`. Dados: `scripts/perf/latencia-legenda/resultados/2026-11-21/tempo-de-carga/`.

| Modelo               | Papel | Configuração da rodada              | Frio: download | Frio: compilação | Frio: aquec. | **Frio: total** | Quente: download | Quente: compilação | Quente: aquec. | **Quente: total** |
| -------------------- | ----- | ----------------------------------- | -------------- | ---------------- | ------------ | --------------- | ---------------- | ------------------ | -------------- | ----------------- |
| Whisper tiny         | STT   | mic pt→en, `--qualidade fast`, wasm | 7 623 ms       | 0                | 360 ms       | **7,98 s**      | 1 169 ms         | 0                  | 355 ms         | **1,52 s**        |
| Whisper base         | STT   | mic pt→en, auto, wasm               | 9 688 ms       | 0                | 606 ms       | **10,29 s**     | 1 321 ms         | 0                  | 604 ms         | **1,93 s**        |
| Moonshine base       | STT   | sistema en→pt (padrão)              | 5 056 ms       | 456 ms           | 48 ms        | **5,56 s**      | 102 ms           | 689 ms             | 50 ms          | **0,84 s**        |
| Parakeet TDT 0.6b v3 | STT   | mic pt→pt, `--qualidade accurate`   | 33 264 ms      | 520 ms           | 132 ms       | **33,92 s**     | 616 ms           | 560 ms             | 162 ms         | **1,34 s**        |
| opus-mt en-ROMANCE   | MT    | sistema en→pt                       | 5 392 ms       | 250 ms           | 0            | **5,64 s**      | 95 ms            | 238 ms             | 0              | **0,33 s**        |
| Bergamot pt→en       | MT    | mic pt→en                           | 191 ms         | 35 ms            | 99 ms        | **0,33 s**      | 155 ms           | 35 ms              | 95 ms          | **0,29 s**        |

## Como ler

- Download é dominado pela rede e pelo tamanho: Parakeet (~672 MB) leva ~33 s a frio neste Mac; Whisper base ~10 s; Moonshine e opus-mt ~5 s.
  Com cache quente, o "download" é só ler o Cache Storage (0,1 a 1,3 s) e o gargalo vira a compilação (Moonshine ~0,7 s).
- `compilação` do Whisper aparece como 0 porque o adaptador cria o pipeline dentro da fase de download (o worker devolve `ready`
  depois do aquecimento); o custo está em download + aquecimento. O opus-mt não tem aquecimento (fase com duração 0), como as notas da fase 1 já registram.
- Bergamot não baixa do Hub: os modelos saem de `/modelos/bergamot/` na mesma origem (`public/modelos/bergamot/`), por isso o "frio" é
  só 0,33 s. É o motivo de ele ser o tradutor local barato do pt→en.
- A carga do MT (opus-mt, Bergamot) é preguiçosa: começa no 1º pedido de tradução, depois do 1º fim de fala, não ao abrir a captura.
  Com o cache frio, a 1ª legenda traduzida paga o download do tradutor (~5,4 s do opus-mt).
- Whisper base na rodada frio avisou "cerca de 322 MB" no aviso de download do perfil do aparelho (aceito pela bancada).

## Limites

- Uma rodada por célula e uma rede só (a deste Mac, em 21/11/2026): o download frio varia com a rede. Os números quentes são estáveis (o
  `quente` do Moonshine bate com as 12 rodadas da linha de base: ~0,8 s).
- Só desktop sem GPU. WebGPU (Whisper `device: webgpu`) e celulares não foram medidos aqui; a matriz do protocolo os deixa `emulado` até haver aparelho.
- Parakeet carregou nesta configuração porque a chave `babel.stt.parakeet` está ligada de fábrica e a rota "preciso" de pt→pt o escolhe.
