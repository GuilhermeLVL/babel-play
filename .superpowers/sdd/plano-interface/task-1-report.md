# Task 1 — Trilho por prioridade (Progresso e Planos) e "Mais" sem duplicata

Status: DONE (com ressalvas abaixo). Branch `interface/t1` (base `interface/anuncios-safari`).

## O que mudou

- `TrilhoDoQuest.tsx`: `NO_TRILHO` do computador = hub, capture, interprete, cartoes, play, library, estatisticas, planos (+ Buscar + Mais). No celular (`useBarraDeCinco`) o DOM só tem hub, capture, cartoes, play + Mais (sem `nth-child` escondendo botões; sem "Praticar"; sem Buscar no trilho, ela fica no "Mais").
- Item "Planos" mostra `<small class="q-estado">`: "Grátis · teste 14 dias" (free/anonimo) ou `PLAN_MATRIX[plano].rotulo` via `t()`; reage a `onPlanChange`; `aria-describedby`.
- "Mais": sem o ladrilho Planos (fica a faixa "Planos e Premium"); no computador sem Progresso/Biblioteca/Intérprete; no celular ganha Intérprete e Biblioteca na frente (`NO_MAIS_NO_CELULAR = ['interprete','library']`), depois Progresso, Personalizar, Ajustes.
- `navItems.ts`: Progresso (short), kids "Meu progresso", pro "Progresso", senior "Meu progresso".
- `InicioDoQuest.tsx`: no celular, cartão "Biblioteca" (`biblioteca-no-inicio`). O Intérprete já tinha o cartão "Conversar" no Início (todos os aparelhos), então não dupliquei.
- CSS: `celular.css` reordena os 5 botões (Início, Cartões, Capturar[centro, 2º no DOM], Jogar, Mais); removidas as regras `data-ct-nav='b'` de `cartoes.css` que escondiam por posição; `.q-estado` em `quest.css`.
- `lib/polimento/celular.ts`: removidos `ultimaPratica`/`PRATICAR` (sem uso); `lembrarPratica` fica (e2e de cartões lê `babel.praticar`).
- i18n: chaves novas em en/es/ar; xx e cobertura regeneradas.

## Testes

- Novos: `tests/trilhoPorPrioridade.test.tsx` (rótulo por perfil, estado do plano free/anonimo/essencial/premium); teste do cartão Biblioteca no Início (`questCasca`).
- Ajustados (não removidos): `questCasca`, `polimentoCelular` (5 botões, Cartões/Jogar próprios, Mais por celular/desktop), e2e `fundacao`, `cartoes`, `fumaca`, `_helpers` (sem "Praticar").
- vitest completo: 982 arquivos passando, 12432 testes. lint 0 avisos, typecheck ok, orfas/cobertura/pseudo `--check` ok.
- Playwright mobile-375 + desktop-1280: `-g "trilho|barra|Mais|Planos|Estat|Progresso"` 32 passed; fundacao, fumaca, cartoes, tema passam.

## Ressalvas

- Ordem visual no celular: Início · Cartões · Capturar · Jogar · Mais (Capturar fica no centro elevado, como o CSS já desenhava); o R40 lista "Início · Capturar · Cartões · Jogar · Mais". Trocar é só mudar os `order` em `celular.css`.
- `tests/e2e-publico/acessibilidade-porta.e2e.ts` roda toda "skipped" aqui (config pública), não foi possível provar.
- As abas "Cartões | Jogos" no alto das duas telas continuam no celular (não pedido para mexer).
- `knip` já tinha ruído anterior; não analisei.
- Em e2e (fundacao), o toque na aba "Cartões" a partir do Jogar precisou de `toPass` (a sala/recompensa engole o primeiro toque), como já se fazia em `cartoes.e2e.ts`.
