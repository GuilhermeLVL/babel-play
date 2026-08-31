## Why

Auditoria de 31/08 achou brechas no gating da galeria/loja:

- B1: `aplicarPaleta` (`Personalizar.tsx:71-78`) seta `theme='custom'` sem checar o item
  `tema-custom` (nível 10 / 600 seeds) — o produto mais caro sai de graça.
- B5: `faltaParaOPerfil` (`acesso.ts:99-121`) replica o furo ao aplicar perfis com paleta.
- B2: `LayoutStudio.tsx` não tem checagem interna; 5 callsites recebem `onOpenStudio` cru.
- B3: emoji fora do catálogo cai em `acessoAoItem(undefined)` e sai liberado (cursor/rastro).
- B4: posse em localStorage sem servidor — registrado como pré-requisito da economia de
  créditos (outra mudança), não desta.

## What Changes

Fechar B1/B5/B2/B3 com fail-closed; testes de brecha em `tests/acessoGaleria.test.ts` e
`tests/loja.test.ts`.
