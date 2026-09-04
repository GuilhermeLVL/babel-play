## Context

O motor de jogos inteiro lê `vocab_cards`: a composição no servidor (`selecionarParaJogo`,
`vocab.ts:440+`), a partição de fontes no cliente (`cartoesDaFonte`, `source.ts:84-97`) e o FSRS,
que grava em `vocab_cards` + `review_logs` (`vocab.ts:556-596`). O brief exige acervo Anki separado
e rastreável. As duas coisas parecem brigar. Este documento resolve a briga.

## Decisão 1 (ADR) — Acervo próprio + projeção, não fonte paralela

**Escolhido:** tabelas próprias como acervo canônico, e os itens ativados são **projetados** em
`vocab_cards`.

**Rejeitado:** uma quinta `FonteId` (`'anki'`) alimentando `montarRodada` direto. Custo medido na
leitura do código: `FonteId` **não pode ser renomeado** porque `exercise_results.origem` é derivado
dele (`source.ts:163-168`), e uma quinta fonte obriga a mexer em `fontesDisponiveis`,
`rotuloDaFonte`, `escolhaDaFonte`/`fonteDaEscolha`, `OrigemDoItem` (`revelavel.ts:115`),
`ContextoDeDesbloqueio` e `PedidoDeComposicao.fonte.id` (`composicao.ts:167`, que só aceita
`baralho|sessao|trilha`) — além de exigir um segundo estado SRS ou uma FK polimórfica em
`review_logs`. Benefício: nenhum.

**O que torna a projeção honesta:** "fonte separada" é cumprida pelo acervo intacto + procedência
gravada + chip de origem visível na prévia ("Anki · nome do baralho") + filtro por baralho. A fusão
deixa de ser **silenciosa** porque fica **visível**, não porque deixa de existir — e o vocabulário
unificado (uma palavra, um cartão, uma memória) é o que o usuário quer: ver "ledger" duas vezes
porque veio de dois baralhos seria o defeito, não a feature.

**Restrição que cai daqui, e é a mais valiosa do programa:** `vocab_cards` **não muda**. O vínculo
mora em `anki_notes.projected_card_id`. Se a projeção inteira for revertida, o app continua de pé.

## Decisão 2 (ADR) — O filtro por baralho usa o `ref` que já existe

`PedidoDeComposicao.fonte` já carrega `ref?: string | null` (`composicao.ts:167`) e
`selecionarParaJogo` já filtra por origem com `EXISTS` sobre `vocab_occurrences (origin_kind,
origin_ref)`, com o índice `idx_occ_origem` pronto (`vocab.ts:473-486`, `schema.ts:177`). "Jogar só
com o baralho X" é **um ramo novo na cláusula que já existe**, não um mecanismo novo.

Semântica decidida: `fonte='baralho'` **sem** ref continua incluindo os cartões Anki (hoje já
inclui, via `!daTrilha`); com `ref='anki:<deckId>'`, recorta. Manter a inclusão é deliberado — o
acervo do usuário é um só; o que faltava era **poder separar quando ele quiser**, não separar
sempre.

## Decisão 3 — Ativação em lotes resolve os "3.000 vencidos"

`dueAt = now` para cartão novo é semântica FSRS correta, não defeito. O defeito é injetar 3.000 de
uma vez. Com acervo próprio, "ativação" vira conceito de produto:

- nota nasce `estado='arquivada'` — está no acervo, visível, inspecionável, **fora da fila**;
- ativar projeta um lote (padrão ≤300, o mesmo número que o cliente já pratica) e é uma ação
  explícita, repetível, com saldo ("300 de 3.600 ativadas");
- a §3 do relatório G0 mostra que "9.847 cards restantes" é a causa nº 1 de abandono documentada na
  comunidade. A tela nunca mostra o total bruto como dívida.

Reposição automática (ativar o próximo lote quando os vencidos ativos acabarem) fica **fora** desta
proposta: exigiria decidir por quem, e ativação explícita é honesta. Anotado como porta aberta.

## Decisão 4 — Dedupe: colisão é feature, e nada se perde

A projeção usa o mesmo upsert por `(userId, normKey)` do `bulkAdd` (`vocab.ts:231-247`).

- Mesma palavra em dois baralhos → **um** cartão, **duas** ocorrências, **duas** notas apontando
  para ele. É o comportamento desejado e o Inspetor mostra as duas origens de graça.
- Duas notas *diferentes* com a mesma `normKey` (ex.: "bank" substantivo e verbo) fundem o item
  jogável — e **não perdem nada**, porque `campos_brutos` guarda as duas notas íntegras. Declarado
  como comportamento na spec, não tratado como bug.
- **Aresta perigosa:** o índice único é PARCIAL (`WHERE deleted_at IS NULL`). Se o cartão foi
  soft-deletado e o baralho é reimportado, o upsert cria linha nova e o histórico FSRS racha em
  dois. Regra: `anki_notes` guarda **por que** o cartão foi deletado; se a deleção veio de
  "desativar baralho", a projeção **reativa** a linha existente (limpa `deleted_at`); se veio de
  deleção manual do usuário, respeita e cria nova. O usuário mandou apagar aquilo uma vez.

## Decisão 5 — Jobs: fatias dirigidas pelo cliente + ledger. Sem fila.

Não há scheduler no servidor; `storageQuota.ts:225` registra a ausência com todas as letras ("um
job periódico exigiria scheduler — infra que este servidor não tem"), e a topologia é "um nó migra,
os outros servem" (`manutencao.ts:42-54`). Uma fila in-process morreria no restart sem ninguém para
retomá-la, e o progresso teria de ir ao banco de qualquer forma.

O padrão TETO=300 + lotes já É um job dirigido pelo cliente. O que falta é o **registro**:
`anki_imports` guarda estado e contadores; cada requisição é pequena e limitada; o retry é
idempotente por `guid`; o progresso é consultável. Fila de verdade só se surgir automação
server-side (reimport agendado) — porta aberta.

## Decisão 6 — Perfil de qualidade por origem

`pistaUtil` recusa pista >42 chars ou >5 palavras. Isso é **certo** para fala capturada, que é o
funil para o qual foi calibrado, e **errado** para um baralho curado, onde a definição longa é o
conteúdo. Medido: 61 de 3.600 num deck en-en.

`avaliarCartao` ganha um perfil opcional (`{ origem: 'captura' | 'curado' }`, default `'captura'` —
nenhum chamador existente muda de comportamento). No perfil `curado`: o teto de pista sobe e a
regra de "poucas palavras" cai; as regras que continuam valendo são as que barram **lixo**, não
comprimento — palavra com dígito, letra repetida em excesso, tradução igual à palavra, ausência de
pista. Os números exatos do teto saem da medição do corpus (G2), não de palpite: a spec fixa o
mecanismo, o G2 fixa a constante.

## Decisão 7 — Migração aditiva, e a política de rollback possível

O repositório **não tem rollback**: zero arquivos `down`, e migrações destrutivas são table-rebuild
irreversível (`0011_fk_e_cascata.sql`). Fingir que existe seria pior que assumir. Política desta
proposta:

1. **Aditivo-somente**: só tabelas novas e colunas anuláveis. `vocab_cards` intocada.
2. Cada migração acompanha um `down.sql` **manual** no diretório do change — para tabela nova é
   `DROP TABLE`, seguro antes de haver adoção.
3. Backup do arquivo SQLite antes de migrar, no passo de deploy.
4. Migração irreversível exige ADR próprio declarando isso. Esta não tem nenhuma.

## Riscos

| Risco | Mitigação |
|---|---|
| Reimport pós-desativação racha o histórico FSRS | Decisão 4: motivo da deleção guardado, reativação em vez de nova linha |
| Baralho monstro (300k notas) trava a leitura | Teto de notas por resposta e paginação no parser (change `motor-anki-mapeador` / G2); import parcial por subdeck |
| Perfil `curado` afrouxa demais e deixa entrar lixo | Constantes vindas de medição no corpus, não de intuição; a régua de lixo (dígito, ruído, tradução igual) continua valendo nos dois perfis |
| Projeção diverge do `bulkAdd` e duplica regra | A projeção **reusa** `avaliarCartao` e o mesmo upsert; o que muda é o perfil e a origem |
