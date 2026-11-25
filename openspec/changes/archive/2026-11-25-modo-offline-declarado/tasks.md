> **Arquivada em 25/11/2026 (Onda 5, fechamentos).** O trabalho de dev terminou; o que resta é ato do dono, aparelho real ou bancada ([D]/[R]/[B]) e está em `docs/pendencias-do-dono.md`, Parte 5. As tarefas abertas abaixo ficam como registro.

## 1. Regra pura

- [x] 1.1 `src/core/modoOffline.ts` com `capacidadesSemRede` e testes em `tests/modoOffline.test.ts`. Verificar: `npx vitest run tests/modoOffline.test.ts`.

## 2. Interface

- [x] 2.1 Hook `useEstadoSemRede` e faixa `AvisoSemRede` no `App.tsx`, só offline, dispensável. Verificar: teste do componente.
- [x] 2.2 Lista completa na seção "Uso sem internet" do Diagnóstico. Verificar: render do Diagnóstico nos testes existentes.
- [x] 2.3 Textos no `t()` e `npm run i18n`. Verificar: `ordenar.mjs --check` e `cobertura.mjs --check`.

## 4. Reconciliação de 25/11/2026 (onda1/lint-e-offline)

- [x] 4.1 Somar o Parakeet baixado ao critério "transcrição no aparelho": `transcricaoNoAparelho` em `src/lib/captura/useEstadoSemRede.ts` (modelo do par completo OU `temCopiaNoAparelho(ID_DO_PARAKEET)`, o mesmo critério de `prontoParaLegendarSemRede`). Verificar: `npx vitest run tests/transcricaoNoAparelho.test.ts` (4 casos).
- [x] 4.2 Reconciliar com `modelos-confiaveis-e-offline` 7.3: a promessa offline (`prontoParaLegendarSemRede`) e a faixa (`capacidadesSemRede`) agora concordam sobre o Parakeet; sem texto duplicado novo (nenhum texto de UI foi criado; a frase da promessa e as da faixa são chaves distintas e de propósito). Verificar: `npx vitest run tests/promessaOffline.test.tsx tests/modoOffline.test.ts` verdes.
- Nada restou: **proposta de arquivar** esta change (decisão 40 de `decisoes-do-dono.md`, recomendação "arquivar", assumida em 25/11). Arquivar com `/opsx:archive` no fechamento da onda.
