- [x] 1.1 `rotas-sem-consumidor.mjs` com 0 orfas
- [x] 1.2 as seis rotas sem tela registradas com a razao
- [x] 1.3 passo novo no `ci.yml`

## As seis rotas sem tela (nenhuma removida)

| rota | por que fica |
|---|---|
| `DELETE /api/ai/credentials/:id` | **lacuna de produto**: o funil tem `listCredentials` e `createCredential` e nenhuma funcao de apagar — quem cola uma chave de IA nao consegue remove-la. Servidor pronto e coberto. Vai para a Fase 4 |
| `GET /api/vocab/distribuicao-dificuldade` | a distribuicao por faixa nao tem tela; o dado so passou a existir quando `recalcularDificuldade` ganhou gatilho |
| `GET /api/vocab/:id/ocorrencias` | a linha do tempo de "onde eu vi esta palavra" existe e nenhuma tela a abre |
| `GET /api/anki/imports/:id` | a importacao de hoje e sincrona; o ledger existe para a assincrona que `motor-anki-*` planeja |
| `POST /api/ai/llm/chat/completions` | o adapter do navegador fala direto com o provedor; esta rota e o unico caminho que usa o segredo cifrado no servidor (achado A52, mantido pela mesma razao) |
| `GET /api/sessions/:id/capa` | a Biblioteca renderiza a `data:` URI direto; esta rota serve a capa como binario, e a otimizacao nunca foi ligada |
