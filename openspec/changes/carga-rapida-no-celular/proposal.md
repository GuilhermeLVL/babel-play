## Why

A auditoria de 17/11/2026 mediu a primeira impressão no celular, que é o público do produto, e ela é ruim em três tempos:

- **Abrir o app (LB-01, CONFIRMADO)**: `/app` em celular com 4G lento (Lighthouse com estrangulamento real, 1,6 Mbps, RTT
  150 ms, CPU 4×) tem LCP de 7,4 s, FCP de 3,1 s e nota 63. A home estática pinta em 1,76 s: quem clica em "abrir o app"
  sai de 1,8 s para mais de 7 s. O revisor corrigiu o diagnóstico. Na corrida com estrangulamento real, LiveCapture e Play
  nem aparecem; o que segura o LCP é a cascata `vendor-supabase` (termina em 5176 ms), o `servidor` em memória do modo
  visitante (4922 ms) e os chunks do Quest, do iChat e do `TrilhoDoQuest` (terminam em cerca de 7,0 a 7,1 s). Os "213
  scripts / 1,05 MB" vêm da corrida simulada, em que o `App.tsx` pré-carrega as telas depois.
- **Primeira legenda em rede lenta (CEL-03, CONFIRMADO)**: em Fast 3G, a 1ª legenda chega aos 549,6 s (cerca de 9 min) e a
  1ª tradução aos 578 s. A tela diz "Ouvindo… a legenda aparece aqui" aos 3:41 com o cartão "Transcrição (Whisper) 40/76 MB"
  sem citar o tradutor, enquanto a confirmação falou em 193 MB. 30 s depois do aceite ainda aparece "Pronto para
  legendar" com o botão desativado. O tradutor só começa a baixar por volta dos 540 s.
- **Download sem pergunta (CEL-04, CONFIRMADO)**: no celular só se confirma acima de 100 MB (`perfil.ts:204-208`), então
  90,7 MB saem do plano de dados sem pergunta. O Safari não expõe `navigator.connection`, e o iPhone nunca recebe o aviso
  de rede lenta.
- **Regressão do 1º texto (LB-02, PLAUSIVEL; LB-03, CONFIRMADO)**: na bancada, `primeiroTextoNaTelaMs` no desktop teve
  1067, 3100 e 3357 ms (mediana 3,1 s), contra cerca de 0,86 s no plano e 1,9 s no perfil fraco. O `slo-captura.json` não
  vigia essa métrica: o rótulo de `primeiraLegendaMs` ainda diz "1º texto", mas desde o commit d87ca02d ela mede a legenda
  completa (5,6 a 5,9 s), e só existe base `local-win32`.

Evidências (relativas a `reports/auditoria-qualidade/`): `linha-de-base/lighthouse-devtools/mobile-app-devtools.json` e
`resumo.txt`, `linha-de-base/lighthouse/mobile-app-2.json`, `linha-de-base/lighthouse-observado.txt`,
`linha-de-base/lighthouse-detalhe.json` (lcp-breakdown), `linha-de-base/orcamento-normal.txt`,
`linha-de-base/orcamento-estatica.txt`, `celular/runs/frio-3g-pixel7-ate-3-traducoes.log` e as fotos `04-aos-30s.png` e
`06-aos-300s.png` da pasta `celular/runs/frio-3g-pixel7-ate-3-traducoes/`, `celular/runs/frio-3g-iphone14-aeroporto.log`,
`celular/runs/frio-livre-pixel7-mercado/resultado.json`, `linha-de-base/bancada/saida/metricas/desktop.r1-3.json`,
`linha-de-base/bancada/saida/resultado.json`, `linha-de-base/bancada/slo-captura-mac.json`.

## What Changes

- **Entrada do `/app` enxuta**: o caminho crítico até o LCP do Início deixa de esperar o `vendor-supabase` (para o visitante
  sem sessão), o Quest (`TrilhoDoQuest`, `InicioDoQuest`, fora do Quest) e o iChat. Eles passam a carregar depois do LCP
  (`requestIdleCallback`) ou por intenção (toque/hover no item do menu, como `src/lib/polimento/precarga.ts` já faz). A
  pré-carga de LiveCapture e Play no `App.tsx` passa a ser por intenção e com rede boa. O `servidor` em memória do
  visitante é medido; se ficar no caminho crítico, o Início pinta o esqueleto real antes dele.
- **Progresso honesto do primeiro download**: as duas barras (transcrição e tradução) aparecem desde o aceite, com bytes,
  velocidade medida e tempo estimado. O estado "Pronto para legendar" some depois do aceite. Enquanto o reconhecimento
  não está pronto, a tela diz "Baixando: suas falas ficam guardadas (N trechos). A legenda começa em cerca de X min.", e
  não "Ouvindo…".
- **Saídas em rede lenta**: quando a estimativa passa de 2 min, a tela oferece começar só com a transcrição (o tradutor
  baixa depois), um modelo menor (whisper-tiny) e, onde existir sem baixar e for permitido ao perfil, a legenda do
  navegador. O tradutor baixa logo depois do STT (ou em paralelo com rede boa), nunca só depois da 1ª legenda.
- **Download sempre confirmado no celular**: no celular e no Quest, todo download acima de 20 MB pede confirmação com o
  tamanho real. Sem `navigator.connection`, a vazão é estimada pelos primeiros 256 KB e o aviso de rede lenta aparece
  também no iPhone.
- **1º texto de volta ao plano e vigiado**: investigar a fase do tique do 1º parcial no modo padrão do desktop, alinhar
  com o parcial único do perfil fraco, e pôr `primeiroTextoNaTelaMs` no `slo-captura.json` (com base `local-darwin`). O
  rótulo de `primeiraLegendaMs` vira "legenda completa".

## Capabilities

### New Capabilities

- `carga-inicial-do-app`: o que entra no caminho crítico do `/app` e as metas de LCP e de JS na entrada no celular.
- `primeira-legenda-honesta`: confirmação de download, progresso e estimativa honestos, saídas em rede lenta e a meta
  vigiada do 1º texto na tela.

### Modified Capabilities

(nenhuma)

## Impact

- Alterados: `src/App.tsx` (pré-cargas, Quest e iChat depois do LCP), `src/lib/supabase.ts` (import dinâmico para quem não
  tem sessão), `src/lib/polimento/precarga.ts`, `vite.config.ts` (`manualChunks` se preciso), `src/lib/dispositivo/perfil.ts`
  (limite de confirmação), um novo `src/lib/dispositivo/vazao.ts` (estimativa), `src/components/ModelPrepPanel.tsx`
  (duas barras e estimativa), `src/lib/captura/avisoDoPreparo.ts`, `src/lib/captura/pipelineDeFala.ts` (estado
  `baixando`, ordem STT → MT, tique do 1º parcial), `src/gateway/sttRouter.ts` (oferta do modelo menor),
  `scripts/perf/latencia-legenda/slo-captura.json` e `scripts/perf/slo.json` (metas novas).
- Sem servidor, sem migração.

## Prioridade, esforço, riscos e dono

- **Prioridade**: P1. A carga inicial e a confirmação de download afetam todo visitante do celular; o progresso honesto em
  3G evita a pior primeira impressão; o 1º texto é P2 (desktop, amostra pequena).
- **Esforço**: médio a grande (cerca de 5 a 7 dias). Entrada enxuta: 2. Progresso e saídas: 2. Confirmação e vazão: 0,5. 1º
  texto e SLO: 1 a 1,5.
- **Riscos**:
  - Tirar o supabase do caminho crítico pode atrasar quem tem sessão salva (o login precisa dele). Mitigação: import
    dinâmico só quando não há sessão no `localStorage`; com sessão, pré-carga com prioridade alta.
  - Mais confirmações no celular podem reduzir a conversão para a primeira legenda. Mitigação: o diálogo mostra o tamanho
    e a estimativa, e o "não perguntar de novo neste aparelho" vale para quem aceitou em Wi-Fi.
  - A estimativa de tempo pode errar em rede instável. Mitigação: média móvel de 10 s e faixa ("cerca de 3 a 5 min").
  - A bimodalidade do 1º texto pode ser a fase do tique, não um defeito. Mitigação: 6 ou mais rodadas antes de mudar.
- **Precisa do dono**:
  1. Aprovar a base `local-darwin` do `slo-captura.json` (a partir de `linha-de-base/bancada/slo-captura-mac.json`).
  2. Aprovar o limite de 20 MB para confirmar no celular, e o texto do diálogo (skill `copy-br-etica`).
  3. Decidir se a "legenda do navegador" (Web Speech, que envia o áudio ao fabricante) pode ser oferecida ao adulto em rede
     lenta. Para o perfil protegido, não.
