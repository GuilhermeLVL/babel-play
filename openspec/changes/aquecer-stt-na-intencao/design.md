## Context

- `preaquecerModelos({ aquecer? })` (`pipelineDeFala.ts:1695`) tem dois modos: `aquecer: false` só publica o previsto do selo
  (é o que a tela faz ao abrir desde 22/10/2026); o padrão também carrega o STT em cache e o tradutor do par.
- As guardas do modo padrão já cobrem o essencial: não faz nada com carga em voo (`prepareEmVooRef`) ou modelo pronto
  (`modelReadyRef`), nada na rota de nuvem, não aquece o Whisper quando o áudio da aba vai ao reconhecedor do navegador, só
  carrega o que `areModelsCached` confirma (sem download) e espera o STT antes do tradutor em aparelho de um modelo por vez.
- Ao sair da captura os workers são encerrados (`LiveCapture.tsx:928`, `liberarAoSairDaCaptura`): na hora em pouca memória,
  20 s depois no resto, e a volta cancela a liberação.
- O botão "Iniciar" (`data-testid="iniciar-captura"`) não tem handler de foco nem de ponteiro hoje.

## Decisions

1. **Reusar `preaquecerModelos()`**, sem lógica nova de carga. A mudança é só QUANDO chamar. Alternativa descartada: um
   segundo caminho de pré-carga (duplicaria as guardas e divergiria delas).
2. **Gatilhos**: foco ou ponteiro no "Iniciar" depois de 200 ms de permanência; e a confirmação em "Usar estes idiomas".
   O atraso evita carregar para quem só atravessa a tela com o mouse. Cancelar o temporizador se o foco/ponteiro sai antes
   dos 200 ms. Depois que a carga começa, não se cancela (não há como abortar o worker sem custo); quem se arrepende sai da
   tela e a liberação existente encerra os workers.
3. **Decisão pura no core** (`deveAquecerNaIntencao`): recebe o perfil do aparelho, modo leve, motor do navegador e o
   gatilho, devolve `{ aquecer: boolean, motivo }`. Regra inicial: pouca memória (Quest/celular) e modo leve → só a
   confirmação dos idiomas; Safari/WebKit e 6 GB → desligado até a medição do dono; desktop com ≥ 8 GB → os dois gatilhos.
   Os limites exatos saem da medição, não do palpite.
4. **Flag desligada** (mecanismo de flags já usado pelo app; nome a definir na implementação). Ligar é ato do dono depois de
   medir Safari e o aparelho de 6 GB. Sem flag, o comportamento é idêntico ao de hoje.
5. **Telemetria local**: contar `aquecimentoNaIntencao` (disparou/ignorou e o motivo) no log de captura que já existe, sem
   enviar nada ao servidor.

## Risks / Trade-offs

- **Memória no WebKit** (o motivo da correção G): se o aquecimento por intenção sobe ~320 MB em quem passa o mouse e sai, e a
  liberação ao sair demora 20 s, o pico se repete em escala menor. Mitigação: flag desligada, atraso de 200 ms,
  desligado no Safari até medir; critério de aceite exige 0 workers para quem só passa.
- **Hover não existe no toque**: no celular a antecipação é pequena; só a confirmação dos idiomas ajuda.
- **Corrida com "Iniciar"**: se o clique chega com a carga em voo, `prepareModelsInterno` já espera `prepareEmVooRef`; o ganho é
  parcial, nunca pior que hoje. Confirmar no teste.
- **Rota muda depois do aquecimento** (a pessoa troca o idioma): o modelo aquecido pode não ser o da rota nova; a preparação
  do clique recalcula a rota e carrega o certo. Custo: um aquecimento perdido; mitigado pela guarda de modelo pronto e pelo
  gatilho de idiomas vir DEPOIS da escolha.

## Open Questions

- O mouse costuma parar sobre "Iniciar" por quanto tempo antes do clique? Se for bem menos que 1 s, o ganho real fica abaixo
  de 0,9 s; medir com a bancada em cenário de intenção antes de prometer o número.
- No Safari do dono (6 GB), o pico de memória do aquecimento por intenção é aceitável? Medir com o Web Inspector.
