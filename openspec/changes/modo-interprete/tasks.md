> Plano aprovado: `functional-doodling-crane` (Fase E). **Change retroativa.**
>
> - E1, E2, E4 e E5 estão na `main`. Entraram pelo merge `b563485` (`feat/e-interprete-motor`) dentro de
>   `cd0aa88` (`perf/gratis-leve`).
> - E3 e E6 estão no PR #47 (`claude/magical-curie-7zdnfs`), aberto e não mesclado.
>
> `[x]` = na `main`, com o commit principal e o teste. `[ ]` com "(PR #47, aguardando merge)" = escrito,
> mas fora da `main`. `[ ]` sem nota = pendente.

## E1: fila de fala e guarda de eco

- [x] 1.1 `src/lib/voz/filaDeFala.ts` (`ddb75c5`; teste: `tests/filaDeFala.test.ts`).
  - FIFO de no máximo 3 itens. O quarto derruba o mais velho da espera, nunca o que fala.
  - Mais de 20 s desde o `criadoEm` não é lido.
  - `interromper`, `repetir` e `parar`. O Repetir não conta na métrica.
  - O motor é lido a cada item.
  - Prazos: 8 s para começar e `prazoDaFalaMs` para terminar.
- [x] 1.2 `marcarFalaExterna` e `cortarCaudaDoEco` em `src/lib/tts.ts` (`ddb75c5`; teste:
      `tests/tts-fala-externa.test.ts`).
  - O `cancel()` do nativo não apaga a fala externa.
  - O corte não encurta a cauda de uma fala que termina depois dele.
- [x] 1.3 Métrica `tts_inicio` por motor em `src/lib/voz/tempoAteAVoz.ts` (`ca58ed8`; teste:
      `tests/ttsInicio-metrica.test.ts`).
  - Fica fora do JS inicial e fora do lote da telemetria.
  - Sem amostra, o resumo é `null`.

## E2: direção pelo lado e máquina de estados

- [x] 2.1 Gancho `aoTraduzirFinal` em `src/lib/captura/traducaoDaFala.ts` (`cc1816c`; teste:
      `tests/traducaoDaFala-aoTraduzirFinal.test.ts`).
  - Só avisa os finais, uma vez por fala: `traduzida` sem o "≈", ou `sem-traducao`.
- [x] 2.2 Máquina de estados pura `src/lib/captura/interprete.ts` (`2fadba7`; teste:
      `tests/interprete.test.ts`).
  - Barge-in, troca de lado, "terminei" (tocar o mesmo lado), Repetir, Parar voz, trocar os lados e sair.
  - `criarInterprete` muda o estado antes de executar os efeitos.
- [x] 2.3 A direção pelo lado no pipeline e nas fontes (`2fadba7`; teste: `tests/interprete-direcao.test.ts`).
  - O pipeline usa `direcaoDoMicrofone` e `aoFimDaFala`.
  - A Web Speech abre e reinicia no idioma do lado. Fechar encerra a sessão, sem religar sozinha.
  - Com o Whisper, trocar de lado só tira o mudo.

## E3: a tela

- [ ] 3.1 `scenario` no `meta` da sessão (PR #47, aguardando merge) (`03ff425`; teste:
      `tests/cenarioDaSessao.test.ts`).
  - `PATCH /api/sessions/:id/meta` aceita só os cenários conhecidos, no Express e no servidor sem conta.
  - `sessionToRecording` lê o `cenario`.
- [ ] 3.2 `src/lib/captura/controleDoInterprete.ts` (PR #47, aguardando merge) (`bb1acf4`; teste:
      `tests/controleDoInterprete.test.ts`).
  - O toque destrava a voz e abre o microfone dentro do gesto.
  - A tradução que chega antes do fim da fala espera o `fimDaFala`.
  - A voz sai no idioma de quem ouve.
  - A fila vazia vira `fimDaVoz`.
  - O microfone que falha ao abrir volta a `parado`.
- [ ] 3.3 A tela `ModoInterprete.tsx` e `modoInterprete.css` (PR #47, aguardando merge) (`e563dad`; teste:
      `tests/modoInterprete.test.tsx`).
  - No celular, a metade do outro fica virada 180° (`data-virada`).
  - No computador, a tela tem duas colunas e os atalhos `1`, `2`, `R`, `P` e `Esc`.
  - O controle é criado no efeito.
- [ ] 3.4 A sessão do intérprete (PR #47, aguardando merge) (`f29250c`; testes:
      `tests/salvarSessaoInterprete.test.ts` e uma asserção nova em `tests/interprete-direcao.test.ts`).
  - O microfone só abre no toque. O som do computador e a identificação de voz ficam de fora.
  - "Continuar gravando" não reabre o microfone.
  - Cada lado é salvo no idioma dele.
- [ ] 3.5 As entradas (PR #47, aguardando merge) (`c9b4fe2`; sem teste unitário próprio, coberto pelo e2e
      `3e6c9ad`).
  - Um botão "Intérprete" na `CapturaNoCelular` e no cabeçalho da captura do computador. Ele passa pela
    folha do início.
  - A tradução é sempre automática no intérprete.
  - A voz natural só vale com `vozNatural` e a flag `voz_natural` ligada.
  - Sair abre o Encerrar, e "Continuar gravando" devolve a tela.
- [ ] 3.6 "Ouvir tradução" na `FolhaDaFrase`, no idioma da tradução (PR #47, aguardando merge) (`d63514b`;
      teste: `tests/folhaDaFraseOuvirTraducao.test.tsx`).

## E4: `POST /api/ai/tts`

- [x] 4.1 A rota e a ordem das recusas (`f23f628`; testes: `tests/integration/tts.test.ts` e
      `tests/caracterizacao/ia.test.ts`).
  - Clonagem: 400. Corpo inválido: 400.
  - Sem `vozNatural`: 402 `exige_voz_natural`.
  - Flag desligada: 503 `voz_natural_desligada`.
  - Sem voz configurada: 501 `voz_nao_configurada`. Sem voz no idioma: 422 `idioma_sem_voz_natural`.
  - Depois vêm o cache L1, o portão, a admissão `tts`, a cota, a cascata e o custo.
- [x] 4.2 O catálogo de voz em `server/ai/provedoresDeVoz.ts` (`f23f628`; testes:
      `tests/provedoresDeVoz.test.ts` e o bloco "sem clonagem de voz" de `tests/integration/tts.test.ts`).
  - O padrão é o Chatterbox Multilingual (DeepInfra). Qwen3-TTS e Chirp 3 HD são opções.
  - Não há clonagem: as chaves são permitidas por lista, a conferência roda antes do envio e a rota recusa.
- [x] 4.3 Cotas de caracteres no mês e no dia local (`f23f628`; teste: bloco "as cotas de caracteres" de
      `tests/integration/tts.test.ts`).
  - O mês acabou: 402 `quota_exceeded`. O dia acabou: 429 `uso_justo_do_dia`, e o mês é devolvido.
  - A fala que não foi entregue devolve os caracteres.
  - O cache não gasta cota.
- [x] 4.4 O menor segue as regras de toda rota de nuvem (`f23f628`; teste: `tests/integration/tts-menor.test.ts`).
- [x] 4.5 A migração 0046 cria a flag `voz_natural` desligada, com `planos: ["premium","selfhost"]`
      (`f23f628`; teste: "a flag nasce DESLIGADA na migração 0046", em `tests/integration/tts.test.ts`).
- [x] 4.6 Operador e ROPA registrados com a retenção "a confirmar" (`f23f628`, `c6cb926`; documentação, sem
      teste).
  - Em `docs/lgpd/operadores.md`: as linhas DeepInfra e Google Cloud TTS.
  - Em `docs/lgpd/ropa.csv`: a T13.
- [x] 4.7 `POST /api/ai/tts` em `tests/contratos/api-contrato.json` (`f23f628`).
- [x] 4.8 O núcleo `server/ai/nucleo/sintetizarVoz.ts`, sem Express (`9f3ca7f`, da Fase F; teste: bloco
      `sintetizarVoz` de `tests/integration/nucleo-de-ia.test.ts`).

## E5: voz da nuvem no cliente

- [x] 5.1 `src/lib/voz/vozDaNuvem.ts` (`b7d1515`; teste: `tests/vozDaNuvem.test.ts`).
  - Se falhar antes de o áudio começar, a voz do aparelho lê a mesma fala com os mesmos callbacks: 402,
    503, 429, 500, 502, 501, rede, timeout de 6 s ou autoplay bloqueado.
  - Depois que o áudio começou, um erro chega a quem chamou, sem reler.
- [x] 5.2 A nuvem não insiste (`b7d1515`; teste: bloco "a pausa da nuvem depois da recusa").
  - 402 pausa a nuvem pela sessão.
  - 429 pausa pelo `Retry-After`.
  - 5xx vale só para o item.
  - Só no código (`lerRecusa`), sem caso de teste próprio de pausa:
    - 501 e 503 `voz_natural_desligada` também pausam pela sessão (o teste se chama "402/503", mas só
      exercita o 402);
    - o 503 do portão pausa pelo `Retry-After`, 60 s por padrão;
    - o 422 pausa só aquele idioma.
- [x] 5.3 Guarda de eco enquanto o áudio toca, Repetir sem novo pedido e `motorDaUltimaFala()` (`b7d1515`;
      teste: `tests/vozDaNuvem.test.ts`).
  - `destravarVozDaNuvem()` não tem teste direto. O controle do PR #47 testa que o toque o chama.

## E6: e2e

- [ ] 6.1 `tests/e2e/modo-interprete.e2e.ts` (PR #47, aguardando merge) (`3e6c9ad`).
  - Celular (Pixel 7, projeto `mobile-375`, Grátis, voz do aparelho): cada lado ouve a tradução no seu
    idioma, e sair abre o Encerrar.
  - Computador (projeto `desktop-1280`, Premium, `/api/ai/tts` simulado): duas colunas e atalhos; a voz
    natural lê as duas traduções; a métrica fica em `p50 ≤ 2_500` ms. O PR relata 126 ms no p50, com a
    nuvem simulada.

## E8: os dois lados e a porta própria (relato do dono, 30/09)

O dono testou em produção: o português funcionou; tocando o outro lado e falando inglês, nada aconteceu.

- [x] 8.1 O motor do microfone decidido para os dois idiomas (`idiomasDaConversa`): `sonda.ts`,
      `motorDoMicrofone.ts` (`langs`), `fontesDeAudio.ts` (o modo guardado só vale para os idiomas que
      conferiu). Teste: `tests/interprete-dois-lados.test.ts`.
- [x] 8.2 O tradutor nos dois sentidos ao abrir (`prepararTradutorDaFala`, `abrirOInterprete`), e a folha
      do início conta a ida e a volta.
- [x] 8.3 A falha tardia do microfone não encerra a sessão; o lado volta a "parado"
      (`microfoneFalhou`). Teste: `tests/controleDoInterprete.test.ts`.
- [x] 8.4 O preparo na faixa do meio (`avisoDoPreparo.ts`). Teste: `tests/avisoDoPreparo.test.ts`.
- [x] 8.5 O item "Intérprete" no menu, `/interprete` e a tela `PaginaDoInterprete`; na barra do celular,
      no lugar da Biblioteca. Testes: `tests/navDoInterprete.test.ts` e o e2e "pelo menu".
- [ ] 8.6 Conferir no aparelho do dono (Chrome com e sem o pacote de voz do inglês). O e2e não cobre: sob
      automação a sonda não pergunta ao navegador.

## E7: modo Automático (decisão do dono, 30/09: só no Premium, e é o padrão dele)

- [x] 7.1 A regra pura (`src/lib/captura/interpreteAutomatico.ts`): o idioma medido pelo motor, o do
      detector de texto quando o do motor não é um dos dois, o terceiro idioma só com evidência forte, e
      a alternância quando não há evidência. Teste: `tests/interpreteAutomatico.test.ts`.
- [x] 7.2 A máquina (`interprete.ts`): `ouvir`/`parar`, o microfone sem lado, e o ciclo que reabre o
      microfone depois da voz. Teste: `tests/interprete.test.ts`.
- [x] 7.3 O controle (`controleDoInterprete.ts`): `ouvir`, `parar`, `automatico`, `ladoDaFala`; a voz de
      quem ouve vem da decisão (um terceiro idioma é lido na língua dele). Teste:
      `tests/controleDoInterprete.test.ts`.
- [x] 7.4 O pipeline pede o final sem dica e leva o idioma medido à decisão; sem parciais no automático
      (`pipelineDeFala.ts`). As fontes abrem o Whisper mesmo com o "Rápido" (`fontesDeAudio.ts`).
      Testes: `tests/interprete-direcao.test.ts`, `tests/interprete-dois-lados.test.ts`.
- [x] 7.5 A conversa inteira, pipeline e controle de verdade:
      `tests/interprete-automatico-integracao.test.ts`.
- [x] 7.6 O entitlement `interpreteAutomatico` (Premium e self-host; não o Grátis nem o convidado), na
      matriz, no cliente e no servidor em memória da edição estática.
- [x] 7.7 A tela: o botão único "Ouvir a conversa", o botão "Automático" da faixa do meio (com cadeado e
      "faz parte do Premium" para quem não tem; oculto no site sem servidor e no perfil protegido), e a
      escolha lembrada no aparelho. Testes: `tests/modoInterprete.test.tsx` e o e2e "automático".
- [ ] 7.8 Conferir com áudio de verdade (o dono, no Premium ou no teste de 14 dias): a detecção do
      Whisper da nuvem em falas curtas, o eco da voz com o microfone reaberto, e a rua barulhenta.
- [ ] 7.9 Depois: a folha "Rápido ou Privado?" não perguntar quando a conversa começa no automático (a
      resposta só vale para o modo por toque).

## Antes de ligar a flag `voz_natural` (pendente, decisão do dono)

- [ ] P.1 Decidir as cotas da voz do Premium. Hoje são 600.000 caracteres por mês e 60.000 por dia,
      marcadas "PROVISÓRIO" em `src/core/planos.ts`. As variáveis `PREMIUM_MONTHLY_TTS_CHARS` e
      `PREMIUM_DAILY_TTS_CHARS` sobrepõem esses valores.
- [ ] P.2 Confirmar o operador de voz e a retenção dele no contrato. Hoje as linhas estão "A CONFIRMAR" em:
  - `docs/lgpd/operadores.md` (DeepInfra; e Google Cloud TTS, se a perna `google-tts` for declarada);
  - `docs/lgpd/ropa.csv` (T13).
- [ ] P.3 Atualizar `public/privacidade.html` com a voz natural. Hoje ela não cita a voz natural nem a
      DeepInfra. `docs/lgpd/operadores.md` pede isso "antes de ligar a flag".
- [ ] P.4 Pôr a `DEEPINFRA_API_KEY` numa perna `tts` do `IA_PROVEDORES` e rodar a sonda de contrato do
      Chatterbox: o campo `extra_body.language` e o tipo da resposta. São pré-requisitos escritos na 0046
      e em `server/ai/provedoresDeVoz.ts`.
- [ ] P.5 Medir o `tts_inicio` com o provedor real. Hoje a meta de 2,5 s só foi conferida com
      `/api/ai/tts` simulado.
- [ ] P.6 Só então ligar a flag, numa migração nova. A 0046 é semente `INSERT OR IGNORE` e não liga nada.

## Verificação desta change

- [x] Na árvore desta branch (igual à `cd0aa88` em `src/`, `server/` e `tests/`), `npx vitest run` passou
      nos 10 arquivos de teste do E1, E2, E4 e E5: 120 testes, em 30/09/2026.
- [ ] PR #47. A descrição do PR relata:
  - `typecheck`, `typecheck:estrito`, `typecheck:core`, eslint, prettier, madge, `conferir.mjs`,
    `contrato-api.mjs` e i18n;
  - 8135 testes unitários, 29 deles novos;
  - o e2e;
  - o `build:estatica` com o orçamento.
  - Ninguém conferiu isso de novo nesta change.
