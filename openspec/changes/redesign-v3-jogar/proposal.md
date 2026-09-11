## Why

O lobby de Jogar é a tela de maior superfície do app (3.873 linhas) e a que o protótipo v3 mais
detalha: cabeçalho com etapa/ofensiva/seeds, o painel escuro "Jogando com" com a gaveta de facetas,
abas de categoria, legenda de modalidade e a grade com cartas bloqueadas explicando o motivo. Quase
tudo isso já existia; faltava vestir a linguagem do v3 sem mexer em fluxo nenhum.

## What Changes

- Cabeçalho pelo `CabecalhoDeTela` (kicker com a contagem de jogos; Partida Rápida e o painel de
  progresso como ações).
- A linha de resumo do `SeletorDeConteudo` vira o **painel escuro** (`card-panel escuro`, tokens
  `--panel-*` da F1); as ações da barra (Recordes, Mapa, Curadoria, Diagnóstico) e o botão "Fonte"
  passam a pílulas escuras. A gaveta continua clara, com a mesma fusão visual.
- Abas de categoria com a pílula ativa em ink (D-012); Partida Rápida e "Capturar uma sessão" pelo
  `btn-solid` (hover pelo token); carta bloqueada pela classe `.card-panel.bloqueado`.
- Nenhum nome acessível mudou (`Fonte`, `jogando com`, `quais baralhos`, `recorte`…): `facetas`,
  `baralhos`, `sessao-de-jogo` e `grade-so-com-jogos-do-sistema` continuam sendo o contrato.

## Nao-escopo

Antessala, Raspadinha, Resumo e os 18 jogos já usam `card-panel`/tokens e vestem a F1 sem
mudança; `CartaoDeJogo` e `PainelEscuro` como primitivos ficam para quando houver o segundo
consumidor (transcrição da Sessão, hero de Capturar).
