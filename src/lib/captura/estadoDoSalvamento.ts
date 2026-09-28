/**
 * O ESTADO DO SALVAMENTO DA CAPTURA — fora do componente, para sobreviver à troca de tela.
 *
 * Relato do dono (2026-09-28): "encerrar demora, trava e eu fico preso na tela". O salvamento era
 * uma função da tela: o aviso "Salvando sessão…" só aparecia depois de o áudio ser misturado, e
 * sair da tela no meio perdia o recado. Agora o trabalho é do MÓDULO (`trabalhoDeSalvar.ts`) e o
 * estado mora aqui, numa FOLHA sem dependência nenhuma: o indicador do App lê daqui sem trazer a
 * captura para o pacote inicial, e a tela de captura, montada de novo, encontra o mesmo estado.
 *
 * `useSyncExternalStore` lê por `lerSalvamento`/`assinarSalvamento`.
 */

export type EtapaDoSalvamento = 'finais' | 'falas' | 'audio' | 'vocabulario';

/** O que deu errado, em termos que a tela usa para escolher a saída. */
export interface FalhaDoSalvamento {
  mensagem: string;
  codigo?: string;
  /** 0 = sem resposta (rede, prazo). */
  status: number;
  /** O teto sem conta recusou (507 `TETO_ANONIMO`). */
  teto: boolean;
}

export type EstadoDoSalvamento =
  | { fase: 'ocioso' }
  | {
      fase: 'salvando';
      origemLocalId: string;
      titulo: string;
      etapa: EtapaDoSalvamento;
      /** Falas já guardadas / total (lotes). */
      feitas: number;
      total: number;
    }
  | {
      fase: 'salvo';
      origemLocalId: string;
      titulo: string;
      sessaoId: string;
      /** Palavras fichadas; `null` enquanto o vocabulário é fichado. */
      palavras: number | null;
      /** O resumo do fim ("N palavras fichadas · …"), quando há. */
      resumo?: string;
    }
  | { fase: 'falhou'; origemLocalId: string; titulo: string; falha: FalhaDoSalvamento };

let estado: EstadoDoSalvamento = { fase: 'ocioso' };
const ouvintes = new Set<() => void>();

export function lerSalvamento(): EstadoDoSalvamento {
  return estado;
}

export function assinarSalvamento(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function definirSalvamento(novo: EstadoDoSalvamento): void {
  estado = novo;
  for (const o of [...ouvintes]) o();
}

/**
 * A TRAVA DE SAÍDA DA CAPTURA só vale para o que se perderia (relato do dono, 2026-09-28).
 *
 * Antes ela olhava só "há falas na tela": depois de "Salvar e ficar aqui" as falas continuavam à
 * vista, sair perguntava de novo, e "Salvar na Biblioteca" criava uma SEGUNDA sessão (medido: 2 no
 * IndexedDB). Gravando, trava; com falas, trava só se elas não estão salvas, nem salvando (o
 * trabalho continua fora da tela), nem guardadas no rascunho do navegador.
 */
export function capturaEmRisco(e: {
  gravando: boolean;
  falas: number;
  salva: boolean;
  salvando: boolean;
  noRascunho: boolean;
}): boolean {
  if (e.gravando) return true;
  return e.falas > 0 && !e.salva && !e.salvando && !e.noRascunho;
}
