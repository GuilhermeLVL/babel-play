# Inventário funcional — o que existe antes e precisa existir depois

Checklist de paridade por tela. Uma linha por elemento que o usuário vê ou aciona; a coluna
**antes** foi marcada na F0 contra `main @ 2ac979b` (fonte: `docs/design/auditoria-prototipo-v2/AUDITORIA.md`
§1-§12 e `docs/redesign/INVENTARIO.md`, ambos com `arquivo:linha`). A coluna **depois** é marcada na PR
da fase que redesenha a tela; **item sem "depois" bloqueia o merge daquela fase**. Onde a linha diz
`E2E`, o comportamento já é cobrado pela suíte; onde diz `visual`, a prova é a evidência em
`docs/redesign/evidencias/`.

Legenda: `[x]` existe e funciona · `[ ]` a marcar · `—` não se aplica.

**Estado em 2026-09-11 (fim da primeira rodada)**: F2, F4, F5 e F6 entregues; a coluna "depois" está marcada
nas linhas dessas seções cuja prova é automática (E2E 99/0/15 e unitários verdes a cada fase). As linhas de
prova **manual** ficam abertas de propósito até a inspeção no navegador da próxima rodada. F7–F13 seguem com
a coluna "antes" apenas.

## Casca (F2) — `App.tsx`, `shell/*`, `StudioHeader.tsx`

| Elemento                                                      | Onde                                                                                      | antes | depois | Prova                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | :---: | :----: | ------------------------------------------------ |
| 9 itens de navegação na ordem real, rótulo × 3 perfis         | `navItems.ts:43-118`                                                                      |  [x]  |  [x]   | E2E `fumaca`, `quatro-superficies`               |
| `aria-current="page"` no item ativo                           | `NavRail.tsx:84`, `NavBar.tsx:54`, `MobileNav.tsx:47`                                     |  [x]  |  [x]   | E2E (getByRole)                                  |
| 4 posições de menu (top/bottom/left/right) e rail recolhido   | `StudioHeader.tsx:102-124`, `NavRail.tsx:40`                                              |  [x]  |  [x]   | E2E `tema`, `quatro-superficies`; unit `equipar` |
| Dock inferior no celular (5 itens + mais)                     | `MobileNav.tsx`                                                                           |  [x]  |  [x]   | E2E `mobile-375`                                 |
| Busca global Ctrl/⌘+K (gravações, palavras, ir para)          | `ControlCluster.tsx:143-158`, `BuscaGlobal.tsx`                                           |  [x]  |  [x]   | unit `buscaGlobal.test.tsx`                      |
| Ciclo de tamanho de texto A (sm/md/lg/xl)                     | `ControlCluster.tsx`, `useAparencia.ts:105-131`                                           |  [x]  |  [x]   | visual                                           |
| Menu de conforto: sons, animações, modo desempenho            | `MenuDeConforto.tsx`                                                                      |  [x]  |  [x]   | visual + `body.performance-mode`                 |
| Claro/escuro com rótulo "Mudar para o modo claro/escuro"      | `ControlCluster.tsx:203`                                                                  |  [x]  |  [x]   | E2E `tema`                                       |
| Menu da conta (entrar/perfil, plano e consumo, ajustes, sair) | `MenuDaConta.tsx`                                                                         |  [x]  |  [x]   | visual                                           |
| Navegação passa por `navGuard` (captura em andamento)         | `useNavegacao.ts:75`                                                                      |  [x]  |  [ ]   | manual (captura + trocar de tela)                |
| `<main>` com `age-${perfil}`                                  | `App.tsx:254`                                                                             |  [x]  |  [x]   | E2E (getByRole('main'))                          |
| iChat flutuante/acoplado/maximizado + `--shell-inset-*`       | `IChat.tsx:800-818`, `index.css:1348`                                                     |  [x]  |  [x]   | visual                                           |
| Toast (erro persistente, detalhe) e `askConfirm`              | `Toast.tsx`                                                                               |  [x]  |  [x]   | unit                                             |
| Tela de erro com código                                       | `ErroDaTela.tsx`                                                                          |  [x]  |  [x]   | visual                                           |
| Partículas, rastro, cursor, números flutuantes                | `ParticleCanvas.tsx`, `lib/rastroDoMouse.ts`, `lib/cursores.ts`, `FloatingScoreLayer.tsx` |  [x]  |  [x]   | visual (item equipado continua)                  |
| Menu de contexto "praticar este trecho"                       | `PracticeMenu.tsx`                                                                        |  [x]  |  [ ]   | manual                                           |
| Estúdio de layout (painéis editáveis)                         | `LayoutStudio.tsx`, `EditablePanel.tsx`                                                   |  [x]  |  [ ]   | manual                                           |

## Primeiro acesso (F10)

| Elemento                                                           | Onde                   | antes | depois | Prova                                          |
| ------------------------------------------------------------------ | ---------------------- | :---: | :----: | ---------------------------------------------- |
| Login: entrar / criar / recuperar / Google / "Continuar sem conta" | `Login.tsx`, `auth/*`  |  [x]  |  [ ]   | E2E `login` (HTTP)                             |
| Onboarding 8 passos, 4 provedores, download                        | `Onboarding.tsx`       |  [x]  |  [ ]   | manual (banco novo)                            |
| Rever apresentação (Ajustes → Conta e recomeço)                    | `Settings.tsx:628-660` |  [x]  |  [ ]   | manual                                         |
| Gate de conta, cartão de convite, migração, aviso por marco        | `conta/*`              |  [x]  |  [ ]   | E2E `limites-anonimo`, unit `app-gate-anonimo` |
| Guia rápido                                                        | `GuidePanel.tsx`       |  [x]  |  [ ]   | visual                                         |

## Início (F4) — `Hub.tsx`

| Elemento                                                             | Onde                            | antes | depois | Prova                     |
| -------------------------------------------------------------------- | ------------------------------- | :---: | :----: | ------------------------- |
| Kicker + título × perfil                                             | `Hub.tsx:146`                   |  [x]  |  [x]   | visual pro/senior         |
| 3 pilares com status real e CTA (o do meio leva a Revisar)           | `Hub.tsx:174,739-790`           |  [x]  |  [x]   | E2E `fumaca`              |
| Faixa nível/etapa + XP + ofensiva + Seeds                            | `progress/FaixaDeProgresso.tsx` |  [x]  |  [x]   | visual                    |
| Card-herói "N palavras venceram" só com vencidas, esqueleto anti-CLS | `Hub.tsx:248`                   |  [x]  |  [x]   | visual                    |
| Relatório executivo expansível (métricas, CEFR, comunicação)         | `Hub.tsx:293-446`               |  [x]  |  [x]   | visual                    |
| Recomendações e próximos passos                                      | `Hub.tsx:525`                   |  [x]  |  [x]   | visual                    |
| Sessões recentes com selo "processando"                              | `Hub.tsx:578-702`               |  [x]  |  [x]   | visual                    |
| Rodapé de planos lendo `core/planos.ts`                              | `Hub.tsx`                       |  [x]  |  [x]   | unit                      |
| Modal Recompensa desbloqueada                                        | `RecompensaDesbloqueada.tsx`    |  [x]  |  [x]   | E2E `_helpers` fecha; axe |

## Capturar (F8) — `LiveCapture.tsx`

| Elemento                                                                            | Onde                                   | antes | depois | Prova                           |
| ----------------------------------------------------------------------------------- | -------------------------------------- | :---: | :----: | ------------------------------- |
| Título × perfil, "?" (Guia), selo técnico                                           | `LiveCapture.tsx`                      |  [x]  |  [x]   | E2E `transcricao`               |
| Gaveta "Configurações de Dispositivos & IA" (dialog nomeado)                        | `LiveCapture.tsx:1656-1800`            |  [x]  |  [ ]   | E2E `transcricao` (dialog name) |
| 3 fontes de áudio do sistema + teste com veredito                                   | `:1656-1744`                           |  [x]  |  [ ]   | manual                          |
| Mic: switch, motor Navegador/Whisper, dispositivo, permissão negada                 | `:1786-1841`                           |  [x]  |  [ ]   | manual                          |
| Saída, qualidade STT, modo desempenho, aparência da legenda                         | `captura/TranscriptVisualSettings.tsx` |  [x]  |  [ ]   | manual                          |
| 3 cenários (mídia / conversa / minha voz)                                           | `lib/cenarioDeCaptura.ts`              |  [x]  |  [ ]   | visual                          |
| Chip de idiomas + drawer "Idiomas da sessão" + 3 avisos                             | `:2131-2166`                           |  [x]  |  [x]   | manual                          |
| Iniciar / Continuar / Parar & Salvar; timer; waveform real                          | `:2048-2061`                           |  [x]  |  [ ]   | manual (mic)                    |
| ModelPrepPanel (2 barras, cache, tentar de novo)                                    | `ModelPrepPanel.tsx`                   |  [x]  |  [ ]   | manual                          |
| Transcrição em balões com falante, ordem, "Ir para a fala atual", vazio de 3 passos | `ChatTranscript.tsx`                   |  [x]  |  [ ]   | visual                          |
| Palavra clicável → Analista de Vocabulário                                          | `ChatTranscript.tsx`                   |  [x]  |  [ ]   | manual                          |
| Painel Falantes (auto, cores, renomear, % de fala)                                  | `:2317-2345`                           |  [x]  |  [ ]   | manual                          |
| Legendas flutuantes: Overlay 3 layouts × 3 níveis + Document PiP                    | `Overlay.tsx`, `DocumentPiP.tsx`       |  [x]  |  [ ]   | manual                          |
| Foco Cheio                                                                          | `:2015`                                |  [x]  |  [x]   | visual                          |
| Bingo                                                                               | `minigames/BingoPanel.tsx`             |  [x]  |  [x]   | visual                          |
| Modal sair no meio; modal Encerramento com busca de capa                            | `:2452`, `BuscaDeCapa.tsx`             |  [x]  |  [ ]   | manual                          |

## Biblioteca, Sessão, Leitura (F7)

| Elemento                                                                           | Onde                                                             |    antes    | depois | Prova                   |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- | :---------: | :----: | ----------------------- |
| Título × perfil; busca; botão Filtros com contador; painel de filtros              | `Library.tsx:435-534`                                            |     [x]     |  [ ]   | visual                  |
| Segmentado Tudo/YouTube/Áudio/Documentos com contagens                             | `Library.tsx`                                                    |     [x]     |  [ ]   | visual                  |
| Cards: capa, alfinete, menu ⋮ (retomar, editar, excluir, baixar), selo processando | `Library.tsx`, `MiniaturaDoItem.tsx`                             |     [x]     |  [ ]   | manual                  |
| Modal editar sessão com busca de capa                                              | `Library.tsx`                                                    |     [x]     |  [ ]   | manual                  |
| Importar 4 fontes com cadeado por plano e motivo                                   | `Library.tsx:616-619`, `exigeConta.ts`                           |     [x]     |  [ ]   | E2E `rota-de-aquisicao` |
| Convite sem conta                                                                  | `conta/CartaoDeConvite.tsx`                                      |     [x]     |  [ ]   | E2E `limites-anonimo`   |
| Sessão: cabeçalho (voltar, selo de origem, procedência, alternar, exportar)        | `Analysis.tsx:675`                                               |     [x]     |  [ ]   | visual                  |
| 4 abas com URL (`/sessao/<id>/…`) e "Mais" em kids/senior                          | `Analysis.tsx`, `rotas.ts:75-80`                                 |     [x]     |  [ ]   | E2E (URL)               |
| Transcrição editável + tokens clicáveis + Analista à direita; renomear falantes    | `Analysis.tsx`, `TokensClicaveis.tsx`                            |     [x]     |  [ ]   | manual                  |
| Aba Jogos = lobby travado na sessão                                                | `Analysis.tsx`                                                   |     [x]     |  [ ]   | visual                  |
| Visão Geral: KPIs clicáveis, 3 sub-abas, "—" sem timing                            | `Analysis.tsx`, `AnalysisExpandedKpi.tsx`, `metricasDaSessao.ts` |     [x]     |  [ ]   | unit `metricasDaSessao` |
| Modal Exportar: .md, .csv Anki, áudio (5 formatos / desabilitado), vídeo bloqueado | `Analysis.tsx:2137-2303`                                         |     [x]     |  [ ]   | manual                  |
| Leitura: narração Original/Tradução/Bilíngue/Auto, velocidade, tom, voz            | `Reading.tsx:27-42`                                              |     [x]     |  [ ]   | manual                  |
| Leitura: largura, desenho sobre o texto, notas com voz, player interativo          | `Reading.tsx`, `analise/PlayerInterativo.tsx`                    |     [x]     |  [ ]   | manual                  |
| Reading consulta o deck (D-007)                                                    | `Reading.tsx:181`                                                | [ ] defeito |  [ ]   | unit novo               |

## Jogar (F6) — `Play.tsx`, `minigames/*`

| Elemento                                                                                       | Onde                                              | antes | depois | Prova                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------- | :---: | :----: | --------------------------------------------- |
| Cabeçalho × perfil; "N jogos"; Partida Rápida                                                  | `Play.tsx:2801,2157`                              |  [x]  |  [x]   | visual                                        |
| Painel nível/XP/ofensiva/Seeds (sem penalidade)                                                | `Play.tsx:2876-2895`                              |  [x]  |  [x]   | visual                                        |
| Seletor facetado: 6 facetas, URL `/jogar?…`, F5 preserva                                       | `SeletorDeConteudo.tsx`, `lib/filtroDaPratica.ts` |  [x]  |  [x]   | E2E `facetas`                                 |
| Ações Recordes / Mapa / Curadoria / Diagnóstico / Trazer do Anki / Gerenciar baralhos          | `Play.tsx:2986-3351`                              |  [x]  |  [x]   | E2E `baralhos`                                |
| Sala de Escolha (1ª vez)                                                                       | `SalaDeEscolha.tsx`                               |  [x]  |  [x]   | E2E `_helpers`                                |
| Card de revisão; card "Sua próxima rodada"                                                     | `Play.tsx`                                        |  [x]  |  [x]   | visual                                        |
| Categorias, busca, habilidades, prévia, Organizar (fixar/ordem)                                | `Play.tsx:3441-3722`, `lib/ordemDosJogos.ts`      |  [x]  |  [x]   | visual                                        |
| Grade: arte por jogo, cor por modalidade, recorde, estrelas, mapa de fases                     | `ArteDosJogos.tsx`                                |  [x]  |  [x]   | E2E `grade-so-com-jogos-do-sistema`           |
| "Precisam de outro material": motivo fechado + porta de saída                                  | `core/minigames/{estadoDosJogos,desbloqueio}.ts`  |  [x]  |  [x]   | unit `elegibilidade`                          |
| Vazio "Faltam N palavras"                                                                      | `Play.tsx:3407-3431`                              |  [x]  |  [x]   | visual                                        |
| Antessala: prévia, fases, dificuldade, leeches, 4 ações, "pular sempre"                        | `AntessalaDaRodada.tsx`                           |  [x]  |  [x]   | visual                                        |
| Como se joga; Tour da 1ª partida                                                               | `ComoSeJoga.tsx`, `TourGuiado.tsx`                |  [x]  |  [x]   | visual                                        |
| 18 jogos, cada um com mecânica e `RoundReport`                                                 | `minigames/*`, `core/minigames/types.ts`          |  [x]  |  [x]   | E2E `sessao-de-jogo`; unit `matriz-dos-jogos` |
| Raspadinha: estrelas, canvas, corrente, combo, recorde, próxima recompensa, 5 ações (40 Seeds) | `ScratchReward.tsx`                               |  [x]  |  [x]   | visual                                        |
| Resumo da rodada (só com erro): refazer erradas, subir dificuldade                             | `ResumoDaRodada.tsx`                              |  [x]  |  [x]   | visual                                        |
| Blitz: resultado próprio + envio opt-in ao ranking (apelido)                                   | `BlitzGame.tsx:333-407`                           |  [x]  |  [ ]   | manual                                        |
| Recordes: KPIs + tabela; ranking global por jogo                                               | `play/Recordes.tsx`                               |  [x]  |  [x]   | visual                                        |
| Eventos raros e baú (servidor sorteia)                                                         | `lib/eventosDeJogo.ts`, `economiaAutoridade.ts`   |  [x]  |  [x]   | unit                                          |

## Vocabulário e Revisar (F5)

| Elemento                                                                                                        | Onde                                  |    antes    | depois | Prova                                 |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------- | :---------: | :----: | ------------------------------------- |
| Título × perfil; 3 abas; "Mais"                                                                                 | `Metrics.tsx:412-416`                 |     [x]     |  [x]   | E2E `estatisticas`                    |
| Exportar relatório `.txt`                                                                                       | `Metrics.tsx:395`                     |     [x]     |  [ ]   | manual                                |
| KPIs com estimativa/confiança; KPI expandido                                                                    | `MetricsExpandedKpi.tsx`              |     [x]     |  [x]   | E2E `estatisticas`                    |
| Evolução semanal; distribuição CEFR                                                                             | `metrics/*.tsx`                       |     [x]     |  [x]   | visual                                |
| Catálogo paginado + nota de contagem                                                                            | `vocab/*.tsx`                         |     [x]     |  [x]   | E2E `estatisticas`                    |
| Erro antes do vazio (rede caída)                                                                                | `ui/Erro.tsx`                         |  [x] (F0)   |  [x]   | unit `erroNaoEhVazio`                 |
| Revisar: Mostrar Resposta → 4 botões com intervalo do agendador; Leitner                                        | `Study.tsx`, `previsaoDeIntervalo.ts` |  [x] (F0)   |  [x]   | E2E `fsrs-revisao`; unit              |
| FSRS híbrido (D-006)                                                                                            | change `fsrs-hibrido`                 | [ ] a fazer |  [ ]   | unit servidor + E2E                   |
| Analista de Vocabulário: IPA, CEFR c/ procedência, ouvir 0,75/1×, tradução c/ motor, Wiktionary, Forvo, 3 ações | `VocabularyPanel.tsx`                 |     [x]     |  [ ]   | manual                                |
| Curadoria; Mapa do conteúdo; Baralhos Anki (2 telas); Trilha; LangAudit                                         | `views/*`                             |     [x]     |  [x]   | E2E `baralhos`, `trilha-carregamento` |

## Personalizar (F9) — `Loja.tsx`

| Elemento                                                                                                                                                                    | Onde                                                | antes | depois | Prova                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | :---: | :----: | -------------------------------- |
| 4 abas com URL (`/loja/…`) e contadores                                                                                                                                     | `Loja.tsx:482-485`, `rotas.ts:88-96`                |  [x]  |  [ ]   | E2E `quatro-superficies`         |
| Cabeçalho de temporada; Seeds e Créditos separados com legenda                                                                                                              | `loja/CabecalhoDeTemporada.tsx`, `Loja.tsx:517-553` |  [x]  |  [ ]   | E2E `seeds`                      |
| Meu visual: 6 slots, editor por peça, paletas 6×30, fontes, partículas+intensidade, packs, cursor de emoji, rastro, posição, Estúdio, tema custom, perfis salvos, restaurar | `Personalizar.tsx`, `personalizar/*`                |  [x]  |  [ ]   | unit `acessoGaleria`, `equipar`  |
| Perfil de exibição sempre livre                                                                                                                                             | `Personalizar.tsx:184-215`                          |  [x]  |  [ ]   | visual                           |
| Loja: filtros, prateleiras, "Falta: Nível N ou M Seeds"                                                                                                                     | `Loja.tsx`                                          |  [x]  |  [ ]   | E2E `rota-de-aquisicao`, `seeds` |
| Passe 100 casas, cofres, premium, "creditado" só após servidor                                                                                                              | `passe/*`                                           |  [x]  |  [ ]   | visual                           |
| Desafios: 14 conquistas, "Como ganhar", curva                                                                                                                               | `Conquistas.tsx`                                    |  [x]  |  [ ]   | unit `conquistas`                |
| Comprar Créditos                                                                                                                                                            | `passe/ComprarCreditos.tsx`                         |  [x]  |  [ ]   | visual                           |

## Planos, Perfil, Sobre, Ajustes (F10)

| Elemento                                                                                                                                                                                                | Onde                                              | antes | depois | Prova                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | :---: | :----: | ------------------------------ |
| Planos: 2 abas, 3 cards de `core/planos.ts`, 10 linhas com fonte, nota self-host, consumo do mês                                                                                                        | `Planos.tsx:45-80,160,266`                        |  [x]  |  [x]   | E2E `acessibilidade` (/planos) |
| Perfil: Você / Progresso / Seus dados (baixar, excluir + relatório)                                                                                                                                     | `Perfil.tsx:62-68`, `perfil/*`                    |  [x]  |  [x]   | visual                         |
| Sobre: pessoa, princípios, apoio, privacidade/termos                                                                                                                                                    | `Sobre.tsx`                                       |  [x]  |  [ ]   | axe                            |
| Ajustes: Idiomas (2 idiomas + interface ≥ piso + LangAudit + Meta de Comunicação), Aparência (ponteiro), Onde as contas rodam (plano, motores 3 perfis + matriz + teste, privacidade), Conta e recomeço | `Settings.tsx:57-61,327-660`, `AiEnginePanel.tsx` |  [x]  |  [x]   | E2E `idioma-da-interface`      |

## Estados transversais e viewports (F12)

| Elemento                                                                   | Onde                                    | antes | depois | Prova                    |
| -------------------------------------------------------------------------- | --------------------------------------- | :---: | :----: | ------------------------ |
| Vazio com causa + ação                                                     | `ui/Vazio.tsx`                          |  [x]  |  [ ]   | unit `primitivosDeUi`    |
| Carregando por view; esqueleto no Hub                                      | `App.tsx:272`                           |  [x]  |  [ ]   | visual                   |
| Sem tradutor / idiomas iguais / permissão negada / sem áudio compartilhado | `LiveCapture.tsx`, `Settings.tsx:366`   |  [x]  |  [ ]   | manual                   |
| RTL (árabe) e pseudo-locale sem corte                                      | `i18n`, `pseudo-localizacao.e2e.ts`     |  [x]  |  [ ]   | E2E `pseudo-localizacao` |
| 375 / 768 / 1280 em todas as rotas                                         | `playwright.config.ts`                  |  [x]  |  [ ]   | E2E (3 projetos)         |
| Escuro e 7 temas não-babel com contraste                                   | `index.css`, `contrastePaletas.test.ts` |  [x]  |  [ ]   | unit + evidências        |
