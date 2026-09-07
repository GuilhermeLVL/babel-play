## 1. Decisao e inventario

- [ ] 1.1 Pergunta 4 respondida em `design.md` (manter a leve?)
- [ ] 1.2 Tabela rota → (a) paridade | (b) 501 explicado, para todas as chamadas de `api.ts`, `apiAnki.ts`, `me.ts`, `carteira.ts`, `uso.ts`, `entitlements.ts`

## 2. Rotas

- [ ] 2.1 Implementar no efemero: `GET /metrics/xp`, `GET /vocab/para-jogo` (ordenacao + cortes sobre IndexedDB), `GET /vocab/pagina`, `GET /vocab/inicio-da-contagem`, `DELETE /vocab/:id`
- [ ] 2.2 `GET /sessions/utterances/all`, `relabel`: 501 explicado na tela (nao excecao)
- [ ] 2.3 `CatalogoDePalavras` e `AbaProgresso` mostram o convite de conta em 501, nunca o status HTTP

## 3. Perfil compartilhado

- [ ] 3.1 `src/core/learning/perfil.ts`: funcao pura (linhas → AppMetrics) usada por `computeProfile` e por `metricas` do efemero
- [ ] 3.2 `listeningMs`, `palavrasDificeis`, `cromasComprados`, `aprimoramentos`, `capturaMinutos`, `idiomas` iguais nos dois; `teto: null`

## 4. Chave de dedup unica

- [ ] 4.1 `src/core/texto/chave.ts` (`chaveDaPalavra`, `chaveDedup(lang, palavra)`); efemero e `vocab.ts:74` a usam
- [ ] 4.2 Teste: para 200 palavras com acento/pontuacao, efemero e servidor produzem a mesma chave

## 5. Edicao leve

- [ ] 5.1 `/perfil` e `/plano` na leve redirecionam ao hub com aviso
- [ ] 5.2 `vite.config.ts` trata `mode === 'leve'` e valida `VITE_EDICAO`
- [ ] 5.3 `tests/paridade-anonima.test.ts` + `npm test` verde
