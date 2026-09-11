# ERRATA — LEIA ANTES DO RESTO DESTE ARQUIVO

> **Aceita pelo dono em 2026-09-11.** A seção 1 deste prompt descreve, em boa parte, as
> deficiências do **PROTÓTIPO**, não as do app. Cada afirmação abaixo foi medida no código desta
> branch. **Se o corpo do prompt discordar desta errata, vale a errata.**
>
> Quem relê este arquivo depois de uma compactação de contexto: as premissas marcadas
> **INVÁLIDA** já foram refutadas com `arquivo:linha`. Não as reintroduza como lacunas.

## Premissas corrigidas

| O prompt diz | Correto | Evidência |
|---|---|---|
| Back em FastAPI/Python | **Express 4 + TypeScript** | `server.ts`, `server/`, `package.json` dep `express` |
| — | Front React 19 + **Tailwind CSS 4** (`@tailwindcss/vite`) | `package.json`, `src/index.css:2` |
| — | Testes: Vitest (unitários) + Playwright em **3 viewports** | `vitest.config.ts`, `playwright.config.ts:41-60` |

## P0 da seção 1 marcadas INVÁLIDAS

| # | Afirmação do prompt | Veredito | Evidência |
|---|---|---|---|
| 1 | "**Não existe design system formal**: tudo é estilo inline" | **INVÁLIDA para o app** (verdadeira só para o protótipo) | Camada de tokens semânticos em `src/index.css:5-107`: `--canvas`, `--surface`, `--ink`, `--ink-muted`, `--ink-faint`, `--accent`, `--accent-soft`, `--accent-ink`, `--good`, `--warn`, `--rare`, `--error`, `--border-subtle`, `--font-display/body/mono`, raios e sombras. Ponte `@theme` do Tailwind 4 em `src/index.css:4` — os utilitários nunca carregam hex. **8 temas de cor** por `data-theme` (`src/lib/theme.ts:107`, `:87`) e **8 temas de fonte** por `data-fonte` (`src/lib/appearance.ts:48`). |
| 2 | "**Contraste reprovado** (WCAG 2.2 AA, recalcule)" | **INVÁLIDA para o app** | `tests/contrastePaletas.test.ts` mede os pares de token em **7 temas × claro/escuro** com limiar 4,5:1 e roda no `test:unit`. Os pares incluem `['accent-ink','canvas']` e `['accent-ink','surface']` (`:51-77`). Os hex reprovados que o prompt cita (`#8C867C`, `#F04E23` como texto) são do **protótipo**. |
| 3 | "**Acessibilidade ausente**: zero `aria-*`, zero foco, 47 `div` com `onClick`" | **INVÁLIDA para o app** | Descreve o protótipo. O app tem `role`/`aria-*` em uso (ex.: `shell/MobileNav.tsx:19` `aria-label="Navegação principal"`, tablist em `Analysis.tsx:717`), pilha de `Esc` (`src/lib/camadasDeEscape.ts:18`) e Ctrl+K (`CommandPalette.tsx:192`). **Era verdade que faltava a11y AUTOMATIZADA** — corrigido nesta rodada: `@axe-core/playwright` + `tests/e2e/acessibilidade.e2e.ts`. |
| 4 | "Zero `@media`: frame fixo de 1360×860" | **INVÁLIDA para o app** | Dock mobile própria (`shell/MobileNav.tsx:19`, `md:hidden`), barra/rail em 4 posições (`StudioHeader.tsx:51`), E2E em 375/768/1280 (`playwright.config.ts:41-60`). |
| 5 | "Ícones vêm de CDN" | **INVÁLIDA** | `lucide-react` via npm (`package.json`). Nenhum CDN de ícone no app. |
| 6 | "O protótipo lista 18 jogos; **compare com os adapters que realmente existem**" | **Comparado: os 18 existem** | `MinigameId` em `src/core/minigames/types.ts:18-21`; `MINIGAMES: Record<MinigameId, MinigameDef>` em `:147-181` (um por linha); mapa id→componente em `src/components/views/play/telaDoJogo.ts:17-35`; lista derivada que o servidor consome em `src/core/minigames/revelavel.ts:301`. **Nenhum jogo a implementar — a P3 do prompt é vazia.** |
| 7 | "Toasts 'em breve' contradizem a regra" e "**links mortos** com `href="#"`" | **INVÁLIDAS para o app** | Zero "em breve" em string de interface (as 19 ocorrências em `src/` estão dentro de comentários que documentam a remoção); zero `href="#"` ou vazio — `Sobre.tsx:27` tem guarda que não renderiza link sem destino. |
| 8 | "**Dados de mentira**" | **INVÁLIDA como lacuna do app** | Já travado por `tests/semConteudoFabricado.test.ts` e `tests/contagemHonesta.test.ts`. Os dados falsos listados são do protótipo (ver `DESIGN-SPEC.md` §7.2). |
| 9 | "Vocabulário usa New/Learning/Review; o app tem FSRS-5 real, **que inclui Relearning**" | **INVÁLIDA nos dois lados** | O agendador é de **estado contínuo** — `stability`, `difficulty`, `reps`, `lapses` (`src/core/learning/scheduler.ts:20-35`); "novo" é `stability === undefined` (`:109`). `relearning` não existe em `src/` nem em `server/`. |
| 10 | "**Fontes vêm de CDN**, o que conflita com a promessa offline" | **VERDADEIRA — e corrigida** | Era real (`src/index.css:1`, 14 famílias do Google). Self-hospedadas via `@fontsource` nesta rodada; travado por `tests/fontesSemCdn.test.ts`. |

## P1/P2 da seção 6 que já existiam no app

Sessão com 4 abas (`Analysis.tsx:717-752`) e modal Exportar (`:703`); Loja com 4 abas
(`Loja.tsx:482-485`); Perfil com 3 abas (`Perfil.tsx:56`); busca Ctrl+K
(`BuscaGlobal.tsx` sobre `CommandPalette.tsx`); iChat em 3 estados (`App.tsx:400`); menu de conta
(`shell/MenuDaConta.tsx:95-158`); gaveta de Capturar, Foco Cheio, Bingo, Falantes
(`LiveCapture.tsx:1586`, `:2491`, `:2299`, `:2374`); Ajustes com 4 abas (`Settings.tsx:57-62`);
Importar com 4 fontes (`Library.tsx:619`); lobby facetado, Sala de Escolha, Recordes
(`Play.tsx:2988`, `:2733`, `:3355`); ranking global real (`server/routes/rank.ts:29-92`).

**Só Antessala e Raspadinha são `novo` de verdade** — e as duas já têm o dado pronto
(`montarRodada` devolve `previa` em `rodada.ts:89-93`; a economia é real).

## O que de fato sobrou como lacuna

Ver `LACUNAS.md`, reescrito a partir de medição. A matriz completa está em `PARIDADE.md`:
**27 `coberto`, 33 `gap-design`, 2 `novo`** — o protótipo cobre menos da metade do app.

---

# Redesign do Babel Play — Design System v3 com paridade total

Você é um engenheiro sênior de frontend e design systems, com disciplina de migração em produção. Vai levar o Babel Play (aplicação praticamente pronta, com muitas telas funcionais) para o design do protótipo v3, **sem perder nenhuma funcionalidade, sem cair a qualidade e sem inventar comportamento falso**. Além de seguir o design, você identifica o que o protótipo não cobre (lacunas) e implementa essas partes alinhadas ao design system.

O operador estará longe do computador. Trabalhe de forma autônoma do início ao fim, seguindo o protocolo de autonomia da seção 3. Este arquivo é a fonte da verdade: após qualquer compactação de contexto ou retomada de sessão, releia este arquivo, `docs/redesign/PROGRESSO.md` e `docs/redesign/DECISOES.md` antes de agir.

---

## 1. Contexto

**Produto.** Babel Play (antigo TradutorWeb): app web de aprendizado de idiomas. Captura áudio do sistema/aba/mic, transcreve e traduz, gera material de estudo; importa YouTube, web, documentos e áudio; vocabulário com FSRS-5 e pipeline CEFR-J; jogos com adapters e montagem de rodada no servidor (`montarRodada`); economia de "seeds", temas e personalização; planos grátis/pago/pro; BYOK e execução local. Stack principal esperada: React/TypeScript no front e FastAPI/Python no back — **confirme lendo o repositório, não presuma** (gerenciador de pacotes, framework de estilo, roteador, i18n, biblioteca de ícones, runner de testes).

**Regras de produto já estabelecidas.** Ícones SVG, nunca emoji. Toda métrica exibida vem de dado real com fonte. Nada de "em breve" como beco sem saída: quando algo não está disponível, mostra o motivo e uma porta de saída.

**O design.** Protótipo interativo `Babel Play - Protótipo v3 (interativo)` exportado do Claude Design (arquivo HTML com `<x-dc>`, templates `sc-if`/`sc-for` e a lógica numa classe `Component extends DCLogic`). Localize-o no repositório (ex.: `find . -iname "*prot*tipo*v3*"`; caminho preferido `docs/redesign/source/`). Se o Claude Design MCP estiver conectado, use-o como fonte complementar. O HTML depende de `./support.js`; se esse arquivo não existir, **não tente renderizar às cegas**: extraia a especificação lendo o template e a lógica. Se existir, renderize com Playwright e navegue pelos estados para gerar screenshots de referência.

**O que já foi levantado no protótipo (verifique cada item você mesmo, com linha do arquivo):**

- Navegação com 9 itens: Início, Capturar, Jogar, Biblioteca, Vocabulário, Personalizar, Sobre, Planos, Ajustes. Telas internas: Sessão (Transcrição/Leitura/Jogos/Métricas), sessões de exercício (gravar, ditar, reescrever, genérica), Recordes (meus/global), Importar (YouTube/Doc/Web/Áudio), Ajustes (Idiomas/Aparência/Contas/Conta), Personalizar (Temas/Partículas/Cursores/Perfis), Onboarding em 8 passos, Planos.
- A tela **Progresso existe mas está órfã**: nenhum elemento chama `goProgresso`. O changelog diz que o conteúdo de CEFR/semana deve migrar para Vocabulário.
- O próprio changelog do protótipo lista o que **não foi desenhado**: Sessão com 4 abas + modal Exportar real; lobby de Jogar com facetas/Antessala/Raspadinha/Resumo; mecânica própria dos 18 jogos; Loja real (Meu visual/Loja/Passe/Desafios, duas moedas); Perfil (3 abas); busca, iChat e menu de conta reais; gaveta de Capturar + PiP + Falantes; estados vazio/carregando/erro por tela; mobile 375px.
- **Não existe design system formal**: tudo é estilo inline com cerca de 40 hex distintos, cerca de 20 tamanhos de fonte (9.5 a 28px, com meios pixels: 12, 12.5, 13, 13.5…) e 10 raios diferentes. Classes só para `.card`, `.btnPrimary`, `.btnGhost`.
- O catálogo de temas (`temasCatalog`) já define o modelo semântico: `canvas`, `surface`, `ink`, `accent` — inclusive temas escuros (Deep Emerald, Amethyst Night, Arcade). Os tokens precisam nascer desse modelo.
- **Acessibilidade ausente**: zero `aria-*`, zero estilos de foco, zero `tabindex`; 47 `div`/`span` com `onClick` (inacessíveis por teclado). Zero `@media`: frame fixo de 1360×860.
- **Contraste reprovado** (WCAG 2.2 AA, recalcule): `#8C867C` sobre `#F5F2EA` = 3.23:1 (usado ~22 vezes em texto pequeno); `#F04E23` como texto = 3.23:1; branco sobre `#F04E23` = 3.61:1; borda de input `#C6BFAC` sobre `#F5F2EA` = 1.64:1 (componente de UI exige 3:1). Pontos de partida que passam: texto sutil `#69645D` (≥4.5:1 em `#F5F2EA`, `#EFEAD9` e `#E6E2D6`); accent como texto `#B93613`; texto sobre accent `#3D1105` (4.54:1); borda de input `#8C867C` (3.23:1).
- **Dados de mentira no protótipo** que não podem virar código fixo: "Nível 12 · 340/500 XP", "14 palavras novas", "20 palavras · 4 min", ranking global com "Guilherme", recordes, intervalos FSRS nos botões (10m/1.2d/3.5d/8d), "85 MB", "R$ 9,90/mês", `seeds: 1200`, preços dos temas.
- **Ações simuladas**: toasts "Exportado", "Assinatura simulada", "Importado de…", "Reproduzindo áudio…", e toasts "Busca em breve", "Configurações de captura em breve", "iChat chega em breve" (contradizem a regra de não ter "em breve").
- **Links mortos**: "Ver estatísticas detalhadas", "Privacidade", "Termos" com `href="#"` sem destino.
- Vocabulário usa New/Learning/Review como aproximação; o app tem FSRS-5 real, que inclui Relearning.
- O protótipo lista 18 jogos; compare com os adapters que realmente existem no servidor.
- Fontes (Inter, Archivo, IBM Plex Mono, Silkscreen só na marca) e ícones Lucide vêm de CDN, o que conflita com a promessa de funcionar offline e local.

---

## 2. Regras invioláveis (guard rails)

1. **Branch isolada.** Todo o trabalho acontece em `feat/redesign-design-system-v3`, criada a partir da `main` atualizada. Nunca commite, faça merge, rebase ou push na `main`/`master`. Nunca faça force push, `git reset --hard`, `git clean -fd` ou `git stash drop`. Não toque em outras branches (o operador roda sessões paralelas).
2. **Nada some.** Toda funcionalidade, rota, tela, estado, atalho, configuração e fluxo que existe hoje continua existindo e funcionando. Silêncio do design não é ordem de remoção: o que existe no app e não aparece no protótipo é mantido e reestilizado com o design system. Remoção só com registro em `DECISOES.md` provando equivalência (onde a função passou a morar).
3. **Nada falso.** Nenhum número, ranking, preço, intervalo, progresso ou sucesso de ação hardcoded. Dado real ou estado honesto (vazio, carregando, erro, indisponível com motivo e porta de saída). Funcionalidade sem backend fica atrás de feature flag desligada, com spec escrita, e não aparece na navegação.
4. **Testes são sagrados.** Não delete, pule (`skip`/`only`), enfraqueça nem force a passagem de testes existentes. Alterar seletor de teste por mudança de markup é permitido desde que a asserção de comportamento continue idêntica e a alteração seja registrada em `docs/redesign/PARIDADE.md`.
5. **Produção é intocável.** Nenhum deploy, nenhuma migration em banco que não seja local, nenhum uso de chaves reais de provedores pagos. Antes de qualquer migration local, faça backup do arquivo SQLite.
6. **Evidência antes de afirmação.** Toda afirmação em relatório cita `arquivo:linha`, saída de comando, hash de commit ou caminho de screenshot. Nunca declare algo pronto sem ter rodado a verificação correspondente nesta sessão.
7. **Commits pequenos e verdes.** Conventional commits, um por tarefa, somente depois do gate passar. Tag de checkpoint ao fim de cada fase (`redesign-checkpoint-F<n>`). Se houver remote, faça push **apenas da branch** ao fim de cada fase, como backup.
8. **Escopo de dependências.** Pode adicionar devDependencies de teste/lint e bibliotecas pequenas e justificadas (ex.: fontes self-hosted). Nada de trocar framework, roteador, gerenciador de estado ou biblioteca de estilo existente.

---

## 3. Protocolo de autonomia

- **Não pergunte ao operador.** Não use a ferramenta de perguntas ao usuário nem termine a vez esperando resposta. Diante de ambiguidade, decida pela hierarquia abaixo, registre e continue.
- **Hierarquia de decisão:**
  1. Comportamento e dados reais existentes vencem a aparência do protótipo.
  2. Acessibilidade WCAG 2.2 AA vence fidelidade pixel a pixel (ajuste o token no mínimo necessário e registre).
  3. Design v3 vence o visual atual.
  4. Consistência do design system vence exceção local.
  5. Na dúvida de produto, escolha a opção mais reversível e marque `REVISAR` em `DECISOES.md`.
- **Formato de `DECISOES.md`:** `D-### | data | contexto | opções consideradas | escolha | motivo | reversível? | REVISAR?`.
- **Bloqueios.** Se uma tarefa falhar no gate 3 vezes seguidas, ou depender de algo que só o operador resolve (credencial, conta paga, decisão de negócio irreversível), marque `[BLOQUEADO]` em `PROGRESSO.md` com motivo e evidência, e siga para a próxima tarefa independente. Nunca pare o trabalho inteiro por um bloqueio local.
- **Ação negada pelo modo de permissão.** Não repita a mesma ação. Busque uma alternativa segura dentro destas regras ou registre como bloqueio e siga.
- **Estado em disco, não na memória.** `PROGRESSO.md` é atualizado a cada tarefa concluída. No início da sessão, acrescente ao `CLAUDE.md` do projeto (só nesta branch) uma seção curta "Redesign v3 — regras ativas" resumindo as seções 2 e 3 e apontando para este arquivo.

---

## 4. Ferramentas

Na Fase 0, descubra o que está disponível (`claude mcp list`, skills e plugins instalados, scripts do `package.json`/`pyproject`) e registre em `docs/redesign/FERRAMENTAS.md`. Use o que existir; nunca trave por falta de uma ferramenta — use o fallback indicado.

| Necessidade | Preferência | Fallback |
|---|---|---|
| Navegar, clicar, screenshot em 1360×860 e 375×812, fluxos E2E | Playwright MCP / Playwright já configurado no projeto | Instalar `@playwright/test` como devDependency |
| Acessibilidade automatizada | `@axe-core/playwright` nas rotas migradas | Checagem manual de roles, labels e foco registrada |
| Documentação de bibliotecas na versão certa | Context7 MCP | Ler `node_modules`/docs oficiais |
| Fonte do design | Arquivo do protótipo no repo; Claude Design MCP se conectado | Leitura estática do HTML |
| Especificação e rastreio de mudanças | OpenSpec (pasta `openspec/` e CLI) | Mesma estrutura em markdown |
| Lacunas onde o design é silencioso | Skill/plugin `frontend-design`, se instalado, **sempre subordinado aos tokens e primitivos do DS** | Derivar dos padrões já presentes no protótipo |
| Revisão de diff | `/code-review` ao fim de cada fase | Subagente revisor read-only |
| Telas com chaves de API (BYOK) | Plugin `security-guidance`, se instalado | Checklist: chave nunca volta ao navegador nem vai para log |

**Subagentes.** Use subagentes read-only em paralelo para inventário (rotas/telas do front, endpoints do back, jogos/adapters, stores e estados). A implementação fica na thread principal, uma tela por vez, para garantir consistência. Na verificação final, um subagente **que não escreveu código** audita a paridade de forma independente.

---

## 5. Método: spec-driven com OpenSpec

Cada bloco de trabalho vira uma change OpenSpec antes de virar código: `proposal.md` (por quê e escopo), `design.md` (decisões técnicas e tokens envolvidos), `tasks.md` (checklist executável) e deltas de spec com requisitos e cenários QUANDO/ENTÃO testáveis. Valide com `openspec validate <id> --strict` quando a CLI existir. **Não arquive as changes**: deixe para revisão humana.

Changes previstas (ajuste os nomes às convenções que já existem no repositório):

- `redesign-ds-foundation` — tokens, tipografia, primitivos, temas, guard rails de lint
- `redesign-shell-nav` — layout, sidebar, header, responsivo, foco, rotas
- `redesign-screen-<tela>` — uma por tela
- `redesign-gaps-<tema>` — lacunas funcionais (estados, exportar, busca, economia, progresso etc.)
- `game-<id>-mechanics` — uma por jogo novo, se chegar à P3

---

## 6. Fases

### F0 — Preparação e segurança

1. `git status` limpo (arquivos não rastreados em `docs/redesign/` podem vir junto). `git fetch`, atualize a `main`, crie `feat/redesign-design-system-v3`.
2. Crie um worktree de baseline da `main` (ex.: `../babelplay-baseline`) para rodar a versão atual em porta separada durante todo o trabalho.
3. Descubra a stack e registre em `FERRAMENTAS.md`: como subir front e back, como rodar lint, typecheck, testes unitários, E2E e build.
4. Crie `docs/redesign/` com: `PROGRESSO.md`, `DECISOES.md`, `FERRAMENTAS.md`, `INVENTARIO.md`, `DESIGN-SPEC.md`, `PARIDADE.md`, `LACUNAS.md`, `evidencias/`.
5. Crie `scripts/redesign/gate.sh` (seção 7) e rode-o na branch recém-criada para provar que está verde antes de qualquer mudança. Se a `main` já estiver vermelha, registre as falhas pré-existentes em `PROGRESSO.md` como linha de base e não as conte como regressão (mas não as esconda).

**Gate F0:** `gate.sh` executado com resultado registrado; baseline sobe; commit `chore(redesign): scaffolding e gates`.

### F1 — Inventário do app atual (antes de tocar em UI)

1. Liste com `arquivo:linha`: rotas, telas, modais/drawers, abas, componentes compartilhados, chamadas de API por tela, stores/estado global, feature flags, textos i18n, atalhos de teclado, estados de erro/vazio/carregando existentes, integrações (captura, PiP, exportação, BYOK, FSRS, jogos, economia, planos).
2. Transforme o inventário em uma **suíte de paridade** Playwright (`e2e/paridade/`): um teste por funcionalidade observável, com seletores por role/texto/`data-testid`, asserções de comportamento (não de estilo). Use dados de seed locais.
3. Rode a suíte de paridade **contra o baseline** e registre a contagem de testes aprovados. Testes que falham no baseline devem ser corrigidos (o teste está errado) ou marcados como bug pré-existente, nunca silenciosamente removidos.
4. Screenshots do baseline por rota em 1360×860 (e 375×812 se o app já tiver algum responsivo) em `evidencias/baseline/`.

**Gate F1:** `INVENTARIO.md` completo; suíte de paridade verde no baseline com N testes registrados em `PROGRESSO.md`; commit.

### F2 — Extração do design

1. Leia o template e a classe `DCLogic` do protótipo. Para cada tela e estado, documente em `DESIGN-SPEC.md`: hierarquia, componentes, textos, interações, estados e transições, com referência de linha do protótipo.
2. Extraia os valores brutos (cores com frequência, tamanhos de fonte, pesos, raios, espaçamentos, sombras, animações) e proponha a **normalização**:
   - Cores semânticas a partir de `canvas / surface / ink / accent`, mais derivados: `surface-sunken`, `ink-muted`, `ink-subtle`, `border`, `border-strong` (inputs), `accent-hover`, `accent-soft`, `accent-ink` (texto sobre accent), `accent-text` (accent como texto), `success`, `warning`, `danger`, e as cores de modalidade de jogo (palavra, frase, frase falada). Valide contraste em **todos** os temas do catálogo, claros e escuros.
   - Escala tipográfica enxuta (ex.: 11 / 12 / 13 / 14 / 16 / 20 / 24 / 28) por papel: `label-mono`, `caption`, `body-sm`, `body`, `title-sm`, `title`, `display`. Archivo para títulos, Inter para texto, IBM Plex Mono para rótulos e números, Silkscreen apenas na marca.
   - Escala de raio (ex.: 8 / 10 / 12 / 16 / pill) e de espaçamento.
   - Movimento: durações e curvas, com `prefers-reduced-motion`.
3. Se renderizável, gere screenshots de referência do protótipo por tela em `evidencias/referencia/`.

**Gate F2:** `DESIGN-SPEC.md` com tabela de tokens (valor bruto → token → contraste verificado); commit.

### F3 — Matriz de paridade e lacunas

1. `PARIDADE.md`: cada item do inventário mapeado para a tela/componente do design, com status `coberto` (o design tem), `gap-design` (o app tem, o design não: manter e desenhar com o DS), `novo` (o design tem, o app não). Nenhum item do inventário pode ficar sem linha.
2. `LACUNAS.md`, priorizado:
   - **P0 — impede o redesign de ser correto:** tokens/DS, contraste AA, navegação por teclado e foco visível, semântica (botões reais em vez de `div` clicável), estados vazio/carregando/erro nas telas migradas, remoção de todo dado fake e de todo "em breve", links mortos, tela Progresso órfã (redistribuir para Vocabulário ou dar acesso real), FSRS com os 4 estados reais e intervalos vindos do agendador, fontes e ícones self-hosted, strings via i18n se o app tiver i18n.
   - **P1 — lacunas de experiência que o design pede e o app suporta:** responsivo 375px (o design é silencioso: derive navegação e grids do DS e registre a decisão), Sessão com 4 abas e Exportar real, busca real, menu de conta, gaveta de Capturar/PiP/Falantes quando a capacidade já existe no app, saldo de seeds visível e compras debitando de verdade.
   - **P2 — lacunas que exigem backend novo ou regra de produto:** Loja (Meu visual/Loja/Passe/Desafios), Perfil com 3 abas, lobby de Jogar com facetas/Antessala/Raspadinha/Resumo, iChat. Implemente o que for coerente com a arquitetura existente; o que exigir decisão de negócio fica com spec pronta e feature flag desligada.
   - **P3 — mecânicas dos jogos do protótipo que não têm adapter.** Só depois de P0–P2 verdes. Um jogo por change, seguindo o contrato de adapter e `montarRodada` já existente no servidor, com testes do adapter.
3. Crie as changes OpenSpec correspondentes.

**Gate F3:** todo item do inventário presente em `PARIDADE.md`; `LACUNAS.md` priorizado; changes validadas; commit.

### F4 — Fundação do design system

1. Tokens como CSS custom properties semânticas, com os temas do catálogo aplicáveis por atributo/classe na raiz, integradas à solução de estilo que o projeto já usa.
2. Primitivos acessíveis: `Button` (primary/ghost/danger/icon, com loading e disabled), `Card`, `Tabs`, `Chip/Badge`, `Input`, `Select`, `Toggle`, `Modal`, `Drawer`, `Toast` (com `aria-live`), `Tooltip`, `ProgressBar`, `EmptyState`, `Skeleton`, `ErrorState`, e `LockedState` (padrão do protótipo: motivo + ação de saída). Foco visível consistente, alvos de toque de pelo menos 24×24px, labels associados.
3. Guard rails automáticos: regra de lint que proíbe hex/rgb e tamanhos de fonte soltos fora do arquivo de tokens nos arquivos novos ou alterados; teste que verifica contraste dos pares de tokens em todos os temas.
4. Página interna de catálogo do DS disponível só em desenvolvimento, com todos os primitivos e estados, e screenshot dela em cada tema.

**Gate F4:** `gate.sh` verde; teste de contraste verde; catálogo renderizado com screenshots; commit e tag.

### F5 — Migração tela a tela (strangler)

Ordem: shell e navegação → Início → Biblioteca → Sessão → Capturar e Importar → Vocabulário e Revisar → Jogar (lobby e sessões) e Recordes → Personalizar → Planos → Sobre → Ajustes → Onboarding → telas do app fora do design (`gap-design`).

Para **cada tela**, antes de marcar `[x]`:

- [ ] Todos os itens de `PARIDADE.md` daquela tela presentes e funcionando
- [ ] Visual fiel ao `DESIGN-SPEC.md` usando só tokens e primitivos
- [ ] Estados vazio, carregando e erro implementados com dados reais
- [ ] Nenhum dado fake, nenhum "em breve", nenhum link morto
- [ ] Teclado: tudo alcançável e operável, ordem de foco lógica, `Esc` fecha overlays e o foco volta ao gatilho
- [ ] axe sem violações sérias ou críticas
- [ ] Screenshots em 1360×860 e 375×812 em `evidencias/F5/<tela>/`, lado a lado com baseline e referência
- [ ] Suíte de paridade inteira verde (não só a da tela)
- [ ] `gate.sh` verde, commit, `PROGRESSO.md` atualizado com hash e caminhos das evidências

### F6 — Lacunas funcionais

Execute `LACUNAS.md` na ordem P1 → P2 → P3, cada item pela sua change OpenSpec, com testes novos para o comportamento novo e os mesmos critérios de pronto da F5.

### F7 — Verificação final independente

1. `gate.sh` completo, suíte de paridade completa (mesma contagem do baseline mais os testes novos, zero falhas), axe em todas as rotas, build de produção.
2. Subagente auditor read-only, que não escreveu código, compara `INVENTARIO.md` com a branch, abre o app e confirma cada item de `PARIDADE.md` com evidência. Divergência vira tarefa em `PROGRESSO.md` e volta para F5/F6.
3. `/code-review` no diff completo contra `main`; corrija os achados relevantes.
4. Escreva `docs/redesign/RELATORIO-FINAL.md` (seção 8).
5. Push da branch e, se `gh` estiver autenticado, abra **PR em draft** para `main` com o resumo do relatório. Não faça merge.

---

## 7. `scripts/redesign/gate.sh`

Script idempotente que sai com código diferente de zero em qualquer falha e imprime um resumo final. Deve rodar, adaptando aos comandos reais do projeto:

1. Typecheck do front
2. Lint (incluindo a regra de tokens da F4)
3. Testes unitários do front e do back
4. Build de produção do front
5. Suíte de paridade E2E
6. Checagem axe nas rotas já migradas
7. Teste de contraste dos tokens
8. Verificação de integridade: nenhum arquivo de teste removido em relação à `main` (`git diff --diff-filter=D --name-only main -- '<padrões de teste>'` precisa sair vazio) e nenhum `.skip`/`.only` novo

---

## 8. Relatório final (`RELATORIO-FINAL.md`)

Direto e verificável, na ordem:

1. **Estado:** o que está pronto, com contagem de telas migradas e itens de lacuna por prioridade.
2. **Paridade:** N testes no baseline → M testes na branch, zero falhas; link para `PARIDADE.md`.
3. **Decisões para revisar:** todas as linhas `REVISAR` de `DECISOES.md`, cada uma em uma frase.
4. **Bloqueios:** o que ficou `[BLOQUEADO]`, por quê e o que o operador precisa fazer.
5. **Desvios do design:** onde e por que o resultado difere do protótipo (contraste, acessibilidade, dados reais).
6. **Evidências:** caminhos das screenshots comparativas por tela.
7. **Riscos e próximos passos.**

---

## 9. Antipadrões proibidos

- Reescrever uma tela do zero descartando lógica existente em vez de trocar a camada visual.
- Copiar o estilo inline do protótipo para o código.
- Declarar "pronto" com base em leitura de código sem rodar app, testes e screenshots.
- Criar componentes paralelos quando já existe um equivalente no projeto: evolua o existente.
- Resolver lacuna com placeholder visual, toast simulado ou dado inventado.
- Parar para perguntar.

---

## Primeira ação

Execute a F0 agora. Depois siga as fases em ordem, atualizando `PROGRESSO.md` a cada tarefa, até cumprir a definição de pronto: `gate.sh` verde na branch, suíte de paridade sem falhas com contagem igual ou maior que a do baseline, nenhuma tarefa P0–P2 com status `[ ]`, `RELATORIO-FINAL.md` escrito e branch enviada (com PR draft, se possível).
