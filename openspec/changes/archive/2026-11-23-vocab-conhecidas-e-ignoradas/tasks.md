## 1. Dados

- [x] 1.1 `palavrasMarcadas` em `server/db/schema.ts` e migração PG 0027 (gerada pelo drizzle-kit + RLS/REVOKE e
      `REVERSÃO:` à mão), com snapshot e journal
- [x] 1.2 `TABELAS_DO_TITULAR` (exportação e exclusão) e `TABELAS_SO_DO_POSTGRES` da migração SQLite → Postgres
- [x] 1.3 Testes que contam/listam tabelas: `schema-pg-baseline` (45), `migracao-sqlite-para-postgres`, snapshot da
      exportação (`me.exportar.get.json`)

## 2. API

- [x] 2.1 `GET/PUT/DELETE /api/vocab/marcadas` antes de `/:id`, com validação (`server/validation.ts`) e teto
- [x] 2.2 Repositório `palavrasMarcadas.ts` (upsert sob a trava do usuário, teto dentro do INSERT)
- [x] 2.3 Cliente `src/data/rotas/palavrasMarcadas.ts` e espelho sem conta no `localStorage`
- [x] 2.4 Contrato da API regravado (`tests/contratos/api-contrato.json`)

## 3. Núcleo

- [x] 3.1 `src/core/vocabulario/marcadas.ts`: índice, `chavesConhecidas`, `contarConhecidas`, `contagemPorIdioma`,
      marcos e `progressoDoMarco`
- [x] 3.2 Etiquetas `conhecida`/`ignorada` com a precedência cartão > marcação > nova; `etiquetaSilenciosa`
- [x] 3.3 A cobertura de texto (`useConhecimento`) usa `chavesConhecidas`

## 4. UI

- [x] 4.1 `MarcarPalavra` ("Já sei", "Ignorar", "Desfazer") nos dois cartões da palavra
- [x] 4.2 Atalhos `k`/`x` com o cartão aberto (`lib/etiquetas/teclasDeMarcacao`), inclusive com o foco no capítulo
      do leitor
- [x] 4.3 "Palavras que você conhece" na tela de Vocabulário: número por idioma, barra até o próximo marco, lista
      para desmarcar
- [x] 4.4 Textos nos catálogos `en`/`es`/`ar` e `npm run i18n`

## 5. Testes e verificação

- [x] 5.1 `tests/vocab-marcadas.test.ts` (núcleo: precedência, contagem sem duplicar, marcos, cobertura)
- [x] 5.2 `tests/caracterizacao/vocab-marcadas.test.ts` (auth, validação, upsert, isolamento, teto, LGPD)
- [x] 5.3 `tests/efemero-palavras-marcadas.test.ts` (espelho sem conta)
- [x] 5.4 typecheck, lint, testes tocados e knip

## 5b. Revisão adversarial

- [x] 5b.1 Gravações por chave em fila (a última intenção vence); falha desfaz só a chave; a leitura em voo não
      apaga o que foi confirmado depois de ela começar; tecla presa (`repeat`) ignorada
- [x] 5b.2 Troca de identidade (`aoMudarIdentidade`) zera e relê as marcadas (`tests/indice-marcadas.test.ts`)
- [x] 5b.3 `limparTudo` apaga `babel.efemero.palavrasMarcadas`
- [x] 5b.4 "Já sei (n)"/"Ignoradas (n)" com a régua do contador (marcação de palavra com cartão não conta)

## 6. Pendências (fora desta mudança)

- [ ] 6.1 Levar as marcadas do aparelho para a conta no primeiro login (`ModalDeMigracao`). Hoje a migração termina
      com `limparTudo`, que apaga também as marcadas locais: quem marcou sem conta precisa remarcar depois de entrar
- [ ] 6.3 Troca de conta para conta (sem passar por anônimo) não dispara `aoMudarIdentidade`: as marcadas só são
      relidas ao recarregar (o caderno tem o mesmo comportamento hoje)
- [ ] 6.2 e2e do cartão com `k`/`x` (Playwright) e conferir contraste dos botões no fundo claro da janela flutuante
