## Why

Depois de importado, o baralho precisa **virar jogo** — e hoje ele alimenta 4 dos 9 minijogos, por
um motivo estrutural: os 5 jogos de frase (embaralhar, escuta, ditado, conectores, karaokê) leem
`falas`, que vêm de uma **gravação** do usuário (`Play.tsx:437`), não do baralho. Um baralho com
frase de exemplo e áudio nativo tem tudo de que esses jogos precisam e mesmo assim não os alcança.

E falta a outra metade da promessa: **poder jogar com um baralho específico**. Hoje "meu baralho"
é um balaio só. Depois de importar Core 2k e um deck de espanhol, não há como dizer "hoje só o
japonês".

A boa notícia da investigação é que quase nada disso exige mecanismo novo:

- `PedidoDeComposicao.fonte` **já carrega** `ref?: string | null` (`composicao.ts:167`);
- `selecionarParaJogo` **já filtra por origem** com `EXISTS` sobre `vocab_occurrences (origin_kind,
  origin_ref)`, e o índice `idx_occ_origem` já existe (`vocab.ts:473-486`, `schema.ts:177`);
- `vocab_cards` **já tem** `clozePrompt`/`clozeAnswer`, e `selecionarParaJogo` já os devolve
  (`vocab.ts:513`) — o cloze do Anki tem destino pronto;
- o ramo de TTS da trilha (`Play.tsx:673-706`) **já ensina** como um item sem clipe de áudio vira
  jogo de escuta: `startMs:0, endMs:0` é o sinal de "fale o texto".

## What Changes

- **ADICIONA** o filtro por baralho no lobby, usando o `fonte.ref` existente — um ramo novo na
  cláusula `EXISTS` que já está lá, não um mecanismo novo.
- **ADICIONA** a matriz jogo × dados como contrato explícito: para cada um dos 9 jogos, o que o item
  precisa ter, e o que acontece quando falta.
- **ADICIONA** o caminho do baralho para os jogos de frase: nota com frase de exemplo vira `fala`,
  com áudio nativo quando existe e TTS quando não existe.
- **ADICIONA** o modo "só revisão" como piso: item que não serve a nenhum jogo ainda pode ser
  revisado, contando na memória, em vez de sumir.
- **ADICIONA** o chip de origem na prévia ("Anki · nome do baralho") — é o que torna a fusão
  **visível** em vez de silenciosa, cumprindo o requisito do brief sem separar o vocabulário.
- **NÃO ADICIONA** jogo novo por enquanto: a matriz e a medição do corpus decidem se falta algum.
  O brief lista candidatos (memória palavra↔imagem, ditado com áudio nativo, cloze race); os dois
  primeiros são o caminho de mídia + o caminho de frase aplicados aos jogos que já existem.

## Impact

- `server/db/repositories/vocab.ts`: um ramo em `selecionarParaJogo` (o `EXISTS` já existe).
- `src/core/minigames/composicao.ts`: `fonte.ref` passa a aceitar a referência de baralho.
- `src/components/views/Play.tsx`: seletor de baralho no lobby; `falas` do baralho.
- **Paridade offline**: `cartoesDaFonte` (`source.ts:84-97`) roda no cliente sobre o payload do
  deck, que hoje não sabe de qual baralho veio o cartão. Sem levar essa associação, o filtro por
  baralho degrada silenciosamente para "todos" quando o servidor falha — a spec declara essa
  degradação em vez de escondê-la.
