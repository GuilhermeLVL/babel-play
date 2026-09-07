> **Entregue.** A pergunta 5 foi respondida pelo dono em 07/09 ("vá em frente"), e a decisão por
> objeto está na tabela de `design.md`, com as linhas e as operações medidas no banco real. A única
> tarefa que não entrega código é a 2.3, e o motivo está dito: rota órfã não é tabela órfã.

## 0. Decisao

- [x] 0.1 Pergunta 5 respondida por objeto em `design.md`, com o `down` manual escrito no cabeçalho da migração 0026 (recriar as quatro tabelas a partir de `0002`/`0018` e devolver a coluna). Nenhum dado se perde porque nenhum dado existe: 0, 0, 0, 0 linhas conferidas no dia.

## 1. Tabelas

- [x] 1.1 `analyses` removida, e `CachedAnalysis` saiu de `contract.ts`. O tipo era resquício do lift do app desktop e o próprio comentário dizia "na web vai para `analyses`" — não ia, e nunca houve rota.
- [x] 1.2 `profiles` removida. `settings.active_profile_id` FICA e não precisou migrar para `ui`: nunca houve FK, e a coluna guarda o id de um perfil que é código (`src/gateway/profiles.ts`). A tabela era a promessa de perfis definidos pelo usuário, que não existe.
- [x] 1.3 `anki_media`, `anki_note_media` e `server/lib/ankiMidia.ts` removidos. O módulo tinha 165 linhas com storage e detecção por magic bytes e ZERO importadores, nem em teste; `motor-anki-midia` continua aberta, com o desenho (dedupe por usuário, referência anulável) preservado nela. O que existe e continua: `lerApkg`/`extrairMidia` leem a mídia do pacote, e o importador deliberadamente não a grava.

## 2. Colunas e funcoes

- [x] 2.1 `vocab_cards.frequency` removida do banco (`ALTER TABLE ... DROP COLUMN`, conferido que esta base roda SQLite 3.45 antes de escrever a migração — não foi preciso recriar a tabela). **Além do previsto:** `VocabCard.frequency` do CLIENTE também saiu. Era um campo obrigatório que ninguém lia, preenchido com `'medium'` cravado — um rótulo de frequência que não media frequência — e custava uma linha em 18 fixtures de teste.
- [x] 2.2 `recalcularDificuldade` LIGADA, não removida: gatilho em `POST /api/exercises/rodada`, só para os `cardId` da rodada, depois do `res.json`. É o caso simétrico ao resto da mudança — função correta, testada, sem chamador de produção, e por isso `difficulty_score` era NULL em 2.818 de 2.818 cartões. Prova em `tests/integration/dificuldade-com-gatilho.test.ts`, que testa a ROTA (era ela que estava vazia).
- [ ] 2.3 `GET /vocab/distribuicao-dificuldade` e `GET /vocab/:id/ocorrencias`. **Deliberadamente fora:** rota órfã não é tabela órfã. As duas leem tabelas vivas, com repositório testado, e são trabalho de `codigo-morto-removido` — cujo inventário precisa ser refeito, porque o da auditoria já está velho (três módulos que ela dava como mortos ganharam importador depois). Registrado que `/distribuicao-dificuldade` mudou de estado com a 2.2: era instrumentação de um número que não existia.

## 3. Invariante

- [x] 3.1 `tests/integration/schema-usado.test.ts`: toda tabela declarada tem leitor E escritor em `server/`. A varredura é de texto e não de tipos de propósito — as escritas acontecem por três caminhos sem tipo em comum (builder do drizzle, SQL cru com interpolação, SQL cru com nome literal), e um analisador de tipos chamaria os dois últimos de tabela órfã. Verificado que o teste FALHA com uma tabela órfã injetada, para não passar por vazio.
- [x] 3.2 Suíte verde (2.892); migração aplicada no banco real com backup, e conferido depois: 0 tabelas órfãs, 0 colunas `frequency`, 2.818 cartões intactos.
