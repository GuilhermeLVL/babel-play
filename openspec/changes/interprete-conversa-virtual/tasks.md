## 1. Fase 4 — ouvir a outra pessoa

- [ ] 1.1 Adicionar o entitlement `conversaVirtual` em `core/planos.ts` (Premium e selfhost) e ajustar os testes da matriz
- [ ] 1.2 Modo "fontes fixas" em `controleDoInterprete.ts` (direção por fonte, dois pipelines), com testes escritos antes
- [ ] 1.3 Remover `soNoToque` e o `if (soToque) return` de `salvarSessao.ts` para o novo modo, sem mudar o presencial; testes de `salvarSessaoInterprete`
- [ ] 1.4 Captura de "Eles": aba preferida com `suppressLocalAudioPlayback`, sistema no Windows com confirmação de fone, `restrictOwnAudio`, trilho sem DSP, mensagem quando não há faixa de áudio
- [ ] 1.5 Reprodução do original por `GainNode` (só aba) com ducking durante a leitura; pausa de "Eles" e processamento posterior quando não há `restrictOwnAudio`
- [ ] 1.6 Tela em bolhas rotuladas "Eles" e "Você", nível por fonte, "só legenda", "ouvir original" e "ouvir a tradução aqui"
- [ ] 1.7 Escolha do modo em `PaginaDoInterprete.tsx`; compatibilidade de navegador (Safari e Firefox explicam)
- [ ] 1.8 Aviso de consentimento, 18+, nada gravado por padrão, indicador de captura e botão de parar; medidor de minutos e queda para só legenda no teto

## 2. Fase 5 — spike com portão (antes de qualquer código de produto)

- [ ] 2.1 Spike descartável (script ou página de teste) tocando a tradução por `setSinkId` no VB-Cable; medir eco, atraso e inteligibilidade com Meet e Zoom
- [ ] 2.2 Escrever `docs/auditoria/eval/conversa-virtual-saida.md` com os números e a decisão do portão (eco, p50 ≤ 3 s, teste cego)
- [ ] 2.3 Decidir a voz roteável do Grátis (Kokoro local ou só Premium) com peso e qualidade medidos

## 3. Fase 5 — saída para a chamada (só se o portão passar)

- [ ] 3.1 Criar `src/lib/voz/saidaParaChamada.ts` (`AudioContext` com `setSinkId`, decodificar o áudio da voz do app, tom de teste), puro onde der, com testes
- [ ] 3.2 Detecção de dispositivo virtual por nome e folha com guia de instalação, escolha da saída, teste e confirmação
- [ ] 3.3 Roteamento da leitura de "Você" para a saída escolhida, com "ouvir também aqui" desligado por padrão e aviso quando só há a voz do aparelho
- [ ] 3.4 Chave `babel.interprete.virtualSaida` (desligada até o portão) e queda para só local em qualquer falha

## 4. Verificação

- [ ] 4.1 Typecheck e testes dos arquivos tocados; e2e do modo (aba simulada, direção por fonte, só legenda)
- [ ] 4.2 Conferir com uma chamada real em Chrome no Windows (aba e sistema, fone e alto-falante) e anotar o que falta medir
