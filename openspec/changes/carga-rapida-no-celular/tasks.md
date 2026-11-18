## 1. Linha de base reproduzível

- [x] 1.1 Consertar `scripts/perf/frontend.mjs` no modo `--url` (LB-07) e adicionar `--throttling-method=devtools` com 3 corridas e mediana. Verificar: `node scripts/perf/frontend.mjs --url=https://frasy.com.br --rotas=/,/app` termina e reproduz o LCP de cerca de 7,4 s.
- [x] 1.2 Script que lista os chunks pedidos antes do LCP (a partir do trace do Lighthouse). Verificar: a saída contra produção lista `vendor-supabase`, `servidor` e os chunks do Quest e do iChat.
  - Feito (17/11): `frontend.mjs` com `--throttling-method`, `--presets`, `--cobrar-app` e o 1º chunk procurado em
    `/app` (LB-07). Contra produção, mobile devtools: `/app` LCP mediano 7443 ms e 553 KB de JS até o LCP (reproduz
    a auditoria). `scripts/perf/chunks-antes-do-lcp.mjs` lista os pedidos até o LCP e marca `vendor-supabase`,
    `servidor`, `TrilhoDoQuest`, `InicioDoQuest` e `IChat` (os 5 aparecem contra produção).
    `scripts/perf/app-no-worker-local.mjs` serve o build local como o Worker (wrangler dev + Postgres em Docker +
    proxy HTTP/2 com brotli, como a borda) e roda o Lighthouse.

## 2. Entrada enxuta

- [x] 2.1 Supabase por `import()` quando não há sessão salva (`App.tsx:145`, `src/lib/supabase.ts`). Verificar: teste de unidade do carregador e o script 1.2 sem `vendor-supabase` para o visitante.
- [x] 2.2 Quest só no Quest e iChat depois do LCP (`App.tsx`). Verificar: o script 1.2 sem `TrilhoDoQuest`, `InicioDoQuest` e `IChat`; e2e do Quest emulado ainda mostra o trilho.
- [x] 2.3 Pré-carga de LiveCapture e Play por intenção (`precarga.ts`) e no ocioso só com 4G. Verificar: e2e mede o tempo do toque em "Legendar agora" à tela pronta (no máximo +300 ms em 4G).
- [x] 2.4 Medir o `servidor` em memória no caminho crítico; se segurar o LCP, pintar o esqueleto do Início antes dele. Verificar: lcp-breakdown com o "element render delay" abaixo de 1500 ms.
- [x] 2.5 Metas no `scripts/perf/slo.json` (LCP de 2,5 s e 300 KB até o LCP no `/app` mobile) e no workflow de desempenho. Verificar: Lighthouse no staging com mediana dentro das metas; TTI do usuário logado no máximo +100 ms.
  - Feito (17/11), com DESVIO do design: `TrilhoDoQuest`/`InicioDoQuest` são a casca e o Início de TODO aparelho (as
    telas novas), não só do Quest; o elemento do LCP mora no `InicioDoQuest`. Eles passaram a ser pedidos na carga
    do `App` (sem esperar sessão e configurações) e o Início ganhou o CSS do Quest junto (antes pintava sem ele).
    Só JS não alcança 2,5 s no 4G lento (3 levas de rede; a 2ª já termina em ~2,7 s), então entrou a "etapa 2" do
    design: o ESQUELETO do Início no HTML do `/app` (`scripts/vite/esqueletoDoInicio.ts`, só no modo público), para o
    visitante da 1ª visita no celular, com links de verdade, CSS em linha, a Inter em `font-display: block`, e a
    folha do app depois dele. Sai quando o Início tem a forma final (`lib/esqueleto.ts`). Supabase: o visitante sem
    sessão guardada não baixa o SDK (`lib/sessaoNoBoot.ts`); o login o pede. iChat, ofertas, partículas, recompensa,
    voz e SW depois do LCP e da tela pronta (`lib/polimento/depoisDoLcp.ts`). Pré-carga por palpite só com 4G
    declarado; o toque no cartão pede a tela. A Archivo saiu do preload.
    Medido (build local servido como o Worker, Lighthouse mobile devtools, mediana de 3): LCP 4695 → 2231 ms, FCP
    2814 → 1222 ms, nota 0,75 → 0,96, CLS 0,018 → 0; JS terminado antes do LCP 0,6 KB (o JS de entrada, ~150 KB br,
    começa antes e termina depois). Metas em `slo.json` → `frontend.appMobile`; `lighthouse.yml` ganhou o input
    `estrangulamento` (com `devtools` e URL, cobra a meta). Pendente: medir no staging e o TTI de quem tem sessão.

## 3. Confirmação e vazão

- [ ] 3.1 `perfil.ts`: confirmar acima de 20 MB no celular e no Quest. Verificar: teste da tabela de perfis.
- [ ] 3.2 `src/lib/dispositivo/vazao.ts`: medição dos primeiros 256 KB, cache de 24 h e classificação sem `navigator.connection`. Verificar: teste com `fetch` simulado lento e rápido.
- [ ] 3.3 Confirmação com o total somado (STT e tradução), aviso de rede lenta e estimativa. Verificar: rodadas `pixel7 mercado` (1 confirmação, 0 MB antes do aceite) e `iphone14 aeroporto --rede 3g` (aviso presente); texto revisado pela skill `copy-br-etica`.

## 4. Progresso e saídas

- [ ] 4.1 Estado `baixando` depois do aceite, sem "Pronto para legendar" nem "Ouvindo…", com trechos guardados e estimativa. Verificar: teste de componente e fotos de 30 s e 300 s da rodada em 3G.
- [ ] 4.2 `ModelPrepPanel` com as duas barras desde o aceite; o tradutor começa ao fim do STT (em paralelo com 5 Mbps ou mais). Verificar: log da rodada em 3G com o pedido do tradutor no máximo 5 s depois do fim do STT.
- [ ] 4.3 Cartão de rede lenta (estimativa acima de 2 min): "Começar só com a transcrição" e "Usar um modelo menor"; a legenda do navegador só para o adulto e com a decisão do dono. Verificar: rodadas em 3G com cada escolha (1ª legenda antes do tradutor; modelo menor em no máximo 50% de 549,6 s).

## 5. 1º texto na tela

- [ ] 5.1 Bancada com 6 rodadas por perfil para confirmar a bimodalidade. Verificar: `bancada-captura.mjs --perfis desktop,fraco --rodadas 6` e o relatório em `openspec/audits/`.
- [ ] 5.2 Corrigir o tique do 1º parcial no desktop (1º parcial em `PRIMEIRO_PARCIAL_DO_AUTOMATICO_MS` ou disparado pelo VAD). Verificar: mediana de no máximo 1200 ms e p90 de no máximo 1500 ms; `framesLongos` dentro do SLO.
- [ ] 5.3 `slo-captura.json`: métrica `primeiroTextoNaTelaMs`, rótulo "legenda completa" em `primeiraLegendaMs` e base `local-darwin` (com o aceite do dono). Verificar: a bancada com o parcial atrasado de propósito reprova.

## 6. Fechamento

- [ ] 6.1 `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e `node scripts/perf/orcamento-bundle.mjs` verdes.
