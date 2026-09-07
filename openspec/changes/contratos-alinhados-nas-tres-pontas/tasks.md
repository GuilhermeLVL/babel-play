> **Escopo entregue nesta rodada.** As tarefas abaixo foram feitas nos pontos que a auditoria mediu como QUEBRADOS (A19-A23, A30, A62): o que devolvia dado errado, o que respondia 400 para um filtro legitimo, o que duplicava na migracao e o que trafegava peso a toa. A parte que a proposta escreve como "schemas Zod de RESPOSTA para as ~41 rotas, e um teste de contrato por rota" NAO foi feita por inteiro — ver 1.1 e 5.2. Cada item diz o que ficou.

## 1. Tipos em um lugar

- [ ] 1.1 Schemas Zod de RESPOSTA para todas as rotas consumidas. **Nao feito, deliberadamente.** Seriam ~41 schemas espelhando o que os repositorios ja devolvem, com o risco de o schema virar uma segunda descricao que diverge da primeira — o defeito que esta change existe para consertar, numa camada nova. O que foi feito no lugar: o vocabulario que os tres lados discordavam passou a ser DECLARADO uma vez em `src/core/learning/contract.ts` (estado da nota Anki, filtro, cursor de paginacao) e importado por cliente, schema Zod e repositorio. E os testes de contrato (5.1) comparam as formas REAIS das duas pontas, que prende sem duplicar.
- [x] 1.2 `rowToVocabCard` espalha a linha (`...row`) antes de traduzir o que muda de nome. Ela enumerava campo a campo e por isso descartava `occurrences`, `difficultyScore`, `cefrSource` e `lastSeenAt` — que `Play.tsx` lia por `cast` e recebia `undefined`. Os quatro entraram em `VocabCard` e os quatro `cast` sairam do ponto de uso; o `cast` era o sintoma do contrato incompleto.
- [x] 1.3 `PATCH /vocab/:id` e `POST /vocab/:id/review` devolvem a mesma forma de `GET /api/vocab`, com procedencia (`daTrilha`, `daAnki`, `baralhosAnki`) — antes era a linha crua, entao editar a traducao de um cartao importado fazia a procedencia SUMIR na tela e a regua de qualidade voltava a medi-lo como fala capturada. Novo `vocabRepo.procedenciaDe`.

## 2. Envelope de erro

- [x] 2.1 `server/lib/respostaDeErro.ts`: `{ error: string, code?, detalhes? }`. `error` e sempre TEXTO — era objeto aninhado no `erroGlobal`, o unico handler que o cliente nao sabia ler. Convertidos: `erroGlobal`, `corpoDeRecusa` (armazenamento) e as recusas de economia (preco divergente, saldo insuficiente, conquista nao cumprida), que eram os que carregavam campos avulsos no topo. As demais rotas ja respondiam `{ error: string }`, que e o envelope sem `code` — nao foram reescritas por reescrever.
- [x] 2.2 `lerErro(res)` em `src/data/api.ts` devolve `{ status, error, code, detalhes }`. `gastarSeedsEx` propaga o motivo; `gastarSeeds` continua para quem so quer saber se deu certo. A tela de jogos passa a dizer "faltam N seeds" em vez de "nao consegui gastar as seeds agora".
- [x] 2.3 IChat: `motivoDaResposta(res, data)` separa plano insuficiente (402), payload grande (413), excesso de chamadas (429), sem modelo local e erro desconhecido. Antes o bloco nao olhava `res.ok` e mandava todo mundo instalar o Ollama, inclusive quem so precisava assinar.
- [ ] 2.4 `erroDeRota` logar `warn` em 4xx e `error` so em 5xx. **Nao feito:** `erroDeRota` nao recebe o status (quem o chama e que escolhe o codigo), entao mudar isso exige passar o status em ~40 chamadas. Fica para `servicos-sem-duplicata`, que ja mexe nessa camada.

## 3. Anki

- [x] 3.1 Cursor OPACO (`valor:id`) num parametro so, definido em `contract.ts` (`cursorDeNotas`/`lerCursorDeNotas`). Eram dois parametros no servidor e uma string no cliente: a tela mandava `[object Object]`, nunca mandava o `cursorId`, e a segunda pagina repetia a primeira para sempre. O repositorio aceita a string opaca — quem pagina devolve o que recebeu, sem conhecer a forma.
- [x] 3.2 Vocabulario unico em `contract.ts`: `ESTADOS_DE_NOTA_ANKI` (o que a coluna guarda) e `FILTROS_DE_NOTA_ANKI` (os estados mais o recorte derivado `descartada`). `descartada` nao e estado — e `motivo_descarte` preenchido —, e o repositorio passou a filtrar assim; filtrar por ela respondia 400. A tela ganhou o filtro "Ausentes no arquivo", que existia no banco e nao era oferecido, e o selo da linha passou a sair do `motivoDescarte` (a comparacao `estado === 'descartada'` era sempre falsa, entao a nota recusada aparecia como "arquivada", sem o motivo).
- [ ] 3.3 `ImportAnkiResposta` com `avisoIdioma`/`estruturaHash` e remocao de `lerBaralhoAnki`/`LeituraAnki`. **Nao feito:** e remocao de codigo morto, que e o objeto de `codigo-morto-removido` (onda 5), e o aviso de idioma depende da tela de import, que `motor-anki-mapeador` esta reescrevendo.

## 4. Efemero e sessao

- [x] 4.1 O efemero honra `origemLocalId` e devolve `jaExistia`. O campo era ignorado: a mesma operacao tinha garantias diferentes conforme o modo, e a migracao de anonimo para conta — que e exatamente o caminho que repete a chamada — duplicava tudo do lado de ca. Varredura simples em vez de indice novo no IndexedDB, porque o modo sem conta tem teto de 5 sessoes.
- [x] 4.2 `aliviarMeta` em `GET /sessions/:id` e nos tres PATCH que devolvem a sessao. A listagem ja trocava a capa `data:` embutida por `/api/sessions/:id/capa`; abrir UMA sessao baixava a capa inteira em base64 dentro do JSON, e cada edicao de titulo devolvia o mesmo peso.

## 5. Testes de contrato

- [x] 5.1 `tests/contratos/sessoes.test.ts`: o MESMO corpo contra o handler do Express (via `router.stack`) e contra `servidorEfemero`, comparando FORMAS (chaves e tipos), nao valores. Prende a idempotencia nas duas pontas.
- [ ] 5.2 Cobrir as ~41 rotas. **Nao feito:** uma suite por rota e trabalho de outra ordem de grandeza, e o valor esta concentrado onde as pontas de fato divergiram. O arquivo de sessoes deixa o molde (`forma()`, `noExpress`, `noEfemero`) pronto para as proximas — `modo-anonimo-em-paridade` (onda 4) e a change que tem esse escopo, e agora tem por onde comecar.
- [x] 5.3 `npm test` (2.840) e `npm run typecheck` verdes. Tres testes antigos afirmavam as formas ANTIGAS de erro (`body.preco`, `body.falta`, `corpo.error.code` aninhado) e foram atualizados para o envelope, com o porque escrito neles.
