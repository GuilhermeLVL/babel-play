# Captura do som da aba/tela: quantos passos até a primeira legenda (2026-11-26)

Medido no app real (servidor próprio na porta 3187, Chromium do Playwright, desktop 1280x800) com um `getDisplayMedia`
falso que registra o pedido e o recusa (`tests/e2e/legendar-agora.e2e.ts`). O seletor de verdade do navegador **não
aparece em Chromium sem cabeça**, então os passos dele vêm da documentação do Chrome e estão marcados como tal.

## 1. O fluxo de antes (Chrome/Edge, desktop)

| #   | Passo                                                                                            | Toque | Quando aparece                                                                                                             | Fonte                                    |
| --- | ------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Abrir Capturar na navegação                                                                      | 1     | de qualquer outra tela                                                                                                     | medido                                   |
| 2   | "Iniciar captura"                                                                                | 1     | sempre                                                                                                                     | medido                                   |
| 3   | Folha "Baixar os modelos desta captura? ... 322 MB"                                              | 1     | 1º uso, ou toda vez que a tela fecha e reabre antes de o download terminar (a confirmação era um `ref`, esquecida ao sair) | medido (captura de tela da falha do e2e) |
| 4   | Pergunta "Rápido ou Privado?" e permissão do microfone                                           | 1-2   | só com o microfone ligado e sem escolha guardada                                                                           | código (`planejarInicio`)                |
| 5   | Seletor do navegador: escolher a aba                                                             | 1     | sempre                                                                                                                     | documentação do Chrome                   |
| 6   | Seletor: "Compartilhar" (o áudio da aba já vem marcado em abas; em janela/tela é preciso marcar) | 1     | sempre                                                                                                                     | documentação do Chrome                   |
| 7   | Primeira legenda                                                                                 | 0     | depois do modelo carregar                                                                                                  |                                          |

Resumo: **4 toques** para quem já usou (1, 2, 5, 6), **5 a 7** na primeira vez ou com o microfone ligado.

O que o app já fazia certo: `systemAudio: 'include'`, `selfBrowserSurface: 'exclude'`, `surfaceSwitching: 'include'`,
`monitorTypeSurfaces: 'include'`, vídeo no mínimo (1 quadro/s) e a aquisição serializada do stream.
O que faltava: a **dica de superfície** (a aba pré-selecionada) e **lembrar o "sim" ao download**.

## 2. O que mudou no app

- Botão **"Legendar agora"** no miolo da captura, só para quem já legendou o som do computador neste navegador e onde há
  som do computador: um toque desliga o microfone (se estava ligado), usa os idiomas e o motor já escolhidos, aquece o
  modelo e abre o seletor.
- `getDisplayMedia` com `video.displaySurface` (a última superfície usada; a aba na primeira vez), **só quando
  `getSupportedConstraints().displaySurface` é verdadeiro**. `preferCurrentTab` não entra de propósito: ele
  compartilharia a aba do Frasy (eco) e conflita com `selfBrowserSurface: 'exclude'`.
- A confirmação do download (só no desktop, onde a pergunta é por tamanho) passa a ser lembrada no aparelho
  (`babel.captura.downloadConfirmado`). Economia de dados e rede lenta continuam perguntando sempre.

## 3. O fluxo de depois (quem já usou uma vez)

| #   | Passo                                                                          | Toque |
| --- | ------------------------------------------------------------------------------ | ----- |
| 1   | Abrir Capturar                                                                 | 1     |
| 2   | "Legendar agora" (sem microfone, sem pergunta de motor, sem folha de download) | 1     |
| 3   | Seletor: a aba (a categoria "Aba" já vem à frente)                             | 1     |
| 4   | Seletor: "Compartilhar"                                                        | 1     |

Medido: do toque em "Legendar agora" ao `getDisplayMedia` há **1 toque e 0 diálogos** (e2e `quem já usou`); sem memória, o
Iniciar pergunta o download (**2 toques**, e2e `primeira vez`).

**Honestidade sobre o ganho.** Com o microfone desligado (o padrão no desktop) e o modelo no aparelho, "Iniciar captura"
já era 1 toque; o ganho do botão está em (a) não depender do estado do microfone nem da pergunta de motor, (b) não
repetir a confirmação do download, (c) a categoria "Aba" pré-selecionada no seletor. O piso continua sendo **o seletor
obrigatório do navegador (2 toques)**: nenhuma página escapa dele.

## 4. Como tirar o seletor: a extensão

Só uma extensão MV3 com `chrome.tabCapture` captura a aba atual sem o seletor, com o clique no ícone como gesto. Meta:
**1 toque** (no ícone) para legendar a aba. Esqueleto em `extensao/`; decisão e alternativas em
`openspec/changes/captura-em-um-clique/`.
