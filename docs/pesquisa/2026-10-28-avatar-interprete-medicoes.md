# Avatares no Intérprete: custo medido (M4)

Data: 2026-10-28 · Marco M4 (`feat/avatar-m4-interprete`) · Não é teste de regressão: depende da máquina.

## Como foi medido

- Máquina: Apple M5 Pro, macOS, **Chrome 155.0.8059.86 real** (`channel: 'chrome'`, headless). WebGL2 pela GPU
  (`ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro)`), não por SwiftShader.
- No app de verdade, não no harness: Intérprete aberto na tela de computador (1280x800), conversa por toque, Web Speech e
  tradutor falsos (ver `tests/e2e/_interprete.ts`), voz da nuvem (Premium simulado) tocando um WAV de tom de 6,5 s.
- 5 s por cenário, depois de os dois avatares estarem prontos. Métricas do CDP (`Performance.getMetrics`): fração de uma
  CPU gasta pela thread principal (`TaskDuration` / tempo), tempo de script, tempo de layout e quadros por segundo do
  `requestAnimationFrame` da página.
- Reexecutar: `AVATAR_MEDIR=1 AVATAR_CANAL=chrome BASE_URL=<servidor> npx playwright test tests/e2e/avatar-interprete-medicao.e2e.ts --project=desktop-1280`.
  Saída em `$AVATAR_CAPTURAS/avatar-interprete-medicoes.json`.

## Resultado

| Cenário                                                   | Thread principal (fração de 1 CPU) | Script em 5 s | Layout | rAF da página |
| --------------------------------------------------------- | ---------------------------------- | ------------- | ------ | ------------- |
| A) sem a flag, parado (como era)                          | 0,022                              | 67 ms         | 0 ms   | 59,9 fps      |
| B) 2 avatares + legenda, parados (tier médio, 60 fps)     | 0,058                              | 203 ms        | 0 ms   | 60,1 fps      |
| C) 2 avatares + legenda, voz da nuvem falando             | 0,079                              | 207 ms        | 0 ms   | 59,9 fps      |
| D) como C, aparelho fraco (2 núcleos: tier fraco, 30 fps) | 0,074                              | 159 ms        | 0 ms   | 60,3 fps      |
| E) modo economia (flag ligada, sem avatar), voz falando   | 0,053                              | 92 ms         | 0 ms   | 59,9 fps      |

Leitura:

- Dois avatares animados custam **uns 4 a 6 pontos percentuais de uma CPU** a mais na thread principal (B e C contra A),
  e o quadro da página não cai de 60 fps.
- Por quadro de avatar, em script: (207 − 67) ms / ~600 desenhos (2 avatares x 60 fps x 5 s) ≈ **0,23 ms** no tier médio;
  (159 − 67) ms / ~300 desenhos ≈ **0,31 ms** no tier fraco (30 fps). É aproximado: a conta usa o `rAF` da página como
  referência e o resto do app também mexe no script. Bate com os 0,06 a 0,18 ms de SUBMISSÃO de CPU do protótipo mais o
  custo do app em volta (tradução, voz, tela).
- A fala (C contra B) soma pouco: a amplitude é um `getByteTimeDomainData` de 256 amostras por quadro, e a boca é um
  cálculo de poucos números.
- O cenário E (economia) NÃO volta ao zero de A porque a voz da nuvem está tocando (decodificação do áudio e o resto do
  app); é a comparação justa para C: **economia poupa cerca de 2,6 pontos de CPU com a voz tocando**.
- A GPU não é medida por estes números (o processo de GPU é outro). O cenário não mede o PiP.

## O que NÃO foi medido nem provado

- Celular real e aparelho fraco real (D só simula 2 núcleos para o tier; a GPU continua sendo a do M5 Pro).
- Safari (WebKit) e Firefox: nenhum número, e o analisador de voz fica desligado no iPhone/iPad por desenho.
- PiP de verdade (janela nativa do Document PiP e a janelinha do PiP de vídeo): só as simulações dos e2e (ver a spec).
- Bateria, temperatura e memória de vídeo.
