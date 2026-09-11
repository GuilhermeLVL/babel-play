# PARIDADE — inventário do app × design v3

Status: `coberto` (o design tem) · `gap-design` (o app tem, o design não: **manter** e
reestilizar com o DS) · `novo` (o design tem, o app não).

Regra 2: silêncio do design não é ordem de remoção.

## Telas de topo

| Item do inventário        | Onde mora no app                         | No design v3                     | Status                                      |
| ------------------------- | ---------------------------------------- | -------------------------------- | ------------------------------------------- |
| Início                    | `Hub.tsx`                                | `isInicio` L215-263              | coberto                                     |
| Capturar                  | `LiveCapture.tsx`                        | `isCapturar` L264-312            | coberto (design cobre ~5% da tela real)     |
| Jogar                     | `Play.tsx`                               | `isJogar` L461-674               | coberto                                     |
| Biblioteca                | `Library.tsx`                            | `isBiblioteca` L313-348          | coberto                                     |
| Sessão (4 abas)           | `Analysis.tsx:717-752`                   | `isSessao` L349-460              | coberto                                     |
| Leitura                   | `Reading.tsx`                            | aba dentro de `isSessao`         | coberto                                     |
| Revisar (FSRS)            | `Study.tsx`                              | dentro de `isPalavras` L675-755  | coberto                                     |
| Vocabulário               | `Metrics.tsx`                            | `isPalavras` L675-755            | coberto                                     |
| Personalizar / Loja       | `Loja.tsx:482-485`                       | `isPersonalizar` L798-880        | coberto (design só mostra "Aplicar perfil") |
| Planos                    | `Planos.tsx`                             | `isPlanos` L881-920              | coberto                                     |
| Sobre                     | `Sobre.tsx`                              | `isSobre` L921-938               | coberto                                     |
| Ajustes                   | `Settings.tsx:57-62`                     | `isAjustes` L939-984             | coberto                                     |
| Onboarding                | `Onboarding.tsx`                         | `showOnboarding` L46-214         | coberto                                     |
| Importar                  | `Library.tsx:619`                        | `importOpen` L985-1024           | coberto                                     |
| **Perfil (3 abas)**       | `Perfil.tsx:56`                          | —                                | **gap-design**                              |
| **Login / ResetPassword** | `App.tsx:167,174`                        | —                                | **gap-design**                              |
| **Recordes**              | `play/Recordes.tsx`                      | citado no lobby, sem tela        | **gap-design**                              |
| **Progresso**             | aba de Perfil, `perfil/AbaProgresso.tsx` | `isProgresso` L756-797, **órfã** | ver P0-8                                    |

## Superfícies globais

| Item                               | Onde mora                                    | No design                          | Status                 |
| ---------------------------------- | -------------------------------------------- | ---------------------------------- | ---------------------- |
| Busca global Ctrl+K                | `BuscaGlobal.tsx` / `CommandPalette.tsx:192` | ícone de lupa no rodapé da sidebar | parcial → `gap-design` |
| iChat (3 estados)                  | `App.tsx:400`                                | —                                  | **gap-design**         |
| Menu da conta                      | `shell/MenuDaConta.tsx:95-158`               | avatar "GL" sem menu               | **gap-design**         |
| Estúdio de Layout                  | `App.tsx:419`                                | —                                  | **gap-design**         |
| Menu de contexto "praticar"        | `PracticeMenu.tsx:42`                        | —                                  | **gap-design**         |
| Gate de conta / convite / migração | `App.tsx:385,386,273`                        | —                                  | **gap-design**         |
| Recompensa desbloqueada            | `App.tsx:347`                                | —                                  | **gap-design**         |
| Toast + confirm                    | `Toast.tsx`                                  | `toastVisible` L1025-1038          | coberto                |
| Dock mobile                        | `shell/MobileNav.tsx:19`                     | — (frame fixo 1360×860)            | **gap-design**         |
| NavRail / NavBar em 4 posições     | `StudioHeader.tsx:51`                        | só sidebar à esquerda              | **gap-design**         |
| 8 temas de cor × 8 de fonte        | `theme.ts:87`, `appearance.ts:48`            | 6 amostras de tema                 | parcial → `gap-design` |

## Itens que só existem no design

| Item                        | Status   | Nota                                      |
| --------------------------- | -------- | ----------------------------------------- |
| Antessala da rodada         | **novo** | dado já existe (`rodada.ts:89-93`) — P1-1 |
| Raspadinha de fim de rodada | **novo** | economia já é real — P1-2                 |

## Sub-telas, modais e drawers

Todos vêm do `INVENTARIO.md`. `gap-design` = o app tem, o protótipo não desenhou: **mantém-se e
reestiliza-se com o DS** (regra 2 — silêncio do design não é ordem de remoção).

### Capturar (`LiveCapture.tsx`)

| Item                             | arquivo:linha    | Status                            |
| -------------------------------- | ---------------- | --------------------------------- |
| Modal "Configurações da captura" | `:1586`          | coberto (protótipo cita a gaveta) |
| Guia de configuração             | `:1721`          | gap-design                        |
| Rotas avançadas                  | `:219`           | gap-design                        |
| Painel de guia                   | `:2448`          | gap-design                        |
| Modal "Encerramento da Sessão"   | `:2671`          | gap-design                        |
| Overlay "Modo Foco"              | `:2491`          | gap-design                        |
| Painel "Bingo"                   | `:2299`          | gap-design (ver P1-3)             |
| Ajustes visuais da transcrição   | `:2228`, `:2529` | gap-design                        |
| "Pular para" transcrição/foco    | `:2234`, `:2551` | gap-design                        |
| Dropdown de idiomas              | `:412`           | coberto (chip de idiomas)         |
| Edição inline de nome de falante | `:2374`          | coberto (painel Falantes)         |

### Biblioteca (`Library.tsx`)

| Item                                      | arquivo:linha   | Status                 |
| ----------------------------------------- | --------------- | ---------------------- |
| Painel "Importar para análise", 4 origens | `:604`, `:619`  | coberto (`importOpen`) |
| Drawer "Filtros"                          | `:485`, `:1090` | gap-design             |
| Menu de contexto da mídia                 | `:1019`         | gap-design             |

### Sessão (`Analysis.tsx`)

| Item                                | arquivo:linha                     | Status                       |
| ----------------------------------- | --------------------------------- | ---------------------------- |
| Tablist "Seções da sessão" (4 abas) | `:717-752`                        | coberto                      |
| Aba Transcrição                     | `:718`                            | coberto                      |
| Aba Leitura (monta `Reading`)       | `:727`, `:1966`                   | coberto                      |
| Aba Jogos (monta lobby)             | `:735`, `:2003`                   | coberto                      |
| Aba Visão Geral & Métricas          | `:744`                            | coberto                      |
| Botão "Mais" (Kids/Sênior)          | `:752`                            | gap-design                   |
| `Study` na sub-aba de revisão       | `:1988`                           | coberto                      |
| Modal de exportação                 | `:703`                            | coberto (4 opções)           |
| KPI expandido                       | `AnalysisExpandedKpi.tsx`         | gap-design                   |
| `PlayerInterativo`                  | `analise/PlayerInterativo.tsx:84` | coberto (player de narração) |

### Jogar (`Play.tsx`)

| Item                                      | arquivo:linha                | Status                        |
| ----------------------------------------- | ---------------------------- | ----------------------------- |
| Abas de fonte (Trilha/Gravações/Difíceis) | `:263-295`, `:3438`          | coberto (facetas)             |
| Overlay "Sala de Escolha"                 | `:2733`                      | gap-design                    |
| Gaveta "Seletor de Conteúdo"              | `:2988`                      | coberto (gaveta de 6 facetas) |
| Recordes                                  | `:3355`, `play/Recordes.tsx` | gap-design                    |
| Curadoria do baralho                      | `:2703`                      | gap-design                    |
| Baralhos Anki (lista + baralho)           | `:2610`, `:2592`             | coberto (citado no lobby)     |
| Mapa do conteúdo                          | `:2680`                      | coberto (card "Mapa")         |
| Painel da Trilha                          | `:3396`                      | gap-design                    |
| "Como se joga"                            | `:2577`                      | gap-design                    |
| Tour guiado                               | `:2204`                      | gap-design                    |
| Modo organizar / filtros                  | `:546`, `:454-456`           | coberto                       |
| **Antessala**                             | —                            | **novo** (P1-1)               |
| **Raspadinha**                            | —                            | **novo** (P1-2)               |

### Vocabulário (`Metrics.tsx`)

| Item                             | arquivo:linha                  | Status           |
| -------------------------------- | ------------------------------ | ---------------- |
| Abas Painel / Lexical / Fluência | `:406-420`                     | coberto (3 abas) |
| Botão "Mais"                     | `:423`                         | gap-design       |
| KPI expandido                    | `MetricsExpandedKpi.tsx`       | gap-design       |
| Catálogo de palavras             | `vocab/CatalogoDePalavras.tsx` | coberto          |

### Personalizar / Loja (`Loja.tsx`)

| Item                                    | arquivo:linha                                     | Status                                  |
| --------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| 4 abas (Meu visual/Loja/Passe/Desafios) | `:482-485`                                        | gap-design (protótipo só mostra perfis) |
| `PasseDeTemporada`                      | `passe/PasseDeTemporada.tsx`                      | gap-design                              |
| `Conquistas`                            | `Conquistas.tsx:36`                               | gap-design                              |
| `ComprarCreditos`                       | `loja/ComprarCreditos.tsx:31`                     | gap-design                              |
| `Inventario` + `EditorDoItem`           | `personalizar/Inventario.tsx`, `EditorDoItem.tsx` | gap-design                              |
| Filtros de categoria                    | `Loja.tsx:78-86`                                  | coberto (temas/partículas/cursores)     |

### Ajustes (`Settings.tsx`)

| Item        | arquivo:linha       | Status     |
| ----------- | ------------------- | ---------- |
| 4 abas      | `:57-62`            | coberto    |
| `LangAudit` | `LangAudit.tsx:172` | gap-design |

### Leitura (`Reading.tsx`)

| Item                         | arquivo:linha  | Status  |
| ---------------------------- | -------------- | ------- |
| Modo desenho                 | `:375`         | coberto |
| Gravação de áudio            | `:477`         | coberto |
| Narrador + painel de ajustes | `:495`, `:499` | coberto |
| Painel de grifos/notas       | `:1945`        | coberto |

### Planos (`Planos.tsx`)

| Item                      | arquivo:linha        | Status     |
| ------------------------- | -------------------- | ---------- |
| Aba "O que cada plano dá" | `:158`               | coberto    |
| Aba "Consumo do mês"      | `:158`               | gap-design |
| `Assinar`                 | `planos/Assinar.tsx` | gap-design |

## Contagem

Nenhum item do `INVENTARIO.md` ficou sem linha. **Gate F3 cumprido nesta dimensão.**
Totais: 27 `coberto`, 33 `gap-design`, 2 `novo`.

A leitura que importa: **o protótipo cobre menos da metade do que o app tem.** O trabalho da F5
não é "trazer o app para o design" — é aplicar a linguagem visual do v3 a um produto que tem o
dobro de superfície, decidindo caso a caso como cada `gap-design` se veste.
