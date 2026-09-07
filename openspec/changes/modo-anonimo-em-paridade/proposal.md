## Why

O servidor efemero (`src/data/efemero/servidor.ts:632-657`) e a implementacao de referencia do modo anonimo e da edicao leve, e diverge do Express em pontos que mudam o que o usuario ve (achados A24, A25, A26, A40 de `openspec/audits/2026-09-07-coerencia.md`):

- Nao espelha `GET /api/metrics/xp` (`me.ts:90`), `GET /api/vocab/para-jogo` (`composicao.ts:360`; `compor` cai sempre no fallback local), `/vocab/pagina`, `/vocab/inicio-da-contagem`, `/sessions/utterances/all`, `DELETE /vocab/:id`. `relabel` e `utterances/all` lancam excecao; o catalogo de palavras mostra "501 Not Implemented".
- Nao emite `listeningMs`, `palavrasDificeis`, `cromasComprados`, `aprimoramentos` (o Express emite): tempo com o idioma subestimado e recorte "dificeis" vazio.
- `chaveDedup` (`servidor.ts:90`) e diferente da do servidor (`repositories/vocab.ts:74`) apesar do comentario "mesma chave": dedup anonima e pos-migracao discordam.
- Aceita `amount`/`xp` do cliente em gastar/creditar (`:436-476`) — tratado em `seeds-e-creditos-fonte-unica`.
- Edicao leve: `/perfil` renderiza vazio (`App.tsx:873`, `navItems.ts:141`, `identidade.ts:25`) e `/plano` renderiza cobranca sem backend (`App.tsx:876`).
- `vite.config.ts:44` nao trata `mode`; a leve so existe por `.env.leve`.

## What Changes

- Cada rota consumida pelo cliente tem no efemero (a) implementacao com a mesma forma, ou (b) 501 `EXIGE_CONTA` com texto na tela que diz "isto precisa de conta" — nunca `HTTP 501` cru nem excecao. A lista das rotas (a)/(b) e fechada nesta change e presa por teste.
- `computeProfile` e o `metricas` do efemero compartilham a mesma funcao pura do core sobre linhas (`src/core/learning/perfil.ts`), de modo que os campos sao iguais por construcao.
- `chaveDedup` movida para `src/core/texto/chave.ts` e usada pelos dois lados (e por `trilha.ts`, `quality.ts`, `cefrWordlist.ts` — ver `servicos-sem-duplicata`).
- Leve: `/perfil` e `/plano` redirecionam para o hub com aviso; `vite.config.ts` reconhece `mode === 'leve'` explicitamente e falha se `VITE_EDICAO` divergir.
- Decisao da pergunta 4 (manter a leve) registrada em `design.md`; se a resposta for "nao", esta change remove a leve em vez de espelhar.

## Capabilities

### New Capabilities
- `paridade-anonima`: o modo anonimo responde a toda rota do cliente com a mesma forma do Express ou com um 501 explicado.

## Impact

- `src/data/efemero/servidor.ts`, `src/data/efemero/store.ts`, `src/core/learning/perfil.ts` (novo), `src/core/texto/chave.ts` (novo), `server/db/repositories/{metrics,vocab}.ts`
- `src/App.tsx` (rotas na leve), `src/lib/rotas.ts`, `vite.config.ts`, `src/components/views/vocab/CatalogoDePalavras.tsx`, `src/data/api.ts` (501 tratado)
- Novo `tests/paridade-anonima.test.ts` (tabela de rotas x comportamento)
- Remove: `chaveDedup` local do efemero; ramos de fallback silencioso

## Pronto quando

`tests/paridade-anonima.test.ts` percorre a lista de rotas do cliente e prova, por rota, ou paridade de forma (via os testes de contrato) ou 501 com `codigo` e texto de UI; `tests/contratos` passam com o efemero; `chaveDedup` tem uma implementacao; na leve, `/perfil` e `/plano` nao renderizam tela vazia (teste de componente).

## Dependencias e paralelismo

Depende de `contratos-alinhados-nas-tres-pontas` (formas) e de `seeds-e-creditos-fonte-unica` (autoridade compartilhada). Paralelizavel com `idioma-alvo-e-ui-respeitados` e `replica-sem-estado-local-e-config-completa`.
