> **"Já sei" e "Ignorar" sem cartão, e o número de palavras que você conhece.** Referência de mercado: o LingQ marca
> palavras como "Known" (não entra em revisão) ou "Ignore" (nome, ruído) sem criar flashcard, mostra um contador de
> palavras conhecidas e, no leitor, tem os atalhos `k` (conhecida) e `x` (ignorar).

## Why

Hoje a palavra só tem estado se tiver CARTÃO (`salva`/`aprendendo`/`dominada`, `src/core/vocabulario/etiquetas.ts`),
mais o ponto "nova para você". Quem já sabe "house" precisa criar um cartão e revisá-lo até dominar para o app
parar de tratá-la como nova; nomes próprios e ruído ("Gandalf", "uh") ganham o ponto para sempre. E não existe
um número que diga quanto a pessoa já sabe: a cobertura de um texto (`coberturaDoTexto`) só enxerga o caderno, e
subestima quem chega sabendo.

## What Changes

- **Tabela nova `palavras_marcadas`** (migração PG 0027): `user_id`, `lang` (idioma base), `chave`
  (`chaveDaPalavra`), `estado` (`conhecida` | `ignorada`), `atualizado_em`; PK `(user_id, lang, chave)`. Desmarcar
  apaga a linha (sem lápide: o cliente sempre relê a lista inteira). Dado do titular (`TABELAS_DO_TITULAR`):
  entra na exportação e sai com a conta. RLS e REVOKE como as outras.
- **Rotas** `GET/PUT/DELETE /api/vocab/marcadas` (mesma autenticação, guarda de menor e limitador das rotas de
  vocabulário); o servidor reduz idioma e chave (o cliente não é confiável); teto de 20.000 marcadas por conta
  (409 `marcadas_cheio` para marcação nova; trocar o estado sempre vale). Sem conta, o espelho
  (`src/data/efemero/rotas/palavrasMarcadas.ts`) guarda no `localStorage` do aparelho, como as configurações.
- **Núcleo** (`src/core/vocabulario/marcadas.ts`): etiquetas novas `conhecida` e `ignorada`, que não pintam nada
  (como `dominada`) e nunca são "nova para você". Precedência: cartão do caderno > marcação > ponto nova.
  `contarConhecidas` = chaves `aprendendo`/`dominada` + marcadas `conhecida` sem cartão, sem duplicar. Marcos POR
  RESULTADO (100, 250, 500, 1000, 2000, 3000, 5000, 8000) com o próximo marco; nada baseado em tempo (Decreto
  12.880/2026, art. 9º). A cobertura de um texto passa a contar as marcadas `conhecida`.
- **UI**: no cartão da palavra (legenda da captura e leitor de livros/leitura ativa) os botões "Já sei" e
  "Ignorar", e "Desfazer" depois de marcar; atalhos `k` e `x` com o cartão aberto (sem modificador, fora de campo
  de texto; apertar de novo desfaz). Palavra que já tem cartão não mostra os botões (o cartão manda). Na tela de
  Vocabulário, o bloco "Palavras que você conhece": número por idioma, barra até o próximo marco e a lista das
  marcadas ("Já sei" / "Ignoradas") para desmarcar.

## Decisões conservadoras (anotadas)

- **Sem lápide**: o padrão de lápide (`anotacoes_de_leitura`) existe para sincronização incremental entre
  aparelhos; aqui a lista é relida inteira, e apagar de verdade é o mais simples para a LGPD.
- **Palavra com cartão não é marcável**: o cartão é onde a pessoa estuda; deixar marcar "Já sei" numa palavra
  salva criaria dois estados para a mesma palavra. Quem quiser marcar apaga o cartão antes.
- **Contagem por idioma não soma cartões sem idioma** (o mesmo cartão contaria em todo idioma); a cobertura de
  texto continua aceitando esses cartões, como antes.
- **Sem migração das marcadas locais para a conta no primeiro login** (o `ModalDeMigracao` não as leva ainda):
  fica como pendência; o efeito é a pessoa remarcar.
- **O bloco fica só na tela de Vocabulário**, não na aba "Palavras" embutida em Cartões (layout de lista com
  busca presa no alto).

## Impact

- Banco: `server/db/schema.ts` (`palavrasMarcadas`), `server/db/migrations-pg/0027_palavras_marcadas.sql` + meta.
- Servidor: `server/routes/vocab.ts`, `server/validation.ts`, `server/db/repositories/palavrasMarcadas.ts`,
  `server/db/repositories/conta.ts`, `scripts/migracao/sqlite-para-postgres.ts` (tabela só do Postgres).
- Cliente: `src/core/vocabulario/{marcadas,etiquetas}.ts`, `src/data/rotas/palavrasMarcadas.ts`,
  `src/data/efemero/rotas/palavrasMarcadas.ts`, `src/lib/etiquetas/{indiceDeEtiquetas,teclasDeMarcacao,rotulos}.ts`,
  `src/components/vocab/MarcarPalavra.tsx`, `src/components/views/vocab/PalavrasQueVoceConhece.tsx`, os dois
  `CartaoDaPalavra.tsx`, `LeitorDoLivro.tsx`, `Metrics.tsx`, `useConhecimento.ts`, `src/styles/etiquetas.css`.
- Rotas novas no contrato (`tests/contratos/api-contrato.json`): `GET`, `PUT`, `DELETE /api/vocab/marcadas`.
