## 1. Base pura e testável

- [x] 1.1 Criar `src/lib/captura/historicoDoInterprete.ts`: `historicoDoInterprete(falas, lado, {janela})` (itens finais, parcial, destaque) e `subirJanela` (subir de 50 em 50), com `tests/historicoDoInterprete.test.ts` escrito antes
- [x] 1.2 Criar `src/lib/captura/trechosTocaveis.ts`: separar palavras com `Intl.Segmenter` e queda para a frase inteira em zh/ja/th, com teste
- [x] 1.3 Estender `controleDoInterprete.ts` com `ouvirTrecho(texto, lang, {lento})` pela fila (item `manual`, fora do Repetir e da métrica), ignorado em `ouvindo`, sem reabrir o microfone do automático; testes de estados
- [x] 1.4 `src/lib/captura/exportarConversa.ts`: Markdown da conversa e nome do arquivo, puro, com teste escrito antes

## 2. Histórico na tela

- [x] 2.1 Renderizar a lista anterior (menor, esmaecida) acima da frase grande em `ModoInterprete.tsx`, mantendo ícones, cores e atalhos atuais (`ListaDoHistorico.tsx`)
- [x] 2.2 Rolagem presa no fim, "Ir ao fim" com contador e `aria-live` só para o que entra
- [x] 2.3 Modo "Conversa" (bolhas, falante) e seletor na faixa do meio; guardar em `babel.interprete.tela` com `try/catch`
- [x] 2.4 Estilos em `modoInterprete.css` para celular, computador e Quest
- [x] 2.5 Linha de estado por metade e mensagens de falha já existentes mantidas; "ver mais" por janela de 50
- [ ] 2.6 (etapa própria) Nível do microfone e tamanho de letra ajustável: dependem de dados que a captura ainda não entrega à tela

## 3. Tocar para ouvir

- [x] 3.1 Palavras e frases tocáveis na bolha e nas metades (`TextoTocavel.tsx`), com o botão "devagar" (0,7×)
- [x] 3.2 Dica "Espere a escuta terminar" quando o toque cai em `ouvindo`; texto sem botões quando o idioma não tem voz
- [x] 3.3 "Repetir" continua lendo a tradução depois de um toque (o item manual não vira o último)

## 4. Corrigir, guardar, exportar

- [x] 4.1 `corrigirFalaDoInterprete` em `LiveCapture.tsx`: troca o texto, refaz a tradução na direção de quem falou (`pedida`, só a última vale pelo selo da ordem)
- [x] 4.2 Folha de edição (`FolhaDeEdicao.tsx`): lápis ou tocar e segurar; confirmar, cancelar e Esc
- [x] 4.3 Estrela abre a `FolhaDaFrase` da captura; sem "Falar eu" dentro do intérprete (`semPratica` nas duas folhas)
- [x] 4.4 "Exportar" na tela Conversa baixa o Markdown (no aparelho)

## 5. Verificação

- [x] 5.1 Testes de `modoInterprete.test.tsx` (histórico, janela, Conversa, toque, correção, estrela, exportação), `controleDoInterprete`, `filaDeFala`
- [x] 5.2 Typecheck e testes dos arquivos tocados (16 arquivos, 211 testes)
- [ ] 5.3 Atualizar `tests/e2e/modo-interprete.e2e.ts` e conferir no celular (Chrome) e no computador com fala real; anotar o que falta medir no Quest
