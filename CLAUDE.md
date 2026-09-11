# Babel Play

## Redesign v3 — regras ativas (só nesta branch)

Fonte da verdade: `docs/redesign/PROMPT-REDESIGN-BABELPLAY.md`.
Estado em disco: `docs/redesign/PROGRESSO.md` e `docs/redesign/DECISOES.md` — releia os três
depois de qualquer compactação de contexto ou retomada de sessão, antes de agir.

### Guard rails

1. Todo o trabalho fica em `feat/redesign-design-system-v3`. Nunca commitar, mergear, rebasear
   ou fazer push em `main`. Nunca `push --force`, `reset --hard`, `clean -fd`, `stash drop`.
   Não tocar em outras branches (há sessões paralelas).
2. **Nada some.** Silêncio do design não é ordem de remoção. O que o app tem e o protótipo não
   mostra é mantido e reestilizado. Remoção só com registro em `DECISOES.md` provando onde a
   função passou a morar.
3. **Nada falso.** Nenhum número, preço, ranking, intervalo ou sucesso de ação hardcoded.
   Dado real ou estado honesto (vazio, carregando, erro, indisponível com motivo e saída).
4. **Testes são sagrados.** Não deletar, pular, enfraquecer nem forçar passagem. Trocar seletor
   por mudança de markup é permitido se a asserção de comportamento continuar idêntica e a troca
   for registrada em `docs/redesign/PARIDADE.md`.
5. Produção intocável: sem deploy, sem migration não-local, sem chave real de provedor pago.
   Backup do SQLite antes de qualquer migration local.
6. **Evidência antes de afirmação.** Toda afirmação cita `arquivo:linha`, saída de comando, hash
   de commit ou caminho de screenshot. Nada é "pronto" sem a verificação rodada nesta sessão.
7. Commits pequenos e verdes, conventional commits, um por tarefa, só depois do gate passar.
   Tag `redesign-checkpoint-F<n>` ao fim de cada fase.
8. Dependências: pode adicionar devDependency de teste/lint e biblioteca pequena justificada.
   Não trocar framework, roteador, gerenciador de estado nem biblioteca de estilo.

### Autonomia

Não perguntar ao operador. Diante de ambiguidade, decidir pela hierarquia — (1) comportamento e
dados reais vencem a aparência do protótipo; (2) acessibilidade AA vence fidelidade pixel a pixel;
(3) design v3 vence o visual atual; (4) consistência do DS vence exceção local; (5) na dúvida de
produto, a opção mais reversível, marcada `REVISAR` em `DECISOES.md`.

Falhou no gate 3 vezes seguidas, ou depende do operador? Marcar `[BLOQUEADO]` em `PROGRESSO.md`
com motivo e evidência e seguir para a próxima tarefa independente. Nunca parar tudo por um
bloqueio local.

### Gate

`bash scripts/redesign/gate.sh` — typecheck, lint, unitários, build, E2E nos 3 viewports e
integridade de testes (nenhum teste removido em relação à `main`, nenhum `.skip`/`.only` novo).
`GATE_PULAR_E2E=1` para iterar rápido; o gate de fim de fase roda inteiro.
