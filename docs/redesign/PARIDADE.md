# PARIDADE — inventário do app × design v3

Status: `coberto` (o design tem) · `gap-design` (o app tem, o design não: **manter** e
reestilizar com o DS) · `novo` (o design tem, o app não).

Regra 2: silêncio do design não é ordem de remoção.

## Telas de topo

| Item do inventário | Onde mora no app | No design v3 | Status |
|---|---|---|---|
| Início | `Hub.tsx` | `isInicio` L215-263 | coberto |
| Capturar | `LiveCapture.tsx` | `isCapturar` L264-312 | coberto (design cobre ~5% da tela real) |
| Jogar | `Play.tsx` | `isJogar` L461-674 | coberto |
| Biblioteca | `Library.tsx` | `isBiblioteca` L313-348 | coberto |
| Sessão (4 abas) | `Analysis.tsx:717-752` | `isSessao` L349-460 | coberto |
| Leitura | `Reading.tsx` | aba dentro de `isSessao` | coberto |
| Revisar (FSRS) | `Study.tsx` | dentro de `isPalavras` L675-755 | coberto |
| Vocabulário | `Metrics.tsx` | `isPalavras` L675-755 | coberto |
| Personalizar / Loja | `Loja.tsx:482-485` | `isPersonalizar` L798-880 | coberto (design só mostra "Aplicar perfil") |
| Planos | `Planos.tsx` | `isPlanos` L881-920 | coberto |
| Sobre | `Sobre.tsx` | `isSobre` L921-938 | coberto |
| Ajustes | `Settings.tsx:57-62` | `isAjustes` L939-984 | coberto |
| Onboarding | `Onboarding.tsx` | `showOnboarding` L46-214 | coberto |
| Importar | `Library.tsx:619` | `importOpen` L985-1024 | coberto |
| **Perfil (3 abas)** | `Perfil.tsx:56` | — | **gap-design** |
| **Login / ResetPassword** | `App.tsx:167,174` | — | **gap-design** |
| **Recordes** | `play/Recordes.tsx` | citado no lobby, sem tela | **gap-design** |
| **Progresso** | aba de Perfil, `perfil/AbaProgresso.tsx` | `isProgresso` L756-797, **órfã** | ver P0-8 |

## Superfícies globais

| Item | Onde mora | No design | Status |
|---|---|---|---|
| Busca global Ctrl+K | `BuscaGlobal.tsx` / `CommandPalette.tsx:192` | ícone de lupa no rodapé da sidebar | parcial → `gap-design` |
| iChat (3 estados) | `App.tsx:400` | — | **gap-design** |
| Menu da conta | `shell/MenuDaConta.tsx:95-158` | avatar "GL" sem menu | **gap-design** |
| Estúdio de Layout | `App.tsx:419` | — | **gap-design** |
| Menu de contexto "praticar" | `PracticeMenu.tsx:42` | — | **gap-design** |
| Gate de conta / convite / migração | `App.tsx:385,386,273` | — | **gap-design** |
| Recompensa desbloqueada | `App.tsx:347` | — | **gap-design** |
| Toast + confirm | `Toast.tsx` | `toastVisible` L1025-1038 | coberto |
| Dock mobile | `shell/MobileNav.tsx:19` | — (frame fixo 1360×860) | **gap-design** |
| NavRail / NavBar em 4 posições | `StudioHeader.tsx:51` | só sidebar à esquerda | **gap-design** |
| 8 temas de cor × 8 de fonte | `theme.ts:87`, `appearance.ts:48` | 6 amostras de tema | parcial → `gap-design` |

## Itens que só existem no design

| Item | Status | Nota |
|---|---|---|
| Antessala da rodada | **novo** | dado já existe (`rodada.ts:89-93`) — P1-1 |
| Raspadinha de fim de rodada | **novo** | economia já é real — P1-2 |

## Pendente

Sub-telas, modais e drawers de cada view (o inventário lista ~60 com `arquivo:linha`) ainda não
têm linha própria aqui. **Nenhum item do inventário pode ficar sem linha antes do Gate F3.**
