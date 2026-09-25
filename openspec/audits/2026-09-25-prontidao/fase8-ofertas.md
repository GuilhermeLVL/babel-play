# Prontidão para produção — Fase 8: comunicação de planos (25/09/2026)

Branch `feat/ofertas-de-planos` (worktree `.claude/worktrees/fx-ofertas`, a partir de
`auditoria/prontidao-producao`). Escopo: banners, avisos, modal e paywall de planos, com flags,
frequência e medição de conversão. A Fase 7 (modo convidado: auth anônima, cotas, antiabuso,
`MenuDaConta`/`FaixaDaConta`) é de outro agente e **não foi tocada**; daqui só se consome o evento
`babel:oferta` que ela dispara.

Guia de operação: [`docs/ofertas.md`](../../../docs/ofertas.md).

## 0. Ponto de partida (Fase 1 e 6b)

- `CardDePlanos` no Hub: dispensa em `localStorage`, mas a variante de armazenamento (> 90%)
  **ignorava a dispensa** e voltava a cada abertura do Hub.
- `AvisoDeConta` (marcos de conta, uma vez cada), `GateDeConta`, `CartaoDeConvite`: sem mudança.
- Adaptadores de nuvem (`serverLlmMt`, `groqWhisper`): o 402 pausava a nuvem **em silêncio** — a
  pessoa via a tradução piorar sem saber que a cota tinha acabado.
- Flag `oferta_planos` (Fase 6b) desligada, com payload de 4 gatilhos, tipos em `src/core/ofertas.ts`
  e zod em `server/lib/ofertas.ts` — **nenhum consumidor**.
- Sem métrica nenhuma de conversão.

## 1. O que foi feito

| # | Entrega | Arquivos |
|---|---|---|
| 1 | **Motor puro** — flag, planos-alvo, "não mostrar novamente", tela ocupada (adia), teto global (3 min, 1/sessão, 30 min), frequência por gatilho (`maxPorDia`, `maxPorSemana`, `intervaloMinHoras`). Flag desligada = só os funcionais embutidos | `src/lib/ofertas/motor.ts`, `src/core/ofertas.ts` (`GATILHOS_FUNCIONAIS`, `MOMENTOS_FUNCIONAIS`, eventos do funil, `variante` opcional) |
| 2 | **Momentos**: 402 `quota_exceeded` → `fim_de_cota`; 402 com `entitlement` / tutor `managed_requires_plan` → `modelo_premium`; consumo ≥ 80% → `cota_proxima` (cache 1 h); conquista ao **fechar** a celebração; fim de sessão depois de **salvar** a captura e ao **sair** do Jogar com rodada fechada; convidado pelo evento da Fase 7 | `src/lib/ofertas/{eventos,cota}.ts`, `serverLlmMt.ts`, `groqWhisper.ts`, `IChat.tsx`, `App.tsx`, `Play.tsx`, `sessaoDeCaptura.ts` (`capturaAtiva()`) |
| 3 | **Componentes** no desenho atual: cartão (banner/aviso de cota, o desenho do `AvisoDeConta`), modal (casca dos diálogos de "Sua assinatura", Esc/X/clique fora, foco na ação, "Agora não" e "Não mostrar novamente"); comparação = a tela de **Planos** existente com o plano sugerido destacado (sem duplicar); host único no `App` | `src/components/ofertas/*`, `ui/Dialogo.tsx` (`fecharNoFundo`), `views/Planos.tsx`, `src/lib/ofertas/destaque.ts` |
| 4 | **Instrumentação anônima**: `oferta_exibida/dispensada/nao_mostrar/clicada`, `checkout_iniciado`, `assinatura_concluida` → `POST /api/metricas/ofertas` → `oferta_eventos_total{evento,gatilho,componente}` e `oferta_eventos_por_plano_total{evento,plano_atual,plano_sugerido,variante}`. Atribuição do checkout à última oferta clicada (24 h); assinatura conta uma vez | `src/lib/ofertas/instrumentacao.ts`, `server/routes/metricasOfertas.ts`, `server/http/metricas.ts`, `server/http/app.ts`, `Checkout.tsx`, `Assinado.tsx`, `efemero/nucleo.ts` (`PASSAM_DIRETO`) |
| 5 | **CardDePlanos respeita a dispensa**: variante de armazenamento volta no máximo 1×/7 dias depois de qualquer dispensa, com "Não mostrar novamente" | `src/components/CardDePlanos.tsx` |
| 6 | Docs + i18n (12 chaves `en`, `xx` e cobertura regenerados) + contrato da API (`POST /api/metricas/{captura,ofertas}` entraram no censo) | `docs/ofertas.md`, `docs/flags.md`, `public/i18n/*`, `scripts/testes/_rotas-do-servidor.mjs`, `tests/contratos/api-contrato.json`, `tests/seguranca/matriz-de-rotas.test.ts` |

## 2. Decisões

- **Funcionais × promocionais.** Fim de cota e cota próxima são INFORMAÇÃO: valem com a flag
  desligada (textos embutidos, frequência própria) e não entram no teto global. Todo o resto é
  promocional e depende da flag. Gatilho da flag para um momento funcional substitui o embutido.
- **Tela ocupada adia, não descarta.** Captura (`capturaAtiva()`), rodada (`body[data-jogo-ativo]`) e
  qualquer `dialog[open]` adiam; o host tenta de novo a cada 5 s e no `babel:rodada-fechou`, por até
  10 min. Um 402 no meio de uma aula vira aviso **depois** do STOP.
- **Convidado → conta antes de plano.** Para o convidado a única promocional é
  `convidado_para_conta`; os avisos de cota levam a criar conta.
- **Pro nunca vê venda.** Vê o aviso funcional de cota com a ação "Ver consumo do mês".
- **Comparação não foi duplicada.** O componente `comparacao` é o cartão cuja ação abre `Planos` com
  contorno de acento + selo "Sugerido para você" no plano sugerido (recado de uma vez em
  `sessionStorage`); para o Pro, abre direto na aba de consumo.
- **Cardinalidade fechada no `/metrics`.** `gatilho` e `variante` só assumem ids que existem (embutidos
  + payload atual da flag, via o cache de 30 s de `server/lib/flags.ts`); o resto vira `outro`. Campos
  extras (ex.: `userId`) são descartados pelo validador.
- **Métrica também sem conta.** `/api/metricas/ofertas` entrou em `PASSAM_DIRETO`: é anônima por
  desenho e a conversão convidado → conta é a que mais importa medir. Respeita "Métricas de uso
  anônimas" e conta de menor restrita.
- **`variante` opcional no payload** (zod + tipo), para A/B sem mudar código.
- **Sem migration.** Nada novo no banco: histórico de frequência mora no aparelho; métricas são
  contadores em memória.

## 3. Testes (TDD)

| Arquivo | Casos |
|---|---|
| `tests/ofertas-motor.test.ts` | 31 — cada regra de frequência, não mostrar novamente, tela ocupada (captura/jogo/diálogo), 3 min, teto da sessão, intervalo global, planos-alvo, flag desligada só funcionais, histórico |
| `tests/ofertas-host.test.tsx` | 13 — flag desligada; modal: nome acessível, rótulos, foco na ação, Esc, clique fora, não mostrar novamente, CTA com destaque; 1 por sessão; rodada e diálogo abertos adiam; convidado → login; banner Esc; Pro → consumo |
| `tests/ofertas-eventos.test.ts` | 7 — classificação dos 402; Tradutor IA e STT disparam o momento sem consumir o corpo |
| `tests/ofertas-instrumentacao.test.ts` | 8 — lote no contrato do servidor, sem identidade, consentimento, lotes de 20, atribuição, assinatura 1×, 24 h |
| `tests/ofertas-cota.test.ts` | 3 — limiar, cache de 1 h, rota fora |
| `tests/integration/metricas-ofertas.test.ts` | 7 — contrato, `outro`, evento vira métrica no `/metrics` real, 400, 204 com e sem token |
| `tests/card-de-planos.test.tsx` | +5 — armazenamento respeita dispensa, 7 dias, dispensa comum conta, não mostrar novamente |

## 4. Gates

Rodados na worktree depois do merge da base (`7d3d168`, observabilidade da Fase 5):

| Gate | Resultado |
|---|---|
| `tsc --noEmit` | 0 erros |
| `eslint src server server.ts tests --max-warnings 0` | 0 |
| `vitest run --maxWorkers=3` | 463 arquivos / 4871 testes passam; **6 falhas de ambiente** conhecidas (subprocesso `tsx`): `cluster.test.ts` (2), `desligamento-gracioso.test.ts` (3), `teto-de-erros-entre-instancias.test.ts` (1) — as mesmas antes desta fase |
| `npm run i18n:orfas` | 0 órfãs; `pseudo --check` e `cobertura --check` em dia (799 chaves); piso de `t()` ok |
| `npx vite build` | ok |
| `madge --circular` | nenhum ciclo |
| `contrato-api.mjs` | 99 rotas, nenhuma removida (+`POST /api/metricas/captura`, +`POST /api/metricas/ofertas`) |
| `tests/contratos`, `tests/seguranca` | verdes (matriz de rotas com a justificativa da rota pública nova) |
| `rotas-sem-consumidor` / `rotas-sem-caracterizacao` | mesmo resultado da base (2 órfãs de `/api/admin/flags` e `GET *`, pré-existentes) |
| Migration | nenhuma criada |

## 5. Pendências e riscos

- **E2E de planos** (`tests/e2e/planos-pagamento.e2e.ts`): não rodou — o `webServer` do Playwright (`npm run dev:local`) não sobe nesta
  worktree (`MODULE_NOT_FOUND`: os binários vêm do `node_modules` do diretório pai). Nenhum seletor
  do fluxo de checkout mudou (só o evento `checkout_iniciado` depois do link de pagamento e o selo
  "Sugerido para você", que só aparece com o recado da oferta).
- **Painel**: as consultas PromQL do funil estão em `docs/ofertas.md`; não foram adicionadas ao
  painel-como-código da observabilidade (outra frente).
- **Frequência é do aparelho**: trocar de navegador zera o histórico (o teto volta a valer do zero).
  Aceito: não é cota nem segurança.
- **A Fase 7** precisa disparar `babel:oferta` com `convidado_para_conta`; o plano `convidado` vem de
  `estaAnonimo()` / `plan === 'anonimo'`. Se a Fase 7 criar uma identidade nova, `planoDaOferta()`
  (`src/lib/ofertas/plano.ts`) é o único ponto a ajustar.
- A flag `oferta_planos` segue **desligada**: ligar é decisão do dono (`docs/ofertas.md`).
