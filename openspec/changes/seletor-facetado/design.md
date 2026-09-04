## Context

`Play.tsx` monta a rodada no cliente (não é `montarRodada` server-side — o servidor só ordena o
pool via `composicao.ts`). Antes desta proposta, a tela tinha três controles competindo pelo mesmo
estado — aba de fonte, chip de baralho Anki, seletor de idioma — sem contrato escrito de como se
combinam. A auditoria do G0 mapeou 8 combinações de aba × chip, das quais 6 eram incoerentes com o
que a tela mostrava. Este documento registra as decisões tomadas para substituir isso por um
filtro facetado único.

## Decisão 1 — Inversão filtro→fonte (o chip deixa de ser inexprimível)

**Antes:** o ternário de precedência (`Play.tsx:1343-1345`, versão pré-mudança) calculava o `ref`
da fonte a partir do chip de baralho, mas `sessao`/`trilha` venciam o chip no ternário — o chip
ficava aceso na tela sem afetar a rodada (inerte, inexprimível pelo estado real).

**Decisão:** o filtro (`FiltroDaPratica`) passa a ser a fonte da verdade; `FonteId` (a forma
antiga, exigida por `exercise_results.origem`) é derivada dele por `fonteDominante`, e a leitura
inversa é `filtroDaFonte`. Verificado em `src/core/minigames/filtro.ts`: `fonteDominante` reduz um
filtro (potencialmente multi-faceta) à `FonteId` mais fiel — não é lossless por construção (um
filtro multi-fonte cai em `'baralho'`, o mais genérico), e o docblock do arquivo assume isso
explicitamente. `filtroDaFonte(fonte, baralhoAnki)` faz o caminho inverso, com o cuidado de que
`baralhoAnki` só é lido quando `fonte.id === 'baralho'`, porque `FonteDeItens` não tem onde guardar
um deck. `Play.tsx` importa e usa os dois (linha 68 e 279+), e o docblock local documenta o
round-trip como "provado no core" — a garantia mora nos testes de `filtro.ts`, não em `Play.tsx`.

## Decisão 2 — `recortarPelaComposicao` ganha overload; `completar` morre como flag

Verificado em `src/core/minigames/composicao.ts:450-520`: a assinatura antiga
`recortarPelaComposicao(itens, { completar: boolean })` continua aceita sem quebra (linha 460,
"zero quebra nos chamadores de hoje"), e ganha uma segunda forma
`{ filtro: FiltroDaPratica; extras?: ExtrasDoFiltro }` (linha 470). Internamente
(`'completar' in opts`, linha 507) o ramo antigo mantém o comportamento histórico; o ramo novo
passa cada item candidato por `passaNoFiltro` (linha 520) antes de aceitar no complemento local —
o defeito da versão anterior (`completar: false` valendo em qualquer aba, capando a rodada em
silêncio com o chip aceso) fica impossível por construção porque não existe mais um booleano solto
que ignore o filtro: o complemento é sempre filtrado pelo mesmo predicado que decidiu o pool.

## Decisão 3 — `src_lang_base`: coluna GENERATED VIRTUAL + índice (migração 0019)

A auditoria (G0, "custo de índice") identificou idioma como o único eixo do filtro sem índice e
não-sargável (`LOWER(SUBSTR(src_lang,1,2))` calculado em toda linha lida). Verificado em
`server/db/migrations/0019_seletor_facetado.sql`:

```sql
ALTER TABLE `vocab_cards` ADD `src_lang_base` text
  GENERATED ALWAYS AS ((lower(substr(coalesce(src_lang,''),1,2)))) VIRTUAL;
CREATE INDEX `idx_vocab_src_lang_base` ON `vocab_cards` (`src_lang_base`);
```

Aditiva por construção: nenhuma coluna existente muda, nenhum backfill necessário (coluna gerada
recalcula na leitura). `server/db/repositories/vocab.ts:560` e `:605` usam `vocabCards.srcLangBase`
nas condições de composição (`eq`/`inArray`), reaproveitando o índice novo.

**`down.sql`** (`openspec/changes/seletor-facetado/down.sql`): `DROP INDEX IF EXISTS
idx_vocab_src_lang_base` apenas — a coluna gerada fica órfã de propósito. O próprio arquivo
justifica: SQLite não tem `DROP COLUMN` para coluna gerada que não force reconstruir a tabela
inteira em versões antigas, o que fugiria do padrão "down só desfaz o que a migração acrescentou
de custo ativo" já usado no restante do repositório (motor Anki: `down.sql` de tabela nova é
`DROP TABLE`, nunca reconstrução). Uma coluna VIRTUAL órfã não ocupa disco por linha, não aceita
escrita direta e para de ser lida quando o índice cai — política consistente com a do programa
anterior (aditivo-somente, `down.sql` manual, sem rollback automático porque o repositório inteiro
não tem essa infraestrutura).

## Decisão 4 — `dueAtMs` cru no payload; a regra de filtro não faz parse de rótulo

Verificado em `src/core/minigames/filtro.ts` (interface `CartaoFiltravel`): o campo é
`dueAtMs?: number | null`, com o comentário explícito de que **não** é o `fsrsDueAt` do
`VocabCard` (que é string de exibição, "ISO ou descritivo"). `passaRecorte` compara `dueAtMs`
diretamente contra `Date.now()`/`extras.agora` para os recortes `nuncaVistas`
(`dueAtMs == null`) e `pedindoRevisao` (`dueAtMs != null && dueAtMs <= agora`) — nenhum parse de
string de rótulo entra no caminho do predicado. `Play.tsx:1729` lê o mesmo campo cru
(`(c as {dueAtMs?: number|null}).dueAtMs`) na triagem local, mantendo a mesma fonte para UI e
filtro.

## Decisão 5 — Perfil de qualidade por origem alcança os contadores, não só a aprovação

O defeito raiz do G0 (`quality.ts:470`, `pistasDaTriagem` chamando `pistaUtil` sem origem) é do
programa anterior (`motor-anki-acervo`, que já entregou `avaliarCartao(…, {origem})`); esta
proposta o resolve no lado do CONTADOR: os contadores da tela de prática passam a derivar da mesma
triagem/perfil que a aprovação de cartão usa, em vez de recalcular com o perfil padrão
(`'captura'`) por engano. Não verificado nesta auditoria linha a linha de `quality.ts` — a correção
factual do ponto exato (`pistasDaTriagem`) está registrada como tarefa da Onda 1 em `tasks.md`;
confirmar no diff antes de marcar concluída se ainda não estiver.

## Decisão 6 — `queryDoFiltro`/`filtroDaQuery` na URL, com captura no boot do módulo de rotas

Verificado em `src/lib/rotas.ts:114-120`: `urlParaEstado` descartava a query string inteira antes
do parse do caminho (comentário no código: "defeito de persistência"); agora a query sobrevive
apenas na rota `/jogar` (única que a publica), sem `.toLowerCase()` no trecho de query — ids de
baralho e códigos de idioma são sensíveis a caixa, ao contrário do resto do caminho.

**A dança de boot do `App` apaga a query.** O efeito "navegação → URL" do `App` roda uma vez com a
view antiga antes de a restauração de estado aplicar, reescrevendo a URL no meio do caminho: o
caminho volta na passada seguinte, mas a query não sobrevive a essa reescrita intermediária.
Solução verificada em `rotas.ts:200-215`: `queryDoBoot` é uma variável de módulo capturada na
AVALIAÇÃO do módulo (antes de qualquer render do React escrever na barra de endereço), e
`consumirQueryDoBoot()` é **consumo único** — devolve a query e zera a variável, documentado no
código como "um link vale para a abertura que ele causou, não para toda visita futura à tela".
`publicarQueryDoJogar` (`rotas.ts:187-193`) escreve/limpa a query só quando `/jogar` está na barra,
sempre com `replaceState` — cada ajuste de faceta não empilha histórico; "voltar" sai da tela, não
desfaz chips um a um.

`src/lib/filtroDaPratica.ts` implementa a serialização: `queryDoFiltro` produz uma URL "que fala a
língua de quem a lê" (`recorte=pedindo-revisao`, não `recorte[pedindoRevisao]=true`), retorna `''`
quando o filtro é o padrão (URL limpa), e a comparação é sobre a STRING serializada, não o objeto,
porque o saneador da persistência materializa `false` explícitos que são semanticamente o padrão.
`filtroDaQuery` devolve `null` (não um padrão) quando a query não fala de filtro — o chamador cai
na persistência local em vez de perder a escolha guardada — e ignora campo a campo valores
desconhecidos (ex.: id de baralho apagado), sem derrubar o resto da leitura.

## Riscos e não-verificados

| Item | Estado |
|---|---|
| `pistasDaTriagem` sem origem, corrigido | Não verificado linha a linha nesta auditoria — tarefa listada em `tasks.md`, Onda 1 |
| Distribuição multi-fonte proporcional (Q1 do plano) | Não implementada — nenhuma ocorrência de lógica de maior resto/proporcional em `composicao.ts` |
| Re-escopo server-side do `dueToday` | Não implementado — `dueToday` não aparece em `server/db/repositories/vocab.ts` |
