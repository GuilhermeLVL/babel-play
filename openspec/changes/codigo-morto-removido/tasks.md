## 1. Inventario pos-changes

- [ ] 1.1 Rodar `knip`, `madge --circular/--orphans`, `depcheck`, `jscpd`, `eslint`, `ast-grep scan`; anexar saidas ao PR
- [ ] 1.2 Decisoes em `design.md`: `ocr.ts`/`tesseract.js`, `/api/admin/*` (tela ou remocao), `@axe-core/playwright` (usar no e2e ou remover)

## 2. Remocoes

- [ ] 2.1 Arquivos sem importador restantes
- [ ] 2.2 Exports/tipos sem uso restantes (`scheduler.ts` Leitner, `cefr.ts`, `distribuicao.ts`, `soundFx.ts`, `api.ts`, `i18n.ts`, `exigeConta.ts`, repositorios)
- [ ] 2.3 Rotas sem consumidor restantes
- [ ] 2.4 Dependencias sem uso
- [ ] 2.5 Ciclo `source.ts ↔ filtro.ts`

## 3. Erros engolidos e lint

- [ ] 3.1 7 `catch {}` de `soundFx.ts` e `.catch(() => {})` de A58 com motivo ou tratamento
- [ ] 3.2 Warnings de lint a zero; `--max-warnings 0` no `ci.yml`

## 4. Gates

- [ ] 4.1 `knip`, `jscpd` (limiar) e `madge --circular` no `ci.yml`
- [ ] 4.2 `npm test` verde
