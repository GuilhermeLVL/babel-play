# SLOs iniciais do Babel Play (Fase 4 da prontidão, 25/09/2026)

Os números abaixo são **a fonte de verdade humana**; a fonte de máquina é
[`scripts/perf/suite/slo.json`](../scripts/perf/suite/slo.json), lida pela suíte de carga
(`scripts/perf/suite/rodar.mjs`), pela carga leve do CI (`scripts/perf/ci-carga.mjs`) e pelo orçamento do
bundle (`scripts/perf/orcamento-bundle.mjs`). **Mudar um limiar é mudar os dois arquivos no mesmo commit**,
com a justificativa. As medições que sustentam cada número estão em
`openspec/audits/2026-09-25-prontidao/fase4-carga.md`.

## Servidor (medido no servidor, por requisição)

| Classe                        | Rotas                                                                                                                    | SLO                                                                                                                                          | Por quê                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Leitura / navegação**       | `GET /api/settings`, `/api/sessions`, `/api/vocab` (com `If-None-Match`), `/api/metrics/profile`, `/api/vocab/para-jogo` | **p95 < 300 ms**, p99 < 1 s                                                                                                                  | a tela troca e o conteúdo tem que aparecer "na hora"; 300 ms de servidor deixam ~700 ms para rede móvel e render dentro do 1 s que o usuário percebe como imediato. Medido (r3): p95 5,7–34 ms de 10 a 1.000 VUs numa máquina local |
| **Gravação**                  | `POST /api/vocab/:id/review`, `/api/exercises/rodada`, `/api/metrics/seeds/gastar`, `/api/sessions`                      | **p95 < 800 ms**, p99 < 2 s                                                                                                                  | o cliente já mostrou o resultado (otimista); a gravação só não pode atrasar a próxima carta/rodada. Medido: p95 6,3–22 ms                                                                                                           |
| **Upload de áudio** (~200 KB) | `POST /api/sessions/:id/audio`                                                                                           | **p95 < 2 s**                                                                                                                                | acontece no fim da captura, com indicador de progresso. Medido: p95 5,1–49,5 ms                                                                                                                                                     |
| **IA ao vivo**                | `POST /api/ai/stt`, `/api/ai/mt`                                                                                         | **p95 < 100 ms SOBRE o provedor** (latência medida menos o que o provedor segurou; a recusa da admissão, 429 `nuvem_ocupada`, conta inteira) | a legenda ao vivo já paga ~400 ms (STT) e ~700 ms (MT) do provedor; o nosso lado — plano, admissão, cota, proxy — não pode dobrar isso. Medido: p95 16,4–18,9 ms                                                                    |
| **Erro**                      | todas                                                                                                                    | **< 0,5 %** das respostas (5xx, erro de socket, timeout, 4xx inesperado)                                                                     | 1 em 200 ações falhando é o máximo que ainda parece "instabilidade rara"; **quebra** = acima de 1 %.                                                                                                                                |

**Não é erro** (é a degradação desenhada, ADR 0007/0009): 429 `nuvem_ocupada` e 503 `provedor_em_disjuntor`
na IA (o cliente usa o motor local e volta sozinho), 429 `upload_ocupado` no semáforo de uploads. Esses
entram como **% de degradação**, acompanhada à parte.

**Ponto de quebra** de um nível de carga: p95 de qualquer classe acima do SLO **ou** erro > 1 %.

## Frontend

| Métrica                                                        | Orçamento                                             | Cobrado por                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| JS inicial (entrada + `modulepreload` do `index.html`), gzip 6 | **≤ `frontend.jsInicialGzipMaxKB`** (o medido + 10 %) | `orcamento-bundle.mjs`, job `carga` do CI                   |
| CSS inicial, gzip 6                                            | **≤ `frontend.cssInicialGzipMaxKB`**                  | idem                                                        |
| Arquivos só de desenvolvimento no `dist`                       | **nenhum** (`prototipo-*.html`, `lucide.min.js`)      | idem                                                        |
| LCP (p75 de campo)                                             | < 2,5 s (mobile) — meta "bom" do Core Web Vitals      | `scripts/perf/frontend.mjs` (manual: workflow `lighthouse`) |
| CLS                                                            | < 0,1                                                 | idem                                                        |
| INP                                                            | < 200 ms                                              | `scripts/perf/telas/medir-telas.mjs` (Event Timing por interação, celular médio, CPU 4×/6×) |

### Medido em 03/10/2026 (build de produção, `scripts/perf/frontend.mjs --execucoes=3`, Lighthouse 13)

Mediana de 3 execuções (a de celular em 4G lento simulado oscila: algumas falham no Chrome sem cabeçalho).
CLS do Lighthouse, antes -> depois das correções de salto de layout:

| Rota      | Celular: nota | Celular: LCP | Celular: TBT | Celular: CLS    | Desktop: nota | Desktop: LCP | Desktop: CLS    |
| --------- | ------------- | ------------ | ------------ | --------------- | ------------- | ------------ | --------------- |
| /         | 70 -> 73      | 5,5 -> 4,6 s | 223 -> 273 ms | 0 -> 0         | 94 -> 96      | 1,3 s        | 0,090 -> 0      |
| /capturar | 62 -> 62      | 10,4 s       | 185 -> 211 ms | 0 -> 0         | 87 -> 87      | 2,3 s        | 0 -> 0          |
| /jogar    | 45 -> 52      | 10,4 s       | 531 -> 597 ms | 0,163 -> 0     | 84 -> 86      | 2,3 s        | 0,098 -> 0      |
| /planos   | 64 -> 64      | 6,1 s        | 351 -> 347 ms | 0 -> 0         | 95 -> 95      | 1,4 s        | 0 -> 0          |

O LCP e a nota de celular seguem acima da meta (< 2,5 s): o custo é execução de JS (`vendor-react` e as telas
sob demanda) em CPU 4x mais lenta, não rede nem fonte. Sem número novo de campo (p75): continua sem dados de produção.

## O que os SLOs NÃO dizem

- **Capacidade.** Estar dentro do SLO numa máquina local não é estar dentro no Fly: a `shared-cpu-1x`
  sustenta 6,25 % de um núcleo. A tabela de capacidade (quantos usuários por máquina) está em
  `docs/escala.md` e no relatório da Fase 4.
- **Latência do provedor de IA.** É do provedor; o SLO de IA cobre só o nosso lado.
- **Janela e orçamento de erro.** Ainda não há dados de produção: quando houver (métricas da Fase 5), os
  SLOs viram objetivos de 28 dias com orçamento de erro e alerta de queima — até lá são limiares de teste.
