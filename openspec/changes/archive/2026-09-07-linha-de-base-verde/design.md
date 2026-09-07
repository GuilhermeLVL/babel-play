## Context

A arvore de trabalho de 2026-09-07 tinha 28 arquivos modificados (+4.294/-1.089) e 10 caminhos nao rastreados de uma camada de gamificacao (Cofre, Vestiario, 3 versoes de hub, catalogoMestre) que desligava o comercio (`Loja.tsx:151`) e nao estava no git. Auditoria: `openspec/audits/2026-09-07-coerencia.md`, achados A01, A43, A50.

## Decisao

**Saida (b)**, escolhida pelo dono em 2026-09-07: a camada inteira e commitada na branch `gamificacao-v2-wip` (nada se perde) e `main` volta ao HEAD `976af2c`. O Cofre/Vestiario novo entra por change propria depois de `posse-de-cosmeticos-uma-regua`, com catalogo unico e regua unica.

Por que nao (a): manter a camada em `main` atras de um interruptor exigiria conviver com dois catalogos com 31 ids colididos, 47 itens inatingiveis e 129 KB no chunk de arranque ate a change de posse — custo maior que o beneficio de ver o Cofre agora.

## Caminhos movidos para a branch (saida do `git status` em 2026-09-07)

```
 M index.html
 M package-lock.json
 M package.json
 M src/App.tsx
 M src/components/ParticleCanvas.tsx
 M src/components/minigames/ResumoDaRodada.tsx
 M src/components/minigames/ScratchReward.tsx
 M src/components/views/Conquistas.tsx
 M src/components/views/Loja.tsx
 M src/components/views/Personalizar.tsx
 M src/components/views/loja/CabecalhoDeTemporada.tsx
 M src/components/views/passe/PasseDeTemporada.tsx
 M src/components/views/personalizar/Inventario.tsx
 M src/components/views/personalizar/SeletorDeEmojis.tsx
 M src/core/index.ts
 M src/index.css
 M src/lib/appearance.ts
 M src/lib/aprimoramentos.ts
 M src/lib/conquistas.ts
 M src/lib/cursores.ts
 M src/lib/effects.ts
 M src/lib/galeria/emojis.ts
 M src/lib/galeria/paletas.ts
 M src/lib/galeria/perfis.ts
 M src/lib/particulas.ts
 M src/lib/rastroDoMouse.ts
 M src/lib/soundFx.ts
 M src/lib/theme.ts
?? docs/AUDITORIA_E_SPEC_PERSONALIZACAO_E_COFRE.md
?? openspec/changes/hiper-personalizacao-ecosystem/
?? openspec/changes/personalizacao-elemental-e-icones-premium/
?? src/components/views/gamificacao/
?? src/core/catalogoMestre.ts
?? src/lib/drops.ts
?? src/lib/suitesTematicas.ts
?? tests/cofreGameplay.test.ts
?? tests/particulasCores.test.ts
?? walkthrough.md
```
