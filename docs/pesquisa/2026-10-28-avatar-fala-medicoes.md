# Avatar, M3 (fala): custo por quadro com e sem fala

Data: 28/10/2026. Máquina: Mac com Apple M5 Pro, Chrome 156 REAL instalado (`channel: 'chrome'`, com janela, GPU
Metal via ANGLE). Modelo: `milk.vrm` (CC0, o de teste do harness), canvas de 256 px.
Teste: `tests/e2e/avatar-fala-medicao.e2e.ts` (só roda com `AVATAR_MEDIR=1`; `AVATAR_CANAL=chrome`, `AVATAR_HEADED=1`).

Duas formas de medir, e a diferença importa:

1. **Laço real** (a que vale): tempo dentro do callback de `requestAnimationFrame` dos quadros em que o motor
   desenhou, por 3 s, com a fala simulada por uma boca sintética que se mexe o tempo todo (vogais trocando a cada
   120 ms, abertura oscilando) e a emoção `feliz`. Inclui respiração, piscar, olhar, balanço, expressões e `render`.
2. **600 quadros em sequência** (`motor.medirQuadros`): só a SUBMISSÃO de CPU, sem esperar a GPU (como o
   protótipo) e com `gl.finish()`. O `gl.finish()` no ANGLE/Metal quase não espera, então os dois números ficam
   muito abaixo do laço real; servem de piso, não de custo.

## Chrome real (GPU)

| Tier  | Fala | Laço real: média / p95 (ms/quadro) | Quadros/s | 600 quadros, CPU: média / p95 | 600 quadros, com `finish`: média / p95 |
| ----- | ---- | ---------------------------------- | --------- | ----------------------------- | -------------------------------------- |
| forte | sem  | 0,138 / 0,255                      | 60        | 0,035 / 0,055                 | 0,024 / 0,030                          |
| forte | com  | 0,161 / 0,265                      | 60        | 0,028 / 0,040                 | 0,026 / 0,030                          |
| fraco | sem  | 0,212 / 0,360                      | 30        | 0,036 / 0,055                 | 0,025 / 0,030                          |
| fraco | com  | 0,217 / 0,330                      | 30        | 0,028 / 0,040                 | 0,026 / 0,035                          |

Leitura honesta:

- A fala custa cerca de +0,02 ms por quadro no tier forte e praticamente nada no fraco (a boca do fraco é só `aa`).
  Dentro do ruído da medição (a resolução do relógio do Chrome é de 5 µs, e o p95 varia entre rodadas).
- O custo do laço real (0,14 a 0,22 ms) fica na faixa do protótipo (0,06 a 0,18 ms) para o forte e um pouco acima
  para o fraco. O fraco roda a 30 quadros/s e cada quadro carrega o custo fixo de entrar no laço; não é o
  tier fraco que é mais caro por quadro, é o contexto de `low-power` e a menor taxa.
- O p95 sempre abaixo de 0,4 ms: em 60 quadros/s sobra 16,6 ms por quadro; o avatar usa ~1% do orçamento da thread.
- O que NÃO está medido: o custo da GPU em si (rasterização) e o do `AnalyserNode` com áudio real (o analisador
  roda no thread de áudio; `getByteTimeDomainData` de 256 amostras custa microssegundos). A boca de teste foi
  sintética para o resultado não depender do relógio.

## Chromium do Playwright, headless, SwiftShader (WebGL por software)

| Tier  | Fala | Laço real: média / p95 (ms) | Quadros/s |
| ----- | ---- | --------------------------- | --------- |
| forte | sem  | 0,106 / 0,185               | 27        |
| forte | com  | 0,101 / 0,220               | 27        |
| fraco | sem  | 0,174 / 0,300               | 25        |
| fraco | com  | 0,183 / 0,270               | 25        |

Aqui o JavaScript custa o mesmo (a rasterização acontece em outro processo), mas o SwiftShader não sustenta 60
quadros/s (27 quadros/s no forte): é o limite do renderizador por software do CI, não do código do avatar. Por isso
os e2e do CI verificam comportamento e nunca desempenho.

## Como reproduzir

```
AVATAR_MEDIR=1 AVATAR_CANAL=chrome AVATAR_HEADED=1 PORT=3187 BASE_URL=http://localhost:3187 \
  npx playwright test tests/e2e/avatar-fala-medicao.e2e.ts --project=desktop-1280
```

O JSON bruto vai para `$AVATAR_CAPTURAS/avatar-fala-medicoes.json`.
