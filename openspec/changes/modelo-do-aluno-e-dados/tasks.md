# Tarefas

> Revisão de 25/11/2026 (main `897c9d25`). **[D]** = depende do dono; **[R]** = navegador ou aparelho real. Cada tarefa tem "Verificar:".
> Nenhuma fatia começa sem o sim do dono. Em toda fatia: `npm run typecheck`, `npm run typecheck:estrito`, `npm run lint` e os testes dos arquivos tocados
> (a suíte inteira roda na CI). Fatia que mexe em dado gravado: backup, ensaio numa cópia do banco, contagem antes e depois, reversão escrita.
>
> O que mudou desde 10/10: (1) a produção é POSTGRES (PG), não mais SQLite/libsql com Litestream; os números do levantamento (43,2 MB, 533 ms)
> foram medidos em SQLite sintético e precisam ser refeitos em PG antes de justificar qualquer fatia; as migrações citadas (0052, 0053) viraram o
> baseline PG (`server/db/migrations-pg/`, hoje até a 0031). (2) A aba Baralhos virou a ficha de conteúdo. (3) O PR #202 zerou `BONUS_RAPIDO`
> (`src/core/minigames/grade.ts`) até decisão do dono: relacionado a D.1 (o que premia o jogo), sem efeito nas tarefas abaixo. (4) A privacidade
> exige o mesmo parecer dos anúncios para o tempo de resposta (D.4).

## 1. Medir sem mudar comportamento (feito em 10/10/2026)

Só o servidor com conta grava os campos novos; a edição estática (IndexedDB) continua gravando a revisão de antes.

- [x] 1.1 `review_logs` ganha origem, formato, tempo de resposta (`resposta_ms`), meta usada e retenção prevista; colunas nulas para o passado. Nota 25/11: o cliente da revisão ainda não envia `respostaMs` (ver `cartoes` 3.7)
- [x] 1.2 Rodada de jogo grava o nível jogado e a fonte
- [x] 1.3 Relatório de calibração do FSRS por usuário, só leitura, no admin (`server/db/repositories/calibracao.ts`, `GET /api/admin/calibracao/:id`)
- [x] 1.4 Testes de gravação e de calibração com histórico sintético

## 2. Agregados e limpeza (feita em 10/10/2026, com ressalvas)

- [x] 2.1 Tabela de agregados diários (`agregados_diarios`, `estado_dos_agregados`; `server/db/repositories/agregados.ts`), preenchida na escrita e reconstruível do bruto
- [ ] 2.2 `/api/metrics/*` e a Memória dos Cartões leem dos agregados. A Memória e `/api/metrics/profile` (total, acertos, dias) já leem. Faltam `/xp`, `/temporada`, `/missoes`, `/maestria` e as falas do perfil. **[D]** Decisão pendente: mudar o balde para o dia do usuário ou guardar por rodada. Verificar: teste de igualdade com a conta antiga (mesmos números para um histórico sintético) e tempo da rota medido em PGlite e em Postgres real (`TESTE_POSTGRES_URL`)
- [x] 2.3 Estado por item nos jogos (`estado_por_item`, `server/db/repositories/palavrasVistas.ts`). Ninguém lê ainda para decidir seleção (ver 3.x)
- [x] 2.4 Tarefa diária de limpeza: apagamento físico do que tem `deleted_at` antigo (`LIMPEZA_RETENCAO_DIAS`, `server/lib/limpezaDiaria.ts`). Nota 25/11: `PRAGMA optimize`, checkpoint do WAL e Litestream eram do SQLite; em produção PG o autovacuum cuida, e a passada só roda `ANALYZE` no PGlite
- [ ] 2.4b Orçamento de tamanho por usuário na CI de carga, agora em PG. Verificar: o job de carga falha se um usuário sintético pesado passar do teto combinado; teto registrado em `docs/`
- [x] 2.5 Medir antes e depois (SQLite sintético). Refazer em PG junto com 2.2

## 3. Seletor único (risco médio, sem migração)

Nota 25/11: ainda não existe `src/core/selecao/`. Existe a régua de memória de itens (`src/core/learning/memoriaDeItens.ts`), `dificuldade.ts` e `forcaDoCartao.ts`, e `writesSrs` por tipo de exercício (`src/core/minigames/types.ts`). O PR #205 não toca nisso.

- [ ] 3.1 `src/core/selecao/`: uma definição de "difícil", uma régua de memória, uma função que devolve itens, ordem e dificuldade; caracterização do comportamento atual ANTES de trocar. Verificar: `npx vitest run tests/caracterizacao` com os snapshots da seleção atual (revisão e 9 jogos) verdes antes e depois
- [ ] 3.2 A Revisão usa o seletor (limites por dia vêm de `cartoes` 2.1; novas pela carga prevista). Verificar: teste com 300 vencidas e limite 20 novas; ordem e quantidade iguais às do cliente antigo para o mesmo estado
- [ ] 3.3 (aberta: espera o polimento `polimento-movimento`, 3.1 da onda 3) Os jogos usam o seletor, no servidor e na edição estática; some a divergência cliente x servidor. Verificar: teste de paridade (`paridade-sql-predicado`) com o mesmo acervo nos dois lados
- [ ] 3.4 Regra de jogo x memória: só recordação sem alternativas conta como revisão; reconhecer não mexe na agenda; erro sob pressão de tempo não vira lapso; um efeito por palavra por dia. Nota: o campo `writesSrs` por tipo existe; falta o mapa por jogo revisto e o limite por dia. **[D]** D.2. Verificar: teste por jogo (reconhecer não grava em `review_logs`; recordar grava uma vez por palavra por dia)
- [ ] 3.5 Elo por palavra e por usuário com desconto de chute; dificuldade para todo cartão, não só os jogados. Verificar: teste de convergência com respostas sintéticas e de que chute em 4 alternativas pesa 1/4
- [ ] 3.6 Dificuldade adaptativa dos jogos atrás de flag NASCIDA DESLIGADA, com a medida de acerto e de abandono por rodada. **[D]** D.1. Verificar: flag semeada desligada em migração; com ela desligada nada muda (teste); com ela ligada o acerto médio de um aluno sintético fica na faixa alvo

## 4. Métricas na tela (depois do 2 e do protótipo aprovado)

- [ ] 4.1 As três da tela principal e as nove da Memória, com a definição e a frase da pesquisa. Verificar: teste de componente (cada número tem definição acessível); nada de percentual sem base mínima
- [ ] 4.2 Cobertura de um vídeo ou texto pelo vocabulário conhecido, dita como "você conhece X% das palavras". Verificar: teste com texto sintético; o texto nunca diz "você entende X%"
- [ ] 4.3 Agrupamento por fonte no padrão do catálogo de fontes. Hoje já existe a ficha de conteúdo; reaproveitar. Verificar: teste das contagens por fonte iguais às de `GET /api/vocab/conteudo`

## 5. Corrigir a chave de dedup (risco alto: dado gravado)

Nota 25/11: o defeito continua. `chaveDaPalavra` (`src/core/texto/palavra.ts`) tira acento e marcas (NFD), então `año`=`ano`, `schön`=`schon`, `avó`=`avô`; a chave `lang|palavra` está gravada em `vocab_cards.norm_key`. O servidor e o modo anônimo já usam a mesma `chaveDedup`.

- [x] 5.1 (feito em 25/11, decisão assumida: recomendação a do item 14, 25/11. `chaveDaPalavraV2`/`chaveDedup(..., 2)` em `src/core/texto/palavra.ts`: es mantém til, pt circunflexo, til e cedilha (agudo e grave caem: `Água`=`agua`), de trema, fr grave, circunflexo, trema e cedilha; escritas não latinas mantêm toda marca (menos vogais árabes e hebraicas). É refinamento da v1 (teste), então a reescrita nunca junta cartões. Flag `chave_dedup_v2` NASCE DESLIGADA, migração PG 0039 e SQLite 0078, PROVISÓRIAS: o integrador renumera) Chave nova por idioma que MANTÉM acentos e marcas que distinguem palavras (es, pt, de, fr; kana, hindi, tailandês, cirílico), com a tabela de colisões de hoje como teste. **[D]** Verificar: `npx vitest run tests/chave-dedup-por-idioma.test.ts` (novo) com `año`/`ano`, `schön`/`schon`, `avó`/`avô`, `がっこう`/`かっこう` distintos e `Água`/`agua` ainda iguais em pt
- [ ] 5.2 Ensaio numa cópia do banco do dono: quantos cartões se separam, quantos mudam de chave. **[D]** Pronto o comando: `node dist-server/operacao.cjs chave-de-duplicata` (ensaio por padrão: conta `mudam`, `iguais`, `conflitos`, `foraDoPadrao`, por idioma, e `comProvaDeFusao`). Ensaio em PGlite com teste feito (`tests/integration/chave-de-duplicata.test.ts`). Falta rodar na CÓPIA do banco do dono e escrever o relatório em `docs/auditoria/` **[D]**; medir tempo e contagem em Postgres real (`TESTE_POSTGRES_URL`) **[B]** Verificar: relatório em `docs/auditoria/` com contagens antes e depois
- [ ] 5.3 (código e teste feitos; aplicação em produção **[D]**: parar o app, `pg_dump`, ensaio, `chave-de-duplicata --aplicar --backup-feito`, `flags ligar chave_dedup_v2`, subir o app; volta: desligar a flag e `--para 1 --aplicar --backup-feito`; cartão que colide na volta fica como está e é relatado. Separar cartões fundidos por engano NÃO foi feito: o ensaio só conta os com ocorrência que prova a fusão, decisão do dono. Ida e volta em Postgres real **[B]** aberta) Migração PG com backup e reversão; cartões fundidos por engano voltam a ser dois só quando há ocorrência que prove. Só EXPAND mais reescrita de `norm_key` em lotes. **[D]** Verificar: `npx vitest run tests/integration/schema-pg-baseline.test.ts`, ensaio de ida e volta em Postgres real, contagem de cartões e de revisões igual antes e depois
- [ ] 5.4 (aberta: a edição estática não tem flag remota; ligar com `VITE_`, como `recompensas_v2`, e migrar o IndexedDB reusando `planejarReescritaDeChaves`, que já é pura em `src/core/texto/reescritaDeChaves.ts`. Fica `chaveDedup` com versão 1 por padrão no cliente) A mesma regra na edição estática (IndexedDB), com migração local. Verificar: teste de paridade servidor x anônimo (`chaveDedup` única)

Lacunas conhecidas da fatia 5 (ligada a flag): `palavras_marcadas.chave` e `palavras_vistas.chave` seguem na chave comparável v1 (sem marcas), então a contagem `comCartao` de `palavrasMarcadasRepo` (`lang|chave` contra `norm_key`) não enxerga cartão de palavra com til/trema/circunflexo enquanto a flag estiver ligada; `historico` já usa a palavra crua. Resolver antes de ligar a flag em produção.

## 6. Dicionário e forma base (risco alto)

- [ ] 6.1 Dicionário por idioma com forma base e faixa de frequência (embarcar o mapa do Wikidata que já existe nos scripts; conferir licença e tamanho por idioma). Verificar: licença registrada por idioma e tamanho dentro do orçamento de bundle
- [ ] 6.2 Cartões e ocorrências apontam para o dicionário; ocorrência aponta para a fala em vez de copiar a frase. Verificar: migração ensaiada, `utterance_id` preenchido, a retenção zero preservada (a fala some com a sessão)
- [ ] 6.3 Contagem de palavras conhecidas por forma base. Verificar: `run`, `runs`, `running` contam uma
- [ ] 6.4 Anki enxuto: o texto da nota guardado uma vez (toca `anki_notes.campos_brutos`; combinar com `motor-anki-mapeador`). Verificar: tamanho do banco de um baralho de 50 mil notas antes e depois

## 7. Compactar e ajustar (por último)

- [ ] 7.1 Histórico bruto por 180 dias; o resto vira (palavra, dia, nota). Só depois de 2 em produção. Verificar: contagem de revisões e retenção iguais antes e depois, nos agregados
- [ ] 7.2 Pesos do FSRS por usuário, no máximo uma vez por mês, só se a calibração de 1.3 mostrar ganho. Substitui `cartoes` 8.3. Verificar: log-loss do previsto x real melhora em histórico sintético e em contas reais autorizadas

## Decisões do dono

- [ ] D.1 **[D]** Alvo de acerto dos jogos (proposta: 80 a 90%) e se a dificuldade adaptativa nasce ligada (regra do projeto: flags nascem desligadas)
- [ ] D.2 **[D]** Jogo de reconhecer deixa de mexer na agenda (hoje mexe em alguns jogos)
- [ ] D.3 **[D]** Prazo do apagamento físico (proposta: 30 dias depois de apagar; já implementado como `LIMPEZA_RETENCAO_DIAS`)
- [ ] D.4 **[D]** Guardar tempo de resposta (dado de comportamento; não usado em anúncio nem em perfil; parecer de privacidade junto com o dos anúncios)
- [ ] D.5 **[D]** Dois botões como padrão na Revisão (o hábito de usar "difícil" para "esqueci" é o que mais atrapalha o algoritmo)
