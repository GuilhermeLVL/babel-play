## 1. Regra pura

- [x] 1.1 `src/core/modoOffline.ts` com `capacidadesSemRede` e testes em `tests/modoOffline.test.ts`. Verificar: `npx vitest run tests/modoOffline.test.ts`.

## 2. Interface

- [x] 2.1 Hook `useEstadoSemRede` e faixa `AvisoSemRede` no `App.tsx`, só offline, dispensável. Verificar: teste do componente.
- [x] 2.2 Lista completa na seção "Uso sem internet" do Diagnóstico. Verificar: render do Diagnóstico nos testes existentes.
- [x] 2.3 Textos no `t()` e `npm run i18n`. Verificar: `ordenar.mjs --check` e `cobertura.mjs --check`.
