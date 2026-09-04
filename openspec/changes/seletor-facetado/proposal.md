## Why

A tela "Praticar jogando" empilha três linhas de controle que não se explicam entre si — aba
exclusiva de fonte, chip de baralho Anki, seletor de idioma — e cada uma zera as outras em
silêncio. Três medições da auditoria (`docs/auditoria/seletor-de-conteudo-v1.md`, gate G0) provam
que o problema não é hipotético:

- **Contadores incoerentes.** `pistasDaTriagem` (`quality.ts:470`) chama `pistaUtil` sem origem
  (perfil `'captura'`, 42 chars/5 palavras), enquanto `avaliarCartao` já deriva o perfil `'curado'`
  de `card.daAnki`. Dois perfis de régua sobre o MESMO cartão no MESMO render explicam "847 no
  idioma" convivendo com "20 com tradução · 827 só com frase" — os 827 TÊM tradução, é definição
  de dicionário reprovada pela régua errada. O mesmo defeito contamina `idiomasDisponiveis`, que
  chegava a bloquear o chip de idioma sobre um baralho onde todas as notas têm tradução.
- **Anki inalcançável isoladamente.** O ternário de precedência do `ref` (`Play.tsx:1343-1345`)
  fazia `sessao`/`trilha` engolirem o chip de baralho (aceso e inerte); a flag booleana
  `completar` (`Play.tsx:1566`) continuava valendo em qualquer aba, então a aba "uma gravação" com
  chip aceso capava a rodada nos itens já servidos, em silêncio.
- **Três linhas de controle sem semântica declarada.** Não havia contrato escrito de como aba ×
  chip × idioma se combinam; a tabela de precedência do G0 mapeou 8 combinações, 6 delas
  incoerentes com o que a tela mostrava.

## What Changes

- **ADICIONA** `FiltroDaPratica` (`src/core/minigames/filtro.ts`): filtro facetado — fontes
  (baralho · sessão · trilha, UNIÃO entre membros), recorte (difíceis · nunca vistas · pedindo
  revisão · níveis CEFR, cada faceta INTERSECTA as demais), idioma (lista, UI restringe a ≤1
  nesta etapa) e mídia (com tradução · com frase). Um único predicado puro `passaNoFiltro`,
  espelhado pelo `EXISTS`/`IN` do servidor, com teste de paridade.
- **ADICIONA** elegibilidade declarativa por jogo: requisitos (`alfabeto?`, `maxCharsEnunciado?`,
  `precisa?`) na tabela `MINIGAMES`, avaliados antes de jogar, com `MotivoBloqueio` estendido
  (`alfabeto-nao-suportado`, e os demais motivos já existentes na tabela da casa) — disponível /
  degradado / indisponível com motivo, nunca silêncio.
- **ADICIONA** persistência versionada (`babel.filtro_da_pratica`, com espelho de um release na
  chave legada `babel.fonte_da_pratica` para rollback) e o filtro na URL de `/jogar`
  (`queryDoFiltro`/`filtroDaQuery`), com captura no boot do módulo de rotas — a dança de boot do
  `App` descarta a query da URL antes do parse; o filtro precisa da query intacta.
- **MODIFICA** a inversão de precedência em `Play.tsx`: hoje é filtro→fonte (chip pode ficar
  inerte, inexprimível pelo estado); passa a ser fonte→filtro (`filtroDaFonte`/`fonteDominante`,
  round-trip provado). O complemento local (antigo `completar: boolean`) passa a ser um overload
  `{ filtro, extras }` de `recortarPelaComposicao` — "completar" morre como flag solta; o
  complemento passa pelo MESMO `passaNoFiltro`.
- **ADICIONA** `src_lang_base` (coluna `GENERATED ALWAYS ... VIRTUAL` + índice, migração 0019) —
  idioma era o único eixo do filtro sem índice e não-sargável.
- **NÃO MUDA** o formato de `vocab_cards` além da coluna gerada aditiva, nem `FonteId`
  (`exercise_results.origem` deriva dele e não pode ser renomeado), nem o predicado dos 9
  construtores de jogo.

## Out of scope

- **Rodada multi-idioma na mesma partida.** Decisão do dono (sessão da tela de jogos, 01/09):
  multi-idioma em duas fases — troca sem fricção entre idiomas primeiro (esta proposta), rodada
  mista depois, com pré-requisitos próprios. O tipo `idiomas: string[]` já é lista para não exigir
  migração de dado quando a segunda fase vier; a UI impõe ≤1 nesta etapa.
- **Presets de filtro** (ficam para depois do que esta proposta entrega — URL entra agora, preset
  não).
- **Upload de mídia** e uso de áudio/imagem nos jogos (`midia.comAudio`/`comImagem` ficam de fora
  da v1 do tipo — não incluídos por decisão explícita, ver `filtro.ts`).
- **Distribuição multi-fonte proporcional**, **re-escopo server-side do `dueToday`** e a matriz
  executada dos 9 jogos (G2/G4 do roadmap) — ver `tasks.md` para o que está pendente.

## Impact

- `src/core/minigames/`: `filtro.ts` novo; `composicao.ts` ganha o overload de
  `recortarPelaComposicao` e o `FiltroDeComposicao` no fio; `estadoDosJogos.ts` ganha motivo de
  bloqueio.
- `src/lib/`: `filtroDaPratica.ts` novo (persistência + URL); `rotas.ts` ganha `jogarQuery` em
  `EstadoDeRota` e a captura no boot.
- `server/db/repositories/vocab.ts`: filtro por `srcLangBase` nas condições de composição.
- `server/db/migrations/`: `0019_seletor_facetado.sql`, aditiva; `down.sql` neste diretório de
  change (`DROP INDEX` — a coluna gerada fica órfã, decisão registrada em `design.md`).
- `src/components/views/Play.tsx`: inversão de precedência fonte→filtro; leitura/gravação de
  filtro; consumo da query capturada no boot.
