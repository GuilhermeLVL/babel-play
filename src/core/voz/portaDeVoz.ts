/**
 * A PORTA DE MOTOR DE VOZ — quem lê a narração, decidido num lugar só (spec
 * `docs/specs/2026-10-28-narracao-v2.md`, §7; no estilo de `core/rota/politicaDeRota.ts`).
 *
 * Três motores cabem aqui:
 *   · `aparelho`     — o `speechSynthesis` do sistema: de todos, grátis, sem internet;
 *   · `nuvem`        — a voz natural (POST /api/ai/tts): plano com `vozNatural` + flag + escolha + consentimento;
 *   · `neural-local` — um motor neural no navegador (Kokoro, Piper, …). NÃO EXISTE ainda: depende de parecer
 *                      jurídico (espeak-ng é GPL-3.0). A porta fica pronta; enquanto nenhum adaptador for
 *                      registrado (`neuralLocal.registrado: false`), ele NUNCA é escolhido.
 *
 * Regras, em ordem:
 *   1. O texto de um perfil protegido (menor ou idade desconhecida) NUNCA vai para a nuvem sem consentimento E
 *      autorização do responsável: as travas de hoje. Sem elas, a nuvem é descartada com o motivo.
 *   2. O motor neural local só entra registrado, com o idioma, e com o aparelho aguentando (modelo baixado, memória,
 *      isolamento de origem quando o motor exige).
 *   3. A escolha da pessoa vale quando o motor se qualifica; senão cai no seguinte, sempre terminando no aparelho.
 *   4. Sem escolha ("automática"): o neural local qualificado, senão o aparelho. A nuvem só com escolha explícita
 *      (a mesma regra de hoje: `vozDaNarracao`).
 *
 * PURO E ISOMÓRFICO: sem DOM, sem relógio, sem estado global. Tudo entra pelo `PedidoDeVoz`.
 */

export type MotorDeVozId = 'aparelho' | 'neural-local' | 'nuvem';
export const MOTORES_DE_VOZ: readonly MotorDeVozId[] = ['aparelho', 'neural-local', 'nuvem'];

export interface FaixaDeValor {
  min: number;
  max: number;
}

/** O que cada motor sabe fazer. */
export interface CapacidadesDoMotor {
  /** Idiomas (base ISO-639-1) que o motor lê; `'sistema'` = os que as vozes instaladas cobrirem. */
  idiomas: readonly string[] | 'sistema';
  /** Retoma uma fala pausada no meio da frase? (`speechSynthesis` não promete; a nuvem não pausa) */
  retomaNoMeio: boolean;
  /** `null` = o motor não aceita. */
  velocidade: FaixaDeValor | null;
  tom: FaixaDeValor | null;
  volume: FaixaDeValor | null;
  /** Aceita estilos de fala (narrador, conversa…), além do tom e da velocidade? */
  estilos: boolean;
  /** Download único do modelo (0 = nada a baixar). */
  tamanhoMb: number;
  /** Exige `SharedArrayBuffer` / isolamento de origem (COOP/COEP) para rodar? */
  precisaIsolamento: boolean;
  /** A licença do código e dos pesos, para o parecer jurídico. */
  licenca: string;
  /** O texto sai do aparelho? */
  textoSaiDoAparelho: boolean;
}

export const CAPACIDADES_DO_APARELHO: CapacidadesDoMotor = {
  idiomas: 'sistema',
  retomaNoMeio: false,
  velocidade: { min: 0.1, max: 10 },
  tom: { min: 0, max: 2 },
  volume: { min: 0, max: 1 },
  estilos: false,
  tamanhoMb: 0,
  precisaIsolamento: false,
  licenca: 'do sistema operacional',
  textoSaiDoAparelho: false,
};

export const CAPACIDADES_DA_NUVEM: CapacidadesDoMotor = {
  idiomas: 'sistema',
  retomaNoMeio: false,
  velocidade: { min: 0.5, max: 2 },
  tom: null,
  volume: { min: 0, max: 1 },
  estilos: false,
  tamanhoMb: 0,
  precisaIsolamento: false,
  licenca: 'serviço contratado (termos do provedor)',
  textoSaiDoAparelho: true,
};

/** O pedido: tudo que a decisão precisa saber, já resolvido por quem chama. */
export interface PedidoDeVoz {
  /** O que a pessoa escolheu para o idioma: `automatica` ou um motor. */
  preferencia: 'automatica' | MotorDeVozId;
  /** ISO-639-1 ou BCP-47 do texto. */
  idioma: string;
  nuvem: {
    /** O plano tem a capacidade `vozNatural`? */
    temDireito: boolean;
    /** A flag `voz_natural` está ligada? */
    flagLigada: boolean;
    /** A pessoa escolheu a voz natural para este idioma? */
    escolheu: boolean;
    /** Consentiu enviar texto à nuvem (LGPD). */
    consentiu: boolean;
  };
  /** Perfil protegido (menor ou idade desconhecida, ECA Digital). */
  perfilProtegido: boolean;
  /** O responsável autorizou o envio de texto à nuvem (só conta no perfil protegido). */
  responsavelAutorizou: boolean;
  neuralLocal: {
    /** Existe um adaptador neural registrado? Sem ele, nunca é escolhido. */
    registrado: boolean;
    capacidades?: CapacidadesDoMotor;
    /** O modelo do idioma já está no aparelho e pronto? */
    pronto: boolean;
    /** O aparelho aguenta (memória, isolamento de origem)? */
    aparelhoAguenta: boolean;
  };
}

export const MOTIVOS_DA_VOZ = [
  'escolha-da-pessoa',
  'padrao-do-aparelho',
  'neural-local-pronto',
  'sem-adaptador-neural',
  'idioma-fora-do-neural',
  'neural-nao-pronto',
  'aparelho-nao-aguenta',
  'sem-direito',
  'flag-desligada',
  'nao-escolheu-nuvem',
  'sem-consentimento',
  'perfil-protegido',
] as const;
export type MotivoDaVoz = (typeof MOTIVOS_DA_VOZ)[number];

export interface EscolhaDeVoz {
  motor: MotorDeVozId;
  motivo: MotivoDaVoz;
  /** Os próximos motores se este falhar; sempre termina no `aparelho` (que também é o último recurso). */
  reservas: MotorDeVozId[];
  /** O que foi descartado e por quê (para a tela explicar). */
  descartados: Array<{ motor: MotorDeVozId; motivo: MotivoDaVoz }>;
}

const baseDe = (l: string) => (l || '').toLowerCase().split(/[-_]/)[0];

/** O motor neural local serve a este pedido? Devolve o motivo do descarte, ou `null` se serve. */
function descarteDoNeural(p: PedidoDeVoz): MotivoDaVoz | null {
  const n = p.neuralLocal;
  if (!n.registrado) return 'sem-adaptador-neural';
  const idiomas = n.capacidades?.idiomas;
  if (Array.isArray(idiomas) && !idiomas.includes(baseDe(p.idioma))) return 'idioma-fora-do-neural';
  if (!n.aparelhoAguenta) return 'aparelho-nao-aguenta';
  if (!n.pronto) return 'neural-nao-pronto';
  return null;
}

/** A nuvem serve a este pedido? Devolve o motivo do descarte, ou `null` se serve. */
function descarteDaNuvem(p: PedidoDeVoz): MotivoDaVoz | null {
  const c = p.nuvem;
  if (!c.temDireito) return 'sem-direito';
  if (!c.flagLigada) return 'flag-desligada';
  /* O TEXTO DE MENOR: sem consentimento E sem o responsável, nada sai do aparelho. */
  if (p.perfilProtegido && !(c.consentiu && p.responsavelAutorizou)) return 'perfil-protegido';
  if (!c.consentiu) return 'sem-consentimento';
  if (p.preferencia !== 'nuvem' && !c.escolheu) return 'nao-escolheu-nuvem';
  return null;
}

export function escolherMotorDeVoz(p: PedidoDeVoz): EscolhaDeVoz {
  const descartados: EscolhaDeVoz['descartados'] = [];
  const neural = descarteDoNeural(p);
  const nuvem = descarteDaNuvem(p);
  /* Só vale anotar o descarte do que a pessoa pediu, ou do que existe: "sem adaptador" é o estado de hoje. */
  if (neural && p.neuralLocal.registrado) descartados.push({ motor: 'neural-local', motivo: neural });
  if (nuvem && (p.preferencia === 'nuvem' || p.nuvem.escolheu)) descartados.push({ motor: 'nuvem', motivo: nuvem });

  const ordem: MotorDeVozId[] = [];
  const pediu = p.preferencia !== 'automatica' ? p.preferencia : null;
  if (pediu === 'nuvem') ordem.push('nuvem', 'neural-local');
  else if (pediu === 'neural-local') ordem.push('neural-local', 'nuvem');
  else if (pediu === 'aparelho') ordem.push('aparelho');
  else ordem.push('neural-local', 'nuvem');
  if (!ordem.includes('aparelho')) ordem.push('aparelho');

  const serve = (m: MotorDeVozId) => (m === 'neural-local' ? !neural : m === 'nuvem' ? !nuvem : true);
  const qualificados = ordem.filter(serve);
  const motor = qualificados[0] ?? 'aparelho';
  const motivo: MotivoDaVoz =
    motor === 'neural-local'
      ? 'neural-local-pronto'
      : motor === 'nuvem' || motor === pediu
        ? 'escolha-da-pessoa'
        : 'padrao-do-aparelho';
  return { motor, motivo, reservas: qualificados.slice(1), descartados };
}
