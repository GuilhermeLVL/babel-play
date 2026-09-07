## Why

Os tres eixos de idioma existem e nao sao respeitados de ponta a ponta (achados A38, A39, A65 e secao "multi-idioma" de `openspec/audits/2026-09-07-coerencia.md`):

- **UI**: nao existe seletor; o idioma da interface e derivado de "Meu idioma" (`langConfig.ts:156`); `IDIOMAS_DA_INTERFACE` (`i18n.ts:36`) tem 0 consumidores; `users.locale` (`schema.ts:504`) e plumbada no servidor e nunca escrita (EXEC: NULL). `es` e oferecido com 20 de 693 chaves.
- **Alvo**: `Onboarding.tsx` (edicao completa) nao pergunta o idioma de estudo (`:30-36`), entao `DEFAULT_LANG_CONFIG` (`langConfig.ts:41`) prende a UI em portugues e o estudo em ingles. No banco real, `settings.target_language = 'pt-BR'` enquanto `ui.praticaLang = 'en'` (EXEC): os dois stores do mesmo eixo divergem.
- **Conteudo**: CEFR do servidor e ingles-only (`cefrWordlist.ts:77`; `vocab.ts:280,885` chamam `nivelCefr(word, srcLang ?? 'en')` e `registrarNiveis` so existe no Vite, `carregar.ts:71`); `fluencia.ts:103` + `AbaProgresso.tsx:49` sem idioma; `Metrics.tsx:307` filtra `=== 'en'`; `tts.ts:261` cai em `en-US`; `dictionary.ts:124` fixa `pt`; `Honestidade.tsx:80` fixa `pt-BR` e escapa da regra `locale-cravado`; `profile.ts:394`, `VocabularyPanel.tsx:304`, `relatorioDeProgresso.ts:28-79` em portugues fixo. Regua gramatical, vicios e stopwords so en/pt (`passive-voice.ts:97`, `fillers.ts:50,62`, `keywords.ts:17-30`); `prepararFala.ts:105` so pt.
- Gate: ~394 `t()` contra ~4.353 literais em portugues (EXEC `orfas --progresso`); `ar.json` e o unico RTL e esta fora da lista.

## What Changes

- **Um store por eixo.** Alvo: `settings.targetLanguage` e a unica fonte escrita; `ui.captureTargetLang` e `ui.praticaLang` deixam de ser gravados e sao apagados pela migracao `0023` (continuam sendo LIDOS como fallback, porque o modo anonimo guarda settings no IndexedDB, onde migracao SQL nao chega). UI: `settings.ui.uiLang`, escrita por um seletor em Ajustes; `mine` deixa de decidir a interface e vira apenas o padrao. **Decidido na implementacao:** um store so para a interface, e nao `users.locale` para conta mais `ui.uiLang` para o resto — dois stores para o mesmo eixo e o defeito que esta change conserta, e `settings` ja funciona nos tres modos. `users.locale` fica para `schema-sem-tabela-orfa`.
- Onboarding completa pergunta idioma-alvo e idioma da interface (reaproveita os passos de `OnboardingLeve`).
- Idiomas de UI oferecidos = catalogos com cobertura >= 90% (`es` sai ate cumprir); `ar` entra quando cumprir.
- Servidor le `niveis/*.json` (import estatico, empacotado por esbuild) e registra a lista SOB DEMANDA por idioma (`server/lib/niveisDaTrilha.ts`); `nivelCefr(word, lang)`, `escalaDe(lang)` e `coberturaDaWordlist(lang)` sem default `en`.
- Os 10 pontos cravados listados acima passam a receber o idioma do item ou do eixo correto; `relatorioDeProgresso` passa por `t()`; regra ast-grep `locale-cravado` cobre `Intl.*Format('xx-YY')` e `new Intl.NumberFormat('pt-BR')`.
- Regua gramatical/vicios/stopwords/prepararFala: por idioma, com tabela vazia = "sem regua" declarado na tela (nunca aplicar a regua inglesa a outro idioma).
- Gate de progresso: `orfas --progresso` no CI com piso que so sobe.

## Capabilities

### New Capabilities
- `tres-eixos-de-idioma`: interface, alvo e conteudo tem uma fonte cada, escolhidas pelo usuario, respeitadas por todo codigo que fala, le ou classifica.

### Modified Capabilities
- `trilha-por-idioma` (change `trilha-multi-idioma`): o nivel CEFR e resolvido por idioma tambem no servidor.

## Impact

- `src/lib/{langConfig,i18n,useI18n,tts,dictionary,profile,relatorioDeProgresso}.ts`, `src/components/{Onboarding,Settings,Honestidade,VocabularyPanel}.tsx`, `src/components/views/{Metrics}.tsx`, `views/perfil/AbaProgresso.tsx`
- `src/core/learning/{cefrWordlist,fluencia,fillers,keywords,passive-voice}.ts`, `src/lib/traducao/prepararFala.ts`, `src/data/trilha/{carregar,indice}.ts`
- `server/db/repositories/{vocab,perfil,settings}.ts`, `server/lib/niveisDaTrilha.ts` (novo), `server/validation.ts`, migration de dados (alvo unico)
- `audit/rules/ast-grep/locale-cravado.yml`, `scripts/i18n/orfas.mjs`, `.github/workflows/ci.yml`, `public/i18n/*`
- Remove: `ui.captureTargetLang`/`ui.praticaLang` como fontes; `IDIOMAS_DA_INTERFACE` sem consumidor (vira a lista do seletor); defaults `'en'` implicitos

## Pronto quando

Teste de integracao: usuario com alvo `es` e UI `en` — `nivelCefr` no servidor devolve nivel para `hola`; `/profile` de fluencia e `Metrics` produzem numeros (nao vazio) para `es`; `speak()` sem `lang` lanca em dev; `ast-grep scan` acusa `Intl.NumberFormat('pt-BR')`; `orfas --progresso` >= piso; e2e: onboarding completa pergunta idioma e a interface muda pelo seletor.

## Dependencias e paralelismo

Depende de `linha-de-base-verde`. Paralelizavel com todas exceto `arranque-leve-e-payloads-enxutos` (ambas tocam `Metrics.tsx`).
