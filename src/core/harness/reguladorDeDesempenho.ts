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
 * OS SINAIS RÁPIDOS ("Grátis sem travar", 2026-09-29). Só com o final, o regulador reagia tarde: um
 * final por fala, a cada vários segundos, e três deles até o primeiro degrau — no aparelho fraco a
 * ABA já tinha congelado antes. Por isso:
 *   · `travamento` — o main thread ficou bloqueado ≥ 400 ms numa janela de 10 s (quadros longos, pelo
 *     `PerformanceObserver`; ver `lib/captura/vigiaDoMainThread.ts`). É o sintoma que a pessoa sente,
 *     não o do modelo: a legenda pode até chegar, mas a tela não responde;
 *   · o caso GRAVE — RTF do trecho > 1,5 com fila: não há o que esperar, desce no primeiro final;
 *   · o PARCIAL (`origem: 'parcial'`) — chega bem mais vezes que o final e é julgado pela LATÊNCIA
 *     (> 1,5 s é ruim), não pelo RTF: ele redecodifica o áudio que cresce, e a razão decode/áudio dele
 *     não é a do final;
 *   · o aparelho LEVE (`configDoReguladorPara`) desce com 2 trechos e 6 s entre degraus.
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
  | 'visivel'
  | 'travamento';

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
  /**
   * Quanto o main thread ficou BLOQUEADO (ms) na janela `janelaDeBloqueioMs` que acabou agora — a soma
   * do tempo de bloqueio dos quadros longos. Ausente = o navegador não mede (sem LoAF nem longtask).
   */
  bloqueioDoMainMs?: number;
  /**
   * De onde vem a medida. `'parcial'` é só uma amostra de LATÊNCIA (`latenciaMs` = o decode do parcial)
   * e dos sinais do ambiente: `rtf`, `filaPendente` e `modoSoOuvir` não valem nela. Ausente = final.
   */
  origem?: 'final' | 'parcial';
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
  /** RTF do trecho ACIMA disto, com fila, desce já no primeiro final (o caso grave). */
  rtfSevero: number;
  /** Parcial que levou mais que isto (ms) conta como lento. */
  latenciaParcialMaxMs: number;
  /** Bloqueio do main thread na janela a partir do qual a tela conta como travada (ms). */
  bloqueioMaximoMs: number;
  /** A janela em que o bloqueio é somado (ms) — quem mede o bloqueio usa este número. */
  janelaDeBloqueioMs: number;
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
  rtfSevero: 1.5,
  latenciaParcialMaxMs: 1_500,
  bloqueioMaximoMs: 400,
  janelaDeBloqueioMs: 10_000,
};

/**
 * A config por aparelho. No LEVE (Quest, celular fraco, desktop de 2 núcleos — `leve` do perfil em
 * `lib/dispositivo/perfil.ts`, que entra aqui pelo formato para o núcleo não depender do navegador)
 * o aparelho não tem margem: esperar 3 trechos e 10 s por degrau é deixar a fila crescer e a tela
 * travar enquanto o regulador ainda "confirma". Desce com 2 trechos e 6 s entre degraus — 6 s ainda
 * cobrem a carga de um modelo menor já baixado. Os outros aparelhos ficam com o padrão, intocado.
 */
export function configDoReguladorPara(perfil: { leve: boolean }): ConfigDoRegulador {
  return perfil.leve
    ? { ...CONFIG_PADRAO_DO_REGULADOR, trechosParaDescer: 2, intervaloEntreDescidasMs: 6_000 }
    : { ...CONFIG_PADRAO_DO_REGULADOR };
}

export interface EstadoDoRegulador {
  /** Média móvel exponencial do RTF; `null` antes do primeiro trecho. */
  rtfEwma: number | null;
  /** Trechos seguidos com a média acima de `rtfDescer`. */
  ruinsSeguidos: number;
  /** Parciais seguidos acima de `latenciaParcialMaxMs` (contagem À PARTE: são outro sinal). */
  parciaisLentosSeguidos: number;
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
    parciaisLentosSeguidos: 0,
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
  const doParcial = entrada.origem === 'parcial';

  /* O PARCIAL NÃO DECIDE A PAUSA: ele não sabe se a aba escondida é "só ouvir" (a captura do sistema
     ligada) — quem sabe é o final. Com o regulador pausado, ele é ignorado como qualquer medida. */
  if (doParcial) {
    if (estado.pausado) return { estado, acoes: [], motivos: [] };
  } else if (!entrada.visivel && !entrada.modoSoOuvir) {
    /* ABA ESCONDIDA: pausar o STT, a menos que a pessoa esteja em "só ouvir". Enquanto pausado não se
       mede nada — trecho que chega nesse intervalo não diz nada sobre o aparelho em uso normal — e a
       folga recomeça do zero: estar escondido não é evidência de que o aparelho aguenta mais. */
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

  if (doParcial) {
    /* Parcial: só a latência, numa contagem À PARTE. Não toca a média do RTF nem a janela dos finais —
       misturar as duas medidas faria um parcial rápido (áudio curto) "absolver" um final lento. */
    estado.parciaisLentosSeguidos =
      entrada.latenciaMs > config.latenciaParcialMaxMs ? estado.parciaisLentosSeguidos + 1 : 0;
  } else {
    // Monitorar: média móvel, janela de latência, contadores.
    estado.trechos += 1;
    estado.rtfEwma =
      estado.rtfEwma === null ? entrada.rtf : config.alfaEwma * entrada.rtf + (1 - config.alfaEwma) * estado.rtfEwma;
    estado.ruinsSeguidos = estado.rtfEwma > config.rtfDescer ? estado.ruinsSeguidos + 1 : 0;
    estado.latencias.push(entrada.latenciaMs);
    if (estado.latencias.length > config.janelaDeLatencia)
      estado.latencias.splice(0, estado.latencias.length - config.janelaDeLatencia);
  }
  if (entrada.erro) estado.erros += 1;

  /* OOM / device.lost: o modelo ATUAL não cabe neste aparelho. O pipeline grava o veto e carrega
     outro; o regulador só avisa (quem sabe qual modelo está carregado é o pipeline). */
  if (entrada.erro === 'oom' || entrada.erro === 'device-lost') {
    acoes.push('proibir-modelo');
    motivos.push(entrada.erro);
  }

  // Analisar: algum gatilho de descida?
  const gatilhos: MotivoDoRegulador[] = [];
  if (doParcial) {
    if (estado.parciaisLentosSeguidos >= config.trechosParaDescer) gatilhos.push('latencia');
  } else {
    /* O CASO GRAVE não espera a contagem: o trecho levou mais de 1,5× a própria duração e já há outro
       na fila — a legenda vai atrasar mais a cada fala, e esperar três finais é deixar a fila crescer. */
    const grave = entrada.rtf > config.rtfSevero && entrada.filaPendente >= 1;
    if (estado.ruinsSeguidos >= config.trechosParaDescer || grave) gatilhos.push('rtf');
    if (entrada.filaPendente > config.filaMaxima) gatilhos.push('fila');
    if (
      estado.latencias.length >= config.minAmostrasDeLatencia &&
      percentil(estado.latencias, 0.9) > config.latenciaP90MaxMs
    )
      gatilhos.push('latencia');
  }
  // Os sinais do AMBIENTE valem em qualquer medida — e o parcial chega bem mais vezes que o final.
  if (entrada.pressao === 'serious' || entrada.pressao === 'critical') gatilhos.push('pressao');
  if (entrada.bateria && !entrada.bateria.carregando && entrada.bateria.nivel < config.bateriaMinima)
    gatilhos.push('bateria');
  if (entrada.bloqueioDoMainMs !== undefined && entrada.bloqueioDoMainMs >= config.bloqueioMaximoMs)
    gatilhos.push('travamento');

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
      estado.parciaisLentosSeguidos = 0;
      estado.latencias = [];
    }
    return { estado, acoes, motivos };
  }

  /* Parcial não prova folga (decodifica pouco áudio, é sempre mais rápido que o final); parcial LENTO
     prova o contrário e zera o relógio da subida. */
  if (doParcial) {
    if (estado.parciaisLentosSeguidos > 0) estado.inicioDaFolgaMs = null;
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
