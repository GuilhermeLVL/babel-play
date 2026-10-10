# Dados, métricas e seleção de palavras: como o app está hoje

Data: 10/10/2026. Auditoria só de leitura, feita na árvore de trabalho de `C:\Users\Guilh\dev\ei-polimento`
(branch `feat/polimento-movimento`, com arquivos não commitados de outros agentes; os números de linha
são os da árvore neste dia). Nenhum código foi alterado. O banco real (`data/babel.db`) não foi tocado.

Como ler os números deste relatório:

- **medido**: saiu de um banco temporário com as 51 migrações aplicadas e dados sintéticos
  (`C:/Users/Guilh/AppData/Local/Temp/e2e-babel/auditoria-dados/medir2.mjs`), nesta máquina (Windows, libsql local).
  Serve para comparar tamanhos e ordens de grandeza; os tempos em produção (Linux, Fly) serão outros.
- **do código**: medição que os próprios comentários ou documentos do projeto registram.
- **estimativa**: conta feita a partir do esquema ou do medido; está marcada.

## Resumo em uma página

1. O banco é pequeno em linhas, mas **gordo por linha**. Um usuário pesado sintético (50 sessões de 30 min,
   5.000 cartões, 1 ano de uso) ocupa **43,2 MB (medido)**, e **metade disso são índices**. O motivo principal
   é que toda chave é um UUID em texto (36 bytes) repetido em cada linha e em cada índice.
2. **Nada do que é "apagado" sai do banco.** Sessão, fala, cartão, ocorrência e revisão recebem `deleted_at`
   e ficam para sempre. Só a exclusão da conta e a purga de um baralho Anki apagam de verdade. Não há
   `VACUUM`, `ANALYZE` nem `PRAGMA optimize` agendados.
3. A chave que decide "é a mesma palavra?" **junta palavras diferentes** em vários idiomas: em japonês
   `がっこう` e `かっこう` viram a mesma chave, em hindi `किताब` perde as vogais, em tailandês idem, em alemão
   `schön` = `schon`, em espanhol `año` = `ano`, em português `avó` = `avô` (medido, seção 2). E **não há lema**:
   `run`, `runs` e `running` são três cartões.
4. A repetição espaçada é um FSRS-5 próprio com **pesos padrão iguais para todos**. Não há ajuste por
   usuário. O histórico de revisões guarda o suficiente para medir se a previsão está calibrada, mas **não
   guarda tempo de resposta, formato do cartão nem de onde veio a nota** (revisão ou qual jogo).
5. Os minijogos **não têm um seletor único**. Há seleção no servidor, um espelho no cliente que já diverge
   dele, uma régua de memória aplicada em três lugares e uma fila própria na Revisão. Existem **dois conceitos
   de dificuldade que não conversam**: o nível do jogo (tempo, vidas, alternativas) e a faixa do cartão.
   Não há intercalação de fáceis e difíceis dentro da rodada.
6. As métricas são **recontadas do zero** a partir das tabelas inteiras do usuário (com um cache em memória
   por versão dos dados). Não existe tabela de agregados por dia. Retenção real existe; retenção real
   contra a prevista não existe, embora os dados para ela já estejam gravados.
7. Há listas de palavras para 16 idiomas (893 KB no total), mas **só o inglês tem nível CEFR de verdade**
   (2.784 palavras); os outros 15 são faixas de frequência. Não há lematizador em tempo de execução, só
   regras pequenas de sufixo.
8. Na edição estática tudo mora no IndexedDB do navegador e toda a seleção já roda no aparelho, mas sem
   `difficulty_score`, sem ocorrências e sem a régua CEFR.

---

## 1. Modelo de dados

Fonte: `server/db/schema.ts`. Toda tabela de domínio carrega `created_at`, `updated_at`, `user_id`,
`deleted_at` (schema.ts:24-29) e um `id` em texto (UUID, 36 bytes).

### 1.1 Tabelas ligadas ao pedido

| Tabela (schema.ts) | O que guarda | O que faz crescer | Tabela, bytes/linha (medido) | Com índices, bytes/linha (medido) |
|---|---|---|---:|---:|
| `sessions` (31-72) | título, tipo, idiomas, duração, contagem de palavras, `meta` em JSON | 1 por captura ou importação | ~410 | pequeno |
| `utterances` (74-118) | uma fala: tempos, falante, texto, tradução, tradução polida, motor, confiança | ~360 por sessão de 30 min (hipótese: 1 fala a cada 5 s) | 411 | 568 |
| `vocab_cards` (120-207) | palavra, verso, frase, idiomas, estado FSRS, CEFR, chave de dedup, contadores, dificuldade | 1 por palavra distinta por idioma | 387 | 940 |
| `vocab_occurrences` (218-259) | cada vez que a palavra foi vista: cartão, quando, origem, frase | 1 por encontro (inclusive repetição) | 288 | 788 |
| `review_logs` (261-287) | cada nota dada: cartão, quando, nota, estabilidade antes/depois, vencimento antes/depois, dias decorridos | 1 por revisão e 1 por item de jogo que grava nota | 187 | 353 |
| `exercise_results` (301-372) | cada item de cada rodada: acerto, tentativas, ms, dica, origem, cartão, mais placar e combo da rodada repetidos | 1 por item jogado e 1 por cartão revisado | 216 | 605 |
| `anki_decks` (830-847) | baralho importado | 1 por arquivo | pequeno | pequeno |
| `anki_notes` (859-900) | nota Anki: todos os campos em JSON (`campos_brutos`) e também `frente`, `verso`, `exemplo` | 1 por nota do `.apkg` | 669 | 990 |
| `anki_imports` (907-933) | diário de cada importação | 1 por importação | pequeno | pequeno |
| `presencas` (506-519) | um dia aberto | 1 por dia de uso | pequeno | pequeno |
| `seed_spends`, `seed_credits` (391-447) | gastos e créditos de Seeds (eventos) | 1 por compra, conquista, meta | pequeno | pequeno |
| `versoes_de_dados` (migração 0032) | dois contadores por usuário, mantidos por gatilhos | 1 por usuário | fixo | fixo |
| `rank` (971-993) | placar público, 1 linha por (jogo, apelido) | devagar | pequeno | pequeno |
| `cache_de_traducao` (1089-1106) | frase curta já traduzida, por hash | podada em 30 dias | — | — |
| `glossario` (1121-1135) | até 500 termos fixados por pessoa | devagar | — | — |

O que **não existe** como tabela: XP, nível, ofensiva, missões e conquistas (são calculados a cada carga a
partir dos fatos; só os créditos e gastos são gravados); áudio e mídia (o áudio é arquivo no disco ou no R2,
e só o nome fica em `sessions.meta`); mídia do Anki (as tabelas foram removidas na migração 0026,
schema.ts:935-950; o importador lê a mídia e não grava).

### 1.2 Tamanho por usuário ativo

Cenário pedido: 50 sessões de 30 min, 5.000 cartões, 1 ano de revisões. Hipóteses do sintético: 360 falas
por sessão, 3 ocorrências por cartão, 60 revisões por dia, 3 rodadas de 8 itens por dia, 3.000 notas Anki.

| Objeto | Linhas | Tabela (MB, medido) | Índices (MB, medido) | Total (MB) |
|---|---:|---:|---:|---:|
| `utterances` | 18.000 | 7,39 | 2,83 | 10,2 |
| `vocab_occurrences` | 15.000 | 4,31 | 7,51 | 11,8 |
| `review_logs` | 21.900 | 4,10 | 3,62 | 7,7 |
| `exercise_results` | 8.760 | 1,90 | 3,41 | 5,3 |
| `vocab_cards` | 5.000 | 1,94 | 2,76 | 4,7 |
| `anki_notes` | 3.000 | 2,01 | 0,96 | 3,0 |
| **Arquivo inteiro** | | | | **43,2** |

Leituras do quadro:

- **Índices são metade do banco.** Em `vocab_occurrences` os seis índices pesam 1,7 vez a tabela.
- **O UUID em texto domina a linha.** Uma revisão tem 177 bytes de conteúdo, dos quais 108 são três UUIDs
  (`id`, `user_id`, `card_id`). O dado útil (data, nota, estabilidades) caberia em ~40 bytes (estimativa).
- Um usuário comum é muito mais leve que isso. O comentário do próprio esquema registra 3.593 falas para 70
  sessões do dono (schema.ts:114), ou seja, ~51 falas por sessão, sete vezes menos que a hipótese acima.
- Cópias fora do banco: o Litestream guarda um snapshot completo por dia durante 7 dias (`litestream.yml:37-39`)
  e há o snapshot diário da aplicação por 30 dias, comprimido (`server/operacao/snapshot.ts`). Cada MB no banco
  vira vários MB no R2 (estimativa: 7 cópias cruas mais 30 comprimidas).

### 1.3 Onde há texto repetido

| Onde | O que se repete | Peso |
|---|---|---|
| `vocab_occurrences.sentence` (schema.ts:237) | A frase da fala é copiada em cada ocorrência. A coluna `utterance_id` existe para apontar para a fala, mas **nunca é preenchida**: os dois únicos pontos de escrita gravam `null` (`server/db/repositories/vocab.ts:555` e `:1451`). | ~75 bytes por ocorrência; ~1,1 MB dos 4,3 MB da tabela no sintético (estimativa sobre o medido) |
| `vocab_cards.sentence` (schema.ts:129) | A primeira frase fica no cartão e também na primeira ocorrência. | ~75 bytes por cartão |
| `anki_notes` (schema.ts:874-878) | `campos_brutos` guarda todos os campos em JSON, e `frente`, `verso`, `exemplo` guardam os mesmos textos de novo. Depois de ativada, a nota ainda vira `vocab_cards.word/back/sentence` e uma ocorrência com a frase: **o mesmo texto até quatro vezes**. | 669 bytes por nota, a maior linha do banco |
| `exercise_results.score` e `.combo` (schema.ts:309-330) | Placar e combo da rodada repetidos em cada item (decisão documentada, por causa do recorde). | 2 números por linha; pouco |
| `exercise_results.item_ref` (schema.ts:336) | A palavra em texto, além de `card_id`. | ~10 bytes por linha |
| `utterances` | `source_lang`, `target_lang`, `speaker_name`, `engine`, `source` repetidos em cada fala (são da sessão ou do falante). | ~40 bytes por fala (estimativa) |
| `utterances.traducao_polida` (schema.ts:103) | Segunda tradução ao lado da primeira; por desenho. | dobra o texto traduzido das falas polidas |
| `sessions.meta` (schema.ts:45) | JSON livre. Já carregou capa em base64: 2 capas respondiam por 1.045 KiB (do código, `server/lib/capaDeSessao.ts:4-7`). Hoje o teto é 8 KB (`server/validation.ts:25`); linhas antigas podem ter capas grandes. | até 8 KB por sessão; legado maior |

A transcrição **não** é guardada inteira além das falas: não há coluna de transcrição na sessão. As
análises da sessão não são persistidas (rodam no navegador a cada abertura).

### 1.4 Índices

Índices que parecem **redundantes** (inferência pelo prefixo; confirmar com `EXPLAIN QUERY PLAN` antes de remover):

| Índice | Por quê | Peso no sintético (medido) |
|---|---|---:|
| `idx_occ_user_card (user_id, card_id)` (schema.ts:241) | É prefixo exato de `idx_occ_probe (user_id, card_id, origin_kind, origin_ref)` (schema.ts:257). | 1,41 MB |
| `idx_exercise_results_card_id (card_id)` (schema.ts:368) | Criado para a chave estrangeira; `idx_exercise_results_card` começa por `user_id`. Os dois ficam; avaliar se um índice `(card_id, user_id, created_at)` serve aos dois usos. | 0,45 MB |
| `idx_vocab_session (user_id, session_id)` e `idx_vocab_session_id (session_id)` (schema.ts:187, 196) | Mesma situação. | 0,45 + 0,25 MB |
| `idx_exercise_results_item_ref (item_ref)` (schema.ts:353) | Sem `user_id`: atravessa todos os usuários. As leituras por item são feitas por usuário. | 0,18 MB |
| `idx_occ_utterance` (schema.ts:246) | Parcial sobre uma coluna sempre nula: vazio, não custa, mas é enfeite. | 0 |

Índices que **faltam**: nenhum grave nas leituras por usuário (foram cobertos pelas migrações 0030 e 0034).
O que falta é outra coisa: as consultas de métrica leem a tabela inteira do usuário, e índice não resolve isso
(seção 6).

### 1.5 Colunas mortas ou sem leitor

| Coluna | Situação |
|---|---|
| `sessions.ended_at` (schema.ts:39) | Nenhuma referência em `server/` nem em `src/`. |
| `utterances.status` (schema.ts:92) | Não é escrita por `montarLinhas` (`server/db/repositories/utterances.ts:49-68`). |
| `vocab_cards.phonetics` (schema.ts:128) | Só é lida; o cliente a sobrescreve com vazio (`server/db/repositories/vocab.ts:238-242`). |
| `vocab_occurrences.utterance_id` (schema.ts:238) | Sempre `null` (ver 1.3). |
| `review_logs.prev_due`, `new_due` (schema.ts:273-274) | Escritas em `vocab.ts:1147-1148`, sem leitor. São deriváveis. |
| `review_logs.prev_stability`, `new_stability`, `elapsed_days` (schema.ts:271-275) | Escritas e **não lidas por ninguém**. São valiosas (seção 4): é delas que sai a calibração do FSRS. |
| `exercise_results.attempts`, `hinted` (schema.ts:338, 342) | Gravadas e sem leitor: acerto com dica conta igual a acerto limpo. |
| `exercise_results.ms` (schema.ts:340) | Lida só para somar "minutos estudados". |
| `vocab_cards.box` | Legado Leitner, mantido de propósito para reversão. |

---

## 2. Como uma palavra vira chave

### 2.1 A regra

`chaveDedup(palavra, idioma)` em `src/core/texto/palavra.ts:74-77` monta `idioma_base|palavra_normalizada`.
A normalização (`chaveGuardada`, palavra.ts:22-28) faz, nesta ordem: decomposição NFD, remove as marcas
U+0300 a U+036F, minúsculas, e por fim remove **tudo que não é letra nem número**.

- **Por idioma**: sim, pelo idioma base (`pt` de `pt-BR`). A mesma grafia em dois idiomas são dois cartões.
- **Minúscula**: sim. **Acento**: removido. **Pontuação e espaço**: removidos.
- **Lema**: não. Cada forma flexionada é um cartão.
- A unicidade é garantida no banco pelo índice parcial `uq_vocab_user_norm (user_id, norm_key) where deleted_at is null`
  (schema.ts:178-180).

### 2.2 A mesma palavra de duas fontes vira um cartão

Sim. `bulkAdd` faz `INSERT ... ON CONFLICT (user_id, norm_key) DO UPDATE`: a repetição soma `occurrences`,
move `last_seen_at` e só preenche tradução e frase se estavam vazias (`vocab.ts:505-529`). O Anki usa o mesmo
upsert (`projetarDoAnki`, `vocab.ts:1283-1432`). Cada encontro gera uma linha em `vocab_occurrences` com a origem
(`sessao`, `trilha`, `anki`, `manual`, `import`, `legado`; `vocab.ts:452-458`, `540-559`).

Limites dessa ligação:

- A ocorrência não aponta para a fala (`utterance_id` nulo), só para a sessão (`origin_ref`). Não dá para
  saltar da palavra para o instante do vídeo pelo banco.
- Trocar o idioma de um cartão recalcula a chave; se a chave nova já tem dono, o cartão não é reetiquetado
  e os dois continuam separados (`vocab.ts:1165-1210`). Não existe fusão de cartões.
- Apagar a sessão não apaga os cartões nem as ocorrências dela (decisão documentada, `sessions.ts:283-286`).

### 2.3 Onde a chave erra (medido com a própria função)

| Entrada A | Entrada B | Resultado |
|---|---|---|
| `がっこう` (escola) | `かっこう` (cuco) | mesma chave: o NFD separa a marca de sonorização e o filtro final a apaga |
| `パパ` (papai) | `ハハ` | mesma chave |
| `किताब` (hindi) | `कतब` | mesma chave: as vogais do devanágari são marcas e somem |
| `กิน`, `ดี` (tailandês) | `กน`, `ด` | mesma chave: vogais e tons somem |
| `мой` (russo) | `мои` | mesma chave |
| `schön` / `schon`, `año` / `ano`, `avó` / `avô` | | mesma chave |
| `ice cream` | `icecream` | mesma chave (espaço removido) |
| `don't` | `dont` | mesma chave |
| `Running` | `running` | mesma chave (correto) |
| `run`, `runs`, `running`, `ran` | | quatro chaves (sem lema) |

Consequência prática: no japonês, hindi, tailandês e russo, a segunda palavra que colidir **não vira cartão**;
ela soma ocorrência no cartão da primeira e a pessoa nunca a estuda. O árabe e o hebraico perdem só os
sinais de vocalização, o que é aceitável. O coreano e o chinês passam intactos.

Curiosidade que mostra o remendo parcial: a régua de qualidade já trata marca combinante como letra para não
reprovar o hindi (`src/core/learning/quality.ts:346-351`), mas a chave de dedup não recebeu o mesmo cuidado.

### 2.4 Idiomas sem espaço

- A extração de palavras usa `Intl.Segmenter` do aparelho (`src/core/learning/keywords.ts:96-99`,
  `src/core/texto/segmentacao.ts`). Sem ele, cai em regex.
- A contagem de palavras do servidor **não** usa: `sessions.word_count` é `split(/\s+/)`
  (`server/db/repositories/sessions.ts:117`, `:219`, `:257`), então uma frase em japonês conta 1 palavra.
  Palavras por minuto e XP de captura saem errados nesses idiomas.
- A régua de qualidade aproxima por `caracteres / 2` nas escritas sem espaço (`quality.ts:313-329`).

### 2.5 O que barra lixo, e o que passa

A régua `avaliarCartao` (`quality.ts:331-370`) roda na entrada (`vocab.ts:407-416`) e recusa: palavra de 1 letra
(2 para alfabetos, 1 para Han, kana e hangul), qualquer dígito, a mesma letra três vezes seguidas, menos de 60%
de letras, palavra gramatical, sem tradução e sem frase, tradução igual à palavra, tradução que não define.
Há ainda limite de tamanho no `bulkAdd` (`quality.ts:611-613`, 2 a 200).

O que **passa** hoje:

- **Nomes próprios**: não há detecção. `Guilherme`, `Netflix`, `Tokyo` viram cartão.
- **Alucinação de transcrição**: nada confere se a palavra existe. Há `utterances.confidence`, mas o cartão
  não a consulta.
- **Formas flexionadas**: cada uma é um cartão novo e "nova para você".
- **Palavras fora da lista do idioma**: entram com nível `ausente`. Não há uso da lista como filtro de
  "isto é uma palavra deste idioma?".
- A escolha de palavras de uma frase ordena por **comprimento** como aproximação de raridade
  (`keywords.ts:108-112`) e só tem lista de palavras gramaticais para inglês e português (`keywords.ts:24-55`).
  Nos outros idiomas, artigo e partícula viram sugestão de cartão.

---

## 3. Ciclo de vida e limpeza

### 3.1 O que acontece ao apagar

| Ação | O que acontece | Onde |
|---|---|---|
| Apagar sessão | O arquivo de áudio é removido e a cota devolvida; a sessão e as falas recebem `deleted_at`. Cartões, ocorrências e resultados de jogo daquela sessão **ficam**. | `server/routes/sessions.ts:658-684`, `sessions.ts:287-299` |
| Apagar cartão | Cartão, ocorrências e revisões recebem `deleted_at`. `exercise_results` e `anki_notes.projected_card_id` não são tocados. | `vocab.ts:1253-1278` |
| Desfazer revisão | A revisão recebe `deleted_at`. | `vocab.ts:1061-1098` |
| Retomar captura | As falas são apagadas de verdade e inseridas de novo, com ids novos. | `sessions.ts:215-235`, `utterances.ts:125-127` |
| Purgar baralho Anki | Notas, importações e baralho apagados de verdade. Os cartões projetados ficam. | `server/db/repositories/anki.ts:301-305` |
| Excluir conta | Apagamento físico de todas as tabelas do titular, filhos antes dos pais. | `server/db/repositories/conta.ts:64-104`, `:296-312` |

**Nenhuma rotina remove linhas com `deleted_at`.** Elas continuam ocupando a tabela e todos os índices não
parciais, para sempre.

### 3.2 Tarefas agendadas que existem

Todas dentro do próprio processo, com temporizador diário (`server.ts:390-444`):

| Tarefa | O que faz | Onde |
|---|---|---|
| Snapshot diário | `VACUUM INTO` para um arquivo temporário, confere integridade, comprime e envia ao R2 | `server/operacao/snapshot.ts:125-140`, `:293` |
| Retenção de áudio | Apaga o arquivo de áudio de sessões com mais de `AUDIO_RETENCAO_DIAS` (padrão 90); 0 desliga | `server/lib/retencaoDeAudio.ts:55-127` |
| Limpeza de convidados | Remove convidados inativos há 30 dias e seus contadores | `server/lib/limpezaDeConvidados.ts:164` |
| Poda das janelas diárias | Remove contadores de uso antigos | `server/lib/usageQuota.ts:101-115` |
| Poda das marcas de teste | Remove marcas com mais de 730 dias | `server/lib/testePremium.ts:147-160` |
| Poda do cache de tradução | Remove traduções com mais de 30 dias | `server/ai/cacheDeTraducao.ts:272-293` |

### 3.3 O que nunca é limpo

- Linhas com `deleted_at` em `sessions`, `utterances`, `vocab_cards`, `vocab_occurrences`, `review_logs`.
- `review_logs` e `exercise_results`: crescem para sempre, sem compactação.
- `vocab_occurrences`: uma linha por encontro, sem teto por cartão.
- `anki_notes` de baralhos desativados (viram `arquivada`, ficam).
- `anki_imports`, `billing_events`, `gasto_de_ia` (uma linha por dia), `rank`.
- Cartões que nunca foram revisados nem jogados (palavras capturadas e esquecidas).

### 3.4 VACUUM, ANALYZE, WAL

- **WAL**: ligado no boot, com `busy_timeout = 5000` e `synchronous = NORMAL` (`server/db/db.ts:87-89`).
  No desligamento há `wal_checkpoint(TRUNCATE)` (`server/lib/desligamento.ts:130`).
- **VACUUM**: só `VACUUM INTO` para o backup, que **não compacta o arquivo original**. Não há `VACUUM`
  no banco vivo nem `auto_vacuum`. Espaço liberado por um `DELETE` volta para a lista de páginas livres
  do arquivo, que não encolhe.
- **ANALYZE / PRAGMA optimize**: não existe em lugar nenhum de `server/`. O planejador escolhe índice sem
  estatística. O próprio esquema registra um caso em que ele escolheu o índice errado e a seleção levou de
  2,7 a 46 s (do código, schema.ts:253-256); a correção foi criar um índice a mais, não dar estatística.

---

## 4. Repetição espaçada

### 4.1 O que existe

- **Algoritmo**: FSRS-5 escrito no projeto, sem biblioteca externa (`src/core/learning/scheduler.ts:48-150`).
  Roda no servidor para contas (`vocab.ts:25`, `:1116-1155`) e no navegador para quem não tem conta
  (`src/data/efemero/rotas/vocabulario.ts:197-214`).
- **Parâmetros**: os 19 pesos padrão do FSRS-5, fixos (`scheduler.ts:51-54`). O comentário diz
  "Fixos nesta fase; otimização = srs-fsrs-optimization". **Não há peso por usuário.**
- **Meta de retenção**: 90% por padrão (`scheduler.ts:60`); a pessoa pode escolher de 80% a 97%
  (`scheduler.ts:80-82`). A escolha fica no `localStorage` do aparelho e viaja em cada pedido de revisão
  (`src/lib/revisao/preferencias.ts:26-33`, `server/routes/vocab.ts:306`). Os jogos não mandam a meta, então
  o mesmo cartão é agendado a 90% quando a nota vem de um jogo e à meta escolhida quando vem da Revisão.
- **Cartão novo**: nasce com `box = 1` e `due_at = agora` (`vocab.ts:487-488`). Cartões ativados do Anki ou da
  Trilha podem nascer com `due_at` nulo e ficam "guardados" (`src/core/learning/resumoDosCartoes.ts:13-14`).
- **Erro**: a nota 1 marca `due_at = agora` (`scheduler.ts:137-138`). Não há passos de aprendizado
  (1 min, 10 min) nem a fórmula de revisão no mesmo dia do FSRS-5 (os pesos 17 e 18 existem na lista e não
  são usados em nenhuma função).
- **Fila da Revisão**: montada no navegador sobre o baralho inteiro (`src/components/views/Study.tsx:345-369`).
  Vencidas primeiro, da mais atrasada para a menos, e **as novas todas no fim**; ou "Misturar", que embaralha
  com `Math.random`. Limites: 20 novas e 200 revisões **por rodada**, não por dia, guardados no aparelho
  (`preferencias.ts:8-10`, `:26-33`).
- **Intercalação**: não há. Nem novas entre revisões, nem fáceis entre difíceis, nem separação de palavras
  parecidas.
- **Palavra difícil**: três réguas diferentes.
  - Na tela Cartões, "difícil" é `lapses >= 8` (`resumoDosCartoes.ts:91`). Só conta; não muda a agenda.
  - Nos jogos, 4 erros seguidos tiram a palavra do sorteio e a mandam para uma "rodada de resgate"
    (`src/core/learning/memoriaDeItens.ts:43-46`, `:53-66`). Vale só para os jogos.
  - No perfil, `palavrasDificeis` = lapsos × 3 + fração ruim × 2 + dificuldade / 10
    (`server/db/repositories/metrics.ts:287-312`).
  - Na Revisão, uma sanguessuga volta para sempre na fila de vencidas: não há suspensão nem troca de formato.

### 4.2 O que `review_logs` guarda e o que falta

Guarda (schema.ts:261-276; escrita em `vocab.ts:1137-1150`): cartão, quando, nota de 1 a 4, estabilidade antes
e depois, vencimento antes e depois, dias decorridos desde a revisão anterior.

Não guarda, e faz falta:

| Falta | Por que importa |
|---|---|
| **De onde veio a nota** (Revisão, ou qual jogo) | Uma nota de jogo (reconhecer entre 4 opções, com tempo) não mede a mesma coisa que lembrar do zero. Hoje as duas entram iguais no FSRS e no histórico. Sem a origem não dá para ajustar pesos só com as notas confiáveis, nem medir retenção por formato. |
| **Formato do cartão** (lembrar, digitar, escolha) | Idem. O formato existe só no aparelho (`preferencias.ts:14`). |
| **Tempo de resposta** | A Revisão não mede. Os jogos medem (`exercise_results.ms`), mas isso não vai para a revisão. |
| **Dificuldade antes e depois** | Só a estabilidade é gravada. Para reproduzir ou auditar a agenda falta o outro número do estado. |
| **Meta de retenção usada** e **versão dos pesos** | Sem isso, quando os pesos mudarem, o histórico antigo não diz com que régua foi agendado. |
| **Fase do cartão** (novo, aprendendo, revisão, reaprendendo) | Os otimizadores separam a primeira revisão do dia das repetições no mesmo dia. Dá para derivar de `elapsed_days`, mas custa. |

Efeito colateral a conhecer (inferência do código): cada item de jogo com `writesSrs` chama a mesma
`review()` (`src/components/views/Play.tsx:1086-1093`). Três jogos seguidos com a mesma palavra geram três
revisões com intervalo de minutos. A estabilidade quase não muda nesse caso, mas a **dificuldade muda a cada
nota**, porque `nextDifficulty` não olha o tempo decorrido (`scheduler.ts:90-95`). Jogar muito com uma palavra
a faz parecer mais fácil para o agendador do que ela é.

Outro detalhe: o perfil lê `review_logs` sem filtrar `deleted_at` (`metrics.ts:132`), enquanto `/xp` e
`/vocab/resumo` filtram. Revisão desfeita ainda conta no perfil.

### 4.3 Otimização com o histórico do usuário

Não existe. Para ter:

1. **Dado**: as colunas atuais já bastam para uma primeira versão (cartão, data, nota, dias decorridos).
   Para ser confiável, acrescentar a origem da nota e usar só a primeira nota do dia por cartão.
2. **Onde guardar os pesos**: uma linha por usuário (19 a 21 números, mais a data e quantas revisões foram
   usadas). Cabe em `estado_da_conta` ou em tabela própria. `makeFsrs5(weights, retencao)` já aceita pesos
   por parâmetro (`scheduler.ts:107-110`); o que falta é passar os do usuário em `vocab.ts:1121`.
3. **Quem calcula**: um ajuste em lote, não a cada revisão. O volume mínimo de histórico e a forma do
   otimizador são assunto do outro agente (pesquisa); aqui fica só o registro de que o encaixe no código é pequeno.
4. **Como saber se melhorou**: já dá para medir hoje. Com `prev_stability` e `elapsed_days` calcula-se a
   retenção que o FSRS previa no momento da revisão; com `grade` sabe-se se a pessoa lembrou. Comparar as
   duas por faixas é a calibração. Nenhum código faz isso ainda.
5. **Edição estática**: o ajuste teria de rodar no navegador; `RevisaoLocal` guarda menos que o servidor
   (não tem `elapsed_days` nem vencimentos, `src/data/efemero/store.ts:89-96`), mas tem data e nota, o que basta.

---

## 5. Minijogos

Chamador único: `src/components/views/Play.tsx`. Núcleo em `src/core/minigames/`.

### 5.1 Como cada jogo escolhe

- 18 jogos na tabela `MINIGAMES` (`types.ts:153-187`), com mínimo e máximo de itens.
  - De palavra (cartão): memory 4-8, wordsearch 4-8, blitz 4-20, termo 3-7, karuta 4-8, choseong 4-8,
    tenis 4-10, koffer 4-8, bao 4-6, vitendawili 4-8, shiritori 4-8, taboo 4-8, cadavre 4.
  - De frase: scramble 3-5, conectores 3-5, karaoke 3-6, escuta 4-6, ditado 3-5.
- Caminho real: o baralho inteiro vai para o navegador, é triado ali (`Play.tsx:1605-1619`), o servidor é
  consultado para compor com `jogo: 'memory'` fixo e limite 200 (`Play.tsx:1650-1673`), e a rodada é montada
  pela função pura `montarRodada` (`rodada.ts:172`).
- Jogos de palavra usam `buildItems` (`itemSource.ts:157`). O Termo tem construtor próprio (`termo.ts:314`, `:449`).
  Os de frase usam `falasNaOrdem` (`rodada.ts:325-341`) mais um construtor por jogo.
- Fontes: `baralho`, `sessao`, `trilha`, `dificeis` (`types.ts:195`).

### 5.2 O que é "dificuldade" hoje

Dois sistemas independentes.

**(a) Nível do jogo (Fácil, Médio, Difícil).** Tabela fixa por jogo (`regras.ts:129-240`). Muda só a mecânica:
tempo, número de alternativas, tentativas, vidas, pares, ajudas. **Não muda quais palavras entram.** Fica no
`localStorage`, não vai ao servidor nem é gravado com o resultado (`src/lib/jogos/nivelDoJogo.ts:16-33`).

**(b) Faixa do cartão (`difficulty_score`, 0 a 1).** Média ponderada dos sinais que existirem
(`src/core/learning/dificuldade.ts:140-201`):

| Sinal | Peso | De onde |
|---|---:|---|
| Nível CEFR (só com procedência real) | 0,35 | `cefr_level`, `cefr_source` |
| Familiaridade (ocorrências, satura em 8) | 0,25 | `occurrences` |
| Desempenho nos jogos (com suavização) | 0,25 | `exercise_results` por `card_id` |
| Chance de esquecer agora (FSRS), cresce até 3 revisões | até 0,30 | `stability`, `last_review`, `reps` |
| Tempo sem ver (satura em 90 dias) | 0,10 | `last_seen_at` |
| Comprimento da palavra | 0,05 | `word` |

- As faixas são os terços do baralho da própria pessoa; com menos de 30 cartões ou pouca dispersão, cortes
  fixos 0,34 e 0,67 (`dificuldade.ts:115-127`).
- É gravado só **depois de uma rodada**, para os cartões daquela rodada (`server/routes/exercises.ts:105-110`).
  O comentário promete também "ocorrência nova" e "a cada 7 dias" (`vocab.ts:710-712`), mas não há outro
  chamador. **Cartão nunca jogado fica com dificuldade nula.**
- **Modo Auto** (padrão): média das 3 últimas precisões no jogo, guardadas no aparelho; sobe de faixa com
  90% ou mais, desce abaixo de 70% (`autoDificuldade.ts:13-43`).
- Só no Termo a faixa do cartão muda a mecânica (tamanho da palavra e escada de tabuleiros,
  `termo.ts:202-206`, `rodada.ts:359-372`).

### 5.3 A escolha usa o estado de memória?

Em parte, e em dois lugares diferentes.

- **Servidor** (`selecionarParaJogo`, `vocab.ts:815-1000`): ordena por `due_at` no modo equilibrado, ou por
  `last_seen_at`, `occurrences`, `difficulty_score` nas outras estratégias; pega 3 vezes o limite; no
  equilibrado mistura 50% médio, 25% fácil, 25% difícil (`vocab.ts:32-55`). Estabilidade, dificuldade do
  FSRS, lapsos e repetições só entram por tabela, via `difficulty_score`. Sem sorteio.
- **Cliente** (`ordenarPorMemoria`, `memoriaDeItens.ts:119-164`), que é quem de fato ordena: camadas
  errando com janela vencida, depois vencidas no FSRS, novas, aprendendo, firmes, e por último errando ainda
  na janela. Sanguessugas ficam fora. Cota de 30% de novas. Embaralha dentro de cada camada com semente
  `jogo:dia`, então o mesmo dia dá a mesma ordem.
- Janelas de retorno do erro: 2 rodadas, 4 rodadas, amanhã (`memoriaDeItens.ts:45`).
- O histórico por item que alimenta isso vem de `exercise_results` agregado por `item_ref` e **filtrado pela
  origem atual** (`server/db/repositories/exerciseResults.ts:90-143`): erro na Trilha não é visto no baralho.

### 5.4 Intercala fáceis e difíceis?

**Não.** Não há curva dentro da rodada. A rodada começa pelo que a pessoa errou. A mistura 50/25/25 do
servidor entrega três blocos em sequência (médio, fácil, difícil; `vocab.ts:46`), e o cliente reordena por
cima. Evitar repetição existe em duas formas: as 24 referências mais recentes no `localStorage`
(`src/lib/memoriaLocal.ts:12-33`) e o corte duro de "mais uma" (`rodada.ts:234-238`). O parâmetro `evitar` da
rota do servidor existe e o cliente não o envia.

### 5.5 Quais jogos gravam nota na memória, e com que peso

Mapa em `gradeFor` (`grade.ts:26-82`). Gravam os 12 jogos com `writesSrs: true` quando o item tem `cardId`
(`types.ts:154-186`). Não gravam: scramble, karaoke, escuta, ditado, conectores, cadavre.

| Situação | Nota |
|---|---|
| Revelou ou desistiu | 1 |
| Errou | 1 (caça-palavras: 2) |
| Acertou com dica | 2 |
| Blitz e tênis | 4 se respondeu em até 3 s, senão 3 |
| Termo | 4 de primeira, 3 até 3 tentativas, senão 2 |
| Choseong e koffer | 4 de primeira, senão 3 |
| Memory | 3, 2 ou 1 conforme tentativas |
| Demais | 3 de primeira, senão 2 |

Cada nota vale **o mesmo que uma nota da Revisão**: mesma função, mesma tabela, sem marca de origem e sem peso.
Cartão embutido da Trilha não tem id no banco e não gera revisão; só os errados viram cartão
(`Play.tsx:1164-1183`).

### 5.6 Registro por item

`ItemOutcome` (`types.ts:51-79`) tem cartão, referência, acerto, tentativas, ms, dica, revelou. É gravado em
`exercise_results` por `POST /api/exercises/rodada` (`exerciseResults.ts:462-483`).

- **Gravado e usado**: acerto, referência, rodada, jogo, origem, cartão, placar, combo.
- **Gravado e não usado**: `attempts`, `hinted`. `ms` só vira "minutos".
- **Medido e descartado**: `revealed`. A duração da rodada só ajusta `created_at`.
- **Nunca gravado**: o nível do jogo e a faixa em que a rodada foi jogada. Não dá para saber depois se um
  acerto foi no Fácil com 3 opções ou no Difícil com tempo.

### 5.7 Distratores

`distractorsFor` (`itemSource.ts:353-372`): outras respostas da mesma rodada, mesmo idioma, embaralhadas com
`Math.random`. Sem critério de semelhança, classe, comprimento ou dificuldade. A Revisão pega 3 palavras
aleatórias (`Study.tsx:502-505`).

### 5.8 O que falta para um seletor único

Seleção duplicada hoje:

- `selecionarParaJogo` no servidor e o espelho `composicaoLocal` no cliente (`composicao.ts:286`), que **já
  divergem**: cartão sem dificuldade conta como "médio" no servidor (`vocab.ts:37`) e é excluído no cliente
  quando há filtro de faixa (`composicao.ts:56`, `:303`); o cliente não usa os terços do baralho.
- A régua de memória aplicada em três lugares (`itemSource.ts:199-218`, `termo.ts:498-512`, `rodada.ts:325-341`)
  e ausente no ramo de palavra falada da Trilha (`rodada.ts:404`).
- A fila da Revisão (`Study.tsx:346-368`), que não usa nada disso.
- Dois conceitos de "difícil", dois mecanismos de evitar repetição, dois eixos de dificuldade.
- `distribuirPorFonte` (`distribuicao.ts:87`) está escrita e sem chamador.

Peças que já são comuns e servem de base: `MinigameItem`, `ItemOutcome`, `RoundReport`
(`types.ts`); `EntradaDaRodada` e `RodadaMontada` (`rodada.ts:79-154`); `ordenarPorMemoria` genérico
(`memoriaDeItens.ts:119`); o filtro com espelho em SQL (`filtro.ts:25-96`); a composição com procedência por
item (`composicao.ts:92-183`); `gradeFor`; e a gravação única `POST /exercises/rodada`.

Lacunas concretas: ordem dentro da rodada por dificuldade; `attempts`, `hinted` e `ms` realimentando a
dificuldade; nível jogado gravado; memória por item sem separar por origem; `difficulty_score` para todo
cartão, não só os jogados; e uma função só, pura, que rode igual no servidor e no navegador.

---

## 6. Métricas existentes

### 6.1 Como são calculadas

| Rota | Números | Forma do cálculo |
|---|---|---|
| `GET /api/metrics/profile` (`server/routes/metrics.ts:72-100`) | sessões, palavras, baralho, revisões, acerto, tempo de fala, palavras por minuto, distribuição CEFR, 12 mais difíceis, acerto por jogo, estabilidade média, dias de prática, ofensiva, vence hoje, retenção média prevista | **Lê cinco tabelas inteiras do usuário** (sessões, cartões, revisões, falas com o texto, resultados) e soma em JavaScript (`metrics.ts:70-169`, `:191-449`) |
| `GET /api/metrics/xp` (`:109-119`) | curva de XP por dia e semana | 4 consultas; `review_logs` e `exercise_results` inteiras (`metrics.ts:839-865`) |
| `GET /api/metrics/temporada`, `/maestria`, `/missoes` | XP da janela, maestria por jogo, 3 missões | reusam as mesmas linhas; `exercise_results` inteira para maestria (`exerciseResults.ts:516-540`) |
| `GET /api/vocab/resumo` (`server/routes/vocab.ts:152-177`) | tela Cartões: vence agora, fases, previsão de 31 dias, calendário de 84 dias, retenção de 7 e 30 dias e 8 semanas, botões usados | `vocab_cards` inteira (10 colunas) e revisões dos últimos 84 dias **já agrupadas por dia no SQL** (`resumoDosCartoes.ts:110-141`). É a única rota com janela de tempo |
| `GET /api/exercises/historico` | histórico por item | todas as linhas com `item_ref`, dobradas em JS (`exerciseResults.ts:299-320`) |
| `GET /api/exercises/results` | linhas cruas | teto padrão de 200 (`exerciseResults.ts:172`) |

**Cache.** Há um cache em memória por usuário, válido enquanto a "versão dos dados" não muda
(`server/lib/cachePorVersao.ts`). A versão é um contador por usuário mantido por gatilhos em toda escrita
(migração 0032). Há também ETag em `/metrics/profile`, `/vocab/resumo` e `/exercises/historico`
(`server/lib/etagPorVersao.ts:28-38`). Limites: o cache some a cada deploy, não é compartilhado entre
processos, e **qualquer revisão ou rodada o invalida**, justamente quando a pessoa está usando. Na prática
ele serve à navegação parada, não à sessão de estudo.

**Não existe tabela de agregados por dia.** XP, nível, ofensiva e missões são recalculados dos fatos a cada
carga (`src/core/learning/xp.ts:114-150`, `src/lib/progress.ts:72-99`).

**Custo** (medido no banco sintético do usuário pesado, driver local, sem o resto do servidor):

| Consulta | Tempo (mediana de 7) |
|---|---:|
| Todas as falas do usuário (18.000 linhas) | 533 ms |
| Baralho inteiro (5.000 cartões) | 222 ms |
| Todos os resultados de jogo (8.760 linhas) | 197 ms |
| Todas as revisões, linha a linha (21.900 linhas) | 125 ms |
| As mesmas revisões agrupadas por dia no SQL | 34 ms |
| Revisões dos últimos 30 dias (contagem) | 0,6 ms |
| Vencidas agora (contagem) | 0,7 ms |

Medições do próprio projeto, menores porque usam a leitura compacta e bancos menores: perfil de 95 para 43 ms
(`docs/auditoria-performance.md:73-74`); `/xp` de 52 a 67 ms com 5.000 + 5.000 linhas (`metrics.ts:817-818`);
`/exercises/historico` 173 ms com 5.000 linhas (`server/routes/exercises.ts:25-26`).

A lição dos dois quadros é a mesma: **ler por janela ou agregado custa quase nada; ler a vida inteira do
usuário custa centenas de milissegundos e cresce todo dia.**

### 6.2 Onde aparecem para o usuário

- **Estatísticas** (`src/components/views/Estatisticas.tsx`): minutos, dias ativos, palavras novas e acerto são
  calculados **no navegador** a partir de `fetchExerciseResults()` e do baralho inteiro (`:79-112`, `:386-391`).
  Como a chamada não pede limite, o servidor devolve só as 200 linhas mais recentes: **os 90 dias do gráfico
  saem de no máximo 200 itens** (inferência do código, não testada). Ofensiva, acerto por jogo e palavras por
  nível vêm do perfil.
- **Memória dos Cartões** (`src/components/views/cartoes/Memoria.tsx`): retenção real de 30 dias, gráfico
  semanal contra a **meta**, previsão de carga, calendário de 12 semanas, botões usados, cartões por estado.
  Tudo de `/api/vocab/resumo`.
- **Perfil, Progresso** (`src/components/views/perfil/AbaProgresso.tsx`): nível, XP, Seeds, ofensiva, curva de
  XP, fluência por CEFR calculada no navegador.
- **Análise da sessão** (`src/lib/analise/metricasDaSessao.ts`): palavras por minuto, pausas, silêncio, maior
  monólogo, sobreposição, vícios de linguagem, 6 palavras-chave. Roda no navegador a cada abertura; nada é
  guardado. **Não calcula palavras novas nem cobertura.**
- Retenção média prevista e estabilidade média são calculadas e **não aparecem em tela nenhuma**; vão só para
  o contexto do chat e o relatório.

Inconsistências entre telas: "acerto" é nota 3 ou 4 no perfil (`metrics.ts:279`) e nota 2, 3 ou 4 na Memória
(`resumoDosCartoes.ts:209-226`); a ofensiva mistura o fuso do processo com o do usuário (`metrics.ts:343`, `:376`).

### 6.3 Métricas reconhecidas: o que já dá e o que pede dado novo

| Métrica | Dá com os dados de hoje? | O que sustenta ou falta |
|---|---|---|
| Retenção real | **Já existe** | `review_logs.grade`, por janela |
| Retenção real contra a prevista (calibração) | **Dá, ninguém calcula** | `prev_stability`, `elapsed_days`, `grade` já gravados |
| Palavras maduras e velocidade de aquisição (maduras por semana) | **Dá** | `review_logs.new_stability` e `reviewed_at`: a primeira vez que cruza 21 dias |
| Palavras conhecidas por nível CEFR | **Dá, só em inglês** | lista CEFR de 2.784 palavras; `fluenciaDoBaralho` já faz no cliente |
| Palavras conhecidas por faixa de frequência | **Dá nos 15 idiomas da Trilha**, em 6 faixas | as listas são por faixa, não trazem a posição exata; falta a posição por palavra para curvas finas |
| Cobertura de um texto ou vídeo pelo vocabulário conhecido | **Dá como aproximação** | `utterances.source_text` e o baralho; `src/core/harness/palavrasConhecidas.ts` já responde "ele sabe esta palavra?" (cartão maduro, lista abaixo do nível, palavras funcionais). Sem lema, subestima |
| Tempo de resposta | **Só nos jogos** | `exercise_results.ms`; a Revisão não mede |
| Acerto por formato | **Só por jogo** | falta o formato do cartão na Revisão e o nível do jogo |
| Carga futura de revisão | **Existe, simples** | conta `due_at`; não simula revisões futuras nem novas |
| Tamanho estimado do vocabulário | **Não** | pede teste amostral ou posição de frequência por palavra |
| Curva de esquecimento da pessoa | **Dá** | mesmas colunas da calibração |
| Tempo de estudo real | **Parcial** | soma de `ms` dos jogos; a Revisão não conta |

---

## 7. Listas de frequência, CEFR e lematizador

| O quê | Onde | Tamanho | Idiomas |
|---|---|---|---|
| Lista por nível (palavra para nível) | `src/data/trilha/niveis/*.json` | 893 KB no total; 20 KB (en) a 122 KB (ko) | ar, de, en, es, fr, he, hi, it, ja, ko, nl, pl, ru, sv, tr, zh (16) |
| Índice das listas | `src/data/trilha/indice.json` | 4 KB | idem |
| Escala **CEFR de verdade** | CEFR-J 1.5 e Octanove C1/C2 (`src/data/trilha/FONTES.md`) | 2.784 palavras | **só inglês** |
| Escala de **frequência** em 6 faixas | geradas por `scripts/trilha/gerar.mjs` | ~5.100 a 5.800 palavras por idioma | os outros 15 |
| Consulta do nível | `src/core/learning/cefrWordlist.ts:100-114` | — | devolve `ausente` fora da lista; nos idiomas de frequência devolve `faixa`, não `level` |
| Lematizador **na geração** das listas | `scripts/trilha/lexemes.mjs:317` (mapa forma para lema do Wikidata) | só em tempo de construção | — |
| Regras de lema **em execução** | `src/core/texto/lemas.ts` | sufixos por idioma e ~60 irregulares do inglês | declara que não é lematizador; usada para achar o verbete no dicionário ao tocar |
| "Ele sabe esta palavra?" | `src/core/harness/palavrasConhecidas.ts` | — | caderno maduro, lista abaixo do nível, palavras funcionais |
| Palavras gramaticais para extração | `src/core/learning/keywords.ts:24-55` | — | só inglês e português |

Observações:

- A consulta de nível usa a forma exata sem acento (`cefrWordlist.ts:53`). `running` não acha `run`: a
  cobertura real do CEFR sobre o baralho foi medida pelo projeto em **11,4%** (do código, `dificuldade.ts:6`).
  Um lema simples antes da consulta aumentaria isso sem dado novo.
- A coluna `vocab_cards.cefr_level` guarda o nível no momento da captura. Se a lista melhorar, os cartões
  antigos não são reavaliados.
- O mapa forma para lema do Wikidata existe nos scripts e **não é embarcado**. É a peça mais barata para
  ter lema em execução.

---

## 8. Edição estática (Cloudflare Pages)

- Não há servidor próprio. A única função é `functions/quest/stt.js` (transcrição), com um KV só para cotas
  (`wrangler.toml`).
- Os dados ficam no **IndexedDB** do navegador, banco `babel-local`, via `idb` (`src/data/efemero/store.ts:151-171`).
  Lojas: `sessoes`, `falas`, `audios` (o áudio inteiro, como `ArrayBuffer`), `cartoes` (índice por `normKey`),
  `revisoes` (índice por cartão), `exercicios`, `gastos`, `presencas`, `creditos`.
- Um "servidor em memória" responde as mesmas rotas (`src/data/efemero/servidor.ts`), então as telas não mudam.
- **Já roda no aparelho**: dedup pela mesma chave, FSRS-5, gravação de rodada, histórico por item, recordes,
  e toda a seleção de itens (a rota `/api/vocab/para-jogo` responde 501 e o cliente cai em `composicaoLocal`).
- **Falta no aparelho**: `difficulty_score` (sem ele o modo Auto deixa passar tudo e um filtro de faixa
  esvazia a rodada), a tabela de ocorrências (só o contador), a régua CEFR aplicada na entrada, `elapsed_days`
  nas revisões. As leituras são `getAll` da loja inteira seguidas de filtro em JS
  (`src/data/efemero/rotas/vocabulario.ts:180`).
- **Sem limpeza**: o áudio de cada sessão fica no IndexedDB até a pessoa apagar ou migrar para a conta.
  O navegador pode despejar tudo sob pressão de espaço.

O que da proposta teria de rodar no aparelho: o seletor único (função pura, já é o caminho natural), o cálculo
da dificuldade, os agregados diários (uma loja `dias`), a calibração e o eventual ajuste de pesos do FSRS, e a
consulta de lema e frequência (os arquivos já são servidos como estáticos). Tudo isso pede que o núcleo fique
em `src/core`, sem banco, que é como o FSRS e a dedup já estão.

---

## 9. Problemas, do maior ganho para o menor

| # | Problema | O que custa | Tipo do número |
|---:|---|---|---|
| 1 | Chave de dedup junta palavras diferentes (japonês, hindi, tailandês, russo, alemão, espanhol, português) e não há lema | Palavras que nunca viram cartão; cartões duplicados por flexão; cobertura CEFR de 11,4% | colisões medidas; 11,4% do código |
| 2 | Métricas releem a vida inteira do usuário a cada mudança | 125 a 533 ms por tabela no usuário pesado; cresce todo dia; o cache cai a cada revisão | medido (sintético) |
| 3 | Índices são metade do banco; UUID em texto em toda chave | ~21 MB de 43 MB no usuário pesado | medido (sintético) |
| 4 | `review_logs` e `exercise_results` crescem para sempre, linha a linha | 7,7 + 5,3 = 13 MB por ano no usuário pesado | medido (sintético) |
| 5 | `vocab_occurrences`: frase copiada em cada linha, 6 índices, 1 deles redundante, `utterance_id` sempre nulo | 11,8 MB; ~1,1 MB só de frase copiada; 1,4 MB do índice redundante | medido e estimativa |
| 6 | Linhas com `deleted_at` nunca saem; sem `VACUUM` nem `ANALYZE` | cresce com o uso; depende de quanto se apaga | não medido |
| 7 | Anki: o mesmo texto guardado até 4 vezes (`campos_brutos`, `frente/verso/exemplo`, cartão, ocorrência) | 990 bytes por nota; 3 MB para 3.000 notas | medido (sintético) |
| 8 | Notas de jogo entram no FSRS iguais às da Revisão, sem origem; a dificuldade do FSRS cai com repetição em jogos | agenda distorcida; histórico impróprio para ajustar pesos | inferência do código |
| 9 | Sem seletor único: duas seleções que divergem, régua de memória em 3 lugares, Revisão à parte, dois "difíceis" | comportamento diferente por jogo e por modo (com conta, sem conta) | do código |
| 10 | `difficulty_score` só existe para cartão já jogado; nível do jogo, `attempts`, `hinted` e `ms` não realimentam nada | dificuldade cega para a maior parte do baralho | do código |
| 11 | Estatísticas calcula 90 dias a partir de no máximo 200 linhas | gráfico errado para quem joga muito | inferência do código, não testada |
| 12 | `word_count` por espaço em idiomas sem espaço | palavras por minuto e XP de captura errados em ja, zh, th | do código |
| 13 | Nomes próprios, alucinação de transcrição e formas flexionadas passam pela régua | cartões de lixo que ocupam fila de novas | do código |
| 14 | Colunas mortas (`ended_at`, `utterances.status`, `phonetics`, `prev_due`, `new_due`) | poucos bytes; confunde quem lê | do código |

---

## 10. Oportunidades concretas

Esforço: P (até 2 dias), M (até 1 semana), G (mais de 1 semana). Risco de migração: o risco de mexer em dado gravado.

| # | Oportunidade | Esforço | Risco de migração | O que destrava |
|---:|---|:---:|---|---|
| A | **Corrigir a chave de dedup**: trocar NFD por NFC mais remoção só de acento latino quando o idioma permite, manter marcas de outras escritas, manter o espaço como separador. | M | **Alto**: muda `norm_key` gravado; precisa de migração de dados com detecção de colisão e de cartões que hoje estão fundidos (esses não se separam sozinhos). Fazer com cópia e relatório antes. | Japonês, hindi, tailandês e russo utilizáveis; base para o dicionário |
| B | **Dicionário único por idioma** (`lexemas`: idioma, lema, posição de frequência, nível, com chave inteira) e `vocab_cards.lexema_id`. Formas apontam para o lema usando o mapa do Wikidata que os scripts já geram. | G | Médio: tabela nova e coluna nova anulável; o preenchimento pode ser gradual. | Um cartão por lema (ou formas agrupadas), nível e frequência resolvidos uma vez, cobertura de texto, palavras conhecidas por faixa, filtro de "isto é palavra?" contra alucinação e nome próprio |
| C | **Agregados diários** (`dias_do_usuario`: usuário, dia, revisões, lembradas, novas, maduras ganhas, itens de jogo, acertos, ms, XP). Atualizados na mesma transação da revisão e da rodada. | M | Baixo: tabela nova; preencher o passado com um `INSERT ... SELECT` único. | Perfil, XP, ofensiva, calendário e Estatísticas em uma leitura de até 365 linhas pequenas, em vez de cinco tabelas inteiras; corrige o problema 11; serve à edição estática como uma loja `dias` |
| D | **Estado por item nos jogos** (`itens_de_jogo`: usuário, cartão ou referência, vezes, erros, erros seguidos, último acerto, tempo médio), atualizado a cada rodada. | M | Baixo: tabela nova derivada. | `historico` deixa de reler tudo (173 ms do código); memória por item sem depender da origem; base do seletor |
| E | **Compactar o histórico antigo**: depois de N meses, trocar as linhas de `review_logs` por um resumo por cartão (lista compacta de dia e nota) e as de `exercise_results` pelos agregados C e D. | M | Médio: apaga linha; exige C e D antes e um backup conferido. Decidir N com o agente de pesquisa (o ajuste de pesos precisa do histórico por cartão, não do agregado). | 13 MB por ano por usuário pesado viram centenas de KB (estimativa) |
| F | **Ocorrências enxutas**: preencher `utterance_id` e deixar de copiar a frase quando há fala; remover `idx_occ_user_card`; limitar a N ocorrências guardadas por cartão (o contador continua). | P a M | Baixo para o índice (confirmar com `EXPLAIN`); médio para a frase (as ocorrências antigas não têm a fala). | ~2,5 MB dos 11,8 MB (estimativa); salto da palavra para o instante do vídeo |
| G | **Completar `review_logs`**: origem da nota, formato do cartão, tempo de resposta, dificuldade antes e depois, meta usada. Colunas anuláveis. | P | Baixo: `ALTER TABLE ADD COLUMN`. | Retenção por formato, tempo de resposta, histórico próprio para ajustar pesos; decidir peso das notas de jogo |
| H | **Gravar o contexto da rodada**: nível do jogo, faixa, número de alternativas, em uma tabela de rodadas (uma linha por rodada, tirando `score` e `combo` de cada item). | P a M | Baixo se aditivo; médio se mover `score` e `combo`. | Acerto por formato; dificuldade do item comparável entre jogos |
| I | **Seletor único** em `src/core`: uma função pura "quais itens, em que ordem, em que dificuldade", com entrada (candidatos com estado de memória, histórico por item, filtro, jogo, tamanho) e saída (itens com o motivo). Servidor e navegador chamam a mesma. A Revisão passa a usá-la. | G | Nenhum em dado; alto em comportamento (precisa de testes de paridade). | Fim das divergências; intercalação fácil e difícil; a mesma lógica com e sem conta |
| J | **Dificuldade para todo cartão**: calcular `difficulty_score` na entrada do cartão e num lote preguiçoso, incluir `attempts`, `hinted`, `ms`; levar o cálculo ao modo sem conta. | M | Baixo: coluna já existe. | Modo Auto e filtro de faixa funcionam no baralho inteiro e na edição estática |
| K | **Calibração do FSRS**: calcular retenção prevista contra real a partir de `prev_stability`, `elapsed_days`, `grade`. Só leitura. | P | Nenhum. | Saber se vale ajustar pesos antes de construir o ajuste; métrica honesta para mostrar ao usuário |
| L | **Pesos do FSRS por usuário**: guardar os pesos, passá-los a `makeFsrs5`, ajuste em lote. | M a G | Baixo no dado; médio na agenda (mudar pesos remarca vencimentos). | Repetição espaçada ajustada à pessoa. Depende de G e K |
| M | **Limpeza de verdade**: tarefa diária que apaga fisicamente linhas com `deleted_at` há mais de 30 dias (filhos antes dos pais), `PRAGMA optimize` diário, `VACUUM` raro e fora do pico. | P a M | Médio: apagamento físico; a janela de 30 dias é a rede de segurança. | Banco que não cresce com o que foi apagado; planejador com estatística |
| N | **Anki enxuto**: guardar `campos_brutos` só para notas não ativadas, ou só os campos que não viraram `frente/verso/exemplo`. | P | Baixo, se a nota original não for mais necessária depois de projetada; confirmar com o dono. | ~1 MB por 3.000 notas (estimativa) |
| O | **Chaves inteiras nas tabelas novas** (B, C, D, rodadas): não repetir UUID em texto onde não há necessidade de id gerado no cliente. | embutido | Nenhum (só nas novas). | Linhas de dezenas de bytes em vez de centenas |
| P | **Contar palavras com o segmentador** no servidor (`Intl.Segmenter` existe no Node). | P | Baixo: recalcular `word_count` é opcional. | Palavras por minuto e XP corretos em ja, zh, th |

Ordem sugerida, pelo que cada passo destrava: **K e G** (baratos, só acrescentam e medem), **C e D**
(tiram o peso das métricas e preparam a compactação), **M** (para o banco parar de reter o apagado),
**A** (com cuidado, porque mexe em dado), **I e J** (seletor e dificuldade), **B** (dicionário), **E e L** por último.

---

## 11. O que não vale a pena otimizar agora

- **Trocar os UUIDs em texto das tabelas existentes por inteiros.** É o maior ganho em bytes no papel, mas
  exige recriar todas as tabelas, todas as chaves estrangeiras, a migração do modo sem conta e a exportação.
  Com poucos usuários o banco inteiro cabe em megabytes. Usar chave inteira só nas tabelas novas.
- **Tirar a tradução das falas para uma tabela de frases únicas.** As falas são quase todas diferentes entre si;
  a deduplicação renderia pouco e custaria uma junção em toda leitura de sessão.
- **Comprimir texto dentro do SQLite.** O backup já é comprimido; no banco vivo complica leitura e busca.
- **Sair do SQLite ou particionar por usuário.** Nada medido aqui pede isso.
- **Remover `box` e as colunas Leitner.** Poucos bytes, e são a rede de reversão documentada.
- **Colunas mortas pequenas** (`ended_at`, `utterances.status`, `phonetics`). Custam um byte por linha quando
  nulas. Remover junto com alguma migração que já recrie a tabela, não por si.
- **Os índices das chaves estrangeiras** (migração 0034). Parecem duplicados, mas evitam varreduras medidas
  de 15 s ao apagar (do código, schema.ts:243-245). Mexer só com `EXPLAIN` na mão.
- **Cache mais esperto para o perfil.** Com os agregados diários (C) o problema some; investir no cache antes
  disso é trabalho jogado fora.
- **`cache_de_traducao`, `usage_counters`, `convidados`, `marcas_de_teste`.** Já têm poda diária.
- **Ajuste de pesos do FSRS antes da calibração (K).** Primeiro medir se os pesos padrão erram para os
  usuários reais; pode ser que não valha o esforço ainda.

---

## Anexo: como o banco sintético foi montado

Script: `C:/Users/Guilh/AppData/Local/Temp/e2e-babel/auditoria-dados/medir2.mjs`. Aplica as migrações de
`server/db/migrations` num arquivo novo e insere, para um usuário: 50 sessões, 18.000 falas (12 palavras de
texto e 13 de tradução), 5.000 cartões com frase, 15.000 ocorrências com frase, 21.900 revisões, 8.760 itens de
jogo, 1 baralho Anki com 3.000 notas. Os tamanhos vêm de `dbstat` depois de um `wal_checkpoint(TRUNCATE)`;
os tempos são a mediana de 7 execuções pelo driver `@libsql/client` local. O texto é inglês sintético: frases
reais em outras escritas ocupam mais bytes por caractere (UTF-8), então os números de `utterances` e
`vocab_occurrences` são um piso para japonês, hindi, árabe e afins.

Partes deste levantamento (seções 5 e 6) vieram de dois agentes de leitura auxiliares e foram conferidas por
amostragem; os itens que eles marcaram como não confirmados estão indicados no texto como inferência.
