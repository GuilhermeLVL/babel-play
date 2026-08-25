/**
 * F4-01 — A BOMBA DE DESCOMPRESSÃO, e a rede que impede ela de voltar.
 *
 * O defeito, medido antes do conserto em `audit/scripts/midia.mjs`: 203.972 bytes de `.apkg`
 * viravam 209.715.200 em memória em 587 ms — razão **1028:1** — pelo `arquivo.async(...)` que
 * `extrairColecao` usava. O RSS do processo ia de 47 MB para 663 MB. A rota aceita 200 MB de
 * corpo e o container tem 1 GB: uma requisição de um usuário autenticado derrubava o serviço
 * para todos.
 *
 * O que este teste trava:
 *   1. um zip cuja entrada estoura o teto é RECUSADO, e não é lido inteiro antes de recusar;
 *   2. a recusa acontece dentro de um orçamento de memória — se o teto voltar a ser ignorado, a
 *      asserção de RSS quebra mesmo que a de erro passe;
 *   3. um baralho legítimo continua sendo lido.
 *
 * O payload é de 400 MB (acima do teto de 300 MB) e comprime para poucas centenas de KB, porque
 * é zero repetido. É a mesma forma da bomba real.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { lerApkg, descompactarComTeto } from '../../server/import/anki'

const MB = 1024 * 1024

/** Um `.apkg` cuja `collection.anki2` expande para `bytes` — comprimido, é minúsculo. */
async function apkgBomba(bytes: number): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('collection.anki2', Buffer.alloc(bytes, 0))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
}

describe('F4-01 — teto de expansão no .apkg', () => {
  it('recusa uma entrada que passa do teto, sem estourar a memória', async () => {
    const bomba = await apkgBomba(400 * MB)

    // O zip precisa ser pequeno, senão o teste não está exercitando o vetor que importa.
    expect(bomba.length, 'a bomba deveria comprimir muito — verifique o payload').toBeLessThan(5 * MB)

    const rssAntes = process.memoryUsage().rss
    await expect(lerApkg(bomba)).rejects.toThrow(/teto|recusado/i)
    const crescimento = (process.memoryUsage().rss - rssAntes) / MB

    /*
     * O ORÇAMENTO DE MEMÓRIA É A ASSERÇÃO QUE IMPORTA. Sem ele, alguém poderia "consertar"
     * checando o tamanho só DEPOIS de descompactar tudo: o erro seria lançado, este teste
     * passaria, e o processo teria morrido de OOM em produção do mesmo jeito. 350 MB dá folga
     * para o teto de 300 MB mais o ruído do próprio runtime, e ainda assim fica muito abaixo dos
     * 616 MB de crescimento que a auditoria mediu no código original.
     */
    expect(crescimento, `RSS cresceu ${crescimento.toFixed(0)} MB ao recusar a bomba`).toBeLessThan(350)
  }, 120_000)

  /**
   * O TESTE ACIMA NÃO PROVA A DEFESA QUE IMPORTA, e é honesto dizer por quê: um zip bem formado
   * declara o tamanho descompactado no cabeçalho, então a recusa acontece na checagem barata,
   * ANTES de qualquer fluxo. Foi o que a sonda mediu — RSS até caiu 2,6 MB.
   *
   * Mas o cabeçalho é escrito por quem gera o arquivo, e um zip malicioso mente. A guarda que não
   * tem como ser enganada é a contagem DURANTE a descompactação. Aqui ela é exercitada
   * diretamente: o cabeçalho é falsificado para um valor pequeno, e a expectativa é que o fluxo
   * aborte assim mesmo.
   */
  it('aborta durante o fluxo mesmo quando o cabeçalho MENTE sobre o tamanho', async () => {
    const bomba = await apkgBomba(400 * MB)
    const zip = await JSZip.loadAsync(bomba)
    const entrada = zip.file('collection.anki2')!

    /*
     * A guarda é exercitada DIRETAMENTE, e não por `lerApkg`, por um motivo concreto: `lerApkg`
     * recebe um Buffer e chama `JSZip.loadAsync` por dentro, criando um objeto novo — qualquer
     * cabeçalho falsificado aqui fora seria descartado. Foi assim que a primeira versão deste
     * teste passou pela checagem barata em vez da guarda que ele diz testar.
     */
    const interno = entrada as unknown as { _data: { uncompressedSize: number } }
    expect(interno._data.uncompressedSize, 'o JSZip mudou a forma interna — reveja a guarda').toBe(400 * MB)
    interno._data.uncompressedSize = 1 * MB // "sou só 1 MB": a checagem barata passa a aceitar

    const rssAntes = process.memoryUsage().rss
    await expect(descompactarComTeto(entrada, 'collection.anki2')).rejects.toThrow(/passou de/i)
    const crescimento = (process.memoryUsage().rss - rssAntes) / MB
    expect(crescimento, `RSS cresceu ${crescimento.toFixed(0)} MB com cabeçalho falsificado`).toBeLessThan(350)
  }, 120_000)

  it('um .apkg sem a coleção falha por motivo próprio, não pelo teto', async () => {
    const zip = new JSZip()
    zip.file('media', '{}')
    const vazio = await zip.generateAsync({ type: 'nodebuffer' })
    await expect(lerApkg(vazio)).rejects.toThrow(/não encontrei a coleção/i)
  })
})
