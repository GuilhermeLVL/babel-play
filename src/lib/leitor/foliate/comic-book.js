export const makeComicBook = ({ entries, loadBlob, getSize }, file) => {
    const cache = new Map()
    const urls = new Map()
    const load = async name => {
        if (cache.has(name)) return cache.get(name)
        const src = URL.createObjectURL(await loadBlob(name))
        const page = URL.createObjectURL(
            new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin: 0"><img src="${src}"></body></html>`], { type: 'text/html' }))
        urls.set(name, [src, page])
        cache.set(name, page)
        return page
    }
    const unload = name => {
        urls.get(name)?.forEach?.(url => URL.revokeObjectURL(url))
        urls.delete(name)
        cache.delete(name)
    }

    const exts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.jxl', '.avif']
    const files = entries
        .map(entry => entry.filename)
        // FRASY: extensão sem diferenciar maiúscula (`PAGINA.JPG`); sem diretórios nem `__MACOSX`.
        .filter(name => !name.startsWith('__MACOSX/') && !name.split('/').pop().startsWith('._'))
        .filter(name => exts.some(ext => name.toLowerCase().endsWith(ext)))
        .sort(new Intl.Collator([], { numeric: true }).compare)
    if (!files.length) throw new Error('No supported image files in archive')

    const book = {}
    // FRASY: a página é um HTML FIXO nosso (só um <img> com `blob:` local da própria imagem do arquivo): nada do
    // livro vira marcação. O motor aceita livro sem `transformTarget` apenas com esta marca.
    book.frasyConfiavel = true
    book.getCover = () => loadBlob(files[0])
    book.metadata = { title: file.name }
    book.sections = files.map(name => ({
        id: name,
        load: () => load(name),
        unload: () => unload(name),
        size: getSize(name),
    }))
    book.toc = files.map(name => ({ label: name, href: name }))
    book.rendition = { layout: 'pre-paginated' }
    book.resolveHref = href => ({ index: book.sections.findIndex(s => s.id === href) })
    book.splitTOCHref = href => [href, null]
    book.getTOCFragment = doc => doc.documentElement
    book.destroy = () => {
        for (const arr of urls.values())
            for (const url of arr) URL.revokeObjectURL(url)
    }
    return book
}
