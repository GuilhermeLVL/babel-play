import React, { useMemo, useRef, useState } from 'react';
import { X, Eye, Check, Lightbulb, Radar, Highlighter, Eraser } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import { buildGrid, matchSelection, cellsBetween, scoreRound, shortPrompt, normalizarPalavra } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar, pontosDoElemento, multiplicador } from '../../lib/juice';

/**
 * CAÇA-PALAVRAS POR DEFINIÇÃO.
 *
 * A lista lateral mostra as TRADUÇÕES, não as palavras — quem joga precisa lembrar a palavra
 * antes de procurar. É o que separa este de um caça-palavras comum, onde a resposta está à vista
 * e o exercício vira varredura visual.
 *
 * TRÊS AJUDAS, com preços diferentes, porque são problemas diferentes:
 *   · o RADAR faz as duas PONTAS da palavra pulsarem na grade. Não custa nota nenhuma, e é de
 *     propósito: quem lembrou a palavra e não a acha no meio de 144 letras tem falha de BUSCA
 *     VISUAL, não de memória — cobrar por isso registraria no agendador um esquecimento que não
 *     aconteceu, e é assim que se estraga a curva de revisão;
 *   · a DICA revela a primeira letra e diz a DIREÇÃO do traço. Aí já é sobre a palavra, então
 *     custa nota 2 (`hinted`);
 *   · REVELAR é dizer "não lembrei", e vira nota 1 (`revealed`).
 * Errar o traço não custa nenhuma das três: isso é mira, não esquecimento.
 */

interface WordSearchGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

type Celula = { linha: number; coluna: number };

export default function WordSearchGame({ items, ageProfile, onFinish, onExit }: WordSearchGameProps) {
  const grade = useMemo(() => buildGrid(items, { seed: Math.floor(Math.random() * 100000) }), [items]);
  // Itens que não couberam na grade saem da rodada — a lista não pode pedir o impossível.
  const jogaveis = useMemo(() => items.map((_, i) => i).filter(i => !grade.naoCouberam.includes(i)), [items, grade]);

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
  const tentativasRef = useRef<Map<number, number>>(new Map());
  const inicioRodadaRef = useRef(Date.now());
  const jaFinalizouRef = useRef(false);

  const resolvidos = achados.size + revelados.size;

  const finalizar = (achadosFinais: Set<number>, reveladosFinais: Set<number>) => {
    if (jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    const agora = Date.now();
    const outcomes: ItemOutcome[] = jogaveis.map(i => ({
      cardId: items[i].cardId,
      itemRef: items[i].answer,
      correct: achadosFinais.has(i),
      attempts: tentativasRef.current.get(i) ?? 1,
      ms: agora - inicioRodadaRef.current,
      hinted: comDica.has(i),
      revealed: reveladosFinais.has(i),
    }));
    // Achar TODAS sem revelar nem pedir dica é o caso raro — só ele ganha a chuva de confete.
    const impecavel = outcomes.every(o => o.correct && !o.hinted);
    comemorar(impecavel ? 'rodadaPerfeita' : 'rodadaBoa', gradeRef.current, { tremer: impecavel });
    setTimeout(() => onFinish({
      gameId: 'wordsearch',
      items: outcomes,
      score: scoreRound('wordsearch', outcomes),
      durationMs: agora - inicioRodadaRef.current,
    }), 900);
  };

  const soltar = (fim: Celula, el: HTMLElement | null) => {
    if (!inicio) return;
    const achado = matchSelection(grade, inicio, fim);
    setInicio(null);
    setHover(null);
    if (achado && !achados.has(achado.itemIndex) && !revelados.has(achado.itemIndex)) {
      const nova = sequencia + 1;
      const mult = multiplicador(nova);
      // Quem pediu a primeira letra ganha os pontos, mas sem o multiplicador em cima.
      const ganho = 10 * (comDica.has(achado.itemIndex) ? 1 : mult);
      setSequencia(nova);
      setPontos(pt => pt + ganho);
      comemorar(mult > 1 ? 'sequencia' : 'acerto', el, { texto: '+' + ganho + (mult > 1 ? ' \u00d7' + mult : ''), tremer: mult >= 3 });
      const novos = new Set([...achados, achado.itemIndex]);
      setAchados(novos);
      if (novos.size + revelados.size === jogaveis.length) finalizar(novos, revelados);
      return;
    }
    // Traço errado é MIRA, não esquecimento: a sequência para, mas nenhuma nota é afetada.
    if (!achado) {
      setSequencia(0);
      comemorar('erro', el);
    }
  };

  /**
   * RADAR: faz as duas pontas da palavra pulsarem. NÃO custa nota — ver o cabeçalho.
   * Sem argumento, escolhe uma palavra ainda não encontrada (para quem nem sabe por onde começar).
   */
  const acionarRadar = (i: number | null, el: HTMLElement | null) => {
    if (radaresRestantes <= 0) return;
    const pendentes = jogaveis.filter(x => !achados.has(x) && !revelados.has(x));
    const alvo = i ?? pendentes[Math.floor(Math.random() * pendentes.length)];
    const colocada = grade.colocadas.find(x => x.itemIndex === alvo);
    if (!colocada) return;
    setRadaresRestantes(n => n - 1);
    setPontas([colocada.celulas[0], colocada.celulas[colocada.celulas.length - 1]]);
    pontosDoElemento('achei as pontas', el, 'neutro');
    setTimeout(() => setPontas([]), 4000);
  };

  /** DICA: revela a primeira letra e a direção do traço. Custa nota 2. */
  const pedirDica = (i: number, el: HTMLElement | null) => {
    const colocada = grade.colocadas.find(x => x.itemIndex === i);
    if (!colocada) return;
    const a = colocada.celulas[0];
    const b = colocada.celulas[colocada.celulas.length - 1];
    const dl = Math.sign(b.linha - a.linha);
    const dc = Math.sign(b.coluna - a.coluna);
    const direcao = dl === 0 ? (dc > 0 ? 'da esquerda para a direita' : 'da direita para a esquerda')
      : dc === 0 ? (dl > 0 ? 'de cima para baixo' : 'de baixo para cima')
      : 'na diagonal';
    setComDica(prev => new Set([...prev, i]));
    setSequencia(0); // a sequência é mérito; com ajuda ela recomeça
    setDicaAcesa(a);
    setDirecaoDica(direcao);
    pontosDoElemento(direcao, el, 'neutro');
    setTimeout(() => { setDicaAcesa(null); setDirecaoDica(''); }, 4000);
  };

  /**
   * ESPIAR: mostra a palavra no idioma que se estuda, sem encerrar o item.
   *
   * Fica entre a dica e o revelar. Quem não LEMBRA a palavra não tem como procurá-la na grade, e
   * a única saída era desistir (nota 1) — agora dá para se orientar e continuar procurando. Custa
   * nota 2, como qualquer ajuda.
   */
  const espiar = (i: number, el: HTMLElement | null) => {
    setEspiados(prev => new Set([...prev, i]));
    setComDica(prev => new Set([...prev, i]));
    setSequencia(0);
    pontosDoElemento('espiou', el, 'neutro');
  };

  const revelar = (i: number, el: HTMLElement | null) => {
    setSequencia(0);
    comemorar('erro', el);
    const novos = new Set([...revelados, i]);
    setRevelados(novos);
    if (achados.size + novos.size === jogaveis.length) finalizar(achados, novos);
  };

  /** Células sob o traço em curso — realce enquanto o dedo se move. */
  const traco = inicio && hover ? cellsBetween(inicio, hover) : null;
  const naSelecao = (l: number, c: number) => traco?.some(x => x.linha === l && x.coluna === c) ?? false;
  const emPalavraAchada = (l: number, c: number) =>
    grade.colocadas.some(p => (achados.has(p.itemIndex) || revelados.has(p.itemIndex)) && p.celulas.some(x => x.linha === l && x.coluna === c));

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
  const letrasDestacadas = useMemo(
    () => new Set(normalizarPalavra(destaque).split('')),
    [destaque],
  );
  const destacada = (letra: string) => letrasDestacadas.size > 0 && letrasDestacadas.has(letra);

  return (
    <div className="flex-1 flex flex-col p-4 lg:p-6 animate-in fade-in duration-200 overflow-y-auto custom-scrollbar">
      <header className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="font-display font-black text-lg text-ink">
            {ageProfile === 'kids' ? 'Ache as palavras' : 'Caça-palavras'}
          </h2>
          <p className="text-[12px] text-ink-muted">
            {resolvidos} de {jogaveis.length} encontradas
            {pontos > 0 && <span className="text-accent-ink font-bold"> · {pontos} pts</span>}
            {multiplicador(sequencia) > 1 && <span className="text-warn-ink font-bold"> · ×{multiplicador(sequencia)}</span>}
          </p>
        </div>
        <span className="flex items-center gap-0.5">
          <button
            onClick={(e) => acionarRadar(null, e.currentTarget)}
            disabled={radaresRestantes <= 0}
            className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg text-[12px] font-bold text-ink-muted hover:text-accent hover:bg-surface-hover disabled:opacity-40 cursor-pointer"
            title="Faz as pontas de uma palavra pulsarem na grade (não conta como dica)"
            data-tour="radar"
            aria-label="Acionar o radar"
          >
            <Radar className="w-4 h-4" /> {radaresRestantes}
          </button>
          <button onClick={onExit} className="p-2 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink cursor-pointer" aria-label="Sair do jogo">
            <X className="w-5 h-5" />
          </button>
        </span>
      </header>

      {direcaoDica && (
        <p className="text-center text-[12px] font-bold text-warn-ink mb-2 animate-in fade-in">
          o traço vai {direcaoDica}
        </p>
      )}

      {/* O CAMPO DE DESTAQUE. Fica ACIMA da grade e centralizado com ela: à direita, junto do
          radar, ele competiria com as ajudas que penalizam, e este não penaliza. */}
      <div className="flex items-center justify-center gap-2 mb-2 shrink-0">
        <label htmlFor="destaque-letras" className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <Highlighter className="w-3.5 h-3.5" aria-hidden />
          {ageProfile === 'kids' ? 'acender letras' : ageProfile === 'senior' ? 'Destacar letras' : 'destacar'}
        </label>
        <input
          id="destaque-letras"
          value={destaque}
          onChange={e => setDestaque(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setDestaque(''); }}
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

      {/* As duas colunas como um PAR centralizado. Com `mx-auto` na grade, cada uma se centrava no
          próprio espaço e sobrava um vão enorme no meio da tela, grade num canto, pistas no outro. */}
      <div className="flex flex-col lg:flex-row gap-5 lg:gap-8 items-start justify-center my-auto w-fit mx-auto">
        {/* A GRADE */}
        <div
          ref={gradeRef}
          data-tour="grade"
          className="grid gap-0.5 select-none touch-none shrink-0"
          style={{ gridTemplateColumns: `repeat(${grade.tamanho}, minmax(0, 1fr))` }}
          onPointerLeave={() => { setInicio(null); setHover(null); }}
        >
          {grade.letras.map((linha, l) =>
            linha.map((letra, c) => {
              const achada = emPalavraAchada(l, c);
              const selecionada = naSelecao(l, c);
              const acesa = dicaAcesa?.linha === l && dicaAcesa?.coluna === c;
              const pulsando = pontas.some(x => x.linha === l && x.coluna === c);
              const realcada = destacada(letra);
              return (
                <button
                  key={`${l}-${c}`}
                  onPointerDown={() => { setInicio({ linha: l, coluna: c }); setHover({ linha: l, coluna: c }); }}
                  onPointerEnter={() => { if (inicio) setHover({ linha: l, coluna: c }); }}
                  onPointerUp={(e) => soltar({ linha: l, coluna: c }, e.currentTarget)}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-md text-[12px] sm:text-[13px] font-bold transition-colors cursor-pointer ${
                    achada
                      ? 'bg-good-soft text-good-ink'
                      : selecionada
                        ? 'bg-accent text-white'
                        : acesa
                          ? 'bg-warn text-white ring-2 ring-warn'
                          : pulsando
                            ? 'bg-accent-soft text-accent-ink ring-2 ring-accent babel-pulso'
                            /* O realce vem DEPOIS de achada/selecionada/dica na cadeia: ele é o
                               estado mais fraco e nunca deve encobrir um estado do jogo. */
                            : realcada
                              ? 'bg-warn-soft text-warn-ink ring-1 ring-warn/50'
                              : 'bg-surface text-ink hover:bg-surface-hover'
                  }`}
                  aria-label={`Letra ${letra}, linha ${l + 1}, coluna ${c + 1}${realcada ? ', destacada' : ''}`}
                >
                  {letra}
                </button>
              );
            })
          )}
        </div>

        {/* AS PISTAS — traduções, nunca as palavras. */}
        <aside data-tour="pistas" className="w-full lg:w-72 shrink-0 flex flex-col min-h-0">
          <p className="label-mono mb-2">
            {ageProfile === 'senior' ? 'Procure a palavra de:' : 'Ache a palavra que significa:'}
          </p>
          <ul className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar max-h-[60vh] pr-1">
            {jogaveis.map(i => {
              const achada = achados.has(i);
              const revelada = revelados.has(i);
              return (
                <li
                  key={i}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[13px] ${
                    achada ? 'bg-good-soft border-good/40 text-good-ink' : revelada ? 'bg-canvas border-border-subtle text-ink-faint' : 'bg-surface border-border-subtle text-ink'
                  }`}
                >
                  {/* Pista encurtada: a frase-com-lacuna vem de fala real e chegava a 150 caracteres
                      nesta coluna estreita. `shortPrompt` recorta a janela em torno da lacuna. */}
                  <span className="flex-1 min-w-0 leading-snug" title={items[i].prompt}>{shortPrompt(items[i].prompt, 52)}</span>
                  {achada && <Check className="w-4 h-4 shrink-0" aria-label="encontrada" />}
                  {/* A palavra aparece quando achada, revelada — ou raspada, que a mostra sem
                      encerrar o item (quem não lembra a palavra não tem como procurá-la). */}
                  {(achada || revelada || espiados.has(i)) && (
                    <span className={`font-bold shrink-0 ${espiados.has(i) && !achada && !revelada ? 'text-warn-ink' : ''}`}>
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
    </div>
  );
}
