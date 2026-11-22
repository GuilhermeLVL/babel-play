## 1. Núcleo

- [x] 1.1 `src/core/learning/forcaDoCartao.ts`: `forcaDoCartao`, limiares documentados (3 e 21 dias), rebaixamento por
      3 esquecimentos
- [x] 1.2 `src/core/vocabulario/etiquetasDoUsuario.ts`: normalização e tetos (10 × 32 caracteres)
- [x] 1.3 Testes do núcleo (`tests/forca-do-cartao.test.ts`)

## 2. Dados

- [x] 2.1 `vocab_cards.etiquetas text[]` em `server/db/schema.ts` e migração PG 0028 (drizzle-kit, `REVERSÃO:` à mão),
      com snapshot e journal
- [x] 2.2 A coluna sai em `GET /api/vocab` (`COLUNAS_DO_CARTAO`) e na exportação da conta (a tabela já é do titular)

## 3. API

- [x] 3.1 `PUT /api/vocab/:id/etiquetas` (auth, validação, normalização, 404 de outro dono) e
      `GET /api/vocab/etiquetas`, antes de `/:id`
- [x] 3.2 `GET /api/vocab/pagina`: filtros `etiquetas` e `forcas`, ordens `forca` e `proximaRevisao` (força em SQL
      igual à função pura; cursor)
- [x] 3.3 `GET /api/vocab/palavra`: `cartao.forca` e `cartao.etiquetas`
- [x] 3.4 Contrato da API regravado e caso de IDOR (`tests/seguranca/idor.test.ts`)
- [x] 3.5 Testes de rota (`tests/integration/vocab-etiquetas-e-forca.test.ts`): auth, validação, isolamento,
      normalização, filtros, ordens, paridade SQL × função, exportação da conta

## 4. UI

- [x] 4.1 `ForcaDaPalavra` (quatro tracinhos, "Força 3 de 4: familiar") no catálogo e no cartão da palavra
- [x] 4.2 `EtiquetasDoCartao` (chips, adicionar, remover, sugestões) no cartão da palavra
- [x] 4.3 Catálogo: filtros Força e Etiquetas, coluna Força, etiquetas junto da palavra, ordens "Mais fracas primeiro" e
      "Próxima revisão"; "Filtradas" do Exportar considera os filtros novos
- [x] 4.4 Exportação: tags do `.apkg` e coluna `etiquetas` do CSV
- [x] 4.5 Testes de componente (`tests/vocab-forca-e-etiquetas-ui.test.tsx`)
- [x] 4.6 Textos em `en`/`es`/`ar` e `npm run i18n`

## 5. Fechamento

- [x] 5.1 Typecheck, lint, testes tocados e `npm run migracoes:conferir`
- [ ] 5.2 Aplicar a migração 0028 no banco de produção (manual, depois do merge; ver `docs/deploy.md`)
- [ ] 5.3 Arquivar a change (`/opsx:archive`) depois do merge
