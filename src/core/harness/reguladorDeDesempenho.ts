/**
 * REGULADOR DE DESEMPENHO — o laço MAPE-K que faz a captura REAGIR ao aparelho durante o uso
 * (harness adaptativo §4).
 *
 * POR QUE EXISTE. O perfil do aparelho é bem detectado UMA vez (`lib/dispositivo/perfil.ts`), mas
 * nada reage depois: o RTF e a fila só vão à telemetria. No Pixel 7 e no iPhone 14 o RTF medido foi
 * 1,04–1,53 — o modelo não acompanha a fala, a fila cresce e a legenda chega com p95 > 8 s, e o app
 * segue tentando (auditoria de eficiência 2026-09-28, §5). O regulador lê os contadores que já
 * existem (`captureMetrics.ts`) e devolve AÇÕES; quem executa é o pipeline, na integração.
 *
 * MÁQUINA DE ESTADOS PURA. `regular(estado, entrada, config)` devolve o estado novo e as ações; não
 * lê relógio (o tempo vem em `agoraMs`), não muta o estado recebido, não tem efeito colateral. Por
 * isso a histerese é testável com tempo sintético.
 *
 * A ESCADA DE DESCIDA, em ordem (o mais barato de desfazer primeiro):
 *   1. `cortar-parciais` — o parcial é trabalho que o usuário vê por ~1 s e some; cortá-lo alivia sem
 *      mudar a qualidade do texto final;
 *   2. `trocar-backend` — WebGPU↔WASM, SÓ se o microbenchmark mediu o outro mais rápido (a literatura
 *      mostra WebGPU perdendo para WASM em Whisper; sem medição, trocar é chute);
 *   3. `modelo-menor` — small → base → tiny/Moonshine, quantas vezes houver modelo menor;
 *   4. `oferecer-nativo-ou-nuvem` — o chão: o aparelho não aguenta nenhum modelo nosso; oferecer o
 *      nativo (T2) ou a nuvem/Web Speech COM consentimento. É oferta, não troca silenciosa.
 *
 * HISTERESE. Desce rápido (3 trechos ruins, ou um sinal agudo como fila/pressão) e sobe devagar (60 s
 * seguidos de folga). Entre os dois limiares de RTF (0,5 e 0,8) nada muda — sem isso o regulador
 * oscilaria entre dois modelos a cada troca, e cada troca custa recarregar pesos.
 *
 * Todos os números estão em `CONFIG_PADRAO_DO_REGULADOR`; vêm do desenho e são A CALIBRAR com
 * telemetria real por classe de aparelho.
 */

/** Um passo da escada de descida. `subir` desfaz o último passo aplicado. */
export type PassoDeDescida = 'cortar-parciais' | 'trocar-backend' | 'modelo-menor' | 'oferecer-nativo-ou-nuvem';

export type AcaoDoRegulador = PassoDeDescida | 'subir' | 'pausar' | 'retomar' | 'proibir-modelo';

/** Motivo de uma decisão, para a telemetria (nunca texto do usuário). */
export type MotivoDoRegulador =
  | 'rtf'
  | 'fila'
  | 'latencia'
  | 'pressao'
  | 'bateria'
  | 'oom'
  | 'device-lost'
  | 'folga'
  | 'escondida'
  | 'visivel';

/** O estado da CPU pelo `PressureObserver` (Chromium desktop). */
export type PressaoDeCpu = 'nominal' | 'fair' | 'serious' | 'critical';

/** O que o pipeline mede a cada trecho transcrito. */
export interface EntradaDoRegulador {
  /** Fator de tempo real do trecho: tempo de decodificação / duração do áudio. > 1 = não acompanha. */
  rtf: number;
  /** Trechos esperando decodificação. */
  filaPendente: number;
  /** Fim da fala → legenda na tela, em ms. */
  latenciaMs: number;
  /** Falha do trecho: `oom` e `device-lost` vetam o modelo neste aparelho. */
  erro?: 'oom' | 'device-lost' | 'outro';
  pressao?: PressaoDeCpu;
  /** `navigator.getBattery()` (só Chromium): `nivel` de 0 a 1. */
  bateria?: { nivel: number; carregando: boolean };
  /** `document.visibilityState === 'visible'`. */
  visivel: boolean;
  /** Modo "só ouvir": a pessoa quer a transcrição com a aba escondida. */
  modoSoOuvir: boolean;
  /** Relógio monotônico do chamador (ms). */
  agoraMs: number;
}

export interface ConfigDoRegulador {
  /** Peso do trecho novo na média móvel do RTF (EWMA). */
  alfaEwma: number;
  /** RTF médio acima disto conta como trecho ruim. */
  rtfDescer: number;
  /** Quantos trechos ruins SEGUIDOS descem um degrau. */
  trechosParaDescer: number;
  /** RTF do trecho abaixo disto conta como folga. */
  rtfSubir: number;
  /** Folga contínua necessária para subir UM degrau (ms). */
  folgaParaSubirMs: number;
  /** Fila acima disto desce (estrito). */
  filaMaxima: number;
  /** Latência p90 acima disto desce (ms). */
  latenciaP90MaxMs: number;
  /** Tamanho da janela de latências (últimos N trechos). */
  janelaDeLatencia: number;
  /**
   * Mínimo de amostras para o p90 valer. Com menos, o p90 é o máximo da janela e UMA legenda lenta
   * (a primeira, com o modelo esquentando) derrubaria o degrau.
   */
  minAmostrasDeLatencia: number;
  /** Bateria abaixo disto, sem carregador, desce (0–1). */
  bateriaMinima: number;
  /**
   * Intervalo mínimo entre duas descidas (ms): cada passo precisa de tempo para fazer efeito (um
   * modelo menor leva segundos para carregar). Sem ele, um sinal persistente — fila cheia — varreria
   * a escada inteira em quatro trechos.
   */
  intervaloEntreDescidasMs: number;
  /** O microbenchmark mediu o outro backend (WebGPU↔WASM) mais rápido que o atual. */
  outroBackendMaisRapido: boolean;
  /** Quantos modelos menores existem abaixo do atual (small → base → tiny = 2). */
  modelosMenores: number;
}

/** Padrões do desenho (§4). A calibrar com telemetria por classe de aparelho. */
export const CONFIG_PADRAO_DO_REGULADOR: ConfigDoRegulador = {
  alfaEwma: 0.5,
  rtfDescer: 0.8,
  trechosParaDescer: 3,
  rtfSubir: 0.5,
  folgaParaSubirMs: 60_000,
  filaMaxima: 2,
  latenciaP90MaxMs: 3_000,
  janelaDeLatencia: 20,
  minAmostrasDeLatencia: 10,
  bateriaMinima: 0.2,
  intervaloEntreDescidasMs: 10_000,
  outroBackendMaisRapido: false,
  modelosMenores: 2,
};

export interface EstadoDoRegulador {
  /** Média móvel exponencial do RTF; `null` antes do primeiro trecho. */
  rtfEwma: number | null;
  /** Trechos seguidos com a média acima de `rtfDescer`. */
  ruinsSeguidos: number;
  /** Últimas latências (janela deslizante). */
  latencias: number[];
  /** Quantos passos da escada estão aplicados (0 = tudo no máximo). */
  nivel: number;
  ultimaDescidaMs: number | null;
  /** Desde quando há folga contínua; `null` = sem folga agora. */
  inicioDaFolgaMs: number | null;
  pausado: boolean;
  /** Contadores para a telemetria. */
  trechos: number;
  erros: number;
}

export interface SaidaDoRegulador {
  estado: EstadoDoRegulador;
  /** Ações a executar, NESTA ordem. */
  acoes: AcaoDoRegulador[];
  motivos: MotivoDoRegulador[];
  /** Quando `acoes` tem `subir`: qual passo desfazer. */
  desfaz?: PassoDeDescida;
}

export function estadoInicialDoRegulador(): EstadoDoRegulador {
  return {
    rtfEwma: null,
    ruinsSeguidos: 0,
    latencias: [],
    nivel: 0,
    ultimaDescidaMs: null,
    inicioDaFolgaMs: null,
    pausado: false,
    trechos: 0,
    erros: 0,
  };
}

/** A escada de descida desta config, em ordem. `nivel` N = os N primeiros passos aplicados. */
export function escadaDeDescida(config: ConfigDoRegulador): PassoDeDescida[] {
  return [
    'cortar-parciais',
    ...(config.outroBackendMaisRapido ? (['trocar-backend'] as const) : []),
    ...Array.from({ length: Math.max(0, config.modelosMenores) }, () => 'modelo-menor' as const),
    'oferecer-nativo-ou-nuvem',
  ];
}

/** Percentil por posição mais próxima (nearest-rank). */
function percentil(valores: readonly number[], p: number): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const i = Math.min(ordenados.length - 1, Math.max(0, Math.ceil(p * ordenados.length) - 1));
  return ordenados[i];
}

export function regular(
  anterior: EstadoDoRegulador,
  entrada: EntradaDoRegulador,
  parcial?: Partial<ConfigDoRegulador>,
): SaidaDoRegulador {
  const config = { ...CONFIG_PADRAO_DO_REGULADOR, ...parcial };
  const estado: EstadoDoRegulador = { ...anterior, latencias: [...anterior.latencias] };
  const agora = entrada.agoraMs;

  /* ABA ESCONDIDA: pausar o STT, a menos que a pessoa esteja em "só ouvir". Enquanto pausado não se
     mede nada — trecho que chega nesse intervalo não diz nada sobre o aparelho em uso normal — e a
     folga recomeça do zero: estar escondido não é evidência de que o aparelho aguenta mais. */
  if (!entrada.visivel && !entrada.modoSoOuvir) {
    estado.inicioDaFolgaMs = null;
    if (estado.pausado) return { estado, acoes: [], motivos: [] };
    estado.pausado = true;
    return { estado, acoes: ['pausar'], motivos: ['escondida'] };
  }
  const acoes: AcaoDoRegulador[] = [];
  const motivos: MotivoDoRegulador[] = [];
  if (estado.pausado) {
    estado.pausado = false;
    acoes.push('retomar');
    motivos.push('visivel');
  }

  // Monitorar: média móvel, janela de latência, contadores.
  estado.trechos += 1;
  estado.rtfEwma =
    estado.rtfEwma === null ? entrada.rtf : config.alfaEwma * entrada.rtf + (1 - config.alfaEwma) * estado.rtfEwma;
  estado.ruinsSeguidos = estado.rtfEwma > config.rtfDescer ? estado.ruinsSeguidos + 1 : 0;
  estado.latencias.push(entrada.latenciaMs);
  if (estado.latencias.length > config.janelaDeLatencia)
    estado.latencias.splice(0, estado.latencias.length - config.janelaDeLatencia);
  if (entrada.erro) estado.erros += 1;

  /* OOM / device.lost: o modelo ATUAL não cabe neste aparelho. O pipeline grava o veto e carrega
     outro; o regulador só avisa (quem sabe qual modelo está carregado é o pipeline). */
  if (entrada.erro === 'oom' || entrada.erro === 'device-lost') {
    acoes.push('proibir-modelo');
    motivos.push(entrada.erro);
  }

  // Analisar: algum gatilho de descida?
  const gatilhos: MotivoDoRegulador[] = [];
  if (estado.ruinsSeguidos >= config.trechosParaDescer) gatilhos.push('rtf');
  if (entrada.filaPendente > config.filaMaxima) gatilhos.push('fila');
  if (
    estado.latencias.length >= config.minAmostrasDeLatencia &&
    percentil(estado.latencias, 0.9) > config.latenciaP90MaxMs
  )
    gatilhos.push('latencia');
  if (entrada.pressao === 'serious' || entrada.pressao === 'critical') gatilhos.push('pressao');
  if (entrada.bateria && !entrada.bateria.carregando && entrada.bateria.nivel < config.bateriaMinima)
    gatilhos.push('bateria');

  // Planejar e executar (devolver a ação).
  const escada = escadaDeDescida(config);
  if (gatilhos.length > 0) {
    estado.inicioDaFolgaMs = null;
    const podeDescer =
      estado.nivel < escada.length &&
      (estado.ultimaDescidaMs === null || agora - estado.ultimaDescidaMs >= config.intervaloEntreDescidasMs);
    if (podeDescer) {
      acoes.push(escada[estado.nivel]);
      motivos.push(...gatilhos);
      estado.nivel += 1;
      estado.ultimaDescidaMs = agora;
      /* O passo muda o que se mede: a contagem e a janela recomeçam para julgar o degrau NOVO, e
         não o antigo (senão a latência lenta de antes derrubaria o degrau seguinte de graça). */
      estado.ruinsSeguidos = 0;
      estado.latencias = [];
    }
    return { estado, acoes, motivos };
  }

  // Folga: RTF do trecho abaixo do limiar de subida, sem erro, sem gatilho.
  const folga = entrada.rtf < config.rtfSubir && !entrada.erro;
  if (!folga) {
    estado.inicioDaFolgaMs = null;
    return { estado, acoes, motivos };
  }
  if (estado.inicioDaFolgaMs === null) estado.inicioDaFolgaMs = agora;
  if (estado.nivel > 0 && agora - estado.inicioDaFolgaMs >= config.folgaParaSubirMs) {
    estado.nivel -= 1;
    estado.inicioDaFolgaMs = agora; // o próximo degrau exige OUTROS 60 s
    acoes.push('subir');
    motivos.push('folga');
    return { estado, acoes, motivos, desfaz: escada[estado.nivel] };
  }
  return { estado, acoes, motivos };
}
