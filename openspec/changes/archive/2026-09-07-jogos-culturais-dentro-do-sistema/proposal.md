## Why

Nove jogos (Karuta, Shiritori, Choseong, Koffer, Taboo, Cadavre Exquis, Bao, Tense Tennis, Vitendawili) estao na grade `/jogar` com o selo "100% Funcional" (EXEC: 9 ocorrencias em `Play.tsx:3648`) e fora de todos os sistemas (achado A02 de `openspec/audits/2026-09-07-coerencia.md`):

- Registro paralelo e nao tipado (`Play.tsx:209 JogoAtivo`, `:223-323 JOGOS_CULTURAIS`), fora de `MinigameId` (`core/minigames/types.ts:16-17`) e de `MINIGAMES` (`:141-159`).
- Entrada e `acervoDaFonte.map(...)` (`Play.tsx:2580`): sem `montarRodada`, composicao, memoria de itens, dificuldade, antessala.
- Saida: `onFinish` ligado a `fecharJogoCultural` sem argumentos (`Play.tsx:2586-2592`); os nove `RoundReport` sao descartados. Zero em `exercise_results`, `review_logs`, XP, sequencia, recordes, conquistas, drops. SQL na copia do banco real: 0 rodadas.
- Seis ignoram `items` (`_itemsProp`: Koffer:88, Taboo:134, Cadavre:113, Bao:122, TenseTennis:108, Vitendawili:120) e jogam com arrays fixos; locale de TTS cravado (`de-DE`, `en-US`, `es-ES`, `sw`). Shiritori descarta escrita nao latina (`:172-184`); Choseong mapeia o acervo inteiro sem `slice` (`:45-61`) e esconde vogais latinas.
- Zero testes citam qualquer um deles. `MinigamesShowcase.tsx` (segundo roteador, guarda o report) nao tem importador. Clones jscpd de 20-32 linhas entre seis deles.
- `JogoCulturalMeta` nao tem campo de idioma: todo jogo e oferecido a todo aprendiz.

## What Changes

A pergunta 6 do relatorio decide entre duas entregas; `design.md` registra a escolha antes do codigo. **Escolhida a entrega B** (retirar da grade ate integrar): sem resposta do dono, e a unica que nao aposta semanas de trabalho na resposta. A entrega A continua descrita abaixo e nas tarefas, e a spec desta change e o contrato que ela tera de cumprir.

**Entrega A — integrar.** Cada jogo vira um `MinigameDef` real: id em `MinigameId`, `minItems/maxItems/modalidade/writesSrs/requisitos.alfabeto` e `idiomas` (lista ou `qualquer`); a rodada nasce em `montarRodada` a partir de `jogaveis`; conteudo fixo so como fallback declarado (`requisitos.material: 'proprio'`) e o card diz de onde vem; `onFinish` entra em `aoTerminar` (FSRS se baseado em cartao); voz por `item.lang`; gating por `estadoDeCadaJogo` como os classicos; ranking D1 aceita os ids novos; um teste de componente por jogo + entrada em `matriz-dos-jogos`.

**Entrega B — retirar ate integrar.** Os nove saem da grade e da partida rapida; o codigo fica em `src/components/minigames/culturais/` sem rota; `MinigamesShowcase.tsx` e removido; a spec abaixo continua valendo para quando entrarem.

Em qualquer entrega: nenhum card na grade sem dado real; nenhuma rodada sem registro; sem locale cravado; sem registro paralelo de jogos.

## Capabilities

### New Capabilities
- `jogo-so-entra-pelo-sistema`: um jogo aparece na grade apenas se e um `MinigameDef`, monta rodada pelo pipeline e registra o resultado pelo funil unico.

### Modified Capabilities
- `tela-de-jogos` (change `tela-de-jogos-v2`): a grade nao exibe estado "funcional" que o sistema nao garante.

## Impact

- `src/core/minigames/types.ts` (defs), `src/core/minigames/itemSource.ts` (requisitos por escrita/idioma), `src/components/views/Play.tsx` (`JOGOS_CULTURAIS`, `abrirJogoCultural`, `itensCulturais`, bloco `:2579-2609`, cards `:3600-3655`), `src/components/views/play/jogos.tsx`, os 9 componentes, `functions/api/rank/[[path]].ts:26`, `src/lib/ordemDosJogos.ts`
- Novos testes `tests/<jogo>Game.test.tsx` x9; `tests/matriz-dos-jogos.test.ts`
- Remove: `MinigamesShowcase.tsx`, `JogoAtivo`/`JOGOS_CULTURAIS`, `_itemsProp`, arrays fixos como fonte primaria, locales cravados, cabecalhos/fim de jogo duplicados (extrair `CascaDoJogo`)

## Pronto quando

Entrega A: `matriz-dos-jogos` cobre 18 jogos; cada jogo tem teste que joga uma rodada e verifica `onFinish` com `RoundReport` chegando a `aoTerminar` (mock) e `exercise_results` gravado no teste de integracao `f3-rodada`; grade sem a string "100% Funcional"; `grep -r "'en-US'\|'de-DE'\|'es-ES'" src/components/minigames` vazio. Entrega B: os nove nao aparecem em `/jogar` (e2e), `MinigamesShowcase.tsx` inexistente, `npm test` verde.

## Dependencias e paralelismo

Depende de `linha-de-base-verde` e da pergunta 6. Paralelizavel com todas exceto `filtro-facetado-chega-ao-servidor` (ambas tocam `Play.tsx`; fazer o filtro antes, e pequeno).
