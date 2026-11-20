/**
 * GANCHO DO AQUECIMENTO NA INTENÇÃO (openspec `aquecer-stt-na-intencao`).
 *
 * Chama `preaquecerModelos()` em modo padrão (as guardas de cache, nuvem e carga em voo vivem lá) quando
 * a pessoa dá sinal de que vai capturar: 200 ms de foco/ponteiro em "Iniciar", ou a confirmação dos
 * idiomas. Só age com a flag `aquecer_stt_na_intencao` ligada E a decisão pura do perfil dizendo sim.
 * Sem a flag, nenhum handler faz nada. Depois que a carga começa não se cancela; quem sai da tela tem
 * os workers encerrados pela liberação existente.
 */
import { useEffect, useRef } from 'react';

import {
  ATRASO_DA_INTENCAO_MS,
  deveAquecerNaIntencao,
  type EntradaDoAquecimento,
  FLAG_AQUECER_STT_NA_INTENCAO,
  type GatilhoDoAquecimento,
} from '../../core/harness/aquecerNaIntencao';
import { perfilDoDispositivo } from '../dispositivo/perfil';
import { flagLigada } from '../flags';
import { clog } from './tiposDaFala';

export interface DependenciasDaIntencao {
  /** O `preaquecerModelos` do pipeline, chamado SEM `aquecer: false`. */
  preaquecer: () => void | Promise<void>;
  flagLigada?: () => boolean;
  perfil?: () => Omit<EntradaDoAquecimento, 'gatilho'>;
  log?: (...args: unknown[]) => void;
  agendar?: (fn: () => void, ms: number) => unknown;
  cancelar?: (id: unknown) => void;
}

export interface GanchoDaIntencao {
  /** O foco ou o ponteiro entrou em "Iniciar": começa a contar os 200 ms. */
  ponteiroEntrou: () => void;
  /** Saiu antes de disparar: cancela. */
  ponteiroSaiu: () => void;
  /** A pessoa confirmou os idiomas: dispara já. */
  idiomasConfirmados: () => void;
}

function perfilAtual(): Omit<EntradaDoAquecimento, 'gatilho'> {
  const p = perfilDoDispositivo();
  return { poucaMemoria: p.poucaMemoria, leve: p.leve, tipo: p.tipo, isolado: p.sinais.isolado };
}

export function criarGanchoDaIntencao(dep: DependenciasDaIntencao): GanchoDaIntencao {
  const ligada = dep.flagLigada ?? (() => flagLigada(FLAG_AQUECER_STT_NA_INTENCAO));
  const perfil = dep.perfil ?? perfilAtual;
  const log = dep.log ?? clog;
  const agendar = dep.agendar ?? ((fn, ms) => setTimeout(fn, ms));
  const cancelar = dep.cancelar ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let pendente: unknown = null;

  const disparar = (gatilho: GatilhoDoAquecimento): void => {
    const d = deveAquecerNaIntencao({ ...perfil(), gatilho });
    if (!d.aquecer) {
      log('aquecimentoNaIntencao: ignorou', gatilho, '-', d.motivo);
      return;
    }
    log('aquecimentoNaIntencao: disparou', gatilho, '-', d.motivo);
    void Promise.resolve(dep.preaquecer()).catch(() => undefined);
  };

  const limpar = (): void => {
    if (pendente === null) return;
    cancelar(pendente);
    pendente = null;
  };

  return {
    ponteiroEntrou: () => {
      if (!ligada() || pendente !== null) return;
      pendente = agendar(() => {
        pendente = null;
        disparar('ponteiro');
      }, ATRASO_DA_INTENCAO_MS);
    },
    ponteiroSaiu: limpar,
    idiomasConfirmados: () => {
      if (!ligada()) return;
      limpar();
      disparar('idiomas');
    },
  };
}

/**
 * Hook da tela: o gancho é estável; o `preaquecer` é lido da ref a cada disparo (closure do render).
 * Ao desmontar, cancela o temporizador pendente: um disparo DEPOIS de sair da tela subiria os workers
 * fora dela (o que a correção G de 22/10/2026 evitou) e a liberação ao sair já teria passado.
 */
export function useAquecerNaIntencao(preaquecer: () => void | Promise<void>): GanchoDaIntencao {
  const ref = useRef(preaquecer);
  ref.current = preaquecer;
  const gancho = useRef<GanchoDaIntencao | null>(null);
  gancho.current ??= criarGanchoDaIntencao({ preaquecer: () => ref.current() });
  useEffect(() => () => gancho.current?.ponteiroSaiu(), []);
  return gancho.current;
}
