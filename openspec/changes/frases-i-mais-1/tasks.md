## 1. Core

- [x] 1.1 `src/core/leitura/paraEstudarDaSessao.ts`: frases i+1 e palavras novas, mesma régua e portão da cobertura
- [x] 1.2 Testes (`tests/para-estudar-da-sessao.test.ts`)

## 2. Tela

- [x] 2.1 `useParaEstudarDaSessao` (portão da conta e das sessões, tempo ocioso)
- [x] 2.2 `ParaEstudarDaSessao.tsx` + `src/styles/para-estudar.css`, ligado na aba Transcrição de `Analysis.tsx`
- [x] 2.3 "Guardar como cartão" pelo fluxo da folha (`salvarNaFolha`), "Já sei" por `alternarMarcacao`, toque leva ao `seekTo`
- [x] 2.4 Textos em `public/i18n/{en,es,ar}.json` e `npm run i18n`
- [x] 2.5 Testes do componente (`tests/para-estudar-da-sessao.test.tsx`)

## 3. Pendências do dono

- [ ] 3.1 Conferir no navegador, com uma conta de teste e uma sessão em inglês, a seção aberta (frases, "Guardar", toque na frase)
