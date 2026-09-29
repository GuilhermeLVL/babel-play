/**
 * O RELÓGIO DA SESSÃO e o PIPELINE DE TRADUÇÃO da captura ao vivo.
 *
 * Saiu de `views/LiveCapture.tsx` sem mudar uma linha de comportamento: as duas fábricas são
 * chamadas a cada render, exatamente como as closures que substituem, e tudo que dependia do
 * estado da tela (refs, setters, gateway) entra por PARÂMETRO explícito — nada de contexto novo.
 */
import { ehCancelamento, soFaltaCarregar } from '@core';
import type { Dispatch, RefObject, SetStateAction } from 'react';

import { capMetrics } from '../../gateway/capture/captureMetrics';
import { getEntitlements } from '../entitlements';
import { baseLang, langLabel } from '../languages';
import { OrdemDasTraducoes } from '../ordemDaTraducao';
import type { PerfilAdaptativoDeIdioma } from '../perfilDeIdioma';
// Fala do MIC em português → português claro antes de traduzir (vícios, contrações, gíria).
import { LIMIAR_APROXIMADA, LIMIAR_APROXIMADA_NUVEM } from '../traducao/memoriaAproximada';
import {
  type ArmazemDeTraducoes,
  contarPalavras,
  deveGuardarNaMemoria,
  MAX_PALAVRAS_SEM_CONTEXTO,
} from '../traducao/memoriaDeTraducao';
import { buscarNaMemoria, memoriaPadrao } from '../traducao/memoriaEmCamadas';
import { chaveNormalizada, prepararFala } from '../traducao/prepararFala';
import { clog, type GatewayDaCaptura, type SpeechSegment } from './tiposDaFala';
import {
  type ConhecidasDaFala,
  type ModoDeTraducao,
  motivoParaNaoTraduzir,
  type PedidoSobDemanda,
} from './traducaoSobDemanda';

/** O que o relógio da sessão precisa da tela. */
export interface DepsDoRelogio {
  sessionStartMsRef: RefObject<number>;
  shouldAnchorClockRef: RefObject<boolean>;
  /** O som do computador entra sempre — mas os caminhos de ERRO dependem desta variável. */
  systemEnabled: boolean;
}

/**
 * Relógio da sessão + a ancoragem dele ao recorder que produz o áudio salvo.
 * Os refs continuam nascendo na tela (são hooks); aqui mora só a conta.
 */
export function criarRelogioDaSessao({ sessionStartMsRef, shouldAnchorClockRef, systemEnabled }: DepsDoRelogio) {
  const nowRel = () => (sessionStartMsRef.current ? Math.max(0, Date.now() - sessionStartMsRef.current) : 0);

  /**
   * Re-zera o relógio da sessão para o t=0 do recorder que produz o áudio salvo. O áudio salvo
   * prefere o do SISTEMA (recordedAudioRef = sysBlob ?? micBlob), então o mic só ancora quando o
   * sistema NÃO é fonte (mic-only) ou quando o sistema FALHOU ('mic-fallback'). Primeira âncora vence.
   */
  const anchorSessionClock = (startedAtMs: number, source: 'system' | 'mic' | 'mic-fallback') => {
    if (!shouldAnchorClockRef.current || !startedAtMs) return;
    if (source === 'mic' && systemEnabled) return; // o sistema é a fonte do áudio salvo → ele ancora
    sessionStartMsRef.current = startedAtMs;
    shouldAnchorClockRef.current = false;
    clog('⏱ relógio ancorado ao início do recorder (', source, '), legenda alinhada ao áudio salvo');
  };

  return { nowRel, anchorSessionClock };
}

/** Os dois códigos têm o mesmo idioma BASE (`pt` == `pt-BR`)? Vazio nunca é "o mesmo". */
export function mesmaLingua(a?: string, b?: string): boolean {
  const x = baseLang(a || '');
  return !!x && x === baseLang(b || '');
}

/**
 * A origem de UMA fala para decidir se há tradução: no SISTEMA vale o idioma observado na sessão
 * (quando o perfil já convergiu), senão o desta fala; na SUA fala (`falada`), sempre o dela.
 */
export function origemDaFala(src: string, idiomaObservado: string, falada: boolean): string {
  return falada ? baseLang(src || '') : idiomaObservado || baseLang(src || '');
}

/**
 * O que o balão mostra na linha de tradução ENQUANTO ela não chega: "…" quando vai haver tradução,
 * vazio quando origem e destino já são o mesmo idioma (uma linha só, sem marcador pendurado).
 */
export function marcadorDeTraducao(origem: string, destino: string): string {
  return mesmaLingua(origem, destino) ? '' : '…';
}

/** Opções de uma tradução de balão (as mesmas de antes). */
export interface OpcoesDeTraducao {
  descartarSeOcupado?: boolean;
  falada?: boolean;
  /** A pessoa PEDIU esta tradução ("Mostrar tradução"): a preferência sob demanda não se aplica. */
  pedida?: boolean;
}

/** O que o pipeline de MT precisa da tela. */
export interface DepsDaTraducaoDaFala {
  gateway: GatewayDaCaptura;
  ordemMtRef: RefObject<OrdemDasTraducoes>;
  sourceLangRef: RefObject<string>;
  targetLangRef: RefObject<string>;
  idiomaObservadoRef: RefObject<string>;
  perfilIdiomaRef: RefObject<PerfilAdaptativoDeIdioma>;
  speechSegmentsRef: RefObject<SpeechSegment[]>;
  translationCacheRef: RefObject<Map<string, string>>;
  /** Avisos ÚNICOS por sessão (degradação da MT, áudio já no idioma da legenda, queda da nuvem). */
  mtFailNotifiedRef: RefObject<boolean>;
  altTargetNotifiedRef: RefObject<boolean>;
  degradacaoAvisadaRef: RefObject<boolean>;
  setSpeechSegments: Dispatch<SetStateAction<SpeechSegment[]>>;
  setFeedbackMsg: (msg: string) => void;
  /**
   * Memória de tradução ENTRE SESSÕES, atrás do `translationCacheRef` da aba (IndexedDB por
   * padrão; `null` desliga). Ver `memoriaDeTraducao.ts` para o que entra e por quê.
   */
  memoriaPersistente?: ArmazemDeTraducoes | null;
  /**
   * A preferência "Tradução" (`traducaoSobDemanda.ts`). Ausente = `sempre`, o comportamento de
   * antes. Refs, e não valores: a fábrica é recriada a cada render e a troca vale na fala seguinte.
   */
  modoDeTraducaoRef?: RefObject<ModoDeTraducao>;
  /** Palavras que o aluno já sabe (M0), para o modo `novas`. `null` = ainda não carregou. */
  conhecidasRef?: RefObject<ConhecidasDaFala | null>;
  /** Falas deixadas sem tradução, por id: o que "Mostrar tradução" refaz. Sobrevive aos renders. */
  pedidosSobDemandaRef?: RefObject<Map<string, PedidoSobDemanda>>;
  /**
   * O tradutor LOCAL não carregou neste aparelho (WASM, memória — `mt.aoFalharCarga`): a tradução que
   * esperava por ele não vem. A tela diz isso UMA vez, com a oferta do tradutor pela internet (sob
   * consentimento, nunca ligado sozinho).
   */
  aoFalharOTradutorLocal?: () => void;
}

/**
 * Quantas falas uma retradução traduz AO MESMO TEMPO. Ela refaz TODAS as da sessão que ficaram sem
 * tradução (relato do dono no celular, 2026-09-29: o teto antigo de 20 deixava o começo da conversa
 * sem tradução para sempre), as mais novas primeiro — mas poucas por vez, para não enfileirar
 * centenas de pedidos na frente da fala que a pessoa está ouvindo agora.
 */
export const RETRADUCOES_SIMULTANEAS = 2;

/**
 * Os ouvintes do "tradutor pronto"/"tradutor não carregou" são UM por gateway, mas a fábrica é
 * recriada a cada render: eles chamam as funções do render mais novo, guardadas aqui.
 */
const ouvintesDoGateway = new WeakMap<object, { pronto: () => void; falhou: () => void }>();

/** Motores cuja tradução quem paga pela nuvem aceita de volta da memória persistente. */
const MOTORES_DE_NUVEM = new Set(['server-llm-mt', 'groq-llm']);

/**
 * Tradução DESACOPLADA, deduplicada e com cache — nunca bloqueia a exibição do texto.
 * Compartilhada pelas DUAS fontes (mic Web Speech + sistema Whisper). Espelha o LRU do desktop.
 * Aviso único por sessão quando a tradução degrada (nunca silencioso).
 */
export function criarTraducaoDaFala(deps: DepsDaTraducaoDaFala) {
  const {
    gateway,
    ordemMtRef,
    sourceLangRef,
    targetLangRef,
    idiomaObservadoRef,
    perfilIdiomaRef,
    speechSegmentsRef,
    translationCacheRef,
    mtFailNotifiedRef,
    altTargetNotifiedRef,
    degradacaoAvisadaRef,
    setSpeechSegments,
    setFeedbackMsg,
  } = deps;
  const memoria = deps.memoriaPersistente === undefined ? memoriaPadrao() : deps.memoriaPersistente;

  /**
   * AVISA QUANDO A NUVEM CAI, em vez de degradar em silêncio.
   *
   * A cascata é boa: se o `server-llm-mt` falha, o `opus-mt` local assume e o usuário continua
   * lendo alguma coisa. O problema é o SILÊNCIO. Medido (docs/auditoria/eval-producao-v1.md): o
   * local traduz idiomático a 27,4% e a nuvem a 83,1% — quem paga pela nuvem e recebe o local
   * recebe de volta exatamente a tradução literal que motivou a assinatura, sem nenhum sinal de
   * que algo mudou. Cobrar por isso caladamente é o pior primeiro contato possível com um assinante.
   *
   * Só para quem TEM direito à nuvem: para o plano gratuito o motor local não é degradação, é o
   * produto — avisar ali seria transformar funcionamento normal em mensagem de erro.
   */
  const avisarSeDegradou = (engine: string | undefined, falada: boolean) => {
    if (!falada || degradacaoAvisadaRef.current) return;
    if (!engine || engine === 'server-llm-mt' || engine === 'groq-llm') return;
    if (!getEntitlements().managedCloudLlm) return;
    degradacaoAvisadaRef.current = true;
    clog('tradução degradou para', engine, '— a nuvem do plano não respondeu');
    setFeedbackMsg('A tradução de nuvem não respondeu; seguindo com o tradutor local, que é mais literal.');
    setTimeout(() => setFeedbackMsg(''), 8000);
  };

  /**
   * Pede a tradução de um balão. A promessa resolve quando o pedido ACABA (traduziu, degradou, ficou
   * pendente ou nem precisou) — é o que deixa a retradução andar poucas por vez. Nunca rejeita.
   */
  const translateSegment = (
    segId: string,
    text: string,
    srcCode?: string,
    tgtCode?: string,
    opts?: OpcoesDeTraducao,
  ): Promise<void> => new Promise<void>((fim) => traduzirBalao(segId, text, srcCode, tgtCode, opts, fim));

  const traduzirBalao = (
    segId: string,
    text: string,
    srcCode: string | undefined,
    tgtCode: string | undefined,
    opts: OpcoesDeTraducao | undefined,
    fim: () => void,
  ) => {
    /* SOB DEMANDA (harness §1.2, degrau M0): a preferência "Tradução" deixa a fala SEM MT — "só
       quando eu pedir", ou "só frases com palavra nova" quando o aluno já sabe todas. Desligado por
       padrão (`sempre`): sem a ref, nada aqui roda. Mesmo idioma não é assunto deste bloco (o
       caminho de baixo já não traduz). O final vira "sob demanda" — sem "…", com o pedido guardado
       para "Mostrar tradução" —, invalida a tradução de parcial em voo e conta a economia; o
       parcial só não é pedido, e o balão espera o final. */
    const modo = deps.modoDeTraducaoRef?.current;
    if (modo && modo !== 'sempre' && !opts?.pedida) {
      const falada = opts?.falada === true;
      const origemM0 = origemDaFala(srcCode ?? sourceLangRef.current.split('-')[0], idiomaObservadoRef.current, falada);
      const tgtM0 = tgtCode ?? targetLangRef.current.split('-')[0];
      const parcialM0 = opts?.descartarSeOcupado === true;
      const motivo = mesmaLingua(origemM0, tgtM0)
        ? null
        : motivoParaNaoTraduzir({
            modo,
            texto: text,
            origem: origemM0,
            destino: tgtM0,
            parcial: parcialM0,
            falada,
            conhecidas: deps.conhecidasRef?.current,
          });
      if (motivo) {
        fim();
        if (parcialM0) return;
        ordemMtRef.current.encerrar(segId, ordemMtRef.current.abrir(segId));
        deps.pedidosSobDemandaRef?.current.set(segId, { texto: text, src: srcCode, tgt: tgtCode, falada });
        setSpeechSegments((prev) =>
          prev.map((seg) => (seg.id === segId ? { ...seg, translatedText: '', traducaoSobDemanda: true } : seg)),
        );
        capMetrics.mtPulada(motivo);
        return;
      }
    }
    /* PARCIAL NÃO ENFILEIRA TRADUÇÃO. Cada refinamento do parcial gastava uma chamada de MT
       inteira que era descartada segundos depois pelo refinamento seguinte. Com uma tradução já
       em voo para este balão, o parcial seguinte simplesmente não é pedido, o decode final
       sempre traduz, então nenhum balão fica sem legenda por causa disto. */
    if (opts?.descartarSeOcupado && ordemMtRef.current.ocupado(segId)) return fim();
    const selo = ordemMtRef.current.abrir(segId);
    /* O pedido é de um PARCIAL (quem pede descartar-se ocupado é só o parcial do Whisper). O gateway
       só o traduz com motor local e, sem nenhum pronto, devolve vazio; aqui ele não degrada, não
       avisa e não entra no cache (ver adiante). */
    const parcial = opts?.descartarSeOcupado === true;

    const src = srcCode ?? sourceLangRef.current.split('-')[0];
    const tgt = tgtCode ?? targetLangRef.current.split('-')[0];

    /* MESMO IDIOMA = UMA LINHA SÓ, SEM CHAMAR A MT (relato do dono: vídeo em português, "Detectar"
       → Português). Compara o idioma BASE (`pt` == `pt-BR`). Antes, o conteúdo já no seu idioma
       era redirecionado para o idioma estudado — que na tela de mídia com "Detectar" nem aparece —
       e surgia uma segunda linha que ninguém pediu, pagando uma chamada de MT por fala.

       A origem do SISTEMA é o idioma OBSERVADO na sessão (o perfil convergido resiste a detecção
       isolada errada: um "Thank you." solto numa conversa em português não vira tradução); a SUA
       fala (`falada`) tem a própria origem — o perfil observado é o do outro lado. */
    const origemEfetiva = origemDaFala(src, idiomaObservadoRef.current, opts?.falada === true);
    if (mesmaLingua(origemEfetiva, tgt)) {
      fim();
      // Limpa o "…" para o balão não ficar esperando uma tradução que não virá.
      if (ordemMtRef.current.encerrar(segId, selo)) {
        setSpeechSegments((prev) => prev.map((seg) => (seg.id === segId ? { ...seg, translatedText: '' } : seg)));
      }
      /* AVISO ÚNICO, só quando é conclusão da sessão (perfil convergido), não palpite de uma fala. */
      if (!opts?.falada && !altTargetNotifiedRef.current && perfilIdiomaRef.current.observado()) {
        altTargetNotifiedRef.current = true;
        const conf = Math.round(perfilIdiomaRef.current.ler().confianca * 100);
        clog('perfil de idioma convergiu:', origemEfetiva, `(${conf}% das falas)`, '= idioma da legenda, sem tradução');
        setFeedbackMsg(
          `Detectei que o áudio já está em ${langLabel(origemEfetiva)} (${conf}% das falas), o mesmo idioma da legenda: sem tradução.`,
        );
        setTimeout(() => setFeedbackMsg(''), 7000);
      }
      return;
    }

    /* ORIGEM VAZIA DESQUALIFICA TRÊS DOS QUATRO TRADUTORES.
       `chrome-translator`, `mymemory` e `opus-mt-local` recusam `src` nulo no `supports()`,
       precisam do par explícito. Sobra o `server-llm-mt`, e quando ele está fora o gateway
       responde `NoRouteError`. Era a causa dos erros intermitentes no log: com detecção
       automática, `src` chegava vazio sempre que a detecção daquela fala falhava.

       O perfil da sessão preenche a lacuna: já sabemos, com confiança medida, o que está sendo
       falado. Usar isso como origem devolve os três tradutores à cascata, e é informação
       melhor que o palpite de uma fala isolada, não pior. */
    const origem = src || idiomaObservadoRef.current || '';
    /* FALA em português vai "arrumada" para o motor: sem "né"/"ahn", sem "tá"/"pra", gíria em
       português claro. É o que faz o opus-mt/Chrome Translator (motores de texto escrito) darem o
       SENTIDO em vez de "the people" para "a gente". Texto do sistema não passa por aqui. */
    const preparada = opts?.falada ? prepararFala(text, origem, tgt) : { texto: text, mudou: false };
    const textoParaMt = preparada.texto;
    if (preparada.mudou)
      clog(
        'fala preparada:',
        JSON.stringify(text).slice(0, 60),
        '→',
        JSON.stringify(preparada.traducaoPronta ?? textoParaMt).slice(0, 60),
      );
    // Chave tolerante a caixa/pontuação final: "Tá bom." e "tá bom" eram duas entradas.
    const cacheKey = `${origem}|${tgt}|${chaveNormalizada(textoParaMt)}`;
    const applyTranslation = (translated: string, aproximada = false) => {
      // "≈" na frente: o último recurso público (MyMemory) acerta frases comuns e erra gíria e
      // contexto. Dizer que é aproximada é o que separa "tradução ruim" de "app mentindo".
      const capitalized = (aproximada ? '≈ ' : '') + translated.charAt(0).toUpperCase() + translated.slice(1);
      // As palavras de vocabulário já foram extraídas da fala real no commit do
      // enunciado (wordsFromText); a tradução só atualiza o texto traduzido.
      setSpeechSegments((prev) =>
        prev.map((seg) =>
          seg.id === segId
            ? {
                ...seg,
                translatedText: capitalized,
                traducaoPendente: undefined,
              }
            : seg,
        ),
      );
    };
    // Expressão inteira conhecida ("valeu!", "pois é."): a tradução natural já está pronta.
    if (preparada.traducaoPronta) {
      if (ordemMtRef.current.encerrar(segId, selo)) applyTranslation(preparada.traducaoPronta);
      return fim();
    }
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      if (ordemMtRef.current.encerrar(segId, selo)) applyTranslation(cached);
      return fim();
    }
    /* Quem paga pela nuvem manda também o áudio do SISTEMA primeiro ao LLM do servidor (Fase 2 do
       lançamento); a fala do microfone já ia. Sem o plano, a cascata local de sempre. */
    const nuvemPrimeiro = getEntitlements().managedCloudLlm;

    const traduzir = () => {
      const mtT0 = performance.now();
      /* Contexto para o LLM (só na fala): as últimas 3 falas comprometidas da conversa. FALA CURTA
         (≤ 4 palavras) VAI SEM CONTEXTO: "thank you", "ok", "let's go" se traduzem iguais em qualquer
         conversa, e o contexto entra na chave do cache do SERVIDOR — com ele, a mesma frase nunca
         acertava o cache de lá (auditoria de eficiência da IA, 2026-09-28, achado 2). */
      const contexto =
        opts?.falada && contarPalavras(textoParaMt) > MAX_PALAVRAS_SEM_CONTEXTO
          ? speechSegmentsRef.current
              .filter((s) => !s.isPartial && s.originalText && s.id !== segId)
              .slice(-3)
              .map((s) => `${s.source === 'mic' ? 'Eu' : 'Outro'}: ${s.originalText}`)
          : undefined;

      // Rede de segurança: a tradução NUNCA pode deixar o balão preso em "…". Se vier vazia, der
      // erro, OU travar (timeout) — degrada para o texto ORIGINAL entre parênteses (honesto e útil
      // offline: você ao menos lê o que foi dito). Só degrada se ainda estiver em "…" (não sobrescreve
      // uma tradução já mostrada). `settled` evita corrida entre resposta tardia e o timeout.
      // O PARCIAL nunca degrada: o balão dele espera o final, que traduz (e degrada, se for o caso).
      let settled = false;
      const degrade = () => {
        if (parcial) return;
        setSpeechSegments((prev) =>
          prev.map((seg) =>
            seg.id === segId && seg.translatedText === '…'
              ? { ...seg, translatedText: `(${text})`, traducaoPendente: undefined }
              : seg,
          ),
        );
        // Degradação NUNCA mais é silenciosa (achado da auditoria): avisa UMA vez por sessão
        // que a tradução caiu e o que o usuário está vendo é o texto original.
        if (!mtFailNotifiedRef.current) {
          mtFailNotifiedRef.current = true;
          setFeedbackMsg(
            'Tradução indisponível agora (motores locais e web falharam), mostrando o texto original entre parênteses.',
          );
          setTimeout(() => setFeedbackMsg(''), 8000);
        }
      };
      /* A TRADUÇÃO A CAMINHO (relato do dono no celular, 2026-09-29): a cadeia falhou SÓ porque um
         motor local ainda carrega (`soFaltaCarregar`). Não é falha: o balão fica em "…" marcado como
         pendente (a linha diz "Baixando o tradutor…"), sem a faixa, e quem o traduz é a retradução
         do "tradutor pronto" (`retraduzirDegradados`). */
      const pendente = () => {
        if (parcial) return;
        setSpeechSegments((prev) =>
          prev.map((seg) =>
            seg.id === segId && seg.translatedText === '…' ? { ...seg, traducaoPendente: true } : seg,
          ),
        );
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (ordemMtRef.current.encerrar(segId, selo)) degrade();
        fim();
      }, 8000);

      /* `origem` já caiu para o idioma OBSERVADO da sessão quando esta fala não foi detectada —
         ver o bloco acima. Só chega `null` aqui quando nem o perfil convergiu ainda, e aí o
         Tradutor IA do servidor detecta a origem sozinho, como antes. */
      gateway.mt
        .translate(textoParaMt, origem || null, tgt, {
          falada: opts?.falada === true,
          contexto,
          nuvemPrimeiro,
          // Parcial é descartável e só local: o gateway não o manda à nuvem, e o tradutor local o põe
          // atrás do final e o interrompe quando o final chega.
          parcial,
          /* Porta de qualidade do FINAL (harness §5): a tradução local ruim sobe à nuvem — só para
             quem tem o plano (grátis fica com o local; o consentimento o gateway confere). */
          escalarSeRuim: !parcial && nuvemPrimeiro,
        })
        .then(({ text: translated, engine, approximate }) => {
          if (settled) return; // timeout já degradou → ignora resposta tardia
          settled = true;
          clearTimeout(timeout);
          fim();
          // `atual` = este pedido ainda é o mais recente do balão. Um resultado ATRASADO não escreve
          // na tela (sobrescreveria a tradução do final pelo texto pela metade), mas ainda é uma
          // tradução válida deste texto: entra no cache, e o próximo pedido igual chega instantâneo.
          const atual = ordemMtRef.current.encerrar(segId, selo);
          // Parcial sem tradutor local pronto: nada foi traduzido, nada a medir nem a avisar.
          if (parcial && !translated) return;
          capMetrics.mt(Math.round(performance.now() - mtT0), engine || 'mt');
          // O parcial nunca vai à nuvem: vir do motor local é o esperado, não degradação.
          if (!parcial) avisarSeDegradou(engine, opts?.falada === true || nuvemPrimeiro);
          if (!translated) {
            if (atual) degrade();
            return;
          } // vazio → degrada (antes: ficava em "…")
          /* Só a tradução do FINAL entra no cache. A do parcial vem do motor local (literal) e de um
             texto que muda: se o final chegasse igual, quem paga receberia do cache a literal em vez
             da nuvem. */
          if (!parcial) {
            translationCacheRef.current.set(cacheKey, translated);
            if (translationCacheRef.current.size > 300) {
              const firstKey = translationCacheRef.current.keys().next().value;
              if (firstKey !== undefined) translationCacheRef.current.delete(firstKey);
            }
            // Entre sessões, só fala curta e tradução garantida (ver `memoriaDeTraducao.ts`).
            if (memoria && approximate !== true && deveGuardarNaMemoria(textoParaMt))
              void memoria.gravar(cacheKey, translated, engine || 'mt');
          }
          if (atual) applyTranslation(translated, approximate === true);
        })
        .catch((err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          fim();
          // Parcial atropelado pelo final da mesma fala: não é erro, e o balão já espera a tradução do final.
          if (ehCancelamento(err)) {
            ordemMtRef.current.encerrar(segId, selo);
            return;
          }
          if (soFaltaCarregar(err)) {
            clog('tradução pendente (tradutor local carregando):', segId, `${origem || '?'}→${tgt}`);
            if (ordemMtRef.current.encerrar(segId, selo)) pendente();
            return;
          }
          console.warn('Live translation error:', err);
          /* Sem rota para o par (ex.: um idioma detectado errado, sem tradutor): a fala NÃO fica sem
             legenda — `degrade` mostra o original — e o motivo vai para o log da captura. */
          clog(
            'tradução falhou:',
            segId,
            `${origem || '?'}→${tgt}`,
            String((err as Error)?.message ?? err).slice(0, 120),
          );
          if (ordemMtRef.current.encerrar(segId, selo)) degrade();
        });
    };

    if (!memoria) {
      traduzir();
      return;
    }
    /* MEMÓRIA ENTRE SESSÕES, atrás do cache da aba. Quem paga pela nuvem só aceita de volta o que a
       nuvem traduziu — a tradução literal do motor local, guardada quando a pessoa ainda não pagava,
       não pode substituir a que ela está pagando. O armazém não rejeita (falha = `undefined`); o
       segundo ramo existe para que nem um defeito dele deixe o balão sem tradução.
       APROXIMADA (`memoriaAproximada.ts`): a tradução de uma frase PARECIDA, com diferença segura —
       0,9 no grátis, 0,97 para quem paga. Não entra no cache da aba (lá só mora a exata) e, quando a
       frase não é a mesma nem de pontuação (similaridade < 1), o balão ganha o "≈". */
    buscarNaMemoria(memoria, cacheKey, {
      consultaOriginal: textoParaMt,
      limiar: nuvemPrimeiro ? LIMIAR_APROXIMADA_NUVEM : LIMIAR_APROXIMADA,
      aceitarMotor: nuvemPrimeiro ? (m) => MOTORES_DE_NUVEM.has(m) : undefined,
    }).then(
      (guardada) => {
        if (!guardada) return traduzir();
        if (guardada.aproximada)
          clog(
            'memória aproximada:',
            guardada.camada,
            guardada.similaridade.toFixed(3),
            JSON.stringify(text).slice(0, 60),
          );
        else translationCacheRef.current.set(cacheKey, guardada.texto);
        if (ordemMtRef.current.encerrar(segId, selo))
          applyTranslation(guardada.texto, guardada.aproximada && guardada.similaridade < 1);
        fim();
      },
      (err: unknown) => {
        clog('memória de tradução falhou na leitura, seguindo sem ela:', String(err).slice(0, 120));
        traduzir();
      },
    );
  };

  /** A fala precisa de tradução de novo: degradou para "(texto original)" ou esperava o tradutor. */
  const semTraducao = (seg: SpeechSegment) =>
    !seg.isPartial &&
    !!seg.originalText &&
    !seg.traducaoSobDemanda &&
    (seg.translatedText === `(${seg.originalText})` || (seg.traducaoPendente === true && seg.translatedText === '…'));

  /**
   * Balões sem tradução (degradados e PENDENTES) — TODOS os da sessão — voltam a "…" pendente e pedem
   * tradução de novo: as mais novas primeiro, `RETRADUCOES_SIMULTANEAS` por vez, com `falada` na fala
   * do microfone (é ela que vai "arrumada" ao motor). Um balão com tradução em voo fica de fora (a
   * barra e o gateway podem avisar "pronto" os dois).
   */
  const retraduzirDegradados = () => {
    let agendou = false;
    setSpeechSegments((prev) => {
      const alvo = prev.filter((seg) => semTraducao(seg) && !ordemMtRef.current.ocupado(seg.id));
      if (alvo.length === 0) return prev;
      if (!agendou) {
        agendou = true;
        clog('tradutor pronto: retraduzindo', alvo.length, 'balão(ões) sem tradução');
        const fila = [...alvo].reverse();
        const proximo = (): Promise<void> => {
          const seg = fila.shift();
          if (!seg) return Promise.resolve();
          const doSistema = seg.source === 'system';
          return translateSegment(
            seg.id,
            seg.originalText,
            doSistema ? targetLangRef.current : sourceLangRef.current,
            doSistema ? sourceLangRef.current : targetLangRef.current,
            { falada: !doSistema },
          ).then(proximo);
        };
        setTimeout(() => {
          for (let i = 0; i < RETRADUCOES_SIMULTANEAS; i++) void proximo();
        }, 0);
      }
      const ids = new Set(alvo.map((seg) => seg.id));
      return prev.map((seg) => (ids.has(seg.id) ? { ...seg, translatedText: '…', traducaoPendente: true } : seg));
    });
  };

  /**
   * O TRADUTOR LOCAL NÃO CARREGOU (`mt.aoFalharCarga`): a tradução pendente não vem dele. Os pendentes
   * mostram o original (honesto: você ao menos lê o que foi dito) e a tela é avisada UMA vez — o aviso
   * dela, com a oferta do tradutor pela internet, substitui a faixa genérica de falha.
   */
  const tradutorLocalFalhou = () => {
    setSpeechSegments((prev) =>
      prev.some((seg) => seg.traducaoPendente)
        ? prev.map((seg) =>
            seg.traducaoPendente
              ? {
                  ...seg,
                  traducaoPendente: undefined,
                  translatedText: seg.translatedText === '…' ? `(${seg.originalText})` : seg.translatedText,
                }
              : seg,
          )
        : prev,
    );
    if (mtFailNotifiedRef.current) return;
    mtFailNotifiedRef.current = true;
    clog('tradutor local NÃO carregou neste aparelho');
    deps.aoFalharOTradutorLocal?.();
  };

  /**
   * "Mostrar tradução" de uma fala deixada sob demanda: UMA tradução, pelo caminho normal (cache,
   * memória, MT), com os mesmos idiomas do pedido original. O pedido é consumido — dois toques não
   * pagam duas vezes.
   */
  const revelarTraducao = (segId: string) => {
    const pedidos = deps.pedidosSobDemandaRef?.current;
    const pedido = pedidos?.get(segId);
    if (!pedido) return;
    pedidos!.delete(segId);
    setSpeechSegments((prev) =>
      prev.map((seg) => (seg.id === segId ? { ...seg, translatedText: '…', traducaoSobDemanda: undefined } : seg)),
    );
    translateSegment(segId, pedido.texto, pedido.src, pedido.tgt, { falada: pedido.falada, pedida: true });
  };

  /* O TRADUTOR LOCAL FICOU PRONTO (aviso do gateway, depois de fechar o disjuntor dele): as falas
     que degradaram enquanto o modelo carregava são traduzidas de novo. A barra de preparação também
     pede isto quando chega a 100%, mas o modelo pode ficar pronto por um aquecimento ou por um pedido
     de tradução, que não passam por ela (Quest emulado, 2026-09-28). Pedir duas vezes não custa: a
     segunda não acha mais nada em "(original)". */
  const mt = gateway.mt as {
    aoFicarPronto?: (fn: () => void) => () => void;
    aoFalharCarga?: (fn: () => void) => () => void;
  };
  if (!ouvintesDoGateway.has(gateway)) {
    if (typeof mt.aoFicarPronto === 'function') mt.aoFicarPronto(() => ouvintesDoGateway.get(gateway)?.pronto());
    if (typeof mt.aoFalharCarga === 'function') mt.aoFalharCarga(() => ouvintesDoGateway.get(gateway)?.falhou());
  }
  ouvintesDoGateway.set(gateway, { pronto: retraduzirDegradados, falhou: tradutorLocalFalhou });

  return { translateSegment, retraduzirDegradados, revelarTraducao };
}
