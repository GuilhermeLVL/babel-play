## 1. Passo de permissões no onboarding

- [x] 1.1 Acrescentar `'permissoes'` a `PASSOS` e `DO_PASSO` em `src/components/Onboarding.tsx`, entre `laco` e `privacidade`
- [x] 1.2 Renderizar o passo: botão do microfone (`getUserMedia` + fechar a faixa), estado `idle|pedindo|liberado|negado`, "Agora não", texto sobre o seletor de aba/tela
- [x] 1.3 Mensagem de negação via `micErrorMessage` (`src/lib/mediaErrors.ts`); "Continuar" nunca bloqueado
- [x] 1.4 Textos em inglês e espanhol (`public/i18n/en.json`, `es.json`); `ar` e `xx` caem no português
- [x] 1.5 Teste de componente: permitir, negar, pular (`tests/onboardingDialogo.test.tsx`)
- [x] 1.6 Conferência visual no navegador (17/10/2026): passo 5 de 6 desenhado e cabendo no diálogo

## 2. Desempenho da captura: nada a fazer nesta mudança

Conferido em 17/10/2026; os achados da auditoria de 10/10 já estavam resolvidos:

- [x] 2.1 Linha de base: Início parado, CPU 4x, 8 s: 0 `requestAnimationFrame`/s, 0 ms de tarefas longas
- [x] 2.2 Lista de falas já memoizada (`FalaDaConversa`, `ChatTranscript`) e limitada a 200–249 linhas (`JANELA_DA_CONVERSA`)
- [x] 2.3 Laços da aura e do sensor já dormem (`sentidos.ts`, `quadroDoGiro`); `ParticleCanvas` já pausa com a aba oculta
- [ ] 2.4 Chunk de ícones: descartado por ora (a auditoria dá ganho pequeno em HTTP/2)

## 3. Fechamento

- [x] 3.1 `npm run typecheck` verde; testes de Onboarding verdes
- [ ] 3.2 Uma falha pré-existente em `tests/seguranca/limitador-de-falhas-de-auth.test.ts` (`ECONNRESET`), fora do escopo
- [ ] 3.3 Revisão crítica (`revisor-critico`) e commit, quando o dono pedir
