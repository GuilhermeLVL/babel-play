## Why

O repositorio nao tinha formatter, e a medicao mostrou que tambem nao tinha caos: `src/` fecha
statement com ponto e virgula e `server/`/`tests/`/`scripts/` nao.

## What Changes

- `prettier.config.mjs` com `semi` por area, `.editorconfig`, husky + lint-staged.
- `eslint-plugin-simple-import-sort` ligado; 664 avisos corrigidos.
- A passada GERAL do Prettier (1.111 arquivos) fica para depois das movimentacoes.

## Nao-escopo

Mover arquivo de lugar (a movimentacao por dominio e change propria) e mudar comportamento.

## Revisão de 25/11/2026

- **Estado: precisa decisão (o momento da passada geral), mas há um passo barato e sem conflito que pode ir antes.** O formatador, o hook e a ordenação de import estão no ar desde 09/09 e funcionam: todo arquivo tocado sai formatado. O que falta é a passada geral nos arquivos que ninguém tocou e a trava na CI. A CI não roda `prettier --check`, então um commit com `--no-verify` ou editado na web entra torto. Não foi possível medir a dívida nesta revisão (o worktree não tem dependências instaladas); a tarefa 1.5 mede. O nome "lint-estrito" ficou sem escopo próprio: o lint estrito (`--max-warnings 0`) e o `typecheck:estrito` já são portões da CI e pertencem a changes já arquivadas.
- **O que ficou velho:** o motivo de esperar "depois das movimentações" só vale se `estrutura-por-dominio-proposta` for aprovada; se for recusada, sobra apenas o conflito com PRs abertos. A contagem de 1.111 arquivos é de 09/09 e provavelmente encolheu.
- **Esforço: P** para a trava na CI (1.6) e a medição (1.5); **M** para a passada geral (1.7, mecânica, mas exige coordenar PRs abertos).
- **Valor para quem usa: baixo** (nenhum efeito visível ao usuário final); valor para quem desenvolve: médio (diffs só com mudança real e CI que impede regressão de formato).
- **Dependências:** `estrutura-por-dominio-proposta` (decide o motivo da espera), e TODAS as outras frentes vivas, porque a passada geral conflita com qualquer PR aberto; por isso é a última da ordem. Arquivos de conflito: todos os de `src/`, `server/`, `tests/` e `scripts/` que ainda estão fora do padrão; `.github/workflows/ci.yml` para a trava. Não toca produto, planos, flags nem IA.
- **Decisões do dono:**
  1. Trava na CI agora? (a) sim, só nos arquivos alterados do PR (recomendado: zero conflito e impede nova dívida); (b) esperar a passada geral e travar tudo de uma vez; (c) não travar.
  2. Passada geral: (a) uma única vez, num PR só de formatação, quando não houver PR aberto das outras frentes, com `.git-blame-ignore-revs` (recomendado, depois das frentes P1 e P2); (b) por pasta, em PRs pequenos, começando por `tests/` e `scripts/`; (c) nunca (só formatar o que for tocado).
  3. `estrutura-por-dominio-proposta`: se for recusada, a passada geral perde a razão de esperar e pode ir logo depois da trava; se for aprovada, vem depois da movimentação.
