# Trilho, animações e painel de processamento — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Trilho sem sobreposição em qualquer altura e com Ajustes à mão; telas que abrem com uma animação fluida só; o selo "Vai rodar no aparelho" vira ícone que abre um painel compacto (estilo "Usage" do Claude) com aparelho × nuvem, modelos e cotas.

**Spec:** pedido do dono em 23/10/2026 (prints: pílula "Vai rodar no aparelho · seu áudio não vai sair daqui" → compactar para só o ícone; painel no estilo do popover "Usage": título, controle segmentado, linhas com ícone/nome/detalhe/percentual/chevron, rodapé com links) + diagnóstico `docs/auditoria/2026-10-23-trilho-e-animacoes.md` (B1–B8, §2, §3). Decisões de desenho do controlador estão em cada tarefa.

## Global Constraints

- pt-BR; toda frase nova de UI por `t()` em `public/i18n/{en,es,ar}.json` + regenerar `xx`/`cobertura.json`.
- Reaproveitar o que existe: linhas `.q-linha` (ícone `.q-ic`, `<b>`, `<small>`, `.q-fim`) do painel "Mais" (`src/components/shell/TrilhoDoQuest.tsx`, `src/styles/quest.css`), `FolhaDeBaixo` (`src/components/views/captura/celular/FolhaDeBaixo.tsx`) no celular, `DialogoBase`/`Barra` de `src/components/ui`, `medidoresDoUso()` (`src/lib/captura/nivelDeServico.ts:161`), `carregarUso()` (`src/lib/uso.ts`), `AiEnginePanel` para a regra aparelho × nuvem. Só tokens de cor (`tests/primitivosDeUi.test.tsx`).
- Alvos ≥ 44 px (48 no padrão do perfil), foco visível, Esc fecha, `prefers-reduced-motion` respeitado, axe sem violação grave em 375/768/1280.
- Nunca enfraquecer teste existente; e2e de geometria e de animação novos em `tests/e2e/`.
- Commits na main, `git pull --rebase` antes do push.

## Review Focus

1. Altura de janela entre 560 e 900 px no computador: nenhum item do trilho se sobrepõe a outro, nenhum some.
2. Intérprete aberto com o "Mais" aberto/fechado durante a transição: o conteúdo nunca aparece deslocado.
3. `prefers-reduced-motion: reduce`: nenhuma animação de entrada, e a tela aparece de uma vez.
4. Painel de processamento para perfil protegido (menor) e plano Grátis: a nuvem aparece com cadeado e explicação, nunca como oferta agressiva (skill `copy-br-etica`).
5. Sem rede (`/api/me/uso` falha): o painel abre mesmo assim, sem as cotas e sem erro.

---

### Task 1: Trilho sem sobreposição e Ajustes à mão (B4, B5, B6, B7)

**Files:** `src/components/shell/TrilhoDoQuest.tsx`, `src/components/shell/navItems.ts`, `src/styles/quest.css`, `src/styles/polimento/celular.css`, `src/styles/polimento/telas.css` (B7), `src/styles/prototipo.css` (iChat, B6), atalho em `src/App.tsx`; testes `tests/e2e/trilho-geometria.e2e.ts` + unitários que já cobrem o trilho.

- Compacto (só ícone, rótulo em `title`/tooltip e `aria-label`) quando os itens NÃO CABEM na altura, não por um número fixo: decidir por medida (ResizeObserver no `nav.q-trilho` comparando `scrollHeight` × `clientHeight`) com histerese, ou por `@media (max-height: 900px)` se a medida provar que 900 cobre o pior caso — escolher e justificar no relatório.
- Grupo do pé (Buscar, **Ajustes** novo com ícone de engrenagem, Mais) nunca cobre item do grupo de cima: o grupo de cima rola por baixo com indicação visual (sombra/fade) quando ainda não couber.
- Atalho `⌘,` / `Ctrl+,` abre Ajustes (e aparece no `title` do botão).
- iChat: zona segura — o conteúdo da página ganha `padding-bottom` igual à altura do botão + margem, e no celular o botão não cobre botões (B6).
- "Personalizar" não quebra no meio da palavra (B7).
- e2e: em 1440×900, 1280×800, 1280×720, 1024×768, 1024×600, 768×1024 e 375×812, nenhum par de itens do trilho se sobrepõe (bounding boxes), todo item é alcançável (visível ou alcançável por rolagem dentro do trilho) e Ajustes abre com 1 clique e com `Ctrl+,`.

### Task 2: Uma animação só, sem deslocamento e sem vazio (B1, B2, B3)

**Files:** `src/lib/polimento/telas.ts`, `src/styles/polimento/{polimento,efeitos,celular}.css`, `src/styles/modoInterprete.css`, `src/components/views/captura/interprete/ConversaDoPrototipo.tsx`, `src/lib/polimento/interprete.ts`, `src/App.tsx` / `src/lib/lazyComRecarga.ts` (B3); teste `tests/e2e/entrada-das-telas.e2e.ts`.

- B1: o Intérprete em página (`.int[data-pagina]`) deixa de ser `position: fixed; left: 108px` e passa a ocupar a `.px-tela` (absolute/inset 0 ou fluxo normal), de modo que o `transform` da troca de tela não o desloque; vale também com `.px-recuado` (Mais aberto).
- B2: uma entrada só por tela. Regra: a troca de tela nunca aplica `filter: blur` na tela inteira; telas sem peças (`pecas()` vazio) entram só com opacidade + translação curta (≤ 12 px, ≤ 240 ms); o Intérprete fica com a `entradaDaConversa` e a camada de telas não anima a raiz dele.
- B3: a navegação não mostra o fallback do `Suspense` quando o módulo da tela já foi pré-carregado: navegar dentro de `startTransition` (a tela antiga fica até a nova estar pronta) e/ou guardar o módulo resolvido pelo `lazyComRecarga`. Medir no build de produção (`npm run build` + preview) antes e depois.
- e2e: abrir o Intérprete pelo trilho em 1440×900 amostrando o `getBoundingClientRect().x` da conversa a cada quadro (rAF) por 800 ms: o x nunca difere do final em mais de 12 px; nenhum quadro com a área da tela vazia por mais de 100 ms depois do primeiro acesso (pré-carregado); com `reducedMotion: 'reduce'`, nenhum `animation`/`transition` ativo na entrada.

### Task 3: Link direto para as abas dos Ajustes

**Files:** `src/lib/rotas.ts`, `src/lib/estado/useNavegacao.ts`, `src/App.tsx` (`abaDosAjustes`), `src/components/views/Settings.tsx`; testes de rotas existentes + novo caso.

- `/ajustes/<aba>` com `<aba>` ∈ `ABAS_DOS_AJUSTES` (mapear `contas` ↔ `/ajustes/processamento` para a URL ficar legível; as outras com o próprio id em pt). Trocar de aba atualiza a URL (replaceState); abrir a URL abre a aba; aba desconhecida cai em `/ajustes`.

### Task 4: Selo compacto + Painel de processamento

**Files:** create `src/components/views/captura/PainelDeProcessamento.tsx`, `src/styles/painelDeProcessamento.css`; modify `src/components/views/captura/enxuta/pecas.tsx` (`ChipDeEstado`), `src/components/views/captura/niveis/pecas.tsx` (`MarcaDeOnde`, `ChipDoMedidor`), `src/components/views/captura/niveis/useNiveisDaCaptura.tsx`, `src/components/views/captura/celular/CapturaDoPrototipo.tsx`, `src/components/views/LiveCapture.tsx`; testes `tests/painelDeProcessamento.test.tsx`, e2e na captura.

Desenho (decisão do controlador, a partir do print de referência):

- **Selo**: só o ícone (aparelho: `Cpu`; nuvem: `Cloud`; misto: o do motor da voz), botão redondo 44 px, `aria-label` e `title` com o texto inteiro de hoje (`textoDoSelo`), `aria-haspopup="dialog"`. Substitui a pílula com texto no topo da Captura (ChipDeEstado e MarcaDeOnde); o `ChipDoMedidor` sai do topo (a cota passa a morar no painel).
- **Painel** (computador: popover ancorado no ícone, largura ~360 px, `role="dialog"`, Esc/fora fecha, foco volta ao ícone; celular ≤ 720 px: `FolhaDeBaixo`):
  1. Cabeçalho: "Processamento" + à direita o rótulo curto do estado ("no aparelho"/"na nuvem").
  2. Controle segmentado **Aparelho | Nuvem** (o mesmo efeito do `AiEnginePanel`: `escolherAparelho` / nuvem `cloud-quality`); Nuvem com cadeado e frase curta quando o plano/perfil não libera (perfil protegido: sem oferta, só "A nuvem não está disponível neste perfil.").
  3. Linhas (padrão `.q-linha`): **Transcrição** — nome simples do modelo em uso (do catálogo `src/gateway/catalogoDeModelos.ts`: Preciso/Equilibrado/…) · onde roda · chevron → abre `ModeloNoDispositivo`; **Tradução** — nativo/Bergamot/opus-mt · onde roda · chevron → mesmo diálogo.
  4. Cotas (só quando há teto e `carregarUso()` respondeu): **Nuvem neste mês** (`medidoresDoUso`) e **Reserva para aparelho fraco** (franquia de alívio), cada uma com percentual à direita e `Barra` fina; sem rede, a seção não aparece.
  5. Rodapé: **Modelos no aparelho** › (vai a `/ajustes/processamento` da Task 3), **Uso e plano** › (Planos), **Como isto funciona** › (abre a `FolhaComoFunciona` de hoje; corrigir o corte à direita no celular, B8).
- Testes: o selo tem só ícone e o `aria-label` completo; abrir/fechar por clique e Esc com o foco de volta; segmentado chama a mesma função do `AiEnginePanel`; cadeado no perfil protegido sem texto promocional; sem uso (falha de rede) → sem seção de cotas; links levam aos destinos; axe sem violação grave no painel aberto em 375 e 1280.

### Task 5: Fechamento

- `verificador` (typecheck, lint, test, build), revisão final, deploy no staging, prints antes/depois anexados ao relatório.
