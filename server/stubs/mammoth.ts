/** `mammoth` no Worker: só a importação de documento usa, e ela responde 503 no Worker (`routes/import.ts`). */
import { funcaoSoNoNode } from './soNoNode'

export default { extractRawText: funcaoSoNoNode('mammoth') }
