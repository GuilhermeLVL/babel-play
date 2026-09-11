## Why

Biblioteca e Sessão eram as duas telas com cabeçalho mais divergente do resto: a Biblioteca com dois
títulos (barra + área rolável, ux-v2 §1.8) e a Sessão com um cabeçalho de 80 linhas e abas feitas à
mão como botões `aria-pressed` (ux-v2 §1.13), fora do primitivo `Abas`.

## What Changes

- Biblioteca: o título da área rolável passa pelo `CabecalhoDeTela` (kicker + título × perfil;
  textos intactos).
- Sessão: cabeçalho pelo `CabecalhoDeTela` (selos como kicker; título com a procedência; subtítulo;
  seletor "Alternar de sessão" e Exportar como ações). As quatro abas passam pelo `Abas`
  (tablist de verdade, setas, pílula ativa em ink — D-012); "Mais" continua fora do tablist em
  Kids/Sênior. As classes de aba por tipo de mídia (accent/erro/verde/índigo) saem.

## Nao-escopo

O painel escuro da transcrição (protótipo) fica para a rodada seguinte: exige um modo escuro no
`ChatTranscript` (9 usos de `text-ink`). Leitura, filtros e cards da Biblioteca não mudam.

## Complemento (mesma rodada)

- Capa dos cards da Biblioteca em `surface-sunken` (hover `surface-raised`), como a capa listrada
  do protótipo; documentos continuam com o tinte `rare`.
- A Leitura é uma aba da Sessão e tinha o seu próprio `<h1>`: passa a `<h2>` com o mesmo texto.
- A transcrição escura fica adiada de propósito: os balões do `ChatTranscript` recebem cor dos
  presets `--transcript-*`, que a spec manda não migrar; um modo escuro do componente precisa
  de decisão própria sobre esses presets.
