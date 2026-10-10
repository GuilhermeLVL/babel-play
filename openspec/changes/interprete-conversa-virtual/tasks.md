## 1. Fase 4 — ouvir a outra pessoa

- [ ] 1.1 Entitlement `conversaVirtual` em `core/planos.ts` (Premium e selfhost): **não feito**; hoje a opção só aparece com a chave de teste `virtual` ligada. Decidir o plano junto com o nível "Ao vivo".
- [x] 1.2 Direção fixa por fonte: `interpreteVirtual()` no pipeline (o sistema é o outro, o microfone sou eu; `lado`, `falada` e idioma por fonte), com `tests/interprete-virtual.test.ts`
- [x] 1.3 As duas fontes abrem ao começar: `micNoInicio` em `salvarSessao.ts` (de fone o microfone entra; sem fone, só o computador), testes em `salvarSessaoInterprete.test.ts`
- [x] 1.4 Captura de "Eles": a captura existente do sistema (aba com áudio, tela com áudio, loopback, servidor local) aberta de dentro do toque; botão "Compartilhar áudio" quando "Eles" está desligado
- [ ] 1.5 Ducking do original e pausa de "Eles" durante a leitura: **não feito**. O padrão é só legenda; com a leitura ligada vale o anti-eco atual (a fala que começa durante a voz é pulada)
- [x] 1.6 Tela `ConversaVirtual.tsx`: bolhas, estado de "Eles" e "Você", silenciar o microfone, só legenda por padrão, leitura opcional de "Eles", corrigir, guardar, exportar (`tests/conversaVirtual.test.tsx`)
- [x] 1.7 Entrada em `PaginaDoInterprete.tsx` ("Conversa virtual"), só no computador com áudio do sistema e com a chave `virtual` ligada
  - 10/10/2026: a entrada virou a folha `FolhaDaConversaVirtual.tsx`, aberta pelo botão "Virtual" da conversa (a página de entrada antiga foi apagada), e a tela `ConversaVirtual.tsx` passou a usar a conversa do desenho novo (`ConversaDoPrototipo`): ver `polimento-movimento/fidelidade/ficou-de-fora.md`
- [x] 1.8 Aviso e confirmação (18+, avisar quem estiver na conversa, nada gravado) e a escolha de fone antes de começar; botão de sair sempre visível
- [ ] 1.9 Medidor de minutos e queda para só legenda no teto: **não feito** (depende do plano, tarefa 1.1)
- [x] 1.10 Conferido num navegador real (edição estática): a tela abre, "Eles" fica ouvindo o computador com áudio simulado, "Você" silenciado sem fone, sem erros no console

## 2. Fase 5 — spike com portão (antes de qualquer código de produto)

- [ ] 2.1 Spike descartável tocando a tradução por `setSinkId` no VB-Cable; medir eco, atraso e inteligibilidade com Meet e Zoom
- [ ] 2.2 Escrever `docs/auditoria/eval/conversa-virtual-saida.md` com os números e a decisão do portão (eco, p50 ≤ 3 s, teste cego)
- [ ] 2.3 Decidir a voz roteável do Grátis (Kokoro local ou só Premium) com peso e qualidade medidos

## 3. Fase 5 — saída para a chamada (só se o portão passar)

- [ ] 3.1 `src/lib/voz/saidaParaChamada.ts` (`AudioContext` com `setSinkId`, áudio da voz do app, tom de teste)
- [ ] 3.2 Detecção de dispositivo virtual por nome e folha com guia de instalação, escolha da saída, teste e confirmação
- [ ] 3.3 Roteamento da leitura de "Você" para a saída escolhida, com "ouvir também aqui" desligado por padrão e aviso quando só há a voz do aparelho
- [ ] 3.4 Chave `babel.interprete.virtualSaida` (desligada até o portão) e queda para só local em qualquer falha

## 4. Verificação

- [x] 4.1 Typecheck e testes dos arquivos tocados
- [ ] 4.2 Conferir com uma conversa real no Chrome (aba do YouTube, Discord, jogo) e, depois, com uma chamada no Meet ou Zoom
