/**
 * CONFERÊNCIA DA ROTA DA FALA (dev) — a política nova rodando AO LADO da rota de hoje (modo sombra,
 * etapa 4 de `planos-v3-e-rota-inteligente`).
 *
 * A rota efetiva continua sendo a do `routeStt`. Aqui o que a `rotaDaCaptura` já tem em mãos vira um
 * `PedidoDeRota`, a `decidirRota` (`core/rota/politicaDeRota.ts`) responde com a política DESLIGADA,
 * e a diferença para a rota efetiva vai para o console — só em desenvolvimento, como a conferência do
 * tradutor (`gateway/conferenciaDaRotaMt.ts`). Em produção o ramo some no build, e o `import()` com
 * ele. Nada aqui muda a rota.
 *
 * O QUE UMA DIVERGÊNCIA QUER DIZER. Com consentimento dado, perfil adulto e plano com nuvem, as duas
 * decisões são idênticas (`tests/politicaDeRota.test.ts`, "EQUIVALÊNCIA com hoje"). O `routeStt` não
 * vê consentimento, idade nem plano; a política vê. Então a divergência esperada é esta: a rota de
 * hoje diz "nuvem primeiro" para alguém a quem o gateway ou o servidor vão recusar a nuvem depois, e a
 * política já diz "aparelho" com o motivo. Qualquer outra é defeito de um dos dois lados.
 */
import { gpuRealDaRota } from '../../core/nuvemDeAlivio';
import { decidirRota, paraRotaDoStt, type PedidoDeRota } from '../../core/rota/politicaDeRota';
import {
  type DispositivoDaRota,
  smallComGpuProvada,
  type SttQuality,
  type SttRoute,
  usarGpuNoAparelho,
} from '../../gateway/sttRouter';

/** O que a `rotaDaCaptura` tem em mãos quando chama o `routeStt`. */
export interface EntradaDaConferencia {
  /** O idioma que se OUVE (o `contentLang` do `routeStt`). */
  idiomaDoConteudo: string;
  /** O idioma que se FALA ao microfone. */
  idiomaDoMicrofone: string;
  /** O microfone vai ao nosso modelo (e não ao reconhecimento do navegador). */
  micVaiAoModelo: boolean;
  /** O cenário é só o microfone. */
  soMicrofone: boolean;
  detectarIdioma: boolean;
  qualidade: SttQuality;
  /** Há ADAPTADOR WebGPU (`temAdaptadorWebGpu`). */
  temWebGpu: boolean;
  /** A resposta de `/api/ai/stt/available` (ou da nuvem do site). */
  nuvemDisponivel: boolean;
  perfilId: string;
  dispositivo: DispositivoDaRota;
  /** `PerfilDoDispositivo.leve`. */
  leve: boolean;
}

/** O que a rota de hoje NÃO vê e a política vê: lido do app por `conferirRotaDoStt`. */
export interface AmbienteDaConferencia {
  consentiuNuvem: boolean;
  consentiuNavegador: boolean;
  protegido: boolean;
  responsavelAutorizou: boolean;
  edicaoEstatica: boolean;
  /** A nuvem do site existe neste aparelho (`nuvemDoQuestExiste`). */
  nuvemDoSite: boolean;
  /** Os entitlements da conta: capacidades, nunca o nome do plano. */
  capacidades: { managedCloudStt: boolean; managedCloudLlm: boolean; traducaoNuance: boolean; vozNatural: boolean };
  /** O Grátis aceitou a nuvem de alívio nesta aba: a franquia dele inclui a nuvem. */
  alivioAceito: boolean;
}

const QUALIDADE = { auto: 'auto', fast: 'rapido', accurate: 'preciso', cloud: 'nuvem' } as const;

/**
 * O pedido que faz à política a MESMA pergunta que a `rotaDaCaptura` faz ao `routeStt`: "qual é a
 * rota do modelo de transcrição?". Por isso o microfone entra como `modelo` (quem decide o
 * reconhecimento do navegador é o `escolherMotorDoMic`, antes) e, quando o microfone não vai ao
 * modelo, a pergunta é sobre o áudio do sistema — é o que o `routeStt` responde hoje, inclusive no
 * cenário só de microfone. Pura. A política vai DESLIGADA.
 */
export function montarPedidoDeRota(e: EntradaDaConferencia, a: AmbienteDaConferencia): PedidoDeRota {
  const micDecide = e.soMicrofone && e.micVaiAoModelo && !!e.idiomaDoMicrofone;
  const d = e.dispositivo;
  const comNuvem = a.capacidades.managedCloudStt || a.alivioAceito;
  return {
    tarefa: 'stt-final',
    fonte: micDecide ? 'microfone' : 'sistema',
    idioma: micDecide ? e.idiomaDoMicrofone : e.idiomaDoConteudo,
    idiomaDoMicrofone: !micDecide && e.micVaiAoModelo ? e.idiomaDoMicrofone : undefined,
    detectarIdioma: e.detectarIdioma,
    aparelho: {
      tipo: d.tipo,
      leve: e.leve,
      travando: false, // o regulador só sabe depois de a captura começar
      gpuProvada: gpuRealDaRota(e.temWebGpu, d.adaptadorReal),
      economiaDeDados: d.economiaDeDados,
      smallNaGpu: smallComGpuProvada(d, e.temWebGpu),
      whisperNaGpu: usarGpuNoAparelho(d, e.temWebGpu),
      shaderF16: d.shaderF16 === true,
      // Fora da pergunta (o microfone entra como `modelo`, e a tarefa é transcrever).
      navegador: { fala: false, falaNoAparelho: null, bipaAoReligar: false, tradutor: false },
      modelos: { opusMt: false, bergamot: false, llmLocal: false },
    },
    plano: {
      nuvemPorTrechos: comNuvem,
      precisaoPorPadrao: a.capacidades.managedCloudStt, // hoje quem tem a nuvem a recebe por padrão
      nuvemAoVivo: false, // ainda não existe
      traducaoNaNuvem: a.capacidades.managedCloudLlm || a.alivioAceito,
      nuance: a.capacidades.traducaoNuance,
      vozNeural: a.capacidades.vozNatural,
      // O restante por nível chega com o contador da etapa 3; até lá, "não se sabe".
      restante: { trechosNoMesS: null, trechosNoDiaS: null, aoVivoNoMesS: null, aoVivoNoDiaS: null },
    },
    estado: {
      consentimentos: { nuvem: a.consentiuNuvem, navegador: a.consentiuNavegador },
      perfilPrivado: e.perfilId === 'local-private',
      perfilProtegido: a.protegido,
      responsavelAutorizou: a.responsavelAutorizou,
      nuvemDisponivel: e.nuvemDisponivel,
      nuvemPausada: false,
      semRede: false,
      edicaoEstatica: a.edicaoEstatica,
      nuvemDoSite: a.nuvemDoSite,
      preferencia: { qualidade: QUALIDADE[e.qualidade] ?? 'auto', microfone: 'modelo' },
    },
  };
}

type RotaEfetiva = Pick<SttRoute, 'preferCloud' | 'localModel' | 'dtype' | 'device'>;

/** A diferença entre a política e a rota efetiva, em texto para o console; `null` = são a mesma. */
export function divergenciaDaRotaDoStt(pedido: PedidoDeRota, efetiva: RotaEfetiva): string | null {
  const decisao = decidirRota(pedido);
  const politica = paraRotaDoStt(decisao);
  const diferencas: string[] = [];
  if (politica.preferCloud !== efetiva.preferCloud)
    diferencas.push(`nuvem primeiro: política ${politica.preferCloud}, hoje ${efetiva.preferCloud}`);
  if (politica.localModel !== efetiva.localModel)
    diferencas.push(`modelo local: política ${politica.localModel}, hoje ${efetiva.localModel}`);
  if ((politica.dtype ?? 'hybrid') !== (efetiva.dtype ?? 'hybrid'))
    diferencas.push(`dtype: política ${politica.dtype ?? 'hybrid'}, hoje ${efetiva.dtype ?? 'hybrid'}`);
  if (politica.device !== efetiva.device)
    diferencas.push(`device: política ${politica.device ?? 'auto'}, hoje ${efetiva.device ?? 'auto'}`);
  if (!diferencas.length) return null;
  const descartadas = decisao.descartadas.map((d) => `${d.degrau} (${d.motivo})`).join(', ') || 'nada';
  return `política de rota diverge da rota efetiva — ${diferencas.join('; ')}. Política: ${decisao.rota.degrau} por ${decisao.rota.motivo}; descartou ${descartadas}.`;
}

/** Cada divergência aparece uma vez por página: a `rotaDaCaptura` roda ao preparar e ao pré-aquecer. */
const jaAvisadas = new Set<string>();

/**
 * SÓ EM DESENVOLVIMENTO: lê do app o que a rota de hoje não vê, pergunta à política e registra a
 * divergência. Nunca lança e nunca devolve nada a quem chama — a rota efetiva não depende disto.
 */
export async function conferirRotaDoStt(entrada: EntradaDaConferencia, efetiva: RotaEfetiva): Promise<void> {
  if (!import.meta.env?.DEV) return;
  try {
    const [consentimento, protecao, direitos, estatica, site, alivio] = await Promise.all([
      import('../consentimentoDeNuvem'),
      import('../protecaoDoMenor'),
      import('../entitlements'),
      import('../edicaoEstatica'),
      import('../nuvemDoQuest'),
      import('../nuvemDeAlivio/estado'),
    ]);
    const protegido = protecao.perfilProtegido();
    const capacidades = direitos.getEntitlements();
    const texto = divergenciaDaRotaDoStt(
      montarPedidoDeRota(entrada, {
        consentiuNuvem: consentimento.consentiuNuvem(),
        consentiuNavegador: consentimento.consentiuReconhecimentoDoNavegador(),
        protegido,
        // `rapidoDoMicPermitido` é a régua do responsável: adulto, ou protegido com o vínculo aceito.
        responsavelAutorizou: protegido && consentimento.rapidoDoMicPermitido(),
        edicaoEstatica: estatica.edicaoEstatica(),
        nuvemDoSite: site.nuvemDoQuestExiste(),
        capacidades,
        alivioAceito: alivio.alivioAceito(),
      }),
      efetiva,
    );
    if (!texto || jaAvisadas.has(texto)) return;
    jaAvisadas.add(texto);
    console.warn('[rota]', texto);
  } catch (erro) {
    console.warn('[rota] conferência da política indisponível', erro);
  }
}
