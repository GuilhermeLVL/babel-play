# i18n Specification

## Purpose
Descreve os tres eixos de idioma como existem HOJE — idioma da interface, idioma-alvo do estudo e idioma do conteudo — e onde cada um vive. Escrita a partir do codigo em 2026-09-07 (auditoria, secao 2.6); cada requirement cita o `arquivo:linha` que o implementa. O seletor de interface e o onboarding que pergunta idioma sao objeto de `idioma-alvo-e-ui-respeitados`.

## Requirements

### Requirement: O idioma da interface deriva de "Meu idioma"
A interface SHALL usar o idioma de `cfg.mine` (`src/lib/langConfig.ts:156`), que vem de `settings.ui.captureSourceLang` (`langConfig.ts:63,91`), salvo o override de depuracao `?ui=<lang>` capturado uma vez na carga. O catalogo e texto-como-chave: `t()` (`src/lib/i18n.ts:84`) busca em `/i18n/<lang>.json` (`i18n.ts:150`) e cai na propria chave em portugues quando falta (`i18n.ts:70`). `IDIOMAS_DA_INTERFACE` (`i18n.ts:36`) lista `pt`, `en`, `es`.

#### Scenario: Pessoa muda "Meu idioma" para ingles
- **WHEN** `captureSourceLang` passa a `en-US`
- **THEN** a interface carrega `en.json` e `document.lang` acompanha; a direcao de microfone e traducao tambem muda, porque e o mesmo campo

#### Scenario: Lacuna conhecida — sem seletor proprio
- **WHEN** a pessoa quer a interface em ingles estudando portugues
- **THEN** nao ha como, porque nao existe seletor de UI e `users.locale` (`server/db/schema.ts:504`) nunca e escrito (achado A38)

### Requirement: O idioma-alvo vive em settings, com dois espelhos
O idioma de estudo SHALL ser `settings.targetLanguage` (`server/db/schema.ts:470`), espelhado em `ui.captureTargetLang` (`src/lib/langConfig.ts:89-94`) e, na tela de jogos, em `ui.praticaLang`. Ele e definido em Ajustes, na Sala de escolha da tela de jogos e no onboarding leve (`src/components/OnboardingLeve.tsx:9,55`); o onboarding completo nao pergunta e o default e `en-US` (`langConfig.ts:41`).

#### Scenario: Trocar idioma na Sala
- **WHEN** a pessoa escolhe `ja` na tela de jogos
- **THEN** a trilha, o filtro e a composicao passam a usar `ja`, e a escolha persiste em settings

### Requirement: O idioma do conteudo e um atributo do dado, nao da pessoa
Cada cartao SHALL carregar o proprio idioma em `vocab_cards.src_lang` e na coluna gerada `src_lang_base` (`server/db/schema.ts:103`); sessoes e falas carregam `source_lang`/`target_lang` (`schema.ts:38-39`); baralhos Anki carregam `idioma_origem`. O filtro da pratica interseta por `idiomas` (`server/db/repositories/vocab.ts:557-563`).

#### Scenario: Acervo multi-idioma
- **WHEN** o baralho tem cartoes `en` e `ja` e o filtro pede `ja`
- **THEN** so os cartoes `ja` entram no pool (`tests/integration/filtro-composicao.test.ts`)

### Requirement: Portugues cravado e caçado por gate de CI
`scripts/i18n/orfas.mjs` SHALL falhar o CI quando `en.json`/`xx.json` tem chave sem uso no codigo, e `scripts/i18n/pseudo.mjs --check` quando o pseudo-locale nao cobre as chaves (`.github/workflows/ci.yml`). A regra ast-grep `locale-cravado` cobre `toLocale*`.

#### Scenario: Chave orfa
- **WHEN** alguem remove um `t('...')` e deixa a chave no JSON
- **THEN** `npm run i18n:orfas` sai com 1 e o CI para

#### Scenario: Lacuna conhecida — literais fora do i18n
- **WHEN** um componente escreve `Intl.NumberFormat('pt-BR')` ou texto em portugues fora de `t()`
- **THEN** nenhum gate acusa hoje (achados A39, A65); cobertura de `es.json` e de 20 chaves
