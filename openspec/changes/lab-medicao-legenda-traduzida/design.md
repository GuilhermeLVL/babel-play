## Context

- A bancada (`scripts/perf/latencia-legenda/`) abre o Chrome com microfone FALSO tocando um WAV
  (`--use-file-for-fake-audio-capture=<wav>%noloop`). `montar-audio.mjs` põe um bipe de 2 kHz (150 ms) depois de
  `silencioInicialS` (padrão 30 s) e as falas depois dele; o bipe é a âncora que converte o relógio do arquivo no
  `performance.now()` da página. `sonda.js` injeta um AudioWorklet (Goertzel a 2 kHz, janelas de 20 ms) que só se liga quando
  `window.__LAT_ARMADO` é verdadeiro e o app chama `getUserMedia`/`getDisplayMedia`. `analisar.mjs` e `metricas-captura.mjs`
  procuram a 1ª janela com razão a 2 kHz > 0,5 e RMS > 0,01; sem ela devolvem "bipe não encontrado na sonda de áudio".
- Marcas existentes (`src/gateway/marcasDeDesempenho.ts`): `stt:carga:inicio/fim` (`gateway/index.ts`), `mt:carga:inicio`,
  `mt:pronto`, `mt:pedido`, `mt:resposta` (opus-mt) e `mt:carga:inicio`, `mt:pronto` (Bergamot, sem pedido/resposta). Faltam:
  o fim da fala, a legenda traduzida na tela, e a separação download/compilação/aquecimento de cada modelo.
- Telemetria de campo existente: `telemetriaDeCaptura.ts` drena `captureMetrics` a cada 60 s e no "parar" para
  `POST /api/metricas/captura` (`v: 1`: `sttFinalMs`, `primeiroParcialMs`, `mtMs`, `rtf`, `motorStt`, `motorMt`), só com conta ou
  self-host, com "Métricas de uso anônimas" ligada e conta de menor não restrita. O servidor vira observação em histograma
  (`server/http/metricas.ts`: `captura_stt_final_ms`, `captura_primeiro_parcial_ms`, `captura_mt_ms`, `captura_rtf`, label
  `motor` saneado). No Worker não há backend de métricas: o lote é validado e descartado (ADR-003 da pesquisa).
- Linha de base atual (`slo-captura.json`, versão 1): por ambiente (`local-win32`, `local-darwin`, `ci-ubuntu`) e por perfil, com
  tolerância por métrica. `local-darwin` tem o 1º texto PROVISÓRIO (1 067 ms desktop, ~1 900 ms fraco simulado) e a
  "legenda completa" 5 580/5 881 ms medida desde o INÍCIO da 1ª fala, não desde o fim de cada fala.
- Perfis de aparelho: `src/lib/dispositivo/perfil.ts` (`quest`, `celular-fraco`, `celular-bom`, `desktop-sem-gpu`,
  `desktop-com-gpu`).
- Restrições do projeto: retenção zero, menores (ECA Digital/LGPD art. 14), Gemini proibido, planos e cotas só em
  `src/core/planos.ts`, flag nova nasce DESLIGADA (padrão de `voz_no_aparelho`: PG + SQLite + snapshots + journals +
  `docs/flags.md`).

## Diagnóstico do bipe ("bipe não encontrado")

NÃO é possível afirmar a causa só lendo o código: a falha aparece num Mac novo (Darwin 27, Chrome 156) e foi reproduzida no
commit anterior, então é do ambiente ou de uma hipótese antiga que nunca foi exercitada. O código mostra três candidatas, em
ordem de probabilidade, cada uma com um teste que a separa das outras:

1. **O bipe passou antes da sonda ligar (`%noloop`).** O Chromium começa a ler o arquivo quando o dispositivo falso abre, não
   quando a página arma a sonda. Se qualquer `getUserMedia` anterior abrir o dispositivo (aquecimento na intenção de capturar,
   commit `5e7f819a`; sonda de permissão; foco em "Iniciar" por `--intencao`), o relógio do arquivo corre sem a sonda e, com
   `noloop`, o bipe não se repete. Sinal: `sonda:ok` aparece, a lista `aud` tem janelas, mas todas com ratio ~0 e RMS baixo
   depois dos 30 s; ou `gum` registrado antes de `__LAT_ARMADO`.
2. **A sonda nunca rodou.** O `AudioContext` pode ficar `suspended` ou o `addModule` do worklet falhar sob a política de áudio
   do Chrome 156 no macOS novo (a flag `--autoplay-policy` está passada, mas o contexto é criado fora do gesto). Sinal: não há
   `sonda:ok`, há `sonda:erro`, ou `aud` vazio.
3. **O arquivo não está sendo tocado.** Se o Chromium rejeitar o WAV (caminho, formato) ele cai no tom de teste padrão do
   dispositivo falso, que não é 2 kHz. Sinal: `aud` tem energia, mas o ratio a 2 kHz nunca passa de 0,5.

A rodada inválida hoje reporta só "bipe não encontrado" para as três. A correção começa por dar a cada uma um motivo próprio
(tarefa 1.1) e só depois escolhe o conserto; se a hipótese 1 se confirmar, a saída é armar a sonda antes de qualquer abertura do
dispositivo e/ou tocar o arquivo em loop e ancorar no ÚLTIMO bipe; se for a 2, criar o contexto no gesto e esperar `running`;
se for a 3, validar o WAV (cabeçalho PCM) e o caminho antes do lançamento e abortar com o motivo.

## Decisions

### D1. Definição da métrica principal

`fimDaFalaAteLegendaMs` por fala = `t_legenda − t_fim`, em ms de `performance.now()` da mesma aba (monotônico, sem relógio de
servidor).

- **Início `t_fim`**: o instante do ÚLTIMO quadro classificado como voz pelo VAD antes do silêncio que encerrou a fala
  (marca `frasy:fala:fim`, com `{ id }` do balão). NÃO é o instante em que o VAD ou o detector de fim de turno decidiu que
  acabou: a espera de redenção (800 ms) e do detector é tempo que a pessoa espera, e tem de contar.
- **Fim `t_legenda`**: o primeiro quadro pintado (`requestAnimationFrame` depois do commit do React) em que o balão `id` mostra a
  tradução FINAL da fala (marca `frasy:legenda:traduzida`, com `{ id, origem }`; `origem` ∈ `memoria|dicionario|nativo|local|nuvem`).
  É o mesmo critério da sonda de DOM da bancada (`tf` do `MutationObserver` + rAF).
- **Fala sem tradução** (idioma de origem = destino, "Tradução" por pedido, M0 pular): não entra no percentil; entra na contagem
  `semTraducao`. Fala cuja tradução veio de cache, dicionário ou memória ENTRA (é o que a pessoa vê).
- **Parciais**: nunca definem o fim. O 1º texto parcial (`primeiroTextoNaTelaMs`, já medido) continua uma métrica à parte; um
  parcial traduzido na tela não encerra a medida, só a tradução final encerra. Se o final traduzido for idêntico ao parcial já
  na tela, o fim é o quadro em que o balão passa a final.
- **Falhas** (tradução com erro, tempo esgotado de 12 s, fala descartada pelo filtro de alucinação): fora do percentil, em
  `falhas` (contagem) e na `taxaDeFalha`. O laboratório SEMPRE publica o p75 e a taxa de falha juntos; um A/B é decidido pelos
  dois (uma variante "mais rápida" que falha mais não ganha).
- **Dimensões**: classe do aparelho (os 5 perfis), idioma de ORIGEM da fala (`pt|en|es|outro`) e, na bancada, o par de idiomas.
  Percentis: p50, p75, p95.

### D2. Instrumentação: marcas `frasy:*` com `{ id }`, sem texto

`marcar()` continua a porta única. Marcas novas: `fala:fim`, `legenda:traduzida`, `modelo:download:{inicio,fim}`,
`modelo:compilacao:{inicio,fim}`, `modelo:aquecimento:{inicio,fim}`, todas com `{ modelo, id? }`, onde `modelo` é o id do
registro de motores (lista fechada) e `id` é o id do balão (`mic-3`, `sys-7`), local à aba e nunca enviado. Nenhuma marca leva
texto. As marcas de campo viram números em `captureMetrics` (que já guarda `etapasPorFala` com teto de 200); a linha do
tempo do `performance` é limpa (`performance.clearMarks`) depois de consumida, para não crescer numa sessão longa. Na bancada,
as mesmas marcas são lidas do `performance.getEntriesByType('mark')`, sem canal novo.

### D3. Campo: agregação no cliente em baldes fixos, histograma no servidor

Alternativas:

- **A. Rota nova (`/api/rum/legenda`).** Contrato isolado, mas duplica validação, limite de taxa e porta de consentimento, e
  cria dois interruptores para a mesma promessa ("Métricas de uso anônimas"). Descartada.
- **B. Contrato `v: 2` em `/api/metricas/captura` (escolhida, ADR-003 da pesquisa).** Reaproveita a porta de consentimento, a rota
  anônima antes do auth, o saneamento e o envio. O `v: 1` segue válido.
- **C. Enviar cada fala (latência bruta).** Mais flexível para análise, mas uma série temporal por sessão é mais perto de dado
  pessoal e cresce com o uso. Descartada: o cliente soma em baldes e manda só contagens por balde.
- **D. Só bancada, sem campo.** É o recuo se o parecer exigir consentimento do responsável para menores; a change funciona sem
  campo (Lote 0 inteiro menos a tarefa 5).

Contrato `v: 2` (adiciona ao `v: 1`): `{ classe, idioma, fimDaFalaAteLegenda: { baldes: number[], n, falhas, semTraducao }, carga: [{ modelo, fase, baldes }] }`.
`classe` ∈ 5 perfis; `idioma` ∈ `pt|en|es|outro`; `modelo` ∈ registro de motores ou `outro`; `fase` ∈
`download|compilacao|aquecimento`; baldes fixos em ms (250, 500, 1000, 1500, 2000, 3000, 5000, 10000, ∞) e `n` ≤ 200 por lote. O
p75 global sai da soma dos baldes no servidor; NÃO se manda p75 por sessão porque a média de p75 não é o p75 (a pesquisa
registra isso). O servidor valida cada campo contra a lista fechada, grampeia contagens e responde 204 como hoje.
O envio herda a porta `podeEnviar()` (consentimento, conta ou self-host, menor não restrito) E exige perfil NÃO protegido
(ver D6).

Servidor: `captura_fim_da_fala_ate_legenda_ms{classe,idioma}` e `captura_carga_modelo_ms{classe,modelo,fase}`, histogramas
Prometheus. Cardinalidade máxima: 5 × 4 = 20 séries na primeira e 5 × (≤ 12) × 3 = 180 na segunda, cada uma × baldes. No Worker, o
destino é o Analytics Engine (família `captura_latencia`); isso só se faz depois de verificar o binding (a pesquisa o marca como
"não verificado"). Se não existir, o lote segue validado e descartado no Worker e o campo só aparece em Express/self-host; a
consequência fica registrada, sem inventar infraestrutura.

### D4. Amostragem

Sem amostragem por padrão: o custo de contar falas em baldes é desprezível e p95 por classe pede volume. A flag guarda
`payload.amostragem` (0 a 1, padrão 1) decidida no INÍCIO da captura por sorteio local, sem persistir o resultado nem o
identificador, para permitir reduzir o volume sem novo deploy. Alternativa descartada: amostrar por conta (exigiria id estável).

### D5. Linha de base oficial = o que a bancada medir, com origem

A métrica entra em `slo-captura.json` como `fimDaFalaAteLegendaMs.p50/.p75/.p95` por ambiente e perfil, com
`sentido: "menor"`, tolerância e folga como as outras, e um campo `origem` por perfil (`medido` | `emulado`) mais `aparelho`,
`commit` e `data`. Substitui o número provisório do `local-darwin` só depois de uma rodada VÁLIDA. A base fica no mesmo arquivo
e na mesma ferramenta (`comparar.mjs`) para o workflow `desempenho` continuar funcionando; o relatório da rodada vai para
`docs/auditoria/` (D7).

### D6. Privacidade e menores

- O evento só tem tempos em baldes, classe de aparelho (lista de 5), idioma-base e id de motor da lista fechada. Nenhum texto,
  áudio, id de conta, id de sessão, id de balão, `User-Agent` guardado, IP guardado, hora exata ou memória do aparelho.
- Retenção zero: o servidor só incrementa histogramas em memória; nada é gravado em banco ou log.
- Perfil protegido (menor ou idade não declarada): fora do campo. O parecer do dono pode ampliar isso numa change futura; o
  contrário (ligar para menores por padrão) exigiria o parecer afirmar que não é preciso consentimento do responsável. Padrão
  seguro: bancada sim, campo de menores não.
- A flag `rum_latencia` nasce desligada e, mesmo ligada, a porta `podeEnviar()` continua mandando.
- Ligar em produção é tarefa bloqueante do dono (parecer: LGPD art. 14, ECA Digital, política de privacidade vigente).

### D7. Onde os resultados ficam

- Relatório de cada rodada ou A/B: `docs/auditoria/AAAA-MM-DD-<assunto>.md` (formato dos relatórios existentes), com comando,
  commit, aparelho, origem `medido`/`emulado`, N, tabela e decisão.
- Dados brutos (JSON de `medir.mjs`): `scripts/perf/latencia-legenda/resultados/AAAA-MM-DD/<rotulo>.json`, versionados quando
  forem a base de uma decisão; o que for só exploração fica fora do git.
- Linha de base: `slo-captura.json` (D5).

## Protocolo do laboratório

1. **Pergunta e critério ANTES.** Cada A/B começa por um arquivo `criterio.md` (ou a seção "Critério" do relatório) commitado
   ANTES da primeira rodada, com: hipótese, métrica primária (`fimDaFalaAteLegendaMs` p75 por classe), guardas (taxa de falha,
   WER e qualidade da bancada própria, memória de pico, frames longos), o efeito mínimo que vale a mudança (ex.: p75 ≥ 20% menor)
   e a regra de decisão. Não se muda o critério depois de ver o número.
2. **Mesmas falas, mesmo aparelho.** O áudio é o fixture versionado (`montar-audio.mjs`, FLEURS público; nunca áudio de usuário),
   o mesmo roteiro e o mesmo aparelho para A e B, com os modelos já em cache (`--cache-modelos`) salvo quando a carga é o objeto.
3. **N repetições intercaladas.** Mínimo de 10 rodadas por variante em ordem ABAB (`intercalar.mjs`) para cancelar a deriva
   térmica e de fundo; a primeira rodada de cada variante é de aquecimento e descartada. Rodada inválida (sem âncora, aba caída)
   é refeita, nunca preenchida.
4. **Estatística pareada.** O par é a MESMA fala em A e em B (diferença por fala, mediana entre rodadas). `ab.mjs` calcula a
   diferença de p50/p75/p95 com IC 95% por bootstrap sobre as falas (10 000 reamostragens, semente fixa). A regra é a da bancada
   de qualidade: A "ganha" só se o IC exclui 0 NO SENTIDO esperado e o efeito mínimo do critério é atingido; se o IC cruza 0, o
   resultado é "sem diferença provada" e a mudança não é aprovada por latência.
5. **Guardas.** Nenhuma guarda do critério pode piorar além da tolerância de `slo-captura.json`.
6. **Registro.** Relatório em `docs/auditoria/` (D7); se for a nova base, `comparar.mjs --gravar-linha-de-base` e o aceite do dono.
7. **Matriz de aparelhos.** Linhas: Android de entrada (~4 GB), iPhone ≥ 12, Quest 3, e as classes de desktop; colunas: classe de
   `perfil.ts`, aparelho, navegador, `origem`. Enquanto o aparelho real não existir, o perfil roda emulado (CPU limitada, memória
   limitada, `_dispositivos.mjs`) e TODO resultado sai marcado "emulado": serve para achar regressões e ordenar opções, NUNCA para
   aprovar ganho de celular, Quest ou iPhone nem para fechar a meta de 2,0 s. Meta de celular só se declara cumprida com origem
   `medido`.

## Risks / Trade-offs

- **Diagnóstico pode revelar problema maior** (ex.: o Chrome 156 no macOS 27 não toca o arquivo falso). Mitigação: tarefa 1.1 é
  só diagnóstico; o conserto é decidido com a evidência; se a bancada não puder rodar neste Mac, usa-se o outro ambiente
  (`local-win32`, `ci-ubuntu`) e a base do Mac fica "provisória" explicitamente.
- **Proxy de campo ≠ verdade da bancada.** O `t_fim` do campo vem do VAD, o da bancada vem do arquivo (bipe). A tarefa 3.4 mede o
  erro; se passar de 50 ms, o campo mede "VAD → tela" e o relatório diz isso, sem misturar as duas séries.
- **Overhead.** Metas: custo de cada marca ≤ 0,2 ms p95 na thread principal; a métrica da bancada com as marcas ≤ 5 ms acima
  da mesma bancada sem elas (diferença pareada, IC 95%); `framesLongos` e CPU no silêncio dentro das tolerâncias de
  `slo-captura.json`; memória retida da instrumentação ≤ 50 KB por sessão (teto de 200 falas, marcas limpas depois de lidas).
- **Cardinalidade** (rótulos vindos do cliente): só listas fechadas; fora da lista vira `outro`. Os testes provam que um valor
  inventado não cria série.
- **Reidentificação por combinação.** Classe × idioma × motor são poucos valores, e o servidor não guarda nada nem a hora; mesmo
  assim o parecer do dono é quem decide, não esta change.
- **Worker sem backend de métricas.** O campo só chega ao painel onde há Prometheus ou depois de verificar o Analytics Engine.
- **Medir pode virar meta.** O p75 só vale com a taxa de falha ao lado (D1) e as guardas do critério.
- **Aparelho real demora.** A matriz admite "emulado" para não travar o ciclo, ao custo de não fechar a meta de celular até
  existir aparelho.

## Open Questions

- O Analytics Engine está ligado no Worker de produção? (verificar antes da tarefa 5.5)
- O parecer vai aceitar campo para contas de menor com o responsável, ou só adultos?
- Quem empresta ou compra os aparelhos reais e em que data? (ato do dono; sem data, a matriz fica emulada)
