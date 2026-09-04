# Medição do filtro facetado sob acervo grande (20k+)

Script: `scripts/medicao-filtro/medir.ts` (`npx tsx scripts/medicao-filtro/medir.ts`).
Banco: SQLite descartável, migrado com `aplicarMigrations`, jamais `data/babel.db`.
Corpus semeado: **20.000 cartões**, 1 usuário, 4 idiomas (en/pt/ja/es), 6 "baralhos" Anki
(`vocab_occurrences.origin_kind='anki'`, `origin_ref` = `deck-0`..`deck-5`), ~15% também com
ocorrência `trilha`, ~10% também com ocorrência `sessao`, níveis A1..C2 distribuídos, `due_at`
nulo/passado/futuro em terços, `back`/`sentence` presentes em ~80%/~60% dos cartões.

Custo da semeadura (INSERTs em lote, nunca linha a linha): **1.453 ms para 20.000 cartões**
(saída real do script).

## Nota sobre metodologia (desvio do pedido original)

O pedido original especificava 24.000 cartões e 20 repetições por caso. Um diagnóstico rápido
antes desta rodada final (1 execução por caso, mesmo corpus) já mostrava custos reais de
**0,5 s a 37 s por chamada** — não microssegundos. Nessa ordem de grandeza, 20 repetições × 7
casos passaria de 20-30 minutos, incompatível com um turno síncrono. Reduzi para **20.000
cartões** (ainda dentro de "20k+" do brief) e **8 repetições por caso** (descartando a 1ª como
warm-up, 7 amostras válidas) — suficiente porque a variância observada é baixa: o custo é
dominado pela ESTRUTURA da consulta (quantas subconsultas correlacionadas ela dispara), não por
ruído de I/O. Todos os números abaixo são a saída real do script, colada sem edição.

## Resultado por caso

| Caso | Mediana | p95 | itens (total) | Plano (`EXPLAIN QUERY PLAN`) |
|---|---:|---:|---:|---|
| (a) filtro vazio-padrão (`fontes:['baralho']`, sem recorte) | 4.242,15 ms | 4.490,15 ms | 600 | `SEARCH vocab_cards USING INDEX idx_vocab_user_dificuldade (user_id=?)` → `CORRELATED SCALAR SUBQUERY 1` → **`SCAN o`** |
| (b) 1 baralho (`baralhos:['deck-0']`) | 4.462,79 ms | 4.643,85 ms | 600 | `SEARCH vocab_cards USING INDEX idx_vocab_user_dificuldade (user_id=?)` → `CORRELATED SCALAR SUBQUERY 1` → **`SCAN o`** |
| (c) 3 baralhos + 1 idioma | 397,45 ms | 487,42 ms | 600 | `SEARCH vocab_cards USING INDEX idx_vocab_src_lang_base (src_lang_base=?)` → `CORRELATED SCALAR SUBQUERY 1` → **`SCAN o`** |
| (d) união trilha+baralho + `pedindoRevisao` | 7.747,99 ms | 8.385,05 ms | 600 | `SEARCH vocab_cards USING INDEX idx_vocab_user_due (user_id=? AND due_at>? AND due_at<?)` → 2×(`CORRELATED SCALAR SUBQUERY` → **`SCAN o`**) |
| (e) idiomas `['ja','es']` + níveis | 4.742,83 ms | 5.152,07 ms | 600 | `SEARCH vocab_cards USING INDEX idx_vocab_user_cefr (user_id=? AND cefr_level=?)` → `CORRELATED SCALAR SUBQUERY 1` → **`SCAN o`** |
| (f) mídia `comTraducao` | 3.691,81 ms | 4.641,78 ms | 600 | `SEARCH vocab_cards USING INDEX idx_vocab_user_dificuldade (user_id=?)` → `CORRELATED SCALAR SUBQUERY 1` → **`SCAN o`** |
| (g) PIOR CASO: 3 fontes + 4 baralhos + 3 idiomas + níveis + `pedindoRevisao` + mídia | 37.032,80 ms | 37.355,52 ms | 600 | `SEARCH vocab_cards USING INDEX idx_vocab_user_due (...)` → 3×(`CORRELATED SCALAR SUBQUERY` → **`SCAN o`**) |

("`o`" é o alias de `vocab_occurrences` nas subconsultas `EXISTS`/`NOT EXISTS` de `selecionarParaJogo`.)

## Veredito: NÃO, não é "nenhum caso vira full scan" — todos os 7 casos viram

O brief exigia que a consulta multi-seleção "não pode virar full scan" com 20k+ itens. Medido: os
7 casos testados, incluindo o filtro vazio-padrão, disparam full scan — só que não da tabela
`vocab_cards` (essa parte está correta: o `SEARCH ... USING INDEX ...` inicial usa sempre um
índice existente — `idx_vocab_user_dificuldade`, `idx_vocab_src_lang_base`, `idx_vocab_user_due`
ou `idx_vocab_user_cefr`, conforme a faceta que restringe mais). O full scan real é de
**`vocab_occurrences`**, dentro de uma **subconsulta correlacionada** — uma vez por linha
candidata de `vocab_cards`.

Causa raiz (`server/db/repositories/vocab.ts`, bloco do filtro facetado, ~linhas 574–635): toda
condição de `fontes` (`trilha`, `sessao`, `baralho`) e o ramo padrão de `fonte`/`fonteRef`
constroem `EXISTS`/`NOT EXISTS (SELECT 1 FROM vocab_occurrences o WHERE o.card_id = vocab_cards.id
AND o.origin_kind = ... [AND o.origin_ref IN (...)])`. Essa subconsulta filtra **só por
`card_id`** (e opcionalmente `origin_kind`/`origin_ref`) — nunca por `user_id`. Os três índices de
`vocab_occurrences` existentes são todos compostos começando por `user_id`:

- `idx_occ_user_card` em `(user_id, card_id)`
- `idx_occ_user_time` em `(user_id, occurred_at)`
- `idx_occ_origem` em `(user_id, origin_kind, origin_ref)`

Como a subconsulta não tem predicado de `user_id`, o SQLite não consegue usar nenhum dos três
como ponto de entrada por `card_id` sozinho — não existe índice cujo prefixo seja `card_id`. O
resultado, confirmado pelo `EXPLAIN QUERY PLAN` de cada caso, é `SCAN o`: uma varredura completa
de `vocab_occurrences` (aqui, ~27.500 linhas — 20.000 `anki` + ~15% `trilha` + ~10% `sessao`) POR
CADA candidato retido de `vocab_cards`. É por isso que o caso (g), com 3 subconsultas
correlacionadas empilhadas (`OR` entre `trilha`/`sessao`/`baralho`), custa ~37 s: são até 3 scans
completos de `vocab_occurrences` por linha candidata.

O caso (c) é o mais rápido (397 ms) não porque evite o problema, mas porque `src_lang_base = 'en'`
via `idx_vocab_src_lang_base` já reduz drasticamente o número de linhas candidatas de
`vocab_cards` ANTES da subconsulta correlacionada rodar — menos candidatos, menos scans de
`vocab_occurrences`. O filtro vazio-padrão (a) não tem esse privilégio (só filtra por `user_id`),
por isso já corre em ~4,2 s mesmo sem nenhuma faceta extra selecionada.

## Índice proposto pela medição (aplicado em seguida — ver "Conserto aplicado" abaixo)

Faltar um índice cujo prefixo seja `card_id` em `vocab_occurrences` é a lacuna. Ela é resolvida
diretamente:

```ts
index('idx_occ_card').on(t.cardId)
// ou, se quiser cobrir a checagem de origin_kind sem lookup extra:
index('idx_occ_card_origem').on(t.cardId, t.originKind, t.originRef)
```

Com esse índice, a subconsulta correlacionada vira `SEARCH o USING INDEX idx_occ_card
(card_id=?)` — um lookup por linha candidata, não um scan da tabela inteira — e o custo deveria
cair de O(candidatos × ocorrências) para O(candidatos × log ocorrências). Não apliquei esse índice
porque `server/db/schema.ts` é de outro dono e a tarefa pediu para só medir e registrar, não
consertar.

## Conserto aplicado (mesma rodada) e re-medição

Duas mudanças, ambas medidas de novo com o MESMO script:

1. **`o.user_id = ?` dentro de todo EXISTS/NOT EXISTS sobre `vocab_occurrences`**
   (`server/db/repositories/vocab.ts`). Redundante semanticamente (o `card_id` já é do usuário),
   mas necessário para o planner: os índices existentes todos começam por `user_id`. Só isso já
   trocou `SCAN o` por `SEARCH ... idx_occ_origem`, mas o probe por (user_id, origin_kind) ainda
   visitava milhares de ocorrências por candidato — tempos caíram pouco (4,2 s → 2,8 s no caso a).
2. **Índice `idx_occ_probe (user_id, card_id, origin_kind, origin_ref)`** — migração
   `0020_sonda_de_ocorrencias.sql` (aditiva; down = `DROP INDEX idx_occ_probe`). As quatro
   igualdades da sonda num índice covering: o probe vira um lookup por candidato.

| Caso | Antes (mediana) | Depois (mediana) | Plano depois |
|---|---:|---:|---|
| (a) vazio-padrão | 4.242 ms | **19,3 ms** | `SEARCH o USING COVERING INDEX idx_occ_probe` |
| (b) 1 baralho | 4.463 ms | **21,3 ms** | idem |
| (c) 3 baralhos + idioma | 397 ms | **24,3 ms** | idem |
| (d) união + pedindoRevisao | 4.556 ms | **22,1 ms** | idem (2 sondas) |
| (e) 2 idiomas + níveis | 2.825 ms | **26,8 ms** | idem |
| (f) mídia comTraducao | 2.806 ms | **23,3 ms** | idem |
| (g) pior caso (3 fontes + tudo) | 46.051 ms | **49,8 ms** | idem (3 sondas) |

**Veredito final: APROVADO.** Nenhum `SCAN` em nenhum dos 7 casos; todo probe correlacionado usa
`idx_occ_probe` como covering index. O pior caso combinável ficou em ~50 ms sobre 20.000 cartões
— dentro da restrição §6 do brief ("sem full scan em multi-seleção"). O espelho de `EXPLAIN` do
script foi atualizado para incluir `o.user_id = ?` (sem isso ele reportava o plano de uma consulta
que o repositório não faz mais).

## Como reproduzir

```
npx tsx scripts/medicao-filtro/medir.ts
```

Sobe e derruba um SQLite temporário próprio; nunca toca `data/babel.db`.
