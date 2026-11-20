/**
 * O "COMO RESPONDO?" EM FLUXO — a leitura INCREMENTAL da resposta do modelo, para a tela mostrar a primeira sugestão
 * assim que ela fecha, e não só quando o JSON inteiro chega (o p95 medido do total era 3,8 s contra o alvo de 3 s;
 * `docs/auditoria/eval-assistente-v1.md`).
 *
 * O modelo escreve `{"sugestoes": [{…}, {…}, {…}]}` aos pedaços (`json_schema` estrito). Aqui:
 *
 *   - `ItensDaListaEmFluxo` varre o texto que cresce, uma vez cada caractere, e devolve cada objeto COMPLETO da lista
 *     `chave` do objeto raiz (o texto antes do primeiro `{`, como a cerca ```json, é ignorado; aspas e escapes dentro
 *     de strings não contam como estrutura);
 *   - `criarLeitorDeSugestoesEmFluxo` passa cada item pelo MESMO leitor defensivo da resposta inteira
 *     (`lerItemDaSugestao`: chaves exatas, tipos, tom do enum, sem os delimitadores do prompt), sem repetir e até
 *     `MAX_SUGESTOES`. Item fora do formato: o leitor para de entregar (a resposta inteira será recusada).
 *
 * As sugestões entregues são sempre um PREFIXO do que `lerSugestoes` lê do texto final: quem decide se a resposta vale
 * (2 ou 3 utilizáveis, nenhuma chave a mais) continua sendo `lerSugestoes`, no fim do fluxo. Módulo puro: o servidor
 * e a bancada (`scripts/eval-ia/latencia-rota.mjs`) o leem igual.
 */
import { chaveDaSugestao, lerItemDaSugestao, MAX_SUGESTOES, type SugestaoDeResposta } from './promptDoAssistente';

/** Um item da lista que fechou mas não é JSON (o modelo quebrou a estrutura). */
export const ITEM_ILEGIVEL = Symbol('item ilegível');

/**
 * Os objetos completos da lista `chave` do objeto raiz, à medida que o texto cresce. `alimentar` recebe o texto
 * ACUMULADO (só cresce no fim) e devolve só os itens que fecharam desde a última chamada.
 */
export class ItensDaListaEmFluxo {
  private pos = 0;
  private readonly pilha: Array<'{' | '['> = [];
  private emTexto = false;
  private escape = false;
  private inicioDoTexto = -1;
  /** A última string fechada direto no objeto raiz: a chave do valor que vem a seguir. */
  private ultimaChave: string | null = null;
  /** A lista aberta no objeto raiz é a `chave`? */
  private listaCerta = false;
  private inicioDoItem = -1;
  private acabou = false;

  constructor(private readonly chave: string) {}

  alimentar(acumulado: string): unknown[] {
    const novos: unknown[] = [];
    for (; this.pos < acumulado.length && !this.acabou; this.pos++) {
      const c = acumulado[this.pos];
      if (this.emTexto) {
        if (this.escape) this.escape = false;
        else if (c === '\\') this.escape = true;
        else if (c === '"') {
          this.emTexto = false;
          if (this.pilha.length === 1) this.ultimaChave = textoJson(acumulado.slice(this.inicioDoTexto, this.pos + 1));
        }
        continue;
      }
      /* Antes do objeto raiz (a cerca ```json, um espaço): nada conta. */
      if (this.pilha.length === 0) {
        if (c === '{') this.pilha.push('{');
        continue;
      }
      if (c === '"') {
        this.emTexto = true;
        this.inicioDoTexto = this.pos;
      } else if (c === '{' || c === '[') {
        if (c === '[' && this.pilha.length === 1) this.listaCerta = this.ultimaChave === this.chave;
        if (c === '{' && this.noNivelDoItem()) this.inicioDoItem = this.pos;
        this.pilha.push(c);
      } else if (c === '}' || c === ']') {
        this.pilha.pop();
        if (c === '}' && this.inicioDoItem >= 0 && this.noNivelDoItem()) {
          novos.push(itemJson(acumulado.slice(this.inicioDoItem, this.pos + 1)));
          this.inicioDoItem = -1;
        }
        if (this.pilha.length === 0) this.acabou = true;
      }
    }
    return novos;
  }

  /** Dentro da lista certa, direto nela (`{` raiz → `[`): é ali que cada item abre e fecha. */
  private noNivelDoItem(): boolean {
    return this.listaCerta && this.pilha.length === 2 && this.pilha[1] === '[';
  }
}

function textoJson(s: string): string | null {
  try {
    const v = JSON.parse(s) as unknown;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

function itemJson(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return ITEM_ILEGIVEL;
  }
}

export interface LeitorDeSugestoesEmFluxo {
  /** As sugestões NOVAS desde a última chamada, já lidas e limpas, na ordem. */
  alimentar(acumulado: string): SugestaoDeResposta[];
  /** Algum item veio fora do formato (o leitor parou de entregar). */
  readonly foraDoFormato: boolean;
  /** Quantas sugestões já foram entregues. */
  readonly entregues: number;
}

export function criarLeitorDeSugestoesEmFluxo(): LeitorDeSugestoesEmFluxo {
  const itens = new ItensDaListaEmFluxo('sugestoes');
  const vistas = new Set<string>();
  let entregues = 0;
  let foraDoFormato = false;
  return {
    alimentar(acumulado) {
      if (foraDoFormato) return [];
      const novas: SugestaoDeResposta[] = [];
      for (const x of itens.alimentar(acumulado)) {
        const s = x === ITEM_ILEGIVEL ? null : lerItemDaSugestao(x);
        if (s === null) {
          foraDoFormato = true;
          break;
        }
        if (s === 'vazia') continue;
        const chave = chaveDaSugestao(s);
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        if (entregues < MAX_SUGESTOES) {
          novas.push(s);
          entregues++;
        }
      }
      return novas;
    },
    get foraDoFormato() {
      return foraDoFormato;
    },
    get entregues() {
      return entregues;
    },
  };
}
