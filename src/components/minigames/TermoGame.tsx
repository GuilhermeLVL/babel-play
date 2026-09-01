import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X, Delete, CornerDownLeft, Lightbulb, Volume2, WandSparkles, ChevronsUp } from 'lucide-react';
import type { ItemOutcome, RoundReport, RodadaTermo, Palpite } from '@core';
import {
  julgarPalpite, acertou, estadoDoTecladoMulti, dicaDeLetra, letrasCertas,
  TENTATIVAS_POR_MODO, modoDeTabuleiros, montarEscada, planoDaEscada, scoreRound,
  layoutDoTermo, GAP_TABULEIRO, type LayoutDoTermo,
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

  const colunas = grupo?.[0]?.resposta.length ?? 5;
  const temContexto = !!grupo?.some(r => !!r.contexto);
  const [layout, setLayout] = useState<LayoutDoTermo>({ celula: 44, porFileira: nTabuleiros, moldura: 0, apertado: false });

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    const grade = gradeRef.current;
    if (!raiz || !grade) return;
    const medir = () => {
      const cabecalhoDaTela = raiz.querySelector('header')?.clientHeight ?? 0;
      const teclado = raiz.querySelector<HTMLElement>('[data-tour="teclado"]')?.offsetHeight ?? 0;
      setLayout(layoutDoTermo({
        largura: grade.clientWidth,
        altura: raiz.clientHeight - cabecalhoDaTela - teclado - 24,
        tabuleiros: nTabuleiros,
        colunas,
        linhas: maxTentativas,
        // A pista mora acima de cada tabuleiro; com frase de contexto ela ocupa duas vezes mais.
        cabecalho: temContexto ? 88 : 44,
      }));
      /* A MOLDURA VEM DA CONTA, não de uma classe. Se o padding vivesse só no CSS, ele cobraria
         uma largura que o cálculo não conhece — que é precisamente como os quatro tabuleiros se
         colaram da primeira vez. Aqui quem desenha aplica o número que quem calcula usou. */
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(raiz);
    window.addEventListener('resize', medir);
    return () => { ro.disconnect(); window.removeEventListener('resize', medir); };
  }, [nTabuleiros, colunas, maxTentativas, temContexto]);

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
  /* TERMO JUSTO: a dica é POR TABULEIRO (uma lâmpada no 1º não rebaixa os outros três), o "quase"
     vale uma vez por tabuleiro, e o aviso de sinônimo/quase aparece acima da grade. */
  const [dicaPorTab, setDicaPorTab] = useState<boolean[]>([false]);
  const [quaseUsado, setQuaseUsado] = useState<boolean[]>([false]);
  const [aviso, setAviso] = useState<string | null>(null);
  const resolvidoEmTsRef = useRef<(number | null)[]>([null]);
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
  /** A tela do jogo inteira — é dela que sai o orçamento de altura (ver `medirLayout`). */
  const raizRef = useRef<HTMLDivElement | null>(null);

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
    setDicaPorTab(Array(n).fill(false));
    setQuaseUsado(Array(n).fill(false));
    setAviso(null);
    setFimDoGrupo(false);
    resolvidoEmRef.current = Array(n).fill(null);
    resolvidoEmTsRef.current = Array(n).fill(null);
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
      // Tempo DESTE tabuleiro (até fechar), não do degrau inteiro: senão o quarteto nunca ganha
      // o bônus de velocidade e um tabuleiro rápido paga pelo vizinho lento.
      ms: (resolvidoEmTsRef.current[i] ?? agora) - inicioGrupoRef.current,
      // Dica POR tabuleiro: só quem recebeu letra revelada tem a nota limitada.
      hinted: dicaPorTab[i] ?? false,
      /* Acabar as tentativas NÃO é "revelou": `revealed` é o gesto voluntário de desistir. Antes
         os dois eram iguais e a derrota honesta era gravada como entrega — nota 1 dos dois jeitos,
         mas o histórico mentia sobre o que aconteceu. */
      revealed: false,
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

    /* JULGAMENTO CONTRA A RODADA (sinônimos e "quase"), não só contra a resposta. Se algum
       tabuleiro aberto reconhece o palpite como sinônimo válido, ou como "quase" na última
       tentativa, a jogada é DE GRAÇA: avisa, orienta, revela a 1ª letra (no sinônimo) e não
       gasta tentativa. Errar de vocabulário é diferente de errar de digitação ou de acertar
       outra palavra com o mesmo sentido. */
    const ultima = tentativas + 1 >= maxTentativas;
    const julgamentos = grupo.map((r, i) => (resolvidos[i] ? null : julgarPalpite(palpite, r, { ultimaTentativa: ultima, quaseJaUsado: quaseUsado[i] })));
    const gratis = julgamentos.find(j => j && !j.acertou && (j.sinonimo || j.quase));
    if (gratis) {
      const i = julgamentos.indexOf(gratis);
      setAviso(gratis.dica ?? null);
      if (gratis.sinonimo) {
        const primeira = grupo[i].resposta[0];
        setReveladas(prev => ({ ...prev, [i]: { ...(prev[i] ?? {}), 0: primeira } }));
      }
      if (gratis.quase) setQuaseUsado(q => q.map((v, k) => (k === i ? true : v)));
      comemorar('acerto', gradeRef.current, { texto: gratis.sinonimo ? 'sinônimo!' : 'quase!' });
      const proxima = linhaInicial(tamanho, palpitesPorTab, resolvidos, gratis.sinonimo ? { ...reveladas, [i]: { ...(reveladas[i] ?? {}), 0: grupo[i].resposta[0] } } : reveladas);
      cursorEscolhidoRef.current = false;
      escrever(proxima, proximaVaga(proxima, 0));
      return;
    }
    setAviso(null);

    const novosPalpites = palpitesPorTab.map((lista, i) =>
      resolvidos[i] ? lista : [...lista, julgamentos[i]!.palpite]
    );
    const novosResolvidos = resolvidos.map((r, i) => r || acertou(novosPalpites[i][novosPalpites[i].length - 1]));
    const fechouAgora = novosResolvidos.filter((r, i) => r && !resolvidos[i]).length;
    const tentativasUsadas = tentativas + 1;
    novosResolvidos.forEach((r, i) => { if (r && !resolvidos[i]) { resolvidoEmRef.current[i] = tentativasUsadas; resolvidoEmTsRef.current[i] = Date.now(); } });

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
    setDicaPorTab(v => v.map((x, k) => (k === alvo ? true : x)));
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
    // Ouvir NÃO é dica: não revela letra nenhuma, e ligar grafia ao som é o objetivo do jogo.
    speak(grupo[alvo].palavra || grupo[alvo].resposta, { lang: toBcp47(grupo[alvo].lang || 'en') });
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

  /**
   * A CÉLULA É MEDIDA, NÃO ESTIMADA — e a diferença é o Quarteto parar de se colar.
   *
   * A versão anterior era CSS puro: `min(clamp(1.75rem, 4.8vh, 3rem), calc((100vw - 8rem) / 38))`.
   * Media (zoom 1.15, viewport 1920, container `max-w-6xl` = 1152): célula de 49,3px, quatro
   * tabuleiros de seis letras somando 1447px, estouro de 151px. Na tela, os quatro colados — as
   * folgas são a primeira coisa que o navegador come quando o conteúdo não cabe.
   *
   * Duas causas, independentes:
   *  1. o orçamento vinha de `100vw` (1920) enquanto a grade é limitada a `max-w-6xl` (1152) —
   *     quanto maior o monitor, pior, que é o contrário do esperado;
   *  2. `vw`/`vh` dentro de `body{zoom}` (o A±) resolvem contra a viewport SEM zoom e só depois
   *     são multiplicados por ele: a 1,15, saem 15% maiores que a viewport de verdade. (`rem`
   *     escala junto com o zoom e não tem esse problema — o que quebra é misturar as duas
   *     famílias na mesma conta, que é o que `min(clamp(rem, vh, rem), calc(vw...))` fazia.)
   *
   * `clientWidth`/`offsetHeight` já vêm no espaço de layout zoomado, então a conta feita com eles
   * é invariante ao zoom por construção — não há fator a corrigir em lugar nenhum. A regra mora
   * em `@core/minigames/termoLayout`, pura, com varredura de 7 telas × 5 zooms em teste.
   *
   * O observador olha a RAIZ, nunca a grade: a altura da grade depende da célula, e observar
   * quem se mede seria um laço. A raiz é dimensionada pela janela, e muda quando o A± muda —
   * que é exatamente quando esta conta precisa rodar de novo.
   */
  const estiloCel: React.CSSProperties = {
    width: layout.celula, height: layout.celula, fontSize: Math.round(layout.celula * 0.46),
  };

  const mult = multiplicador(sequencia);

  return (
    <div ref={raizRef} className="flex-1 relative flex flex-col items-center p-3 sm:p-4 animate-in fade-in duration-200 overflow-y-auto custom-scrollbar">
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

      {/* UM BLOCO SÓ (título + tabuleiros + teclado), centrado com `my-auto`: antes o teclado
          ficava grudado no pé da tela e os tabuleiros centrados sozinhos no meio — dois blocos
          com um vazio entre eles. `my-auto` e não `justify-center`: num container rolável,
          centralizar por `justify` impede a rolagem para o começo quando o conteúdo passa da
          altura da janela. */}
      <div className="my-auto w-full flex flex-col items-center gap-1 py-2">
      <header className="flex flex-col items-center mb-2 shrink-0 text-center">
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
      <div
        ref={gradeRef}
        data-tour="tabuleiro"
        /* `overflow-x-auto` SÓ quando a conta declarou aperto (celular + zoom alto + quarteto).
           Rolar de lado é degradação honesta; colar os tabuleiros é defeito. */
        className={`w-full max-w-6xl mb-2 ${layout.apertado ? 'overflow-x-auto custom-scrollbar' : ''}`}
      >
        <div
          className="grid mx-auto w-max justify-items-center"
          style={{
            gridTemplateColumns: `repeat(${layout.porFileira}, max-content)`,
            columnGap: GAP_TABULEIRO,
            rowGap: GAP_TABULEIRO,
          }}
        >
        {grupo.map((r, tIdx) => {
          const certas = letrasCertas(palpitesPorTab[tIdx] ?? [], r.resposta.length);
          return (
            /* CADA TABULEIRO NUM CARTÃO quando há mais de um. A folga sozinha é ambígua: entre
               quadrados da mesma palavra há 6px, entre tabuleiros 28px, e a olho nu 28px ainda
               pode ser lido como "espaço um pouco maior" em vez de "outra palavra". A borda
               resolve a ambiguidade sem depender de o olho comparar distâncias. */
            <div
              key={tIdx}
              className={`flex flex-col gap-1.5 transition-opacity ${resolvidos[tIdx] ? 'opacity-45' : ''} ${
                layout.moldura ? 'rounded-2xl border border-border-subtle bg-canvas/40' : ''
              }`}
              style={layout.moldura ? { padding: layout.moldura / 2 - 1 } : undefined}
            >
              <p
                data-tour={tIdx === 0 ? 'pista' : undefined}
                className={`text-center text-[13px] leading-tight px-2 py-1.5 mb-1 rounded-lg transition-colors ${
                  resolvidos[tIdx] ? 'bg-good-soft text-good-ink font-black tracking-wide'
                  : fimDoGrupo ? 'bg-error-soft text-error-ink font-black tracking-wide'
                  : 'text-accent-ink font-extrabold'
                }`}
              >
                {resolvidos[tIdx] || fimDoGrupo ? (r.palavra || r.resposta).toUpperCase() : r.pista || '?'}
              </p>
              {/* Pista AMBÍGUA (há sinônimos no acervo): a frase de contexto desempata. */}
              {!resolvidos[tIdx] && !fimDoGrupo && r.contexto && (
                <p className="text-center text-[11.5px] italic text-ink-muted px-2 -mt-1 mb-1 max-w-[36ch] mx-auto leading-snug">“{r.contexto}”</p>
              )}
              {tIdx === 0 && aviso && !fimDoGrupo && (
                <p role="status" className="text-center text-[12px] font-semibold text-warn-ink bg-warn-soft border border-warn/30 rounded-lg px-2 py-1 mb-1 max-w-[40ch] mx-auto leading-snug">{aviso}</p>
              )}
              {Array.from({ length: maxTentativas }).map((_, linha) => {
                const p = (palpitesPorTab[tIdx] ?? [])[linha];
                const digitando = !resolvidos[tIdx] && !fimDoGrupo && linha === (palpitesPorTab[tIdx] ?? []).length;
                return (
                  <div key={linha} className="flex gap-1.5 justify-center">
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
                          style={estiloCel}
                          className={`rounded-lg border-2 flex items-center justify-center font-display font-black transition-all ${cor(estado)} ${
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
          Logo abaixo dos tabuleiros, no mesmo bloco centrado; `sticky bottom-0` só entra em ação
          quando o conteúdo passa da altura da janela (quarteto no celular), para o teclado nunca
          rolar para fora e deixar o jogo sem entrada. Teclas maiores: o alvo era 44px num
          monitor onde cabiam 56. */}
      <div data-tour="teclado" className="flex flex-col gap-1.5 w-full max-w-2xl sticky bottom-0 pt-3 pb-1 bg-canvas/95 backdrop-blur-sm z-10">
        {LINHAS_TECLADO.map((linha, i) => (
          <div key={linha} className="flex gap-1 sm:gap-1.5 justify-center">
            {i === 2 && (
              <button onClick={enviar} disabled={!preenchido || fimDoGrupo} className="px-3 sm:px-4 h-11 sm:h-14 rounded-lg bg-accent text-white font-bold text-[11px] flex items-center gap-1 disabled:opacity-40 cursor-pointer" aria-label="Enviar palpite">
                <CornerDownLeft className="w-4 h-4" />
              </button>
            )}
            {linha.split('').map(letra => (
              <button
                key={letra}
                onClick={() => digitar(letra)}
                className={`flex-1 min-w-0 h-11 sm:h-14 rounded-lg border font-bold text-sm sm:text-base transition-colors cursor-pointer ${cor(teclado[letra])}`}
              >
                {letra}
              </button>
            ))}
            {i === 2 && (
              <button onClick={apagar} className="px-3 sm:px-4 h-11 sm:h-14 rounded-lg bg-canvas border border-border-subtle text-ink cursor-pointer" aria-label="Apagar letra">
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
    </div>
  );
}
