/**
 * POLÍTICA DE ROTA DA FALA — onde transcrever, traduzir, falar e explicar, decidido num lugar só
 * (change `planos-v3-e-rota-inteligente`, design §3; spec `politica-de-rota`).
 *
 * POR QUE EXISTE. Hoje a decisão "aparelho ou nuvem" está espalhada: o `routeStt` escolhe o modelo e
 * diz "nuvem primeiro", o `escolherMotorDoMic` decide o reconhecimento do navegador, o `routeMt` monta
 * a escada do tradutor, e o plano, o consentimento e a cota são conferidos por outros caminhos (o
 * servidor, o gateway). Nenhum deles devolve o MOTIVO, e é o motivo que o selo da tela precisa dizer.
 *
 * MODO SOMBRA (etapa 4). `estado.politicaLigada` ausente ou `false` = a decisão é a de HOJE: o mesmo
 * "nuvem primeiro ou não" e o mesmo modelo local do `routeStt`, o mesmo motor do `escolherMotorDoMic`,
 * a mesma ordem do `routeMt`. O que esta função ACRESCENTA é o motivo (lista fechada), as reservas
 * (sempre terminando num degrau do aparelho), o que foi descartado e por quê, para onde o dado vai e a
 * explicação. As regras NOVAS (inglês de pagante fica no aparelho que acompanha etc.) estão no ramo
 * `politicaLigada: true`, que ninguém no app passa ainda (a flag `rota_inteligente` é da etapa 6).
 *
 * DIFERENÇA DELIBERADA PARA HOJE, mesmo desligada: o `routeStt` não vê consentimento, idade, plano nem
 * cota (quem barra é o gateway e o servidor, depois). Aqui eles entram na decisão: sem consentimento,
 * no perfil protegido sem responsável, sem o plano ou com a cota zerada, a nuvem é DESCARTADA com o
 * motivo. Com esses quatro no estado que não interfere, a decisão é idêntica à do `routeStt`
 * (`tests/politicaDeRota.test.ts`, "EQUIVALÊNCIA com hoje").
 *
 * COMPOSIÇÃO. O `routeMt` é do núcleo e é CHAMADO aqui. O `routeStt` (`src/gateway`) e o
 * `escolherMotorDoMic` (`src/lib`) leem o navegador ou importam quem lê, e o núcleo não os importa
 * (a mesma fronteira de `registroDeMotores.ts`): as regras deles estão REESCRITAS abaixo, e o teste de
 * equivalência compara as duas versões numa grade e quebra se divergirem. As provas da placa de vídeo
 * (`smallComGpuProvada`, `usarGpuNoAparelho`) chegam prontas em `AparelhoDaRota`.
 *
 * PURO E ISOMÓRFICO: sem DOM, sem relógio, sem estado global. Tudo entra pelo `PedidoDeRota`.
 */
import { type DestinoDosDados, motorPorId } from '../harness/registroDeMotores';
import { type MotivoDaRotaMt, routeMt } from '../harness/roteadorDeTraducao';

// ───────────────────────────── os tipos ─────────────────────────────

/** O nível de serviço que a pessoa recebe: tudo no aparelho, nuvem por trechos, ou nuvem em fluxo. */
export type NivelDeServico = 'aparelho' | 'precisao' | 'aovivo';

export type TarefaDaRota = 'stt-final' | 'stt-parcial' | 'mt-final' | 'mt-parcial' | 'voz' | 'nuance';

/** De onde vem o que será processado. `texto` = não há áudio (tradução digitada, toque na legenda). */
export type FonteDaRota = 'microfone' | 'sistema' | 'texto';

export type DegrauDaRota =
  | 'modelo-no-aparelho' // Whisper, Moonshine, Bergamot, opus-mt, voz do sistema
  | 'navegador-no-aparelho' // fala do navegador processada localmente, tradutor do Chrome
  | 'navegador-na-nuvem' // fala do navegador que envia o áudio ao fabricante
  | 'nuvem-por-trechos'
  | 'nuvem-ao-vivo'
  | 'nuvem-do-site'; // edição estática

/** A LISTA FECHADA de motivos: por que um degrau entrou, ou por que ficou de fora. */
export const MOTIVOS_DA_ROTA = [
  // nunca sai do aparelho (regra 1)
  'parcial-nunca-sai',
  'perfil-privado',
  'perfil-protegido',
  'sem-consentimento',
  // escolha da pessoa (regra 2)
  'escolha-da-pessoa',
  // o aparelho, o navegador e a nuvem (regras 3 a 5)
  'aparelho-da-conta',
  'aparelho-nao-acompanha',
  'idioma-pede-nuvem',
  'nuvem-primeiro',
  'navegador-no-aparelho',
  'so-na-nuvem',
  // por que a nuvem não entrou
  'plano-nao-inclui',
  'cota-do-mes',
  'cota-do-dia',
  'nuvem-pausada',
  'nuvem-indisponivel',
  'sem-rede',
  'edicao-estatica',
  // o resto
  'recurso-indisponivel',
  'reserva',
] as const;

export type MotivoDaRota = (typeof MOTIVOS_DA_ROTA)[number];

/** A resposta do navegador a `available({processLocally})` (a `Disponibilidade` de `lib/dispositivo/sonda.ts`). */
export type DisponibilidadeNoNavegador = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface AparelhoDaRota {
  /** O `TipoDeDispositivo` de `lib/dispositivo/perfil.ts`. */
  tipo: 'quest' | 'celular-fraco' | 'celular-bom' | 'desktop-sem-gpu' | 'desktop-com-gpu';
  /** Perfil leve (Quest, celular fraco, computador de 2 núcleos ou 2 GB). */
  leve: boolean;
  /** O regulador viu o aparelho travar nesta captura. */
  travando: boolean;
  /** Placa de vídeo PROVADA pela sonda (`gpuRealDaRota`): `false` = não há; `null` = ainda não se sabe. */
  gpuProvada: boolean | null;
  /** Fator de tempo real medido (média móvel); até 0,5 o aparelho acompanha. Ausente = não medido. */
  fatorDeTempoReal?: number | null;
  /** `navigator.connection.saveData`: o menor modelo que serve. */
  economiaDeDados: boolean;
  /** O Whisper small entra neste computador (`smallComGpuProvada`). */
  smallNaGpu: boolean;
  /** O Whisper vai à placa de vídeo neste celular ou Quest (`usarGpuNoAparelho`). */
  whisperNaGpu: boolean;
  /** `shader-f16`: o encoder vai em fp16 na placa de vídeo. */
  shaderF16: boolean;
  navegador: {
    /** Existe reconhecimento de fala no navegador (`SpeechRecognition`). */
    fala: boolean;
    /** O navegador reconhece o idioma NO aparelho? `null` = sem a API ou sem resposta. */
    falaNoAparelho: DisponibilidadeNoNavegador | null;
    /** O reconhecimento apita a cada religada (Android): o "no aparelho" não decide sozinho. */
    bipaAoReligar: boolean;
    /** O tradutor do navegador tem o par. */
    tradutor: boolean;
  };
  modelos: {
    /** O opus-mt cobre o par. */
    opusMt: boolean;
    /** O Bergamot é oferecido neste aparelho (o par quem decide é o `routeMt`). */
    bergamot: boolean;
    /** Há um modelo de linguagem no próprio computador (Ollama, LM Studio). */
    llmLocal: boolean;
  };
}

/**
 * O plano em CAPACIDADES. Nunca o nome: dois planos com as mesmas capacidades e o mesmo restante
 * recebem a mesma decisão, e um plano novo não pede mudança aqui.
 */
export interface PlanoDaRota {
  /** Transcrição na nuvem do Babel, por trechos. */
  nuvemPorTrechos: boolean;
  /** A nuvem é o padrão onde compensa (sem isto, ela é "sob demanda"). Só a política ligada lê. */
  precisaoPorPadrao: boolean;
  /** Transcrição na nuvem em fluxo (texto durante a fala). */
  nuvemAoVivo: boolean;
  /** Tradução pelo modelo de linguagem da nuvem. */
  traducaoNaNuvem: boolean;
  nuance: boolean;
  /** Voz neural da nuvem; sem ela, a voz do aparelho. */
  vozNeural: boolean;
  /** O que resta de cota, em segundos. `null` = sem teto, ou ainda não se sabe. Zero = acabou. */
  restante: {
    trechosNoMesS: number | null;
    trechosNoDiaS: number | null;
    aoVivoNoMesS: number | null;
    aoVivoNoDiaS: number | null;
  };
}

export interface EstadoDaRota {
  /** A flag `rota_inteligente`. Ausente ou `false` = a decisão de hoje (modo sombra). */
  politicaLigada?: boolean;
  consentimentos: {
    /** "Usar IA de nuvem": os NOSSOS servidores. */
    nuvem: boolean;
    /** O reconhecimento do navegador que envia o áudio ao fabricante (a opção "Rápido"). */
    navegador: boolean;
  };
  /** O perfil "Privado/Local": promete que nada sai do aparelho. */
  perfilPrivado: boolean;
  /** Menor, idade não declarada ou sem conta. */
  perfilProtegido: boolean;
  /** O responsável autorizou (vínculo aceito e conta não restrita). Só lido com `perfilProtegido`. */
  responsavelAutorizou: boolean;
  /** O servidor tem a nuvem configurada e responde a esta conta. */
  nuvemDisponivel: boolean;
  /** A nuvem está em pausa (disjuntor aberto, recusa recente). */
  nuvemPausada: boolean;
  semRede: boolean;
  /** O build sem servidor (Pages). */
  edicaoEstatica: boolean;
  /** A nuvem do site EXISTE neste aparelho (edição estática em aparelho leve); o aceite é `consentimentos.nuvem`. */
  nuvemDoSite: boolean;
  preferencia: {
    /** "Qualidade da transcrição" em Ajustes. */
    qualidade: 'auto' | 'rapido' | 'preciso' | 'nuvem';
    /** O seletor do microfone: o reconhecimento do navegador ou o nosso modelo. */
    microfone: 'navegador' | 'modelo';
  };
}

export interface PedidoDeRota {
  tarefa: TarefaDaRota;
  fonte: FonteDaRota;
  /** Idioma do que será processado (o que se ouve, ou a origem da tradução). '' = desconhecido. */
  idioma: string;
  /**
   * O microfone vai ao MESMO modelo que o áudio do sistema, e fala este idioma. Um só modelo decodifica
   * as duas fontes, então o modelo de inglês só serve quando as duas são inglês.
   */
  idiomaDoMicrofone?: string;
  /** Detecção de idioma por fala ligada: tratado como não inglês. */
  detectarIdioma?: boolean;
  /** Destino da tradução (`mt-final`, `mt-parcial`). */
  idiomaDeDestino?: string;
  aparelho: AparelhoDaRota;
  plano: PlanoDaRota;
  estado: EstadoDaRota;
}

export interface PassoDaRota {
  degrau: DegrauDaRota;
  motivo: MotivoDaRota;
  /** Id do motor em `registroDeMotores.ts`. Ausente = não há motor registrado para este degrau. */
  motor?: string;
  /** Id do modelo no Hub (transcrição local). */
  modelo?: string;
  dtype?: 'hybrid' | 'hybrid-fp16' | 'q8';
  device?: 'wasm' | 'webgpu';
}

export interface DecisaoDeRota {
  nivel: NivelDeServico;
  /** O que roda agora. */
  rota: PassoDaRota;
  /** Em ordem; sempre termina no aparelho. */
  reservas: PassoDaRota[];
  descartadas: { degrau: DegrauDaRota; motivo: MotivoDaRota }[];
  processamento: { onde: 'aparelho' | 'navegador' | 'nuvem'; enviaDadosA: DestinoDosDados };
  /** `chave` é a frase em português (a chave do catálogo de i18n); `vars`, o que entra nas chaves. */
  explicacao: { chave: string; vars?: Record<string, string | number> };
  acao?: 'autorizar-nuvem' | 'ver-consumo' | 'ver-planos' | null;
}

/** O pedaço da decisão que o gateway de transcrição entende (o `SttRoute` de `gateway/sttRouter.ts`). */
export interface RotaDoSttDaPolitica {
  /** Tentar a nuvem primeiro, com o modelo local de reserva. */
  preferCloud: boolean;
  localModel: string;
  dtype?: 'hybrid' | 'hybrid-fp16' | 'q8';
  device?: 'wasm' | 'webgpu';
}

type Descartada = DecisaoDeRota['descartadas'][number];
type Acao = NonNullable<DecisaoDeRota['acao']> | null;

// ───────────────────────────── o que vale para toda tarefa ─────────────────────────────

const idiomaBase = (l: string | undefined): string => (l ?? '').toLowerCase().split('-')[0];

const NUVENS_DO_BABEL: readonly DegrauDaRota[] = ['nuvem-por-trechos', 'nuvem-ao-vivo', 'nuvem-do-site'];
const ehNuvemDoBabel = (d: DegrauDaRota): boolean => NUVENS_DO_BABEL.includes(d);

const protegidoSemResponsavel = (e: EstadoDaRota): boolean => e.perfilProtegido && !e.responsavelAutorizou;

/** A nuvem do site está LIGADA: existe neste aparelho e a pessoa consentiu. */
const nuvemDoSiteAtiva = (e: EstadoDaRota): boolean => e.edicaoEstatica && e.nuvemDoSite && e.consentimentos.nuvem;

/** O perfil que tranca a rota no aparelho (regra 1), ou `null`. */
function perfilQueTranca(e: EstadoDaRota): MotivoDaRota | null {
  if (e.perfilPrivado) return 'perfil-privado';
  return protegidoSemResponsavel(e) ? 'perfil-protegido' : null;
}

function cotaEsgotada(mes: number | null, dia: number | null): MotivoDaRota | null {
  if (mes !== null && mes <= 0) return 'cota-do-mes';
  return dia !== null && dia <= 0 ? 'cota-do-dia' : null;
}

/**
 * TUDO o que impede a nuvem do Babel neste pedido, na ordem das regras: o que nunca sai do aparelho,
 * depois o que o plano e a cota dizem, depois o que está fora do ar. Vazio = a nuvem pode entrar.
 *
 * `inclui`: a capacidade do plano para esta tarefa. `cota`: o restante do nível, quando ele é contado
 * em segundos. `aceitaNuvemDoSite`: na edição estática, a nuvem do site serve a esta tarefa (lá o
 * plano não conta: todo mundo é "sem conta" e a cota é do servidor).
 */
function bloqueiosDaNuvem(
  p: PedidoDeRota,
  inclui: boolean,
  cota: { mes: number | null; dia: number | null } | null,
  aceitaNuvemDoSite: boolean,
): MotivoDaRota[] {
  const e = p.estado;
  const lista: MotivoDaRota[] = [];
  const perfil = perfilQueTranca(e);
  if (perfil) lista.push(perfil);
  if (!e.consentimentos.nuvem) lista.push('sem-consentimento');
  if (e.edicaoEstatica) {
    if (!(aceitaNuvemDoSite && e.nuvemDoSite)) lista.push('edicao-estatica');
  } else if (!inclui) lista.push('plano-nao-inclui');
  const semCota = cota ? cotaEsgotada(cota.mes, cota.dia) : null;
  if (semCota) lista.push(semCota);
  if (e.semRede) lista.push('sem-rede');
  if (e.nuvemPausada) lista.push('nuvem-pausada');
  if (!e.nuvemDisponivel) lista.push('nuvem-indisponivel');
  return lista;
}

/**
 * O que a tela pode oferecer diante do primeiro bloqueio. "Autorizar" só quando o aceite é a ÚNICA
 * coisa que falta (pedir o aceite para depois dizer "o seu plano não inclui" seria enganar).
 */
function acaoDoBloqueio(bloqueios: readonly MotivoDaRota[], oferecerPlanos: boolean): Acao {
  const primeiro = bloqueios[0];
  if (primeiro === 'sem-consentimento') return bloqueios.length === 1 ? 'autorizar-nuvem' : null;
  if (primeiro === 'cota-do-mes' || primeiro === 'cota-do-dia') return 'ver-consumo';
  if (primeiro === 'plano-nao-inclui') return oferecerPlanos ? 'ver-planos' : null;
  return null;
}

/**
 * A EXPLICAÇÃO de cada motivo: a frase em português É a chave do catálogo (como o `t()` do app). Diz
 * só o porquê; ONDE roda é a etiqueta do selo ("No aparelho", "Pelo navegador", "Nuvem do Babel").
 * Os catálogos de `public/i18n` ainda não têm estas entradas: elas entram com a tela (etapa 5).
 */
const EXPLICACOES: Record<MotivoDaRota, string> = {
  'parcial-nunca-sai': 'O texto provisório muda a cada segundo e nunca sai do aparelho.',
  'perfil-privado': 'O perfil Privado não envia nada para fora do aparelho.',
  'perfil-protegido': 'Este perfil só usa a nuvem com a autorização do responsável.',
  'sem-consentimento': 'Você ainda não autorizou o envio para fora do aparelho.',
  'escolha-da-pessoa': 'Você escolheu esta opção nos ajustes.',
  'aparelho-da-conta': 'Este aparelho acompanha a fala em {idioma}.',
  'aparelho-nao-acompanha': 'Este aparelho não acompanha a fala em {idioma}.',
  'idioma-pede-nuvem': 'Em {idioma}, a nuvem erra menos que o modelo do aparelho.',
  'nuvem-primeiro': 'A nuvem está disponível na sua conta e erra menos.',
  'navegador-no-aparelho': 'O navegador reconhece {idioma} no próprio aparelho.',
  'so-na-nuvem': 'Este recurso só existe pela nuvem.',
  'plano-nao-inclui': 'O seu plano não inclui a nuvem para isto.',
  'cota-do-mes': 'A nuvem deste mês acabou. Seguimos no aparelho.',
  'cota-do-dia': 'A nuvem de hoje acabou. Seguimos no aparelho.',
  'nuvem-pausada': 'A nuvem está em pausa. Seguimos no aparelho.',
  'nuvem-indisponivel': 'A nuvem não está disponível agora.',
  'sem-rede': 'Sem internet, tudo é feito no aparelho.',
  'edicao-estatica': 'Esta versão do site não tem nuvem.',
  'recurso-indisponivel': 'Este aparelho não tem um recurso local para isto.',
  reserva: 'Reserva, para o caso de a rota principal falhar.',
};

/** Para onde o áudio vai quando o navegador o envia ao fabricante: o que o registro declara. */
const DESTINO_DO_NAVEGADOR: DestinoDosDados = motorPorId('web-speech')?.enviaDadosA ?? 'google';

/** Fecha a decisão: nível, destino do dado e explicação saem da ROTA; o descartado nunca repete o usado. */
function fechar(
  p: PedidoDeRota,
  rota: PassoDaRota,
  reservas: PassoDaRota[],
  descartadas: Descartada[],
  acao: Acao = null,
): DecisaoDeRota {
  const usados = new Set([rota, ...reservas].map((x) => x.degrau));
  const vistos = new Set<DegrauDaRota>();
  const limpas = descartadas.filter((d) => {
    if (usados.has(d.degrau) || vistos.has(d.degrau)) return false;
    vistos.add(d.degrau);
    return true;
  });
  const g = rota.degrau;
  const nivel: NivelDeServico = g === 'nuvem-ao-vivo' ? 'aovivo' : ehNuvemDoBabel(g) ? 'precisao' : 'aparelho';
  const processamento: DecisaoDeRota['processamento'] = ehNuvemDoBabel(g)
    ? { onde: 'nuvem', enviaDadosA: 'nos' }
    : g === 'navegador-na-nuvem'
      ? { onde: 'navegador', enviaDadosA: DESTINO_DO_NAVEGADOR }
      : { onde: g === 'navegador-no-aparelho' ? 'navegador' : 'aparelho', enviaDadosA: null };
  const chave = EXPLICACOES[rota.motivo];
  const explicacao = chave.includes('{idioma}') ? { chave, vars: { idioma: idiomaBase(p.idioma) } } : { chave };
  return { nivel, rota, reservas, descartadas: limpas, processamento, explicacao, acao };
}

// ───────────────────────────── transcrever ─────────────────────────────

type ModeloDeStt = 'whisper-small' | 'whisper-base' | 'whisper-tiny' | 'moonshine-base' | 'moonshine-tiny';

/** "Inglês" só quando TODAS as fontes que o modelo decodifica são inglês (o modelo é um só). */
function soIngles(p: PedidoDeRota): boolean {
  if (p.detectarIdioma) return false;
  const mic = idiomaBase(p.idiomaDoMicrofone);
  return idiomaBase(p.idioma) === 'en' && (!mic || mic === 'en');
}

/**
 * Um modelo local de transcrição, com a quantização e o backend DESTE aparelho — a mesma tabela do
 * `routeStt`: fora do computador o Whisper vai em q8 no WASM (ou na placa de vídeo provada); com
 * economia de dados, q8; o Moonshine é sempre q8; o tiny do "rápido" é sempre híbrido.
 */
function modeloLocal(p: PedidoDeRota, id: ModeloDeStt, motivo: MotivoDaRota): PassoDaRota {
  const a = p.aparelho;
  const passo: PassoDaRota = { degrau: 'modelo-no-aparelho', motivo, motor: id, modelo: motorPorId(id)?.modelo ?? id };
  if (id === 'moonshine-base' || id === 'moonshine-tiny') return { ...passo, dtype: 'q8' };
  if (id === 'whisper-tiny') return { ...passo, dtype: 'hybrid' };
  const movel = !a.tipo.startsWith('desktop');
  if (movel && a.whisperNaGpu) return { ...passo, dtype: a.shaderF16 ? 'hybrid-fp16' : 'hybrid', device: 'webgpu' };
  if (movel || a.economiaDeDados) return { ...passo, dtype: 'q8', device: 'wasm' };
  return { ...passo, dtype: 'hybrid' };
}

/** O melhor Whisper que cabe aqui: o small só com a placa de vídeo provada. */
const melhorWhisper = (p: PedidoDeRota): ModeloDeStt => (p.aparelho.smallNaGpu ? 'whisper-small' : 'whisper-base');

/** O Moonshine do automático em inglês: o tiny no celular fraco, no Quest ou com economia de dados. */
function moonshineDoAparelho(p: PedidoDeRota): ModeloDeStt {
  const a = p.aparelho;
  return a.tipo === 'celular-fraco' || a.tipo === 'quest' || a.economiaDeDados ? 'moonshine-tiny' : 'moonshine-base';
}

/**
 * O ÚLTIMO degrau das reservas: o menor modelo local que serve ao idioma (a escada do regulador,
 * `reguladorDaCaptura.ts`: small → base; em inglês, até o Moonshine tiny). Quando a rota já é o
 * menor, a reserva é ele mesmo — o "modo compatível" em que o `whisperLocal` recai quando a placa de
 * vídeo falha.
 */
function chaoLocal(p: PedidoDeRota, atual: PassoDaRota): PassoDaRota {
  if (soIngles(p)) return modeloLocal(p, 'moonshine-tiny', 'reserva');
  if (atual.motor === 'whisper-small') return modeloLocal(p, 'whisper-base', 'reserva');
  return { ...atual, motivo: 'reserva' };
}

/** O aparelho ACOMPANHA a fala? O fator medido manda; sem medida, vale o que se sabe do aparelho. */
function aparelhoAcompanha(p: PedidoDeRota): boolean {
  const a = p.aparelho;
  if (a.travando) return false;
  if (typeof a.fatorDeTempoReal === 'number') return a.fatorDeTempoReal <= 0.5;
  // Inglês roda no Moonshine, que acompanha sem placa de vídeo; o resto precisa dela provada.
  return !a.leve && (soIngles(p) || a.gpuProvada === true);
}

/** A parte da decisão que os dois modos (hoje e a política nova) devolvem para ser fechada. */
interface EscolhaDoStt {
  nuvem: { motivo: MotivoDaRota; aoVivo: boolean } | null;
  local: PassoDaRota;
  /** A nuvem fica de reserva atrás do modelo local (só a política nova). */
  nuvemDeReserva: boolean;
  descartadas: Descartada[];
  acao: Acao;
}

/** HOJE: a régua do `routeStt`, com o motivo. Quem tem nuvem vai à nuvem primeiro. */
function escolhaDeHoje(p: PedidoDeRota, bloqueios: readonly MotivoDaRota[], nuvem: DegrauDaRota): EscolhaDoStt {
  const q = p.estado.preferencia.qualidade;
  const ingles = soIngles(p);
  const bloqueio = bloqueios[0] ?? null;
  const tranca = perfilQueTranca(p.estado);
  const base: Omit<EscolhaDoStt, 'local' | 'nuvem'> = { nuvemDeReserva: false, descartadas: [], acao: null };
  const semNuvem = (motivo: MotivoDaRota): Descartada[] => [{ degrau: nuvem, motivo: bloqueio ?? motivo }];

  if (q === 'rapido' || q === 'preciso') {
    const id = q === 'preciso' ? melhorWhisper(p) : ingles ? 'moonshine-tiny' : 'whisper-tiny';
    const local = modeloLocal(p, id, tranca ?? 'escolha-da-pessoa');
    return { ...base, nuvem: null, local, descartadas: semNuvem('escolha-da-pessoa') };
  }
  /* Na nuvem do site o inglês fica no aparelho: a cota de lá é de minutos por dia e o Moonshine
     acompanha a fala até no Quest. Só o automático; quem escolheu "nuvem" vai à nuvem. */
  const inglesFicaAqui = q === 'auto' && ingles && nuvemDoSiteAtiva(p.estado);
  if (inglesFicaAqui) {
    const local = modeloLocal(p, moonshineDoAparelho(p), tranca ?? 'aparelho-da-conta');
    return { ...base, nuvem: null, local, descartadas: semNuvem('aparelho-da-conta') };
  }
  if (!bloqueio) {
    // A reserva é moderada (base, ou o Moonshine em inglês): quem vai à nuvem não baixa o small.
    const reserva = ingles ? (q === 'auto' ? moonshineDoAparelho(p) : 'moonshine-base') : 'whisper-base';
    const motivo: MotivoDaRota = q === 'nuvem' ? 'escolha-da-pessoa' : 'nuvem-primeiro';
    return { ...base, nuvem: { motivo, aoVivo: false }, local: modeloLocal(p, reserva, 'reserva') };
  }
  // Sem nuvem: o Moonshine em inglês no automático; no resto (e em "nuvem" recusada), o melhor Whisper.
  const id = q === 'auto' && ingles ? moonshineDoAparelho(p) : melhorWhisper(p);
  return {
    ...base,
    nuvem: null,
    local: modeloLocal(p, id, bloqueio),
    descartadas: semNuvem(bloqueio),
    acao: acaoDoBloqueio(bloqueios, q === 'nuvem'),
  };
}

/**
 * A POLÍTICA NOVA (regras 2 a 5 do design): a escolha da pessoa, depois o aparelho quando ele
 * acompanha e o idioma é bem servido, depois a nuvem quando o plano inclui, há cota e compensa.
 */
function escolhaDaPolitica(p: PedidoDeRota, bloqueios: readonly MotivoDaRota[], nuvem: DegrauDaRota): EscolhaDoStt {
  const q = p.estado.preferencia.qualidade;
  if (q !== 'auto') return escolhaDeHoje(p, bloqueios, nuvem); // a escolha explícita já vale hoje
  const ingles = soIngles(p);
  const bloqueio = bloqueios[0] ?? null;
  const tranca = perfilQueTranca(p.estado);
  const acompanha = aparelhoAcompanha(p);
  const idLocal = ingles ? moonshineDoAparelho(p) : melhorWhisper(p);

  /* Regra 3: o aparelho primeiro. Inglês em aparelho que acompanha não vai à nuvem por padrão em
     plano nenhum; fora do inglês, só sobe sozinho quem tem a precisão por padrão. */
  if (acompanha && (ingles || !p.plano.precisaoPorPadrao)) {
    return {
      nuvem: null,
      local: modeloLocal(p, idLocal, tranca ?? 'aparelho-da-conta'),
      nuvemDeReserva: !bloqueio,
      descartadas: bloqueio ? [{ degrau: nuvem, motivo: bloqueio }] : [],
      acao: bloqueio === 'cota-do-mes' || bloqueio === 'cota-do-dia' ? 'ver-consumo' : null,
    };
  }
  if (bloqueio) {
    return {
      nuvem: null,
      local: modeloLocal(p, idLocal, bloqueio),
      nuvemDeReserva: false,
      descartadas: [{ degrau: nuvem, motivo: bloqueio }],
      acao: acaoDoBloqueio(bloqueios, true), // o aparelho não dá conta: aqui o plano resolve
    };
  }
  // Regra 5: a nuvem compensa. Em fluxo para quem tem o direito e ainda tem cota de fluxo.
  const motivo: MotivoDaRota = acompanha ? 'idioma-pede-nuvem' : 'aparelho-nao-acompanha';
  const reserva = modeloLocal(p, ingles ? moonshineDoAparelho(p) : 'whisper-base', 'reserva');
  const r = p.plano.restante;
  const semFluxo: MotivoDaRota | null = p.estado.edicaoEstatica
    ? 'edicao-estatica'
    : !p.plano.nuvemAoVivo
      ? 'plano-nao-inclui'
      : cotaEsgotada(r.aoVivoNoMesS, r.aoVivoNoDiaS);
  return {
    nuvem: { motivo, aoVivo: semFluxo === null },
    local: reserva,
    nuvemDeReserva: false,
    descartadas: semFluxo ? [{ degrau: 'nuvem-ao-vivo', motivo: semFluxo }] : [],
    acao: semFluxo === 'cota-do-mes' || semFluxo === 'cota-do-dia' ? 'ver-consumo' : null,
  };
}

/**
 * O MICROFONE NO NAVEGADOR — os três degraus do `escolherMotorDoMic`: o navegador reconhece no
 * aparelho; ou envia ao fabricante, só com o aceite próprio e nunca no perfil Privado nem no
 * protegido; ou cai no nosso modelo. Devolve o passo do navegador, ou só o que foi descartado.
 */
function microfoneNoNavegador(p: PedidoDeRota): { passo: PassoDaRota | null; descartadas: Descartada[] } {
  if (p.fonte !== 'microfone') return { passo: null, descartadas: [] };
  const nav = p.aparelho.navegador;
  const fora = (motivo: MotivoDaRota): Descartada[] => [
    { degrau: 'navegador-no-aparelho', motivo },
    { degrau: 'navegador-na-nuvem', motivo },
  ];
  if (!nav.fala) return { passo: null, descartadas: fora('recurso-indisponivel') };
  if (p.estado.preferencia.microfone === 'modelo') return { passo: null, descartadas: fora('escolha-da-pessoa') };
  const noAparelho = nav.bipaAoReligar ? null : nav.falaNoAparelho;
  if (noAparelho === 'available') {
    return {
      passo: { degrau: 'navegador-no-aparelho', motivo: 'navegador-no-aparelho', motor: 'web-speech-local' },
      descartadas: [{ degrau: 'navegador-na-nuvem', motivo: 'navegador-no-aparelho' }],
    };
  }
  const semLocal: Descartada = { degrau: 'navegador-no-aparelho', motivo: 'recurso-indisponivel' };
  const semRapido: MotivoDaRota | null =
    perfilQueTranca(p.estado) ?? (p.estado.consentimentos.navegador ? null : 'sem-consentimento');
  if (semRapido) return { passo: null, descartadas: [semLocal, { degrau: 'navegador-na-nuvem', motivo: semRapido }] };
  return {
    passo: { degrau: 'navegador-na-nuvem', motivo: 'escolha-da-pessoa', motor: 'web-speech' },
    descartadas: [semLocal],
  };
}

function decidirStt(p: PedidoDeRota): DecisaoDeRota {
  const ligada = p.estado.politicaLigada === true;
  const degrauDaNuvem: DegrauDaRota = p.estado.edicaoEstatica ? 'nuvem-do-site' : 'nuvem-por-trechos';
  const r = p.plano.restante;
  const bloqueios = bloqueiosDaNuvem(p, p.plano.nuvemPorTrechos, { mes: r.trechosNoMesS, dia: r.trechosNoDiaS }, true);
  const e = ligada ? escolhaDaPolitica(p, bloqueios, degrauDaNuvem) : escolhaDeHoje(p, bloqueios, degrauDaNuvem);
  const mic = microfoneNoNavegador(p);

  // O navegador atende o microfone: a nuvem do Babel nem é perguntada; o nosso modelo fica de reserva.
  if (mic.passo) {
    const reserva = { ...e.local, motivo: 'reserva' as const };
    const semNuvem: Descartada = { degrau: degrauDaNuvem, motivo: bloqueios[0] ?? mic.passo.motivo };
    return fechar(p, mic.passo, [reserva], [...mic.descartadas, semNuvem]);
  }

  /* O fluxo (texto durante a fala). HOJE ele não existe: o servidor só transcreve por trechos. Na
     política nova, quem escolheu a nuvem em fluxo já a recebe em `e.nuvem.aoVivo`. */
  const semFluxoHoje: Descartada = { degrau: 'nuvem-ao-vivo', motivo: bloqueios[0] ?? 'nuvem-indisponivel' };
  const semFluxoNovo: Descartada = {
    degrau: 'nuvem-ao-vivo',
    motivo: bloqueios[0] ?? (p.plano.nuvemAoVivo ? e.local.motivo : 'plano-nao-inclui'),
  };
  const descartadas = [...mic.descartadas, ...e.descartadas, ligada ? semFluxoNovo : semFluxoHoje];
  const porTrechos = (motivo: MotivoDaRota): PassoDaRota => ({ degrau: degrauDaNuvem, motivo, motor: 'groq-whisper' });

  if (e.nuvem?.aoVivo) {
    const fluxo: PassoDaRota = { degrau: 'nuvem-ao-vivo', motivo: e.nuvem.motivo };
    return fechar(p, fluxo, [porTrechos('reserva'), e.local], descartadas, e.acao);
  }
  if (e.nuvem && p.tarefa === 'stt-final') {
    return fechar(p, porTrechos(e.nuvem.motivo), [e.local], descartadas, e.acao);
  }
  if (e.nuvem) {
    // Texto durante a fala sem o fluxo: é do aparelho (a nuvem por trechos só devolve o trecho pronto).
    const motivoDoFluxo = descartadas.find((d) => d.degrau === 'nuvem-ao-vivo')?.motivo ?? 'nuvem-indisponivel';
    const local = { ...e.local, motivo: motivoDoFluxo };
    return fechar(p, local, [chaoLocal(p, local)], descartadas, e.acao);
  }

  /* No aparelho. Política nova: quem não acompanha e não tem a nuvem do Babel recebe a OFERTA da fala
     do navegador (a etiqueta é "Pelo navegador") — e ela só entra com o aceite, lá em cima. */
  const ofertaDoNavegador =
    ligada &&
    !aparelhoAcompanha(p) &&
    mic.descartadas.some((d) => d.degrau === 'navegador-na-nuvem' && d.motivo === 'sem-consentimento');
  const reservas = e.nuvemDeReserva && p.tarefa === 'stt-final' ? [porTrechos('reserva')] : [];
  return fechar(
    p,
    e.local,
    [...reservas, chaoLocal(p, e.local)],
    reservas.length ? descartadas : [...descartadas, { degrau: degrauDaNuvem, motivo: e.local.motivo }],
    ofertaDoNavegador ? 'autorizar-nuvem' : e.acao,
  );
}

// ───────────────────────────── traduzir ─────────────────────────────

const MOTIVO_DO_DESCARTE_MT: Partial<Record<MotivoDaRotaMt, MotivoDaRota>> = {
  parcial: 'parcial-nunca-sai',
  plano: 'plano-nao-inclui',
  consentimento: 'sem-consentimento',
  indisponivel: 'nuvem-indisponivel',
};

/**
 * TRADUZIR compõe o `routeMt`: a ordem dos motores é a dele. A política traduz os degraus dele para
 * os da rota, troca o motivo genérico pelo da lista fechada e garante a reserva no aparelho.
 *
 * FORA DAQUI, por não terem degrau na rota: o dicionário e a memória de tradução (não são motores de
 * IA) e o MyMemory (um terceiro chamado direto do navegador — `DegrauDaRota` não tem degrau para ele).
 */
function decidirMt(p: PedidoDeRota): DecisaoDeRota {
  const e = p.estado;
  const parcial = p.tarefa === 'mt-parcial';
  const ligada = e.politicaLigada === true;
  const site = nuvemDoSiteAtiva(e);
  const bloqueios = bloqueiosDaNuvem(p, p.plano.traducaoNaNuvem, null, true);
  /* Hoje quem tem a tradução na nuvem a recebe PRIMEIRO (`nuvemPrimeiro` e `falada` no gateway). Na
     política nova, só quem tem a precisão por padrão; para o resto ela é o último recurso. */
  const primeiro = site || !ligada || p.plano.precisaoPorPadrao;
  const escada = routeMt({
    texto: 'texto', // a política decide a rota, não o trecho: os atalhos por texto ficam com quem traduz
    ehToqueEmPalavra: false,
    parcial,
    pago: site || p.plano.traducaoNaNuvem,
    consentimento: e.consentimentos.nuvem && perfilQueTranca(e) === null,
    disponibilidade: {
      tradutorNativo: p.aparelho.navegador.tradutor,
      opusMt: p.aparelho.modelos.opusMt,
      bergamot: p.aparelho.modelos.bergamot,
      nuvem: e.nuvemDisponivel && !e.nuvemPausada && !e.semRede && (!e.edicaoEstatica || e.nuvemDoSite),
      memoria: false,
      dicionario: false,
    },
    origem: p.idioma,
    destino: p.idiomaDeDestino ?? '',
    falada: p.fonte === 'microfone' && primeiro,
    nuvemPrimeiro: primeiro,
  });
  const degrauDaNuvem: DegrauDaRota = e.edicaoEstatica ? 'nuvem-do-site' : 'nuvem-por-trechos';

  const passos: PassoDaRota[] = [];
  for (const d of escada.degraus) {
    if (d.degrau === 'nativo')
      passos.push({ degrau: 'navegador-no-aparelho', motivo: 'navegador-no-aparelho', motor: d.motor });
    else if (d.degrau === 'local')
      passos.push({ degrau: 'modelo-no-aparelho', motivo: 'aparelho-da-conta', motor: d.motor });
    else if (d.degrau === 'nuvem') {
      const motivo: MotivoDaRota = d.motivo === 'ultimo-recurso' ? 'reserva' : 'nuvem-primeiro';
      passos.push({ degrau: degrauDaNuvem, motivo, motor: d.motor });
    }
  }
  const descartadas: Descartada[] = [];
  for (const d of escada.descartados) {
    if (d.degrau === 'nativo') descartadas.push({ degrau: 'navegador-no-aparelho', motivo: 'recurso-indisponivel' });
    else if (d.degrau === 'local') descartadas.push({ degrau: 'modelo-no-aparelho', motivo: 'recurso-indisponivel' });
    else if (d.degrau === 'nuvem') {
      const motivo = parcial
        ? 'parcial-nunca-sai'
        : (bloqueios[0] ?? MOTIVO_DO_DESCARTE_MT[d.motivo] ?? 'nuvem-indisponivel');
      descartadas.push({ degrau: degrauDaNuvem, motivo });
    }
  }

  /* A reserva termina no aparelho. Sem tradutor local para o par, o degrau existe e diz a verdade:
     não há recurso (o texto fica no original). */
  const semRecurso: PassoDaRota = { degrau: 'modelo-no-aparelho', motivo: 'recurso-indisponivel' };
  const ultimoLocal = passos.filter((x) => x.degrau === 'modelo-no-aparelho').at(-1);
  const [primeiroPasso, ...resto] = passos.length ? passos : [semRecurso];
  const reservas = resto;
  if (reservas.at(-1)?.degrau !== 'modelo-no-aparelho') {
    reservas.push(ultimoLocal ? { ...ultimoLocal, motivo: 'reserva' } : semRecurso);
  }
  // Com o perfil que tranca, a nuvem nunca é o primeiro passo: o motivo da rota é o perfil.
  const motivo: MotivoDaRota = parcial ? 'parcial-nunca-sai' : (perfilQueTranca(e) ?? primeiroPasso.motivo);
  const acao = parcial ? null : acaoDoBloqueio(bloqueios, false);
  return fechar(p, { ...primeiroPasso, motivo }, reservas, descartadas, acao);
}

// ───────────────────────────── falar e explicar ─────────────────────────────

/**
 * FALAR e EXPLICAR (a nuance): a nuvem quando o plano inclui e nada a impede; senão, o aparelho. A
 * voz do aparelho sempre existe; a nuance não tem via local aceitável em português — o degrau do
 * aparelho só tem motor quando há um modelo de linguagem no próprio computador.
 */
function decidirPelaNuvem(p: PedidoDeRota): DecisaoDeRota {
  const nuance = p.tarefa === 'nuance';
  const bloqueios = bloqueiosDaNuvem(p, nuance ? p.plano.nuance : p.plano.vozNeural, null, false);
  const bloqueio = bloqueios[0] ?? null;
  const temLocal = !nuance || p.aparelho.modelos.llmLocal;
  const local = (motivo: MotivoDaRota): PassoDaRota => ({
    degrau: 'modelo-no-aparelho',
    motivo,
    ...(nuance && temLocal ? { motor: 'openai-compatible-local' } : {}),
  });
  const reserva = local(temLocal ? 'reserva' : 'recurso-indisponivel');
  if (!bloqueio) {
    const nuvem: PassoDaRota = { degrau: 'nuvem-por-trechos', motivo: nuance ? 'so-na-nuvem' : 'nuvem-primeiro' };
    return fechar(p, nuvem, [reserva], []);
  }
  const descartadas: Descartada[] = [{ degrau: 'nuvem-por-trechos', motivo: bloqueio }];
  // A nuance só existe no plano que a inclui: aí a tela pode mostrar os planos.
  return fechar(p, local(bloqueio), [reserva], descartadas, acaoDoBloqueio(bloqueios, nuance));
}

// ───────────────────────────── a porta ─────────────────────────────

/**
 * A DECISÃO. Pura: a mesma entrada dá a mesma saída, e nada do pedido é alterado.
 *
 * Com `estado.politicaLigada` ausente ou `false`, equivale às decisões de hoje (ver o cabeçalho).
 */
export function decidirRota(pedido: PedidoDeRota): DecisaoDeRota {
  switch (pedido.tarefa) {
    case 'stt-final':
    case 'stt-parcial':
      return decidirStt(pedido);
    case 'mt-final':
    case 'mt-parcial':
      return decidirMt(pedido);
    case 'voz':
    case 'nuance':
      return decidirPelaNuvem(pedido);
  }
}

/**
 * A decisão de TRANSCRIÇÃO no formato que o gateway entende: "nuvem primeiro?" e o modelo local (o
 * que roda agora, ou a reserva de quem foi à nuvem ou ao navegador).
 *
 * Só para decisões de `stt-final` e `stt-parcial`: as outras tarefas não têm modelo de transcrição, e
 * chamar com elas é erro de programação (lança, em vez de devolver um modelo inventado).
 */
export function paraRotaDoStt(decisao: DecisaoDeRota): RotaDoSttDaPolitica {
  const local = [decisao.rota, ...decisao.reservas].find((x) => x.degrau === 'modelo-no-aparelho' && x.modelo);
  if (!local?.modelo) throw new Error('paraRotaDoStt: a decisão não é de transcrição (sem modelo local)');
  return {
    preferCloud: ehNuvemDoBabel(decisao.rota.degrau),
    localModel: local.modelo,
    ...(local.dtype ? { dtype: local.dtype } : {}),
    ...(local.device ? { device: local.device } : {}),
  };
}
