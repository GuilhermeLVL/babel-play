/**
 * Retrato do saldo da chave: `GET /api/v1/key` (grátis). Imprime e grava SÓ os números.
 * Uso: node scripts/eval-fala/bancada/nuvem/retrato.mjs --rotulo antes
 */
import { gastoTotal, limpar, opt, retratoDaChave, TETO_USD } from './comum.mjs'

try {
  const r = await retratoDaChave(opt('rotulo', ''))
  console.log(
    `retrato ${r.rotulo || '(sem gravar)'} ${r.em}: limit ${r.limit} | usage ${r.usage} | limit_remaining ${r.limit_remaining} | camada grátis: ${r.is_free_tier}`,
  )
  console.log(`livro-caixa desta rodada: US$ ${gastoTotal().toFixed(6)} de US$ ${TETO_USD.toFixed(2)}`)
} catch (e) {
  console.error('FALHOU:', limpar(e?.message ?? e))
  process.exit(1)
}
