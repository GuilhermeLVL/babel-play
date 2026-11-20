import { lazyComRecarga } from '../../../../lib/lazyComRecarga';

/**
 * A PÁGINA DO INTÉRPRETE É UM PEDAÇO À PARTE dentro da captura. Mora aqui, e não em `LiveCapture.tsx`, para
 * a pré-carga (`App.tsx`) pedir o MESMO `lazyComRecarga` que a captura desenha: com o componente guardado,
 * a primeira visita ao Intérprete não suspende (auditoria de 23/10/2026, B3).
 */
export const PaginaDoInterprete = lazyComRecarga(() => import('./PaginaDoInterprete'));
