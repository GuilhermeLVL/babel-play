/**
 * O DESTAQUE POR VOCABULÁRIO NO LEITOR (openspec `leitura-assistida`, Fatia C). Puro: sem DOM, sem rede, sem React.
 *
 * Quem desenha é `src/lib/leitor/destaqueNoDocumento.ts` (CSS Custom Highlight API, sem mexer no DOM do livro); quem monta
 * a lista de palavras é `glosaDoCapitulo.palavrasDoCapitulo`. Aqui ficam as REGRAS:
 *
 *  - `infoDaPalavra`: o estado e a força da palavra, lidos dos índices que o app já tem (caderno, forças do FSRS e
 *    marcadas "Já sei"/"Ignorar"). A força NÃO é gravada à parte: sai de `forcaDoCartao`;
 *  - `intensidadeDoDestaque`: a cor e a intensidade. Nova = UMA cor, mais forte quanto mais frequente no capítulo (palavra
 *    comum nova pede mais atenção que a rara); aprendendo = gradiente (força 1 mais forte, 3 mais fraca); conhecida, força 4
 *    e ignorada = sem cor;
 *  - `resumoDoCapitulo`: a densidade (% de novas) e a % de conhecidas;
 *  - `estadoInicialDaForca`: o estado do agendador de um cartão novo para a pessoa escolher a força no cartão da palavra;
 *  - `palavrasAMarcarAoPaginar`: a opção "paginar marca como conhecida" (desligada por padrão, ver a spec).
 *
 * O contrato com as outras fatias (`InfoDaPalavra`, `StatusDaPalavra`) mora aqui até a Fatia 0 criar
 * `core/leitura/leituraAssistida.ts`; ela só precisa reexportar estes tipos.
 */
import { type Forca } from '../learning/forcaDoCartao';
import { estadoNoCaderno, forcaNoCaderno, type IndiceDeForcas, type IndiceDoCaderno } from '../vocabulario/etiquetas';
import { estadoMarcado, type IndiceDeMarcadas } from '../vocabulario/marcadas';

export type StatusDaPalavra = 'nova' | 'aprendendo' | 'conhecida' | 'ignorada';

export interface InfoDaPalavra {
  status: StatusDaPalavra;
  /** 0 = sem cartão; 1 a 3 = aprendendo; 4 = firme, "Já sei" ou palavra que não precisa de destaque. */
  forca: 0 | 1 | 2 | 3 | 4;
  /** 0..1: o quanto a palavra se repete no capítulo (escala logarítmica). */
  frequencia: number;
}

/** O que `infoDaPalavra` lê: os três índices que `useSnapshotDasEtiquetas` publica. */
export interface FonteDeVocabulario {
  caderno: IndiceDoCaderno | null;
  forcas?: IndiceDeForcas | null;
  marcadas: IndiceDeMarcadas | null;
}

const DE_ESTADO_PARA_FORCA = { nova: 1, aprendendo: 2, dominada: 4 } as const;

/**
 * O estado e a força da palavra. `chaves` são as chaves de lema candidatas (`chavesDeLema`): vale o cartão de maior
 * força; sem cartão, "Ignorar" e depois "Já sei"; senão, nova. `semDestaque` (palavra funcional, nome próprio) conta como
 * conhecida: a régua é a da cobertura do texto.
 */
export function infoDaPalavra(
  fonte: FonteDeVocabulario,
  chaves: readonly string[],
  idioma: string,
  frequencia = 0,
  semDestaque = false,
): InfoDaPalavra {
  const f = Math.min(1, Math.max(0, frequencia));
  if (semDestaque) return { status: 'conhecida', forca: 4, frequencia: f };
  let forcaDoCartao = 0;
  let ignorada = false;
  let conhecida = false;
  for (const chave of chaves) {
    const estado = estadoNoCaderno(fonte.caderno, chave, idioma);
    if (estado) {
      const forca = forcaNoCaderno(fonte.forcas, chave, idioma) ?? DE_ESTADO_PARA_FORCA[estado];
      if (forca > forcaDoCartao) forcaDoCartao = forca;
      continue;
    }
    const marca = estadoMarcado(fonte.marcadas, chave, idioma);
    if (marca === 'ignorada') ignorada = true;
    else if (marca === 'conhecida') conhecida = true;
  }
  if (forcaDoCartao) {
    return forcaDoCartao >= 4
      ? { status: 'conhecida', forca: 4, frequencia: f }
      : { status: 'aprendendo', forca: forcaDoCartao as 1 | 2 | 3, frequencia: f };
  }
  if (ignorada) return { status: 'ignorada', forca: 0, frequencia: f };
  if (conhecida) return { status: 'conhecida', forca: 4, frequencia: f };
  return { status: 'nova', forca: 0, frequencia: f };
}

export type TomDoDestaque = 'nova' | 'aprendendo' | 'nenhum';

export interface IntensidadeDoDestaque {
  tom: TomDoDestaque;
  /** 0..1. */
  alfa: number;
}

/** Alfa da nova: de 0,45 (rara) a 0,70 (a mais comum do capítulo). */
export const ALFA_DA_NOVA = { base: 0.45, ganho: 0.25 } as const;
/** Alfa do aprendendo por força (1 a 3). */
export const ALFA_DO_APRENDENDO: Readonly<Record<1 | 2 | 3, number>> = { 1: 0.5, 2: 0.32, 3: 0.18 };

export function intensidadeDoDestaque(info: InfoDaPalavra): IntensidadeDoDestaque {
  if (info.status === 'nova') {
    return { tom: 'nova', alfa: ALFA_DA_NOVA.base + ALFA_DA_NOVA.ganho * Math.min(1, Math.max(0, info.frequencia)) };
  }
  if (info.status === 'aprendendo' && info.forca >= 1 && info.forca <= 3) {
    return { tom: 'aprendendo', alfa: ALFA_DO_APRENDENDO[info.forca as 1 | 2 | 3] };
  }
  return { tom: 'nenhum', alfa: 0 };
}

/** Quantos degraus de intensidade a nova tem (cada degrau é um grifo do navegador). */
export const DEGRAUS_DA_NOVA = 4;

/**
 * A classe do grifo: `nova-0` a `nova-3` (por frequência) e `aprendendo-1` a `aprendendo-3` (por força). `null` = sem
 * destaque. É o nome que o desenho do documento usa (`frasy-v-<classe>`).
 */
export function classeDoDestaque(info: InfoDaPalavra): string | null {
  const i = intensidadeDoDestaque(info);
  if (i.tom === 'nova') return `nova-${Math.min(DEGRAUS_DA_NOVA - 1, Math.floor(info.frequencia * DEGRAUS_DA_NOVA))}`;
  if (i.tom === 'aprendendo') return `aprendendo-${info.forca}`;
  return null;
}

/** O alfa de cada classe (o que o CSS do documento usa), pelo mesmo cálculo da intensidade. */
export function alfaDaClasse(classe: string): number {
  const [tom, n] = classe.split('-');
  const i = Number(n);
  if (tom === 'nova') return ALFA_DA_NOVA.base + ALFA_DA_NOVA.ganho * ((i + 0.5) / DEGRAUS_DA_NOVA);
  return ALFA_DO_APRENDENDO[i as 1 | 2 | 3] ?? 0;
}

export const CLASSES_DO_DESTAQUE: readonly string[] = [
  ...Array.from({ length: DEGRAUS_DA_NOVA }, (_, i) => `nova-${i}`),
  'aprendendo-1',
  'aprendendo-2',
  'aprendendo-3',
];

/** A frequência relativa (0..1) de uma palavra no capítulo: escala logarítmica, a mais repetida vale 1. */
export function frequenciaRelativa(ocorrencias: number, maximo: number): number {
  if (ocorrencias <= 0 || maximo <= 0) return 0;
  return Math.min(1, Math.log(1 + ocorrencias) / Math.log(1 + maximo));
}

export interface ResumoDoCapitulo {
  total: number;
  novas: number;
  aprendendo: number;
  conhecidas: number;
  /** Arredondada: a densidade de palavras novas (a régua do Word Wise). */
  porcentagemDeNovas: number;
  /** Arredondada para BAIXO, como a cobertura do texto: 97,9% não vira 98%. */
  porcentagemDeConhecidas: number;
}

export function resumoDoCapitulo(infos: Iterable<Pick<InfoDaPalavra, 'status'>>): ResumoDoCapitulo {
  let total = 0;
  let novas = 0;
  let aprendendo = 0;
  let conhecidas = 0;
  for (const { status } of infos) {
    total++;
    if (status === 'nova') novas++;
    else if (status === 'aprendendo') aprendendo++;
    else conhecidas++; // "conhecida" e "ignorada": a pessoa não precisa de ajuda nelas
  }
  return {
    total,
    novas,
    aprendendo,
    conhecidas,
    porcentagemDeNovas: total ? Math.round((novas * 100) / total) : 0,
    porcentagemDeConhecidas: total ? Math.floor(((conhecidas + aprendendo) * 100) / total) : 100,
  };
}

/** As forças que a pessoa pode escolher à mão no cartão (1 = só guardar; 2 a 4 criam o cartão já com essa firmeza). */
export const FORCAS_ESCOLHIVEIS: readonly Forca[] = [1, 2, 3, 4];

const DIA_MS = 86_400_000;

/**
 * O estado do agendador que dá a um cartão SEM revisões a força escolhida (1 = nenhum estado: sem revisão). A estabilidade
 * cai no meio da faixa de `forcaDoCartao` (2: < 3 dias; 3: de 3 a 21; 4: 21 ou mais), com 1 repetição e nenhum esquecimento,
 * então `forcaDoCartao` devolve a mesma força que a pessoa escolheu.
 */
export function estadoInicialDaForca(forca: 2 | 3 | 4, agora: number) {
  const estabilidade = { 2: 1.5, 3: 8, 4: 30 }[forca];
  return {
    box: forca,
    dueAt: agora + Math.round(estabilidade * DIA_MS),
    stability: estabilidade,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    lastReview: agora,
  };
}

/** O piso de frequência (no capítulo) para uma nova entrar em "marcar como conhecida ao paginar". */
export const PISO_DE_FREQUENCIA_AO_PAGINAR = 0.3;

export interface PalavraDaPagina {
  chave: string;
  status: StatusDaPalavra;
  frequencia: number;
}

/**
 * As chaves que a opção "marcar como conhecidas as palavras não clicadas ao virar a página" marca: só as NOVAS (sem cartão
 * e sem marca), NÃO clicadas, com frequência no capítulo acima do piso. Sem repetir. Palavra clicada nunca entra.
 */
export function palavrasAMarcarAoPaginar(
  pagina: readonly PalavraDaPagina[],
  clicadas: ReadonlySet<string>,
  piso = PISO_DE_FREQUENCIA_AO_PAGINAR,
): string[] {
  const saida = new Set<string>();
  for (const p of pagina) {
    if (p.status !== 'nova' || clicadas.has(p.chave) || p.frequencia < piso) continue;
    saida.add(p.chave);
  }
  return [...saida];
}
