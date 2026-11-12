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

- `view.js`: `makeBook` abre EPUB, PDF, MOBI/AZW3, FB2 (e FB2.zip) e CBZ, sempre pelo CONTEÚDO (zip com
  `container.xml`/`mimetype` = EPUB; zip só de imagens = CBZ; zip com `.fb2` = FBZ; `BOOKMOBI` no byte 60 = MOBI;
  `<FictionBook` no começo = FB2), nunca pela extensão. Pasta e CBR ficaram fora; o ZIP sai do
  `carregadorZip.js` (sobre o `fflate` do app) no lugar do `vendor/zip.js`; o `unzlib` do MOBI é o `fflate` do app;
  `initTTS` desligado (L3).
- `pdf.js`: a página desenhada vai como `<img>` (`blob:`) e não como `<canvas>`: sem `allow-scripts`, o canvas
  num documento sem script mostra só o conteúdo de reserva (consequência do item 1 da segurança).
- `pdf.js`: reescrito sobre o `pdfjs-dist` do app, sem a camada de anotações do PDF, com o CSS da camada de
  texto embutido e `book.amostraDeTexto` para o aviso de PDF escaneado/duas colunas.

## Formatos religados (28/10/2026), mesmo commit 78914ae do upstream

- `mobi.js`, `fb2.js`, `comic-book.js`: copiados do upstream (MIT, a mesma LICENSE da pasta). Não há `unrar`:
  CBR (RAR) segue fora.
- `mobi.js`: **DRM.** O campo `encryption` do cabeçalho PalmDOC (0 = sem proteção) era lido e nunca verificado.
  Agora `open()` lança `DRMError` se for diferente de 0, tanto no registro 0 quanto no registro KF8 de um arquivo
  combo. O Frasy só reconhece e recusa: não há código para remover proteção. A checagem antes de importar
  (sem abrir o livro) está em `src/core/livros/formatos.ts`.
- `fb2.js`: `getCover` decodificava o `data:` com `fetch`, que a CSP (`connect-src`) não libera; passou a
  decodificar o base64 no lugar.
- `comic-book.js`: extensão sem diferenciar maiúscula (`PAGINA.JPG`) e sem lixo de macOS (`__MACOSX/`, `._x`).
- `view.js`: ver "Recorte".

## Limpeza dos capítulos de MOBI/KF8/FB2/CBZ (28/10/2026), falha fechada

- `frasy-limpeza.js` (novo): `limparSecao` despacha o evento `data` do livro e EXIGE que o motor o marque
  (`detail.frasyLimpo`); sem a marca lança "Capítulo sem limpeza" e nada vira `blob:`.
- `mobi.js`: `MOBI6` ganha `transformTarget` e `MOBI6.loadSection`/`KF8.loadSection` passam o capítulo por
  `limparSecao` antes do `URL.createObjectURL`. `loadResourceBlob` do KF8 perdia o tipo (`{ newType }`): corrigido.
- `fb2.js`: `transformTarget` e capítulo criado sob demanda depois da limpeza; `getImageSrc` só aceita `#id`
  local de um `<binary>` com `content-type` `image/*`; qualquer outro `href` vira `data:,`.
- `comic-book.js` e `pdf.js`: `frasyConfiavel = true` (a página é HTML fixo do Frasy com `blob:` local da
  própria imagem). O motor (`MotorDoLeitor.blindar`) RECUSA (`ErroDoLivro`) o livro que não tem `transformTarget`
  nem essa marca. Os livros de texto (`livroDeTexto.ts`) também a trazem.
- Teto de zip (entradas, tamanho por entrada e total, razão 200:1, caminhos `..`/absolutos, páginas de CBZ) em
  `src/core/livros/zipSeguro.ts`, aplicado em `lerArquivoTrazido` antes de descompactar.
