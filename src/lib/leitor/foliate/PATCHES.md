# Mudanças do Frasy no foliate-js vendorizado

Origem, commit e lista de arquivos: `ORIGEM.txt`. Toda mudança está marcada com `FRASY:` no código.

## Segurança (revisão de 26/10/2026): o livro nunca executa na origem do app

1. **`paginator.js` e `fixed-layout.js`: `sandbox="allow-same-origin"`, sem `allow-scripts`.** O original
   usa `allow-same-origin allow-scripts` por causa do bug 218086 do WebKit (o Safari não entrega ao pai os
   eventos de um iframe sem `allow-scripts`). Sem `allow-scripts`, nada do livro roda — nem `<script>`, nem
   `onload=`, nem `javascript:`, nem `<script>` dentro de SVG —, e o app continua mexendo no DOM do capítulo,
   que é como o foliate-js funciona. **Risco conhecido:** no Safari/WebKit, o toque na palavra e a seleção
   (ouvintes do pai no documento do capítulo) podem não disparar; medir no WebKit antes do merge.
2. **`view.js`, link externo:** só `http(s)`, com `window.open(url, '_blank', 'noopener,noreferrer')`. O
   motor (`../motor.ts`) já trata o evento `external-link` e cancela o padrão; esta é a segunda barreira.
3. **O motor (`../motor.ts`, `../politicaDeRecursos.ts`), fora do vendor:** o evento `load` só deixa entrar
   (X)HTML, SVG, CSS, imagem, fonte e áudio (XML genérico, XSLT, JS e o resto ficam fora); o evento `data`
   limpa toda marcação, inclusive `Blob` que fareja como HTML/SVG, com `../limparHtml.ts` (tira script,
   `on*`, `javascript:`, `iframe`/`object`/`embed`/`form` e a instrução `xml-stylesheet`).
4. **CSP:** não é a barreira do conteúdo do livro. O `script-src` do app tem `blob:` porque o runtime do ONNX
   com várias threads faz `import()` do módulo Emscripten a partir de um `blob:` na thread principal
   (`server/http/csp.ts`); por isso as barreiras 1 a 3 não dependem dela.

## Recorte

- `view.js`: `makeBook` só abre EPUB e PDF (MOBI, FB2, CBZ e pasta ficaram fora); o ZIP sai do
  `carregadorZip.js` (sobre o `fflate` do app) no lugar do `vendor/zip.js`; `initTTS` desligado (L3).
- `pdf.js`: reescrito sobre o `pdfjs-dist` do app, sem a camada de anotações do PDF, com o CSS da camada de
  texto embutido e `book.amostraDeTexto` para o aviso de PDF escaneado/duas colunas.
