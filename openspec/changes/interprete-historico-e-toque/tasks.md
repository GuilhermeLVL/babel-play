## 1. Base pura e testável

- [ ] 1.1 Criar `src/lib/captura/historicoDoInterprete.ts`: `historicoDoInterprete(falas, lado, {janela})` (itens finais, parcial, grande) e `subirJanela` (subir de 50 em 50), com `tests/historicoDoInterprete.test.ts` escrito antes
- [ ] 1.2 Criar `src/lib/captura/trechosTocaveis.ts`: separar palavras com `Intl.Segmenter` e queda para a frase inteira em zh/ja/th, com teste
- [ ] 1.3 Estender `controleDoInterprete.ts` com `ouvirTrecho(texto, idioma, {lento})` pela fila, prioridade "manual", ignorado em `ouvindo`; teste de estados

## 2. Histórico na tela

- [ ] 2.1 Renderizar a lista anterior (menor, esmaecida) acima da frase grande em `ModoInterprete.tsx`, mantendo ícones, cores e atalhos atuais
- [ ] 2.2 Rolagem presa no fim, "Ir ao fim" com contador e `aria-live` só na bolha nova
- [ ] 2.3 Modo "Conversa" (bolhas, falante, hora) e seletor na faixa do meio; guardar em `babel.interprete.tela` com `try/catch`
- [ ] 2.4 Estilos em `modoInterprete.css` para celular, computador e Quest (alvos de 60 px no Quest)
- [ ] 2.5 Faixa de estado, medidor de nível do microfone, tamanho de letra e mensagens de falha com ação

## 3. Tocar para ouvir

- [ ] 3.1 Palavras e frases tocáveis na bolha e nas metades, ligando `examineWord`, `falar` e o modo lento (0,7×)
- [ ] 3.2 Dica "Espere a escuta terminar" quando o toque cai em `ouvindo`; aviso quando não há voz para o idioma
- [ ] 3.3 "Repetir" passa a valer para qualquer frase do histórico (leitura da tradução; áudio original só onde existe)

## 4. Corrigir, favoritar, exportar

- [ ] 4.1 Ponte `corrigirFala(id, texto)` em `LiveCapture.tsx`: atualiza o segmento, refaz a tradução com número de versão, estado "pendente" sem rede
- [ ] 4.2 Folha de edição (tocar e segurar no original) com confirmar e cancelar
- [ ] 4.3 Favoritar abre `FolhaDaPalavra` e `FolhaDaFrase`
- [ ] 4.4 "Exportar conversa" chamando o relatório da sessão (Markdown e PDF), incluindo correções

## 5. Verificação

- [ ] 5.1 Testes de `modoInterprete.test.tsx` para histórico, "Conversa", toque e correção; atualizar `tests/e2e/modo-interprete.e2e.ts`
- [ ] 5.2 Typecheck e testes dos arquivos tocados (regra de entrega rápida)
- [ ] 5.3 Conferir no celular (Chrome) e no computador com fala real; anotar o que falta medir no Quest
