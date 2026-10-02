import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { buildGrid, cellsBetween, letrasNaGrade, matchSelection, scoreRound, shortPrompt } from '@core';
import { Check, Eraser, Eye, Highlighter, Lightbulb, Radar } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';

import { celebrar } from '../../lib/comemoracao';
import { t, tp } from '../../lib/i18n';
import { multiplicador, pontosDoElemento } from '../../lib/juice';
import type { AgeProfileType } from '../../lib/profile';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda } from './casca/HudDaRodada';
import { falarNoJogo as falar, useNoHeadset, useQuestNovo } from './noQuest';

/**
 * CAÇA-PALAVRAS POR DEFINIÇÃO.
 */

interface WordSearchGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

type Celula = { linha: number; coluna: number };

export default function WordSearchGame({ items, ageProfile, onFinish }: WordSearchGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa). */
  const { ativo } = useRodada();
  const grade = useMemo(() => buildGrid(items, { seed: Math.floor(Math.random() * 100000) }), [items]);
  // Itens que não couberam na grade saem da rodada — a lista não pode pedir o impossível.
  const jogaveis = useMemo(() => items.map((_, i) => i).filter((i) => !grade.naoCouberam.includes(i)), [items, grade]);

  const [achados, setAchados] = useState<Set<number>>(new Set());
  const [revelados, setRevelados] = useState<Set<number>>(new Set());
  /** Itens em que a pessoa pediu a primeira letra — o preço é a nota (ver `gradeFor`). */
  const [comDica, setComDica] = useState<Set<number>>(new Set());
  /** Itens cuja palavra foi "raspada" — visível, mas ainda por achar na grade. */
  const [espiados, setEspiados] = useState<Set<number>>(new Set());
  /** As células que a ajuda está acendendo agora (apagam sozinhas). */
  const [dicaAcesa, setDicaAcesa] = useState<Celula | null>(null);
  /** As duas pontas que o radar está fazendo pulsar, e a direção a anunciar. */
  const [pontas, setPontas] = useState<Celula[]>([]);
  const [radaresRestantes, setRadaresRestantes] = useState(3);
  const [direcaoDica, setDirecaoDica] = useState<string>('');
  /** O que o campo de destaque tem digitado. Só letras entram (ver `letrasDestacadas`). */
  const [destaque, setDestaque] = useState('');
  const [sequencia, setSequencia] = useState(0);
  const [pontos, setPontos] = useState(0);
  const gradeRef = useRef<HTMLDivElement | null>(null);
  const [inicio, setInicio] = useState<Celula | null>(null);
  const [hover, setHover] = useState<Celula | null>(null);
  /**
   * O TRAÇO TEM DOIS JEITOS DE ACONTECER (QA dos jogos, 2026-09-26): arrastar (mouse, ou dedo) e
   * marcar as pontas — tocar/Enter na primeira letra e depois na última. Antes só o arrasto existia,
   * e no toque ele nem funcionava: o navegador captura o ponteiro na célula onde o dedo pousou, então
   * `pointerenter`/`pointerup` nunca chegavam às outras. `arrastando` diferencia "o dedo ainda está
   * na tela" de "a primeira ponta está marcada, esperando a segunda".
   */
  const arrastandoRef = useRef(false);
  /** A primeira ponta está marcada (por toque ou teclado) e a tela pede a última. */
  const [aguardandoFim, setAguardandoFim] = useState(false);
  /** A célula que recebe o Tab (as outras andam pelas setas): 169 paradas de Tab seria um labirinto. */
  const [focoNaGrade, setFocoNaGrade] = useState<Celula>({ linha: 0, coluna: 0 });
  const tentativasRef = useRef<Map<number, number>>(new Map());
  const inicioRodadaRef = useRef(Date.now());
  const jaFinalizouRef = useRef(false);
  /**
   * NO META QUEST o traço é sempre de DOIS TOQUES: a primeira letra e depois a última. Arrastar com o
   * ponteiro de laser pede mão firme, e um tremor entre apertar e soltar o gatilho virava um traço
   * errado (e a sequência perdida). As quatro ajudas de cada pista (raspar, radar, dica, revelar), que
   * eram ícones de 14 px em cada linha, viram quatro botões com nome que agem na pista escolhida.
   */
  const questNovo = useQuestNovo();
  /* Os DOIS TOQUES são do aparelho (o raio do controle); a coluna das pistas com as ajudas com nome é
     do desenho. No computador com o desenho novo o arrasto do mouse continua valendo, como sempre. */
  const semArrasto = useNoHeadset();
  const [pistaEscolhida, setPistaEscolhida] = useState<number | null>(null);

  const resolvidos = achados.size + revelados.size;

  const finalizar = (achadosFinais: Set<number>, reveladosFinais: Set<number>) => {
    if (jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    const agora = Date.now();
    const outcomes: ItemOutcome[] = jogaveis.map((i) => ({
      cardId: items[i].cardId,
      itemRef: items[i].answer,
      correct: achadosFinais.has(i),
      attempts: tentativasRef.current.get(i) ?? 1,
      ms: agora - inicioRodadaRef.current,
      hinted: comDica.has(i),
      revealed: reveladosFinais.has(i),
    }));
    setTimeout(
      () =>
        onFinish({
          gameId: 'wordsearch',
          items: outcomes,
          score: scoreRound('wordsearch', outcomes),
          durationMs: agora - inicioRodadaRef.current,
        }),
      900,
    );
  };

  /** Começa um traço nesta célula, ou — se a primeira ponta já está marcada — termina nela. */
  const marcarPonta = (celula: Celula, el: HTMLElement | null) => {
    if (!ativo) return;
    if (!inicio) {
      setInicio(celula);
      setHover(celula);
      setAguardandoFim(true);
      return;
    }
    // A mesma letra de novo desfaz a marcação: é o "não era aqui", e não conta como erro.
    if (inicio.linha === celula.linha && inicio.coluna === celula.coluna) {
      setInicio(null);
      setHover(null);
      setAguardandoFim(false);
      return;
    }
    soltar(celula, el);
  };

  /** As setas movem o foco pela grade; Enter/Espaço marcam a ponta; Esc desfaz a marcação. */
  const aoTeclarNaCelula = (e: React.KeyboardEvent<HTMLButtonElement>, celula: Celula) => {
    const passos: Record<string, [number, number]> = {
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
    };
    const passo = passos[e.key];
    if (passo) {
      e.preventDefault();
      const linha = Math.max(0, Math.min(grade.tamanho - 1, celula.linha + passo[0]));
      const coluna = Math.max(0, Math.min(grade.tamanho - 1, celula.coluna + passo[1]));
      setFocoNaGrade({ linha, coluna });
      if (inicio) setHover({ linha, coluna });
      gradeRef.current?.querySelector<HTMLButtonElement>(`[data-celula="${linha}-${coluna}"]`)?.focus();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      marcarPonta(celula, e.currentTarget);
      return;
    }
    // Com uma ponta marcada, Esc desfaz a marcação em vez de pausar a rodada.
    if (e.key === 'Escape' && inicio) {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setInicio(null);
      setHover(null);
      setAguardandoFim(false);
    }
  };

  const soltar = (fim: Celula, el: HTMLElement | null) => {
    if (!inicio) return;
    arrastandoRef.current = false;
    setAguardandoFim(false);
    const achado = matchSelection(grade, inicio, fim);
    setInicio(null);
    setHover(null);
    if (achado && !achados.has(achado.itemIndex) && !revelados.has(achado.itemIndex)) {
      const nova = sequencia + 1;
      const mult = multiplicador(nova);
      const ganho = 10 * (comDica.has(achado.itemIndex) ? 1 : mult);
      setSequencia(nova);
      setPontos((pt) => pt + ganho);
      celebrar({ tipo: 'acerto', combo: nova, el, pontos: ganho });

      // Pronuncia a palavra achada no idioma original
      const it = items[achado.itemIndex];
      if (it) falar(it.answer, it.lang);

      const novos = new Set([...achados, achado.itemIndex]);
      setAchados(novos);
      if (novos.size + revelados.size === jogaveis.length) finalizar(novos, revelados);
      return;
    }
    // Traço errado
    if (!achado) {
      setSequencia(0);
      celebrar({ tipo: 'erro', el: el ?? gradeRef.current });
      pontosDoElemento('Tente de novo', el, 'ruim');
    }
  };

  /**
   * RADAR: faz as duas pontas da palavra pulsarem. NÃO custa nota — ver o cabeçalho.
   * Sem argumento, escolhe uma palavra ainda não encontrada (para quem nem sabe por onde começar).
   */
  const acionarRadar = (i: number | null, el: HTMLElement | null) => {
    if (radaresRestantes <= 0) return;
    const pendentes = jogaveis.filter((x) => !achados.has(x) && !revelados.has(x));
    const alvo = i ?? pendentes[Math.floor(Math.random() * pendentes.length)];
    const colocada = grade.colocadas.find((x) => x.itemIndex === alvo);
    if (!colocada) return;
    setRadaresRestantes((n) => n - 1);
    setPontas([colocada.celulas[0], colocada.celulas[colocada.celulas.length - 1]]);
    pontosDoElemento('achei as pontas', el, 'neutro');
    setTimeout(() => setPontas([]), 4000);
  };

  /** DICA: revela a primeira letra e a direção do traço. Custa nota 2. */
  const pedirDica = (i: number, el: HTMLElement | null) => {
    const colocada = grade.colocadas.find((x) => x.itemIndex === i);
    if (!colocada) return;
    const a = colocada.celulas[0];
    const b = colocada.celulas[colocada.celulas.length - 1];
    const dl = Math.sign(b.linha - a.linha);
    const dc = Math.sign(b.coluna - a.coluna);
    const direcao =
      dl === 0
        ? dc > 0
          ? 'da esquerda para a direita'
          : 'da direita para a esquerda'
        : dc === 0
          ? dl > 0
            ? 'de cima para baixo'
            : 'de baixo para cima'
          : 'na diagonal';
    setComDica((prev) => new Set([...prev, i]));
    setSequencia(0); // a sequência é mérito; com ajuda ela recomeça
    setDicaAcesa(a);
    setDirecaoDica(direcao);
    pontosDoElemento(direcao, el, 'neutro');
    setTimeout(() => {
      setDicaAcesa(null);
      setDirecaoDica('');
    }, 4000);
  };

  /**
   * ESPIAR: mostra a palavra no idioma que se estuda, sem encerrar o item.
   *
   * Fica entre a dica e o revelar. Quem não LEMBRA a palavra não tem como procurá-la na grade, e
   * a única saída era desistir (nota 1) — agora dá para se orientar e continuar procurando. Custa
   * nota 2, como qualquer ajuda.
   */
  const espiar = (i: number, el: HTMLElement | null) => {
    setEspiados((prev) => new Set([...prev, i]));
    setComDica((prev) => new Set([...prev, i]));
    setSequencia(0);
    pontosDoElemento('espiou', el, 'neutro');
  };

  const revelar = (i: number, el: HTMLElement | null) => {
    setSequencia(0);
    celebrar({ tipo: 'erro', el });
    const novos = new Set([...revelados, i]);
    setRevelados(novos);
    if (achados.size + novos.size === jogaveis.length) finalizar(achados, novos);
  };

  /** Células sob o traço em curso — realce enquanto o dedo se move. */
  const traco = inicio && hover ? cellsBetween(inicio, hover) : null;
  const naSelecao = (l: number, c: number) => traco?.some((x) => x.linha === l && x.coluna === c) ?? false;
  const emPalavraAchada = (l: number, c: number) =>
    grade.colocadas.some(
      (p) =>
        (achados.has(p.itemIndex) || revelados.has(p.itemIndex)) &&
        p.celulas.some((x) => x.linha === l && x.coluna === c),
    );

  /**
   * O DESTAQUE DE LETRAS — o "Ctrl+F" da grade.
   *
   * Uma grade de 13×13 tem 169 letras e achar por onde COMEÇAR uma palavra é varredura visual pura:
   * a pessoa sabe qual palavra procura e gasta o tempo todo caçando a primeira letra. Digitar essa
   * letra acende todas as ocorrências e o esforço vira busca dirigida.
   *
   * NÃO CONTA COMO AJUDA (`hinted` continua falso), e a razão é substantiva: as letras JÁ ESTÃO
   * TODAS VISÍVEIS. O destaque não revela informação nenhuma — diferente do radar (que mostra as
   * pontas), da dica (que acende a célula certa) e do olho (que revela a palavra), todos os três
   * dando o que a pessoa não tinha. Penalizar um realce de algo já visível seria punir quem tem
   * dificuldade de varredura, o que é o oposto de acessibilidade.
   *
   * Aceita mais de uma letra: quem procura "TH" acende as duas e vê onde elas se encontram.
   */
  /* A MESMA regua da grade: com `normalizarPalavra` quem digitasse "ç" acendia "C" e o Ç da
     grade ficava apagado. */
  const letrasDestacadas = useMemo(() => new Set(letrasNaGrade(destaque).split('')), [destaque]);
  const destacada = (letra: string) => letrasDestacadas.size > 0 && letrasDestacadas.has(letra);

  /* AS PEÇAS DA TELA, montadas uma vez e arrumadas de dois jeitos: o de sempre e o do headset. */
  const hud = (
    <HudDaRodada
      pontos={pontos}
      sequencia={sequencia}
      acertos={achados.size}
      rotulo={`${resolvidos} de ${jogaveis.length} palavras`}
      progresso={resolvidos / Math.max(1, jogaveis.length)}
      ajudas={
        <BotaoDeAjuda
          icone={Radar}
          rotulo="Radar"
          resta={radaresRestantes}
          data-tour="radar"
          disabled={!ativo}
          onClick={(e) => acionarRadar(null, e.currentTarget)}
          title="Faz as pontas de uma palavra pulsarem na grade"
        />
      }
    />
  );

  const avisoDaDirecao = direcaoDica ? (
    <p className="text-center text-[12px] font-bold text-warn-ink mb-2 animate-in fade-in" data-qp="apoio">
      o traço vai {direcaoDica}
    </p>
  ) : null;

  /* O CAMPO DE DESTAQUE. Fica ACIMA da grade e centralizado com ela: à direita, junto do
          radar, ele competiria com as ajudas que penalizam, e este não penaliza. (No headset ele abre
          a coluna das pistas: o teclado do sistema sobe quando o campo ganha foco.) */
  const campoDeDestaque = (
    <div className="flex items-center justify-center gap-2 mb-2 shrink-0" data-qp="destaque">
      <label htmlFor="destaque-letras" className="flex items-center gap-1.5 text-[12px] text-ink-muted">
        <Highlighter className="w-3.5 h-3.5" aria-hidden />
        {ageProfile === 'kids' ? 'acender letras' : ageProfile === 'senior' ? 'Destacar letras' : 'destacar'}
      </label>
      <input
        id="destaque-letras"
        value={destaque}
        onChange={(e) => setDestaque(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setDestaque('');
        }}
        maxLength={4}
        autoComplete="off"
        spellCheck={false}
        placeholder="ex.: A"
        /* `w-20` e não largura total: o campo é para uma ou duas letras, e um campo largo
             convidaria a digitar a palavra inteira, que é o que o jogo pede para PROCURAR. */
        className="w-20 px-2.5 py-1.5 rounded-lg bg-canvas border border-border-subtle text-[13px] font-bold text-ink text-center uppercase focus:border-accent outline-none"
        aria-describedby="destaque-ajuda"
      />
      {/* O número dito em voz alta: sem ele, quem usa leitor de tela não sabe se o destaque
            pegou nada. E para todos, "0" é a resposta imediata de "essa letra não existe aqui". */}
      <span id="destaque-ajuda" className="text-[12px] text-ink-muted min-w-[7rem]" aria-live="polite">
        {letrasDestacadas.size === 0
          ? 'não conta como dica'
          : `${grade.letras.flat().filter(destacada).length} aceso(s)`}
      </span>
    </div>
  );

  /* COMO MARCAR, dito uma vez e sempre à vista: o arrasto não é o único gesto, e no celular
          tocar nas duas pontas é o mais preciso. Com a primeira ponta marcada, a frase muda. */
  const comoMarcar = (
    <p id="como-marcar" className="text-center text-[12px] text-ink-muted mb-2" aria-live="polite" data-qp="apoio">
      {aguardandoFim
        ? t('Agora toque na última letra da palavra (ou na mesma, para desfazer).')
        : semArrasto
          ? t('Toque na primeira letra da palavra e depois na última.')
          : t('Arraste da primeira à última letra, ou toque na primeira e depois na última.')}
    </p>
  );

  /* A GRADE */
  const gradeDeLetras = (
    <div
      ref={gradeRef}
      data-tour="grade"
      className="grid gap-0.5 select-none touch-none shrink-0"
      style={
        {
          gridTemplateColumns: `repeat(${grade.tamanho}, minmax(0, 1fr))`,
          // O tamanho da grade, para o CSS do headset calcular a célula (`styles/questJogos.css`).
          '--qj-n': grade.tamanho,
        } as React.CSSProperties
      }
      role="group"
      aria-label={t('Grade de letras')}
      aria-describedby="como-marcar"
      onPointerLeave={() => {
        // Sair da grade no meio de um ARRASTO cancela; uma ponta marcada por toque continua.
        if (!arrastandoRef.current) return;
        arrastandoRef.current = false;
        setInicio(null);
        setHover(null);
      }}
    >
      {grade.letras.map((linha, l) =>
        linha.map((letra, c) => {
          const achada = emPalavraAchada(l, c);
          const selecionada = naSelecao(l, c);
          const acesa = dicaAcesa?.linha === l && dicaAcesa?.coluna === c;
          const pulsando = pontas.some((x) => x.linha === l && x.coluna === c);
          const realcada = destacada(letra);
          const celula = { linha: l, coluna: c };
          return (
            <button
              key={`${l}-${c}`}
              type="button"
              data-celula={`${l}-${c}`}
              tabIndex={focoNaGrade.linha === l && focoNaGrade.coluna === c ? 0 : -1}
              aria-pressed={inicio?.linha === l && inicio?.coluna === c ? true : undefined}
              onFocus={() => setFocoNaGrade(celula)}
              onKeyDown={(e) => aoTeclarNaCelula(e, celula)}
              onClick={semArrasto ? (e) => marcarPonta(celula, e.currentTarget) : undefined}
              onPointerDown={(e) => {
                // No headset não há arrasto: o toque (o `click` acima) marca as duas pontas.
                if (semArrasto) return;
                /* Solta a captura implícita do toque: sem isto os eventos do dedo ficam presos
                       na célula de partida e as outras nunca sabem que ele passou por elas. */
                const alvo = e.currentTarget;
                if (alvo.hasPointerCapture?.(e.pointerId)) alvo.releasePointerCapture(e.pointerId);
                if (inicio && !arrastandoRef.current) {
                  marcarPonta(celula, alvo); // segunda ponta de um traço por toque
                  return;
                }
                if (!ativo) return;
                arrastandoRef.current = true;
                setInicio(celula);
                setHover(celula);
              }}
              onPointerEnter={() => {
                if (inicio) setHover(celula);
              }}
              onPointerUp={(e) => {
                if (!arrastandoRef.current) return;
                // Soltou onde começou: foi um TOQUE — a primeira ponta fica marcada, à espera da outra.
                if (inicio?.linha === l && inicio?.coluna === c) {
                  arrastandoRef.current = false;
                  setAguardandoFim(true);
                  return;
                }
                soltar(celula, e.currentTarget);
              }}
              /* Célula que ESCALA com a tela (2026-08-28): 32-36px fixos deixavam a grade
                     minúscula num monitor. Cresce com a altura, encolhe no celular, e nunca
                     estoura a largura disponível para a grade inteira. */
              style={{
                width: `max(1.6rem, min(clamp(1.9rem, 6.2vh, 3.4rem), calc((100vw - 26rem) / ${grade.tamanho})))`,
                height: `max(1.6rem, min(clamp(1.9rem, 6.2vh, 3.4rem), calc((100vw - 26rem) / ${grade.tamanho})))`,
                fontSize: `calc(max(1.6rem, min(clamp(1.9rem, 6.2vh, 3.4rem), calc((100vw - 26rem) / ${grade.tamanho}))) * 0.42)`,
              }}
              className={`rounded-md font-bold transition-colors cursor-pointer ${
                achada
                  ? 'bg-good-soft text-good-ink'
                  : selecionada
                    ? 'bg-accent text-white'
                    : acesa
                      ? 'bg-warn text-white ring-2 ring-warn'
                      : pulsando
                        ? 'bg-accent-soft text-accent-ink ring-2 ring-accent babel-pulso'
                        : /* O realce vem DEPOIS de achada/selecionada/dica na cadeia: ele é o
                               estado mais fraco e nunca deve encobrir um estado do jogo. */
                          realcada
                          ? 'bg-warn-soft text-warn-ink ring-1 ring-warn/50'
                          : 'bg-surface text-ink hover:bg-surface-hover'
              }`}
              aria-label={`Letra ${letra}, linha ${l + 1}, coluna ${c + 1}${realcada ? ', destacada' : ''}`}
            >
              {letra}
            </button>
          );
        }),
      )}
    </div>
  );

  /* ── NO META QUEST: a grade à esquerda; à direita o destaque, as pistas e as ajudas com nome. ── */
  if (questNovo) {
    const pendentes = jogaveis.filter((i) => !achados.has(i) && !revelados.has(i));
    /* A pista em que as ajudas agem: a que a pessoa tocou, ou a primeira que ainda falta. */
    const escolhida =
      pistaEscolhida !== null && pendentes.includes(pistaEscolhida) ? pistaEscolhida : (pendentes[0] ?? null);
    const semPista = escolhida === null;
    return (
      <>
        {hud}
        <div data-qj="wordsearch" className="qj-caca">
          <div className="qj-caca-grade">
            {comoMarcar}
            {avisoDaDirecao}
            <div className="qj-caca-rolagem">{gradeDeLetras}</div>
          </div>

          <aside data-tour="pistas" className="qj-caca-lado">
            {campoDeDestaque}
            <p className="label-mono">
              {ageProfile === 'senior' ? 'Procure a palavra de:' : 'Ache a palavra que significa:'}
            </p>
            <ul className="qj-caca-pistas">
              {jogaveis.map((i) => {
                const achada = achados.has(i);
                const revelada = revelados.has(i);
                const raspada = espiados.has(i) && !achada && !revelada;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      className="qj-pista"
                      data-pista={i}
                      data-estado={achada ? 'certo' : revelada ? 'revelada' : undefined}
                      aria-pressed={achada || revelada ? undefined : escolhida === i}
                      disabled={achada || revelada}
                      onClick={() => setPistaEscolhida(i)}
                    >
                      {/* A pista inteira ao parar o ponteiro, como na lista de sempre (no computador). */}
                      <span title={items[i].prompt}>{shortPrompt(items[i].prompt, 72)}</span>
                      {(achada || revelada || raspada) && <b>{items[i].answer}</b>}
                      {achada && <Check aria-label={t('encontrada')} />}
                      {revelada && <Eye aria-label={t('revelada')} />}
                      {raspada && <Eraser aria-label={t('raspada')} />}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* O que cada ajuda faz e custa, escrito no próprio botão: no computador isso mora no
                `title`, que pede o ponteiro parado em cima. */}
            <div className="qj-caca-ajudas" role="group" aria-label={t('Ajudas para a pista escolhida')}>
              <button
                type="button"
                data-qp="acao"
                data-ajuda="raspar"
                disabled={semPista || espiados.has(escolhida)}
                onClick={(e) => !semPista && espiar(escolhida, e.currentTarget)}
              >
                <Eraser aria-hidden />
                <span>
                  <b>{t('Raspar')}</b>
                  <small>{t('mostra a palavra, vale dica')}</small>
                </span>
              </button>
              <button
                type="button"
                data-qp="acao"
                data-ajuda="radar"
                disabled={semPista || radaresRestantes <= 0}
                onClick={(e) => !semPista && acionarRadar(escolhida, e.currentTarget)}
              >
                <Radar aria-hidden />
                <span>
                  <b>{t('Radar')}</b>
                  <small>{tp(radaresRestantes, 'acende as pontas, resta {n}', 'acende as pontas, restam {n}')}</small>
                </span>
              </button>
              <button
                type="button"
                data-qp="acao"
                data-ajuda="dica"
                disabled={semPista || comDica.has(escolhida)}
                onClick={(e) => !semPista && pedirDica(escolhida, e.currentTarget)}
              >
                <Lightbulb aria-hidden />
                <span>
                  <b>{t('Dica')}</b>
                  <small>{t('primeira letra e direção, vale dica')}</small>
                </span>
              </button>
              <button
                type="button"
                data-qp="acao"
                data-ajuda="revelar"
                disabled={semPista}
                onClick={(e) => !semPista && revelar(escolhida, e.currentTarget)}
              >
                <Eye aria-hidden />
                <span>
                  <b>{t('Revelar')}</b>
                  <small>{t('desiste, conta como erro')}</small>
                </span>
              </button>
            </div>
          </aside>
        </div>
      </>
    );
  }

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o palco
     do Caça-palavras, que é dele. */
  return (
    <>
      {/* Topo unificado */}
      {hud}

      {avisoDaDirecao}

      {campoDeDestaque}

      {comoMarcar}

      {/* As duas colunas como um PAR centralizado. Com `mx-auto` na grade, cada uma se centrava no
          próprio espaço e sobrava um vão enorme no meio da tela, grade num canto, pistas no outro. */}
      <div className="flex flex-col lg:flex-row gap-5 lg:gap-8 items-start justify-center my-auto w-fit mx-auto">
        {gradeDeLetras}

        {/* AS PISTAS — traduções, nunca as palavras. */}
        <aside data-tour="pistas" className="w-full lg:w-72 shrink-0 flex flex-col min-h-0">
          <p className="label-mono mb-2">
            {ageProfile === 'senior' ? 'Procure a palavra de:' : 'Ache a palavra que significa:'}
          </p>
          <ul className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar max-h-[60vh] pe-1">
            {jogaveis.map((i) => {
              const achada = achados.has(i);
              const revelada = revelados.has(i);
              return (
                <li
                  key={i}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[13px] ${
                    achada
                      ? 'bg-good-soft border-good/40 text-good-ink'
                      : revelada
                        ? 'bg-canvas border-border-subtle text-ink-faint'
                        : 'bg-surface border-border-subtle text-ink'
                  }`}
                >
                  {/* Pista encurtada: a frase-com-lacuna vem de fala real e chegava a 150 caracteres
                      nesta coluna estreita. `shortPrompt` recorta a janela em torno da lacuna. */}
                  <span className="flex-1 min-w-0 leading-snug" title={items[i].prompt}>
                    {shortPrompt(items[i].prompt, 52)}
                  </span>
                  {achada && <Check className="w-4 h-4 shrink-0" aria-label="encontrada" />}
                  {/* A palavra aparece quando achada, revelada — ou raspada, que a mostra sem
                      encerrar o item (quem não lembra a palavra não tem como procurá-la). */}
                  {(achada || revelada || espiados.has(i)) && (
                    <span
                      className={`font-bold shrink-0 ${espiados.has(i) && !achada && !revelada ? 'text-warn-ink' : ''}`}
                    >
                      {items[i].answer}
                    </span>
                  )}
                  {!achada && !revelada && (
                    <>
                      {!espiados.has(i) && (
                        <button
                          onClick={(e) => espiar(i, e.currentTarget)}
                          className="p-1 rounded text-ink-faint hover:text-warn-ink cursor-pointer shrink-0"
                          title="Raspar: mostrar a palavra e continuar procurando (conta como dica)"
                          aria-label="Raspar para ver a palavra"
                        >
                          <Eraser className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => acionarRadar(i, e.currentTarget)}
                        disabled={radaresRestantes <= 0}
                        className="p-1 rounded text-ink-faint hover:text-accent disabled:opacity-30 cursor-pointer shrink-0"
                        title="Radar: acender as pontas desta palavra (não conta como dica)"
                        aria-label="Radar desta palavra"
                      >
                        <Radar className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => pedirDica(i, e.currentTarget)}
                        disabled={comDica.has(i)}
                        className="p-1 rounded text-ink-faint hover:text-warn-ink disabled:opacity-30 cursor-pointer shrink-0"
                        title="Dica: primeira letra e direção do traço (conta como dica)"
                        aria-label="Pedir dica desta palavra"
                      >
                        <Lightbulb className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => revelar(i, e.currentTarget)}
                        className="p-1 rounded text-ink-faint hover:text-error-ink cursor-pointer shrink-0"
                        title="Não lembro, revelar (conta como erro)"
                        aria-label="Revelar esta palavra"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </>
  );
}
