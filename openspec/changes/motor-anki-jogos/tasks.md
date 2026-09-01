## 1. Filtro por baralho (o mecanismo já existe)

- [ ] 1.1 `selecionarParaJogo`: ramo `origin_kind='anki' AND origin_ref=<deckId>` na cláusula
      `EXISTS` que já está lá (`vocab.ts:473-486`); o índice `idx_occ_origem` já cobre
- [ ] 1.2 `PedidoDeComposicao.fonte.ref` passa a carregar a referência de baralho (o campo já existe)
- [ ] 1.3 Payload do deck leva a associação cartão→baralho (análogo a `daTrilha`), para o fallback
      offline de `cartoesDaFonte` não mentir
- [ ] 1.4 Quando a associação não estiver no payload, **dizer** que o filtro não pôde ser aplicado —
      nunca jogar com tudo em silêncio
- [ ] 1.5 Seletor de baralho no lobby, ao lado das fontes existentes
- [ ] 1.6 Teste: escolher baralho recorta; sem escolha, acervo inteiro (comportamento de hoje intacto)

## 2. Matriz jogo × dados

- [ ] 2.1 Função pura `elegibilidadePorJogo(item)` derivada de `MINIGAMES`/`REVELAVEL` — sem duplicar
      as regras que já vivem lá
- [ ] 2.2 Motivo de indisponibilidade por baralho, exibido pelo gate existente (`estadoDeCadaJogo`,
      que já sabe mostrar `sem-voz` e afins)
- [ ] 2.3 Script não latino: caça-palavras e termo indisponíveis **com motivo**, não grade vazia
- [ ] 2.4 Teste tabular: um caso por linha da matriz do `design.md`

## 3. Frase do baralho vira fala

- [ ] 3.1 Nota com frase → `fala`; com áudio nativo, duração real; sem áudio, `startMs:0,endMs:0`
      (o sinal que o ramo da trilha já usa — nenhum tipo novo)
- [ ] 3.2 Karaokê só com clipe real (precisa de tempo); escuta e ditado aceitam TTS
- [ ] 3.3 Teste: baralho com frases alimenta os 5 jogos de frase conforme a matriz

## 4. Origem visível e progresso

- [ ] 4.1 Chip "Anki · nome do baralho" na prévia, dentro do funil `previaSegura` (nenhum ramo
      escreve por fora)
- [ ] 4.2 Anti-spoiler: a origem respeita `REVELAVEL` do jogo
- [ ] 4.3 Modo "só revisão" para item que não serve a nenhum jogo — grava memória, sem mecânica
- [ ] 4.4 Progresso por baralho na tela do baralho (quanto já foi praticado)

## 5. Validação de ponta a ponta

- [ ] 5.1 Navegar importar → mapear → ativar → jogar filtrado → remover (MCP chrome-devtools, porta
      3100, **servidor reiniciado**: `server/` não tem watch)
- [ ] 5.2 Primeira suíte Playwright do repositório (deps já instaladas, zero config hoje):
      `playwright.config.ts` + `tests/e2e/` + script próprio; escopo mínimo = o caminho feliz acima
- [ ] 5.3 Gates da casa verdes: `typecheck`, `lint`, `audit:gate`, `ast-grep scan`, `vitest run`
- [ ] 5.4 Jogo novo (memória palavra↔imagem, cloze race etc.) **só** se a medição do corpus mostrar
      que os baralhos reais o sustentam — jogo que funciona em 2% do acervo é mobiliário
