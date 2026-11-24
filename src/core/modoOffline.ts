/**
 * MODO OFFLINE DECLARADO (change `modo-offline-declarado`): o que funciona e o que não funciona sem rede.
 *
 * Puro: não lê rede, DOM nem armazenamento. Quem chama monta o `EstadoDeRede` (navigator.onLine, manifesto
 * dos modelos baixados, recursos do aparelho). Devolve códigos, não frases: o texto (e a tradução dele) é
 * da interface.
 *
 * Honestidade: um recurso local só "funciona" se o que ele precisa está no aparelho. Com rede, a nuvem
 * funciona, mas transcrição e tradução locais seguem dependendo do modelo baixado.
 */

export type RecursoOffline = 'transcricao' | 'traducao' | 'jogos' | 'leitor' | 'ia';

export type MotivoOffline = 'sem-rede' | 'modelo-nao-baixado' | 'sem-motor-local';

export interface EstadoDeRede {
  /** `navigator.onLine !== false`. */
  online: boolean;
  /** O modelo de fala (transcrição) tem cópia completa no aparelho. */
  modeloDeFalaBaixado: boolean;
  /** Os modelos do par de idiomas (tradução) têm cópia completa no aparelho. */
  modeloDeTraducaoBaixado: boolean;
  /** O aparelho consegue rodar os motores locais (WASM/WebGPU). */
  motorLocalDisponivel: boolean;
}

export interface CapacidadeOffline {
  recurso: RecursoOffline;
  funciona: boolean;
  /** Só quando não funciona. */
  motivo?: MotivoOffline;
}

function local(recurso: RecursoOffline, baixado: boolean, motor: boolean): CapacidadeOffline {
  if (!motor) return { recurso, funciona: false, motivo: 'sem-motor-local' };
  if (!baixado) return { recurso, funciona: false, motivo: 'modelo-nao-baixado' };
  return { recurso, funciona: true };
}

/** A lista, sempre na mesma ordem: transcrição, tradução, jogos, leitor, IA na nuvem. */
export function capacidadesSemRede(e: EstadoDeRede): CapacidadeOffline[] {
  return [
    local('transcricao', e.modeloDeFalaBaixado, e.motorLocalDisponivel),
    local('traducao', e.modeloDeTraducaoBaixado, e.motorLocalDisponivel),
    { recurso: 'jogos', funciona: true },
    { recurso: 'leitor', funciona: true },
    e.online ? { recurso: 'ia', funciona: true } : { recurso: 'ia', funciona: false, motivo: 'sem-rede' },
  ];
}
