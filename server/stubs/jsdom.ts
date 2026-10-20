/** `jsdom` no Worker: só a importação de link web usa, e ela responde 503 no Worker (`routes/import.ts`). */
import { classeSoNoNode } from './soNoNode'

export const JSDOM = classeSoNoNode('jsdom')
