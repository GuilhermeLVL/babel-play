/**
 * O RASCUNHO DA CAPTURA — a captura que ainda não está no servidor, guardada neste navegador.
 *
 * Nenhuma saída do fim da captura pode perder o que foi transcrito em silêncio (relato do dono,
 * 2026-09-28). O rascunho é gravado ANTES da primeira ida à rede e só sai quando as falas estão
 * guardadas: se o salvamento falha, se a pessoa entra na conta (a tela de login desmonta a
 * captura) ou fecha a aba, a captura volta na próxima visita à tela, com "Tentar de novo",
 * "Baixar" e "Descartar". O áudio não entra (é grande demais para o `localStorage`); o texto, sim.
 *
 * Até `MAX_RASCUNHOS`, o mais recente primeiro. Toda leitura e escrita é best-effort: sem storage
 * (aba privada, cota), a captura segue na tela e o rascunho simplesmente não existe.
 *
 * DE QUEM É (`lib/armazemLocalPorConta`): o rascunho leva o dono. O do visitante sem conta passa para a conta que entra
 * (é o caso de uso acima); o de uma conta NUNCA passa a outra, e sair, limpar tudo e excluir a conta o apagam.
 */
import type { NewUtterancePayload } from '../../data/rotas/sessoes';
import { criarChaveLocalPorConta } from '../armazemLocalPorConta';

export const CHAVE_DO_RASCUNHO = 'babel.capturas_pendentes';
export const MAX_RASCUNHOS = 5;

export interface RascunhoDaCaptura {
  /** Chave de idempotência da captura: o mesmo id em toda tentativa (`origemLocalId`). */
  origemLocalId: string;
  /** Sessão retomada: as falas substituem as desse id. */
  resumeId: string | null;
  titulo: string;
  capa: string;
  durationMs: number;
  /** O par gravado na sessão (o do conteúdo, `parDaSessao`) e o par configurado da captura. */
  sourceLang: string;
  targetLang: string;
  parConfigurado: { sourceLang: string; targetLang: string };
  utterances: NewUtterancePayload[];
  criadoEm: number;
  /** A captura foi uma conversa do modo intérprete (Fase E): vai ao `meta.scenario` da sessão. */
  cenario?: 'interprete';
}

const lista = criarChaveLocalPorConta<RascunhoDaCaptura[]>(CHAVE_DO_RASCUNHO, {
  nome: 'rascunho-da-captura',
  adotarDoAnonimo: true,
});

export function lerRascunhos(): RascunhoDaCaptura[] {
  const bruto = lista.ler();
  return Array.isArray(bruto)
    ? bruto.filter((r) => r && typeof r.origemLocalId === 'string' && Array.isArray(r.utterances))
    : [];
}

function gravar(l: RascunhoDaCaptura[]): boolean {
  return lista.gravar(l.slice(0, MAX_RASCUNHOS));
}

/** Guarda (ou atualiza) o rascunho desta captura no topo da lista. `false` = sem storage. */
export function guardarRascunho(r: RascunhoDaCaptura): boolean {
  return gravar([r, ...lerRascunhos().filter((x) => x.origemLocalId !== r.origemLocalId)]);
}

export function apagarRascunho(origemLocalId: string): void {
  const atuais = lerRascunhos();
  const resto = atuais.filter((x) => x.origemLocalId !== origemLocalId);
  if (resto.length !== atuais.length) gravar(resto);
}
