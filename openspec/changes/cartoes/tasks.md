> Revisão de 25/11/2026 (main `897c9d25`). **[D]** = depende do dono; **[R]** = navegador ou aparelho real. Cada tarefa aberta tem "Verificar:".
> O que mudou desde 10/10: a aba "Baralhos" saiu (commit `48c1a4ca`, 11/10) e deu lugar à FICHA DE CONTEÚDO (`src/components/conteudo/`, seletor único
> de fonte para Cartões, Jogar e Biblioteca); hoje a tela tem as abas Hoje e Palavras, com Memória e "Trazer e levar" fora da faixa de abas (`Cartoes.tsx`).
> A revisão enxuta (`revisao-enxuta.md`) cobre grande parte do bloco 3. O Anki saiu do servidor para o navegador (ver `motor-anki-mapeador`). Nenhum dos PRs
> #201, #202, #205 e #206 toca esta change; o #202 (bônus de velocidade zerado) é dos jogos, não da revisão.
> Regra de produto: limite diário de revisão é PREFERÊNCIA DE ESTUDO da pessoa, não cota de plano; qualquer teto por plano mora só em `src/core/planos.ts`.

## 1. Fatia 1: a tela, a porta e o que já tem dado real (10/10/2026)

- [x] 1.1 `GET /api/vocab/resumo` com ETag por versão (`server/db/repositories/resumoDosCartoes.ts`, contrato em `src/core/learning/resumoDosCartoes.ts`), teste de integração e cliente (`src/data/rotas/cartoes.ts`)
- [x] 1.2 Rota `/cartoes` com as abas no endereço; a revisão em `/cartoes/estudar[/<sessão>]`; `/revisar` e `/vocabulario` levam ao lugar novo
- [x] 1.3 Aba Hoje com os estados pelo dado real (`lib/cartoes/estadoDeHoje`), retenção da semana, previsão de 7 dias, "Só 10 agora", "Mais N novas" e "Nasceu da legenda"
- [x] 1.4 Baralhos: Tudo, por idioma, por sessão, Trilha e Anki, com as três contagens. Hoje pelo seletor de conteúdo (a aba saiu em 11/10)
- [x] 1.5 Aba Palavras: o catálogo que já existia, embutido
- [x] 1.6 Trazer e levar: `.apkg` com o relatório do que veio e do que não veio; os formatos de levar
- [x] 1.7 Memória: retenção contra a meta, previsão de 30 dias, calendário de 12 semanas, botões usados, cartões por estado
- [x] 1.8 Navegação: trilho, barra de cinco com "Praticar", ladrilho fixo no Início, selo do dia
- [x] 1.9 Testes de unidade, de componente e de navegador; prova lado a lado (`scripts/polimento/roteiros/cartoes-*.json`)

## 2. Confiança na revisão (limites e opções na conta)

- [x] 2.1 (feito 25/11 na branch `onda2/cartoes-bloco-2`; o contador vem de `agregados_diarios` no fuso gravado, sem tabela nova: `GET /api/vocab/opcoes-da-revisao` devolve `hoje`; a rodada desconta o feito do dia, `lib/revisao/opcoesNaConta.ts`; testes em `tests/caracterizacao/vocab-opcoes-da-revisao.test.ts`) Limite diário de verdade no servidor: novas por dia e revisões por dia, com contador por dia no fuso da pessoa, guardado na conta (hoje cortam cada rodada e ficam em `localStorage`, `src/lib/revisao/preferencias.ts`). Verificar: teste de integração (duas rodadas no mesmo dia somam; virada de dia no fuso zera; conta nova não herda) e `npx vitest run tests/caracterizacao` sem rota solta
- [x] 2.2 (feito em dev 25/11, decisão assumida: recomendação 11 de `decisoes-do-dono.md` "sim", 25/11; tabela `opcoes_da_revisao`, migração PG 0035 PROVISÓRIA, só EXPAND, reversível com `DROP TABLE` e testada em `tests/integration/opcoes-da-revisao-migracao.test.ts`; na exportação e na exclusão de conta; o integrador renumera. **[D] ABERTO: aplicar em produção com backup (pg_dump) e ensaio na cópia do banco.**) Opções da revisão na conta (meta de retenção, limites, ordem, formato), valendo em todos os aparelhos. Migração PG nova, só EXPAND, e entra na exportação e na exclusão de conta. **[D]** (mexe em dado gravado). Verificar: `npx vitest run tests/integration/schema-pg-baseline.test.ts` e teste de dois aparelhos com a mesma conta
- [x] 2.3 (feito 25/11: a barra "N de total novas" da faixa usa o feito de hoje do servidor e o estado "Você chegou ao limite de hoje" da pilha; sem contador, volta ao que entra na fila) Cartão "Teto de hoje" da aba Hoje e o teto da pilha, com o contador real de 2.1. Verificar: teste de componente com contador em 0, no meio e no teto; nenhum número inventado
- [x] 2.4 (feito 25/11: `core/learning/filaDaRevisao.ts`; o cartão volta depois de 4 outros ou no fim, até 2 vezes, como cópia que não grava nota) Quem erra revê na mesma sessão (passos de aprendizagem ou fim da fila), sem mudar o agendamento FSRS. Verificar: teste da fila (cartão errado volta antes do fim; a nota Errei grava uma vez só)
- [x] 2.5 (feito 25/11: aviso no primeiro erro, no fim da rodada com "Tentar de novo" e confirmação do navegador ao fechar; nada fica guardado depois) Aviso quando a nota não foi gravada (sem rede), com nova tentativa. Hoje existe a linha "Sem rede" que reenvia só com a tela aberta. Verificar: teste com `fetch` falhando e voltando; nada fica guardado depois de fechar a tela (retenção zero)
- [ ] 2.6 "Estudo livre" como escolha explícita, fora da agenda; fim do baralho inteiro como padrão quando nada vence. Verificar: teste de componente; a rodada livre não muda data de vencimento

## 3. A revisão melhorada (`cartoes2.js`)

Feita em 10/10/2026 na VERSÃO ENXUTA (`cartoes-enxuto-src`), com Minha voz, a cena no verso e as práticas: o que entrou, o que cada prática grava e o que ficou de fora estão em `revisao-enxuta.md`.

- [x] 3.1 A fala original da sessão no cartão (`vocab_occurrences.utterance_id`), a frase destacada, "Abrir na sessão"
- [ ] 3.2 Formatos novos (lacuna) e alternar a frase a cada revisão. Nota 25/11: "Completar" existe como prática (`lib/revisao/pratica.ts`), mas não como formato da revisão. Verificar: teste do seletor de formato (cartão com frase e lacuna válida alterna; sem frase fica no formato normal)
- [x] 3.3 Modo de dois botões como opção (quatro continuam o padrão). A decisão D.5 de `modelo-do-aluno-e-dados` pergunta se dois vira o padrão
- [x] 3.4 Gestos no celular: tocar vira, deslizar dá nota, segurar abre as ações
- [x] 3.5 Fim da rodada com as palavras que mudaram de estado e "virar jogo" com as mesmas
- [ ] 3.6 Bandeira. Enterrar até amanhã e informações do cartão (sem a tabela de revisões) estão feitos; a bandeira exige campo novo no cartão. **[D]** Verificar: só se o dono pedir; senão marcar como descartada
- [ ] 3.7 Tempo medido por cartão. Nota 25/11: o servidor já tem `review_logs.resposta_ms` (change `modelo-do-aluno-e-dados`, tarefa 1.1), mas `Memoria.tsx` e `Hoje.tsx` ainda dizem que o app "não mede" tempo. **[D]** (D.4: tempo de resposta é dado de comportamento, fora de anúncio e de perfil). Verificar: o cliente envia `respostaMs` por nota, a Memória mostra o tempo médio só com 10 ou mais respostas e o texto "não mede" some

## 4. Baralhos e recortes

Nota 25/11: a aba Baralhos foi substituída pela ficha de conteúdo; os itens foram relidos para o desenho de hoje.

- [x] 4.1 Recorte por idioma, por baralho do Anki, pela Trilha e por sessão ("Revisar este"): coberto pelo seletor de conteúdo (`src/components/conteudo/SeletorDeConteudo.tsx`, `lib/conteudo/`) e pelas contagens `GET /api/vocab/conteudo`. Verificar: `npx vitest run tests/baralhosAnki.test.tsx`
- [x] 4.2 (feito 28/11, flag `estudo_palavras_v2` (PG 0051, SQLite 0090), nasce DESLIGADA; branch `onda2/palavras`, 28/11/2026: `GET /api/vocab/memoria-por-baralho` (retenção dos últimos 90 dias e menor `due_at` por idioma, sessão, baralho do Anki e Trilha; `server/db/repositories/memoriaPorBaralho.ts`), regra dos 20 em `core/palavras/memoriaDoBaralho.ts`, tabela "Por fonte" na Memória; testes `tests/caracterizacao/vocab-memoria-por-baralho.test.ts` (dois baralhos, 80% e sem número com 5 revisões) e `tests/palavras-memoria-do-baralho.test.ts`)) Retenção e próxima revisão por baralho (na ficha ou na Memória). Verificar: teste de `resumoDosCartoes` com dois baralhos de retenção diferente; sem número com menos de 20 revisões
- [ ] 4.3 Opções por baralho (entrar na revisão, novas por dia, prioridade), Mapa do conteúdo e Curadoria. Depende de 2.2. Verificar: teste de integração (baralho desligado não entra na fila de Hoje nem em Jogar)
- [x] 4.4 (feito 28/11: o recorte por baralho já existia ("Exportar" do menu da fonte, `levar(fonte)`) e a seleção também (`aoExportar` da aba Palavras); faltava a prova, em `tests/palavras-exportar-baralho.test.ts` (só as notas do baralho, ida e volta no `lerApkg`). Sem código novo de UI, por isso sem flag)) Exportar um baralho ou uma seleção. Nota: "Enviar selecionados" ao Anki aberto (`anki-connect`, arquivada) e a exportação `.apkg` existem; falta o recorte por baralho. Verificar: teste de exportação de um baralho (só as notas dele, ida e volta no `lerBaralho`)

## 5. Sanguessugas e pilha acumulada

- [ ] 5.1 Baralhos "Difíceis" e "Suspensas"; aviso de palavra difícil com as três saídas. Nota 25/11: "Difíceis" já é uma fonte do seletor (Hoje mostra o atalho) e as suspensas são contadas na Memória; falta o aviso na revisão com as saídas (limite fixo em 8 erros, ver 8.2). Verificar: teste do aviso (8 erros mostra as três saídas; "Descansar 30 dias" grava só `adiarAte`)
- [ ] 5.2 Saídas da pilha: espalhar pelos próximos dias, adiar as que aguentam esperar, sem novas até zerar. Verificar: teste da função pura (pilha de 300 vencidas vira N por dia respeitando 2.1; ordem estável; nenhum cartão perdido)
- [ ] 5.3 "Só as difíceis" na aba Hoje (o atalho já aparece quando há difíceis). Verificar: teste de componente com 0 e N difíceis

## 6. Navegador de cartões

- [x] 6.1 (feito 28/11, flag `estudo_palavras_v2` (PG 0051, SQLite 0090), nasce DESLIGADA; branch `onda2/palavras`, 28/11/2026: `GET /api/vocab/pagina?estados=` (nova, aprendendo, revisao, hoje, dificeis, suspensa; um OU outro, E com etiqueta; ignorado com a flag desligada) e, na aba Palavras, "Suspensas" na linha dos estados e filtro por etiqueta; teste `tests/caracterizacao/vocab-pagina-estados.test.ts`)) Filtros por estado, baralho, sessão, idioma e etiqueta. Nota 25/11: a aba Palavras já filtra por etiqueta e força (`GET /api/vocab/pagina`, change arquivada `vocab-forca-e-etiquetas`) e o seletor cobre baralho, sessão e idioma; falta o filtro por estado num lugar só. Verificar: teste de integração da página com estado + etiqueta
- [x] 6.2 Etiquetas do usuário (`PUT /api/vocab/:id/etiquetas`, `GET /api/vocab/etiquetas`, change arquivada `vocab-forca-e-etiquetas`)
- [x] 6.2b (feito 28/11 em PARTE, flag `estudo_palavras_v2` (PG 0051, SQLite 0090), nasce DESLIGADA; branch `onda2/palavras`, 28/11/2026: `POST /api/vocab/lote` (suspender, retomar e etiquetar, até 50 ids, tudo ou nada, posse por `user_id`, 404 igual para id de outra conta e id inexistente) e a barra da aba Palavras (Suspender em um pedido só, Etiquetar); exportar já existia. **"Mover" NÃO foi feito:** o baralho de um cartão é a origem dele (idioma, sessão, Anki, Trilha), não um campo; precisa de decisão do dono sobre baralhos do usuário. Testes `tests/caracterizacao/vocab-lote.test.ts`, `tests/palavras-lote.test.ts`)) Seleção em massa: suspender, mover, etiquetar, exportar. Verificar: teste de integração (lote de 50 ids, só da conta; id de outro usuário dá 404 sem vazar)
- [x] 6.3 (feito 28/11, flag `estudo_palavras_v2` (PG 0051, SQLite 0090), nasce DESLIGADA; branch `onda2/palavras`, 28/11/2026: a folha já tinha as ocorrências ("De onde veio · N lugares") e a fala original; entrou "Perguntar ao tutor" no "…", só onde o tutor responderia (conta; perfil protegido só com conta liberada; a resposta do tutor passa pelo filtro de saída do servidor), abrindo o tutor com a pergunta no campo (evento `babel:perguntar-ao-tutor`, a pessoa envia); testes em `tests/palavras-v2-gaveta-busca-cobertura.test.tsx`)) A folha da palavra com todas as ocorrências, a fala original e "Perguntar ao tutor". O tutor para menor passa pelo filtro (`filtro-tutor-menores`). Verificar: teste de componente; perfil protegido sem o botão quando o tutor está bloqueado
- [ ] 6.4 **[D]** Decidir o destino das três abas de análise do Vocabulário (hoje dentro de "Palavras"). Verificar: decisão registrada

## 7. Anki

- [ ] 7.1 Mapear campos: é a change `motor-anki-mapeador` (reescrita em 25/11). Verificar: aquela change fechada
- [x] 7.2 (feito 25/11: `lerBaralhoParaImportar` e `enviarBaralhoLido`; o fluxo do Anki mostra a prévia e só envia em "Trazer"; e2e `cartoes.e2e.ts` ajustado e NÃO rodado aqui [R]) Ler o arquivo sem gravar, para o relatório vir antes de trazer (separar "ler" de "enviar" em `src/data/importarAnki.ts`). Verificar: `npx vitest run tests/baralhoAnkiImport.test.tsx tests/importarAnki-lotes.test.ts` e nenhuma requisição ao servidor antes da confirmação
- [x] 7.3 (feito 25/11: linha "Colar uma lista" em Trazer e levar; o texto vira `.txt` em memória e segue o fluxo do arquivo; parser com aspas em `core/anki/texto.ts`) Colar uma lista e CSV avulso (o leitor já aceita `.txt/.csv/.tsv`; falta colar). Verificar: teste do parser de lista (duas colunas, vírgula e tabulação, aspas, linha vazia)
- [x] 7.4 (feito 28/11 em PARTE, flag `estudo_palavras_v2` (PG 0051, SQLite 0090), nasce DESLIGADA; branch `onda2/palavras`, 28/11/2026: desativar e apagar já existiam em "Gerenciar baralhos" (com o selo "desativado"); o "…" de Cartões ganhou a linha "N baralhos do Anki desativados" que leva a ele (o catálogo só lista baralho com cartão na revisão, então o desativado sumia). O e2e de desativar tira da fila e dos jogos **[R]** não foi escrito aqui; testes de componente em `tests/palavras-v2-cartoes.test.tsx`)) Baralhos do Anki desativados na lista, e desativar e apagar no desenho novo. Verificar: e2e (desativar tira da fila e dos jogos sem apagar; apagar remove notas e cartões do baralho)

## 8. Sequência e memória avançada

- [ ] 8.1 Sequência com congelamento na aba Hoje (o mapa por dia de prática e de congelamento, que o servidor calcula e não expõe) e no calendário. Verificar: teste do contrato `resumoDosCartoes` com um dia congelado; a tela não promete congelar o que o servidor não congela
- [ ] 8.2 Ajustes da memória avançados: passos, dias leves, limiar de difícil (hoje fixo em 8), lembrete por revisão vencida. O lembrete é notificação para público com menores: só com consentimento e sem texto de pressão (`copy-br-etica`). Verificar: teste do limiar configurável; revisão do texto com a skill `copy-br-etica`
- [ ] 8.3 Otimizar os parâmetros com o histórico; FSRS-6. É a tarefa 7.2 de `modelo-do-aluno-e-dados`; fazer lá. Verificar: lá

## 9. Descoberta do resto ("Mapa das portas", `cartoes3.js`)

- [ ] 9.1 Importar único, "Exportar" único, tecla "?" com os atalhos. Verificar: teste de componente e e2e do atalho "?" (`aria-keyshortcuts`)
- [x] 9.2 (feito 28/11, flag `estudo_palavras_v2` (PG 0051, SQLite 0090), nasce DESLIGADA; branch `onda2/palavras`, 28/11/2026: a busca global acha ações de estudo, baralhos (sessões, Anki, Trilha) e as telas de Cartões, e a palavra abre na própria lista (`lib/palavras/abrirPalavra.ts`); regra em `core/palavras/buscaAmpliada.ts`; testes `tests/palavras-core-v2.test.ts` e `tests/palavras-v2-gaveta-busca-cobertura.test.tsx`)) Busca ampliada (abre a palavra, acha ações, baralhos e as telas que ficavam de fora). Verificar: teste da função de busca com palavra, ação e baralho
- [ ] 9.3 Tutor no "Mais", idioma da interface no "Mais", as portas plantadas na Biblioteca, na Sessão, no Intérprete e na Ajuda. Conflita com `polimento-movimento`; fazer depois dele. Verificar: e2e em 1280, 768 e 375
- [x] 9.4 (feito 28/11, flag `estudo_palavras_v2` (PG 0051, SQLite 0090), nasce DESLIGADA; branch `onda2/palavras`, 28/11/2026: as abas Cartões e Jogos de "Praticar" mostram vencem-hoje e palavras da fonte da ficha (`core/palavras/contagensDasAbas.ts`); o seletor de conteúdo já mostrava as contagens por fonte; teste com `GET /api/vocab/conteudo` mockado em `tests/palavras-v2-cartoes.test.tsx`)) Contagens nas abas de "Praticar" e no seletor de conteúdo. Verificar: teste com `GET /api/vocab/conteudo` mockado

## Notas do bloco 2 (25/11/2026, branch `onda2/cartoes-bloco-2`)

- Decisões assumidas (recomendação de `docs/backlog/decisoes-do-dono.md`, item 11, 25/11): só o bloco 2 mais pontas do Anki; opções de revisão na conta (migração nova); quatro botões como padrão.
- Migração PG **0035 `opcoes_da_revisao` provisória**: o integrador renumera se outra frente tomar o 0035 (journal, snapshot e `tests/integration/schema-pg-baseline.test.ts` acompanham). Sem par SQLite (tabela só do Postgres, em `TABELAS_SO_DO_POSTGRES`).
- O limite do dia conta as notas do dia (a primeira de cada cartão é "nova"; as demais, "revisões"), inclusive as dadas em jogos. A volta de um cartão errado não grava nota e não conta.
- Aberto: **9.3** espera `polimento-movimento`. **[D]** aplicar a 0035 em produção (backup + ensaio na cópia). **[R]** e2e do Anki com prévia (`tests/e2e/cartoes.e2e.ts`) e a barra do teto em aparelho real.
