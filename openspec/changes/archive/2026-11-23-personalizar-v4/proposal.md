## Why

A tela Personalizar tem 4 abas (Meu visual / Loja / Conquistas / Progressão) que desenham os
MESMOS itens com 3 sistemas de card e 2 sistemas de raridade; Conquistas aparece também no
Perfil; são 9 filtros e 8 seções para o mesmo domínio. O dono descreve estresse cognitivo,
sensação de amadorismo e quer padrão de indústria de jogos: progressão linear visível,
recompensas por nível, unidade visual.

## What Changes

- Etapa 1: página HTML com 3 protótipos navegáveis (A: trilha de temporada; B: álbum de
  coleção; C: hub de personagem), todos com UM componente de item e UM sistema de raridade,
  usando o catálogo real. O dono escolhe/mistura.
- Etapa 2 (após a escolha): implementar a direção — `ItemDaColecao` único sobre
  `estadoDaColecao`/`estadoDoItem`, Conquistas em UM lugar, taxonomia única.
- Polish técnico dos efeitos: pooling de partículas e cache do fillText de emoji no
  ParticleCanvas (pontos fracos medidos), sem reescrever o sistema.
