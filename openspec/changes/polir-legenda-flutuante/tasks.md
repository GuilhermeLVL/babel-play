## 1. Núcleo e janela

- [x] 1.1 `core/legendas/janelaFlutuante`: `ALTURA_COMPACTA`, `tamanhoDeAbertura`, `rotuloDaEscuta`, `suavizarNivel`. Verificar: `npx vitest run tests/janelaFlutuante.test.ts`.
- [x] 1.2 `useJanelaFlutuante`: abrir baixa sem fala, crescer na primeira fala/gesto, não guardar o tamanho baixo. Verificar: `tests/useJanelaFlutuante.test.tsx`.

## 2. Interface

- [x] 2.1 `legendas/EstadoVazio` (escuta, medidor, "sem som", "parada") na janela completa e no painel da página. Verificar: `tests/legendasFlutuantes.test.tsx`.
- [x] 2.2 Atalhos `+` `-` `O` `F` e ajuda na barra. Verificar: o mesmo arquivo de teste.
- [x] 2.3 Painel da página anuncia só a fala fechada (`aria-live`).
- [x] 2.4 Catálogos de i18n (`npm run i18n`).

## 3. Verificação

- [x] 3.1 e2e `tests/e2e/legendas-flutuantes.e2e.ts` (estado vazio com medidor, no painel da página).
- [ ] 3.2 **[D]** Conferir no Chrome real (Document PiP) que a janela cresce no primeiro toque depois da primeira fala; no Playwright a Document PiP não existe.
