import type { ItemOutcome, Palpite, RodadaTermo, RoundReport } from '@core';
import {
  acertou,
  dicaDeLetra,
  estadoDoTeclado,
  type EstadoLetra,
  GEOMETRIA_DO_PROTOTIPO,
  julgarPalpite,
  type LayoutDoTermo,
  layoutDoTermo,
  letrasCertas,
  modoDeTabuleiros,
  montarEscada,
  planoDaEscada,
  scoreRound,
  TENTATIVAS_POR_MODO,
} from '@core';
import { Check, ChevronRight, Delete, Lightbulb, Volume2, WandSparkles } from 'lucide-react';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { playJuicedError, playJuicedHit, playJuicedVictory, triggerHaptic } from '../../lib/gameFeel';
import { multiplicador, pontosDoElemento } from '../../lib/juice';
import { toBcp47 } from '../../lib/languages';
import type { AgeProfileType } from '../../lib/profile';
import { speak } from '../../lib/tts';
import { toast } from '../Toast';
import { useRodada } from './casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda } from './casca/HudDaRodada';

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

export default function TermoGame({ rodadas, ageProfile, onFinish }: TermoGameProps) {
  /** A casca diz quando a rodada anda: na contagem e na pausa o teclado não escreve. */
  const { ativo } = useRodada();
  /** Tabuleiros fechados na rodada inteira (a pausa mostra "N acertos"). */
  const [acertos, setAcertos] = useState(0);
  /**
   * A ALTURA DO PALCO. Em tela cheia a raiz media a janela; dentro da casca comum ela é uma tela
   * como as outras, então o orçamento é o que sobra da janela abaixo do topo da raiz (a mesma
   * conta do `ajustarTermo` do protótipo: altura da rolagem − topo − margens). No celular sai
   * também a barra de navegação de baixo.
   */
  const [alturaDaRaiz, setAlturaDaRaiz] = useState<number | undefined>(undefined);
  /** Os degraus desta partida: 1 tabuleiro, depois 2, depois 4 — até onde as palavras derem. */
  const grupos = useMemo(() => montarEscada(rodadas, planoDaEscada(rodadas.length)), [rodadas]);

  const [grupoIdx, setGrupoIdx] = useState(0);
  const grupo = grupos[grupoIdx];
  const nTabuleiros = grupo?.length ?? 1;
  const maxTentativas = TENTATIVAS_POR_MODO[modoDeTabuleiros(nTabuleiros)];

  const colunas = grupo?.[0]?.resposta.length ?? 5;
  const temContexto = !!grupo?.some((r) => !!r.contexto);
  const [layout, setLayout] = useState<LayoutDoTermo>({
    celula: 44,
    porFileira: nTabuleiros,
    moldura: 0,
    apertado: false,
  });

  useLayoutEffect(() => {
    const medirRaiz = () => {
      const r = raizRef.current;
      if (!r) return;
      const topo = r.getBoundingClientRect().top;
      const celular = window.innerWidth < 768;
      const embaixo = celular ? 96 : 40;
      /* No celular o topo (cabeçalho + placar com as ajudas) come metade da janela: com um piso
         menor o teclado ficaria rolado para dentro do palco. Aí a PÁGINA rola, e o piso garante
         tabuleiro e teclado inteiros. */
      setAlturaDaRaiz(Math.max(celular ? 600 : 420, Math.round(window.innerHeight - topo - embaixo)));
    };
    medirRaiz();
    // a entrada de câmera escala o palco por meio segundo: mede de novo quando ela assenta
    const t = window.setTimeout(medirRaiz, 620);
    window.addEventListener('resize', medirRaiz);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', medirRaiz);
    };
  }, []);

  useLayoutEffect(() => {
    const raiz = raizRef.current;
    const grade = gradeRef.current;
    if (!raiz || !grade) return;
    const medir = () => {
      setLayout(
        layoutDoTermo(
          {
            largura: grade.clientWidth,
            /* MEDIDO, NÃO DEDUZIDO. Antes era `raiz.clientHeight - cabeçalho - teclado - 24`, e a
           dedução esquecia tudo que mora entre eles (mensagens de acerto, avisos, margens): a
           grade começava 88px abaixo do que a conta supunha. A área rolável É o orçamento. */
            /* O teclado mora na mesma área, logo abaixo dos tabuleiros: sai do orçamento a altura
           MEDIDA dele e os 16px de margem de `.tabs-termo`. */
            altura: (areaRef.current?.clientHeight ?? 0) - (tecladoRef.current?.offsetHeight ?? 0) - 16,
            tabuleiros: nTabuleiros,
            colunas,
            linhas: maxTentativas,
            /* O `header` de cada `.tab-termo` (24px + 6 de folga); com a frase de contexto embaixo
           da pista, mais uma linha e meia. */
            cabecalho: temContexto ? 64 : 30,
          },
          GEOMETRIA_DO_PROTOTIPO,
        ),
      );
      /* A MOLDURA VEM DA CONTA, não de uma classe. Se o padding vivesse só no CSS, ele cobraria
         uma largura que o cálculo não conhece — que é precisamente como os quatro tabuleiros se
         colaram da primeira vez. Aqui quem desenha aplica o número que quem calcula usou. */
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(raiz);
    if (areaRef.current) ro.observe(areaRef.current);
    window.addEventListener('resize', medir);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', medir);
    };
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
  /** A linha em digitação treme quando o Enter chega com casa vazia (como no protótipo). */
  const [treme, setTreme] = useState(false);
  /** A casa que acabou de receber letra — ganha o "pop" do protótipo. */
  const [pop, setPop] = useState(-1);
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
  /** A área que rola — a altura DELA é o orçamento do tabuleiro, sem dedução nenhuma. */
  const areaRef = useRef<HTMLDivElement | null>(null);
  /** O teclado — a altura dele sai do orçamento da área (ver `medir`). */
  const tecladoRef = useRef<HTMLDivElement | null>(null);

  /* O teclado do protótipo marca a letra POR TABULEIRO (`teclasPorTab`): com um só, a tecla pinta
     inteira; com dois ou quatro, cada tecla ganha uma marquinha por tabuleiro. */
  const tecladoPorTab = useMemo(() => palpitesPorTab.map((p) => estadoDoTeclado(p)), [palpitesPorTab]);
  const preenchido = atual.every((l) => l !== '');

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
    const alvo = resolv.findIndex((r) => !r);
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
    setPop(-1);
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
    if (temProximo) {
      setSubiuDegrau(true);
      playJuicedVictory();
    } else if (tudoCerto) {
      playJuicedVictory();
    } else {
      playJuicedError(gradeRef.current, undefined);
    }

    // Pausa para LER o resultado antes de a tela trocar; maior quando errou, porque há o que ver.
    setTimeout(
      () => {
        if (!temProximo) {
          encerrarTudo(resultadosRef.current);
          return;
        }
        const proximo = grupos[grupoIdx + 1];
        setGrupoIdx((i) => i + 1);
        setSubiuDegrau(false);
        prepararDegrau(proximo.length, proximo[0].resposta.length);
      },
      tudoCerto ? 1500 : 2400,
    );
  };

  const enviar = () => {
    if (fimDoGrupo || !grupo) return;
    if (!preenchido) {
      // Casa vazia: a linha treme e o aviso diz o tamanho (o protótipo faz igual).
      setTreme(false);
      requestAnimationFrame(() => setTreme(true));
      setTimeout(() => setTreme(false), 450);
      toast.warn(`A palavra tem ${tamanho} letras`);
      return;
    }
    const palpite = atual.join('');

    /* JULGAMENTO CONTRA A RODADA (sinônimos e "quase"), não só contra a resposta. */
    const ultima = tentativas + 1 >= maxTentativas;
    const julgamentos = grupo.map((r, i) =>
      resolvidos[i] ? null : julgarPalpite(palpite, r, { ultimaTentativa: ultima, quaseJaUsado: quaseUsado[i] }),
    );
    const gratis = julgamentos.find((j) => j && !j.acertou && (j.sinonimo || j.quase));
    if (gratis) {
      const i = julgamentos.indexOf(gratis);
      // O aviso de sinônimo/quase sai no toast, como os avisos do protótipo.
      if (gratis.dica) toast.info(gratis.dica);
      if (gratis.sinonimo) {
        const primeira = grupo[i].resposta[0];
        setReveladas((prev) => ({ ...prev, [i]: { ...(prev[i] ?? {}), 0: primeira } }));
      }
      if (gratis.quase) setQuaseUsado((q) => q.map((v, k) => (k === i ? true : v)));
      playJuicedHit(1, undefined, gratis.sinonimo ? 'sinônimo!' : 'quase!');
      const proxima = linhaInicial(
        tamanho,
        palpitesPorTab,
        resolvidos,
        gratis.sinonimo ? { ...reveladas, [i]: { ...(reveladas[i] ?? {}), 0: grupo[i].resposta[0] } } : reveladas,
      );
      cursorEscolhidoRef.current = false;
      escrever(proxima, proximaVaga(proxima, 0));
      return;
    }

    const novosPalpites = palpitesPorTab.map((lista, i) =>
      resolvidos[i] ? lista : [...lista, julgamentos[i]!.palpite],
    );
    const novosResolvidos = resolvidos.map((r, i) => r || acertou(novosPalpites[i][novosPalpites[i].length - 1]));
    const fechouAgora = novosResolvidos.filter((r, i) => r && !resolvidos[i]).length;
    const tentativasUsadas = tentativas + 1;
    novosResolvidos.forEach((r, i) => {
      if (r && !resolvidos[i]) {
        resolvidoEmRef.current[i] = tentativasUsadas;
        resolvidoEmTsRef.current[i] = Date.now();
        const rod = grupo[i];
        if (rod) {
          const w = rod.palavra || rod.resposta;
          if (w) speak(w, { lang: toBcp47(rod.lang || 'en') });
        }
      }
    });

    setPalpitesPorTab(novosPalpites);
    setResolvidos(novosResolvidos);
    setTentativas(tentativasUsadas);
    const proxima = linhaInicial(tamanho, novosPalpites, novosResolvidos, reveladas);
    cursorEscolhidoRef.current = false;
    escrever(proxima, proximaVaga(proxima, 0));

    if (fechouAgora > 0) {
      const nova = sequencia + fechouAgora;
      const mult = multiplicador(nova);
      const ganho = 10 * fechouAgora * (usouDica ? 1 : mult);
      setSequencia(nova);
      setAcertos((n) => n + fechouAgora);
      setPontos((p) => p + ganho);
      triggerHaptic('success');
      playJuicedHit(nova, undefined, `+${ganho}${mult > 1 && !usouDica ? ` ×${mult}` : ''}`);
    } else {
      setSequencia(0);
      triggerHaptic('error');
      playJuicedError(gradeRef.current, undefined);
    }

    if (novosResolvidos.every(Boolean) || tentativasUsadas >= maxTentativas)
      fecharGrupo(novosResolvidos, tentativasUsadas);
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
    triggerHaptic('soft');
    const n = [...atualRef.current];
    const pos = Math.min(cursorRef.current, n.length - 1);
    if (pos < 0) return;
    if (n.every((l) => l !== '') && !cursorEscolhidoRef.current) return;
    n[pos] = letra;
    setPop(pos);
    escrever(n, proximaVaga(n, pos + 1));
  };

  const apagar = () => {
    if (fimDoGrupo) return;
    triggerHaptic('soft');
    const n = [...atualRef.current];
    const pos = Math.max(0, Math.min(cursorRef.current, n.length - 1));
    if (n[pos]) {
      escrever(
        n.map((l, i) => (i === pos ? '' : l)),
        pos,
      );
      return;
    }
    const anterior = Math.max(0, pos - 1);
    n[anterior] = '';
    escrever(n, anterior);
  };

  const irPara = (pos: number) => {
    cursorEscolhidoRef.current = true; // daqui em diante, digitar é corrigir
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
    const alvo = resolvidos.findIndex((r) => !r);
    if (alvo < 0) return;
    const d = dicaDeLetra(grupo[alvo].resposta, palpitesPorTab[alvo], Object.keys(reveladas[alvo] ?? {}).map(Number));
    if (!d) return;
    const letra = d.letra.toUpperCase();
    setUsouDica(true);
    setDicaPorTab((v) => v.map((x, k) => (k === alvo ? true : x)));
    setSequencia(0); // a sequência é mérito; com ajuda ela recomeça
    setReveladas((prev) => ({ ...prev, [alvo]: { ...(prev[alvo] ?? {}), [d.posicao]: letra } }));
    // Entra no palpite de verdade: é o que faz o Enter confirmar e a dica sobreviver ao envio.
    const n = [...atualRef.current];
    n[d.posicao] = letra;
    escrever(n, proximaVaga(n, d.posicao + 1));
    pontosDoElemento(`letra ${d.posicao + 1}`, el, 'neutro');
  };

  /** Ouvir a palavra — dica sonora que, de quebra, liga a grafia ao som. */
  const ouvirPalavra = () => {
    if (!grupo) return;
    const alvo = resolvidos.findIndex((r) => !r);
    if (alvo < 0) return;
    // Ouvir NÃO é dica: não revela letra nenhuma, e ligar grafia ao som é o objetivo do jogo.
    speak(grupo[alvo].palavra || grupo[alvo].resposta, { lang: toBcp47(grupo[alvo].lang || 'en') });
  };

  // Sem lista de dependências de propósito: o ouvinte é reinstalado a cada render para que
  // `enviar` enxergue o palpite DESTA render. Uma versão memoizada leria o estado antigo — foi
  // exatamente esse bug que fez o envio automático falhar em silêncio antes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ativo) return; // contagem, pausa ou "Como se joga" abertos: a tecla não é do tabuleiro
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
      if (e.key === 'Enter') {
        enviar();
        return;
      }
      if (e.key === ' ') return;
      if (e.key === 'Backspace') {
        e.preventDefault();
        apagar();
        return;
      }
      if (e.key === 'ArrowLeft') {
        irPara(cursorRef.current - 1);
        return;
      }
      if (e.key === 'ArrowRight') {
        irPara(cursorRef.current + 1);
        return;
      }
      if (e.key === 'Home') {
        irPara(0);
        return;
      }
      if (e.key === 'End') {
        irPara(tamanho - 1);
        return;
      }
      const l = e.key.toUpperCase();
      if (/^[A-Z]$/.test(l)) digitar(l);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!grupo) return null;

  // O nome do degrau acompanha o da carta no lobby: ver "Termo" depois de clicar em "Escrever a
  // palavra" faz a pessoa achar que entrou noutro lugar.
  const nomeDe = (tabuleiros: number) => {
    const m = modoDeTabuleiros(tabuleiros);
    return m === 'termo'
      ? ageProfile === 'kids'
        ? 'Escreva a palavra'
        : ageProfile === 'senior'
          ? 'Escrever a palavra'
          : 'Termo'
      : m === 'dueto'
        ? ageProfile === 'pro'
          ? 'Dueto'
          : 'Duas de uma vez'
        : ageProfile === 'pro'
          ? 'Quarteto'
          : 'Quatro de uma vez';
  };
  const nomeDoDegrau = nomeDe(nTabuleiros);

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
  /* A célula medida entra como `--lt`, a variável do CSS do protótipo (`.tabs-termo`): é dela que
     saem a largura do quadrado, a fonte e o raio. Quando o Quarteto vira 2×2, a largura máxima
     força a quebra em duas fileiras — a mesma conta do `ajustarTermo` do protótipo. */
  const G = GEOMETRIA_DO_PROTOTIPO;
  const gapTab = G.gapTabuleiro(nTabuleiros);
  const estiloTabs = {
    '--lt': `${layout.celula}px`,
    '--tam': colunas,
    maxWidth:
      layout.porFileira < nTabuleiros
        ? layout.porFileira * (colunas * layout.celula + (colunas - 1) * G.gapCelula + layout.moldura) +
          (layout.porFileira - 1) * gapTab
        : undefined,
  } as React.CSSProperties;

  /** Estado do core → classe do protótipo. */
  const CLASSE: Record<EstadoLetra, string> = { certa: 'certa', existe: 'lugar', ausente: 'fora' };
  const ROTULO: Record<EstadoLetra, string> = {
    certa: 'no lugar certo',
    existe: 'na palavra, lugar errado',
    ausente: 'não está na palavra',
  };
  const plano = grupos.map((g) => g.length);

  /* Quantas palavras a escada tem, e quantas já passaram: é o progresso do placar comum. */
  const totalDePalavras = grupos.reduce((s, g) => s + g.length, 0);
  const jaPassadas = grupos.slice(0, grupoIdx).reduce((s, g) => s + g.length, 0) + resolvidos.filter(Boolean).length;

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e a escada,
     os tabuleiros e o teclado do Termo, que são dele. */
  return (
    <div ref={raizRef} className="flex flex-col" style={{ height: alturaDaRaiz }}>
      <HudDaRodada
        pontos={pontos}
        sequencia={sequencia}
        acertos={acertos}
        rotulo={`Degrau ${grupoIdx + 1} de ${grupos.length} · ${nomeDoDegrau} · ${tentativas} de ${maxTentativas} tentativas`}
        progresso={jaPassadas / Math.max(1, totalDePalavras)}
        ajudas={
          <>
            <BotaoDeAjuda
              icone={Volume2}
              rotulo="Ouvir"
              disabled={fimDoGrupo}
              onClick={ouvirPalavra}
              title="Ouvir pronúncia nativa"
            />
            <BotaoDeAjuda
              icone={Lightbulb}
              rotulo="Uma letra"
              disabled={fimDoGrupo}
              onClick={(e) => pedirDica(e.currentTarget)}
              title="Revelar uma letra da palavra"
            />
            <BotaoDeAjuda
              icone={WandSparkles}
              rotulo="Auto-preencher"
              data-tour="varinha"
              disabled={fimDoGrupo}
              onClick={(e) => usarLetrasCertas(e.currentTarget)}
              title="Preencher as letras que você já descobriu"
            />
          </>
        }
      />

      <div className="w-full flex-1 min-h-0 flex flex-col items-center gap-1">
        {/* A ESCADA — `.escada-termo` do protótipo: os degraus do plano, o feito em verde, o da vez
          em destaque, e o tamanho/tentativas do degrau à direita. */}
        <div className="escada-termo shrink-0" aria-label={`degrau ${grupoIdx + 1} de ${grupos.length}`}>
          {plano.map((d, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <i aria-hidden="true">
                  <ChevronRight />
                </i>
              )}
              <span className={i < grupoIdx ? 'feito' : i === grupoIdx ? 'vez' : ''}>{nomeDe(d)}</span>
            </React.Fragment>
          ))}
          <small className="mut">
            {colunas} letras · {maxTentativas} tentativas
          </small>
        </div>

        {/* OS TABULEIROS — `.tabs-termo` > `.tab-termo`, cada um com A SUA pista no `header`.
          As pistas já moraram num bloco separado no topo, e com quatro tabuleiros ninguém sabia
          qual pista era de qual grade. No Quarteto, quatro numa fileira quando a tela permite;
          2×2 só quando 1×4 espremeria abaixo do legível (ver `layoutDoTermo`). */}
        {/* A área rolável é o orçamento de altura; tabuleiros e teclado ficam JUNTOS dentro dela
          (o teclado logo abaixo dos tabuleiros, como no protótipo), e a conta desconta a altura
          medida do teclado. `m-auto` centraliza quando cabe e NÃO corta o topo quando não cabe. */}
        <div ref={areaRef} className="w-full flex-1 min-h-0 overflow-y-auto custom-scrollbar flex">
          <div className="w-full m-auto">
            <div
              ref={gradeRef}
              data-tour="tabuleiro"
              /* `overflow-x-auto` SÓ quando a conta declarou aperto (celular + zoom alto + quarteto).
           Rolar de lado é degradação honesta; colar os tabuleiros é defeito. `relative`: o selo
           "Sobe" é absoluto. */
              className={`relative w-full ${layout.apertado ? 'overflow-x-auto custom-scrollbar' : ''}`}
            >
              {subiuDegrau && grupos[grupoIdx + 1] && (
                <div className="selo-combo" role="status">
                  Sobe: {nomeDe(grupos[grupoIdx + 1].length)}!
                </div>
              )}
              <div className={`tabs-termo n${nTabuleiros}`} style={estiloTabs}>
                {grupo.map((r, tIdx) => {
                  const palpites = palpitesPorTab[tIdx] ?? [];
                  const certas = letrasCertas(palpites, r.resposta.length);
                  const resolvido = !!resolvidos[tIdx];
                  const falhou = fimDoGrupo && !resolvido;
                  const rev = reveladas[tIdx] ?? {};
                  const temRevelada = Object.keys(rev).length > 0;
                  return (
                    <section
                      key={tIdx}
                      className={`tab-termo ${resolvido ? 'resolvido' : ''} ${falhou ? 'falhou' : ''}`}
                      aria-label={`Tabuleiro ${tIdx + 1}: ${r.pista || 'sem pista'}`}
                    >
                      <header>
                        <span
                          className="pista"
                          title={r.pista || undefined}
                          data-tour={tIdx === 0 ? 'pista' : undefined}
                        >
                          {r.pista || '?'}
                        </span>
                        {resolvido ? (
                          <span className="selo ok" aria-label={`Acertou: ${r.palavra || r.resposta}`}>
                            <Check aria-hidden />
                          </span>
                        ) : falhou ? (
                          <span className="selo erro">{r.palavra || r.resposta}</span>
                        ) : temRevelada ? (
                          <span className="revela" aria-label="Letras reveladas">
                            {r.resposta
                              .split('')
                              .map((c, i) => (rev[i] ? c : '·'))
                              .join('')}
                          </span>
                        ) : null}
                      </header>
                      {/* Pista AMBÍGUA (há sinônimos no acervo): a frase de contexto desempata. */}
                      {!resolvido && !fimDoGrupo && r.contexto && (
                        <p
                          className="mut"
                          style={{
                            fontSize: 11.5,
                            fontStyle: 'italic',
                            lineHeight: 1.35,
                            maxWidth: `calc(var(--tam) * var(--lt) + (var(--tam) - 1) * 5px)`,
                          }}
                        >
                          “{r.contexto}”
                        </p>
                      )}
                      <div className="grade-t" role="grid" aria-label="Tentativas">
                        {Array.from({ length: maxTentativas }).map((_, linha) => {
                          const p = palpites[linha];
                          const digitando = !resolvido && !fimDoGrupo && linha === palpites.length;
                          const venceu = resolvido && linha === palpites.length - 1;
                          return (
                            <div
                              key={linha}
                              role="row"
                              className={`linha-termo ${digitando ? 'atual' : ''} ${digitando && treme ? 'treme' : ''} ${venceu ? 'venceu' : ''}`}
                            >
                              {Array.from({ length: r.resposta.length }).map((_, col) => {
                                const estilo = { '--i': col } as React.CSSProperties;
                                if (!digitando) {
                                  const letra = p ? p.letras[col] : '';
                                  const estado = p?.estados[col];
                                  return (
                                    <span
                                      key={col}
                                      role="gridcell"
                                      className={`letra ${estado ? CLASSE[estado] : letra ? 'cheia' : ''}`}
                                      style={estilo}
                                      aria-label={letra ? `${letra}${estado ? `, ${ROTULO[estado]}` : ''}` : 'vazia'}
                                    >
                                      {letra}
                                    </span>
                                  );
                                }
                                /* A LINHA EM DIGITAÇÃO é de botões: dá para clicar numa casa (ou andar com as
                         setas) e escrever ali. O cursor ganha a borda e o halo do acento; a letra
                         que já se sabia (revelada ou verde) aparece mais apagada. */
                                const letra = atual[col];
                                const noCursor = col === cursor;
                                const ehFantasma = !!letra && (!!rev[col] || !!certas[col]);
                                return (
                                  <button
                                    key={col}
                                    type="button"
                                    onClick={() => irPara(col)}
                                    aria-label={`Posição ${col + 1}${letra ? `, letra ${letra}` : ', vazia'}`}
                                    className={`letra ${letra ? 'cheia' : ''} ${letra && col === pop ? 'pop' : ''}`}
                                    style={{
                                      ...estilo,
                                      cursor: 'pointer',
                                      ...(noCursor
                                        ? {
                                            borderColor: 'var(--accent)',
                                            boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent)',
                                          }
                                        : null),
                                      ...(ehFantasma
                                        ? { color: rev[col] ? 'var(--warn-ink)' : 'var(--ink-muted)' }
                                        : null),
                                    }}
                                  >
                                    {letra}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>

            {/* TECLADO — `.teclado` do protótipo, logo abaixo dos tabuleiros (a folga de 16px é a
          margem de `.tabs-termo`). Com um tabuleiro a tecla pinta inteira; com dois ou quatro,
          cada tecla leva uma marquinha por tabuleiro (`.k-marcas`) e só apaga quando a letra está
          fora de TODOS os abertos. */}
            <div ref={tecladoRef} data-tour="teclado" className="teclado w-full" role="group" aria-label="Teclado">
              {LINHAS_TECLADO.map((linha, i) => (
                <div key={linha} className="fila">
                  {i === 2 && (
                    <button
                      type="button"
                      className="largo"
                      onClick={enviar}
                      disabled={fimDoGrupo}
                      aria-label="Enviar palpite"
                    >
                      Enviar
                    </button>
                  )}
                  {linha.split('').map((letra) => {
                    if (nTabuleiros === 1) {
                      const e = tecladoPorTab[0]?.[letra];
                      return (
                        <button
                          type="button"
                          key={letra}
                          className={e ? CLASSE[e] : ''}
                          onClick={() => digitar(letra)}
                          aria-label={`${letra}${e ? `, ${ROTULO[e]}` : ''}`}
                        >
                          {letra}
                        </button>
                      );
                    }
                    const todas = grupo.every((_, k) => resolvidos[k] || tecladoPorTab[k]?.[letra] === 'ausente');
                    return (
                      <button
                        type="button"
                        key={letra}
                        className={`multi ${todas ? 'fora' : ''}`}
                        onClick={() => digitar(letra)}
                        aria-label={letra}
                      >
                        {letra}
                        <span className={`k-marcas q${nTabuleiros}`} aria-hidden="true">
                          {grupo.map((_, k) => {
                            const e = tecladoPorTab[k]?.[letra];
                            return <i key={k} className={resolvidos[k] ? 'feito' : e ? CLASSE[e] : ''} />;
                          })}
                        </span>
                      </button>
                    );
                  })}
                  {i === 2 && (
                    <button type="button" className="largo" onClick={apagar} aria-label="Apagar letra">
                      <Delete aria-hidden />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
