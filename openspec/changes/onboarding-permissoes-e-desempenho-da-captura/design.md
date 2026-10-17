## Context

O onboarding (`src/components/Onboarding.tsx`) é uma lista de passos (`PASSOS`) mapeada em `DO_PASSO`.

## Decisions

1. **Passo `permissoes` entre `laco` e `privacidade`.** Reaproveita o padrão de `LiveCapture.tsx` (pedir
   `getUserMedia({audio:true})` e fechar as faixas na hora) e `micErrorMessage` de `src/lib/mediaErrors.ts`. Estado local do
   passo: `idle | pedindo | liberado | negado`. Nada novo é gravado em `localStorage`.
   - Alternativa descartada: pedir o microfone ao abrir o app. Pedir sem contexto aumenta a negação.
2. **`getDisplayMedia` fica de fora.** O navegador abre o seletor a cada captura; o passo só explica.
3. **Desempenho de interface: nada a mudar.** Medido em 17/10/2026 (CPU 4x, Início parado, 8 s): 0 chamadas de
   `requestAnimationFrame` por segundo, 0 ms de tarefas longas. A lista já é memoizada e janelada (`ChatTranscript.tsx`),
   e os laços da aura e do sensor dormem (`sentidos.ts`). A lentidão percebida na captura vem de outro lugar (inferência
   local do Whisper e download do modelo) e merece mudança própria.

## Risks / Trade-offs

- O passo extra alonga o onboarding em um toque; por isso é pulável.
- "Pular apresentação" leva ao último passo e também pula as permissões; o microfone segue sendo pedido no "Iniciar".

## Verification

Teste de componente do passo (permitir, negar, pular), `npm run typecheck`, conferência no navegador (Playwright).
