// FRASY: adaptação do `pdf.js` do foliate-js (MIT) para o `pdfjs-dist` que o app já usa (Apache-2.0),
// carregado sob demanda e com o worker como arquivo próprio (`?url`), como em `src/lib/import/pdfjsNoNavegador.ts`.
// Diferenças do original (ver ORIGEM.txt): sem a camada de anotações do PDF (links internos/formulários) e com
// o CSS da camada de texto embutido (o original buscava os `.css` do vendor por fetch). A amostra para o aviso de
// PDF escaneado ou de duas colunas sai daqui (`book.amostraDeTexto`), e a regra é de `src/core/leitura/diagnosticoDoPdf.ts`.
let pdfjsLib = null
const carregarPdfjs = async () => {
    if (pdfjsLib) return pdfjsLib
    const lib = await import('pdfjs-dist')
    lib.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjsLib = lib
    return lib
}

// A camada de texto do PDF.js 6.4 (`web/pdf_viewer.css`, Apache-2.0): o texto transparente sobre o canvas,
// que é o que permite selecionar, grifar e tocar na palavra.
const textLayerCSS = `.textLayer {
  color-scheme: only light;

  position: absolute;
  text-align: initial;
  inset: 0;
  overflow: clip;
  opacity: 1;
  line-height: 1;
  letter-spacing: normal;
  word-spacing: normal;
  -webkit-text-size-adjust: none;
     -moz-text-size-adjust: none;
          text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  caret-color: CanvasText;
  z-index: 0;

  &.highlighting {
    touch-action: none;
  }

  :is(span, br) {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
    -webkit-user-select: text;
       -moz-user-select: text;
            user-select: text;
  }
  --min-font-size: 1;
  --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
  --min-font-size-inv: calc(1 / var(--min-font-size));

  > :not(.markedContent),
  .markedContent span:not(.markedContent) {
    z-index: 1;

    --font-height: 0;
    font-size: calc(var(--text-scale-factor) * var(--font-height));

    --scale-x: 1;
    --rotate: 0deg;
    transform: rotate(var(--rotate)) scaleX(var(--scale-x))
      scale(var(--min-font-size-inv));
  }

  .markedContent {
    display: contents;
  }

  span[role="img"] {
    -webkit-user-select: none;
       -moz-user-select: none;
            user-select: none;
    cursor: default;
  }

  .highlight {
    --highlight-bg-color: rgb(180 0 170 / 0.25);
    --highlight-selected-bg-color: rgb(0 100 0 / 0.25);
    --highlight-backdrop-filter: none;
    --highlight-selected-backdrop-filter: none;

    @media screen and (forced-colors: active) {
      --highlight-bg-color: transparent;
      --highlight-selected-bg-color: transparent;
      --highlight-backdrop-filter: var(--hcm-highlight-filter);
      --highlight-selected-backdrop-filter: var(
        --hcm-highlight-selected-filter
      );
    }

    margin: -1px;
    padding: 1px;
    background-color: var(--highlight-bg-color);
    backdrop-filter: var(--highlight-backdrop-filter);
    border-radius: 4px;

    &.appended {
      position: initial;
    }

    &.begin {
      border-radius: 4px 0 0 4px;
    }

    &.end {
      border-radius: 0 4px 4px 0;
    }

    &.middle {
      border-radius: 0;
    }

    &.selected {
      background-color: var(--highlight-selected-bg-color);
      backdrop-filter: var(--highlight-selected-backdrop-filter);
      scroll-margin-top: 50px;
    }
  }

  ::-moz-selection {
    background: rgba(0 0 255 / 0.25);
    background: color-mix(in srgb, AccentColor, transparent 50%);
    color: transparent;
  }

  ::selection {
    background: rgba(0 0 255 / 0.25);
    background: color-mix(in srgb, AccentColor, transparent 50%);
    color: transparent;
  }

  &.selectionRendering {
    ::-moz-selection {
      background: transparent;
      color: transparent;
    }
    ::selection {
      background: transparent;
      color: transparent;
    }
  }
  br::-moz-selection {
    background: transparent;
  }
  br::selection {
    background: transparent;
  }

  .endOfContent {
    display: block;
    position: absolute;
    inset: 100% 0 0;
    z-index: 0;
    cursor: default;
    -webkit-user-select: none;
       -moz-user-select: none;
            user-select: none;
  }

  &.selecting .endOfContent {
    top: 0;
  }
}
`

const render = async (page, doc, zoom) => {
    const scale = zoom * devicePixelRatio
    doc.documentElement.style.transform = `scale(${1 / devicePixelRatio})`
    doc.documentElement.style.transformOrigin = 'top left'
    doc.documentElement.style.setProperty('--scale-factor', scale)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.height = viewport.height
    canvas.width = viewport.width
    const canvasContext = canvas.getContext('2d')
    await page.render({ canvasContext, viewport, canvas }).promise
    // FRASY: o iframe do livro não tem `allow-scripts`, e num documento sem script o `<canvas>` vira o conteúdo
    // de reserva (não desenha). A página vai como `<img>` (`blob:`), do tamanho do canvas (ver PATCHES.md).
    const blob = await new Promise(resolve => canvas.toBlob(resolve))
    const img = doc.createElement('img')
    img.alt = ''
    img.src = URL.createObjectURL(blob)
    img.style.width = `${canvas.width}px`
    img.style.height = `${canvas.height}px`
    img.style.display = 'block'
    const alvo = doc.querySelector('#canvas')
    const antiga = alvo.querySelector('img')
    if (antiga) URL.revokeObjectURL(antiga.src)
    alvo.replaceChildren(img)
    const container = doc.querySelector('.textLayer')
    // FRASY: a camada é montada fora e trocada de uma vez — dois `onZoom` seguidos duplicavam o texto.
    const montagem = doc.createElement('div')
    const textLayer = new pdfjsLib.TextLayer({
        textContentSource: await page.streamTextContent(),
        container: montagem, viewport,
    })
    await textLayer.render()
    container.replaceChildren(...montagem.childNodes)
    for (const prop of ['--total-scale-factor', '--scale-round-x', '--scale-round-y'])
        if (montagem.style.getPropertyValue(prop)) container.style.setProperty(prop, montagem.style.getPropertyValue(prop))
    for (const c of document.querySelectorAll('.hiddenCanvasElement'))
        Object.assign(c.style, { position: 'absolute', top: '0', left: '0', width: '0', height: '0', display: 'none' })
    const endOfContent = document.createElement('div')
    endOfContent.className = 'endOfContent'
    container.append(endOfContent)
}

const renderPage = async (page, getImageBlob) => {
    const viewport = page.getViewport({ scale: 1 })
    if (getImageBlob) {
        const canvas = document.createElement('canvas')
        canvas.height = viewport.height
        canvas.width = viewport.width
        await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise
        return new Promise(resolve => canvas.toBlob(resolve))
    }
    const src = URL.createObjectURL(new Blob([`
        <!DOCTYPE html>
        <html lang="">
        <meta charset="utf-8">
        <meta name="viewport" content="width=${viewport.width}, height=${viewport.height}">
        <style>
        html, body { margin: 0; padding: 0; }
        :root { --user-unit: 1; --total-scale-factor: calc(var(--scale-factor) * var(--user-unit)); --scale-round-x: 1px; --scale-round-y: 1px; }
        ${textLayerCSS}
        </style>
        <div id="canvas"></div>
        <div class="textLayer"></div>
    `], { type: 'text/html' }))
    const onZoom = ({ doc, scale }) => render(page, doc, scale)
    return { src, onZoom }
}

const makeTOCItem = item => ({
    label: item.title,
    href: JSON.stringify(item.dest),
    subitems: item.items.length ? item.items.map(makeTOCItem) : null,
})

/** Quantas páginas a amostra do aviso lê. */
const PAGINAS_DA_AMOSTRA = 3

export const makePDF = async file => {
    await carregarPdfjs()
    const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        isEvalSupported: false,
        useSystemFonts: true,
    }).promise

    const book = { rendition: { layout: 'pre-paginated' } }
    const { metadata, info } = await pdf.getMetadata() ?? {}
    book.metadata = {
        title: metadata?.get('dc:title') ?? info?.Title,
        author: metadata?.get('dc:creator') ?? info?.Author,
        language: metadata?.get('dc:language'),
    }
    const outline = await pdf.getOutline()
    book.toc = outline?.map(makeTOCItem)

    const cache = new Map()
    book.sections = Array.from({ length: pdf.numPages }).map((_, i) => ({
        id: i,
        load: async () => {
            const cached = cache.get(i)
            if (cached) return cached
            const url = await renderPage(await pdf.getPage(i + 1))
            cache.set(i, url)
            return url
        },
        size: 1000,
    }))
    book.isExternal = uri => /^\w+:/i.test(uri)
    book.resolveHref = async href => {
        const parsed = JSON.parse(href)
        const dest = typeof parsed === 'string' ? await pdf.getDestination(parsed) : parsed
        return { index: await pdf.getPageIndex(dest[0]) }
    }
    book.splitTOCHref = async href => {
        const parsed = JSON.parse(href)
        const dest = typeof parsed === 'string' ? await pdf.getDestination(parsed) : parsed
        return [await pdf.getPageIndex(dest[0]), null]
    }
    book.getTOCFragment = doc => doc.documentElement
    book.getCover = async () => renderPage(await pdf.getPage(1), true)
    // FRASY: a amostra das primeiras páginas para o aviso (escaneado / duas colunas).
    book.amostraDeTexto = async () => {
        const paginas = []
        for (let n = 1; n <= Math.min(PAGINAS_DA_AMOSTRA, pdf.numPages); n++) {
            const page = await pdf.getPage(n)
            const { width } = page.getViewport({ scale: 1 })
            const { items } = await page.getTextContent()
            paginas.push({
                largura: width,
                itens: items.filter(it => 'str' in it).map(it => ({ x: it.transform[4], largura: it.width, texto: it.str })),
            })
        }
        return paginas
    }
    book.destroy = () => pdf.destroy()
    return book
}
