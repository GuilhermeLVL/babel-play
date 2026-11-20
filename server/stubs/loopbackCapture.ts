/** `loopback-capture` (binário N-API do Windows) no Worker: `/api/audio` nem é montado lá (`http/app.ts`). */
import { classeSoNoNode } from './soNoNode'

export const LoopbackCapture = classeSoNoNode('loopback-capture')
export default { LoopbackCapture }
