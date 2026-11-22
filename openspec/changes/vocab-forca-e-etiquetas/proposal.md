> **Força 1–4 e etiquetas do usuário no vocabulário.** Referência de mercado: o LingQ mostra cada palavra salva com
> status 1–4 (Novo, Reconhecida, Familiar, Aprendida) mais "Conhecida", e a lista de vocabulário tem tags do usuário,
> filtros por status, tag e data de revisão, e ordenação por data, alfabética e status
> (`docs/pesquisa/2026-11-ecossistema-de-aprendizado/rea-lingq.md`, `concorrentes.md`).

## Why

O caderno do Frasy já agenda cada palavra com FSRS-5, mas a pessoa só enxerga três estados grossos
(`nova`/`aprendida`/`dominada`) e não tem como agrupar palavras do seu jeito ("filme", "trabalho", "viagem") nem achar
o que está mais fraco. O LingQ resolve isso com status MANUAIS 1–4, que brigam com a repetição espaçada (a pessoa
sobe o status à mão e o agendador discorda). Aqui a força é DERIVADA da estabilidade do FSRS: nada para marcar, nada
para divergir.

## What Changes

- **Força 1–4** (`src/core/learning/forcaDoCartao.ts`, função pura `forcaDoCartao`): 1 Nova (sem revisão), 2
  Reconhecida (estabilidade < 3 dias), 3 Familiar (3 a < 21 dias), 4 Firme (>= 21 dias). Três esquecimentos ou mais
  (`lapses`) rebaixam um nível (nunca abaixo de 2). O "Conhecida" do LingQ é a marcação "Já sei" que já existe
  (`vocab-conhecidas-e-ignoradas`), e não entra na força. Mostrada como quatro tracinhos com texto acessível ("Força
  3 de 4: familiar") na lista do catálogo e no cartão da palavra (`GET /api/vocab/palavra` passa a trazer `forca`).
- **Etiquetas do usuário**: coluna `vocab_cards.etiquetas text[] NOT NULL DEFAULT '{}'` (migração PG 0028, só
  EXPAND). Normalização compartilhada (`src/core/vocabulario/etiquetasDoUsuario.ts`): minúsculas, sem `#`, espaço
  vira `-`, só letras/números/`-`/`_`, até 32 caracteres, até 10 por cartão, repetidas somem.
  - `PUT /api/vocab/:id/etiquetas` (corpo `{ etiquetas: string[] }`, substitui; mesma autenticação e isolamento de
    `PUT /api/vocab/:id/nota`; 400 se inválida ou passar de 10; 404 se o cartão não é seu).
  - `GET /api/vocab/etiquetas`: as etiquetas em uso com a contagem (sugestão no cartão e filtro no catálogo).
  - As etiquetas saem em `GET /api/vocab` (com o cartão) e na exportação da conta (a tabela já é dado do titular).
- **Catálogo** (`GET /api/vocab/pagina`): filtros novos `etiquetas` (o cartão tem TODAS) e `forcas` (uma delas),
  ordens novas `forca` (mais fracas primeiro) e `proximaRevisao` (sem data por último). A força é filtrada e
  ordenada em SQL com os mesmos limiares do núcleo (a regra não depende do relógio, por isso é espelhável).
- **UI**: no cartão da palavra, os tracinhos e os chips de etiquetas com adicionar/remover (sugestões das já usadas);
  no catálogo, grupos de filtro "Força" e "Etiquetas", coluna Força, etiquetas junto da palavra e as duas ordens.
- **Exportação**: o `.apkg` leva as etiquetas como tags da nota; o CSV ganha a coluna `etiquetas` (só se alguma
  palavra tiver). "Filtradas" do Exportar considera os filtros novos.

## Decisões conservadoras (anotadas)

- **Sem status manual**: a força não é editável. Quem quer dizer "já sei" usa a marcação que já existe.
- **"Lapses recentes" virou "lapses acumulados"**: o banco guarda só a contagem de esquecimentos, não quando
  ocorreram; usar a contagem mantém a regra independente do relógio e portanto igual em SQL. O FSRS já derruba a
  estabilidade logo depois de um esquecimento, então o rebaixamento só segura quem esquece sempre.
- **Sem espelho sem conta**: como a nota (`PUT /api/vocab/:id/nota`) e o histórico da palavra, as etiquetas exigem
  conta; sem conta o editor não aparece (o histórico devolve `null`). Declarado no cliente
  (`src/data/rotas/historicoDaPalavra.ts`).
- **Etiqueta inválida recusa a lista inteira** (400) em vez de cortar em silêncio.
- **Filtro de etiquetas = E** (o cartão tem todas as escolhidas), que é o que estreita a lista a cada clique.

## Reversão

`ALTER TABLE vocab_cards DROP COLUMN etiquetas`, depois de voltar o código sem a rota `/api/vocab/:id/etiquetas` (as
etiquetas escritas se perdem). Nada mais depende da coluna.

## Impact

- Servidor: `server/db/schema.ts`, migração `0028_vocab_etiquetas.sql`, `server/db/repositories/vocab.ts` e
  `palavrasVistas.ts`, `server/routes/vocab.ts`, `server/validation.ts`.
- Núcleo: `src/core/learning/forcaDoCartao.ts`, `src/core/vocabulario/etiquetasDoUsuario.ts`.
- Cliente: `src/components/vocab/{ForcaDaPalavra,EtiquetasDoCartao,HistoricoDaPalavra}.tsx`, catálogo e exportação em
  `src/components/views/vocab/`, `src/lib/anki/montarApkg.ts`, `src/data/rotas/historicoDaPalavra.ts`.
- i18n: 14 chaves em `public/i18n/{en,es,ar}.json`.
