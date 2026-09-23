# Fundação — levar o protótipo aprovado para o app (subprojeto 0 de 6)

**Data:** 23/09/2026 · **Estado:** aprovado pelo dono · **Referência visual:** `docs/prototipos/consistencia-telas.html` (rodadas 1–14)

## Por quê
Entre 22 e 23/09 o dono aprovou, rodada a rodada, um protótipo navegável que mantém o design atual (ícones, detalhes) e o torna consistente em todas as telas, com escuro "café", subtelas completas, jogos com efeitos, Termo com escada, menu recolhível e iChat fixo. O trabalho de levar isso ao app foi dividido em 6 subprojetos, nesta ordem:

| # | Subprojeto | Rodadas do protótipo |
|---|---|---|
| **0** | **Fundação** (este documento) | 1–3, 13, 14 |
| 1 | Consistência das 13 telas | 1–4, 6 |
| 2 | Jogos | 10–12 |
| 3 | Subtelas | 9 |
| 4 | iChat contextual | 5 |
| 5 | Conta, LGPD, estatísticas, notificações, assinatura (depois da `fix/pre-deploy-p0`) | 7–8 |

Decisões do dono: commits direto no `main` local; menu **lateral esquerda** por padrão (quem escolheu outra posição mantém); abordagem **estender o que existe** em vez de reescrever o shell.

## O que o app já tem (não refazer)
- Menu lateral recolhível — `src/components/shell/NavRail.tsx` (68/232 px, `babel.rail_collapsed`).
- iChat em coluna fixa — `src/components/IChat.tsx` (modo `isDocked`, `ichat_docked`).
- Escuro por tema — blocos `[data-theme=X].dark` em `src/index.css`.
- Efeitos — `src/lib/juice.ts` (`comemorar`, `tremor`, `tremorDeTela`, `pulsoDeZoom`, `flashDeTela`, `pontosFlutuantes`, `movimentoReduzido`), `effects.ts`, `gameFeel.ts`, sons em `soundFx.ts`.

## Escopo da Fundação
1. **Referência versionada:** protótipo, auditorias (`docs/auditoria/lacunas-produto-2026-09-23.md`, `subtelas-2026-09-23.md`, `design-v4-2026-09-22/`) e as suítes `docs/prototipos/verifica-*.mjs`.
2. **Tokens (`src/index.css`):**
   - escuro do tema Babel vira "café" (fundo `#17130F`, cartão `#211C17` e a família de tintas/bordas do protótipo), no lugar do azulado `#0B0E14`/`#151922`. Os outros temas não mudam;
   - elevação em 3 níveis: `--shadow-card` (existe) + `--shadow-lift` + `--shadow-pop`;
   - curvas `--ease` (`cubic-bezier(.16,1,.3,1)`) e `--ease-mola` (`cubic-bezier(.34,1.56,.64,1)`), substituindo as escritas à mão.
3. **Componentes compartilhados (`src/components/ui/`, só tokens):**
   - `Tela` — largura `larga | estreita`;
   - `CabecalhoDeTela` — sobrancelha com ícone, título (o único `h1` da tela), subtítulo, ações, abas, "voltar";
   - `TituloDeSecao` — ícone, título (`h2`/`h3`), descrição, conteúdo à direita;
   - `IconeEmBloco` — ícone num quadrado com o tom do tema.
   Adotados na Fundação em **Início** e **Ajustes** (as telas-molde escolhidas); as outras 11 telas migram no subprojeto 1.
4. **Shell:**
   - posição padrão do menu `'left'` quando não há preferência salva;
   - menu recolhível ganha `Ctrl/⌘+B` e a dica com o nome visível ao passar o mouse ou focar;
   - o `<main>` vira container (`container-type: inline-size`, nome `conteudo`) para o conteúdo se adaptar à própria largura — infraestrutura; as telas adotam no subprojeto 1;
   - iChat fixo ganha largura arrastável (320–560 px, `ichat_largura`), volta a flutuar sozinho quando o conteúdo ficaria com menos de 440 px, e botões do cabeçalho com nome acessível.
5. **Efeitos novos (`src/lib/juice.ts`):** `contagem321`, `contarAte`, `pausaDeImpacto`, `vinheta`, `desfoqueDeGolpe`, `entradaDeCamera`. Com movimento reduzido, viram imediatos ou estáticos; o som segue a chave de som já existente.
6. **Testes:** Vitest dos componentes e dos efeitos; E2E `tests/e2e/fundacao.e2e.ts` com `@axe-core/playwright` (WCAG 2.2 AA) em Início e Ajustes nos 3 tamanhos do projeto, menu recolhível (botão, atalho, lembrar) e iChat fixo (arrastar, sem rolagem lateral, volta a flutuar).

## Fora do escopo
Migrar as demais telas, jogos, subtelas, iChat contextual, backend e preços.

## Critérios de aceitação
- CI local verde: `typecheck`, `lint`, `morto:arquivos`, `morto:ciclos`, `test` (inclui contraste das paletas e primitivos de UI), `build`, `test:e2e`.
- Escuro Babel com contraste AA nos pares de texto (teste de contraste existente).
- Início e Ajustes sem violação de axe nos 3 tamanhos; nenhuma rolagem lateral com iChat fixo em 1100 px.
- Com `prefers-reduced-motion`, nenhum efeito novo anima.
