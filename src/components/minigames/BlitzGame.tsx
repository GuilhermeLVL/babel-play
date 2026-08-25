import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Timer, Flame, Scissors } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import { distractorsFor, scoreRound } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar, pontosDoElemento, multiplicador } from '../../lib/juice';

/**
 * DUELO RELÂMPAGO — a revisão cronometrada.
 *
 * É o único jogo em que a VELOCIDADE conta: responder em menos de 3s vira nota "fácil" no
 * agendador, porque recuperação rápida é o sinal de que a palavra está firme. Nos outros jogos a
 * pessoa pode pensar à vontade, e por isso lá o teto é "bom".
 *
 * Os distratores são outras palavras REAIS do baralho — alternativa inventada denuncia a certa.
 *
 * O tempo é maior no perfil sênior (constante do perfil, não um `if` espalhado): pressa não é
 * parte do que se quer treinar ali.
 *
 * A DICA aqui é o "cortar duas": some com duas alternativas erradas. Foi escolhida assim porque
 * é a única ajuda que não entrega a resposta — a pessoa ainda precisa escolher entre duas, e
 * ainda contra o relógio. Custa nota 2 no item em que foi usada.
 */

interface BlitzGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Segundos por rodada, por perfil. */
const DURACAO: Record<AgeProfileType, number> = { kids: 60, pro: 60, senior: 90 };

export default function BlitzGame({ items, ageProfile, onFinish, onExit }: BlitzGameProps) {
  const duracao = DURACAO[ageProfile];
  const [indice, setIndice] = useState(0);
  const [restante, setRestante] = useState(duracao);
  const [sequencia, setSequencia] = useState(0);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [pontos, setPontos] = useState(0);
  /** Alternativas cortadas pela dica NESTE item (zera ao trocar de item). */
  const [cortadas, setCortadas] = useState<string[]>([]);
  const [cortesRestantes, setCortesRestantes] = useState(2);
  /**
   * A RODADA ACABOU — tela congelada.
   *
   * `jaFinalizouRef` só protegia o `onFinish` de disparar duas vezes; não impedia a pessoa de
   * RESPONDER depois do fim. Como `onFinish` só é chamado 900 ms após `finalizar()` (o tempo da
   * comemoração), existia uma janela em que a última pergunta continuava viva e clicável — e, pior,
   * com aparência de NOVA, porque o `setEscolhido(null)` reabilitava as quatro alternativas.
   *
   * O resultado medido: um 21º `ItemOutcome` com o MESMO `cardId`, o que faz `Play.tsx` chamar
   * `reviewCard` duas vezes para o mesmo cartão. E como `inicioItemRef` acabara de ser zerado, o
   * clique reflexo entrava com `ms` mínimo — que em `gradeFor` do Duelo é nota **4 ("fácil")**. Ou
   * seja: um toque acidental promovia o cartão como se a pessoa tivesse respondido num relâmpago.
   *
   * Existe como ESTADO e não só como ref porque o congelamento tem de aparecer na tela (React
   * precisa re-renderizar com os botões desabilitados); o ref continua sendo a guarda síncrona do
   * clique, que não pode esperar o próximo render.
   */
  const [acabou, setAcabou] = useState(false);
  const resultadosRef = useRef<ItemOutcome[]>([]);
  const palcoRef = useRef<HTMLDivElement | null>(null);
  const inicioItemRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const jaFinalizouRef = useRef(false);
  /**
   * Índices já respondidos. `escolhido` já barra o segundo clique DENTRO de um item, mas ele é
   * estado: entre o clique e o re-render, dois toques rápidos passam os dois. Este ref é síncrono,
   * então um item nunca gera dois `ItemOutcome` — e é o `cardId` repetido que dobra a revisão.
   */
  const respondidosRef = useRef<Set<number>>(new Set());

  const item = items[indice];

  /** Alternativas embaralhadas UMA vez por item (senão trocam de lugar a cada render). */
  const alternativas = useMemo(() => {
    if (!item) return [];
    const erradas = distractorsFor(item, items, 3);
    const todas = [...erradas, item.answer];
    for (let i = todas.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [todas[i], todas[j]] = [todas[j], todas[i]];
    }
    return todas;
  }, [item, items]);

  const finalizar = () => {
    if (jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    /* Congela a tela AGORA, não em 900 ms. Vale para os dois caminhos que chegam aqui: a última
       resposta e o fim do tempo. No caminho do relógio isto é o que impede responder uma pergunta
       cujo tempo já acabou — o arquivo dizia "quem não foi perguntado não errou", e sem o
       congelamento quem não foi perguntado ainda podia acertar. */
    setAcabou(true);
    // Itens não alcançados no tempo NÃO viram nota: quem não foi perguntado não errou.
    const outcomes = resultadosRef.current;
    const impecavel = outcomes.length > 0 && outcomes.every(o => o.correct && !o.hinted);
    comemorar(impecavel ? 'rodadaPerfeita' : outcomes.some(o => o.correct) ? 'rodadaBoa' : 'erro', palcoRef.current, { tremer: impecavel });
    setTimeout(() => onFinish({
      gameId: 'blitz',
      items: outcomes,
      score: scoreRound('blitz', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    }), 900);
  };

  // O relógio. Zerou, acabou — mesmo com itens restantes.
  useEffect(() => {
    if (jaFinalizouRef.current) return;
    if (restante <= 0) { finalizar(); return; }
    const t = setTimeout(() => setRestante(s => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restante]);

  const responder = (alternativa: string, el: HTMLElement | null) => {
    /* As três guardas são síncronas de propósito: `escolhido` é estado e chega um render atrasado. */
    if (escolhido || !item) return;
    if (jaFinalizouRef.current) return;
    if (respondidosRef.current.has(indice)) return;
    respondidosRef.current.add(indice);
    const certo = alternativa === item.answer;
    setEscolhido(alternativa);
    resultadosRef.current.push({
      cardId: item.cardId,
      itemRef: item.answer,
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioItemRef.current,
      hinted: cortadas.length > 0,
    });
    if (certo) {
      const nova = sequencia + 1;
      const mult = multiplicador(nova);
      // Cortar alternativas dá os pontos, mas não o multiplicador: o combo é mérito.
      const ganho = 10 * (cortadas.length ? 1 : mult);
      setSequencia(nova);
      setPontos(p => p + ganho);
      comemorar(mult > 1 && !cortadas.length ? 'sequencia' : 'acerto', el, {
        texto: '+' + ganho + (mult > 1 && !cortadas.length ? ' \u00d7' + mult : ''),
        tremer: mult >= 3,
      });
    } else {
      setSequencia(0);
      comemorar('erro', el);
    }
    setTimeout(() => {
      /* A ORDEM AQUI É A CORREÇÃO. Antes, `setEscolhido(null)` vinha PRIMEIRO e valia também para o
         último item: a revelação (verde/vermelho) sumia, as quatro alternativas voltavam a habilitar
         e a mesma pergunta ficava clicável pelos 900 ms que faltavam para `onFinish`. Agora, no
         último item nada é limpo — a tela fica no estado revelado e congelada. Só há reset quando
         existe um item seguinte para receber a tela limpa. */
      if (indice + 1 >= items.length) { finalizar(); return; }
      setEscolhido(null);
      setCortadas([]);
      inicioItemRef.current = Date.now();
      setIndice(i => i + 1);
    }, 550);
  };

  /** DICA "cortar duas": remove duas alternativas erradas do item atual. Custa nota 2. */
  const cortarDuas = (el: HTMLElement | null) => {
    if (!item || escolhido || cortesRestantes <= 0 || cortadas.length) return;
    if (jaFinalizouRef.current) return; // gastar uma dica numa rodada encerrada não faz nada
    const erradas = alternativas.filter(a => a !== item.answer);
    setCortadas(erradas.slice(0, 2));
    setCortesRestantes(n => n - 1);
    setSequencia(0); // a sequência é mérito; com ajuda ela recomeça
    pontosDoElemento('sobraram 2', el, 'neutro');
  };

  if (!item) return null;

  const pct = Math.max(0, Math.min(100, (restante / duracao) * 100));
  const apertado = restante <= 10;

  return (
    <div className="flex-1 flex flex-col p-4 lg:p-8 animate-in fade-in duration-200">
      <header className="flex items-center justify-between mb-4 shrink-0">
        <span className={`flex items-center gap-1.5 font-mono font-black text-lg ${apertado ? 'text-error-ink' : 'text-ink'}`}>
          <Timer className="w-5 h-5" aria-hidden /> {restante}s
        </span>
        <span className="flex items-center gap-3">
          {pontos > 0 && <span className="text-[13px] font-black text-accent-ink">{pontos} pts</span>}
          {sequencia >= 2 && (
            <span className="flex items-center gap-1 text-[13px] font-black text-warn-ink animate-in zoom-in">
              <Flame className="w-4 h-4" aria-hidden /> {sequencia}
              {multiplicador(sequencia) > 1 && <span> · ×{multiplicador(sequencia)}</span>}
            </span>
          )}
        </span>
        <span className="flex items-center gap-0.5">
          <button
            onClick={(e) => cortarDuas(e.currentTarget)}
            disabled={cortesRestantes <= 0 || cortadas.length > 0 || !!escolhido || acabou}
            className="p-2 rounded-lg text-ink-muted hover:text-warn-ink hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
            title={'Cortar duas alternativas erradas (' + cortesRestantes + ' restantes — conta como dica)'}
            data-tour="tesoura"
            aria-label="Cortar duas alternativas"
          >
            <Scissors className="w-4 h-4" />
          </button>
          <button onClick={onExit} className="p-2 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink cursor-pointer" aria-label="Sair do jogo">
            <X className="w-5 h-5" />
          </button>
        </span>
      </header>

      {/* Barra do tempo — a tensão do jogo, sem número piscando na cara. */}
      <div className="h-1.5 bg-canvas rounded-full overflow-hidden mb-8 shrink-0">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${apertado ? 'bg-error' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div ref={palcoRef} className="flex-1 flex flex-col items-center justify-center gap-8 max-w-xl mx-auto w-full">
        <div className="text-center">
          <p className="label-mono mb-2">
            {item.clozed ? 'Complete a frase' : ageProfile === 'senior' ? 'Qual palavra significa' : 'Que palavra é'}
          </p>
          <p data-tour="pergunta" className="font-display font-black text-2xl text-ink leading-tight">{item.prompt}</p>
          <p className="text-[11px] text-ink-faint mt-2">{indice + 1} de {items.length}</p>
        </div>

        <div data-tour="alternativas" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
          {alternativas.map(alt => {
            const escolhida = escolhido === alt;
            const certa = alt === item.answer;
            /* `acabou` entra aqui junto com `escolhido`: no fim do tempo a pergunta não foi
               respondida (`escolhido` é null) e sem isto ela continuaria clicável. */
            const revelando = escolhido !== null || acabou;
            const cortada = cortadas.includes(alt);
            return (
              <button
                key={alt}
                onClick={(e) => responder(alt, e.currentTarget)}
                disabled={revelando || cortada}
                className={`py-3.5 px-4 rounded-xl border font-bold text-[15px] transition-all ${
                  cortada
                    ? 'bg-canvas border-border-subtle text-ink-faint line-through opacity-40'
                    : revelando
                      ? certa
                        ? 'bg-good-soft border-good text-good-ink'
                        : escolhida
                          ? 'bg-error-soft border-error text-error-ink'
                          : 'bg-surface border-border-subtle text-ink-faint'
                      : 'bg-surface border-border-subtle text-ink hover:border-accent hover:-translate-y-0.5 cursor-pointer'
                }`}
              >
                {alt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
