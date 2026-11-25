> **Revisão de 25/11/2026** (main `897c9d25`). Legenda: **[D]** = decisão ou ato do dono; **[R]** = aparelho real. Em toda tarefa:
> `npm run typecheck`, `npm run lint` e só os testes dos arquivos tocados. O plano "Premium e selfhost" da tarefa 1.1 ficou velho: a v4
> vende o Plus (`src/core/planos.ts`); a decisão está em `proposal.md`, "Revisão de 25/11/2026".

## 1. Fase 4 — ouvir a outra pessoa

- [ ] 1.1 **[D]** Entitlement `conversaVirtual` em `src/core/planos.ts`. Hoje a opção só aparece com a chave de teste `virtual` ligada.
      Depende da decisão do dono (plano). Verificar: `tests/planos-matriz.test.ts` e `tests/planos-v4-matriz.test.ts` verdes com o campo novo; grade plano × entitlement
      em `/api/me/entitlements`; nenhuma comparação do nome do plano fora da matriz.
- [x] 1.2 Direção fixa por fonte: `interpreteVirtual()` no pipeline. Feito: `tests/interprete-virtual.test.ts`.
- [x] 1.3 As duas fontes abrem ao começar (`micNoInicio`). Feito: `tests/salvarSessaoInterprete.test.ts`.
- [x] 1.4 Captura de "Eles" aberta de dentro do toque, com o botão "Compartilhar áudio". Feito: `src/lib/captura/fontesDeAudio.ts`, `src/gateway/capture/systemAudio.ts`.
- [ ] 1.5 Ducking do original e pausa de "Eles" durante a leitura. Hoje vale o anti-eco (a fala que começa durante a voz é pulada).
      Só faz sentido com a Fase 5 (a leitura de "Você" na chamada). Verificar: teste do pipeline: com a leitura ligada em aba com áudio, o volume do original cai
      e volta ao fim; medido no spike 2.1.
- [x] 1.6 Tela `ConversaVirtual.tsx` (bolhas, silenciar, só legenda por padrão, corrigir, guardar, exportar). Feito: `tests/conversaVirtual.test.tsx`.
- [x] 1.7 Entrada pelo botão "Virtual" (`FolhaDaConversaVirtual.tsx`), só no computador com áudio do sistema e com a chave `virtual`.
- [x] 1.8 Aviso e confirmação (18+, avisar quem está na conversa, nada gravado), escolha de fone, botão de sair sempre visível.
- [ ] 1.9 Medidor de minutos e queda para só legenda no teto. Depende da 1.1.
      Verificar: teste com cota de voz zerada no meio da conversa: continua só com legenda e a tela diz o motivo (cenário "Teto atingido").
- [x] 1.10 Conferido em navegador real (edição estática) em outubro. Reconferir depois do #206 (avisos e conversa numa área que rola; `2e65c0dd`):
      o aviso de consentimento não pode ficar escondido no celular. Verificar: e2e de captura em 375x667 mostra o aviso antes de abrir a captura.

## 2. Fase 5 — spike com portão (antes de qualquer código de produto)

- [ ] 2.1 **[R]** Spike descartável tocando a tradução por `setSinkId` no VB-Cable (Windows) e no BlackHole (macOS); medir eco, atraso e
      inteligibilidade com Meet e Zoom. Verificar: 10 chamadas de 2 min por combinação, números em tabela (eco sim/não, p50 do fim da fala até o som, nota de 1 a 5).
- [ ] 2.2 Escrever `docs/auditoria/eval/conversa-virtual-saida.md` com os números e a decisão do portão (sem eco, p50 ≤ 3 s, teste cego).
      Verificar: o arquivo existe e a decisão do portão está dita ("passa" ou "reprova") com o número que a justifica.
- [ ] 2.3 **[D]** Decidir a voz roteável do Grátis. Candidatas medidas: Kitten (`voz-natural-no-aparelho-kitten`) e Supertonic, ambas geram PCM que
      o app pode mandar por `AudioContext.setSinkId`; a voz nativa do navegador (Web Speech) NÃO é roteável. Verificar: tabela peso, RTF e nota de escuta de cada candidata, no mesmo aparelho do spike.

## 3. Fase 5 — saída para a chamada (só se o portão passar)

- [ ] 3.1 `src/lib/voz/saidaParaChamada.ts` (`AudioContext` com `setSinkId`, áudio da voz do app, tom de teste).
      Verificar: teste unitário com `setSinkId` simulado: escolhe o dispositivo, toca o tom, e cai para a saída padrão se o dispositivo some.
- [ ] 3.2 Detecção de dispositivo virtual por nome e folha com guia de instalação, escolha da saída, teste e confirmação.
      Verificar: teste de componente com `enumerateDevices` simulado (com e sem "CABLE"/"BlackHole"); textos em `t()` e nos quatro catálogos (`npm run i18n`).
- [ ] 3.3 Roteamento da leitura de "Você" para a saída escolhida, com "ouvir também aqui" desligado por padrão e aviso quando só há a voz do aparelho.
      Verificar: teste do pipeline: com saída escolhida, a fala sai só nela; sem voz roteável, o aviso aparece e a conversa segue só com legenda.
- [ ] 3.4 Chave `babel.interprete.virtualSaida` (desligada até o portão) e queda para só local em qualquer falha.
      Verificar: teste: chave desligada não carrega o módulo (chunk sob demanda) e qualquer erro de `setSinkId` volta a leitura ao aparelho sem travar a conversa.

## 4. Verificação

- [x] 4.1 Typecheck e testes dos arquivos tocados (Fase 4).
- [ ] 4.2 **[R]** Conferir com uma conversa real no Chrome (aba do YouTube, Discord, jogo) e, depois, com uma chamada no Meet ou Zoom.
      Verificar: 3 conversas reais de 10 min, anotadas em `docs/auditoria/`, sem erro de console e sem tradução repetida.
