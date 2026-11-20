# Carga local: só o necessário — plano

> **Para agentes:** executado nativamente nesta sessão (dono pediu autonomia e rapidez), com revisão
> independente no fim. Passos com `- [ ]`.

**Objetivo:** o Frasy não pode esquentar nem sobrecarregar o computador de quem usa: em repouso, custo
próximo de zero; na captura, só o trabalho que a legenda e a tradução ao vivo exigem.

**Pedido do dono (22/10/2026):** "os modelos locais estão sobrecarregando o computador; preciso de
cuidados para não comprometer o PC dos usuários; meu PC está super quente; fiscalize os itens
relacionados e deixe somente o necessário". Não só no Safari.

**Evidência (antes):** inventário de workers/laços (subagente, 22/10) + `docs/auditoria/2026-10-10-desempenho-da-interface.md`
(G11: partículas = processo da GPU 117→34 ms/s em repouso; worker 14–22 ms/s) + medição desta sessão
(`docs/auditoria/2026-10-22-carga-local.md`, escrita ao fim).

## Cortes (o que muda e por quê)

### T1 Repouso: partículas de ambiente desligadas — FEITO (+ animações infinitas → 3 ciclos; onda/ponto pausam sob diálogo)

- `src/App.tsx`: `ambient` deixa de ser sempre ligado → `ambient={false}`; rajadas (confete, +Seeds) continuam.
  O laço do motor dorme sem ambiente (`motorDeParticulas.ts`, "SONO DO LOOP"), então o worker fica parado em repouso.
- Decisão de produto revertida: o ambiente para todos (dono, 27/08/2026) custava GPU e worker em toda tela o tempo todo.
- Teste: `tests/particulas*.test.ts*` continuam; novo caso: com `ambient=false` o motor não pede quadro.

### T2 Captura: parciais com teto — FEITO (2 s; 3 isolado / 2 leve / 1 sem isolamento; descartado devolve a cota)

- `src/gateway/capture/systemAudio.ts`: `PARTIAL_INTERVAL_MS` 1100 → 2000; contador `parciaisNestaFala`
  com teto (`MAX_PARCIAIS_POR_FALA = 2`); opção `maxParciaisPorFala?: () => number` no contrato.
- `src/lib/captura/pipelineDeFala.ts`: `INTERVALO_DOS_PARCIAIS_MS` 1100 → 2000; sem `crossOriginIsolated`
  (Safari, Firefox: WASM 1 thread) o teto é 1 parcial por fala (`maxParciaisPorFala`).
- Efeito: por fala de 6 s, de ~5 decodes parciais (1,1 s) para 2; o final e o especulativo ficam.
- Teste: `tests/systemAudio-parciais*.test.ts` (existente? senão novo): com fala contínua de 6 s, no máximo 2 parciais.

### T3 Captura: tradutor só no sentido em uso — FEITO (`paresDoTradutor`, conteúdo→você sem mic)

- `src/lib/captura/salvarSessao.ts:306`: `warmup` dos DOIS sentidos → só `[s, t]`; o sentido `[t, s]`
  aquece quando o microfone liga (`startMic`) ou no intérprete.
- Teste: `tests/salvarSessao*.test.ts`: sem mic, `mt.warmup` recebe um par.

### T4 Soltar os modelos mais cedo — FEITO (20 s)

- `src/lib/captura/memoriaDosModelos.ts`: `LIBERAR_MODELOS_APOS_MS` 90 000 → 20 000.
- Teste existente ajusta o número.

### T5 Medidores de nível a 10 Hz — FEITO

- `systemAudio.ts:437` e `fontesDeAudio.ts:550`: `setInterval(…, 50)` → 100 ms.

### T6 Benchmark da sonda fora da captura — FEITO (`agendarBenchmarkDoAparelho`, só após captura, cancelável)

- `src/lib/captura/pipelineDeFala.ts:1296-1306` (`agendarSondaDoAparelho` no Iniciar): a sonda roda, mas
  com `semBenchmark: true` enquanto a captura está ativa; o benchmark fica para o ocioso DEPOIS de encerrar.

### T7 Portão — revisão independente (opus) feita; crítico (sentido do tradutor) e importantes (cota de parcial descartado, benchmark cancelável) corrigidos; medição em `docs/auditoria/2026-10-22-carga-local.md`

- `npm run lint`, `npm run typecheck`, `npm test` (arquivos tocados), e2e `fim-da-captura` (estática) + `captura-no-celular`.
- Medição depois (mesmo script): repouso e captura, Chromium e WebKit; tabela em `docs/auditoria/2026-10-22-carga-local.md`.
- Revisão independente (`revisor-critico`).

## Fora do escopo (registrado)

- `backdrop-filter` nas barras (custo de compositor; já desligado no modo leve) — decisão visual do dono.
- Relógio da captura (1 re-render/s do LiveCapture) — barato perto dos modelos.
- Rastro do mouse: já é `off` de fábrica.
