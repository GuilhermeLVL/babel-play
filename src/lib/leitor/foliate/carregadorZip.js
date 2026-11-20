// FRASY: carregador de ZIP do EPUB sobre o `fflate` (substitui o `vendor/zip.js` do foliate-js).
// Mesma interface que o `makeZipLoader` original entrega ao `EPUB`: `entries`, `loadText`, `loadBlob`,
// `getSize`. Descompacta sob demanda (só o arquivo pedido), com teto por entrada contra zip-bomba.
import { unzip } from 'fflate'

/** Teto de uma entrada descompactada (um capítulo ou uma imagem de um EPUB real fica muito abaixo). */
const TETO_POR_ENTRADA = 64 * 1024 * 1024

export const makeZipLoader = async file => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const tamanhos = new Map()
    // Primeira passada: só o índice (o filtro devolve false e nada é descompactado).
    await new Promise((resolve, reject) => unzip(bytes, {
        filter: f => { tamanhos.set(f.name, f.originalSize); return false },
    }, err => err ? reject(err) : resolve()))
    const carregar = name => new Promise((resolve, reject) => {
        if (!tamanhos.has(name)) return resolve(null)
        if ((tamanhos.get(name) ?? 0) > TETO_POR_ENTRADA) return reject(new Error(`entrada grande demais: ${name}`))
        unzip(bytes, { filter: f => f.name === name }, (err, files) => err ? reject(err) : resolve(files[name] ?? null))
    })
    const decoder = new TextDecoder()
    const loadText = async name => {
        const b = await carregar(name)
        return b ? decoder.decode(b) : null
    }
    const loadBlob = async (name, type) => {
        const b = await carregar(name)
        return b ? new Blob([b], type ? { type } : undefined) : null
    }
    const getSize = name => tamanhos.get(name) ?? 0
    const entries = [...tamanhos.keys()].map(filename => ({ filename }))
    return { entries, loadText, loadBlob, getSize }
}
