## Context

- **Entrada do app**: `src/App.tsx` declara as telas do menu com `import()` nomeado (linhas 14-25) e `lazyComRecarga` para o
  resto. `TrilhoDoQuest` e `InicioDoQuest` (linhas 68-69) e o `IChat` (linha 36) são lazy, mas entram na cascata da
  primeira pintura. `App.tsx:145` importa `authRequired` de `./lib/supabase` de forma estática, o que puxa o
  `vendor-supabase` (`vite.config.ts:218`) para o caminho crítico, inclusive do visitante sem conta. O modo visitante usa o
  `servidor` em memória (`src/data/efemero/servidor`, por `src/data/funil.ts:45`), carregado no boot. O orçamento de JS
  inicial (`scripts/perf/orcamento-bundle.mjs`) está em 176,1/180 KB gzip no build normal.
- **Lighthouse**: com estrangulamento real (`--throttling-method=devtools`), LCP de 7442 ms, 6823 ms dele em "element
  render delay", TTFB de 618 ms, 121 scripts e 555 KB transferidos. O elemento LCP é o texto do cartão "Legendar agora".
- **Download e confirmação**: `perfil.ts:204-208` confirma acima de 100 MB no celular e no Quest e acima de 300 MB no
  desktop; 0 MB só com `navigator.connection` lento ou economia de dados. O Safari não tem a API.
- **Primeiro download em 3G**: o STT baixa primeiro; o tradutor só começa depois (por volta dos 540 s); o cartão mostra só a
  transcrição. Os trechos ficam guardados (até 24) e o aviso "sua fala está sendo GUARDADA" aparece por pouco tempo e
  volta a "Ouvindo…".
- **1º texto**: `pipelineDeFala.ts` tem `INTERVALO_DOS_PARCIAIS_MS = 2000` e `PRIMEIRO_PARCIAL_DO_AUTOMATICO_MS = 1500`
  (linhas 129-161). O perfil fraco usa o parcial único do modo desempenho automático e mostra o 1º texto em cerca de 1,9 s.
  O desktop depende da fase do tique de 2 s: 1,07 s ou cerca de 3,1 s. O `slo-captura.json` só tem base `local-win32`, e
  `primeiroTextoNaTelaMs` (`metricas-captura.mjs:194-195`) não está nas métricas.

## Goals / Non-Goals

**Goals:**

- LCP do `/app` no celular (4G lento, estrangulamento real) de no máximo 2,5 s.
- JS na entrada do `/app` (até o LCP) de no máximo 300 KB transferidos no perfil mobile.
- Nenhum download acima de 20 MB sem confirmação no celular, inclusive no iPhone.
- Na rede lenta, a tela diz o que está acontecendo e quanto falta, e oferece um caminho mais curto.
- 1º texto no desktop com mediana de no máximo 1,2 s, vigiado pela bancada.

**Non-Goals:**

- Edição estática (LB-05): fica para um teto próprio no `slo.json`, fora desta change.
- Reescrever o `servidor` em memória do visitante.
- Reduzir o tamanho dos modelos (é a frente de modelos).

## Decisions

1. **Supabase fora do caminho crítico do visitante**: `authRequired`/`supabase` passam a ser importados por
   `import('./lib/supabase')` quando há sessão salva (chave do supabase no `localStorage`) ou quando a pessoa abre Login.
   Sem sessão, o Início pinta sem ele. Alternativa descartada: só mudar o `manualChunks` (não resolve: o import estático
   ainda o põe na cascata).
2. **Quest e iChat depois do LCP**: `TrilhoDoQuest`/`InicioDoQuest` só são importados quando `perfilDoDispositivo().tipo ===
'quest'`. O botão do iChat é renderizado depois do `requestIdleCallback` que segue o LCP (`PerformanceObserver` de
   `largest-contentful-paint`, com teto de 3 s).
3. **Pré-carga por intenção**: LiveCapture e Play deixam de ser pré-carregados no boot. Entram no
   `pointerenter`/`touchstart`/`focus` do item do menu ou do cartão "Legendar agora" (`precarga.ts`), e no ocioso só com
   `navigator.connection.effectiveType === '4g'` (sem a API, não pré-carrega).
4. **Orçamento cobrado**: `scripts/perf/slo.json` ganha a meta de JS transferido até o LCP do `/app` mobile (300 KB) e de
   LCP com estrangulamento real (2,5 s). `scripts/perf/frontend.mjs` passa a rodar o modo `--throttling-method=devtools`
   (consertando a quebra do modo `--url` relatada em LB-07). A CI cobra o orçamento de bundle; o Lighthouse com
   estrangulamento real fica no workflow de desempenho, que não bloqueia o PR.
5. **Confirmação e vazão**: `confirmarDownloadAcimaDeMb` passa a 20 no celular e no Quest. `vazao.ts` mede os primeiros 256
   KB de qualquer download de modelo (já passam pelo `fetch` de `transformersEnv.ts` e do Bergamot) e, sem
   `navigator.connection`, classifica a rede (lenta abaixo de 1,5 Mbps). Para a confirmação antes do clique, a estimativa
   usa a última vazão medida, guardada em `localStorage` por 24 h, ou a medição de um arquivo pequeno (o `config.json` do
   modelo) quando não há histórico.
6. **Progresso honesto**: o `ModelPrepPanel` mostra STT e tradutor desde o aceite (o tradutor pendente aparece "na fila"),
   com bytes e estimativa (média móvel de 10 s, arredondada em faixas). O estado da captura depois do aceite é
   `baixando` (nunca "Pronto para legendar" nem "Ouvindo…" sem modelo), e o texto inclui o número de trechos guardados.
   Ordem: o STT primeiro; o tradutor começa quando o STT termina ou em paralelo quando a vazão é de 5 Mbps ou mais, nunca
   esperando a 1ª legenda.
7. **Saídas em rede lenta**: com a estimativa acima de 2 min, um cartão oferece (a) "Começar só com a transcrição" (o
   tradutor baixa depois e as falas são traduzidas quando ele chegar), (b) "Usar um modelo menor" (whisper-tiny, com o
   aviso de qualidade) e (c) para o adulto com a decisão do dono, "Legenda do navegador" quando ela existir sem baixar
   (`legendaSemBaixar.ts`).
8. **1º texto**: rodar a bancada com 6 ou mais rodadas por perfil para confirmar a bimodalidade. A hipótese a testar: no
   desktop, o 1º parcial depende do tique de 2 s (`INTERVALO_DOS_PARCIAIS_MS`). A correção candidata é usar
   `PRIMEIRO_PARCIAL_DO_AUTOMATICO_MS` (1,5 s) ou um parcial disparado pelo VAD no início da fala também no modo padrão.
   `slo-captura.json` ganha `primeiroTextoNaTelaMs` (tolerância de 25% e folga de 500 ms) e a base `local-darwin`; o
   rótulo de `primeiraLegendaMs` vira "início da 1ª fala → legenda completa (ms)".

## Risks / Trade-offs

- [Login com sessão salva fica mais lento] → Com sessão, o import do supabase sai no boot com prioridade alta; medir o TTI
  do usuário logado antes e depois (no máximo +100 ms).
- [O LCP de 2,5 s pode não ser alcançável só com o JS, por causa do TTFB de 618 ms] → Medir depois das decisões 1 a 3. Se
  faltar, a próxima alavanca é o HTML do `/app` com o esqueleto do Início (sem JS) e o `103 Early Hints`. Fica registrado
  como etapa 2, fora desta change.
- [Pré-carga por intenção deixa a primeira abertura de Legendar mais lenta] → O toque no cartão "Legendar agora" já dispara
  a pré-carga; medir o tempo do toque à tela pronta (no máximo +300 ms em 4G).
- [Parcial mais cedo custa CPU no desktop] → A bancada mede frames longos junto; o SLO de `framesLongos` continua valendo.

## Migration Plan

Sem dado persistido além da vazão em cache (24 h). Entra por partes: entrada enxuta (medida em staging com Lighthouse),
depois confirmação e progresso, depois o 1º texto. Rollback por reverter cada parte.

## Open Questions

- (Dono) Base `local-darwin` no SLO.
- (Dono) Limite de 20 MB e texto do diálogo.
- (Dono) Oferecer a legenda do navegador ao adulto em rede lenta.
