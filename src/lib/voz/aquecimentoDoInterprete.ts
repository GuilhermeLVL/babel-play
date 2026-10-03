/**
 * O AQUECIMENTO ao abrir o intérprete (Intérprete v3, task 4.3): o que dá para deixar pronto ANTES do primeiro
 * toque, para a primeira voz não pagar a preparação. Hoje é o áudio da voz da nuvem (`destravarVozDaNuvem`):
 * no navegador, o elemento de áudio já liberado toca depois sem gesto, e a tradução chega segundos depois do
 * toque. Não envia áudio nem texto a ninguém.
 *
 * Só com a chave de teste `vozPorFrase` ligada (`/diagnostico`); desligada, o intérprete abre como sempre.
 * O VAD, o modelo de turno e o Whisper local entram aqui quando existirem para aquecer.
 */
import { chaveLigada } from '../captura/testesDoInterprete';
import { destravarVozDaNuvem } from './vozDaNuvem';

export interface OpcoesDoAquecimento {
  /** A chave está ligada? (padrão: `vozPorFrase`.) */
  ligado?: () => boolean;
  /** Libera o áudio da voz da nuvem (padrão: `destravarVozDaNuvem`). */
  destravar?: () => void;
}

/** Aquece o intérprete. Devolve `true` se aqueceu; nunca lança (aquecer é só um adiantamento). */
export function aquecerInterprete(o: OpcoesDoAquecimento = {}): boolean {
  if (!(o.ligado ?? (() => chaveLigada('vozPorFrase')))()) return false;
  try {
    (o.destravar ?? destravarVozDaNuvem)();
  } catch {
    /* sem `Audio` (teste, navegador antigo): o primeiro toque destrava de qualquer jeito */
  }
  return true;
}
