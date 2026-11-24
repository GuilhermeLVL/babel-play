## 1. Decisão pura

- [x] 1.1 `src/core/learning/escutaGuiada.ts`: modos, etapas, `proximoPasso`, `irParaFrase`, `trocarModo`, `revelarTexto`, `modoSugerido`
- [x] 1.2 Testes: transições de cada modo, sugestão por nível, última frase (`tests/escutaGuiada.test.ts`)

## 2. Ligação na tela

- [x] 2.1 `src/lib/analise/escutaGuiada.ts`: `useEscutaGuiada` (estado, `seekTo`/`setIsPlaying`, Enter) e preferência em `localStorage`
- [x] 2.2 `views/analise/EscutaGuiada.tsx`: seletor "Modo de escuta", sugestão por nível, "Texto oculto — toque para revelar", "Próximo passo"
- [x] 2.3 `PlayerInterativo` (prop `escuta`), `TranscricaoDoQuest` (prop `falaOculta`) e `Analysis.tsx` (nível via `fluenciaDoBaralho`)
- [x] 2.4 CSS em `questSessao.css` (mobile: a linha quebra dentro da faixa)
- [x] 2.5 Testes de componente (`tests/escutaGuiadaTela.test.tsx`, `tests/escutaGuiadaLimites.test.tsx`)
- [x] 2.6 A reprodução para no fim da frase nos modos guiados (áudio e voz); navegação por índice; transcrição não vaza a fala oculta

## 3. i18n e verificação

- [x] 3.1 Chaves em `public/i18n/{en,es,ar}.json` e `npm run i18n`
- [x] 3.2 `typecheck`, `lint`, vitest dos arquivos tocados e `knip` verdes
- [ ] 3.3 Dono: experimentar em aparelho real (Safari/iOS e leitor de tela) e decidir se o modo inicial passa a ser o sugerido
