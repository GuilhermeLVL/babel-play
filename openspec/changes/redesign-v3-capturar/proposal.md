## Why

Capturar é a tela que o dono abre para usar o app por cima de uma aula, um jogo ou uma chamada, e
o protótipo v3 a desenha em torno de um único bloco escuro: o hero com o gesto principal, o
microfone, as Legendas flutuantes, o cronômetro e o par de idiomas. O app já tinha tudo isso no
mesmo card, em claro; faltava dar ao bloco o peso que o protótipo dá.

## What Changes

- O hero da captura vira o **painel escuro** (`card-panel escuro`, tokens `--panel-*` da F1; 2º
  consumidor depois do "jogando com" de Jogar). Título, cronômetro, Foco Cheio, Bingo, chip de
  idiomas, linha de orientação e waveform usam `panel-ink`/`panel-ink-muted`/`panel-surface`/
  `panel-border`. Gravando, o painel ganha um anel accent em vez de trocar a borda.
- O botão do microfone, quando mudo, usa os tokens do painel na variante de tela; a variante do
  Foco Cheio não muda.
- Os três avisos (idiomas iguais, detecção só com Whisper, cobertura do tradutor) passam a chip
  `warn-soft`/`warn-ink`, porque `warn-ink` sozinho não lê sobre o painel escuro. O par já está na
  matriz de contraste.
- Nenhum handler, `title`, `aria-*`, `data-*` ou rótulo muda; a gaveta de idiomas (portal) e a
  gaveta de configurações continuam claras.

## Nao-escopo

Gaveta de configurações, Falantes, ModelPrepPanel, AiEnginePanel, Foco Cheio, Bingo, Overlay e
Document PiP já usam `card-panel`/tokens e vestem a F1 sem mudança. Os presets `--transcript-*` não
migram (spec). `PainelEscuro` como primitivo continua adiado: os dois consumidores têm conteúdo
demais para um wrapper trazer algo além da classe.
