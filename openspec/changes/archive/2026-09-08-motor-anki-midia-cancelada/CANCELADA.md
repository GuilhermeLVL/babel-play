# Cancelada em 2026-09-08

Esta change nunca foi implementada, e a decisão que ela mesma dizia aguardar tirou o chão dela.

O cabeçalho do `tasks.md` declarava depender de uma pergunta aberta:

> `schema-sem-tabela-orfa` (pergunta Q5) decide se esta change continua ou se as tabelas saem;
> até lá, não iniciar 3.x.

As tabelas saíram. A change `schema-sem-tabela-orfa` (arquivada em 2026-09-07, migração
`0026_schema_sem_tabela_orfa.sql`) removeu `anki_media` e `anki_note_media` do schema, junto com
`server/lib/ankiMidia.ts` — 165 linhas sem nenhum importador.

**A spec `midia-anki` NÃO foi publicada**: arquivar uma change cancelada não pode criar
requisitos que o código não cumpre. O arquivo fica aqui como registro do desenho, não como
contrato.

Reabrir isto é trabalho novo: exige a migração que recria as tabelas, o parser que extrai as
referências `[sound:]`/`<img>` antes de limpar o texto, e o leitor. Nada disso existe.
