# Auditoria comparativa — Protótipo v2 (Claude Design) × Babel Play real

Data: 2026-09-10 · Base de código: `main` @ `2ac979b` · Protótipo: `Babel Play - Protótipo v2 (interativo).dc.html` (raiz, 1.326 linhas)
Método: leitura integral do protótipo + inventário do código (`src/`, `server/`, `openspec/specs/`, `docs/`) com citação `arquivo:linha`. Nada aqui foi tirado de memória: cada afirmação sobre o app real aponta para o arquivo.

Este arquivo é a **fonte completa**. O `PROMPT.md` ao lado é o resumo colável no Claude Design.

---

## 0. Como ler

**Vereditos** (coluna "Veredito"):

| Veredito | Significado |
|---|---|
| `OK` | O protótipo cobre o elemento como o app faz. Manter. |
| `PARCIAL` | Existe no protótipo, mas falta parte do que o app tem. Completar. |
| `AUSENTE` | Existe no app, não existe no protótipo. Criar. |
| `DIVERGE` | O protótipo afirma um fato que o app contradiz. Corrigir. |
| `INVENTADO` | O protótipo mostra algo que o app não tem nem planeja. Remover ou marcar como proposta. |

**O que o protótipo v2 acertou e deve ficar como está**: os tokens de cor e tipografia (são os do tema "babel" real, `src/index.css:198`: canvas `#E6E2D6`, surface `#F5F2EA`, ink `#26241F`, accent `#F04E23`, good `#3E6B44`, warn `#C98A12`, rare `#5B5EA6`, error `#C92A2A`; fontes Archivo/Inter/IBM Plex Mono/Silkscreen), o onboarding em 8 passos, o hero escuro de Capturar, os cards de Planos com a matriz medida, o modal de sessão com palavras clicáveis, a raspadinha de revisão como card virável.

### 0.1 Regras que o código impõe a qualquer tela (não são opinião de design)

1. **Três perfis de exibição** — `kids` / `pro` / `senior` (`src/lib/profile.ts`). Cada rótulo de navegação, título de jogo, aba e bloqueio tem **três redações**. O perfil também muda dificuldade real dos jogos (tempos e vidas) e alvos de toque (48 px no senior). É **acessibilidade = direito**, nunca cosmético (`openspec/specs/coerencia-e-recompensa/spec.md`). Todo mock precisa dizer qual perfil mostra; o ideal é mostrar a mesma tela em `pro` e em `senior`.
2. **DIREITO × RECOMPENSA** (`openspec/specs/coerencia-e-recompensa/spec.md`, `docs/auditoria/ux-v2.md §3`). Tamanho de texto, som, animações, claro/escuro, perfil de exibição, idiomas, dados do usuário, "voltar ao visual original": **nunca trancam**. Temas, paletas, partículas, cursores, rastros, packs, estúdio: **nunca de graça** — passam por `estadoDoItem` e mostram "como eu consigo isto?" (`openspec/specs/comunicacao-de-obtencao/spec.md`).
3. **Honestidade** (`openspec/specs/entrega-honesta/spec.md`, `metricas-honestas`). Sem botão morto, sem "em breve", sem número inventado. Sem timing confiável a métrica é `null` e a tela mostra "—" (`src/lib/analise/metricasDaSessao.ts`). Estado vazio explica a causa e dá uma ação (`src/components/ui/Vazio.tsx`, `src/components/Honestidade.tsx`, `src/components/Provenance.tsx`). **O protótipo viola isto em três lugares**: busca ("Busca em breve"), iChat ("iChat chega em breve"), ajustes de captura ("em breve") — os três existem no app.
4. **Três eixos de idioma** (`openspec/specs/i18n/spec.md`, `tres-eixos-de-idioma`): idioma da interface (só `pt` e `en` ≥ 90 % de cobertura, `src/data/i18n/cobertura.json`), idioma que estou aprendendo, meu idioma; e o idioma do conteúdo é detectado por sessão. RTL funciona (`prints/08-jogar-rtl.png`).
5. **Modo sem conta** (`openspec/specs/modo-anonimo/spec.md`): tudo funciona sem login; as telas que persistem dados mostram convite, não muro (`src/components/conta/exigeConta.ts` `EXIGE_CONTA = { library, analysis, study, reading, metrics, profile }`; `prints/07-biblioteca-sem-conta.png`).
6. **Três viewports** (`playwright.config.ts`): 375×812 com dock inferior (`src/components/shell/MobileNav.tsx`, top-5 + "mais"), 768×1024, 1280×800 com barra ou rail em 4 posições (`StudioHeader.tsx`, `NavBar.tsx`, `NavRail.tsx`). O protótipo tem só 1360×860.
7. **A URL espelha a tela** (`src/lib/rotas.ts`, `openspec/specs/persistencia-e-url/spec.md`): toda aba de Sessão, de Personalizar e o filtro de Jogar têm endereço. Deep-link e F5 preservam estado. Mapa completo (`rotas.ts:42-53, 75-93`):

| URL | Tela |
|---|---|
| `/` | Início (Hub); também o destino de qualquer caminho desconhecido |
| `/capturar` | Capturar |
| `/jogar?<filtro>` | Jogar (única rota com query: o filtro facetado) |
| `/biblioteca` | Biblioteca |
| `/sessao/<id>/{transcricao\|leitura\|jogos\|metricas}` | Sessão, com a aba no caminho |
| `/revisar[/<id>]` | Revisar (SRS) |
| `/vocabulario` | Vocabulário |
| `/loja/{meu-visual\|itens\|passe\|desafios}` | Personalizar, com a aba no caminho (alias `/creditos` → Loja) |
| `/plano` (alias `/planos`) | Planos |
| `/perfil` · `/sobre` · `/ajustes` | Perfil · Sobre · Ajustes |
8. **Todo jogo na grade é um `MinigameDef`** (`openspec/specs/jogo-so-entra-pelo-sistema/spec.md`, `src/core/minigames/types.ts:147-181`) e declara por que está indisponível (`elegibilidade-por-jogo`). Não existe "recomendado"; existe "pronto" × "precisa de outro material" com motivo e porta de saída.

---

## 1. Casca (shell)

| Elemento | Protótipo v2 | App real | Veredito | O que o Design precisa fazer |
|---|---|---|---|---|
| Itens de navegação | 8: Início, Capturar, Jogar, Biblioteca, **Palavras**, **Progresso**, Personalizar, Planos (`navDefs`, prot. L1123-1132) | 9: Início, Capturar, Jogar, Biblioteca, **Vocabulário**, Personalizar, **Sobre**, Planos, **Ajustes** (`src/components/shell/navItems.ts:43-118`). "Progresso" não é tela. Rótulos × perfil: kids "Gravar/Palavras/Meu visual", senior "Página Inicial/Gravar Áudio/Praticar/Minhas Mídias/Minhas Palavras/Sobre o App/Planos e preços/Configurações" | `DIVERGE` | Trocar "Palavras"→"Vocabulário"; remover "Progresso" do menu (ver §8); adicionar **Sobre** e **Ajustes**; prever os rótulos dos 3 perfis. |
| Posição do menu | sidebar fixa à esquerda | 4 posições `top / bottom / left / right` (`StudioHeader.tsx`; item da loja `pos-*`, `src/core/loja.ts`); topo e esquerda grátis, direita e baixo 45 Seeds Nv.3 | `PARCIAL` | Desenhar ao menos barra no topo (padrão real, `prints/01-hub-pro.png`) e rail à esquerda. |
| Barra de controles | rodapé da sidebar: busca (toast "em breve") + avatar "GL" | `ControlCluster.tsx`: **Buscar** (pílula com `Ctrl K`), **ciclo de fonte "A"** (sm/md/lg/xl), **Menu de conforto** (sons da interface, animações e efeitos, modo desempenho — `MenuDeConforto.tsx`), **claro/escuro**, **paleta**, **avatar → Menu da conta** (`MenuDaConta.tsx`: nome/e-mail, "Entrar ou criar conta" ou "Meu perfil", "Plano e consumo", "Ajustes", "Sair da conta") | `PARCIAL` / `DIVERGE` | Busca funciona (ver abaixo). Desenhar o cluster completo e o menu do avatar com os 4 itens. |
| Busca global | toast | `BuscaGlobal.tsx` + `CommandPalette.tsx`: paleta de comandos com grupos "suas gravações", "suas palavras" (máx. 400), "ir para", item dinâmico "Revisar as N que venceram" | `DIVERGE` | Desenhar a paleta (overlay centrado, input, grupos, teclado ↑↓ Enter Esc). |
| iChat | botão flutuante → toast | `IChat.tsx` (55 KB): tutor flutuante **acoplável e maximizável** (`isDocked`, `isMaximized`), histórico de conversas (renomear/apagar), contexto fixado (clipe), placeholder "Sussurre uma dúvida sobre {tela}…", recebe a transcrição ao vivo | `DIVERGE` | Desenhar os 3 estados (flutuante, acoplado à direita, maximizado) + lista de conversas. |
| Toasts / confirmações | toast simples 2,2 s | `Toast.tsx`: `error/warn/ok/info`; erro **fica até dispensar** e toca som; `askConfirm()` substitui `confirm()` nativo (título, texto, botões) | `PARCIAL` | Adicionar variante de erro persistente com "detalhe" e o diálogo de confirmação. |
| Erro de tela | — | `ErroDaTela.tsx`: "Esta tela não conseguiu abrir" + Recarregar / Voltar ao início + código do erro | `AUSENTE` | 1 tela. |
| Camadas de efeito | — | `ParticleCanvas.tsx` (ambiente), `FloatingScoreLayer.tsx` ("+10 ×3" subindo), rastro do mouse (`lib/rastroDoMouse.ts`) | `AUSENTE` | Anotar no mock de jogo: números flutuantes e partículas no acerto. |
| Menu de prática (contexto) | — | `PracticeMenu.tsx`: botão direito sobre texto selecionado → "praticar este trecho" em qualquer tela | `AUSENTE` | 1 popover. |
| Estúdio de layout | — | `LayoutStudio.tsx` + `LayoutEditorToolbar.tsx` + `EditablePanel.tsx`: modo de edição que redimensiona/oculta painéis nomeados de cada tela (item lendário `estudio`, 600 Seeds Nv.10) | `AUSENTE` | Barra de ferramentas + painéis com alça. |
| Dock mobile | — | `MobileNav.tsx` (5 itens + "mais"), `MobileTopBar.tsx` | `AUSENTE` | Versão 375 px de cada tela principal. |

---

## 2. Primeiro acesso

| Elemento | Protótipo v2 | App real | Veredito | O que fazer |
|---|---|---|---|---|
| Login | — | `Login.tsx` + `auth/AuthShell.tsx`, `PasswordField.tsx`: Entrar / Criar conta / Recuperar senha; Google + e-mail/senha; **"Continuar sem conta"**; `ResetPassword.tsx`; telas "Concluindo login…" / "Carregando…" (`App.tsx:157-183`) | `AUSENTE` | 3 telas + estado de espera. Ver `docs/auth/auth-flow-design.md`. |
| Onboarding, passos 1-5 | welcome, idioma (estudo + interface), perfil, como funciona, privacidade — texto idêntico | `Onboarding.tsx`, barra "N de 6", `Step = welcome\|idioma\|profile\|how\|privacy\|choose\|cloud\|download` | `OK` | Manter. Só falta o LangPicker real no passo idioma (ver §10). |
| Onboarding, nuvem | select OpenAI / Groq / OpenRouter | + **"Personalizado (OpenAI-compatível)"** (`Onboarding.tsx:28-31`) | `PARCIAL` | Adicionar a 4ª opção. |
| Onboarding, download | "cerca de 85 MB" | `whisper-tiny` ≈ 33 MB anunciado, `whisper-base` ≈ 85 MB; primeira carga total 40-80 MB (README); `ModelPrepPanel.tsx` mostra duas barras (Whisper / opus-mt) com MB reais e "já em cache" | `PARCIAL` | Mostrar o painel de preparação real (2 barras) no passo download. |
| Rever apresentação | — | Ajustes → Conta e recomeço → "Rever apresentação" (`Settings.tsx:628-660`) | `AUSENTE` | Ligar ao onboarding. |
| Gate de conta | — | `GateDeConta.tsx`: modal contextual "entrar · criar conta · continuar sem conta"; `CartaoDeConvite.tsx`: substitui a tela quando anônimo (textos em `exigeConta.ts` `CONVITE`, `prints/07-biblioteca-sem-conta.png`); `ModalDeMigracao.tsx`: sobe dados locais com progresso; `AvisoDeConta.tsx`: pede conta por marco de uso | `AUSENTE` | 4 componentes. Regra: convite, nunca muro. |
| Guia rápido | — | `GuidePanel.tsx`: modal com os fluxos principais; aberto pelo "?" de Capturar e por Ajustes | `AUSENTE` | 1 modal. |

---

## 3. Início (Hub)

Referência visual: `prints/01-hub-pro.png` (perfil pro), `prints/02-hub-senior.png` (perfil senior), `prints/03-modal-conquista.png`.

| Elemento | Protótipo v2 | App real (`src/components/views/Hub.tsx`) | Veredito | O que fazer |
|---|---|---|---|---|
| Título | "O que você quer fazer?" | Kicker por perfil ("Painel de performance" pro / "Aprendizado fácil" senior) + "O que você quer fazer agora?" / "Bem-vindo ao Babel Play" | `OK` | Manter; prever a variante senior com passos numerados 1-2-3. |
| 3 cards | Escutar e traduzir / Exercícios / Vocabulário | `PILLARS` (L739-790): `capture` "Escutar e traduzir", `practice` "Exercícios e prática" → **view `study`**, `vocabulary` "Vocabulário" → `metrics`; cada um com `pillarStatus` real ("5 palavras prontas para revisar", "5 palavras novas esperando") e copy × 3 perfis | `PARCIAL` | O card do meio leva a **Revisar** (Study), não a Jogar. Textos reais por perfil. |
| Faixa de progresso | "Nível 12 · 340/500 XP" + barra | `FaixaDeProgresso.tsx`: **NÍVEL / ETAPA** (senior diz "Etapa"), XP na etapa, frase de contexto ("Uma revisão hoje mantém a sua ofensiva viva"), **ofensiva** (chama) e **Seeds** (broto) | `PARCIAL` | Acrescentar ofensiva e Seeds; usar o vocabulário "etapa" no senior. |
| Card-herói de revisão | "20 palavras prontas para revisar · 4 min" | Só aparece **quando há vencidas**; "N palavras venceram no agendador" + estimativa de minutos **medida** + "Revisar agora" + "escolher outro jogo"; esqueleto anti-CLS enquanto carrega | `OK` | Manter; anotar o estado "sem vencidas" (some). |
| "Ver estatísticas detalhadas" | link | Bloco "Relatório executivo" expansível: "Métricas do Perfil", "Nível Estimado do Vocabulário (CEFR)" (L401), "Nível de Comunicação Corporativa & Alinhamento" (L446) | `PARCIAL` | Desenhar o bloco expandido. |
| Recomendações | — | "Recomendações e Próximos Passos" (L525): CTAs com dado real, sem número fabricado | `AUSENTE` | Lista de 2-4 recomendações com ícone + CTA. |
| Sessões recentes | 3 cards com data | "Sessões Recentes" (L578): capa, tipo, selo "processando"/"lendo ainda", "Ver biblioteca completa →" | `OK` | Adicionar selo de processamento. |
| Rodapé "Planos a partir de R$19/mês" | R$19 | Menor preço real: **R$ 9,90** (`src/core/planos.ts:66`, `menorPrecoDosPlanos`) | `DIVERGE` | "a partir de R$ 9,90/mês". |
| Modal de conquista | — | `RecompensaDesbloqueada.tsx`: "CONQUISTA FEITA — Poliglota, +40 Seeds +60 XP", item exclusivo liberado com "Equipar agora", "Resgatar tudo e continuar" / "Ver em Personalizar" (`prints/03-modal-conquista.png`) | `AUSENTE` | 1 modal (também serve para subir de nível e baú). |

---

## 4. Capturar

Referência visual: `prints/04-capturar.png`. Arquivo: `src/components/views/LiveCapture.tsx` (157 KB). Docs: `docs/captura-audio.md`, `docs/fala-do-mic-e-traducao-comunicativa.md`.

| Elemento | Protótipo v2 | App real | Veredito | O que fazer |
|---|---|---|---|---|
| Título | "Capturar" + voltar | "Captura ao vivo" (kids "Gravador de jogos e legendas", senior "Gravação com tradução direta") + subtítulo | `OK` | — |
| Cabeçalho | timer, marcador, ajustes (toast), pausa, parar | **"Configurações de Dispositivos & IA"** (abre gaveta), **"?"** (GuidePanel), selo técnico "Transcrição no dispositivo · mic via navegador" | `DIVERGE` | O botão de ajustes abre uma gaveta real (abaixo). Marcador/pausa não existem como botões no app (a captura é Iniciar / Parar & Salvar / Continuar captura). |
| Cenário | — | 3 cards **"O que você quer capturar?"**: Assistir mídia / Conversa · chamada / Minha voz (`lib/cenarioDeCaptura.ts`, `captureScenario = media\|conversation\|mic`) | `AUSENTE` | 3 cards de escolha (ver print). |
| Fonte do áudio do sistema | "Sistema sempre ativo" | select **"Som do computador ★ (sem configurar nada)"** + "ajustes avançados"; na gaveta: **Computador (servidor) ★** (WASAPI loopback, L1656), **Compartilhar aba/tela** (L1664), **Dispositivo de loopback** (L1671, Stereo Mix/VB-Cable) + guia por rota e botão **"Testar captura do áudio do sistema"** com veredito ("✓ Áudio do sistema OK" / "⚠ silenciosa" / "✗ Nenhuma faixa", L1744) | `AUSENTE` | Gaveta com os 3 blocos + teste. Estado "Janela não tem áudio no navegador" / "Faltou marcar o áudio" + "Escolher de novo" (L2452). |
| Microfone | botão "Microfone mudo/pausado" + waveform | `role="switch"` "Microfone ativo"/"Microfone mudo" (kids "Minha voz entra/fora"), "Pedindo permissão…", liga durante a gravação; motor **Navegador (rápido)** (L1786) / **Whisper (offline)** (L1793); select de entrada; "Permissão do microfone negada…" + "Listar dispositivos" (L1816-1841) | `PARCIAL` | Estados: pedindo permissão, negada; seletor de motor e dispositivo. |
| Saída / qualidade / desempenho | — | select de saída (`setSinkId`); **Qualidade da transcrição**: Automática · Rápida · Precisa · Nuvem; **Modo desempenho (jogos)** (legenda só no fim da frase) | `AUSENTE` | Na gaveta. |
| Idiomas | botão "Detectar → Português (BR)" cíclico | Chip com drawer `role="dialog"` **"Idiomas da sessão"** (L2131-2136): par com bandeira, "Detectar automaticamente", toggles auto-detecção do conteúdo e da minha voz, resumo humano "Detectei **Inglês** no conteúdo (82 % das falas), legenda em **Português**"; avisos "⚠ exige internet" / "⚠ Não há tradutor para X↔Y" (L2166) / idiomas iguais (L2148) | `PARCIAL` | Desenhar o drawer e os 3 avisos. |
| Timer + waveform | mm:ss + 24 barras CSS | mm:ss; waveform **real** de 48 barras (RMS), só gravando | `OK` | — |
| Preparação do modelo | — | `ModelPrepPanel.tsx`: 2 barras (Whisper / opus-mt), MB reais, "já em cache", "Tentar de novo", "Modelo pronto, no dispositivo, offline." | `AUSENTE` | 3 estados. |
| Legendas flutuantes | card fixo no canto | `Overlay.tsx` (50 KB): `LayoutMode = video \| conversation \| game` (L43) × `independenceLevel = assisted \| intermediate \| immersion` (L342: em imersão a tradução só aparece ao "espiar"); cor de fundo; **`DocumentPiP.tsx`**: janela Picture-in-Picture **sempre no topo** de qualquer app (só Chromium; fallback = overlay embutido, `isDocumentPiPSupported`, L44). Botão pulsa quando gravando sem legendas. | `PARCIAL` | Desenhar: janela PiP separada (com cabeçalho do SO), os 3 layouts, o nível imersão (tradução escondida com "espiar"). |
| Transcrição ao vivo | 3 parágrafos | `ChatTranscript.tsx`: **balões por lado com falante**, original + tradução, `displayOrder` (original-primeiro / tradução-primeiro), `hideOriginal`; **palavra clicável** abre o Analista de Vocabulário (§7); ícone de falar palavra; marca palavras já adicionadas; botão flutuante **"Ir para a fala atual"** quando rolou; estado vazio "Sua conversa aparece aqui — três passos" (print) | `PARCIAL` | Balões com falante; estado vazio de 3 passos; botão "ir para a fala atual". |
| Falantes | — | Painel **"Falantes"** (L2317-2326, só cenário Conversa): toggle "Auto: ligado/desligado" (WeSpeaker local 6,7 MB, beta), cor por pessoa, renomear, **% de tempo de fala**, atribuição manual; estados `off\|loading\|ready\|unavailable` (L259) | `AUSENTE` | Painel lateral. |
| Aparência da legenda | — | `captura/TranscriptVisualSettings.tsx`: Tamanho (Pequeno→Gigante), Tema (Padrão/Alto Contraste/Sépia/Oceano/Neon), Fonte (Sans/Serif/Mono), Ordem, Original (Mostrar/Ocultar) | `AUSENTE` | Bloco da gaveta. |
| Foco Cheio | — | "Modo Focado: Tradução & Transcrição" (L2015): timer grande, seletores de idioma, "Ajustar Visual", "Tela normal", mic + legendas + Parar | `AUSENTE` | 1 tela em tela cheia. |
| Bingo | — | `minigames/BingoPanel.tsx`: cartela de palavras que acende quando ouvidas | `AUSENTE` | 1 painel. |
| Sair no meio | — | modal "A gravação está em andamento" / "Você tem falas não salvas" → Parar e salvar · Continuar · Sair e descartar (`lib/navGuard.ts`) | `AUSENTE` | 1 modal. |
| Encerrar sessão | parar → toast → biblioteca | modal **"Opções de Encerramento da Sessão"**: título, prévia da capa, `BuscaDeCapa.tsx` (Openverse), URL/upload/Ctrl+V, ações "Continuar Gravando" · "Salvar & Continuar na Tela" · "Salvar & Ir para Análise" | `AUSENTE` | 1 modal com busca de capa. |
| Analista de Vocabulário | — | coluna direita `VocabularyPanel.tsx` (§7) | `AUSENTE` | Reusar §7. |

---

## 5. Biblioteca, Sessão e Leitura

### 5.1 Biblioteca — `src/components/views/Library.tsx`

| Elemento | Protótipo v2 | App real | Veredito | O que fazer |
|---|---|---|---|---|
| Título/abas | "Biblioteca" | "Coleções e Mídia" (senior "Minhas Lições"); aba "Cofre de Memória" existe desligada (`MOSTRAR_COFRE = false`, L54) | `OK` | — |
| Busca e filtros | busca + 4 chips (Todos/YouTube/Áudio/Documentos) | busca "Buscar por título ou tag…"; botão **Filtros** com contador → painel: fixadas, com áudio, tamanho (≤500 / ≤2000 / >2000 palavras), "Limpar filtros"; segmentado Tudo (n) · YouTube (n) · Áudio (n) · Documentos (n); "Mostrando X de Y" | `PARCIAL` | Painel de filtros + contadores nos chips. |
| KPIs | 3 (sessões, palavras, tempo) | não há KPIs na Biblioteca (vivem em Vocabulário) | `INVENTADO` | Remover ou mover. |
| Cards | capa listrada + título + meta | capa real/`MiniaturaDoItem.tsx`, alfinete, menu "⋮" (**Retomar Captura** só áudio/vídeo, editar, excluir com `askConfirm`, baixar transcrição), selo "processando" | `PARCIAL` | Menu do card + alfinete. |
| Editar sessão | — | modal: "Nome da sessão" (com erro), prévia, `BuscaDeCapa`, URL/upload/colar | `AUSENTE` | 1 modal. |
| Importar | 3 abas: YouTube / Página web / Documento | 4 fontes com `InfoHint` (L616-619): **Link do YouTube** (só Pro; exige yt-dlp), **Documento de Texto** (PDF/DOCX/TXT), **Link da Web**, **Áudio Local** (MP3/WAV/M4A); idioma detectado; bloqueio por plano com motivo ("Importar do YouTube precisa de conta (e do plano Pro)", `exigeConta.ts motivoDoGate`) | `PARCIAL` / `DIVERGE` | Adicionar Áudio Local; cadeado com motivo no YouTube para Grátis/Essencial. |
| Sem conta | — | `CartaoDeConvite` "Sua biblioteca fica na sua conta" (`prints/07-biblioteca-sem-conta.png`) | `AUSENTE` | 1 estado. |

### 5.2 Sessão / Análise — `src/components/views/Analysis.tsx` (126 KB), rota `/sessao/:id/{transcricao|leitura|jogos|metricas}`

O protótipo tem um **modal** de sessão. No app a sessão é uma **tela inteira com 4 abas**; é o caminho Biblioteca → mídia → aula (decisão do dono, `navItems.ts:69-71`).

| Elemento | Protótipo v2 | App real | Veredito | O que fazer |
|---|---|---|---|---|
| Cabeçalho | título + meta | "Voltar para Biblioteca", selo **"Sessão de YouTube / PDF-Documento / Áudio"**, tipo, selo de **procedência da transcrição** (`Provenance.tsx`), select **"Alternar de Sessão:"** (L675), botão **Exportar** | `AUSENTE` | Tela. |
| Abas ("O que fazer com esta sessão") | — | `transcript` **Transcrição & Vocabulário** (`profile.ts:322`; kids "Legenda e palavras", senior "Texto e palavras") · `reading` **Leitura & Notas** (L332) · `practice` **Jogos** · `overview` **Visão Geral & Métricas** (L346; escondida atrás de "Mais" em kids/senior) | `AUSENTE` | 4 abas. |
| Aba Transcrição | modal com palavras clicáveis | transcrição **editável** + `TokensClicaveis.tsx` + `VocabularyPanel` à direita; renomear falantes | `PARCIAL` | Tela com painel lateral. |
| Aba Jogos | — | lobby de Jogar filtrado por esta sessão (+ "Revisar agora") | `AUSENTE` | Reusar §6 com o filtro travado. |
| Aba Visão Geral | — | KPIs clicáveis → `AnalysisExpandedKpi.tsx` (ex.: "Palavras Lidas", "Tempo de Estudo"); 3 sub-abas: **Visão Geral** · **Vocabulário da Sessão** · **Desempenho & Fluência** (oculta em documentos); métricas de `metricasDaSessao.ts`: **WPM**, pausas > 3 s, silêncio (ms e %), maior monólogo, sobreposição por falante, vícios de linguagem por idioma, palavras-chave; "—" quando não há timing | `AUSENTE` | Painel de KPIs + KPI expandido + 3 sub-abas. |
| Exportar | dropdown: Transcrição (.txt), **Legendas (.srt)**, Vocabulário (.csv) | modal **"Exportar Dados da Sessão"** (L2137): 1) **Métricas & Desempenho** → `relatorio_sessao_{id}.md` (L2188); 2) **Flashcards para Anki** → `vocab_anki_{id}.csv` (L2226); 3) **Áudio da Sessão** → webm/mp3/wav/ogg/m4a, desabilitado "Sem áudio gravado nesta sessão." (L2283); 4) **Vídeo da Sessão (Protegido)** → bloqueado (L2303). **Não existe .srt.** Também: "baixar transcrição" no card da Biblioteca | `DIVERGE` | Modal com as 4 opções e estados desabilitados. |

### 5.3 Leitura — `src/components/views/Reading.tsx` (108 KB), aba `/sessao/:id/leitura`

| Elemento | App real | Veredito | O que fazer |
|---|---|---|---|
| Painéis | "Área Interativa" e "Estudos & Notas" (`EditablePanel`) | `AUSENTE` | Tela de 2 colunas. |
| Narração | `NarrationMode` (L27-42): **Original · Tradução · Bilíngue** (shadowing: original e depois tradução, por frase) · **Auto** (voz do idioma real de cada frase; padrão); play/pause real, frase anterior/próxima, "ouvir a partir desta frase", progresso (frase/total), **velocidade** (padrão 1,25×), **tom**, voz por idioma, idioma forçado; sem voz instalada não narra com outra | `AUSENTE` | Player de leitura com os 4 modos. |
| Texto | largura de coluna (centralizada × total), **desenho sobre o texto** ("Limpar todos os desenhos"), prévia de palavra com pronúncia | `AUSENTE` | Controles de leitura. |
| Notas | notas com **gravação de voz** ("Ouvir minha gravação de voz") | `AUSENTE` | Painel de notas. |
| Player interativo | `captura/PlayerInterativo.tsx` (40 KB): player do áudio da sessão sincronizado com as falas | `AUSENTE` | Player com timeline. |

---

## 6. Jogar

Referência visual: `prints/05-jogar-lobby.png`, `prints/08-jogar-rtl.png`. Arquivos: `src/components/views/Play.tsx` (192 KB), `src/components/views/play/{jogos.tsx,telaDoJogo.ts,Recordes.tsx}`, `src/components/minigames/**`, `src/core/minigames/**`. Docs: `docs/auditoria/tela-de-jogos-v1.md`, `docs/auditoria/seletor-de-conteudo-v1.md`, `docs/selecao-de-conteudo.md`, `docs/curriculo-gamificacao-sla.md`.

### 6.1 Lobby

| Elemento | Protótipo v2 | App real | Veredito | O que fazer |
|---|---|---|---|---|
| Cabeçalho | "Escolha um jogo · sobre a sua sessão X" + Recordes + Começar | "Jogar" (senior "Praticar jogando") + "N Jogos"; painel **Nível N · XP/XP · ofensiva · Seeds** (`Play.tsx:2876-2895`); **Partida Rápida** (dado: sorteia entre os liberados) | `PARCIAL` | Painel de progresso e Partida Rápida. |
| Seleção de material | frase fixa "sobre a sua sessão" | Linha **PRATICANDO · Minhas palavras · inglês · trocar** → gaveta `SeletorDeConteudo.tsx` com **6 facetas** (`lib/filtroDaPratica.ts`, serializado na URL): idioma (com contagem de jogáveis) · de onde vêm (Trilha / Minhas gravações, somam) · nível/faixa do curso · quais gravações · quais baralhos Anki · **recorte** (Difíceis ≥4 · Pedindo revisão · Nunca vistas · Com tradução · Com frase, com contagem e motivo quando vazio). Ações: Recordes · Mapa · Curadoria (N fora do recorte) · Diagnóstico; Trazer do Anki · Gerenciar baralhos · Outro idioma. Linha **SEU BARALHO · 5 no idioma · 3 com tradução · 2 fora do recorte** | `AUSENTE` | Gaveta de facetas + linha-resumo + 2 cards "Mapa do conteúdo" / "N ficaram de fora". |
| Sala de Escolha (1ª vez) | — | `SalaDeEscolha.tsx`: modal único da primeira visita: idioma (chips com contagem e motivo), origem (Minhas gravações / Trilha — sempre visível, desabilitada com motivo / Palavras difíceis — exige ≥4), sub-escolha (Todas / Uma gravação; nível CEFR), rodapé "N palavras prontas" + **"Usar estas palavras"** | `AUSENTE` | 1 modal. |
| Card de revisão | — | "5 palavras pedindo revisão · Um duelo relâmpago resolve." → | `AUSENTE` | 1 card. |
| "Sua próxima rodada" | — | card destacado "Karaokê da fala · 4 falas · minhas palavras · rodada curta" + **Jogar** (print) | `AUSENTE` | 1 card. |
| Grade | 18 cards com "Recomendado" e cor por card | 18 cards com **arte SVG por jogo** (`ArteDosJogos.tsx`; cor = **modalidade**: palavra = accent, frase = good, frase-áudio = rare — legenda `FAMILIAS`), cadeado com motivo, "?" (Como se joga), setas/alfinete (Organizar), recorde por jogo e fonte, estrelas, mapa de fases. **Não existe "Recomendado".** Agrupamento: prontos primeiro, depois cabeçalho **"Precisam de outro material"** com motivo (`trilha-sem-frase`, `sem-voz`, `audio-carregando`, `alfabeto-nao-suportado`, `escrita-sem-separacao`) e **uma porta de saída** por card (trocar idioma / trocar fonte / revisar descartes / gravar) | `PARCIAL` / `INVENTADO` | Remover "Recomendado"; legenda de 3 cores; card bloqueado com motivo + CTA. |
| Filtros | — | Categorias Todos · Clássicos · Favoritos; busca "por nome, mecânica, país…"; habilidades Todas · Vocabulário · Escuta & Fala · Sintaxe & Frases; checkbox **"Mostrar a prévia antes de começar"**; **Organizar** | `AUSENTE` | Linha de filtros. |
| Vazio | — | "Os jogos usam as palavras que você guarda… você tem **N** e precisa de **3**" + "Capturar uma sessão" (`Play.tsx:3407-3431`) | `AUSENTE` | 1 estado. |
| Recordes | modal com "Meus recordes" (Melhor/Combo/Precisão/Rodadas) e "Ranking global" (pos/apelido/combo/pontos) | `Recordes.tsx`: aba Meus recordes (KPIs melhor placar geral · rodadas · eventos raros N/M; tabela por jogo Melhor · combo · precisão · rodadas); aba Ranking global por jogo (top 20: apelido · pontos · combo · quando; "(você)"); apelido 3-20 caracteres; envio **opt-in só na tela de resultado do Blitz** | `OK` / `PARCIAL` | Adicionar KPIs e formulário de apelido no resultado do Blitz. |

### 6.2 Fluxo da rodada (todos os jogos)

`Lobby → clique → montarRodada (src/core/minigames/rodada.ts) → Antessala (opcional) → partida → ScratchReward → ResumoDaRodada (se errou) → lobby/corrente`

| Tela | App real | Veredito | O que fazer |
|---|---|---|---|
| Antessala da rodada | `AntessalaDaRodada.tsx` (885 linhas): prévia real dos itens (anti-spoiler), **mapa de fases com estrelas**, chips de dificuldade **Fácil / Médio / Difícil / Auto** (só jogos de palavra), estados por item (errando / novas / aprendendo / firme), leeches + "resgate", estimativa de duração, recorde, colecionável de eventos; botões **Jogar · Trocar por outras · Repetir a última · Sair**; checkbox "pular sempre" | `AUSENTE` | 1 tela. |
| Como se joga | `ComoSeJoga.tsx`: ficha "?" por jogo — treina / passos / avaliação / limites / **ajudas com preço** | `AUSENTE` | 1 modal. |
| Tour guiado | `TourGuiado.tsx` + `passosDosJogos.ts`: passos na 1ª partida de cada jogo | `AUSENTE` | Balões de tour. |
| Raspadinha (sempre) | `ScratchReward.tsx`: "N de M", **3 estrelas** (100 % / ≥75 % / ≥50 %), pontos · precisão · tempo, **cartão raspável em canvas** revelando +XP, placar da corrente (rodadas · pontos · % · RECORDE), combo vivo ("×N continua na próxima"), caça ao recorde ("faltam X pts"), nível + faltam XP + **próxima recompensa**; ações **Mais uma · De novo (pelas 3 estrelas) · Ver o que escapou · Voltar aos jogos · Trocar mantendo o combo (40 Seeds)** | `AUSENTE` | 1 tela (a mais importante do jogo). |
| Resumo (se errou) | `ResumoDaRodada.tsx`: item a item com tradução, CEFR, ocorrências, tempo, XP, combo; **Refazer só as erradas · Subir dificuldade (≥80 %) · Mais uma · Voltar** | `AUSENTE` | 1 tela. |
| Efeitos | números flutuantes, partículas do tema/pack, **eventos raros** (`lib/eventosDeJogo.ts`: chuva de estrelas 8 %, patos 5 %, bola 3 %, corações 3 %, interferência 1,5 %, rodízio 1,2 %; garantidos: combo 5 "Aquecendo!", 10 "Tempestade de raios", 15 "Sobrecarga", recorde "Fogos", perfeita "Rodada impecável") | `AUSENTE` | Anotar como overlays do acerto. |
| Baú | fim de rodada: item comum/raro sorteado pelo servidor + 5 Seeds (`economiaAutoridade.ts:237-399`) → `RecompensaDesbloqueada` | `AUSENTE` | Reusar o modal do §3. |

**Pontuação única** (`src/core/minigames/grade.ts`): base 10, +5 se ≤ 3 s, +3 sem dica; multiplicador ×2/×3/×4/×5 em sequências 3/6/10/15; XP = acertos×2 + itens; nota FSRS por jogo (`gradeFor`).

### 6.3 Os 18 jogos (todos com mecânica completa)

O protótipo implementa 3 (karaoke, ditado, cadavre) e mostra "Mecânica prevista para a implementação final" nos outros 15. Títulos do protótipo batem com os de `jogos.tsx` (perfil pro). Regras em `src/core/minigames/types.ts:147-181`; componentes em `src/components/minigames/`.

| id | Título pro (kids / senior) | Modalidade · min/max | Telas internas e inputs | Ajudas | Tempo/vidas por perfil (kids · pro · senior) | Áudio |
|---|---|---|---|---|---|---|
| `memory` | Memória: palavra e tradução (Jogo da memória) | palavra · 4/8 | mesa de cartas; clique; par errado zera combo | Espiar ×2 (abre a mesa 1,2 s, zera combo) | densidade "folgada" no senior | fala a palavra ao virar |
| `wordsearch` | Caça-palavras por definição (Caça-palavras) | palavra · 4/8 · latino | grade + coluna de pistas (a pista é a **tradução**); arrastar; campo "destacar letras" | Radar ×3 · Raspar · Dica (1ª letra + direção) · Revelar (= erro) | — | fala a palavra achada |
| `termo` | Soletrar (Termo) (Escreva a palavra / Escrever a palavra) | palavra · 3/7 · teclado | **escada 1 → 2 → 4 tabuleiros**; QWERTY na tela + teclado físico; tentativas 6 · 7 · 9 por modo | Varinha (grátis) · Ouvir (grátis) · Lâmpada (revela letra, custa só no tabuleiro) · "quase" 1× | — | fala a palavra |
| `scramble` | Frase embaralhada (Monte a frase / Montar a frase) | frase · 3/5 · sem SRS | tradução → linha montada → peças; clique nas peças | Dica (encaixa a próxima) · Pular · Ouvir | — | peça e frase; **fala real da gravação** |
| `karaoke` | Karaokê da fala (Cante junto / Repetir em voz alta) | frase-áudio · 3/6 | `parado → ouvindo → gravando → avaliado`; **microfone** (SpeechRecognition); palavras acendem no ritmo do clipe real; veredito por palavra (verde/laranja + sublinhado ondulado), "escapou: X (ouvimos 'Y')", `accuracy %` (`core/learning/pronunciation.ts`: accuracy, fluency, speed 90-170 wpm); acerto ≥ 60 %, ≥ 80 % confete; sem SpeechRecognition **diz que não dá nota** | Devagar (0,6×, mesmo tom) · pular | — | clipe real; na trilha vira palavra por TTS |
| `escuta` | Qual foi a fala? (escuta) (Qual foi? / Reconhecer a fala) | frase-áudio · 4/6 | auto-play → alternativas (outras falas da mesma gravação) → revela | ouvir de novo · devagar | — | clipe real ou TTS |
| `ditado` | Ditado (Escreva o que ouviu) | frase-áudio · 3/5 | ouvir → digitar (Enter) → correção **palavra a palavra**; acerto ≥ 80 % | Dica (próxima palavra) · devagar · "não consigo, pular" | — | clipe real ou TTS |
| `conectores` | Caça-conectores (Palavras que ligam / Palavras de ligação) | frase · 3/5 · sem SRS | frase clicável por token → conferir; acerto se F1 ≥ 70; mostra certos/falsos/perdidos | — | — | — |
| `blitz` | Duelo relâmpago (contra o tempo) (Duelo relâmpago / Desafio rápido) | palavra · 4/20 | cronômetro → item → **tela de resultado própria** (estrelas animadas, placar rolando, recorde, melhor combo, **envio ao ranking com apelido**); pontos = (10×mult + bônus 0-10) × (fever ? 2 : 1); erro −2 s; marcos 5/10/15/20/30/40/50; FEVER a 8 seguidos | Cortar 2 ×2 | 60 s · 60 s · 90 s | fala a resposta |
| `karuta` | Karuta: ouça e pegue a carta (Karuta) | palavra · 4/8 | narração → mesa de até 6 cartas; clique; carta errada volta | Ouvir de novo (grátis) | 12 · 8 · 14 s | **TTS narra a pista** (sem TTS vira texto) |
| `choseong` | Choseong: consoantes à vista (Complete as vogais) | palavra · 4/8 · teclado | consoantes visíveis, vogais em branco; teclado AEIOU | Abrir uma vogal ×2 | 18 · 15 · 22 s | — |
| `tenis` | Rali cronometrado (Tênis de palavras) | palavra · 4/10 · teclado latino | rali de bolas; digitar antes de a bola cair; saque encurta 1 s por devolução | Primeira letra ×2 | saque 8 · 6 · 9 s | — |
| `koffer` | Mala cumulativa de memória (A mala) | palavra · 4/8 | `entrando` (mala aberta) → `lembrando`; clique na ordem; cumulativo | Espiar 1×/nível | mala 2,6 · 2,0 · 3,0 s; vidas 4 · 3 · 4 | fala a palavra que entra |
| `bao` | Bao: semeie os pedaços (Bao: monte a palavra) | palavra · 4/6 · latino | tabuleiro de covas com pedaços (2-6, ~2,5 letras); clique | dica semeia a 1ª peça | erros 4 · 3 · 4 | fala |
| `vitendawili` | Vitendawili: a frase com lacuna (Charada) | palavra · 4/8 | enigma = **a própria frase do usuário** narrada com pausa de 700 ms na lacuna → alternativas | repete a narração (grátis) | — | TTS |
| `shiritori` | Shiritori: encadeie pela última letra (Corrente de palavras) | palavra · 4/8 · latino | corrente → opções; sem corrente possível a rodada não nasce | mostra a letra exigida | 20 · 15 · 25 s por elo | fala |
| `cadavre` | Cadavre exquis: produção livre (Frase maluca) | palavra · 4/4 · sem SRS | 4 palavras + textarea; "usou a palavra" aceita flexão | trocar uma palavra (grátis) | — | fala |
| `taboo` | Tabu: a definição sem os termos óbvios (Palavra proibida) | palavra · 4/8 | carta com definição (da frase do usuário) e 3 termos riscados → alternativas | libera uma proibida (limita nota) | 35 · 30 · 45 s | — |

**Modalidade × cor** (`ArteDosJogos.tsx:53-59`): palavra = accent laranja; frase = good verde; frase-áudio = rare índigo. O protótipo usa 4 cores sem regra.

---

## 7. Vocabulário, Revisar e o detalhe da palavra

Referência visual: `prints/06-vocabulario-senior.png`.

### 7.1 Vocabulário — `src/components/views/Metrics.tsx`, rota `/vocabulario`

| Elemento | Protótipo v2 ("Palavras") | App real | Veredito | O que fazer |
|---|---|---|---|---|
| Título | "Palavras" | "Vocabulário" (kids "Palavras", senior "Seu Caderno de Palavras & Frases") | `DIVERGE` | Renomear. |
| Abas | — | `metricsTab.dashboard` **Visão geral** / "Resumo" · `lexical` **Inteligência lexical** / "Suas palavras a fundo" / "Detalhes das palavras" · `fluency` **Desempenho & fluência** / "Sua fala" / "Como você fala" (`profile.ts:303-317`); "Mais" em kids/senior | `AUSENTE` | 3 abas. |
| Exportar | — | **"Exportar Relatório"** (kids "Baixar Palavras", senior "Exportar Meu Caderno", `Metrics.tsx:395`) → `babel-play-relatorio-YYYY-MM-DD.txt` (`lib/relatorioDeProgresso.ts`) | `AUSENTE` | Botão. |
| KPIs | Total · Novas · Revisão · Dominadas | `metric.deckSize` "Volume lexical ativo" (+ "N novos • N p/ revisar"), `metric.retention` (estimativa · confiança %), `metric.reviews` (sessões · dias seguidos), tempo com o idioma (**palavras ouvidas · min falando** — `progresso-de-idioma`), `metric.level`, `metric.cefr`, `metric.wpm`, `metric.evolution` (`profile.ts:266-301`); clique → `MetricsExpandedKpi.tsx` | `PARCIAL` | KPIs reais com selo "estimativa · confiança"; KPI expandido. |
| Gráficos | — | `metrics/EvolucaoSemanal.tsx` (recharts), `metrics/NiveisDoConjunto.tsx` (distribuição CEFR) | `AUSENTE` | 2 gráficos. |
| Lista | tabela en/pt/status com 4 filtros | `vocab/CatalogoDePalavras.tsx`: paginada, busca no servidor; `NotaDeContagem.tsx` explica o número; estados do cartão FSRS `New \| Learning \| Review \| Relearning` (não "novo/revisão/dominada") | `PARCIAL` | Estados reais; paginação. |
| Curadoria | — | `CuradoriaBaralho.tsx`: o que ficou de fora das rodadas e por quê (ex.: "tradução igual à palavra") | `AUSENTE` | 1 tela. |
| Mapa do conteúdo | — | `MapaDoConteudo.tsx`: o que já caiu, nunca caiu, o que errei | `AUSENTE` | 1 tela. |
| Baralhos Anki | — | `BaralhosAnki.tsx` (lista com busca/paginação, ativar/desativar, importar `.apkg`, exportar), `BaralhoAnki.tsx` (notas do baralho) | `AUSENTE` | 2 telas. `openspec/specs/acervo-anki/spec.md`. |
| Trilha | — | `PainelTrilha.tsx`: vocabulário curado por nível/etapa CEFR (16 idiomas em `public/trilha/`) | `AUSENTE` | 1 painel. |

### 7.2 Revisar (SRS) — `src/components/views/Study.tsx`, rota `/revisar[/:id]`

| Elemento | Protótipo v2 | App real | Veredito | O que fazer |
|---|---|---|---|---|
| Fluxo | flip-card → "Próxima palavra" (sem avaliação) | cartão → **"Mostrar Resposta"** (L1092, dispara TTS) → **"Como foi o seu desempenho?"** (L1098) → 4 botões FSRS-5: **Errei** `10m` · **Difícil** `1.2d` · **Bom** `3.5d` · **Fácil** `8d` (L1109-1136), com o intervalo previsto em cada botão; Leitner (opção): "Errei (Volta Caixa 1)" · "Acertei (Avança Caixa)" (L1147); cartão de conclusão. Algoritmo: `src/core/learning/scheduler.ts` (FSRS-5, 19 pesos); `openspec/specs/rodada-e-fsrs/spec.md` | `DIVERGE` | Os 4 botões com intervalo são o coração do produto. |

### 7.3 Analista de Vocabulário — `src/components/VocabularyPanel.tsx` (usado em Captura, Sessão, Leitura, Revisar, Vocabulário)

| Bloco | App real | Veredito |
|---|---|---|
| Cabeçalho | palavra + **IPA** (com link da fonte) ou "O verbete não traz transcrição fonética."; idioma; selo **CEFR** (com procedência, `procedencia-do-nivel`) | `AUSENTE` |
| Áudio | **Ouvir** (TTS) + velocidade 0,75× / 1,0× | `AUSENTE` |
| Tradução | automática com `Provenance` (opus-mt-local / chrome-translator / mymemory / nuvem) e limites; "traduzindo…" / motivo da ausência | `AUSENTE` |
| Dicionário | Wiktionary: até 3 acepções com classe gramatical e exemplo; `not-found` ("Não vamos inventar uma definição") | `AUSENTE` |
| Links | Wiktionary · **Forvo (voz humana)** | `AUSENTE` |
| Explicação / Exemplo | só se existirem (invariante de honestidade `types.ts:27`) | `AUSENTE` |
| Ações | **Adicionar ao deck (SRS)** / "No seu deck" · **Revisar agora** · **Exercitar** (Duelo relâmpago começando por esta palavra) | `AUSENTE` |
| Imagem | **não existe** | — |

---

## 8. Progresso

O protótipo criou uma tela "Progresso" que **não existe** como rota. Os números vivem em: Hub (faixa + relatório executivo), Vocabulário (3 abas + KPIs), Perfil → Progresso, Personalizar → Desafios, e no cabeçalho de Jogar. Duas saídas válidas para o design: (a) manter uma tela "Progresso" como **proposta** de agregação, marcada como tal; (b) redistribuir. Em ambas, os números têm de ser os reais:

| Número no protótipo | Fonte real | Veredito |
|---|---|---|
| "Nível 12 · 340/500 XP" | XP é **derivado** das métricas, nunca armazenado (`src/core/learning/xp.ts`): sessão 25, palavra 2, revisão 3 (+2 certa), item de jogo 1 (+2 certo), presença 10, 7 dias 50, 5 min de captura 10 (teto 30 min/dia), palavra fichada 2, rodada perfeita 15. Curva `levelFloor(n) = 50·n·(n−1)`; Nv.2 = 100, Nv.3 = 300, Nv.4 = 600, Nv.5 = 1000. Senior chama de **"Etapa"**; Hub diz ETAPA, Personalizar diz NÍVEL (ux-v2 §1.7 pede uma palavra só) | `PARCIAL` |
| "Ofensiva 9 dias" | `economia.ts:69-96`; **sem penalidade por quebrar**; marcos de 7 dias | `OK` |
| "Retenção 87 %" | retenção FSRS (`retrievability`) com selo **"estimativa · confiança N %"** (`prints/06-vocabulario-senior.png`) | `PARCIAL` |
| "Palavras dominadas 612" | estados FSRS `Review` estáveis; a tela real mostra "guardadas / novas / p/ revisar" | `DIVERGE` |
| CEFR "B1 B2 C1" clicável | `core/learning/fluencia.ts`: nível **sustentado** por retenção, corte 80 %, monotônico, com `base`/`confianca`; **não é escolhido pelo usuário** | `DIVERGE` |
| "Estudo por semana" barras | `EvolucaoSemanal.tsx` (palavras/semana, recharts); histórico de XP em `historicoDeXp.ts` | `OK` |
| "Meta da semana 5 de 7" | não existe meta semanal; existe **Meta de Comunicação** (ppm alvo × ppm medido, Ajustes → Idiomas) | `INVENTADO` |
| "Recomendações" | Hub "Recomendações e Próximos Passos" com dado real | `OK` |
| — | **Perfil → Progresso** (`perfil/AbaProgresso.tsx`): "Como você chegou até aqui" (histórico de XP), "Onde você está no idioma" (CEFR), "O que você acumulou" | `AUSENTE` |
| — | tempo com o idioma: **ativo × passivo** (palavras ouvidas × minutos falando; `openspec/specs/progresso-de-idioma/spec.md`) | `AUSENTE` |

---

## 9. Personalizar (Loja, Meu visual, Passe, Desafios)

Arquivos: `src/components/views/Loja.tsx`, `Personalizar.tsx`, `personalizar/{Inventario,EditorDoItem,SeletorDePaletas,SeletorDeEmojis}.tsx`, `passe/{PasseDeTemporada,CabecalhoDeTemporada,ComprarCreditos}.tsx`, `Conquistas.tsx`; catálogo `src/core/loja.ts`; regras `src/lib/galeria/*`. Docs: `docs/loja-roadmap.md`, `docs/economia-v2.md`, `docs/auditoria/ux-v2.md`, specs `cromas`, `gating-da-galeria`, `comunicacao-de-obtencao`, `posse-uma-regua`, `economia`.

### 9.1 Estrutura

| Elemento | Protótipo v2 | App real | Veredito | O que fazer |
|---|---|---|---|---|
| Abas | Temas · Partículas · Cursores · Perfis | **Meu visual · N** (`Shirt`) · **Loja · N** (`ShoppingBag`) · **Passe** (`Ticket`) · **Desafios · N** (`Trophy`) (`Loja.tsx:482-485`); URL `/loja/{meu-visual\|itens\|passe\|desafios}`; padrão = Meu visual | `DIVERGE` | 4 abas reais; os tipos (temas, partículas…) são **filtros dentro** de Meu visual e Loja. |
| Cabeçalho | Seeds | `CabecalhoDeTemporada.tsx`: Temporada 1 "Fundação", nível, XP, **Seeds** (broto) e **Créditos** (moeda); "próxima recompensa · nível N: X" | `PARCIAL` | Duas moedas. |
| Duas moedas | só Seeds | **Seeds** (só estudando, nunca à venda) × **Créditos** (dinheiro; pagam Passe Premium e prateleira paga; não compram progresso) — texto explicativo em `Loja.tsx:517-553`; `ComprarCreditos.tsx` (rodapé, rota `/creditos`) | `AUSENTE` | Legenda das moedas + tela de compra de Créditos. |
| Loadout | 3 chips (tema, partículas, cursor) | `Inventario.tsx:54-59`: **6 slots** — Temas · Partículas · Rastros · Cursores · Emojis · Fontes | `PARCIAL` | 6 slots. |
| Meu visual | — | `Personalizar.tsx`: editor por peça (`EditorDoItem`), **paletas** (`SeletorDePaletas`: 6 estilos × 30 matizes = 180 geradas + curadas; `claro`, `pastel`, `papel` livres; `escuro`, `neon`, `meia-noite` são itens `gal-estilo-*`), fonte, partículas + intensidade, **editor de pack de emojis** (`SeletorDeEmojis`, item `gal-editor-pack`), **cursor de qualquer emoji** (`gal-cursor-emoji`), **rastro** (forma × paleta), posição do menu, **Estúdio** (E3), **tema customizado** (4 tokens), **perfis salvos** (até 30, renomear/aplicar/apagar), **"Voltar ao visual original"** (direito, `lib/galeria/restaurar.ts`) e **perfil de exibição** | `AUSENTE` | A tela mais densa do app; 1 mock por bloco. |
| Loja | grid comprar/equipar | filtros Tudo · Temas · Fontes · Partículas · Cursores · Rastros · Estúdio · Galeria; prateleiras **Em destaque** (o mais caro que o saldo paga) · **Dá para levar agora** · **Ainda não** (ordenado pelo que falta menos) · **Com Créditos**; peça trancada diz **"Falta: Nível N ou M Seeds"** (rota de aquisição) | `PARCIAL` | Prateleiras + card trancado com "como conseguir". |
| Passe | — | `PasseDeTemporada.tsx` (`src/core/passe.ts`): **100 casas**, década N = nível N do app; marcador; casa 10 de cada década = marco; **cofres de Seeds** desenhados por década; fileira **Premium** (Créditos por década + **Variantes Douradas** nas casas 10, 20…100); "creditado" só após confirmação do servidor | `AUSENTE` | Trilha horizontal de 100 casas com 2 fileiras. |
| Desafios | — | `Conquistas.tsx`: resumo, "Só por conquista" (exclusivos com progresso), **"Como ganhar Seeds e XP"** (gerado de `economia.ts REGRAS`), curva de nível (próximos 5), grade por raridade com progresso e data. **Não há missões diárias** apesar do nome | `AUSENTE` | 1 tela. |
| Perfil de exibição | 3 cards | `Personalizar.tsx:184-215`: Kids/Gamer · Produtividade · Leitura ampliada; sem cadeado; muda densidade, linguagem e dificuldade dos jogos | `OK` | Manter; anotar "direito, sempre grátis". |
| Perfis-preset | 6 (Pato, Arcade, Espaço, Praia, Floresta, Minimal) | **18** (`lib/galeria/perfis.ts`): Tudo de pato 🦆 · Tudo de coração 💖 · Arcade 👾 · Espaço sideral 🚀 · Pizzaria 🍕 · Floresta 🌿 · Oceano 🌊 · Lo-fi 🎧 · Halloween 🎃 · Natal 🎄 · Praia 🏖️ · Café ☕ · Minimal ⬜ · Menta fresca 🌿 · Grafite ⬛ · Festa 🎉 · Esportes 🏆 · Tesouro 💎; cada um = paleta + fonte + partículas + pack + cursor + rastro; card mostra **"Falta: X: Nível N ou M Seeds"** | `PARCIAL` | 18 cards com "falta". |

### 9.2 Catálogo real (`src/core/loja.ts`) — o do protótipo é inventado

Faixas de preço: comum 40-60 · raro 100-140 · épico 200-260 · lendário 380-600 Seeds. Itens "exclusivo de conquista" não têm preço.

**Temas** (protótipo: Babel Atelier, Deep Emerald, Sunset Gold, Nordic Frost, Amethyst Night, Arcade — esses são **paletas curadas**, não temas):

| id | Nome | Rar. | Nível | Seeds |
|---|---|---|---|---|
| `tema-babel` | Babel Atelier | comum | 1 | grátis |
| `tema-linear` | Linear Indigo | comum | 2 | 60 |
| `tema-vercel` | Vercel Geist | raro | 4 | 110 |
| `tema-mochi` | Mochi Parchment | raro | 6 | 130 |
| `tema-notion` | Notion Charcoal | raro | 7 | 140 |
| `tema-premium` | Instrument Premium | épico | 8 | 240 |
| `tema-custom` | Tema Customizado | lendário | 10 | 600 |
| `tema-aurora` | Tema Aurora | lendário | — | conquista `constante` |

**Partículas** (protótipo: tema/pixel/confete/corações/estrelas/emoji com 200-300): reais `part-pixel` 45 Nv2 · `part-confete` 55 Nv3 · `part-emoji` "Chuva de Emojis" 120 Nv4 · `part-coracoes` 120 Nv5 · `part-estrelas` 240 Nv7 · `part-cometa` lendário (conquista `ouvinte`) + "Do tema" padrão. **Aprimoramentos**: `apr-particulas` "Explosão de Partículas" e `apr-sorte` "Sorte de Eventos Raros", Nv.0→3 com barra, custos 50/110/220.

**Cursores** (protótipo: 6 com 150-250): reais **25** — `cur-padrao` grátis; `cur-pata` 🐾 45 · `cur-mira` 🎯 50 · `cur-tinteiro` 🖋️ 50 · `cur-cafe` ☕ 50 · `cur-pato` 🦆 100 · `cur-varinha` 🪄 110 · `cur-pizza` 🍕 120 · `cur-lanterna` 🔦 120 · `cur-golfinho` 🐬 120 · `cur-trevo` 🍀 130 · `cur-coruja` 🦉 140 · `cur-fogo` 🔥 220 · `cur-borboleta` 🦋 220 · `cur-espada` ⚔️ 240 · `cur-cristal` 💎 240 · `cur-robot` 🤖 240 · `cur-dragao` 🐉 250 · `cur-unicornio` 🦄 250 · `cur-foguete` 🚀 260 · `cur-tridente` 🔱 400 · `cur-raio` ⚡ 400 · `cur-invader` 👾 500 · `cur-coroa` 👑 (conquista `perfeccionista`) · `cur-katana` 🗡️ (conquista `nivel-10`).

**Rastros do mouse** (ausentes no protótipo): 19 — `ras-off` grátis; Faíscas 100 · Esteira de Bolhas 100 · Estrelas 110 · Maré 130 · Lo-fi 140 · Corações 220 · Trilha de Chamas 220 · Pixel 230 · Voo de Pétalas Zen 230 · Arcade 230 · Esmeralda 250 · Menta 250 · Emoji (pack equipado) 380 · Fita Cibernética 380 · Poeira Estelar 400 · Ametista 420 · Ouro 420 · Arco-íris (conquista `colecionador`) · Fluxo Matrix 84 (conquista `duelista`).

**Packs de emoji** (ausentes): 36, de `pack-classico` grátis a `pack-lendas`/`pack-cyberpunk` 450 e `pack-tesouros` 550; `pack-astrologia` "Zodíaco Celestial" só por conquista `poliglota` (é o do `prints/03-modal-conquista.png`).

**Fontes** (ausentes): 8, **todas grátis Nv.1** ("tipografia é legibilidade, não enfeite"): Padrão (Inter/Archivo), Pixel (Silkscreen + chiptune), Serif (Merriweather), Mono (JetBrains Mono), Cyber (Orbitron/Rajdhani), Rounded (Baloo 2/Nunito), Handwriting (Caveat), Display.

**Galeria** (capacidades, ausentes): 13 itens `gal-*` — estilos de paleta Pastel 50 · Escuras 60 · Néon 120 · Meia-noite 220; Editor de pack 50; Cursor de qualquer emoji 100; categorias de emoji 40-110.

**Variantes Douradas** (ausentes): 10, lendárias, **150 Créditos** cada ou grátis nas casas 10…100 do Passe Premium.

**Cromas** (`lib/galeria/cromas.ts`): matiz alternativo de uma peça já possuída, 15/25/40/60 Seeds por raridade (`openspec/specs/cromas/spec.md`).

### 9.3 Conquistas (14) — `src/core/learning/conquistas.ts:63-89`

| Nome | Condição | Rar. | Seeds / XP | Exclusivo |
|---|---|---|---|---|
| Primeira captura 🎙️ | 1 sessão | comum | 25 / 30 | — |
| Ouvinte 🎧 | 60 min gravados | raro | 60 / 80 | partícula Cometa |
| Caderno cheio 📒 | 50 palavras fichadas | comum | 40 / 50 | — |
| Revisor 🧠 | 100 revisões certas | raro | 60 / 80 | — |
| Sem erro ⭐ | 1 rodada 3 estrelas | comum | 20 / 30 | — |
| Perfeccionista 👑 | 10 rodadas 3 estrelas | épico | 80 / 120 | cursor Coroa |
| Maratonista 🔥 | 7 dias seguidos | raro | 50 / 60 | — |
| Constante 🌌 | 30 dias seguidos | lendário | 150 / 200 | tema Aurora |
| Colecionador 🌈 | todos os eventos raros | épico | 100 / 120 | rastro Arco-íris |
| Poliglota 🌍 | gravar em 2 idiomas | raro | 40 / 60 | pack Zodíaco Celestial |
| Duelista ⚡ | combo ×15 no Duelo | épico | 50 / 80 | rastro Matrix |
| Cliente 🛍️ | 1ª compra | comum | 15 / 20 | — |
| Nível 5 🎯 | nível 5 | comum | 50 / 0 | — |
| Nível 10 🏆 | nível 10 | épico | 120 / 0 | cursor Katana |

---

## 10. Planos, Perfil, Sobre, Ajustes

### 10.1 Planos — `src/components/views/Planos.tsx`, rota `/plano`

| Elemento | Protótipo v2 | App real | Veredito | O que fazer |
|---|---|---|---|---|
| Abas | — | **"O que cada plano dá"** · **"Consumo do mês"** (L160-161) | `AUSENTE` | 2 abas. |
| Cards | 3: Grátis R$ 0 · Essencial R$ 9,90 · Pro R$ 19,90 (recomendado) | `src/core/planos.ts:56-85`: **free** (R$ 0; 500 MB) · **essencial** (R$ 9,90; LLM nuvem; 12.000 chamadas; 1 GB) · **pro** (R$ 19,90; + YouTube, STT nuvem 36.000 s, modelos maiores; 5 GB). A tabela da tela tem **3 colunas**; o **self-host** (sem preço, tudo liberado) aparece como **nota abaixo da tabela**: "Rodando no seu computador (self-host): sem limites…" (`Planos.tsx:266`). **BYOK livre em qualquer plano**; `CardDePlanos.tsx`, `planos/Assinar.tsx` (só com billing configurado; Asaas) | `PARCIAL` | Linha BYOK; nota self-host; estado "plano atual"; botão Assinar com e sem billing. |
| Linhas da tabela | 8 (Captura, Identificação de falantes, Jogos, Qualidade 57/85/85, Idiomáticas 27/83/83, Erro PT 57/57/24, YouTube, Armazenamento) | 10 (`Planos.tsx:45-80`): + **"Modelos para baixar no primeiro uso"** (230-413 MB × nenhum) e **"Sua própria chave de IA (BYOK)"** (✓ ✓ ✓); "Suas sessões guardadas na conta" 500 MB / 1 GB / 5 GB; cada número com **fonte visível** (`openspec/specs/matriz-de-planos/spec.md`, `docs/auditoria/eval-producao-v1.md`) | `PARCIAL` | 2 linhas a mais; nota de fonte por número. |
| Consumo do mês | — | `LinhaDeUso` com barras (chamadas, segundos STT, armazenamento), "sem limite", `Vazio "Consumo indisponível"`, "Carregando…" | `AUSENTE` | 1 aba com 3 barras + 2 estados. |

### 10.2 Perfil — `src/components/views/Perfil.tsx`, rota `/perfil` (chega pelo menu do avatar)

| Aba (`Perfil.tsx:62-68`) | Conteúdo | Veredito |
|---|---|---|
| **Você** (`perfil/AbaVoce.tsx`) | "Como você quer ser chamado", "O que você quer alcançar", "Sobre você", "Do que você gosta" (interesses agrupados), "Conta" | `AUSENTE` |
| **Progresso** (`AbaProgresso.tsx`) | ver §8 | `AUSENTE` |
| **Seus dados** (`AbaDados.tsx`, LGPD art. 18) | "Baixar os seus dados" (JSON, `GET /api/me/exportar`), "Excluir a conta" (irreversível) + relatório "O que foi apagado" / "Arquivos que resistiram" | `AUSENTE` |

### 10.3 Sobre — `src/components/views/Sobre.tsx`, rota `/sobre`

"A pessoa por trás do app", princípios, "Fale comigo" (Pix copiar, e-mail, LinkedIn, GitHub Sponsors — `src/lib/criador.ts`), links `/privacidade.html` e `/termos.html`. Contexto: `docs/lancamento-2026-09.md` (indie, build in public), `docs/monetizacao.md` (apoio direto → freemium). `AUSENTE` — 1 tela.

### 10.4 Ajustes — `src/components/views/Settings.tsx`, rota `/ajustes`

| Aba (`Settings.tsx:57-61`) | Conteúdo | Veredito |
|---|---|---|
| **Idiomas** | **"Os dois idiomas"** (L327): idioma que estou aprendendo, meu idioma, idioma da interface (só ≥ piso 90 %: pt, en; nota "Traduções em andamento…"); aviso idiomas iguais (L366); `LangPicker.tsx` (32 idiomas, bandeira, busca); `CoberturaDosIdiomas.tsx` (STT/MT/TTS por idioma); **LangAudit** (`LangAudit.tsx`: corrige cartões com idioma errado); **"Meta de Comunicação"** (L414): Comunicação Executiva 140 ppm · Criador/YouTuber 170 ppm · Estilo Palestrante (TED) · Tech/Developer + "Seu ritmo medido" (ppm real × alvo, selo estimativa) | `AUSENTE` |
| **Como o app se parece** | só um ponteiro "Abrir Personalizar" | `AUSENTE` |
| **Onde as contas rodam** | **Plano** (+ armazenamento MB, "Ver planos e preços") · **Motores de IA** (`AiEnginePanel.tsx`, `gateway/profiles.ts`: `free-web` "Grátis" · `local-private` "Privado" (Ollama/LM Studio) · `cloud-quality` "Nuvem" (BYOK); matriz stt · mt · tts · llm · embed · vlm + teste ao vivo; credenciais cifradas AES-256-GCM no servidor, nunca voltam ao navegador) · **Privacidade e Processamento** | `AUSENTE` |
| **Conta e recomeço** | `AccountSecuritySection` (trocar senha, sair) · "Ajuda e recomeço": Guia rápido (L638), Sobre, **Rever apresentação**, **Reconfigurar** (destrutivo, único da tela) | `AUSENTE` |

Referência visual das abas (em pseudo-locale): `prints/11-ajustes-pseudo-locale.png`, `prints/12-ajustes-locale-envenenado.png`.

---

## 11. Estados transversais (cada tela precisa dos seus)

| Estado | Como o app trata | Onde |
|---|---|---|
| Vazio | título + causa + ação (+ ação secundária) | `ui/Vazio.tsx`; Jogar "Faltam N palavras"; Biblioteca sem sessões; Consumo indisponível |
| Carregando | "Carregando…" por view lazy; esqueleto anti-CLS no Hub | `App.tsx:272`, `Hub.tsx` |
| Erro de tela | `ErroDaTela.tsx` | global |
| Erro de ação | toast persistente com detalhe + som | `Toast.tsx` |
| Sem conta | convite inline / gate modal / migração | `conta/*` |
| Sem tradutor para o par | "⚠ Não há tradutor para X↔Y" / "⚠ exige internet" | Capturar, Ajustes |
| Idiomas iguais | "as palavras fichadas ficam sem verso" | Capturar, Ajustes |
| Permissão do mic negada | texto + "Listar dispositivos" | Capturar |
| Janela sem áudio / faltou marcar áudio | modal + "Escolher de novo" | Capturar |
| Download de modelo | 2 barras, MB, "já em cache", "Tentar de novo" | `ModelPrepPanel.tsx` |
| Sem SpeechRecognition | Karaokê "não dá nota" e diz por quê | `KaraokeGame.tsx` |
| Sem som para o item | jogo diz que não há som (não mostra botão morto) | `lib/falante.ts` |
| Jogo bloqueado | motivo fechado + porta de saída | `core/minigames/{estadoDosJogos,desbloqueio}.ts` |
| Métrica sem timing | "—" | `metricasDaSessao.ts` |
| Peça trancada | "Falta: Nível N ou M Seeds" | `Personalizar.tsx`, `Loja.tsx` |
| RTL | árabe inverte a interface | `prints/08-jogar-rtl.png`, `09`, `10` |
| Pseudo-locale (+40 % de texto) | nada corta | `prints/11-ajustes-pseudo-locale.png`, e2e `pseudo-localizacao.e2e.ts` |

---

## 12. Mobile e tablet

- 375×812: dock inferior com 5 itens + "mais" (`MobileNav.tsx`), barra de topo (`MobileTopBar.tsx`); Capturar tem cluster próprio de controles mobile (`LiveCapture.tsx`, variantes `hidden`); grade de jogos rola de lado; Antessala e Raspadinha em coluna; cards de Planos empilhados.
- 768×1024: barra no topo, 2 colunas.
- 1280×800: barra ou rail; Sessão e Leitura em 2 colunas com painel lateral.
- O protótipo só tem 1360×860 fixo. Prioridade de mocks mobile: Hub, Capturar (com PiP), Jogar lobby + 1 jogo + Raspadinha, Revisar, Vocabulário.

---

## 13. Divergências factuais a corrigir no protótipo (lista fechada)

1. Nav: "Palavras" → "Vocabulário"; "Progresso" não é tela; faltam "Sobre" e "Ajustes" (`navItems.ts`).
2. Busca "em breve" → existe (`BuscaGlobal.tsx`). iChat "em breve" → existe (`IChat.tsx`). Ajustes de captura "em breve" → gaveta real.
3. Exportação `.srt` **não existe**; os formatos são `.md` (métricas), `.csv` (Anki), áudio (5 formatos), vídeo bloqueado, `.apkg`, relatório `.txt`, JSON LGPD, "baixar transcrição".
4. Rodapé do Hub "R$19/mês" → "a partir de R$ 9,90".
5. "Recomendado" nos jogos não existe; existe "pronto" × "precisa de outro material" com motivo.
6. Revisão sem avaliação → 4 botões FSRS com intervalo (Errei 10m · Difícil 1.2d · Bom 3.5d · Fácil 8d).
7. Estados de palavra "novo / revisão / dominada" → `New / Learning / Review / Relearning` + "novas / p/ revisar" na tela.
8. Import com 3 fontes → 4 (falta Áudio Local); YouTube só Pro, com cadeado explicado.
9. Modal de sessão → tela de sessão com 4 abas e URL própria.
10. Catálogo de Personalizar (6 temas, 6 partículas, 6 cursores, 6 perfis, preços 150-600) → catálogo real (§9.2) com níveis, raridades, exclusivos de conquista e duas moedas.
11. Abas de Personalizar (Temas/Partículas/Cursores/Perfis) → Meu visual / Loja / Passe / Desafios.
12. "Meta da semana 5 de 7 dias" não existe; CEFR não é escolhido pelo usuário.
13. Tabela de planos: faltam "Modelos para baixar no primeiro uso" e "BYOK"; falta a nota self-host abaixo da tabela; "Identificação de falantes" está certo (existe, `LiveCapture.tsx:2317`).
14. Onboarding: falta o provedor "Personalizado (OpenAI-compatível)"; download é ~33 MB (tiny) ou ~85 MB (base), com painel de 2 barras.
15. Cabeçalho de Capturar: não há botões de marcador nem pausa; há gaveta de config, "?", Foco Cheio e Bingo.
16. Overlay: não é um card fixo, é uma janela PiP sempre-no-topo (ou overlay embutido como fallback) com 3 layouts e 3 níveis.
17. Biblioteca: os 3 KPIs (sessões/palavras/tempo) não estão lá; estão em Vocabulário.
18. Sidebar: o app tem barra no topo por padrão e 4 posições; a sidebar fixa é uma delas.
19. Perfil de exibição: rótulos reais "Kids / Gamer", "Produtividade", "Leitura ampliada" (os do onboarding — "Jogo e vídeos" etc. — também existem, no `Onboarding.tsx`).
20. Ranking global: envio é opt-in, só no resultado do Blitz, com apelido de 3-20 caracteres.

---

## 14. Índice de fontes

### Specs [UI] (`openspec/specs/<nome>/spec.md`)
`ciclo-do-usuario` (identidade, login, onboarding, URL) · `modo-anonimo` · `paridade-anonima` · `entrega-honesta` · `metricas-honestas` · `leitura-padrao` · `fonte-ciclica` · `filtro-facetado` · `persistencia-e-url` · `elegibilidade-por-jogo` · `jogo-so-entra-pelo-sistema` · `rodada-e-fsrs` · `conteudo-e-trilha` · `acervo-anki` · `economia` · `credito-com-autoridade` · `coerencia-e-recompensa` · `posse-uma-regua` · `cromas` · `gating-da-galeria` · `comunicacao-de-obtencao` · `matriz-de-planos` · `descobribilidade-de-planos` · `i18n` · `tres-eixos-de-idioma` · `procedencia-do-nivel` · `progresso-de-idioma` · `e2e-tres-viewports`.

### Docs
`docs/auditoria/ux-v2.md` (usuário leigo, tela a tela; vocabulário canônico) · `docs/auditoria/ux-v1.md` · `docs/auditoria/tela-de-jogos-v1.md` (100 KB, a tela de jogos) · `docs/auditoria/seletor-de-conteudo-v1.md` · `docs/auditoria/pente-fino-jogos-v1.md` · `docs/auditoria/jogos-com-baralho-importado.md` · `docs/auditoria/multi-idioma-v1.md` · `docs/auditoria/eval-producao-v1.md` (os números dos planos) · `docs/curriculo-gamificacao-sla.md` (visão pedagógica, 49 KB) · `docs/loja-roadmap.md` · `docs/economia-v2.md` · `docs/captura-audio.md` · `docs/fala-do-mic-e-traducao-comunicativa.md` · `docs/selecao-de-conteudo.md` · `docs/minigames_spec.md` (desatualizado: descreve uma branch) · `docs/auth/auth-flow-design.md` · `docs/i18n.md` · `docs/lancamento-2026-09.md` · `docs/monetizacao.md` · `docs/arquitetura.md` · `docs/prototipos/{aba-de-jogos-v2,gravacao-redesign,jogos-redesign,praticar-v2}.html` (4 protótipos anteriores, mesmos tokens).

### Código-fonte de verdade
`src/lib/rotas.ts` · `src/components/shell/navItems.ts` · `src/lib/profile.ts` (copy × 3 perfis) · `public/i18n/en.json` (701 strings de UI) · `src/components/views/play/jogos.tsx` · `src/core/minigames/types.ts` · `src/core/minigames/grade.ts` · `src/core/loja.ts` · `src/core/passe.ts` · `src/core/planos.ts` · `src/core/learning/{xp,economia,conquistas,scheduler,fluencia,pronunciation}.ts` · `src/lib/galeria/{paletas,perfis,acesso}.ts` · `src/lib/eventosDeJogo.ts` · `src/lib/analise/metricasDaSessao.ts` · `src/index.css:198` (tokens).

### Prints (`prints/`)
`01-hub-pro.png` Hub perfil pro (barra no topo, faixa de progresso, card-herói, 3 pilares, relatório executivo) · `02-hub-senior.png` Hub perfil senior (passos 1-2-3, etapa 15) · `03-modal-conquista.png` RecompensaDesbloqueada (Poliglota + Zodíaco Celestial) · `04-capturar.png` Captura ao vivo (3 cenários, fonte, idiomas, estado vazio de 3 passos) · `05-jogar-lobby.png` lobby de Jogar (praticando, baralho, mapa, revisão, próxima rodada, grade com arte) · `06-vocabulario-senior.png` Vocabulário senior (4 KPIs com estimativa/confiança) · `07-biblioteca-sem-conta.png` convite de conta · `08-jogar-rtl.png`, `09-jogar-rtl-limpo.png`, `10-rtl-sessao.png` árabe RTL · `11-ajustes-pseudo-locale.png`, `12-ajustes-locale-envenenado.png` Ajustes (4 abas) sob teste de i18n.

---

## 15. Apêndice — glossário canônico e os 3 perfis

| Termo canônico | Sinônimos a evitar | Fonte |
|---|---|---|
| **gravação / sessão** (a busca diz "gravação") | mídia, lição, aula | ux-v2 §1.8 |
| **etapa** (senior) / **nível** (pro) — escolher uma | — | ux-v2 §1.7 |
| **casa do passe** | "nível do passe" | ux-v2 §1.1 |
| **Seeds** 🌱 (ganha estudando) × **Créditos** 🪙 (dinheiro) | moedas, pontos | `Loja.tsx:517` |
| **Meu visual** | Biblioteca (de itens), cofre | ux-v2 §1.2 |
| **trilha** (curso por CEFR) · **baralho** (Anki) · **minhas gravações** · **acervo** | deck | `conteudo-e-trilha` |
| **ofensiva** (streak, chama) × **combo** (dentro do jogo) | — | ux-v2 §1.4 |
| **Conquistas** (troféu) × **recorde** (medalha) | — | ux-v2 §1.4 |
| **Vocabulário** (tela) · **Revisar** (SRS) · **Jogar** (rodadas) | Palavras, Progresso, Praticar (só no senior) | `navItems.ts` |

**Os 3 perfis** (`src/lib/profile.ts`): `kids` "Kids / Gamer" (missões, recompensas, linguagem de jogo; Roblox/YouTube/Discord) · `pro` "Produtividade" (densidade alta, termos técnicos) · `senior` "Leitura ampliada" (passo a passo, alvos 48 px, mais respiro, sem sigla). Copy completa × 3 em `profile.ts`, títulos de jogos × 3 em `jogos.tsx`, nav × 3 em `navItems.ts`, pilares × 3 em `Hub.tsx:739-790`.
