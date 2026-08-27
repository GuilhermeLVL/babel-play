import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Delete, CornerDownLeft, Lightbulb, Volume2, WandSparkles, ChevronsUp } from 'lucide-react';
import type { ItemOutcome, RoundReport, RodadaTermo, Palpite } from '@core';
import {
  avaliarPalpite, acertou, estadoDoTecladoMulti, dicaDeLetra, letrasCertas,
  TENTATIVAS_POR_MODO, modoDeTabuleiros, montarEscada, planoDaEscada, scoreRound,
} from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar, pontosDoElemento, multiplicador } from '../../lib/juice';
import { speak } from '../../lib/tts';
import { toBcp47 } from '../../lib/languages';

/**
 * SOLETRAR — o jogo de escrever a palavra a partir do significado, em degraus.
 *
 * A ESCADA. Começa com um tabuleiro; acertou, o próximo degrau tem dois; acertou de novo, quatro.
 * Antes eram três cartas separadas no lobby (Termo, Dueto, Quarteto) e a pessoa tinha de escolher
 * a dificuldade ANTES de saber se dava conta — escolher difícil cedo frustra, escolher fácil
 * entedia, e nos dois casos ela refazia o mesmo caminho na carta seguinte. Aqui a dificuldade se
 * ajusta sozinha e o lobby fica com uma carta só.
 *
 * A MECÂNICA DOS DEGRAUS MÚLTIPLOS, como no jogo original: um palpite é avaliado em TODOS os
 * tabuleiros ainda abertos ao mesmo tempo. Fechar um deixa os outros de pé, e é isso que
 * transforma cada palpite numa decisão — gastar a jogada mirando qual palavra?
 *
 * As TENTATIVAS crescem com o degrau (6 · 7 · 9), também como no original. Com 4 palavras e 6
 * chances o jogo fica quase impossível, e jogo injusto não ensina, frustra.
 *
 * A ESCRITA NÃO É SÓ DA ESQUERDA PARA A DIREITA. Dá para clicar num quadrado, ou andar com as
 * setas, e escrever ali. Parece detalhe e não é: quando a pessoa já sabe que a terceira letra é
 * "R", o raciocínio dela é "R no meio, o que encaixa em volta?" — e uma caixa que só aceita
 * digitação em fila obriga a montar a palavra inteira de cabeça antes de poder escrever.
 */

interface TermoGameProps {
  rodadas: RodadaTermo[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const LINHAS_TECLADO = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export default function TermoGame({ rodadas, ageProfile, onFinish, onExit }: TermoGameProps) {
  /** Os degraus desta partida: 1 tabuleiro, depois 2, depois 4 — até onde as palavras derem. */
  const grupos = useMemo(() => montarEscada(rodadas, planoDaEscada(rodadas.length)), [rodadas]);

  const [grupoIdx, setGrupoIdx] = useState(0);
  const grupo = grupos[grupoIdx];
  const nTabuleiros = grupo?.length ?? 1;
  const maxTentativas = TENTATIVAS_POR_MODO[modoDeTabuleiros(nTabuleiros)];
  const tamanho = grupo?.[0]?.resposta.length ?? 5;

  const [palpitesPorTab, setPalpitesPorTab] = useState<Palpite[][]>([[]]);
  const [resolvidos, setResolvidos] = useState<boolean[]>([false]);
  /** A tentativa em construção, POR POSIÇÃO (e não uma string que só cresce no fim). */
  const [atual, setAtual] = useState<string[]>(() => Array(tamanho).fill(''));
  const [cursor, setCursor] = useState(0);
  const [tentativas, setTentativas] = useState(0);
  const [fimDoGrupo, setFimDoGrupo] = useState(false);
  const [reveladas, setReveladas] = useState<Record<number, Record<number, string>>>({});
  const [usouDica, setUsouDica] = useState(false);
  const [sequencia, setSequencia] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [subiuDegrau, setSubiuDegrau] = useState(false);

  const inicioGrupoRef = useRef(Date.now());
  const inicioTudoRef = useRef(Date.now());
  const resultadosRef = useRef<ItemOutcome[]>([]);
  const resolvidoEmRef = useRef<(number | null)[]>([null]);
  /** Fonte de verdade da digitação (ver o bloco "ESCRITA POR POSIÇÃO"). */
  const atualRef = useRef<string[]>([]);
  const cursorRef = useRef(0);
  /**
   * O cursor está onde a PESSOA o pôs (clique, setas, Home/End) ou onde ele parou sozinho?
   *
   * A distinção decide o que fazer com uma tecla a mais numa linha cheia. Se o cursor só parou ali
   * ao terminar a palavra, a tecla é sobra — repetição de tecla, dedo escapando — e sobrescrever a
   * última letra custaria uma tentativa em silêncio, num jogo em que elas são contadas. Se a
   * pessoa escolheu a casa, ela quer corrigir, e aí escrever por cima é exatamente o pedido.
   */
  const cursorEscolhidoRef = useRef(false);
  const encerradoRef = useRef(false);
  const gradeRef = useRef<HTMLDivElement | null>(null);

  const teclado = useMemo(() => estadoDoTecladoMulti(palpitesPorTab, resolvidos), [palpitesPorTab, resolvidos]);
  const preenchido = atual.every(l => l !== '');

  /**
   * A linha de partida de cada tentativa: já vem com o que a pessoa SABE — letras reveladas por
   * dica e letras que ficaram verdes. Antes isso era desenhado como "fantasma" fora de `atual`:
   * a linha parecia cheia, `preenchido` continuava falso e o Enter não confirmava. E ao enviar,
   * a limpeza apagava a dica que tinha sido paga.
   */
  const linhaInicial = (
    tam: number,
    palpites: Palpite[][] = palpitesPorTab,
    resolv: boolean[] = resolvidos,
    revel: Record<number, Record<number, string>> = reveladas,
  ): string[] => {
    const alvo = resolv.findIndex(r => !r);
    const linha = Array(tam).fill('');
    if (alvo < 0) return linha;
    const certas = letrasCertas(palpites[alvo] ?? [], tam);
    for (let i = 0; i < tam; i++) {
      const l = revel[alvo]?.[i] ?? certas[i] ?? '';
      if (l) linha[i] = l.toUpperCase();
    }
    return linha;
  };

  /** Reinicia o estado de digitação sempre que o degrau muda (o tamanho da palavra pode mudar). */
  const prepararDegrau = (n: number, tam: number) => {
    setPalpitesPorTab(Array.from({ length: n }, () => []));
    setResolvidos(Array(n).fill(false));
    atualRef.current = Array(tam).fill('');
    cursorRef.current = 0;
    cursorEscolhidoRef.current = false;
    setAtual(atualRef.current);
    setCursor(0);
    setTentativas(0);
    setReveladas({});
    setUsouDica(false);
    setFimDoGrupo(false);
    resolvidoEmRef.current = Array(n).fill(null);
    inicioGrupoRef.current = Date.now();
  };

  // Monta o primeiro degrau assim que as palavras chegam.
  useEffect(() => {
    if (grupos.length) prepararDegrau(grupos[0].length, grupos[0][0].resposta.length);
  }, [grupos]);

  const encerrarTudo = (todos: ItemOutcome[]) => {
    if (encerradoRef.current) return;
    encerradoRef.current = true;
    onFinish({
      gameId: 'termo',
      items: todos,
      score: scoreRound('termo', todos),
      durationMs: Date.now() - inicioTudoRef.current,
    });
  };

  /** Fecha o degrau, guarda os resultados e sobe (ou encerra, se não fechou tudo). */
  const fecharGrupo = (resolvidosFinais: boolean[], tentativasUsadas: number) => {
    setFimDoGrupo(true);
    const agora = Date.now();
    const doGrupo: ItemOutcome[] = grupo.map((r, i) => ({
      cardId: r.cardId,
      // A palavra CRUA, não a normalizada do teclado: o histórico precisa do mesmo valor que os
      // outros jogos gravam, senão "house" e "HOUSE" viram dois itens diferentes.
      itemRef: r.palavra,
      correct: resolvidosFinais[i],
      // A jogada em que ESTE tabuleiro fechou — não a do fim do degrau. Sem isso, quem acerta na
      // 2ª jogada seria agendado como se tivesse levado sete só porque o vizinho demorou.
      attempts: resolvidoEmRef.current[i] ?? tentativasUsadas,
      ms: agora - inicioGrupoRef.current,
      hinted: usouDica,
      revealed: !resolvidosFinais[i],
    }));
    resultadosRef.current = [...resultadosRef.current, ...doGrupo];

    const tudoCerto = resolvidosFinais.every(Boolean);
    const temProximo = tudoCerto && grupoIdx + 1 < grupos.length;

    // A escada só sobe com acerto — é a regra inteira do jogo, e a comemoração precisa dizer isso.
    if (temProximo) { setSubiuDegrau(true); comemorar('subiuNivel', gradeRef.current, { tremer: true }); }
    else if (tudoCerto) comemorar('rodadaPerfeita', gradeRef.current, { tremer: true });
    else comemorar('erro', gradeRef.current);

    // Pausa para LER o resultado antes de a tela trocar; maior quando errou, porque há o que ver.
    setTimeout(() => {
      if (!temProximo) { encerrarTudo(resultadosRef.current); return; }
      const proximo = grupos[grupoIdx + 1];
      setGrupoIdx(i => i + 1);
      setSubiuDegrau(false);
      prepararDegrau(proximo.length, proximo[0].resposta.length);
    }, tudoCerto ? 1500 : 2400);
  };

  const enviar = () => {
    if (fimDoGrupo || !grupo || !preenchido) return;
    const palpite = atual.join('');

    const novosPalpites = palpitesPorTab.map((lista, i) =>
      resolvidos[i] ? lista : [...lista, avaliarPalpite(palpite, grupo[i].resposta)]
    );
    const novosResolvidos = resolvidos.map((r, i) => r || acertou(novosPalpites[i][novosPalpites[i].length - 1]));
    const fechouAgora = novosResolvidos.filter((r, i) => r && !resolvidos[i]).length;
    const tentativasUsadas = tentativas + 1;
    novosResolvidos.forEach((r, i) => { if (r && !resolvidos[i]) resolvidoEmRef.current[i] = tentativasUsadas; });

    setPalpitesPorTab(novosPalpites);
    setResolvidos(novosResolvidos);
    setTentativas(tentativasUsadas);
    // A próxima tentativa já nasce com o que se sabe — inclusive a dica paga, que antes sumia.
    const proxima = linhaInicial(tamanho, novosPalpites, novosResolvidos, reveladas);
    cursorEscolhidoRef.current = false;   // linha nova, ninguém escolheu nada ainda
    escrever(proxima, proximaVaga(proxima, 0));

    if (fechouAgora > 0) {
      const nova = sequencia + fechouAgora;
      const mult = multiplicador(nova);
      // A dica cobra: os pontos vêm, mas sem o multiplicador em cima.
      const ganho = 10 * fechouAgora * (usouDica ? 1 : mult);
      setSequencia(nova);
      setPontos(p => p + ganho);
      comemorar(mult > 1 && !usouDica ? 'sequencia' : 'acerto', gradeRef.current, {
        texto: `+${ganho}${mult > 1 && !usouDica ? ` ×${mult}` : ''}`,
        tremer: mult >= 3,
      });
    } else {
      setSequencia(0);
      comemorar('erro', gradeRef.current);
    }

    if (novosResolvidos.every(Boolean) || tentativasUsadas >= maxTentativas) fecharGrupo(novosResolvidos, tentativasUsadas);
  };

  /* ─────────── ESCRITA POR POSIÇÃO ───────────
     O cursor anda sozinho para a próxima casa VAZIA, e não para a casa seguinte: quem já fixou a
     3ª e a 5ª letra quer que a digitação pule por cima delas em vez de sobrescrevê-las.

     A POSIÇÃO E O PALPITE VIVEM EM `ref`, e o estado só espelha para desenhar. O motivo é um
     defeito medido: lendo `cursor` do fecho do render, duas teclas no MESMO tique enxergavam a
     mesma posição antiga e as letras caíam embaralhadas, "SUPREMO" virava "SUP_O_M_". Com quem
     digita devagar isso não aparece (cada tecla é um render), mas repetição de tecla e teclado
     rápido caem exatamente nesse caso. */

  /**
   * A próxima casa vazia — ou, quando não há nenhuma, uma casa QUE EXISTE.
   *
   * O `return de` que estava aqui é o que travava o jogo. `de` chega como `pos + 1`, então com a
   * linha cheia e o cursor na última casa ele devolvia `tamanho` — um índice fora da linha.
   * `digitar` escrevia em `atual[tamanho]` e o array CRESCIA além do tabuleiro.
   *
   * A partir daí a tela e o estado discordavam: a grade desenha `resposta.length` casas e mostrava
   * a palavra completa, enquanto `preenchido` percorria uma casa a mais, invisível. Um backspace
   * esvaziava essa casa fantasma e o botão de enviar morria com a linha visivelmente cheia — sem
   * tecla nenhuma que a preenchesse à vista. Era o "fica preso e não consegue enviar".
   */
  const proximaVaga = (a: string[], de: number) => {
    for (let i = de; i < a.length; i++) if (!a[i]) return i;
    for (let i = 0; i < de; i++) if (!a[i]) return i;
    return Math.max(0, Math.min(de, a.length - 1));
  };

  const escrever = (a: string[], pos: number) => {
    atualRef.current = a;
    cursorRef.current = pos;
    setAtual(a);
    setCursor(pos);
  };

  const digitar = (letra: string) => {
    if (fimDoGrupo) return;
    const n = [...atualRef.current];
    // Segunda trava, no lugar onde o dano acontecia: escrever fora da linha é o que a fazia
    // crescer. Uma posição válida sempre existe — a linha nunca tem tamanho zero.
    const pos = Math.min(cursorRef.current, n.length - 1);
    if (pos < 0) return;
    // Linha cheia e cursor parado por conta própria: a tecla é sobra. Ignorar não perde nada —
    // para trocar uma letra, basta clicar nela ou apagar.
    if (n.every(l => l !== '') && !cursorEscolhidoRef.current) return;
    n[pos] = letra;
    escrever(n, proximaVaga(n, pos + 1));
  };

  const apagar = () => {
    if (fimDoGrupo) return;
    const n = [...atualRef.current];
    const pos = Math.max(0, Math.min(cursorRef.current, n.length - 1));
    if (n[pos]) { escrever(n.map((l, i) => (i === pos ? '' : l)), pos); return; }
    const anterior = Math.max(0, pos - 1);
    n[anterior] = '';
    escrever(n, anterior);
  };

  const irPara = (pos: number) => {
    cursorEscolhidoRef.current = true;   // daqui em diante, digitar é corrigir
    cursorRef.current = Math.max(0, Math.min(tamanho - 1, pos));
    setCursor(cursorRef.current);
  };

  /** Repõe o que já se sabe (útil depois de apagar). Não é dica: já foi conquistado. */
  const usarLetrasCertas = (el: HTMLElement | null) => {
    if (fimDoGrupo || !grupo) return;
    const base = linhaInicial(tamanho);
    if (!base.some(Boolean)) return;
    const n = atualRef.current.map((l, i) => base[i] || l);
    escrever(n, proximaVaga(n, 0));
    pontosDoElemento('letras certas', el, 'neutro');
  };

  /** DICA: revela uma letra de um tabuleiro ainda aberto. O preço é a nota (ver `gradeFor`). */
  const pedirDica = (el: HTMLElement | null) => {
    if (fimDoGrupo || !grupo) return;
    const alvo = resolvidos.findIndex(r => !r);
    if (alvo < 0) return;
    const d = dicaDeLetra(
      grupo[alvo].resposta,
      palpitesPorTab[alvo],
      Object.keys(reveladas[alvo] ?? {}).map(Number),
    );
    if (!d) return;
    const letra = d.letra.toUpperCase();
    setUsouDica(true);
    setSequencia(0); // a sequência é mérito; com ajuda ela recomeça
    setReveladas(prev => ({ ...prev, [alvo]: { ...(prev[alvo] ?? {}), [d.posicao]: letra } }));
    // Entra no palpite de verdade: é o que faz o Enter confirmar e a dica sobreviver ao envio.
    const n = [...atualRef.current];
    n[d.posicao] = letra;
    escrever(n, proximaVaga(n, d.posicao + 1));
    pontosDoElemento(`letra ${d.posicao + 1}`, el, 'neutro');
  };

  /** Ouvir a palavra — dica sonora que, de quebra, liga a grafia ao som. */
  const ouvirPalavra = () => {
    if (!grupo) return;
    const alvo = resolvidos.findIndex(r => !r);
    if (alvo < 0) return;
    setUsouDica(true);
    speak(grupo[alvo].resposta, { lang: toBcp47(grupo[alvo].lang || 'en') });
  };

  // Sem lista de dependências de propósito: o ouvinte é reinstalado a cada render para que
  // `enviar` enxergue o palpite DESTA render. Uma versão memoizada leria o estado antigo — foi
  // exatamente esse bug que fez o envio automático falhar em silêncio antes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      /**
       * `preventDefault` no Enter/Espaço não é detalhe: um botão que ficou com FOCO depois do
       * clique (a lâmpada, uma tecla do teclado na tela) recebe um clique sintético do navegador
       * a cada Enter. Sem isto, pedir uma dica e apertar Enter pedia OUTRA dica junto com o envio
       * — medido: um clique na lâmpada revelava duas letras.
       */
      const foco = document.activeElement as HTMLElement | null;
      if (foco?.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        foco.blur();
      }
      if (e.key === 'Enter') { enviar(); return; }
      if (e.key === ' ') return;
      if (e.key === 'Backspace') { e.preventDefault(); apagar(); return; }
      if (e.key === 'ArrowLeft') { irPara(cursorRef.current - 1); return; }
      if (e.key === 'ArrowRight') { irPara(cursorRef.current + 1); return; }
      if (e.key === 'Home') { irPara(0); return; }
      if (e.key === 'End') { irPara(tamanho - 1); return; }
      const l = e.key.toUpperCase();
      if (/^[A-Z]$/.test(l)) digitar(l);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!grupo) return null;

  const cor = (estado?: string) =>
    estado === 'certa' ? 'bg-good text-white border-good'
    : estado === 'existe' ? 'bg-warn text-white border-warn'
    : estado === 'ausente' ? 'bg-canvas text-ink-faint border-border-subtle'
    : 'bg-surface text-ink border-border-subtle';

  // O nome do degrau acompanha o da carta no lobby: ver "Termo" depois de clicar em "Escrever a
  // palavra" faz a pessoa achar que entrou noutro lugar.
  const modo = modoDeTabuleiros(nTabuleiros);
  const nomeDoDegrau = modo === 'termo'
    ? (ageProfile === 'kids' ? 'Escreva a palavra' : ageProfile === 'senior' ? 'Escrever a palavra' : 'Termo')
    : modo === 'dueto'
      ? (ageProfile === 'pro' ? 'Dueto' : 'Duas de uma vez')
      : (ageProfile === 'pro' ? 'Quarteto' : 'Quatro de uma vez');

  // A célula encolhe conforme o número de tabuleiros: quatro grades de 48px não cabem num celular.
  const cel = nTabuleiros === 1 ? 'w-11 h-11 sm:w-12 sm:h-12 text-lg'
    : nTabuleiros === 2 ? 'w-9 h-9 sm:w-10 sm:h-10 text-sm'
    : 'w-7 h-7 sm:w-8 sm:h-8 text-xs';

  const mult = multiplicador(sequencia);

  return (
    <div className="flex-1 relative flex flex-col items-center p-3 sm:p-4 animate-in fade-in duration-200 overflow-y-auto custom-scrollbar">
      {/* AS FERRAMENTAS moram no canto da TELA, não numa faixa junto ao título.
          Num cabeçalho de largura fixa, o título ficava colado à esquerda enquanto o tabuleiro
          (bem mais estreito) ficava no meio, dois blocos desalinhados sem motivo. Soltas no
          canto, elas ficam sempre no mesmo lugar, com 1, 2 ou 4 tabuleiros. */}
      <span className="absolute top-3 right-3 z-20 flex items-center gap-0.5">
        <button data-tour="varinha" onClick={(e) => usarLetrasCertas(e.currentTarget)} disabled={fimDoGrupo} className="p-2 rounded-lg text-ink-muted hover:text-good-ink hover:bg-surface-hover disabled:opacity-40 cursor-pointer" title="Preencher as letras que você já descobriu (não conta como dica)" aria-label="Preencher letras já descobertas">
          <WandSparkles className="w-4 h-4" />
        </button>
        <button onClick={ouvirPalavra} disabled={fimDoGrupo} className="p-2 rounded-lg text-ink-muted hover:text-accent hover:bg-surface-hover disabled:opacity-40 cursor-pointer" title="Ouvir a palavra (conta como dica)" aria-label="Ouvir a palavra">
          <Volume2 className="w-4 h-4" />
        </button>
        <button onClick={(e) => pedirDica(e.currentTarget)} disabled={fimDoGrupo} className="p-2 rounded-lg text-ink-muted hover:text-warn-ink hover:bg-surface-hover disabled:opacity-40 cursor-pointer" title="Revelar uma letra (conta como dica)" aria-label="Pedir dica">
          <Lightbulb className="w-4 h-4" />
        </button>
        <button onClick={onExit} className="p-2 rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink cursor-pointer" aria-label="Sair do jogo">
          <X className="w-5 h-5" />
        </button>
      </span>

      {/* `m-auto` e não `justify-center`: num container rolável, centralizar por `justify`
          impede a rolagem para o começo quando o conteúdo passa da altura da janela. */}
      <div className="m-auto w-full flex flex-col items-center">
      <header className="flex flex-col items-center mb-3 shrink-0 text-center">
        <h2 className="font-display font-black text-lg text-ink flex items-center gap-2">
          {nomeDoDegrau}
          {/* A escada precisa ser VISÍVEL, senão subir de degrau parece o jogo mudando sozinho. */}
          {grupos.length > 1 && (
            <span className="flex items-end gap-1" aria-label={`degrau ${grupoIdx + 1} de ${grupos.length}`}>
              {grupos.map((g, i) => (
                <span
                  key={i}
                  title={`${g.length} ${g.length === 1 ? 'palavra' : 'palavras'}`}
                  className={`w-1.5 rounded-full transition-all ${
                    i < grupoIdx ? 'h-3 bg-good' : i === grupoIdx ? 'h-4 bg-accent' : 'h-2 bg-border-subtle'
                  }`}
                />
              ))}
            </span>
          )}
        </h2>
        <p className="text-[12px] text-ink-muted">
          tentativa {Math.min(tentativas + 1, maxTentativas)}/{maxTentativas}
          {pontos > 0 && <span className="text-accent-ink font-bold"> · {pontos} pts</span>}
          {mult > 1 && <span className="text-warn-ink font-bold"> · ×{mult}</span>}
        </p>
      </header>

      {subiuDegrau && (
        <p className="flex items-center gap-1.5 text-[13px] font-black text-good-ink mb-2 animate-in fade-in zoom-in">
          <ChevronsUp className="w-4 h-4" aria-hidden />
          {grupos[grupoIdx + 1]?.length === 2 ? 'Subiu! Agora são duas ao mesmo tempo' : 'Subiu! Agora são quatro ao mesmo tempo'}
        </p>
      )}

      {/* OS TABULEIROS — cada um com A SUA pista logo acima.
          As pistas já moraram num bloco separado no topo, e com quatro tabuleiros ninguém sabia
          qual pista era de qual grade: era preciso contar posições. Colada ao tabuleiro, a
          correspondência não precisa ser explicada.
          No Quarteto, quatro colunas quando a tela permite, empilhado 2×2 metade das grades fica
          fora da tela, e num jogo em que o palpite vale para todas, não ver metade é perder a jogada. */}
      <div ref={gradeRef} data-tour="tabuleiro" className={`grid w-full max-w-6xl gap-x-4 sm:gap-x-10 xl:gap-x-16 gap-y-4 mb-4 justify-items-center ${
        nTabuleiros === 4 ? 'grid-cols-2 xl:grid-cols-4' : nTabuleiros === 2 ? 'grid-cols-2' : 'grid-cols-1'
      }`}>
        {grupo.map((r, tIdx) => {
          const certas = letrasCertas(palpitesPorTab[tIdx] ?? [], r.resposta.length);
          return (
            <div key={tIdx} className={`flex flex-col gap-1 transition-opacity ${resolvidos[tIdx] ? 'opacity-45' : ''}`}>
              <p
                data-tour={tIdx === 0 ? 'pista' : undefined}
                className={`text-center text-[13px] leading-tight px-2 py-1.5 mb-1 rounded-lg transition-colors ${
                  resolvidos[tIdx] ? 'bg-good-soft text-good-ink font-black tracking-wide'
                  : fimDoGrupo ? 'bg-error-soft text-error-ink font-black tracking-wide'
                  : 'text-accent-ink font-extrabold'
                }`}
              >
                {resolvidos[tIdx] || fimDoGrupo ? r.resposta : r.pista || '?'}
              </p>
              {Array.from({ length: maxTentativas }).map((_, linha) => {
                const p = (palpitesPorTab[tIdx] ?? [])[linha];
                const digitando = !resolvidos[tIdx] && !fimDoGrupo && linha === (palpitesPorTab[tIdx] ?? []).length;
                return (
                  <div key={linha} className="flex gap-1 justify-center">
                    {Array.from({ length: r.resposta.length }).map((_, col) => {
                      const revelada = reveladas[tIdx]?.[col];
                      const letra = p ? p.letras[col] : digitando ? atual[col] : '';
                      const estado = p?.estados[col];
                      const noCursor = digitando && col === cursor;
                      // Só marca de onde a letra veio; ela já está no palpite (ver `linhaInicial`).
                      const ehFantasma = digitando && !!letra && (!!revelada || !!certas[col]);
                      return (
                        <button
                          key={col}
                          type="button"
                          tabIndex={digitando ? 0 : -1}
                          disabled={!digitando}
                          onClick={() => irPara(col)}
                          aria-label={digitando ? `Posição ${col + 1}${atual[col] ? `, letra ${atual[col]}` : ', vazia'}` : undefined}
                          className={`${cel} rounded-lg border-2 flex items-center justify-center font-display font-black transition-all ${cor(estado)} ${
                            digitando ? 'cursor-pointer' : ''
                          } ${noCursor ? 'border-accent ring-2 ring-accent/40 scale-105' : ''} ${
                            ehFantasma ? (revelada ? 'text-warn-ink' : 'text-ink-muted') : ''
                          }`}
                        >
                          {letra}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      </div>

      {/* TECLADO — o estado vem só dos tabuleiros ainda abertos (ver `estadoDoTecladoMulti`).
          GRUDADO NO PÉ DA TELA: com quatro tabuleiros de nove linhas o conteúdo passa da altura
          da janela, e um teclado que rola para fora deixa o jogo sem entrada. */}
      <div data-tour="teclado" className="flex flex-col gap-1.5 w-full max-w-xl sticky bottom-0 pt-2 pb-1 bg-canvas/95 backdrop-blur-sm z-10">
        {LINHAS_TECLADO.map((linha, i) => (
          <div key={linha} className="flex gap-1 justify-center">
            {i === 2 && (
              <button onClick={enviar} disabled={!preenchido || fimDoGrupo} className="px-2.5 h-11 rounded-lg bg-accent text-white font-bold text-[11px] flex items-center gap-1 disabled:opacity-40 cursor-pointer" aria-label="Enviar palpite">
                <CornerDownLeft className="w-3.5 h-3.5" />
              </button>
            )}
            {linha.split('').map(letra => (
              <button
                key={letra}
                onClick={() => digitar(letra)}
                className={`flex-1 min-w-0 h-11 rounded-lg border font-bold text-[13px] transition-colors cursor-pointer ${cor(teclado[letra])}`}
              >
                {letra}
              </button>
            ))}
            {i === 2 && (
              <button onClick={apagar} className="px-2.5 h-11 rounded-lg bg-canvas border border-border-subtle text-ink cursor-pointer" aria-label="Apagar letra">
                <Delete className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        <p className="text-[10px] text-ink-faint text-center">
          {ageProfile === 'senior'
            ? 'Toque num quadrado para escrever nele.'
            : 'Clique num quadrado (ou use ← →) para escrever fora de ordem.'}
        </p>
      </div>
    </div>
  );
}
