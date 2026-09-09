## Why

`.apkg` e um arquivo que qualquer pessoa monta e envia, e os campos dele sao HTML por definicao do
formato. `limparCampo` remove tags mas decodifica as entidades DEPOIS — de proposito, para nao
apagar `&lt;div&gt;` que o autor quis mostrar como texto. A consequencia medida: uma carga escrita
como entidade SAI de `limparCampo` como marcacao viva. Dentro do produto e inerte (nada do baralho
vira HTML), mas `notes.flds` do `.apkg` EXPORTADO e renderizado pelo Anki, que e um webview.

## What Changes

- `escaparHtml` em `server/import/ankiExport.ts`, aplicado a `flds` e `sfld`. `csum` continua sobre
  o valor nao escapado, senao a deteccao de duplicata na reimportacao quebra.
- `tests/seguranca/anki-html-hostil.test.ts`: onze cargas, uma por tecnica, atravessando o leitor
  real e o exportador real.
- O arquivo separa o que `limparCampo` GARANTE do que ele deliberadamente nao garante.

## Nao-escopo

Inverter a ordem de `limparCampo`. Corromperia conteudo legitimo de baralho e nao fecharia nada,
porque quem segura marcacao e o sink.
