## Why

A pergunta 4 da auditoria de 2026-09-07 era a única sem saída barata: manter a edicao leve obriga a
escrever cada funcionalidade duas vezes; encerrar remove uma superficie inteira. **O dono decidiu
encerrar em 07/09**, depois da explicacao dos dois custos.

O que a decisao pesou, medido antes:

| superficie | tamanho |
|---|---|
| ramos `EDICAO_LEVE` | 47, em 12 arquivos |
| arquivos exclusivos | 4 (`edicao.ts`, `OnboardingLeve.tsx`, `TranscricaoLeve.tsx`, `functions/api/rank`) |
| infra propria | `.env.leve`, `wrangler.toml`, `deploy-pages.yml`, `functions/api/[[path]].ts` |
| testes so dela | `tests/edicao-leve.test.tsx` + um caso em `card-de-planos` |

E o fato que decidiu: **ela nunca foi publicada.** `deploy-pages.yml` nasceu desarmado
(`workflow_dispatch`, sem `CLOUDFLARE_API_TOKEN` nem `CLOUDFLARE_ACCOUNT_ID`) e nunca foi disparado.
O proxy `functions/api/[[path]].ts` respondia 503 "API ainda nao publicada". Encerrar nao tira nada
do ar porque nada estava no ar.

O custo continuo, esse era real e ja tinha cobrado: cada change de economia desta rodada teve de ser
escrita duas vezes, e a secao 5 de `modo-anonimo-em-paridade` estava parada ha semanas esperando
exatamente esta resposta.

## What Changes

- `EDICAO_LEVE` sai, e com ela `src/lib/edicao.ts`. Os 47 ramos passam a ter o comportamento da
  edicao completa — que e o unico que sobra.
- Saem `OnboardingLeve` (a completa passou a perguntar os dois idiomas, mudanca
  `idioma-alvo-e-ui-respeitados`) e `TranscricaoLeve` (a mesma preferencia ja tem seletor na tela de
  Captura, que existe nas duas edicoes).
- Sai a infra do Cloudflare: `wrangler.toml`, `functions/`, `.env.leve`, `deploy-pages.yml`,
  `build:leve`.
- **O RANKING GLOBAL VEM JUNTO, em vez de sumir.** Era a unica funcionalidade que so a hospedagem
  do Pages servia (Function + D1), e a tela ja o anunciava. Ele vira `/api/rank` no Express, com as
  mesmas regras e o mesmo contrato — o cliente nao muda uma linha.
- O `ip` em claro que o D1 guardava vira `ip_hash`: a trava de um envio por minuto continua, o
  identificador de rede nao fica.

## Capabilities

### New Capabilities
- `uma-edicao-so`: existe UM build. O que muda por ambiente e configuracao, nao um segundo produto.

### Modified Capabilities
- `modo-anonimo`: o modo sem conta continua e passa a ser o unico caminho "sem servidor" — ele nao
  era a edicao leve, e sobrevive a ela.

## Impact

- Remove: `src/lib/edicao.ts`, `src/components/{OnboardingLeve,TranscricaoLeve}.tsx`,
  `wrangler.toml`, `functions/**`, `.env.leve`, `.github/workflows/deploy-pages.yml`,
  `tests/edicao-leve.test.tsx`, o script `build:leve`
- Toca: `src/App.tsx`, `shell/{navItems,ControlCluster}`, `views/{Hub,Settings,LiveCapture}`,
  `CardDePlanos`, `data/efemero/servidor.ts`, `gateway/{profiles,sttRouter}`,
  `lib/{identidade,supabase,ranking}`, `index.css`
- Adiciona: `server/routes/rank.ts`, `server/db/repositories/rank.ts`, migration `0027`, tabela
  `rank`, `CHAVE_DE_HASH` em `server/crypto.ts`

## Pronto quando

Nenhuma ocorrencia de `EDICAO_LEVE` ou `VITE_EDICAO` no repositorio; o ranking responde no Express
com teste que cobre ordenacao, deduplicacao por apelido, tetos, trava de flood e a ausencia do IP;
suite e e2e verdes.

## Dependencias e paralelismo

Destrava a secao 5 de `modo-anonimo-em-paridade`, que esperava esta decisao. Nao depende de nada.
