- [x] 1.1 classes sem uso removidas; medicao antes/depois
- [x] 1.2 `slide-in-from-top-5` declarada
- [x] 1.3 README dos culturais reescrito
- [x] 1.4 `AUDITORIA-ESTADO.md` movido com cabecalho
- [x] 1.5 comentarios vencidos corrigidos (`llmRequest.ts`, `tsconfig.json`)

## Medicao (2026-09-09)

`src/index.css`: 1.776 -> 1.760 linhas. Classes escritas a mao: 79 -> 72 declaradas, e as sem
consumidor caem de 9 para 1 — a que sobra (`.age-kids`) chega ao DOM por concatenacao
(`age-${ageProfile}`, `App.tsx:824`). Keyframes: 24 -> 22, nenhum sem consumidor.

Arranque do bundle: 209,9 KB gz (era 210,0). A poda de CSS escrito a mao nao muda o peso de forma
mensuravel — o que ela muda e o custo de ler o arquivo.
