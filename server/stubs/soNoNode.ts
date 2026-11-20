/**
 * STUBS DO BUNDLE DO WORKER (Fase 2, Task 12). Os pacotes que só existem no Node (WASM, binário nativo,
 * DOM inteiro) entram no bundle do Worker por `alias` do `wrangler.jsonc` apontando para os arquivos desta
 * pasta, que reexportam daqui. Nenhum caminho do Worker deve chegar neles: as rotas que precisariam deles
 * já respondem 503 `indisponivel_neste_runtime` (importação), não montam (`/api/audio`) ou nem abrem o
 * driver (PGlite: o banco do Worker é o `Client` da requisição). Se algum chegar, falha ALTO com o nome do
 * pacote, em vez de um `undefined is not a function` longe da causa.
 */
export class SoNoNode extends Error {
  readonly status = 503
  readonly code = 'indisponivel_neste_runtime'
  constructor(pacote: string) {
    super(`${pacote} só existe no servidor Node; este caminho não deveria rodar no Worker`)
    this.name = 'SoNoNode'
  }
}

/** Uma classe que lança ao ser construída. */
export function classeSoNoNode(pacote: string): new (...args: unknown[]) => never {
  return class {
    constructor() {
      throw new SoNoNode(pacote)
    }
  } as unknown as new (...args: unknown[]) => never
}

/** Uma função que lança ao ser chamada. */
export function funcaoSoNoNode(pacote: string): (...args: unknown[]) => never {
  return () => {
    throw new SoNoNode(pacote)
  }
}
