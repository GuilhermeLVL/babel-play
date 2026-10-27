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
   limpa toda marcação, inclusive `Blob` que fareja como HTML/SVG, com `../limparHtml.ts` — o **DOMPurify**
   (`WHOLE_DOCUMENT`, no modo `text/html` em que o capítulo vai ser lido; o XHTML/SVG é recriado sem prefixos
   pelo nome local antes; saída estável em até 2 passadas, senão recusa). Um predicado só (`tipoDeMarcacao`)
   decide o que é marcação, e o tipo do `blob:` só vira `text/html` depois que a limpeza rodou; o que falha
   vira texto vazio. A instrução `xml-stylesheet` não passa (o documento é remontado como HTML). O e2e com
   `mxss.epub` (raw text de `<style>`/`<xmp>`/`<noscript>`, prefixos, raiz SVG) roda no Chromium e no WebKit.
0. **CSP do capítulo (a barreira principal, revisão de 26/10/2026):** `../limparHtml.ts` põe
   `<meta http-equiv="Content-Security-Policy">` (`CSP_DO_CAPITULO`: só `blob:`/`data:`, nenhum script) como
   primeiro filho do `<head>` de todo capítulo e tira toda `<meta http-equiv>` do livro. O (X)HTML sai como
   **HTML** (`text/html`): no XHTML o Chromium e o WebKit ignoram a CSP em `<meta>`. As fontes do perfil entram
   como `blob:` (`../fontes.ts`). Controle medido: com a limpeza desligada, a CSP sozinha deixa 0 pedidos
   chegarem à rede no Chromium e no WebKit; sem as duas, chegam 66–69 (`burlas.epub`).
3a. **Privacidade (fora do vendor, `../limparHtml.ts`, defesa em profundidade):** a URL é normalizada como o
   navegador faz (controles, `\\t\\n\\r`, `\` → `/`) e decidida por `new URL`; elementos e atributos por nome LOCAL
   (com qualquer prefixo); SMIL (`set`, `animate…`) sai; o CSS é lido decodificado e a declaração que puxa algo
   de fora sai inteira. Nada do livro sai para outro host. Depois do foliate-js
   todo recurso interno é `blob:`; o que sobra com esquema (`https:`, `//`…) é removido de `src`, `srcset`,
   `poster`, `href` de `<link>`/`<image>`, `data`, `background` e `ping`; no CSS (folha do manifesto, `<style>`
   e `style=`), `url()` remoto vira `url("")` e `@import` remoto sai. O `<a href>` de navegação fica (o motor
   só abre http(s) com noopener). O e2e com `remoto.epub` confere que nenhum pedido sai da página.
4. **CSP:** não é a barreira do conteúdo do livro. O `script-src` do app tem `blob:` porque o runtime do ONNX
   com várias threads faz `import()` do módulo Emscripten a partir de um `blob:` na thread principal
   (`server/http/csp.ts`); por isso as barreiras 1 a 3 não dependem dela.

## Narração (L3, 27/10/2026)

5. **`paginator.js`: `mostrarTrecho(anchor)`**, o `#scrollToAnchor` com o motivo `'anchor'`. A narração vira a
   página para a frase lida sem pôr o caret no começo da página (o `scrollToAnchor` público usa `'navigation'`,
   que mexe na seleção; no WebKit um caret novo seria lido como toque na palavra).

## Recorte

- `view.js`: `makeBook` só abre EPUB e PDF (MOBI, FB2, CBZ e pasta ficaram fora); o ZIP sai do
  `carregadorZip.js` (sobre o `fflate` do app) no lugar do `vendor/zip.js`; `initTTS` desligado (L3).
- `pdf.js`: a página desenhada vai como `<img>` (`blob:`) e não como `<canvas>`: sem `allow-scripts`, o canvas
  num documento sem script mostra só o conteúdo de reserva (consequência do item 1 da segurança).
- `pdf.js`: reescrito sobre o `pdfjs-dist` do app, sem a camada de anotações do PDF, com o CSS da camada de
  texto embutido e `book.amostraDeTexto` para o aviso de PDF escaneado/duas colunas.
