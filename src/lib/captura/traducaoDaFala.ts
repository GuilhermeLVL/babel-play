/**
 * O RELÓGIO DA SESSÃO e o PIPELINE DE TRADUÇÃO da captura ao vivo.
 *
 * Saiu de `views/LiveCapture.tsx` sem mudar uma linha de comportamento: as duas fábricas são
 * chamadas a cada render, exatamente como as closures que substituem, e tudo que dependia do
 * estado da tela (refs, setters, gateway) entra por PARÂMETRO explícito — nada de contexto novo.
 */
import type { Dispatch, RefObject, SetStateAction } from 'react';

import { capMetrics } from '../../gateway/capture/captureMetrics';
import { getEntitlements } from '../entitlements';
import { baseLang,langLabel } from '../languages';
import { OrdemDasTraducoes } from '../ordemDaTraducao';
import { destinoDaTraducao,PerfilAdaptativoDeIdioma } from '../perfilDeIdioma';
// Fala do MIC em português → português claro antes de traduzir (vícios, contrações, gíria).
import { chaveNormalizada,prepararFala } from '../traducao/prepararFala';
import { clog, type GatewayDaCaptura, type SpeechSegment } from './tiposDaFala';

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

/** Opções de uma tradução de balão (as mesmas de antes). */
export interface OpcoesDeTraducao {
  descartarSeOcupado?: boolean;
  falada?: boolean;
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
  /** Avisos ÚNICOS por sessão (degradação da MT, redirecionamento do destino, queda da nuvem). */
  mtFailNotifiedRef: RefObject<boolean>;
  altTargetNotifiedRef: RefObject<boolean>;
  degradacaoAvisadaRef: RefObject<boolean>;
  setSpeechSegments: Dispatch<SetStateAction<SpeechSegment[]>>;
  setFeedbackMsg: (msg: string) => void;
}

/**
 * Tradução DESACOPLADA, deduplicada e com cache — nunca bloqueia a exibição do texto.
 * Compartilhada pelas DUAS fontes (mic Web Speech + sistema Whisper). Espelha o LRU do desktop.
 * Aviso único por sessão quando a tradução degrada (nunca silencioso).
 */
export function criarTraducaoDaFala(deps: DepsDaTraducaoDaFala) {
  const {
    gateway, ordemMtRef, sourceLangRef, targetLangRef, idiomaObservadoRef, perfilIdiomaRef,
    speechSegmentsRef, translationCacheRef, mtFailNotifiedRef, altTargetNotifiedRef,
    degradacaoAvisadaRef, setSpeechSegments, setFeedbackMsg,
  } = deps;

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

  const translateSegment = (
    segId: string,
    text: string,
    srcCode?: string,
    tgtCode?: string,
    opts?: OpcoesDeTraducao,
  ) => {
    /* PARCIAL NÃO ENFILEIRA TRADUÇÃO. Cada refinamento do parcial gastava uma chamada de MT
       inteira que era descartada segundos depois pelo refinamento seguinte. Com uma tradução já
       em voo para este balão, o parcial seguinte simplesmente não é pedido, o decode final
       sempre traduz, então nenhum balão fica sem legenda por causa disto. */
    if (opts?.descartarSeOcupado && ordemMtRef.current.ocupado(segId)) return;
    const selo = ordemMtRef.current.abrir(segId);

    const src = srcCode ?? sourceLangRef.current.split('-')[0];
    let tgt = tgtCode ?? targetLangRef.current.split('-')[0];

    /**
     * NUNCA TRADUZIR PARA O PRÓPRIO IDIOMA (bug relatado). O áudio do sistema é sempre vertido
     * para "o seu idioma" — mas quem assiste um vídeo EM português tendo o português como idioma
     * nativo recebia origem = destino, e a "tradução" saía idêntica ao original: a tela parecia
     * quebrada, e o caso é justamente o de quem consome conteúdo na própria língua para praticar
     * a outra ("assisto em PT e quero ver em inglês").
     *
     * Regra: se origem e destino coincidem, o destino passa a ser o OUTRO idioma do par. Se os
     * dois lados do par forem o mesmo idioma, não há para onde traduzir — o balão fica só com o
     * original (honesto), em vez de repetir a frase como se fosse tradução.
     */
    const mine = baseLang(sourceLangRef.current);
    const studying = baseLang(targetLangRef.current);

    /* A DECISÃO VEM DO PERFIL, não de uma dedução refeita a cada fala.
       O idioma OBSERVADO na sessão (já convergido, resistente a detecção isolada errada) tem
       precedência sobre o desta fala: numa conversa em português, um "Thank you." solto não
       deve mudar o destino da tradução do trecho inteiro. Sem observação ainda, cai no idioma
       desta fala, que é o melhor palpite disponível no começo. */
    const observado = idiomaObservadoRef.current || baseLang(src);
    const decisao = destinoDaTraducao(observado, mine, studying);

    if (decisao.motivo === 'sem-destino') {
      // Os dois lados do par são a mesma língua: não há para onde traduzir. Limpa o "…" para o
      // balão não ficar preso esperando para sempre — e não repete a frase fingindo tradução.
      if (ordemMtRef.current.encerrar(segId, selo)) {
        setSpeechSegments(prev => prev.map(seg => seg.id === segId ? { ...seg, translatedText: '' } : seg));
      }
      return;
    }
    if (decisao.motivo === 'redirecionado' && decisao.destino !== baseLang(tgt)) {
      tgt = decisao.destino;
      /* AVISO ÚNICO, e agora ele é honesto sobre a NATUREZA da decisão: antes dizia "o áudio já
         está em X" a partir de UMA fala, e repetia a dedução 40 vezes no log. Agora só fala
         quando o perfil convergiu, e diz que foi detecção da sessão inteira. */
      if (!altTargetNotifiedRef.current && perfilIdiomaRef.current.observado()) {
        altTargetNotifiedRef.current = true;
        const conf = Math.round(perfilIdiomaRef.current.ler().confianca * 100);
        clog('perfil de idioma convergiu:', observado, `(${conf}% das falas)`, '→ traduzindo para', decisao.destino);
        setFeedbackMsg(
          `Detectei que o áudio está em ${langLabel(observado)} (${conf}% das falas), traduzindo para ${langLabel(decisao.destino)}.`,
        );
        setTimeout(() => setFeedbackMsg(''), 7000);
      }
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
    if (preparada.mudou) clog('fala preparada:', JSON.stringify(text).slice(0, 60), '→', JSON.stringify(preparada.traducaoPronta ?? textoParaMt).slice(0, 60));
    // Chave tolerante a caixa/pontuação final: "Tá bom." e "tá bom" eram duas entradas.
    const cacheKey = `${origem}|${tgt}|${chaveNormalizada(textoParaMt)}`;
    const applyTranslation = (translated: string, aproximada = false) => {
      // "≈" na frente: o último recurso público (MyMemory) acerta frases comuns e erra gíria e
      // contexto. Dizer que é aproximada é o que separa "tradução ruim" de "app mentindo".
      const capitalized = (aproximada ? '≈ ' : '') + translated.charAt(0).toUpperCase() + translated.slice(1);
      // As palavras de vocabulário já foram extraídas da fala real no commit do
      // enunciado (wordsFromText); a tradução só atualiza o texto traduzido.
      setSpeechSegments(prev => prev.map(seg => seg.id === segId ? {
        ...seg,
        translatedText: capitalized,
      } : seg));
    };
    // Expressão inteira conhecida ("valeu!", "pois é."): a tradução natural já está pronta.
    if (preparada.traducaoPronta) {
      if (ordemMtRef.current.encerrar(segId, selo)) applyTranslation(preparada.traducaoPronta);
      return;
    }
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      if (ordemMtRef.current.encerrar(segId, selo)) applyTranslation(cached);
      return;
    }
    const mtT0 = performance.now();
    // Contexto para o LLM (só na fala): as últimas 3 falas comprometidas da conversa.
    const contexto = opts?.falada
      ? speechSegmentsRef.current.filter(s => !s.isPartial && s.originalText && s.id !== segId).slice(-3).map(s => `${s.source === 'mic' ? 'Eu' : 'Outro'}: ${s.originalText}`)
      : undefined;

    // Rede de segurança: a tradução NUNCA pode deixar o balão preso em "…". Se vier vazia, der
    // erro, OU travar (timeout) — degrada para o texto ORIGINAL entre parênteses (honesto e útil
    // offline: você ao menos lê o que foi dito). Só degrada se ainda estiver em "…" (não sobrescreve
    // uma tradução já mostrada). `settled` evita corrida entre resposta tardia e o timeout.
    let settled = false;
    const degrade = () => {
      setSpeechSegments(prev => prev.map(seg =>
        (seg.id === segId && seg.translatedText === '…') ? { ...seg, translatedText: `(${text})` } : seg));
      // Degradação NUNCA mais é silenciosa (achado da auditoria): avisa UMA vez por sessão
      // que a tradução caiu e o que o usuário está vendo é o texto original.
      if (!mtFailNotifiedRef.current) {
        mtFailNotifiedRef.current = true;
        setFeedbackMsg('Tradução indisponível agora (motores locais e web falharam), mostrando o texto original entre parênteses.');
        setTimeout(() => setFeedbackMsg(''), 8000);
      }
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (ordemMtRef.current.encerrar(segId, selo)) degrade();
    }, 8000);

    /* `origem` já caiu para o idioma OBSERVADO da sessão quando esta fala não foi detectada —
       ver o bloco acima. Só chega `null` aqui quando nem o perfil convergiu ainda, e aí o
       Tradutor IA do servidor detecta a origem sozinho, como antes. */
    gateway.mt.translate(textoParaMt, origem || null, tgt, { falada: opts?.falada === true, contexto })
      .then(({ text: translated, engine, approximate }) => {
        if (settled) return;               // timeout já degradou → ignora resposta tardia
        settled = true; clearTimeout(timeout);
        capMetrics.mt(Math.round(performance.now() - mtT0), engine || 'mt');
        avisarSeDegradou(engine, opts?.falada === true);
        // `atual` = este pedido ainda é o mais recente do balão. Um resultado ATRASADO não escreve
        // na tela (sobrescreveria a tradução do final pelo texto pela metade), mas ainda é uma
        // tradução válida deste texto: entra no cache, e o próximo pedido igual chega instantâneo.
        const atual = ordemMtRef.current.encerrar(segId, selo);
        if (!translated) { if (atual) degrade(); return; }   // vazio → degrada (antes: ficava em "…")
        translationCacheRef.current.set(cacheKey, translated);
        if (translationCacheRef.current.size > 300) {
          const firstKey = translationCacheRef.current.keys().next().value;
          if (firstKey !== undefined) translationCacheRef.current.delete(firstKey);
        }
        if (atual) applyTranslation(translated, approximate === true);
      })
      .catch(err => {
        if (settled) return;
        settled = true; clearTimeout(timeout);
        console.warn("Live translation error:", err);
        if (ordemMtRef.current.encerrar(segId, selo)) degrade();
      });
  };

  /** Balões que degradaram para "(texto original)" voltam a "…" e pedem tradução de novo. */
  const retraduzirDegradados = () => {
    setSpeechSegments(prev => {
      const alvo = prev.filter(seg => !seg.isPartial && seg.originalText && seg.translatedText === `(${seg.originalText})`);
      if (alvo.length === 0) return prev;
      clog('tradutor pronto: retraduzindo', alvo.length, 'balão(ões) degradado(s)');
      const ids = new Set(alvo.map(seg => seg.id));
      setTimeout(() => {
        for (const seg of alvo) {
          const doSistema = seg.source === 'system';
          translateSegment(seg.id, seg.originalText, doSistema ? targetLangRef.current : sourceLangRef.current, doSistema ? sourceLangRef.current : targetLangRef.current);
        }
      }, 0);
      return prev.map(seg => (ids.has(seg.id) ? { ...seg, translatedText: '…' } : seg));
    });
  };

  return { translateSegment, retraduzirDegradados };
}
