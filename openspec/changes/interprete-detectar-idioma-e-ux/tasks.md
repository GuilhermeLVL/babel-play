## 1. Regra pura (testes antes)

- [x] 1.1 `decidirLadoDaFala` com `outro` vazio: a primeira fala estrangeira define `estrangeiro`; o meu lado sem destino traduz para o próprio idioma (sem tradução); sem evidência, o meu lado
- [x] 1.2 `controleDoInterprete`: `detectado` no estado, zerado em `ouvir`

## 2. Detectar na tela

- [x] 2.1 `modoDaConversa.ts`: `detectarOutroGuardado`/`guardarDetectarOutro`
- [x] 2.2 `LiveCapture`: lado "A outra pessoa fala" com `aceitaAuto` (só com o automático disponível); `outro` vazio repassado à Página e ao Modo; resumo do diálogo; `interpretePossivel` e `idiomasDaConversa` sem o vazio
- [x] 2.3 Página e Modo: modo preso no automático com "Detectar"; rótulo "Detectando…"/"X · detectado"; dica de quem fala primeiro

## 3. UX por aparelho

- [x] 3.1 `ConversaDoPrototipo`: botão único de escuta (faixa no celular, base no computador, com `kbd`)
- [x] 3.2 "Repetir" só com tradução; "Parar voz" só com voz lendo
- [x] 3.3 Idioma da metade como botão; seta horizontal para trocar os lados no computador
- [x] 3.4 CSS: colunas só a partir de 760 px; iChat escondido com o intérprete aberto

## 4. Verificação

- [x] 4.1 typecheck, lint, vitest
- [x] 4.2 Capturas de tela: computador 1280, janela 390, celular (frente a frente), claro e escuro
