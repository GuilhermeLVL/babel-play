// FRASY: arquivo novo (MIT, como o resto do repositório). Todo capítulo de MOBI, KF8 e FB2 passa pelo MESMO
// caminho do EPUB antes de virar `blob:`: o evento `data` no `transformTarget` do livro, que o motor
// (`../motor.ts`, `blindar()`) trata com `limparCapitulo` (DOMPurify + CSP do capítulo). FALHA FECHADA: se
// ninguém marcou o evento como limpo (`detail.frasyLimpo`), o capítulo é recusado e nada vira `blob:`.
export const limparSecao = async (alvo, data, type, name) => {
    const detail = { data, type, name }
    alvo.dispatchEvent(new CustomEvent('data', { detail }))
    if (!detail.frasyLimpo) throw new Error('Capítulo sem limpeza: recusado')
    return { data: await detail.data, type: await detail.type }
}
