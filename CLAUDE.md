# Babel Play

## Redesign v3 — regras ativas (só nesta branch)

Fonte da verdade: `docs/redesign/PROMPT-REDESIGN-BABELPLAY.md` — **começando pela ERRATA no
topo dele**, que corrige as premissas do prompt original e vale sobre o corpo do arquivo.
Estado em disco: `docs/redesign/PROGRESSO.md` e `docs/redesign/DECISOES.md` — releia os três
depois de qualquer compactação de contexto ou retomada de sessão, antes de agir.

### Premissas corrigidas — não reintroduza estas lacunas

O prompt original descreve, em boa parte, as deficiências do **protótipo**, não as do app.
Medido no código e aceito pelo dono em 2026-09-11:

- **O back é Express 4 + TypeScript** (`server.ts`), não FastAPI/Python. Front React 19 + Tailwind 4.
- **O design system semântico já existe**: tokens em `src/index.css:5-107`, ponte `@theme` em
  `src/index.css:4`, 8 temas de cor (`data-theme`, `src/lib/theme.ts:107`) e 8 de fonte
  (`data-fonte`, `src/lib/appearance.ts:48`). A F4 não é criá-lo.
- **Os 18 jogos do protótipo existem todos**, com def (`src/core/minigames/types.ts:147-181`) e
  componente (`src/components/views/play/telaDoJogo.ts:17-35`). A P3 é vazia.
- **Contraste AA já é travado por teste**: `tests/contrastePaletas.test.ts`, 7 temas × claro/escuro,
  limiar 4,5:1, rodando no `test:unit`.
- Responsivo, ícones self-hosted, ausência de "em breve" e de `href="#"`: idem, já resolvidos.

**INVÁLIDAS** como lacuna do app, com evidência na ERRATA: "não existe design system formal",
"contraste reprovado", "acessibilidade ausente", "zero `@media`", "ícones de CDN",
"dados de mentira", "links mortos", "FSRS inclui Relearning" (o agendador é de estado contínuo,
`scheduler.ts:20-35`; `relearning` não existe no código).

Eram verdadeiras e **já foram corrigidas nesta branch**: fontes por CDN (`src/index.css:1`) e
ausência de acessibilidade automatizada.

A matriz real está em `PARIDADE.md`: 27 `coberto`, 33 `gap-design`, 2 `novo` — o protótipo cobre
menos da metade do app. `gap-design` **não é ordem de remoção** (regra 2).

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
