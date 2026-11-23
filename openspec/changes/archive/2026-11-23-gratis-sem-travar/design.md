## Context

A Fase A foi feita em oito branches, todas fundidas na `perf/gratis-leve` e, dela, na `main` pelo merge `cd0aa88`:

- `perf/gratis-leve-tela` (`70bf865`);
- `perf/gratis-leve-motores` (`fcf2bbb`);
- `perf/a8-isolamento-servidor` (`68812cb`);
- `perf/a9a-nativo-primeiro` (`e79bc41`);
- `feat/a10-nuvem-de-alivio` (`7d16804`);
- `perf/a9b-bergamot-e-ort` (`4a1c650`);
- `perf/a0-bancada-desempenho` (`f252e5d`);
- `perf/a6b-primeira-legenda` (`a037514`, `d5fdc1f`).

O A0 veio depois de A1–A7: a bancada mediu o antes × depois com esses itens já prontos (relatório do A0, "Branch").
Este documento registra só as decisões que o código sozinho não explica.

## Decisions

### 1. Orçamento global de threads (A3)

- **A conta.** `núcleos − 1` threads vão para os motores em worker: um núcleo fica com a thread principal, onde
  moram a interface e o VAD. Whisper = `clamp(núcleos − 3, 1, 4)`, com teto 2 no modo leve; tradutor = 2 com
  ≥ 8 núcleos, senão 1; voz = 1. Sem `crossOriginIsolated` não há `SharedArrayBuffer`, e tudo fica em 1
  (`orcamentoDeThreads.ts`).
- **VAD com 1 thread e SIMD.** O Silero roda na thread principal, onde `Atomics.wait` é proibido. Com mais threads, a
  principal esperaria girando no lugar da interface.
- **`allow_spinning` ficou de fora.** No build com threads, o ORT-web usa o pool global (`DisablePerSessionThreads`),
  e a opção seria aceita e ignorada (`27d8bdf`).
- **Fora de `perfil.ts` de propósito.** O perfil entra no JS inicial; o orçamento só interessa a quem carrega modelo.

### 2. Regulador rápido que ignora a abertura do VAD (A6, A6b, A6c)

- **Gatilhos.**
  - `travamento`: ≥ 400 ms de bloqueio da thread principal numa janela de 10 s, medidos pelo LoAF, com `longtask`
    onde não há LoAF.
  - Caso grave: RTF > 1,5 com fila ≥ 1 desce já no 1º final.
  - Parcial: acima de 1,5 s conta como amostra lenta, contada à parte, sem mexer no RTF dos finais.
- **Aparelho leve.** Desce com 2 trechos e 6 s entre degraus; os outros aparelhos ficam com `CONFIG_PADRAO_DO_REGULADOR`
  intocado (`configDoReguladorPara`).
- **O que o vigia não conta.**
  - O quadro que **começa dentro** da abertura do VAD (`MicVAD.new`), marcado como a medida do User Timing
    `babel:abertura-do-vad`. Esse quadro é o V8 instanciando o `ort-wasm-simd-threaded.wasm` (12 MB): 883 ms com a
    CPU 4× mais lenta e 172 ms sem freio, e o LoAF não atribui script nenhum a ele (A6c).
  - Nada de antes do `reiniciar` da sessão.
  - Um travamento de verdade durante a sessão continua cortando os parciais.
- **Por que não tirar o VAD da thread principal agora.** Com `ort.env.wasm.proxy = true` o quadro some, mas o vad-web
  reusa o tensor `sr` a cada quadro e o proxy transfere o buffer: o 2º `run` falha com `DataCloneError`. Adiar só
  mudaria o congelamento de lugar, porque a captura precisa do VAD na hora. Fica como dívida (tarefa 3.4).
- **Modo desempenho automático × escolhido.** No aparelho leve o modo vem ligado de fábrica, sem virar preferência
  salva (`2d81e8d`).
  - O automático guarda um parcial por fala, quando ela já tem 1,5 s. Com 0,6 s de fala, o Moonshine devolvia `""`
    ou ". So." (A6b).
  - O modo que a pessoa liga cumpre a promessa da tela ("Legenda só no fim de cada frase").
  - Como foi escolhido, pela regra do A6b: vence a menor 1ª legenda entre as variantes com frames longos ≤ +20% e CPU
    na fala ≤ +25% do "sem parcial".

### 3. Memória: um modelo de cada vez (A7)

- **Carga junta ou em série.** STT e tradutor só carregam juntos no desktop com GPU e ≥ 8 GB; `deviceMemory` ausente
  conta como 8. Em qualquer outro aparelho, o tradutor espera o Whisper (`umModeloDeCadaVez`).
- **Dois tradutores no LRU.** O LRU guarda os dois sentidos da conversa, com o `dispose()` esperado ao despejar. O
  despejo acontece **antes** da próxima carga, então o pico é de 2, não de 3. Um pipe reservado por uma tradução nunca
  sai no meio do uso.
- **Liberar ao sair.** A captura solta os modelos 90 s depois de a pessoa sair; voltar antes cancela. O aparelho de
  pouca memória solta na hora. O heap do WASM só volta ao sistema com o `terminate()` do worker.

### 4. Isolamento de origem ligado de fábrica (A8)

- **Os dois caminhos no padrão.** COOP + COEP `credentialless` cobrem Chrome/Edge 96+ e Firefox 119+; o DIP cobre
  Chrome/Edge 137+ no desktop e 146+ no Android. Juntos, eles não se atrapalham. O Safari fica sem isolamento, como
  já ficava na edição estática.
- **`credentialless`, e não `require-corp`.** Os pesos chegam por `fetch` com CORS, e as imagens de capa e de hover
  de outros acervos chegam sem cookie em vez de serem bloqueadas por falta de CORP.
- **Valor desconhecido liga.** Um valor desconhecido cai no **padrão (ligado)**, com aviso no log: um erro de
  digitação não pode tirar as threads de todo mundo. Quem quer desligar escreve `0`.
- **O que foi conferido.** Login do Supabase, fatura do Asaas, popups da mesma origem, Turnstile e workers
  (cabeçalho de `server/http/isolamento.ts`). No app de pé, com Chromium 151: `crossOriginIsolated` `true`, e o
  orçamento dá whisper 4 / mt 2.

### 5. Bergamot servido do próprio domínio (A9b)

- **Por que o build baixa, e não o navegador.** O bucket da Mozilla só manda CORS para `localhost` (conferido em
  29/09/2026), e o R2 do dono ainda não está ativo.
  - O build baixa os três `.gz`, confere o sha256 fixado em `modelosDoBergamot.json` e grava em
    `public/modelos/bergamot/<par>/<execução>/`, fora do git.
  - O caminho leva o id da execução, então o cache é `immutable`.
- **Duas conferências.** O build confere o `.gz`. O worker confere o sha256 do conteúdo **descomprimido**, o que vale
  para qualquer transporte, inclusive um CDN (`VITE_BERGAMOT_MODELOS_URL`).
- **Sem rede, o build não quebra.** Ele sai com `__BERGAMOT_PT_EN__` falso e o app segue no opus-mt, sem prometer um
  download que não existe. `BERGAMOT_BAIXAR=0` nem baixa nem oferece.
- **O motor.** Vem do pacote instalado (MPL-2.0), conferido pelo hash. A cola do Emscripten vira módulo ES: o worker é
  módulo e a CSP não deixa `eval`.
- **Só pt→en.** Na bancada da Etapa 5 (`docs/auditoria/eval/bancada-2026-09-etapa5.md`), o pt→en ganhou (COMET
  +0,028 [0,020; 0,034], ~10× mais rápido). No en→pt, o Bergamot escreve português europeu e o gold de conversa cai
  (−0,021, com o IC cruzando 0). A regra é `bergamotVenceNoPar`.
- **A reserva.** Enquanto o Bergamot carrega, o opus-mt **não** baixa junto. Qualquer falha começa a carga do opus-mt.
  Soltar os modelos cancela a tradução em voo (`ChamadaCancelada`) sem cair no opus-mt.

### 6. Nuvem de alívio: o servidor é o limite, o cliente só oferece (A10)

- **Servidor.** Decide se a conta pode, a cada pedido com `x-nuvem-alivio: 1`. As travas, em ordem:
  1. flag;
  2. perfil protegido só com o responsável;
  3. franquia do mês, em segundos e em dólar;
  4. pool do dia (≤ 20% do orçamento diário) e reserva de 80% dos pagantes.
- **Cliente.** Decide se vale oferecer: aparelho leve, travamento ou GPU que não é real. Mentir aqui não dá nada a
  ninguém, porque o servidor confere tudo de novo.
- **Sem o cabeçalho, nada muda.** A conta Grátis recebe o 402 de sempre e ninguém gasta a franquia sem ter aceitado.
- **Nenhuma recusa vende.** Um 503 ou 403 pausa a nuvem no cliente. A franquia esgotada é o 402 `quota_exceeded` com
  `escopo: 'alivio'`, que o cliente mostra como o aviso **funcional** de fim de cota.
- **Contadores próprios.** A franquia tem contadores próprios em `usage_counters` (modo `alivio`), para não se
  misturar com a cota de um plano pago.

### 7. A bancada é um script, não um `.e2e.ts` (A0)

- **Por que script.** O plano previa `tests/e2e-estatica/desempenho-captura.e2e.ts`. Mas o config da edição estática
  roda todo `*.e2e.ts` com timeout de 180 s e na porta 4175, e a bancada precisa de ~12 min e de uma porta só dela.
- **O freio de CPU do CDP.** O freio gira um núcleo mesmo com a aba ociosa, e só freia a thread principal. A bancada
  o solta 2 s depois da última voz, antes da janela de silêncio. Por isso o perfil `fraco` mede a thread principal
  e o orçamento com 2 núcleos, não o RTF de um aparelho fraco.
- **Linha de base.** Cada ambiente tem a sua. A do `ci-ubuntu` sai do `workflow_dispatch`, e quem a aprova é quem
  commita o `slo-captura.json`: o workflow não escreve no repositório.

## Risks / Trade-offs

- **CPU alta depois da descida de modelo.** Em 3 das 12 rodadas do A0, o regulador trocou moonshine-base por
  moonshine-tiny logo depois do último final.
  - A aba ficou a 97–188% de um núcleo no silêncio, contra 15–25%, e o pico foi a 2,3–2,5 GB, contra 1,2–1,3 GB. O
    patamar dura até o fim da sessão.
  - A causa não foi investigada. Os candidatos são o pool de threads do ORT no worker novo e o worker antigo que não
    some.
  - O relatório recomenda investigar antes de dar o A6 por fechado (tarefa 6.5).
- **VAD na thread principal.** A abertura do VAD continua congelando a tela uma vez por sessão (~170 ms no desktop).
  O vigia só deixou de contá-la (tarefa 3.4).
- **Sem base de CI.** O `slo-captura.json` só tem `local-win32`, marcada como máquina compartilhada. Até a base do
  `ci-ubuntu` ser commitada, o job `desempenho` só relata e não reprova (tarefa 0.8).
- **Pressão da máquina inteira.** O regulador reage ao `PressureObserver('cpu')`, que mede a máquina toda. Na bancada,
  a carga de outras frentes produziu descidas de modelo que parecem regressão (A6c).
- **Prévia traduzida.** Ela custa ~1,2 s de worker por sessão no fraco. Decisão do dono (Pergunta 2 da proposta).
- **O opus-mt diz 100% cedo.** Ele marca 100% ~0,5 s antes de a sessão do ORT existir. O Bergamot foi corrigido
  (`f6dce4c`); o opus-mt ficou registrado fora do item (tarefa 9.17).
- **Heap do Bergamot.** O worker reserva 548 MB de heap depois do aquecimento. Falta medir no Quest e no celular
  (`1b43802`, tarefa 9.16).
- **Download no Quest.** O aviso de download no Quest soma 111 MB (Whisper base q8 + Bergamot), ainda acima do limite
  de 100 MB do perfil. Sem o Bergamot eram 193 MB (`ecfe66d`).
