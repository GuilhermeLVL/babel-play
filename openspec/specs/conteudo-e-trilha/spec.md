# conteudo-e-trilha Specification

## Purpose
Descreve de onde vem o material que os jogos usam HOJE: a trilha gerada no build e carregada sob demanda, o acervo Anki importado e projetado em cartoes, as falas de sessao fichadas como cartoes e a chave que impede duplicatas. Escrita a partir do codigo em 2026-09-07 (auditoria, secao 2.3); cada requirement cita o `arquivo:linha` que o implementa.

## Requirements

### Requirement: A trilha e gerada no build e carregada sob demanda
`scripts/trilha/gerar.mjs:141-142` SHALL produzir `public/trilha/<lang>.json` (16 idiomas) e `public/glosas/<lang>-pt.json` (15 pares); `scripts/trilha/derivar.mjs` produz o indice embutido (`src/data/trilha/indice.json`) que responde "existe? quantas?" sem baixar nada. O cliente SHALL baixar a trilha do idioma praticado so quando a tela de jogos precisa (`src/data/trilha/carregar.ts:123`, chamado em `src/components/views/Play.tsx:1643-1652`) e derivar cartoes e frases com `cartoesDaTrilha` (`src/core/learning/trilha.ts:232`) e `frasesDaTrilha` (`trilha.ts:293`).

#### Scenario: Trocar o idioma praticado
- **WHEN** a pessoa escolhe `ja` na tela de jogos
- **THEN** so `public/trilha/ja.json` e a glosa `ja-pt` sao baixadas, e a contagem do curso nunca passa por zero enquanto carrega (`tests/e2e/trilha-carregamento.e2e.ts`)

#### Scenario: Lacuna conhecida — glosas so para o portugues
- **WHEN** o idioma nativo nao e `pt`
- **THEN** a trilha vem sem traducao, porque so existem glosas `*-pt` (auditoria 2.6; change `idioma-alvo-e-ui-respeitados`)

### Requirement: O Anki entra como acervo e vira cartao por ativacao
`POST /api/import/anki` (`server/routes/import.ts:212`) SHALL ler o `.apkg`, gravar `anki_decks`/`anki_notes`/`anki_imports` e projetar as notas ativadas em `vocab_cards` via `vocabRepo.ativarLote` (`server/db/repositories/vocab.ts:979`). Listagem, notas, ativar, desativar e purga vivem em `server/routes/anki.ts:34-112`. A midia do `.apkg` NAO e importada hoje.

#### Scenario: Importar um baralho
- **WHEN** um `.apkg` valido chega com notas mapeadas
- **THEN** o baralho aparece em `GET /api/anki/decks` e as notas ativadas viram cartoes com `origem anki:<deckId>` em `vocab_occurrences`

#### Scenario: Lacuna conhecida — tabelas de midia sem uso
- **WHEN** o schema e lido
- **THEN** `anki_media` e `anki_note_media` (`server/db/schema.ts:700,721`) nao tem leitor nem escritor (achado A35; decidido em `schema-sem-tabela-orfa`, pergunta Q5)

### Requirement: Uma fala vira cartao pela mao da pessoa
`ficharCartao` (`src/lib/adicionarAoDeck.ts:47`) SHALL ser o unico caminho de uma fala de sessao para o baralho: chama `bulkAddCards` (`src/data/api.ts:532`) → `POST /api/vocab/bulk-add` (`server/routes/vocab.ts:104`) → `vocabRepo.bulkAdd` (`server/db/repositories/vocab.ts:217`), que aplica a regua de qualidade (`avaliarCartao`) e grava `vocab_cards` + `vocab_occurrences`.

#### Scenario: Cartao sem traducao e sem frase
- **WHEN** um cartao chega sem `back` e sem `sentence`
- **THEN** `bulkAdd` o recusa e devolve o motivo em `BulkAddResult`, nada e gravado

### Requirement: A chave de duplicata e do servidor
`chaveDedup` (`server/db/repositories/vocab.ts:74`) SHALL ser a definicao de "mesma palavra": `idioma-base|palavra normalizada`, gravada em `vocab_cards.norm_key`. O idioma de cada cartao vive em `vocab_cards.src_lang` (`server/db/schema.ts:103`) e na coluna gerada `src_lang_base`.

#### Scenario: Mesma palavra em dois idiomas
- **WHEN** "casa" entra como `pt` e como `es`
- **THEN** sao dois cartoes, porque a chave inclui o idioma-base

#### Scenario: Lacuna conhecida — cinco normalizadores
- **WHEN** o modo anonimo deduplica (`src/data/efemero/servidor.ts:90`)
- **THEN** a chave tem outra ordem e outra normalizacao (achado A24); `modo-anonimo-em-paridade` unifica em uma funcao do core
