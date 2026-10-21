/**
 * A FLAG `anuncios` NO WORKER, PARA A CSP (ruling R31). A CSP do `_headers` é fixa no build; quando os
 * anúncios estão ligados, o Worker sobrepõe o `Content-Security-Policy` dos documentos HTML
 * (`cspComAnuncios`, em `csp.ts`). Para não ir ao banco a cada navegação, o VALOR da flag fica guardado
 * por isolate durante 60 s (nunca a promessa: uma promessa de uma requisição não pode ser esperada por
 * outra no workerd). Custo aceito: até 60 s de CSP com o `frame-src` depois de desligar a flag.
 *
 * "Ligada" aqui é a linha estar habilitada (`habilitada`), não a avaliação por pessoa: a CSP só ABRE o
 * quadro da origem de anúncios; quem decide se um anúncio aparece é a política do cliente.
 */
export const TTL_DA_FLAG_NA_CSP_MS = 60_000

let guardado: { em: number; ligada: boolean } | null = null

/** A flag, do cache do isolate ou de `ler()`. Falha ao ler = desligada (fica a CSP estreita). */
export async function anunciosLigadosNoIsolate(ler: () => Promise<boolean>, agora = Date.now()): Promise<boolean> {
  if (guardado && agora - guardado.em < TTL_DA_FLAG_NA_CSP_MS) return guardado.ligada
  let ligada: boolean
  try {
    ligada = await ler()
  } catch {
    ligada = false
  }
  guardado = { em: agora, ligada }
  return ligada
}

/** Só para testes. */
export function _zerarCacheDosAnuncios(): void {
  guardado = null
}
