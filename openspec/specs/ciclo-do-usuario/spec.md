# ciclo-do-usuario Specification

## Purpose
Descreve como uma pessoa entra no Babel Play e circula por ele HOJE: como a identidade e resolvida, quando a porta pede login, o que cada edicao pergunta na chegada, como a URL espelha a tela e de onde vem o progresso mostrado. Escrita a partir do codigo em 2026-09-07 (auditoria `openspec/audits/2026-09-07-coerencia.md`, secao 2.2); cada requirement cita o `arquivo:linha` que o implementa. O que esta marcado como "lacuna conhecida" e comportamento real que uma change aberta vai mudar.

## Requirements

### Requirement: A identidade nasce do build e se resolve uma vez
O cliente SHALL resolver a identidade em um de quatro estados (`carregando`, `anonimo`, `conta`, `selfhost`) a partir do build antes de qualquer chamada de API: `src/lib/identidade.ts:20,25` fixa o estado inicial (`anonimo` na edicao leve, `carregando` quando `authRequired`, senao `selfhost`); `src/lib/supabase.ts:70` define `authRequired` como "nao leve, `VITE_AUTH_REQUIRED=1` e Supabase configurado"; `src/App.tsx:122` carrega o Supabase e define `conta` ou `anonimo`. Todo `apiFetch` (`src/data/api.ts:22-26`) aguarda essa resolucao e, no estado `anonimo`, desvia para o servidor efemero em vez da rede.

#### Scenario: Build sem login
- **WHEN** o build nao tem `VITE_AUTH_REQUIRED=1`
- **THEN** o estado e `selfhost`, nenhuma tela de login existe e o servidor trata todo request como `LOCAL_OWNER` (`server/lib/auth.ts:142`)

#### Scenario: Build com login, visitante sem sessao
- **WHEN** `authRequired` e verdadeiro e `getSession()` nao devolve sessao
- **THEN** a identidade vira `anonimo` e `apiFetch` roteia para `servidorEfemero` (`src/data/api.ts:26`)

### Requirement: A porta so pede login quando a pessoa pede
`porta()` (`src/components/conta/exigeConta.ts:68-73`) SHALL devolver `login` apenas quando `authRequired` e verdadeiro, nao ha sessao e a pessoa pediu login; em todos os outros casos a primeira visita entra direto no app. `src/App.tsx:723` e o unico chamador. As views que exigem conta estao em `EXIGE_CONTA` (`exigeConta.ts:10`); o servidor protege as rotas por `authMiddleware` (`server.ts:159-178`), com `/api/health` e o webhook do Asaas montados antes (`server.ts:150-151`).

#### Scenario: Primeira visita com login habilitado
- **WHEN** uma pessoa sem sessao abre a raiz num build com `authRequired`
- **THEN** a tela e o app em modo anonimo, nao a tela de login

#### Scenario: Lacuna conhecida — gate por aba sem chamador
- **WHEN** um anonimo abre uma aba listada em `ABAS_QUE_EXIGEM_CONTA` (`exigeConta.ts:28-30`)
- **THEN** hoje nada bloqueia, porque `abaExigeConta` nao tem chamador (achado A15); a change `codigo-morto-removido` decide se a regra e ligada ou removida

### Requirement: Cada edicao tem a sua chegada
`src/App.tsx:738` SHALL montar `OnboardingLeve` na edicao leve e `Onboarding` na completa; `onboarded` (`src/App.tsx:554`) vem de `ui.onboarded` nas duas, e o anonimo da edicao completa pula o onboarding. A completa grava perfil de provedor e `activeProfileId` (`src/components/Onboarding.tsx:30-36`); a leve grava `settings.targetLanguage`, `ui.goal` e `ui.onboarded` (`src/components/OnboardingLeve.tsx:9-10,55`).

#### Scenario: Edicao completa
- **WHEN** a pessoa termina o onboarding completo sem abrir Ajustes
- **THEN** o idioma fica em `DEFAULT_LANG_CONFIG` (`src/lib/langConfig.ts:41`: UI `pt-BR`, estudo `en-US`) porque o onboarding completo nao pergunta idioma (lacuna conhecida A38, change `idioma-alvo-e-ui-respeitados`)

#### Scenario: Edicao leve
- **WHEN** a pessoa termina o onboarding leve
- **THEN** `targetLanguage` e `goal` estao gravados no servidor efemero e `onboarded` e verdadeiro

### Requirement: A URL e o terceiro espelho do estado
As views roteaveis SHALL ser as de `ViewDeRota` (`src/lib/rotas.ts:22`); `publicarUrl` (`rotas.ts:169`) escreve a URL a cada mudanca de estado (`src/App.tsx:655-665`), o boot restaura a partir dela uma vez com `replaceState` (`App.tsx:645-653`) e `popstate` navega de volta dentro do app (`App.tsx:668-675`). A tela de jogos publica a query do filtro por conta propria (`src/components/views/Play.tsx:1568-1572`).

#### Scenario: F5 na tela de jogos
- **WHEN** a pessoa recarrega `/jogar?fonte=baralho&baralho=<id>&idioma=ja`
- **THEN** a fonte, o baralho e o idioma voltam do que a URL diz (coberto por `tests/e2e/facetas.e2e.ts`)

#### Scenario: Lacuna conhecida — aba de loja fora da tabela
- **WHEN** o codigo navega para uma aba que nao existe em `ABA_DA_LOJA` (`src/lib/rotas.ts:88`)
- **THEN** hoje a URL vira `/loja/undefined` (achado A16); tratado em `contratos-alinhados-nas-tres-pontas`

### Requirement: O progresso mostrado vem de uma leitura do perfil
`src/App.tsx:404-421` SHALL carregar `GET /api/metrics/profile` (`server/routes/metrics.ts:20`) uma vez por sessao de tela e derivar tudo o que a casca mostra (nivel, seeds, sequencia); presenca diaria e registrada em `App.tsx:443` (`POST /api/metrics/presenca`, `server/routes/metrics.ts:122`) e conquistas sao avaliadas apos cada refresh de metricas (`App.tsx:457`).

#### Scenario: Abrir o app num dia novo
- **WHEN** o app monta com sessao valida
- **THEN** a presenca do dia e gravada uma vez (idempotente por dia) e o perfil e relido

#### Scenario: Lacuna conhecida — segunda leitura do perfil
- **WHEN** a pessoa abre a tela de Metricas
- **THEN** `Metrics.tsx:144` faz um segundo `GET /api/metrics/profile` independente (achado A37; change `arranque-leve-e-payloads-enxutos`)
