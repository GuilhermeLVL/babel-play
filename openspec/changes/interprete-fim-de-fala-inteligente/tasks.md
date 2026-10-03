## 0. Pré-requisito

- [ ] 0.1 Fechar a tarefa 7.8 de `modo-interprete` (automático com áudio real: falas curtas, eco com o microfone reaberto, rua barulhenta) e registrar o resultado

## 1. Medir primeiro (sem mudar comportamento)

- [x] 1.1 Estender `captureMetrics.ts` com `etapas`, `motor` e `custoEstimado` por fala e agregado por sessão; testes (STT e tradução por fala em `captureMetrics`; agregado p50/p95, motor e custo em `tempoAteAVoz`; o VAD entra com a espera NOMINAL de 800 ms, não medida; custo só do STT de nuvem)
- [x] 1.2a (parte feita) O tempo do fim da fala até a voz (p50/p95 por motor) fica guardado ao fechar o intérprete (`tempoAteAVoz.guardar`) e aparece no `/diagnostico`
- [x] 1.2b Mostrar também o tempo de cada etapa (VAD, STT, tradução) e o custo da conversa; telemetria só com metadados (só local: o contrato `v: 1` não mudou e nada vai ao servidor)
- [ ] 1.3 Registrar a linha de base atual do intérprete (p50/p95 até a voz) no relatório da bancada

## 2. Fim de fala inteligente

- [ ] 2.1 Criar `scripts/eval-fala/bancada/fim-de-fala.mjs` (WER, fragmentos por fala, tempo até o fechamento, custo) e rodar a linha de base de 800 ms — feito SEM o WER (fragmentos, espera e custo medidos contra o fixo de 800 ms; falta rodar com STT)
- [x] 2.2 Criar `src/gateway/capture/pisoDoSilencio.ts` (média móvel, limites 250–600 ms), puro, com teste escrito antes
- [x] 2.3 Criar `src/gateway/capture/fimDeFala.ts`: worker ONNX do Smart Turn v3, janela de 8 s, queda segura e motivo; ativo estático no build (conferido no Chromium: carrega e responde)
- [ ] 2.4 Ligar em `systemAudio.ts`: silêncio candidato (~300 ms) → modelo → fechar ou esperar até o teto; chave `babel.interprete.fimInteligente` — implementado e coberto por testes de unidade; falta conferir com áudio real
- [x] 2.5 Definir a lista de idiomas aprovados pela bancada (FLEURS) e a queda para 800 ms fora dela (só `en`, liberado para teste; nenhum idioma passou o portão)
- [ ] 2.6 Rodar a bancada com IC 95% pareado; aplicar o portão (WER, fragmentos, custo ≤ 1,08×, p50 −400 ms) e só então propor o padrão — rodada feita em 03/10/2026: REPROVADO (fragmentos e p50), chave segue desligada; WER ainda não medido (ver `bancada-2026-09.md`)

## 3. Tradução parcial estável

- [x] 3.1 Criar `src/lib/captura/parcialEstavel.ts` (duas leituras iguais, fronteira de oração, janela de 1,2 s), puro, com teste
- [x] 3.2 Ligar em `pipelineDeFala.ts` e `traducaoDaFala.ts`: só local no Grátis, teto de custo na nuvem; mostrar em cinza na tela (usa a lista da Fase 1) (ligado atrás da chave `parcialTraduzido`; parcial sempre local, nunca à nuvem; não validado com áudio ao vivo)
- [x] 3.3 Garantir que o parcial traduzido nunca entra na fila de voz

## 4. Voz por frase e aquecimento

- [x] 4.1 Partir a tradução em frases (`Intl.Segmenter`) e enfileirar por índice em `filaDeFala.ts`; testes de ordem e cancelamento (feito dentro de `vozDaNuvem.ts`: a ordem é garantida pelo próprio motor; a fila `filaDeFala.ts` não mudou)
- [x] 4.2 Síntese paralela (limite 2) e prazos por frase em `vozDaNuvem.ts`, com queda para a voz do aparelho
- [x] 4.3 `aquecerInterprete()` ao abrir `/interprete` (hoje só `destravarVozDaNuvem`; VAD e modelo de turno ainda não existem para aquecer)

## 5. Verificação

- [ ] 5.1 Typecheck e testes dos arquivos tocados; atualizar `tests/e2e/modo-interprete.e2e.ts` (meta `tts_inicio`)
- [ ] 5.2 Conferir com fala real no celular e no computador (pausa para pensar, frase curta, fone e alto-falante)
- [ ] 5.3 Atualizar `docs/auditoria/eval/bancada-2026-09.md` com os números e a decisão do portão
