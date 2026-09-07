## 1. Um store por eixo

- [ ] 1.1 `settings.targetLanguage` unica fonte do alvo; `saveLangConfig` grava so ela; `praticaLang` e derivado; migracao de dados para linhas divergentes
- [ ] 1.2 `users.locale` (conta) / `settings.ui.uiLang` (self-host, anonimo) escritos por seletor em Ajustes; `usarIdioma` le dali
- [ ] 1.3 Onboarding completa pergunta alvo e interface

## 2. Cobertura de UI

- [ ] 2.1 Lista de idiomas oferecidos derivada da cobertura do catalogo (>= 90%)
- [ ] 2.2 `relatorioDeProgresso.ts` por `t()`; `profile.ts:394` sem `=== 'pt'`
- [ ] 2.3 `locale-cravado.yml` cobre `Intl.*Format` com locale literal; `Honestidade.tsx:80` corrigido

## 3. Conteudo por idioma

- [ ] 3.1 `server/lib/niveisDaTrilha.ts` carrega `niveis/*.json` no boot; `registrarNiveis` para os 16; `nivelCefr(word, lang)` sem default
- [ ] 3.2 `fluencia`, `AbaProgresso`, `Metrics.tsx:307` recebem o idioma-alvo; painel diz "sem regua para X" quando nao ha
- [ ] 3.3 `tts.ts:261`: `lang` obrigatorio (erro em dev, fallback por item em prod)
- [ ] 3.4 `dictionary.ts:124`: ordem da cadeia a partir do idioma da UI
- [ ] 3.5 `fillers`, `keywords`, `passive-voice`, `prepararFala`: assinatura com `lang`; tabela vazia = declarado

## 4. Gates

- [ ] 4.1 `orfas --progresso` no CI com piso
- [ ] 4.2 `npm test`, e2e de onboarding e seletor verdes
