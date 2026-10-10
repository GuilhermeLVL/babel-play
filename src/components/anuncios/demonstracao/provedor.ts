import type { ProvedorDeAnuncios } from '../../../lib/anuncios/provedor';
import EspacoDeDemonstracao from './EspacoDeDemonstracao';

/** O provedor de DEMONSTRAÇÃO: só desenha exemplos, sem rede. Só chega ao navegador em desenvolvimento. */
export const PROVEDOR_DE_DEMONSTRACAO: ProvedorDeAnuncios = { id: 'demonstracao', Espaco: EspacoDeDemonstracao };
