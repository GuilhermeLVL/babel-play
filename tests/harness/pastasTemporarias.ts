/**
 * Pastas temporárias de teste que SE LIMPAM: cada `criarPasta()` é registrada e `limparPastas()` (chamada num
 * `afterEach`/`afterAll`) as apaga. Os testes da bancada de voz criavam `mkdtemp` e nunca removiam.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export function criarGerenciadorDePastas() {
  const criadas: string[] = []
  return {
    /** Cria uma pasta temporária com o prefixo dado e a registra para a limpeza. */
    criarPasta(prefixo: string): string {
      const dir = mkdtempSync(path.join(tmpdir(), prefixo))
      criadas.push(dir)
      return dir
    },
    /** Apaga todas as pastas criadas até aqui. */
    limparPastas(): void {
      for (const dir of criadas.splice(0)) rmSync(dir, { recursive: true, force: true })
    },
  }
}
