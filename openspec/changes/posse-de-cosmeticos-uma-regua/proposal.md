## Why

Hoje ha tres reguas de posse que discordam entre si e nenhum portao nos setters (achados A10-A16, A04, A63 de `openspec/audits/2026-09-07-coerencia.md`):

- G1 `estadoDoItem` (`src/lib/loja.ts:105-126`), G2 `desbloqueado` (`src/lib/desbloqueios.ts:83-89`), G3 `estaDesbloqueadoNoCofre` (`src/core/catalogoMestre.ts:3729-3742`, ignora `liberadoTudo`, saldo e premium). Um item premium possuido e "equipavel" na Loja e "bloqueado" no Cofre.
- Todo setter grava `localStorage` sem checar posse: `theme.ts:175-199`, `particulas.ts:68,141,233,244`, `cursores.ts:165`, `rastroDoMouse.ts:169`, `suitesTematicas.ts:761-822` (`aplicarSuiteTematica` muda 8 subsistemas). `PUT /api/settings` persiste tema/cores validando so a forma (`server/routes/settings.ts:13-26`).
- Posse em `localStorage` sem reconciliacao: `babel.conquistas` (`conquistasPosse.ts:8-20`) nunca lida de `seed_credits`; `babel.premium_possuidos` nunca atualizada quando `!authRequired` (`carteira.ts:36`).
- 31 ids coincidem entre `CATALOGO_DA_LOJA` e `CATALOGO_MESTRE` sobre a mesma chave `babel.loja_possuidos`; `drops.ts:232` grava posse de item da loja (~1.750 Seeds de graca no anonimo; apagado no `/profile` na conta, `App.tsx:431`).
- 47/128 itens do Cofre nao tem canal de obtencao (`desafio` 23, `tempo` 20, 4 `conquistaId` inexistentes) e a UI mostra "Como obter" (`GaleriaDoCofre.tsx:655-659`).
- `GamificacaoHub.tsx:22-42` recebe `comprar`/`comprarComCreditos` e nao usa; `ABAS_QUE_EXIGEM_CONTA` (`exigeConta.ts:20-30`) sem chamador; abas `progressao`/`recompensas` fora de `ABA_DA_LOJA` geram `/loja/undefined` (`rotas.ts:88-108`, `Play.tsx:2528`, `Loja.tsx:503`); `/creditos` cai no Cofre.

## What Changes

- **Um catalogo, ids unicos.** `CATALOGO_DA_LOJA` e `CATALOGO_MESTRE` viram um unico catalogo em `src/core/catalogo/` com namespace por origem (`loja:`, `cofre:`), um tipo e uma funcao de acesso. Itens sem canal de obtencao saem ou ganham canal implementado (pergunta 8 do relatorio decide; sem decisao, saem).
- **Uma regua.** `estadoDoItem` e a unica funcao que responde "possui / pode equipar / o que falta", com entradas explicitas (nivel, saldo, conquistas do servidor, premium do servidor, posse da loja); G2 e G3 sao removidas.
- **Chokepoint nos setters.** `equiparItem(id)` e o unico caminho que grava aparencia; `persistTheme`, `setCursor`, `setParticulas`, `setRastro`, `setPack`, `aplicarSuiteTematica` passam a ser privados ou chamam `equiparItem`. `PUT /api/settings` valida a posse do tema/paleta contra `seed_spends`/`seed_credits`/`credit_spends` do usuario.
- **Posse vem do servidor.** `computeProfile` devolve `conquistas` (de `seed_credits reason like 'conquista:%'`) e `premium`; `localStorage` e cache hidratado, nunca fonte. Em `!authRequired` (self-host/leve) a fonte e o efemero.
- **Rotas da loja em um vocabulario.** `ABA_DA_LOJA` e `ALIAS_DE_ABA` fundem em `rotas.ts`; toda aba emitida por `Play`/`Loja` existe la; `/creditos` abre a compra de creditos; `abaExigeConta` e aplicada ou removida (decisao registrada).
- `ResumoDaRodada` recebe o nivel real; `registrarFimDePartida` roda em toda rodada, nao so em "ver erros".

## Capabilities

### New Capabilities
- `posse-uma-regua`: um catalogo, uma regua, um chokepoint de equipar, posse servida pelo servidor.

### Modified Capabilities
- `gating-da-galeria` (change `galeria-gating-fechado`): o requirement "todo caminho de aplicar passa pela regua" passa a valer para setters e para `PUT /api/settings`, nao so para a UI.

## Impact

- `src/core/catalogo/` (novo; absorve `core/loja.ts` e `core/catalogoMestre.ts`), `src/lib/loja.ts`, `src/lib/desbloqueios.ts`, `src/lib/galeria/{acesso,equipar,progressao,restaurar}.ts`, `src/lib/{theme,particulas,cursores,rastroDoMouse,suitesTematicas,appearance,drops,conquistasPosse,carteira}.ts`
- `server/routes/settings.ts`, `server/db/repositories/{metrics,seedSpends,credits}.ts`, `server/validation.ts`
- `src/lib/rotas.ts`, `src/components/views/Loja.tsx`, `gamificacao/GamificacaoHub.tsx`, `gamificacao/shared/GaleriaDoCofre.tsx`, `MontadorDeEstiloDeck.tsx`, `minigames/ResumoDaRodada.tsx`, `src/components/conta/exigeConta.ts`
- Remove: `desbloqueado`/`EXCLUSIVOS_DE_CONQUISTA` (desbloqueios.ts), `estaDesbloqueadoNoCofre`, `ALIAS_DE_ABA`, itens do Cofre sem canal, `ICONES_SUITE_LUCIDE` sem alvo (18 chaves), `babel.equipado.*` duplicando `app_theme`

## Pronto quando

- Teste de invariante: nenhum id repetido entre origens do catalogo; todo item tem canal com implementacao (nivel, seeds, conquista existente, premium, drop).
- Teste por setter: equipar item nao possuido e recusado em `equiparItem` e nenhum setter e exportado publicamente fora dele.
- `tests/integration/settings-posse.test.ts`: `PUT /api/settings` com tema nao possuido responde 403 com o que falta.
- `tests/rotas.test.ts`: toda aba emitida por `Play`/`Loja` resolve para URL valida; `/creditos` abre compra.
- `acessoGaleria`, `galeria`, `loja`, `desbloqueio`, `cofreGameplay`, `equipar`, `progressao`, `cromas` verdes apos reescrita para a regua unica.

## Dependencias e paralelismo

Depende de `linha-de-base-verde` (qual UI sobrevive) e da pergunta 8. Nao paralelizavel com `seeds-e-creditos-fonte-unica` (mesmos arquivos de economia); paralelizavel com `contratos-alinhados-nas-tres-pontas`, `jogos-culturais-dentro-do-sistema`, `idioma-alvo-e-ui-respeitados`.
