# Barra lateral, experiência completa de anúncios no staging e Safari — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (implementadores em worktrees paralelos; arquivos disjuntos). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) trilho com Progresso e Planos visíveis por prioridade; (2) todos os 15 espaços de anúncio do protótipo montados e visíveis no staging com o provedor de demonstração; (3) diagnóstico do Safari (travamentos e recursos que não funcionam) com causas e plano de correção.

**Architecture:** (1) só a constante `NO_TRILHO` e o grupo "Mais" em `src/components/shell/TrilhoDoQuest.tsx` + rótulos em `navItems.ts`; celular mantém 5 botões. (2) o provedor de demonstração (`src/components/anuncios/demonstracao/*`) passa a ser incluído no build quando `VITE_ANUNCIOS_DEMONSTRACAO=1` (só no Environment `staging`); os espaços que faltam são encaixados com `<EspacoDeAnuncio>` nas telas do protótipo; a política continua mandando (menores nunca veem). (3) Playwright WebKit contra o staging e local, console/erros por tela, matriz de capacidades (SharedArrayBuffer, AudioWorklet, MediaRecorder, getDisplayMedia, WebGPU, OPFS, Web Speech), perfil de CPU dos travamentos.

**Tech Stack:** o do repositório. Skill `copy-br-etica` para qualquer texto novo de anúncio/plano.

**Spec:** `openspec/changes/planos-v3-e-rota-inteligente/specs/anuncios-no-gratis/spec.md` e `design.md` §7 (espaços e formatos); protótipo `docs/prototipos/anuncios-no-gratis.html` (+ `anuncios-no-gratis-src/anuncios.js`); pedido do dono em 21/10/2026 (barra por prioridade; experiência completa de anúncios; Safari).

## Rulings

- **R38 — Demonstração por variável de build.** `ligarDemonstracaoDeAnuncios` passa a existir quando `import.meta.env.DEV || import.meta.env.VITE_ANUNCIOS_DEMONSTRACAO === '1'`; sem a variável o Vite elimina o ramo e o pacote de produção não leva a demonstração. No staging a demonstração fica ligada sem precisar de `localStorage`. Custo se errado: um build de produção com a variável por engano mostraria anúncios de exemplo (o Environment `production` não a define; `tests/anuncios-worker-separado.test.ts` ganha a guarda de que o `deploy-worker.yml` só a passa no staging).
- **R39 — Espaços premiados fora de `ESPACOS_PREMIADOS_ATIVOS`** são escondidos pelo provedor real (cliente) e renderizados pela demonstração (fluxo só no cliente). Nada muda no servidor.
- **R40 — Celular mantém 5 botões** (Início · Capturar · Cartões · Jogar · Mais); Intérprete e Biblioteca ganham cartão no Início e entrada em Mais. Computador: 8 + Buscar + Mais.

## Global Constraints

- Perfil protegido (menor, sem idade, sem conta) nunca vê anúncio nem consentimento — em nenhum provedor.
- Com a flag `anuncios` desligada e sem `VITE_ANUNCIOS_DEMONSTRACAO`, nada muda (testes `csp-estreita`, `anuncios-provedor-real`).
- Strings por `t()` nos 4 catálogos; portões de i18n verdes; `npm run lint` 0 avisos; não enfraquecer testes; E2E da barra (`tests/e2e*`) ajustados, não apagados.
- Nunca `wrangler deploy` manual: staging pelo `deploy-worker.yml`; vars do Environment `staging` por `gh variable set`.

## Review Focus

1. Menor logado com a demonstração ligada: zero anúncio e zero folha de consentimento (teste por espaço). T2.
2. Build de produção com `VITE_ANUNCIOS_DEMONSTRACAO` ausente: o chunk da demonstração não existe no `dist` (teste lê o manifest/arquivos). T2.
3. Trilho no celular continua com exatamente 5 botões e a barra some ao rolar como antes (E2E mobile). T1.
4. Intersticial respeita o intervalo de 5 min e nunca interrompe captura, intérprete ou rodada em andamento (política já tem a regra; teste do encaixe). T2.
5. Safari: toda capacidade ausente tem degradação explícita (mensagem ou caminho alternativo), nunca travamento silencioso. T3 (diagnóstico) → tarefa de correção posterior.

---

### Task 1: Trilho por prioridade (Progresso e Planos) e "Mais" sem duplicata

**Files:**

- Modify: `src/components/shell/TrilhoDoQuest.tsx` (`NO_TRILHO` no computador: `['hub','capture','interprete','cartoes','play','library','estatisticas','planos']`; no celular `['hub','capture','cartoes','play']` + Mais — ver como `celular.css:57-62` conta os botões; o item "Planos" mostra o estado em texto pequeno: "Grátis · teste 14 dias" | nome do plano; o grupo "Mais" perde o cartão "Planos" (fica a faixa com estado) e, no celular, ganha Intérprete e Biblioteca)
- Modify: `src/components/shell/navItems.ts` (`estatisticas` → short "Progresso", labels kids "Meu progresso", pro "Progresso", senior "Meu progresso")
- Modify: `src/components/views/quest/InicioDoQuest.tsx` (no celular, cartões "Intérprete" e "Biblioteca" abaixo do "Legendar agora"; no computador não muda)
- Modify: `src/styles/celular.css`, `src/styles/quest*.css` só se o layout exigir
- Test: `tests/trilho-do-quest.test.tsx` (ou o existente que cobre o trilho; `ls tests | grep -i trilho`): ordem no computador; 5 no celular; rótulo "Progresso"; estado do item Planos por plano; "Mais" sem o cartão Planos; E2E: `tests/e2e/*barra*|*trilho*` e `tests/e2e-publico/acessibilidade-porta.e2e.ts` seguem verdes

- [ ] Testes → FAIL; implementar; `npx vitest run tests/*trilho* tests/*nav*`; i18n; `npx playwright test --project=mobile-375 -g "trilho|barra|Mais"` e desktop; commit `feat(trilho): Progresso e Planos no trilho por prioridade; celular com 5 botões; Mais sem duplicata`.

### Task 2: Todos os espaços de anúncio no app e demonstração no staging

**Files:**

- Modify: `src/components/anuncios/demonstracao/ligar.ts` (R38), `src/lib/anuncios/pedido.ts` (`demonstracaoDeAnuncios()` também verdadeiro quando `import.meta.env.VITE_ANUNCIOS_DEMONSTRACAO === '1'`), `src/components/anuncios/EspacoDeAnuncio.tsx` (liga a demonstração também fora do DEV quando a variável existe)
- Create/Modify encaixes (um por espaço, seguindo o protótipo): `intersticial` (entre rodadas, `src/components/minigames/casca/*`; intervalo 5 min via `babel.anuncios.ultimoIntersticial`), `ancora` (barra inferior em Biblioteca/Estatísticas no celular, fora da captura), `estat-faixa` (`src/components/views/Estatisticas*`), `loja-tema` e `tema-24h` (`LojaDoPrototipo.tsx`), `trilha-oferecida` (tela da trilha/conteúdo), `jogar-miniatura` (`Play.tsx`), `nuvem-30` (captura: cartão "Ganhe 30 min de nuvem" quando o alívio está disponível), `ajuda-premiada` (`FimDaRodada`/ajuda do jogo: "+1 ajuda")
- Modify: `src/lib/anuncios/provedores/iframe.tsx` (R39: esconder espaços premiados fora de `ESPACOS_PREMIADOS_ATIVOS`)
- Modify: `.github/workflows/deploy-worker.yml` (passa `VITE_ANUNCIOS_DEMONSTRACAO` do Environment; só o `staging` a define), `docs/deploy.md` §Anúncios, `docs/flags.md` (linha `anuncios`: "demonstração no staging")
- Test: `tests/anuncios-encaixes.test.tsx` (um caso por espaço: renderiza com provedor falso quando a política permite; perfil protegido → nada; intersticial respeita o intervalo), `tests/anuncios-demonstracao-build.test.ts` (build sem a variável não contém o chunk da demonstração; com a variável contém), `tests/anuncios-provedor-real.test.tsx` (R39)

- [ ] Testes → FAIL; implementar (copy pela skill; 4 catálogos); `npm run build` sem e com a variável e conferir o `dist`; `gh variable set VITE_ANUNCIOS_DEMONSTRACAO --env staging --body 1`; commit `feat(anuncios): todos os espaços do protótipo montados; demonstração no staging por variável de build`; deploy do staging pelo workflow; foto de cada espaço no scratchpad e lista no relatório.

### Task 3: Safari — diagnóstico

**Files:**

- Create: `docs/auditoria/2026-10-22-safari-diagnostico.md`
- Create (scratchpad): roteiro Playwright WebKit (`npx playwright install webkit`) contra `https://frasy-staging.guigui-cruzeiro.workers.dev` e contra `npm run dev:local`: por tela (porta, início, captura com microfone falso, intérprete, biblioteca, cartões, jogar, planos, ajustes), coletar erros de console, exceções, requisições falhas, long tasks > 200 ms (CDP não existe no WebKit: usar `performance.now()` em volta das ações e `PerformanceObserver('longtask')` se existir), memória (`performance.memory` não existe: medir pelo tempo de resposta)
- Matriz de capacidades no WebKit (e nota sobre o Safari real em macOS/iOS, que o dono testou): `crossOriginIsolated`/`SharedArrayBuffer`, `AudioWorklet`, `MediaRecorder` (mimeTypes), `getDisplayMedia` com áudio (Safari não captura áudio de aba), `navigator.gpu`, OPFS/`storage.getDirectory`, `SpeechRecognition` (webkit prefix), `speechSynthesis` vozes, `Worker` com módulos, `WebAssembly` threads/SIMD, `IndexedDB` cotas, `document-isolation-policy` (ignorado), `credentialless` (ausente), `requestIdleCallback`
- Mapear cada recurso do app à capacidade (`src/gateway/*`, `src/lib/captura/*`, `src/lib/dispositivo/*`) e ao comportamento observado: funciona / degrada com aviso / falha em silêncio / trava

- [ ] Rodar; escrever o relatório com: tabela recurso × Safari (WebKit Playwright) × causa provável × correção proposta (tamanho); top 3 causas dos travamentos (hipóteses com evidência); perguntas objetivas ao dono (modelo do Mac/iPhone, versão do Safari, qual tela travou). Sem mudar código de produto nesta tarefa; commit só do relatório.

### Task 4: Portão

- [ ] Verificação completa; revisão final; merge na `main`; deploy do staging; recap ao dono com o diagnóstico do Safari e as correções propostas (que viram a próxima rodada).
