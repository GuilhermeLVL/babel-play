## Why

O importador de Anki que existe hoje **dissolve o baralho**. `BaralhoAnki.tsx` lê o `.apkg`, corta
em 300 notas e chama `bulkAddCards`; do outro lado, `vocabRepo.bulkAdd` grava cartões soltos em
`vocab_cards`. Depois disso **não existe mais baralho nenhum**: não há tabela, não há nome, não há
como listar "o que veio do Core 2k", não há como remover só ele, e reimportar o mesmo arquivo é
indistinguível de importar outro.

Isso viola o requisito que abre o programa: conteúdo Anki é **fonte separada e rastreável**, nunca
fusão silenciosa com o conteúdo nativo.

Três medições desta investigação mostram que o problema não é hipotético:

- **A procedência era destruída a cada import.** `origemDe()` (`server/db/repositories/vocab.ts:185`)
  só reconhecia `trilha:` e sessões do dono; o `anki:<arquivo>` que a tela manda desde sempre virava
  `origin_kind='manual'`, `origin_ref=NULL`. O valor `'anki'` estava documentado em
  `server/db/schema.ts:167` e **nenhuma linha do código jamais o escreveu**. Corrigido no commit
  `a524f56`, que é pré-requisito desta proposta — e a prova de que sem acervo próprio a origem se
  perde no primeiro passo.
- **Todo cartão novo nasce vencido** (`dueAt = now`, `vocab.ts:216`). Importar um baralho real de
  3.600 notas produziria 3.600 cartões vencendo no mesmo instante. O teto de 300 no cliente
  (`BaralhoAnki.tsx:39`) é um curativo: manda "importe de novo quando quiser as próximas", sem saber
  quais já entraram.
- **A régua de qualidade recusa 98% de um baralho legítimo.** Medido no "4000 Essential English
  Words" (3.600 notas lidas): só **61** passam em `avaliarCartao`; 3.529 caem em `pista-ruim` porque
  `pistaUtil` (`src/core/learning/quality.ts:134-149`) recusa pista com mais de 42 caracteres ou 5
  palavras — régua afinada para barrar lixo de fala capturada ("Isso é", "rápida!!"), e um baralho
  en-en tem definição de dicionário no verso. Hoje o acervo inteiro é jogado fora na porta.

## What Changes

- **ADICIONA** o acervo Anki como dado de primeira classe: `anki_decks`, `anki_notes` (com os campos
  brutos preservados), `anki_imports` (ledger versionado). Nada é descartado na entrada.
- **ADICIONA** a **projeção**: a nota vira cartão jogável em `vocab_cards` por um caminho próprio,
  em lotes, com ocorrência `origin_kind='anki'` e `origin_ref=<id do baralho>`. `vocab_cards` **não
  muda de forma** — o vínculo mora em `anki_notes.projected_card_id`.
- **ADICIONA** ciclo de vida explícito: ativar em lotes, reimportar idempotente por `guid`,
  desativar (padrão) e purgar (destrutivo) um baralho, com regra escrita para o histórico FSRS.
- **ADICIONA** perfil de qualidade **por origem**: baralho curado pode ter pista longa; fala
  capturada não. A régua atual continua guardando o funil de captura, para o qual foi feita.
- **MODIFICA** `POST /api/import/anki`, que hoje só lê e devolve, para gravar o acervo e devolver o
  id do import.
- **NÃO MUDA**: `montarRodada`, os construtores dos 9 jogos, `composicao.ts`, o scheduler FSRS, nem
  o formato de `vocab_cards`. Esta proposta não toca no motor de jogos.

## Impact

- Esquema: 3 tabelas novas, **aditivas** (nenhuma coluna alterada em tabela existente).
- `server/db/repositories/`: repositório novo `anki.ts`; `vocab.ts` ganha a função de projeção.
- `server/routes/import.ts`: a rota passa a persistir; rotas novas de ativação e ciclo de vida.
- `src/core/learning/quality.ts`: ganha o perfil por origem (sem mudar o comportamento do perfil de
  captura, que é o default).
- Migração só-de-ida por construção (o repo não tem `down`) — mitigada por ser aditiva; ver
  `design.md`.
