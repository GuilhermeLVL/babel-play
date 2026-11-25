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

## Revisão de 25/11/2026

**Estado:** pronta para executar, com escopo reduzido. Feito: filtro por baralho até o lobby (1.1 a 1.3, 1.5, 1.6), bloqueio de script
não latino (2.3), frase do acervo como fala por TTS (3.1), e2e do baralho (5.1, 5.2). Faltam: avisar quando o filtro não se aplica
(1.4: a função existe e ninguém a chama), prévia com origem (4.1, 4.2), "só revisão" (4.3), progresso por baralho (4.4),
escuta/karaokê da frase do baralho (3.2, 3.3) e a conferência da matriz (2.1, 2.2, 2.4).

**O que ficou velho:**

- **Áudio nativo e imagem do baralho** (cenário "Nota com frase e áudio nativo", karaokê com clipe real, jogo memória palavra↔imagem)
  dependiam da mídia no servidor, change `motor-anki-midia-cancelada` (arquivada em 08/09). Com a importação pesada no NAVEGADOR e a
  retenção zero, o servidor recebe só notas em lotes; a mídia não chega. Saem do escopo (3.1b e 5.4 riscadas, spec ajustada).
- **"Primeira suíte Playwright"** (5.2): já existe, com dezenas de e2e.
- **Seletor de baralho**: virou o `FiltroDaPratica` facetado (`src/core/minigames/filtro.ts`); a tarefa 1.4 reaproveita `filtroAplicavel`.
- O rótulo de origem da prévia (4.1) chama a frase do acervo de "sessão" (`revelavel.ts:149`): defeito a corrigir junto.

**Esforço:** M (3 PRs pequenos: 1.4 e 3.x; 4.1 e 4.2; 4.3 e 4.4).
**Valor para quem usa:** médio a alto para quem importa Anki; nulo para os demais.

**Dependências e conflitos:** vem antes de `motor-anki-mapeador` (a prévia precisa dos papéis frase/significado que o mapeador troca).
Arquivos em disputa: `src/components/views/Play.tsx` (com `polimento-movimento` e `tela-de-jogos-v2`) e
`src/core/minigames/{filtro,rodada,revelavel}.ts`. Sem migração, sem flag, sem custo de IA, sem dado novo de menor.

**Decisões do dono:**

1. Áudio nativo do baralho: (a) só TTS e frase sem clipe, riscando áudio e imagem de vez; (b) guardar a mídia só no navegador
   (IndexedDB), sem servidor; (c) reabrir a mídia no servidor (contraria a retenção zero). **Recomendo (a)**; (b) vira change própria se o pedido voltar.
2. "Só revisão" (4.3): (a) fazer agora; (b) adiar até o mapeador. **Recomendo (a)**: sem ele, item importado sem tradução some, o que o
   próprio spec chama de falha.
3. Jogo novo a partir de Anki: (a) nenhum agora; (b) medir o corpus antes. **Recomendo (a)**.
