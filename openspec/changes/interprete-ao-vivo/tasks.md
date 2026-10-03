## 1. Spike de medição (sem código de produto)

- [ ] 1.1 Confirmar com o dono a chave e os termos do provedor do nível "Ao vivo" e o limite de custo por hora
- [ ] 1.2 Criar `scripts/eval-fala/bancada/ao-vivo.mjs`: mesmo áudio (FLEURS e conversa curta) na cascata e no provedor; medir End Offset, LAAL e custo por hora
- [ ] 1.3 Pontuar a qualidade com COMET e contar erros de voz e de gênero em uma amostra ouvida, nos pares pt↔en, pt↔es, pt↔zh, en↔zh
- [ ] 1.4 Avaliar Hibiki-Zero e Seamless só onde cobrem os pares; registrar o que não cobre
- [ ] 1.5 Escrever `docs/auditoria/eval/ao-vivo.md` com IC 95% pareado e a decisão do portão

## 2. Produto (só se o portão passar)

- [ ] 2.1 Interface `ProvedorAoVivo` e `server/ai/aoVivo.ts` (WebSocket para o provedor, autenticação, contagem de minutos, teto), com testes de contrato
- [ ] 2.2 Entitlement e tetos em `core/planos.ts` (horas inclusas e pacote por Pix); testes da matriz
- [ ] 2.3 Fonte "fala→fala" em `controleDoInterprete.ts` com duas sessões por sentido, `echoTargetLanguage: false` e transcrição ligada
- [ ] 2.4 Escolha do nível em `ModoInterprete.tsx` (No aparelho, Precisão, Ao vivo), cadeado no Grátis, limites declarados e "Usar Precisão"
- [ ] 2.5 Queda automática para a cascata (rede, crédito, cobertura, latência em três falas) com aviso único
- [ ] 2.6 Medidor de minutos e custo (reaproveita o da Fase 2) e chave `babel.interprete.aoVivo`

## 3. Verificação

- [ ] 3.1 Typecheck e testes dos arquivos tocados; e2e com provedor simulado (queda para a cascata, teto)
- [ ] 3.2 Conferir com fala real e anotar atraso medido; liberar primeiro só para o dono
