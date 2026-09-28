/**
 * O PIPELINE DE FALA da captura ao vivo: VAD → STT → diarização → emissão das falas na tela,
 * mais a preparação dos modelos locais (Whisper + opus-mt) que o alimenta.
 *
 * Saiu de `views/LiveCapture.tsx` sem mudar comportamento: a fábrica é chamada a cada render,
 * como as closures que substituiu, e tudo que vem da tela (refs, setters, gateway, o par de
 * idiomas do render corrente) entra por PARÂMETRO explícito — nada de contexto novo.
 */
import { avaliarTrechoStt, razaoDeCompressaoAproximada } from '@core/harness/portasDeQualidade';
import type { Dispatch, RefObject, SetStateAction } from 'react';

import type { ModelPrepState } from '../../components/ModelPrepPanel';
import { apiFetch } from '../../data/api';
import { getActiveProfile, getProviderMode } from '../../gateway/activeProfile';
import { temAdaptadorWebGpu } from '../../gateway/adaptadorWebGpu';
import type { AvisoDeDegradacaoDoStt, SttFinal } from '../../gateway/capabilities';
import { capMetrics, type CapSource } from '../../gateway/capture/captureMetrics';
import type { EspeculacaoDoFinal } from '../../gateway/capture/systemAudio';
import { aoFalharANuvemDoStt } from '../../gateway/falhaDaNuvemDoStt';
import { areModelsCached, expectedModelIds } from '../../gateway/modelCache';
import type { ContextoDoStt } from '../../gateway/promptDeStt';
import { getSttQuality, nomeLegivelDoModelo, routeStt } from '../../gateway/sttRouter';
import { consentiuNuvem } from '../consentimentoDeNuvem';
import { DominantLangTracker } from '../convoLang';
import { dispositivoDaRota, medirPerfilDoDispositivo } from '../dispositivo/perfil';
import { getEntitlements } from '../entitlements';
import { t } from '../i18n';
import { detectLanguage } from '../langDetect';
import { baseLang, langLabel } from '../languages';
import { PerfilAdaptativoDeIdioma, pesoDaDeteccao } from '../perfilDeIdioma';
import { SpeakerClusterer } from '../speakerCluster';
import { embedUtterance } from '../speakerId';
import { isTtsActive } from '../tts';
import { classificarVazamento, type Intervalo } from '../vazamento';
import { disponibilidadeDaSondaParaIdioma, escolherMotorDoMic } from './motorDoMicrofone';
import { type EfeitosDoRegulador, escadaDeModelos, type ReguladorDaCaptura } from './reguladorDaCaptura';
import { planoDaReservaLocal } from './reservaLocal';
import {
  type CaptureScenario,
  clog,
  formatTime,
  type GatewayDaCaptura,
  type SpeakerProfile,
  type SpeechSegment,
  wordsFromText,
} from './tiposDaFala';
import { marcadorDeTraducao, type OpcoesDeTraducao, origemDaFala } from './traducaoDaFala';

/**
 * Marca, no mapa do último texto parcial, que a fala FECHOU e o final já foi pedido. Não é texto que
 * o Whisper produza (começa com NUL), então não colide com um parcial de verdade. Sai do mapa quando
 * o final responde, como qualquer entrada dele.
 */
export const FALA_FECHADA = '\u0000fala-fechada';

/** O decode especulativo de uma fala: a captura só o cancela; o pipeline usa a promessa como final. */
interface FinalEspeculativo extends EspeculacaoDoFinal {
  promessa: Promise<SttFinal>;
}

/** Um enunciado guardado enquanto o modelo ainda carregava. */
export interface EnunciadoPendente {
  pcm: Float32Array;
  sr: number;
  rawSeq: number;
  source: CapSource;
}

/** Tudo que o pipeline precisa da tela — por parâmetro, sem contexto novo nem store global. */
export interface DepsDoPipelineDeFala {
  gateway: GatewayDaCaptura;
  /* --- idiomas e modo de captura --- */
  /** Valor do render: fallback do idioma das palavras quando nada foi detectado. */
  sourceLang: string;
  sourceLangRef: RefObject<string>;
  targetLangRef: RefObject<string>;
  autoDetectLangRef: RefObject<boolean>;
  autoDetectMyLangRef: RefObject<boolean>;
  idiomaObservadoRef: RefObject<string>;
  captureScenarioRef: RefObject<CaptureScenario>;
  perfModeRef: RefObject<boolean>;
  /** Valores do render: o roteador de STT decide o modelo também pelo idioma do MIC. */
  micEnabled: boolean;
  micEngine: 'browser' | 'whisper';
  /* --- relógio e cronômetro da sessão --- */
  timerRef: RefObject<number>;
  nowRel: () => number;
  /* --- estado da transcrição --- */
  setSpeechSegments: Dispatch<SetStateAction<SpeechSegment[]>>;
  seqToSegmentRef: RefObject<Map<number, string>>;
  lastPartialTextRef: RefObject<Map<number, string>>;
  pendingUtterancesRef: RefObject<EnunciadoPendente[]>;
  suppressedSeqsRef: RefObject<Set<number>>;
  modelReadyRef: RefObject<boolean>;
  prepareEmVooRef: RefObject<boolean>;
  /* --- falantes e identificação automática de voz --- */
  speakerProfilesRef: RefObject<SpeakerProfile[]>;
  setSpeakerProfiles: Dispatch<SetStateAction<SpeakerProfile[]>>;
  speakerAutoIdRef: RefObject<boolean>;
  clustererRef: RefObject<SpeakerClusterer>;
  lastVoiceIdRef: RefObject<string | null>;
  provisionalUttsRef: RefObject<Map<number, string[]>>;
  ensureVoiceProfile: (clusterId: number) => string;
  /* --- perfis de idioma observados na sessão --- */
  dominantLangRef: RefObject<DominantLangTracker>;
  perfilIdiomaRef: RefObject<PerfilAdaptativoDeIdioma>;
  perfilMicRef: RefObject<PerfilAdaptativoDeIdioma>;
  avisoIdiomaMicRef: RefObject<boolean>;
  setIdiomaObservado: Dispatch<SetStateAction<string>>;
  /* --- detector de vazamento (a caixa de som entrando pelo microfone) --- */
  sysFalasRef: RefObject<Intervalo[]>;
  sysAbertasRef: RefObject<Map<number, number>>;
  micInicioRef: RefObject<Map<number, number>>;
  avisoVazamentoRef: RefObject<boolean>;
  /* --- tradução --- */
  translateSegment: (segId: string, text: string, srcCode?: string, tgtCode?: string, opts?: OpcoesDeTraducao) => void;
  retraduzirDegradados: () => void;
  /* --- painéis e avisos --- */
  setFeedbackMsg: (msg: string) => void;
  setModelPrep: Dispatch<SetStateAction<ModelPrepState | null>>;
  setSttRouteLabel: Dispatch<SetStateAction<string>>;
  /* --- contexto do STT de nuvem --- */
  /** Última final de cada fonte (o `prompt` do Whisper de nuvem). Opcional: sem ele, sem prompt. */
  contextoDoSttRef?: RefObject<ContextoDoStt>;
  /* --- regulador de desempenho (harness §4): um por tela, alimentado por final local --- */
  reguladorRef?: RefObject<ReguladorDaCaptura>;
  /** A captura do sistema/aba está aberta (aba escondida = "só ouvir", não pausa). */
  sistemaAtivo?: () => boolean;
}

export function criarPipelineDeFala(deps: DepsDoPipelineDeFala) {
  const {
    gateway,
    sourceLang,
    sourceLangRef,
    targetLangRef,
    autoDetectLangRef,
    autoDetectMyLangRef,
    idiomaObservadoRef,
    captureScenarioRef,
    perfModeRef,
    micEnabled,
    micEngine,
    timerRef,
    nowRel,
    setSpeechSegments,
    seqToSegmentRef,
    lastPartialTextRef,
    pendingUtterancesRef,
    suppressedSeqsRef,
    modelReadyRef,
    prepareEmVooRef,
    speakerProfilesRef,
    setSpeakerProfiles,
    speakerAutoIdRef,
    clustererRef,
    lastVoiceIdRef,
    provisionalUttsRef,
    ensureVoiceProfile,
    dominantLangRef,
    perfilIdiomaRef,
    perfilMicRef,
    avisoIdiomaMicRef,
    setIdiomaObservado,
    sysFalasRef,
    sysAbertasRef,
    micInicioRef,
    avisoVazamentoRef,
    translateSegment,
    retraduzirDegradados,
    setFeedbackMsg,
    setModelPrep,
    setSttRouteLabel,
    contextoDoSttRef,
    reguladorRef,
    sistemaAtivo,
  } = deps;

  /** Os efeitos das ações do regulador, com o gateway/setters deste render. */
  const efeitosDoRegulador: EfeitosDoRegulador = {
    trocarModelo: (modelo) => {
      clog('regulador: modelo local →', modelo);
      gateway.stt.trocarModeloLocal(modelo);
      setSttRouteLabel(`local · ${nomeLegivelDoModelo(modelo)} (ajustado ao aparelho)`);
      // Carrega já (do cache, se houver): a próxima fala não paga a carga inteira.
      void gateway.stt.preloadModel(undefined, { aoDegradar: avisarDegradacao }).catch((e: unknown) => {
        clog('regulador: carga do modelo menor falhou:', String(e));
      });
    },
    proibirModelo: (modelo, motivo) => {
      clog('regulador: modelo', modelo, 'proibido neste aparelho (', motivo, ')');
      void import('../dispositivo/sonda')
        .then((m) => m.proibirModelo(modelo, motivo))
        .catch(() => {
          /* sem armazenamento: o veto vale só nesta página (o worker já degradou) */
        });
    },
    oferecerNativoOuNuvem: () => {
      clog('regulador: fim da escada local, oferecendo nativo/nuvem');
      setFeedbackMsg(
        'O aparelho não está acompanhando a fala nem com o modelo menor. Para a legenda chegar a tempo, use o Chrome no computador ou autorize a transcrição em nuvem em Ajustes, Privacidade.',
      );
      setTimeout(() => setFeedbackMsg(''), 10000);
    },
  };

  // Handlers de captura por FONTE (sistema/mic). Um único pipeline VAD→Whisper serve as duas
  // fontes; muda a direção da tradução, o prefixo do id e o falante conforme a fonte.
  // Direção — SISTEMA: conteúdo estrangeiro no idioma-ALVO → transcreve com hint do ALVO e
  // traduz PARA o idioma-FONTE (você lê no seu idioma). MIC: sua voz no idioma-FONTE →
  // transcreve no FONTE e traduz PARA o ALVO (você lê como se diz). São inversas.
  // O `seq` do VAD começa em 1 em CADA fonte; deslocamos o do mic (+MIC_SEQ_OFFSET) para que
  // as chaves (seqToSegment/capMetrics) nunca colidam quando as duas fontes rodam juntas.
  const MIC_SEQ_OFFSET = 1_000_000;
  /** A reserva local desta captura (`reservaLocal.ts`): parciais locais ligados? Quem solta o ouvinte da falha? */
  const reservaLocal: { parciaisLocais: boolean; soltar: (() => void) | null } = { parciaisLocais: true, soltar: null };
  const makeCaptureHandlers = (source: CapSource) => {
    const isSys = source === 'system';
    const idPrefix = isSys ? 'sys' : 'mic';
    const offset = isSys ? 0 : MIC_SEQ_OFFSET;
    // MIC = você → orador ativo (se houver) ou 'user'. SISTEMA = 'system' (eles).
    const speakerIdFor = (): string =>
      isSys ? 'system' : (speakerProfilesRef.current.find((p) => p.isActive && p.id !== 'system')?.id ?? 'user');
    const langs = () => {
      // MULTI-IDIOMA: hint vazio → Whisper detecta o idioma da fala; origem vazia → o
      // Tradutor IA do servidor detecta e traduz para o alvo. Sistema traduz para o idioma
      // do usuário; mic traduz para o idioma de estudo (mesmo alvo do modo fixo).
      if (isSys && autoDetectLangRef.current) {
        /* A DICA DE IDIOMA PASSA A VIR DO PERFIL — e isto conserta um defeito com sintoma feio.
           Sem dica, o Whisper LOCAL (fallback, `whisper-base`) não recebe idioma fixo. O
           comentário no worker já avisava por quê: "idioma FIXO pula a auto-detecção e evita
           traduzir sozinho". Sem ele, o modelo pequeno TRADUZIA para inglês em vez de
           transcrever, num vídeo em espanhol o log alternava entre `groq-whisper` devolvendo
           "le pillamos desprevenido por detrás" e `whisper-local` devolvendo "Let's continue.
           Now we can do it". Texto inglês entrava no detector, o perfil via inglês, e o rótulo
           mentia.

           Também é latência de verdade: sem dica, o modelo gasta uma passada só para descobrir
           o idioma, a cada fala. Com o perfil convergido, essa passada some.

           As primeiras falas seguem sem dica (o perfil ainda ouve), é o único jeito de
           descobrir o idioma sem pedir ao usuário. A partir da convergência, fixa. */
        return { hint: idiomaObservadoRef.current || '', from: '', to: sourceLangRef.current.split('-')[0] };
      }
      if (!isSys && autoDetectMyLangRef.current) {
        // Sua fala vai para o IDIOMA DOMINANTE da conversa (o que os outros de fato falam,
        // detectado ao vivo) — num lobby misto não existe "o idioma deles" fixo. Sem falas
        // deles ainda, cai no idioma de estudo configurado.
        const convoLang = captureScenarioRef.current === 'conversation' ? dominantLangRef.current.dominant() : '';
        return { hint: '', from: '', to: convoLang || targetLangRef.current.split('-')[0] };
      }
      return isSys
        ? {
            hint: targetLangRef.current.split('-')[0],
            from: targetLangRef.current.split('-')[0],
            to: sourceLangRef.current.split('-')[0],
          }
        : {
            hint: sourceLangRef.current.split('-')[0],
            from: sourceLangRef.current.split('-')[0],
            to: targetLangRef.current.split('-')[0],
          };
    };

    /** "…" (tradução a caminho) ou '' quando a origem já conhecida é o próprio idioma da legenda. */
    const marcadorPrevisto = (origemDoMotor = ''): string => {
      const { from, to } = langs();
      return marcadorDeTraducao(origemDaFala(from || origemDoMotor, idiomaObservadoRef.current, !isSys), to);
    };

    // Início de fala (seq monotônico): cria o balão. Sem "ouvindo…" — o texto real flui no 1º parcial.
    const onSpeechStart = (rawSeq: number) => {
      const seq = rawSeq + offset;
      // ANTI-ECO: se o próprio app está falando (TTS de pronúncia/frase), o que a captura
      // "ouviu" é o NOSSO áudio voltando pelos alto-falantes — descarta o enunciado inteiro
      // (senão cada clique em palavra virava uma fala nova transcrita e traduzida).
      if (isTtsActive()) {
        suppressedSeqsRef.current.add(seq);
        clog('anti-eco: fala', seq, source, 'iniciada durante TTS, suprimida');
        return;
      }
      if (!modelReadyRef.current) return; // modelo ainda baixando → não cria balão vazio
      const uttId = `${idPrefix}-${seq}`;
      seqToSegmentRef.current.set(seq, uttId);
      capMetrics.start(seq, source);
      if (isSys) sysAbertasRef.current.set(seq, Date.now());
      else micInicioRef.current.set(seq, Date.now());
      setSpeechSegments((prev) =>
        prev.some((s) => s.id === uttId)
          ? prev
          : [
              ...prev,
              {
                id: uttId,
                speakerId: speakerIdFor(),
                source,
                timestamp: formatTime(timerRef.current),
                originalText: '',
                translatedText: marcadorPrevisto(),
                words: [],
                isPartial: true,
                tStartMs: nowRel(),
              },
            ],
      );
    };

    // Ruído curto (misfire): remove o balão provisório para não deixar bloco órfão.
    const onMisfire = (rawSeq: number) => {
      const seq = rawSeq + offset;
      suppressedSeqsRef.current.delete(seq); // anti-eco: não deixa entrada órfã no set
      const id = seqToSegmentRef.current.get(seq);
      seqToSegmentRef.current.delete(seq);
      lastPartialTextRef.current.delete(seq);
      capMetrics.drop(seq);
      if (id) setSpeechSegments((prev) => prev.filter((s) => s.id !== id));
    };

    // PARCIAL: transcreve o buffer-até-agora SÓ SE o Whisper estiver ocioso (idle-gating →
    // nunca enfileira → sem backlog). O texto aparece e refina em tempo real; a tradução acompanha.
    const onPartialAudio = (pcm: Float32Array, sr: number, rawSeq: number) => {
      if (perfModeRef.current) return; // modo desempenho: sem decodes parciais (só o final)
      if (!reservaLocal.parciaisLocais) return; // celular/Quest na nuvem: o local é só reserva
      // Regulador: o aparelho não acompanha (parciais cortados) ou a aba do mic está escondida.
      if (reguladorRef?.current.parciaisCortados) return;
      if (!isSys && reguladorRef?.current.parciaisDoMicPausados) return;
      const seq = rawSeq + offset;
      if (suppressedSeqsRef.current.has(seq)) return; // anti-eco: enunciado é o nosso TTS
      const uttId = seqToSegmentRef.current.get(seq);
      if (!uttId) return; // enunciado já finalizado/descartado
      // A fala já fechou e o final está a caminho: um parcial agora só atrasaria o final.
      if (lastPartialTextRef.current.get(seq) === FALA_FECHADA) return;
      const idiomas = langs();
      const { to } = idiomas;
      let { hint, from } = idiomas;
      /* ENQUANTO NÃO SABEMOS O IDIOMA, O PARCIAL ATRAPALHA MAIS DO QUE AJUDA.
         Parcial roda SEMPRE no Whisper local, e o Whisper local sem dica de idioma às vezes
         traduz para inglês em vez de transcrever. Resultado visível: num vídeo em espanhol, o
         balão piscava um texto em inglês antes de o final trazer o espanhol.

         Pior, ele cobra por isso: o decode do parcial ocupa o worker, e o final da fala seguinte
         espera, justo nas primeiras falas, que são as que fazem o perfil convergir. Pular o
         parcial aqui ACELERA a convergência e apaga o flash em inglês; assim que o perfil conclui,
         `hint` deixa de ser vazio e os parciais voltam pelo resto da sessão.

         Vale para as DUAS fontes: o mic em modo automático também mandava parcial sem dica e o
         balão de "você" piscava inglês antes do final em português.

         MAS NÃO PRECISA ESPERAR O PERFIL CONVERGIR (auditoria de latência 2026-09-26: ~9 falas,
         ~96 s sem nenhum parcial no "Detectar"). Desde que o worker mede o idioma pelo áudio, cada
         FINAL volta com o idioma da fala inteira (20/20 em pt e en na bancada). É a dica provisória
         dos parciais da fala SEGUINTE da mesma fonte; só a primeira fala de cada fonte fica sem
         parcial. Se a pessoa trocar de idioma, o parcial erra por uma fala e o final, que mede de
         novo, corrige. */
      if (!from && !hint) {
        const provisorio = contextoDoSttRef?.current.idiomaDe(source) ?? '';
        if (!provisorio) return;
        hint = provisorio;
        from = provisorio;
      }
      gateway.stt
        .transcribePartial(pcm, sr, { languageHint: hint })
        .then((res) => {
          if (!res) {
            capMetrics.saturated(seq);
            return;
          } // worker ocupado → parcial descartado
          if (!seqToSegmentRef.current.has(seq)) return; // já finalizou → o final é autoritativo
          /* A fala fechou enquanto este parcial decodificava: o final (que já está no worker, na
             frente) é quem escreve e quem traduz. Traduzir este texto agora só disputaria o tradutor
             com a tradução do final. */
          if (lastPartialTextRef.current.get(seq) === FALA_FECHADA) return;
          const clean = (res.text ?? '').trim();
          if (!clean) return;
          capMetrics.partial(seq);
          setSpeechSegments((prev) =>
            prev.map((s) => (s.id === uttId && s.isPartial ? { ...s, originalText: clean } : s)),
          );
          if (lastPartialTextRef.current.get(seq) !== clean) {
            lastPartialTextRef.current.set(seq, clean);
            // `descartarSeOcupado`: já há tradução em voo para este balão → não pede outra. Cada
            // refinamento do parcial custava uma chamada de MT que o refinamento seguinte jogava
            // fora; o final sempre traduz, então nenhuma legenda deixa de existir por causa disto.
            translateSegment(uttId, clean, from, to, { descartarSeOcupado: true, falada: !isSys });
          }
        })
        .catch(() => {
          capMetrics.saturated(seq);
        });
    };

    /**
     * FINAL ESPECULATIVO (~450 ms de silêncio, VAD ainda aberto): o decode do final começa já, sobre a
     * janela que o VAD vai entregar. Só no STT LOCAL — na nuvem cada pedido custa (mínimo de 10 s), e
     * uma respiração no meio da frase viraria uma cobrança. Sem streaming na tela: a pessoa pode ainda
     * estar falando; o texto aparece quando o VAD confirmar o fim.
     */
    const onFinalEspeculativo = (pcm: Float32Array, sr: number, rawSeq: number): FinalEspeculativo | null => {
      const seq = rawSeq + offset;
      if (!modelReadyRef.current || suppressedSeqsRef.current.has(seq)) return null;
      if (gateway.stt.finalNaNuvem()) return null;
      const { hint } = langs();
      const ctl = new AbortController();
      const promessa = gateway.stt.transcribePcm(pcm, sr, { languageHint: hint, signal: ctl.signal });
      promessa.catch(() => {
        /* cancelado (a fala continuou) ou falhou: quem usar a promessa trata */
      });
      return { promessa, cancelar: () => ctl.abort() };
    };

    // Fim da fala → decode FINAL (autoritativo) → commit do texto + tradução.
    const onUtterance = (pcm: Float32Array, sr: number, rawSeq: number, especulacao?: EspeculacaoDoFinal) => {
      // O decode especulativo feito sobre ESTE pcm (conferido pela captura) é o final.
      const especulativo = (especulacao as FinalEspeculativo | undefined)?.promessa;
      // anti-eco: o enunciado inteiro era o NOSSO TTS voltando — descarta e limpa.
      if (suppressedSeqsRef.current.has(rawSeq + offset)) {
        suppressedSeqsRef.current.delete(rawSeq + offset);
        clog('anti-eco: enunciado', rawSeq + offset, source, 'descartado (era o TTS do app)');
        return;
      }
      if (!modelReadyRef.current) {
        // NÃO descarta: guarda o enunciado e transcreve assim que o modelo ficar pronto.
        // Limite de ~24 trechos (~2 min de fala) para não crescer sem fim se a carga travar.
        if (pendingUtterancesRef.current.length < 24) {
          pendingUtterancesRef.current.push({ pcm: pcm.slice(), sr, rawSeq, source });
          clog(
            'modelo ainda carregando, trecho',
            rawSeq,
            source,
            'GUARDADO p/ transcrever depois (',
            pendingUtterancesRef.current.length,
            'na fila)',
          );
          if (pendingUtterancesRef.current.length === 1) {
            setFeedbackMsg(
              'O modelo ainda está carregando, sua fala está sendo GUARDADA e será transcrita assim que ele ficar pronto.',
            );
            setTimeout(() => setFeedbackMsg(''), 5000);
          }
        } else {
          clog('modelo ainda carregando, fila cheia, trecho', rawSeq, source, 'descartado');
        }
        return;
      }
      const seq = rawSeq + offset;
      const uttId = seqToSegmentRef.current.get(seq) ?? `${idPrefix}-${seq}`;
      capMetrics.speechEnd(seq);
      // Daqui até o resultado do final, nenhum parcial desta fala decodifica nem traduz.
      lastPartialTextRef.current.set(seq, FALA_FECHADA);
      clog('enunciado', source, '(seq', seq, ') →', pcm.length, 'amostras @', sr, 'Hz, decode final');
      setSpeechSegments((prev) =>
        prev.some((s) => s.id === uttId)
          ? prev
          : [
              ...prev,
              {
                id: uttId,
                speakerId: speakerIdFor(),
                source,
                timestamp: formatTime(timerRef.current),
                originalText: '',
                translatedText: marcadorPrevisto(),
                words: [],
                isPartial: true,
                tStartMs: nowRel(),
              },
            ],
      );

      // IDENTIFICAÇÃO DE VOZ (paralela ao decode; nunca atrasa a legenda): quem falou?
      // Só nas vozes do SISTEMA em Conversa — a sua voz já é "Você" por definição.
      if (isSys && captureScenarioRef.current === 'conversation' && speakerAutoIdRef.current) {
        void embedUtterance(pcm, sr).then((emb) => {
          if (!emb) {
            // Curto demais p/ identificar → herda a última voz (é quase sempre a mesma pessoa
            // terminando a frase). Sem voz anterior, fica no genérico "Outros".
            const inherit = lastVoiceIdRef.current;
            if (inherit)
              setSpeechSegments((prev) =>
                prev.map((s) => (s.id === uttId && s.speakerId === 'system' ? { ...s, speakerId: inherit } : s)),
              );
            return;
          }
          const { clusterId, isNew, provisional, promoted, uncertain, similarity, merged } =
            clustererRef.current.assign(emb);

          // VOZ PROVISÓRIA: ainda não é uma pessoa na tela. A fala fica com a voz anterior (ou no
          // genérico) e é GUARDADA sob este id; se uma segunda fala confirmar, ela é reetiquetada.
          // É o que impede um trecho ruidoso isolado de virar "Pessoa 5" para sempre.
          if (provisional) {
            clog('voz nova PROVISÓRIA', clusterId, '(sim', similarity.toFixed(2), '), aguarda confirmação');
            const pendentes = provisionalUttsRef.current.get(clusterId) ?? [];
            pendentes.push(uttId);
            provisionalUttsRef.current.set(clusterId, pendentes);
            const heranca = lastVoiceIdRef.current;
            if (heranca)
              setSpeechSegments((prev) =>
                prev.map((s) => (s.id === uttId && s.speakerId === 'system' ? { ...s, speakerId: heranca } : s)),
              );
            return;
          }

          const vid = ensureVoiceProfile(clusterId);
          lastVoiceIdRef.current = vid;
          if (isNew) clog('voz NOVA identificada → Pessoa', clusterId, '(sim', similarity.toFixed(2), ')');
          else if (uncertain)
            clog(
              'voz em DÚVIDA (sim',
              similarity.toFixed(2),
              ') → atribuída a Pessoa',
              clusterId,
              'sem alterar a referência',
            );
          if (promoted) clog('voz provisória CONFIRMADA → Pessoa', promoted);

          // Falas guardadas enquanto a voz era provisória agora passam a ser dela.
          const guardadas = promoted ? (provisionalUttsRef.current.get(promoted) ?? []) : [];
          if (promoted) provisionalUttsRef.current.delete(promoted);

          setSpeechSegments((prev) => {
            let next = prev.map((s) => (s.id === uttId || guardadas.includes(s.id) ? { ...s, speakerId: vid } : s));
            // FUSÃO: pessoas que se revelaram a mesma voz. Reetiqueta o que já está na tela —
            // é assim que os fantasmas do começo da conversa desaparecem sozinhos.
            for (const { from, into } of merged) {
              next = next.map((s) => (s.speakerId === `voice_${from}` ? { ...s, speakerId: `voice_${into}` } : s));
            }
            return next;
          });

          if (merged.length) {
            for (const { from, into } of merged) {
              clog('vozes fundidas: Pessoa', from, '→ Pessoa', into, '(eram a mesma pessoa)');
              if (lastVoiceIdRef.current === `voice_${from}`) lastVoiceIdRef.current = `voice_${into}`;
            }
            const mortos = new Set(merged.map((m) => `voice_${m.from}`));
            setSpeakerProfiles((prev) => prev.filter((p) => !mortos.has(p.id)));
            setFeedbackMsg(`Vozes parecidas foram unidas, agora são ${clustererRef.current.count} pessoa(s).`);
            setTimeout(() => setFeedbackMsg(''), 4000);
          }
        });
      }

      const { hint, from, to } = langs();
      const t0 = performance.now();
      const audioMs = Math.round((pcm.length / sr) * 1000);
      const queueDepth = gateway.stt.pendingCount();
      /* CONTEXTO para a nuvem: a última final DESTA fonte, se foi no idioma que estamos pedindo
         agora (sem dica = idioma desconhecido = sem prompt; ver `promptDeStt.ts`). */
      const prompt = contextoDoSttRef?.current.promptPara(source, hint);
      if (especulativo) clog('final', source, '(seq', seq, ') aproveita o decode especulativo');
      (
        especulativo ??
        gateway.stt.transcribePcm(pcm, sr, {
          languageHint: hint,
          prompt,
          // STREAMING: mostra os tokens do decode final crescendo no balão em tempo real.
          onUpdate: (streamed) => {
            const partial = (streamed ?? '').trim();
            if (!partial || !seqToSegmentRef.current.has(seq)) return;
            setSpeechSegments((prev) =>
              prev.map((s) => (s.id === uttId && s.isPartial ? { ...s, originalText: partial } : s)),
            );
          },
        })
      )
        /* PORTA DE QUALIDADE DO STT (harness §5, leve): o worker não devolve logprobs, então o sinal
           é a razão de compressão aproximada do TEXTO (laço de repetição). Final LOCAL que parece
           ruim sobe à nuvem SÓ ESTE trecho — para quem tem transcrição de nuvem no plano e consentiu
           (o gateway confere). Grátis fica com o local; 'silencio' (sem logprob, hoje não ocorre) sai. */
        .then(async (r): Promise<SttFinal> => {
          const texto = (r.text ?? '').trim();
          if (!texto || r.engine === 'groq-whisper') return r;
          const porta = avaliarTrechoStt({ compressionRatio: razaoDeCompressaoAproximada(texto) });
          if (porta.veredicto === 'silencio') return { ...r, text: '' };
          if (porta.veredicto !== 'subir' || !getEntitlements().managedCloudStt) return r;
          const nuvem = await gateway.stt
            .transcribePcmNaNuvem(pcm, sr, { languageHint: hint, prompt })
            .catch(() => null);
          if (!nuvem?.text?.trim()) return r;
          capMetrics.escalada('stt');
          clog('porta do STT: trecho', seq, 'subiu à nuvem (', porta.motivos.join(','), ')');
          return nuvem;
        })
        .then(({ text, engine, language, confiancaDoIdioma, alucinacaoDescartada }) => {
          const clean = (text ?? '').trim();
          if (!clean && alucinacaoDescartada) capMetrics.alucinacao();
          const decodeMs = Math.round(performance.now() - t0);
          clog(
            'Whisper final',
            source,
            '(seq',
            seq,
            ',',
            decodeMs,
            'ms,',
            engine ?? '?',
            ') →',
            clean ? JSON.stringify(clean).slice(0, 80) : '(vazio)',
          );
          seqToSegmentRef.current.delete(seq);
          lastPartialTextRef.current.delete(seq);
          /* REGULADOR: só o final LOCAL mede o aparelho (o da nuvem mede a rede). A latência é a
             do fim da fala ao texto — o decode mais a espera na fila, como no `capMetrics`. */
          if (reguladorRef && engine !== 'groq-whisper' && audioMs > 0) {
            reguladorRef.current.aoFinal(
              {
                rtf: decodeMs / audioMs,
                filaPendente: queueDepth,
                latenciaMs: decodeMs,
                modoSoOuvir: sistemaAtivo?.() ?? isSys,
              },
              efeitosDoRegulador,
            );
          }
          if (!clean) {
            /* Final vazio: o decode COMPLETO do trecho não achou fala. Antes, se um parcial já tinha
               mostrado texto, ele era COMMITADO "para evitar flicker", e era assim que uma frase
               inventada sobre ruído ficava na tela para sempre. O final é a leitura melhor; se ele
               diz vazio, o parcial era alucinação e sai. */
            capMetrics.final(seq, { decodeMs, queueDepth, text: '', audioMs, engine });
            clog('Whisper final vazio → parcial descartado (seq', seq, ')');
            setSpeechSegments((prev) => prev.filter((s) => s.id !== uttId));
            return;
          }
          /* O IDIOMA DEIXOU DE FICAR NA FRENTE DO TEXTO.
             Antes, `await detectLanguage(clean)` acontecia ANTES de commitar a legenda e de pedir
             a tradução: toda fala esperava a detecção, e a PRIMEIRA esperava também a criação do
             detector on-device do navegador. Agora o texto vai para a tela imediatamente.

             E há uma fonte melhor que o detector de texto: o `language` que o motor devolve. O
             Whisper de nuvem identifica o idioma dentro do decode, a partir do ÁUDIO, não do
             texto. Fala curta ("Vale, vamos") não dá sinal para palavras-função, e era exatamente
             onde a identificação falhava. Medido pelo áudio, dá. */
          const idiomaDoMotor = baseLang(language || '');
          // Janela desta fala, para o detector de vazamento (sistema fecha a sua; mic lê a sua).
          const agora = Date.now();
          if (isSys) {
            const ini = sysAbertasRef.current.get(seq) ?? agora - audioMs;
            sysAbertasRef.current.delete(seq);
            sysFalasRef.current.push({ inicioMs: ini, fimMs: agora });
            if (sysFalasRef.current.length > 40) sysFalasRef.current.splice(0, sysFalasRef.current.length - 40);
          }
          const micJanela: Intervalo = { inicioMs: micInicioRef.current.get(seq) ?? agora - audioMs, fimMs: agora };
          micInicioRef.current.delete(seq);
          capMetrics.final(seq, { decodeMs, queueDepth, text: clean, audioMs, engine });
          /* Vira o contexto do próximo trecho desta fonte. A fala do MIC no cenário conversa espera
             o veredicto de vazamento: se era a caixa de som entrando pelo microfone, não é a SUA
             fala e não pode virar o contexto dela. */
          const registrarContexto = () =>
            contextoDoSttRef?.current.registrar(source, clean, from || idiomaDoMotor || hint);
          if (isSys || captureScenarioRef.current !== 'conversation') registrarContexto();
          setSpeechSegments((prev) =>
            prev.map((s) =>
              s.id === uttId
                ? {
                    ...s,
                    originalText: clean,
                    translatedText: marcadorPrevisto(idiomaDoMotor),
                    words: wordsFromText(clean, from || idiomaDoMotor || sourceLang),
                    isPartial: false,
                    tEndMs: nowRel(),
                    lang: from || idiomaDoMotor || undefined,
                    engine,
                  }
                : s,
            ),
          );

          /** Alimenta o perfil da sessão e devolve o idioma desta fala ('' = não descobrimos). */
          const observarIdioma = async (): Promise<string> => {
            // Idioma medido pelo motor dispensa o detector de texto — é medição, não palpite.
            let detectado = idiomaDoMotor;
            if (!detectado) {
              try {
                detectado = baseLang((await detectLanguage(clean))?.lang || '');
              } catch {
                /* '' = desconhecido */
              }
            }
            if (!isSys || !detectado) return detectado;
            // Alimenta o "idioma dominante da conversa" (destino da SUA fala no multi-idioma).
            dominantLangRef.current.push(detectado);
            // E o PERFIL ADAPTATIVO, que é quem transforma detecções soltas em conclusão: ele
            // resiste ao tropeço isolado (histerese) e é lido pela interface e pela tradução.
            const antes = perfilIdiomaRef.current.observado();
            /* QUANTO ESTA DETECÇÃO PESA (`pesoDaDeteccao`): o Whisper local agora mede o idioma
               pelo áudio no "Detectar", mas em trecho curto ou com pouca confiança ele erra; aí a
               fala entra como evidência fraca e não decide o perfil sozinha. Texto do whisper-local
               sem dica e sem idioma medido segue suspeito, como antes. Quando o perfil converge, a
               dica fica travada no idioma observado (histerese) e a detecção por trecho some. */
            const peso = pesoDaDeteccao({ idiomaDoMotor, confiancaDoIdioma, audioMs, engine, hint });
            perfilIdiomaRef.current.observar(detectado, peso);
            const leitura = perfilIdiomaRef.current.ler();
            /* O ESTADO DO PERFIL VAI PARA O LOG SEMPRE, não só quando muda o destino da tradução.
               Antes ele só aparecia no caso "redirecionado", num vídeo em espanhol com usuário em
               português não há redirecionamento, então o perfil trabalhava em silêncio absoluto. */
            if (leitura.idioma !== antes) {
              clog(
                'perfil de idioma:',
                antes || '(ouvindo)',
                '→',
                leitura.idioma,
                `(${Math.round(leitura.confianca * 100)}% de ${leitura.amostras} falas)`,
              );
            }
            if (leitura.estado === 'convergido' && leitura.idioma !== idiomaObservadoRef.current) {
              setIdiomaObservado(leitura.idioma);
            }
            return detectado;
          };

          /** SUA VOZ no cenário conversa: é vazamento da caixa de som? E você fala mesmo o idioma configurado? */
          const avaliarFalaDoMic = async (): Promise<boolean> => {
            let det = idiomaDoMotor;
            if (!det) {
              try {
                det = baseLang((await detectLanguage(clean))?.lang || '');
              } catch {
                /* '' */
              }
            }
            const idiomaDoSistema = idiomaObservadoRef.current || baseLang(targetLangRef.current);
            const abertas = [...sysAbertasRef.current.values()].map((ini) => ({ inicioMs: ini, fimMs: Date.now() }));
            const { veredicto, fracao } = classificarVazamento({
              idiomaDetectado: det || null,
              idiomaDoMic: from || baseLang(sourceLangRef.current),
              idiomaDoSistema,
              mic: micJanela,
              falasDoSistema: [...sysFalasRef.current, ...abertas],
            });
            if (veredicto === 'vazamento') {
              clog(
                'vazamento: fala do mic soa como',
                det,
                'com',
                Math.round(fracao * 100) + '% sobre o sistema → descartada (seq',
                seq,
                ')',
              );
              capMetrics.drop(seq);
              setSpeechSegments((prev) => prev.filter((s) => s.id !== uttId));
              if (!avisoVazamentoRef.current) {
                avisoVazamentoRef.current = true;
                setFeedbackMsg(
                  'O microfone está captando o áudio da chamada. Use fone de ouvido para a sua fala sair limpa.',
                );
                setTimeout(() => setFeedbackMsg(''), 9000);
              }
              return false;
            }
            if (det) {
              perfilMicRef.current.observar(det, 1);
              const leitura = perfilMicRef.current.ler();
              const configurado = baseLang(sourceLangRef.current);
              if (leitura.estado === 'convergido' && leitura.idioma !== configurado && !avisoIdiomaMicRef.current) {
                avisoIdiomaMicRef.current = true;
                clog('perfil do mic convergiu em', leitura.idioma, 'mas "eu falo" está', configurado);
                setFeedbackMsg(
                  `Você parece falar ${langLabel(leitura.idioma)}, mas "Eu falo" está em ${langLabel(configurado)}. Ajuste no seletor de idiomas para a transcrição melhorar.`,
                );
                setTimeout(() => setFeedbackMsg(''), 9000);
              }
            }
            return true;
          };

          if (from) {
            // Idioma FIXO: não há o que observar nem por que esperar.
            if (!isSys && captureScenarioRef.current === 'conversation') {
              void avaliarFalaDoMic().then((ok) => {
                if (!ok) return;
                registrarContexto();
                translateSegment(uttId, clean, from, to, { falada: true });
              });
              return;
            }
            translateSegment(uttId, clean, from, to, { falada: !isSys });
            return;
          }
          /* SUA fala no "Detectar" também vira contexto: é o idioma MEDIDO desta fala que os parciais da
             sua próxima fala usam como dica provisória (ver `onPartialAudio`). */
          if (!isSys && captureScenarioRef.current === 'conversation') registrarContexto();
          /* A detecção só volta a SEGURAR a tradução no caso frio em que ela é a única fonte de
             origem, nem o motor informou, nem o perfil convergiu. Sem origem, três dos quatro
             tradutores se recusam a atuar (`supports()` exige o par), e sobra só o LLM do
             servidor: esperar alguns milissegundos ali compra a cascata inteira. Fora desse caso,
             a tradução parte na hora e a observação corre por fora. */
          const origemConhecida = idiomaDoMotor || idiomaObservadoRef.current;
          if (origemConhecida) {
            translateSegment(uttId, clean, origemConhecida, to, { falada: !isSys });
            void observarIdioma().then((d) => {
              if (d && d !== idiomaDoMotor) {
                setSpeechSegments((prev) => prev.map((s) => (s.id === uttId ? { ...s, lang: d } : s)));
              }
            });
            return;
          }
          void observarIdioma().then((d) => {
            if (d) setSpeechSegments((prev) => prev.map((s) => (s.id === uttId ? { ...s, lang: d } : s)));
            translateSegment(uttId, clean, d, to, { falada: !isSys });
          });
        })
        .catch((err) => {
          clog('Whisper final', source, '(seq', seq, ') ERRO:', String(err));
          seqToSegmentRef.current.delete(seq);
          lastPartialTextRef.current.delete(seq);
          capMetrics.final(seq, { queueDepth });
          setSpeechSegments((prev) =>
            prev.map((s) =>
              s.id === uttId
                ? {
                    ...s,
                    originalText: s.originalText || '(falha na transcrição)',
                    translatedText: s.originalText ? s.translatedText : `(${String(err).slice(0, 80)})`,
                    isPartial: false,
                  }
                : s,
            ),
          );
        });
    };

    return { onSpeechStart, onMisfire, onPartialAudio, onUtterance, onFinalEspeculativo };
  };

  const sysHandlers = makeCaptureHandlers('system');
  const micHandlers = makeCaptureHandlers('mic');

  const flushPendingUtterances = () => {
    const pending = pendingUtterancesRef.current;
    if (!pending.length) return;
    pendingUtterancesRef.current = [];
    clog('modelo pronto, transcrevendo', pending.length, 'trecho(s) guardado(s) durante a carga');
    for (const u of pending) {
      (u.source === 'system' ? sysHandlers : micHandlers).onUtterance(u.pcm, u.sr, u.rawSeq);
    }
  };

  // Prepara os modelos locais (Whisper + opus-mt) com barras honestas, detecção de cache e retry.
  // Nuvem: NÃO baixa modelo nenhum (a transcrição/tradução vai pela chave do usuário).
  const prepareModels = async () => {
    if (getProviderMode() === 'cloud') {
      modelReadyRef.current = true;
      setModelPrep(null);
      return;
    }
    // A-P3-14: na captura dupla (mic + sistema) esta função era chamada DUAS vezes sem guard —
    // as duas resetavam `modelPrep` e sobrescreviam o `onProgress` do adapter, e a barra zerava
    // no meio. O guard é liberado no fim (sucesso ou erro) para o retry continuar possível.
    if (prepareEmVooRef.current) {
      clog('preparação já em andamento, ignorando chamada duplicada');
      return;
    }
    prepareEmVooRef.current = true;
    try {
      await prepareModelsInterno();
    } finally {
      prepareEmVooRef.current = false;
    }
  };

  /**
   * O STT local trocou de motor sozinho (a GPU não serviu): a legenda segue, e a pessoa fica sabendo
   * por quê — e o selo passa a dizer o modelo que está de fato rodando.
   */
  const avisarDegradacao = (aviso: AvisoDeDegradacaoDoStt) => {
    clog('STT local degradou:', aviso.motivo, aviso.modeloAntes, '→', aviso.modelo, 'em', aviso.device, aviso.detalhe);
    /* A GPU caiu EM USO (device lost / falta de memória): o modelo de antes vira proibido neste
       aparelho (no próximo trecho medido, pelo regulador) e a escada recomeça do modelo que ficou. */
    const regulador = reguladorRef?.current;
    if (regulador) {
      regulador.reiniciar({ modelo: aviso.modelo }); // `soIngles` fica o da rota
      if (aviso.motivo === 'falha-gpu') regulador.registrarFalha('device-lost', aviso.modeloAntes);
    }
    setSttRouteLabel(`local · modo compatível (${aviso.modelo.split('-').pop()})`);
    setFeedbackMsg(
      t(
        'A placa de vídeo não pôde ser usada na transcrição. Seguindo no modo compatível ({modelo}): a legenda continua, um pouco mais lenta.',
        {
          modelo: nomeLegivelDoModelo(aviso.modelo),
        },
      ),
    );
    setTimeout(() => setFeedbackMsg(''), 9000);
  };

  /** A rota de STT desta captura (a mesma conta para preparar e para pré-aquecer). */
  const rotaDaCaptura = async () => {
    const listenLang = targetLangRef.current.split('-')[0]; // você OUVE o idioma-alvo
    const myLang = sourceLangRef.current.split('-')[0];

    // ROTEADOR DE MODELO STT: escolhe o motor pela QUALIDADE exigida pelo idioma do
    // conteúdo (inglês → moonshine, que é SÓ inglês; fora dele, Whisper) — nuvem-primeiro quando disponível, senão o
    // melhor modelo local viável no dispositivo. O selo da UI reflete a rota.
    // Pelo funil: sem conta responde 501 → `cloudAvailable=false` → rota local, que é o correto.
    const perfil = await medirPerfilDoDispositivo();
    /* SONDA DO APARELHO (harness adaptativo §2): a rota leva a sonda GUARDADA, se houver (não espera
       medir), e a medida completa + microbenchmark ficam agendadas para o ocioso. Por `import()`:
       a sonda e o benchmark não entram no JS inicial, e nada disso roda na abertura do site. */
    let modSonda: typeof import('../dispositivo/sonda') | null = null;
    const sonda = await import('../dispositivo/sonda')
      .then((m) => {
        modSonda = m;
        void m.agendarSondaDoAparelho();
        return m.sondaGuardada();
      })
      .catch((erro: unknown) => {
        console.warn('[captura] sonda do aparelho indisponível; rota sem ela', erro);
        return null;
      });
    const cloudAvailable = await apiFetch('/api/ai/stt/available')
      .then((r) => r.ok)
      .catch(() => false);
    /* O MIC VAI AO WHISPER? Não é mais só a escolha do seletor: sem consentimento (ou no perfil
       Privado) e sem reconhecimento no aparelho, o "navegador" cai no Whisper (`motorDoMicrofone.ts`).
       A sonda guardada responde pelo "no aparelho"; sem ela, conta como indisponível — errar para o
       lado do Whisper só troca o Moonshine pelo Whisper, errar para o outro daria inglês à sua voz. */
    const micVaiAoWhisper =
      micEnabled &&
      escolherMotorDoMic({
        preferido: micEngine,
        webSpeechSuportado:
          typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window),
        noAparelho: disponibilidadeDaSondaParaIdioma(sourceLangRef.current, sonda?.sinais?.sttNoAparelho),
        consentiuNuvem: consentiuNuvem(),
        perfilId: getActiveProfile().id,
      }).motor === 'whisper';
    const autoDetect = autoDetectLangRef.current || autoDetectMyLangRef.current;
    /** O modelo local só decodifica inglês: a escada do regulador pode descer ao Moonshine. */
    const soIngles = listenLang === 'en' && !autoDetect && (!micVaiAoWhisper || myLang === 'en');
    let route = routeStt({
      contentLang: listenLang,
      // O mesmo modelo decodifica o MIC: se você fala PT enquanto ouve EN, o moonshine (só inglês) não serve.
      micLang: micVaiAoWhisper ? myLang : '',
      autoDetect,
      quality: getSttQuality(),
      /* O ADAPTADOR, não a API: `navigator.gpu` existe no headless sem GPU nenhuma, e o small no
         WebGPU sem adaptador era captura sem legenda (auditoria de latência 2026-09-26). */
      hasWebGpu: await temAdaptadorWebGpu(),
      cloudAvailable,
      profileId: getActiveProfile().id,
      // O APARELHO (Quest/celular: base q8 em WASM; small só no desktop com GPU).
      dispositivo: dispositivoDaRota(perfil, sonda),
    });
    /* MODELO PROIBIDO NESTE APARELHO (a GPU caiu com ele — `proibirModelo`, pelo regulador): a rota
       desce a escada até um que não foi vetado. Sem nenhum livre, fica o menor. */
    const sondaMod = modSonda as typeof import('../dispositivo/sonda') | null;
    if (sondaMod) {
      let modelo = route.localModel;
      for (const menor of escadaDeModelos(route.localModel, soIngles)) {
        if (!(await sondaMod.modeloProibido(modelo).catch(() => false))) break;
        modelo = menor;
      }
      if (modelo !== route.localModel) {
        clog('rota: modelo', route.localModel, 'proibido neste aparelho →', modelo);
        route = { ...route, localModel: modelo, label: `${route.label} · ${nomeLegivelDoModelo(modelo)}` };
      }
    }
    /* O SENTIDO DO TRADUTOR QUE A PREPARAÇÃO CARREGA. Mídia/conversa: o que você ouve → o seu idioma.
       SÓ MICROFONE (o cenário dos aparelhos sem áudio do sistema — Quest, celular): a SUA fala →
       "Traduzir para". Medido no Quest emulado (2026-09-26): carregava o en→pt (sem uso), e o pt→en
       só chegava 45 s depois, na primeira tradução — ~113 MB a mais na rede e na memória. */
    const [mtDe, mtPara] = captureScenarioRef.current === 'mic' ? [myLang, listenLang] : [listenLang, myLang];
    return { listenLang, myLang, route, perfil, mtDe, mtPara, soIngles };
  };

  /**
   * PRÉ-AQUECER AO ABRIR A TELA (auditoria de latência 2026-09-26, item 6). "STT pronto" levava de
   * 3,4 s (Moonshine) a 5,7–13,1 s (small no WebGPU) depois do clique em "Iniciar captura", mesmo com
   * o modelo em cache — e as falas desse intervalo esperavam. Aqui a carga começa quando a tela abre
   * (ou os idiomas mudam), e o `ensurePipeline` do worker já faz o decode curto de aquecimento.
   *
   * Só o que JÁ ESTÁ NO NAVEGADOR: baixar é decisão da pessoa, tomada no "Iniciar". Rota de nuvem
   * também não aquece nada (o modelo local ali é só reserva). Nunca lança.
   */
  const preaquecerModelos = async (): Promise<void> => {
    try {
      if (getProviderMode() === 'cloud' || prepareEmVooRef.current || modelReadyRef.current) return;
      const { listenLang, myLang, route, perfil } = await rotaDaCaptura();
      if (route.preferCloud) return;
      let sttAquecendo: Promise<unknown> = Promise.resolve();
      if (await areModelsCached([route.localModel])) {
        gateway.stt.setRoute({
          preferCloud: false,
          localModel: route.localModel,
          dtype: route.dtype,
          device: route.device,
        });
        setSttRouteLabel(route.label);
        clog('pré-aquecendo o STT local (em cache):', route.localModel, route.dtype);
        sttAquecendo = gateway.stt
          .preloadModel(undefined, { aoDegradar: avisarDegradacao })
          .then(() => clog('STT local pré-aquecido ✓'))
          .catch((e) => clog('pré-aquecimento do STT falhou (a captura tenta de novo):', String(e)));
      }
      // POUCA MEMÓRIA (Quest/celular): um modelo grande de cada vez — o tradutor espera o STT.
      if (perfil.poucaMemoria) await sttAquecendo;
      // Os dois sentidos do tradutor (o que você ouve e o que você fala), cada um só se já baixado.
      for (const [de, para] of [
        [listenLang, myLang],
        [myLang, listenLang],
      ] as const) {
        const mt = expectedModelIds(de, para, route.localModel).slice(1);
        if (mt.length && (await areModelsCached(mt))) gateway.mt.warmup([[de, para]]);
      }
    } catch (e) {
      clog('pré-aquecimento ignorado:', String(e));
    }
  };

  const prepareModelsInterno = async () => {
    const { route, perfil, mtDe, mtPara, soIngles } = await rotaDaCaptura();
    // Sessão nova: o regulador começa no máximo, com a escada do modelo desta rota.
    reguladorRef?.current.reiniciar({ modelo: route.localModel, soIngles });
    gateway.stt.setRoute({
      preferCloud: route.preferCloud,
      localModel: route.localModel,
      dtype: route.dtype,
      device: route.device,
    });
    setSttRouteLabel(route.label);
    clog(
      'roteador STT:',
      route.label,
      '| modelo local:',
      route.localModel,
      route.dtype,
      '| nuvem primeiro:',
      route.preferCloud,
      '| aparelho:',
      perfil.tipo,
    );
    /** POUCA MEMÓRIA (Quest/celular): STT e tradutor carregam UM DE CADA VEZ, nunca juntos. */
    const umDeCadaVez = perfil.poucaMemoria;

    const cached = await areModelsCached(expectedModelIds(mtDe, mtPara, route.localModel));

    /* RESERVA PREGUIÇOSA no celular e no Quest com nuvem primeiro (`reservaLocal.ts`, auditoria de
       eficiência 2026-09-28, achado 4): nada baixa agora, a primeira falha da nuvem dispara a carga,
       e o parcial local não roda. Uma nova preparação (troca de idioma/rota) solta o ouvinte antigo. */
    const plano = planoDaReservaLocal({ preferCloud: route.preferCloud, tipo: perfil.tipo });
    reservaLocal.soltar?.();
    reservaLocal.soltar = null;
    reservaLocal.parciaisLocais = plano.parciaisLocais;

    // NUVEM-PRIMEIRO: o motor principal é o Groq — a captura NÃO espera o download do
    // modelo local (que é só a RESERVA). Libera o pipeline já e baixa a reserva em
    // background; se a nuvem falhar num trecho, o adapter local aguarda o próprio load.
    if (route.preferCloud) {
      modelReadyRef.current = true;
      flushPendingUtterances();
      const carregarReserva = () => {
        setModelPrep({ whisper: 0, mt: null, fromCache: cached, error: null, done: false });
        const tradutorDaReserva = () =>
          gateway.mt.preload(mtDe, mtPara, (p, _l, bytes) =>
            setModelPrep((s) => (s ? { ...s, mt: p >= 1 ? 1 : p, mtBytes: bytes ?? s.mtBytes } : s)),
          );
        if (!umDeCadaVez) tradutorDaReserva();
        gateway.stt
          .preloadModel(
            (p, _l, bytes) =>
              setModelPrep((s) => (s ? { ...s, whisper: p >= 1 ? 1 : p, whisperBytes: bytes ?? s.whisperBytes } : s)),
            { aoDegradar: avisarDegradacao },
          )
          .finally(() => {
            if (umDeCadaVez) tradutorDaReserva();
          })
          .then(() => {
            clog('reserva local pronta ✓ (nuvem segue como principal)');
            setModelPrep((s) => (s ? { ...s, whisper: 1, done: true } : s));
            setTimeout(() => setModelPrep((s) => (s?.done ? null : s)), 1800);
          })
          .catch((e) => {
            // A-P1-5: aqui só havia um clog(). Com a nuvem como principal, a falha do modelo local
            // é degradação — não é fatal — mas ficava INVISÍVEL: medido, 150 s com a rede caída e
            // o painel ainda dizendo "Baixando modelo", sem erro algum e sem botão de retry.
            // Agora o estado de erro do ModelPrepPanel é alcançável nesta rota também.
            clog('reserva local falhou (nuvem segue como principal):', String(e));
            const msg = String((e as Error)?.message ?? e);
            setModelPrep((s) => (s ? { ...s, error: msg } : s));
          });
      };
      if (plano.carregarAgora) {
        carregarReserva();
        return;
      }
      clog('reserva local preguiçosa: só carrega na primeira falha da nuvem | aparelho:', perfil.tipo);
      setModelPrep(null);
      const soltar = aoFalharANuvemDoStt(() => {
        soltar();
        if (reservaLocal.soltar === soltar) reservaLocal.soltar = null;
        clog('nuvem do STT falhou → carregando a reserva local');
        carregarReserva();
      });
      reservaLocal.soltar = soltar;
      return;
    }

    modelReadyRef.current = false;
    setModelPrep({ whisper: 0, mt: null, fromCache: cached, error: null, done: false });
    try {
      // Tradutor local (best-effort; direção "ouço → meu idioma"). Emite barra própria.
      const iniciarTradutor = () =>
        gateway.mt.preload(mtDe, mtPara, (p, _l, bytes) => {
          setModelPrep((s) => (s ? { ...s, mt: p >= 1 ? 1 : p, mtBytes: bytes ?? s.mtBytes } : s));
          if (p >= 1) {
            /* O tradutor local (113 MB) fica pronto DEPOIS do Whisper. Tudo que foi falado nesse
               intervalo já tinha degradado para "(texto original)" e ficava assim para sempre,
               medido no teste do dono (2026-08-26): legenda certa, tradução nenhuma. Retraduz. */
            retraduzirDegradados();
            setTimeout(() => setModelPrep((s) => (s?.done ? null : s)), 1800);
          }
        });
      // Aparelho com pouca memória: o tradutor só começa DEPOIS do Whisper pronto (pico menor).
      if (!umDeCadaVez) iniciarTradutor();
      // Whisper (obrigatório para transcrever o áudio do sistema/aba).
      await gateway.stt.preloadModel(
        (p, _l, bytes) =>
          setModelPrep((s) => (s ? { ...s, whisper: p >= 1 ? 1 : p, whisperBytes: bytes ?? s.whisperBytes } : s)),
        { aoDegradar: avisarDegradacao },
      );
      if (umDeCadaVez) iniciarTradutor();
      clog('modelos locais prontos ✓');
      modelReadyRef.current = true;
      flushPendingUtterances();
      setModelPrep((s) => (s ? { ...s, whisper: 1, done: true } : s));
      // O painel só some quando o tradutor também acabou (ou não existe para este par).
      setTimeout(() => setModelPrep((s) => (s?.done && (s.mt == null || s.mt >= 1) ? null : s)), 1800);
    } catch (e) {
      clog('preparação do modelo FALHOU:', String(e));
      const msg = String((e as Error)?.message ?? e);
      setModelPrep((s) =>
        s ? { ...s, error: msg } : { whisper: null, mt: null, fromCache: cached, error: msg, done: false },
      );
    }
  };

  return { sysHandlers, micHandlers, prepareModels, preaquecerModelos };
}
