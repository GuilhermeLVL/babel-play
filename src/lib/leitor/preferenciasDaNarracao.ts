/**
 * AS ESCOLHAS DA NARRAÇÃO NO APARELHO: velocidade, tom, volume, pausas, repetições e o "Meu estilo". Ficam no
 * `localStorage` (como o perfil de leitura); sem armazenamento, valem só nesta visita. A regra de cada valor é
 * do core (`estilosDeLeitura.ts`): o que vier corrompido ou fora do intervalo volta ao padrão.
 */
import {
  ajustesDeOpcoes,
  type AjustesDoEstilo,
  normalizarOpcoes,
  OPCOES_PADRAO_DA_NARRACAO,
  type OpcoesDaNarracao,
} from '../../core/leitura/estilosDeLeitura';

export const CHAVE_DAS_OPCOES = 'leitor:narracao:opcoes';
export const CHAVE_DO_MEU_ESTILO = 'leitor:narracao:meu-estilo';
/** A chave de antes dos ajustes novos: só a velocidade. */
const CHAVE_DA_VELOCIDADE_ANTIGA = 'leitor:narracao:velocidade';

const ler = (chave: string): string | null => {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
};
const gravar = (chave: string, valor: string) => {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
};
const json = (texto: string | null): unknown => {
  try {
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
};

export function lerOpcoesDaNarracao(): OpcoesDaNarracao {
  const guardadas = json(ler(CHAVE_DAS_OPCOES));
  if (guardadas && typeof guardadas === 'object') return normalizarOpcoes(guardadas as Record<string, unknown>);
  const antiga = Number(ler(CHAVE_DA_VELOCIDADE_ANTIGA));
  return normalizarOpcoes(
    Number.isFinite(antiga) && antiga > 0 ? { velocidade: antiga } : null,
    OPCOES_PADRAO_DA_NARRACAO,
  );
}

export const gravarOpcoesDaNarracao = (o: OpcoesDaNarracao) => gravar(CHAVE_DAS_OPCOES, JSON.stringify(o));

export function lerMeuEstilo(): AjustesDoEstilo | null {
  const g = json(ler(CHAVE_DO_MEU_ESTILO));
  if (!g || typeof g !== 'object') return null;
  return ajustesDeOpcoes(normalizarOpcoes(g as Record<string, unknown>));
}

export const gravarMeuEstilo = (o: OpcoesDaNarracao) => gravar(CHAVE_DO_MEU_ESTILO, JSON.stringify(ajustesDeOpcoes(o)));
