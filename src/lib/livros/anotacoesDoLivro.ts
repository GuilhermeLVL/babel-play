/**
 * AS ANOTAÇÕES DE UM LIVRO, DO LADO DO APARELHO: grava primeiro no IndexedDB (nunca se perde por falta de
 * rede ou de conta) e, com conta, sincroniza — envia as pendentes em lotes (até 200 e abaixo de 90 KB) e recebe,
 * página a página, as escritas no servidor depois do CURSOR guardado, mesclando pela última escrita
 * (`mesclarAnotacoes`). É o "aparelho A grava, aparelho B vê" (critério 8 da spec).
 *
 * O CURSOR é o relógio do SERVIDOR (`<sincronizado_em>:<id>`), e não o do aparelho: a escrita feita sem rede, com
 * data antiga, que sobe depois de outro aparelho já ter lido, ainda chega a ele. O relógio do aparelho
 * (`atualizadoEm`) só desempata o conflito. O cursor só é guardado no fim da última página.
 *
 * As dependências são injetáveis (o teste troca a API e o relógio); a tela usa `anotacoesDoLivro(livroId)`.
 */
import {
  type AnotacaoDeLeitura,
  anotacoesVivas,
  caracteresDeCitacao,
  ehLivroTrazido,
  MAX_CITACAO_POR_LIVRO_TRAZIDO,
  mesclarAnotacoes,
  validarAnotacao,
} from '../../core/leitura/anotacao';
import * as api from '../../data/rotas/leitura';
import { type AnotacaoLocal, estante } from './armazem';
import { idRemotoDoLivro } from './idRemoto';

/** Itens por lote (o teto do servidor). */
const LOTE = 200;
/** Bytes por lote (o JSON do corpo): abaixo do teto do servidor para `/api/leitura` com folga. */
export const MAX_BYTES_DO_LOTE = 90_000;

export interface DependenciasDaSincronizacao {
  pode: () => Promise<boolean>;
  ler: typeof api.lerAnotacoesDoServidor;
  enviar: typeof api.enviarAnotacoes;
  /** O id que o servidor vê (`idRemoto.ts`); `null` = não dá para sincronizar este livro agora. */
  idRemoto: (livroId: string) => Promise<string | null>;
  maxBytes?: number;
}

const PADRAO: DependenciasDaSincronizacao = {
  pode: api.podeSincronizarAnotacoes,
  ler: api.lerAnotacoesDoServidor,
  enviar: api.enviarAnotacoes,
  idRemoto: (id) => idRemotoDoLivro(id),
};

export type EstadoDaSincronizacao = 'so-aparelho' | 'sincronizada' | 'pendente' | 'erro';

export interface ResultadoDaSincronizacao {
  estado: EstadoDaSincronizacao;
  /** As que o servidor recusou (teto), para a tela dizer. */
  recusadas: number;
  /** As que, sozinhas, passam do tamanho de um pedido: ficam só neste aparelho. */
  grandes: number;
}

const semMarca = ({ pendente: _p, ...a }: AnotacaoLocal): AnotacaoDeLeitura => {
  void _p;
  return a;
};

const bytes = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;

/** Corta a lista em lotes de até `LOTE` itens e `maxBytes` de JSON (`{"anotacoes":[…]}`). Exportada para o teste. */
export function lotesPorBytes<T>(lista: readonly T[], maxBytes = MAX_BYTES_DO_LOTE): T[][] {
  const lotes: T[][] = [];
  let atual: T[] = [];
  let tamanho = bytes({ anotacoes: [] });
  for (const item of lista) {
    const b = bytes(item) + 1;
    if (atual.length && (atual.length >= LOTE || tamanho + b > maxBytes)) {
      lotes.push(atual);
      atual = [];
      tamanho = bytes({ anotacoes: [] });
    }
    atual.push(item);
    tamanho += b;
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}

/** A citação nova cabe no teto somado do livro trazido? (Do catálogo e sessão: sempre.) */
export function citacaoCabe(livroId: string, vivas: readonly AnotacaoDeLeitura[], nova: AnotacaoDeLeitura): boolean {
  if (!ehLivroTrazido(livroId)) return true;
  const outras = vivas.filter((v) => v.id !== nova.id);
  return caracteresDeCitacao([...outras, nova]) <= MAX_CITACAO_POR_LIVRO_TRAZIDO;
}

export function anotacoesDoLivro(livroId: string, deps: DependenciasDaSincronizacao = PADRAO) {
  const chaveDoCursor = `cursor:${livroId}`;

  async function todas(): Promise<AnotacaoLocal[]> {
    return estante.anotacoes(livroId);
  }

  return {
    /** As vivas do livro, na ordem de leitura (só o aparelho; sem rede). */
    async vivas(): Promise<AnotacaoDeLeitura[]> {
      return anotacoesVivas((await todas()).map(semMarca));
    },

    /**
     * Grava (cria ou edita) no aparelho, marcada para subir. `false` = a citação passaria do teto somado do livro
     * trazido (`MAX_CITACAO_POR_LIVRO_TRAZIDO`): não grava, e a tela diz.
     */
    async gravar(a: AnotacaoDeLeitura): Promise<boolean> {
      const vivas = anotacoesVivas((await todas()).map(semMarca));
      if (!citacaoCabe(livroId, vivas, a)) return false;
      await estante.gravarAnotacoes([{ ...a, pendente: 1 }]);
      return true;
    },

    /**
     * O CFI recalculado pela reancoragem (dado DERIVADO: cada aparelho o recalcula do texto que tem). Grava só no
     * aparelho, sem mudar `atualizadoEm` nem marcar para subir — senão abrir o livro "editava" toda anotação, e
     * a versão local reviveria no servidor a anotação que outro aparelho acabou de apagar.
     */
    async reancorar(id: string, cfi: string): Promise<void> {
      const a = (await todas()).find((x) => x.id === id);
      if (a && a.alvo.cfi !== cfi) await estante.gravarAnotacoes([{ ...a, alvo: { ...a.alvo, cfi } }]);
    },

    /** Apaga (lápide) no aparelho, marcada para subir. */
    async apagar(id: string, agora = Date.now()): Promise<void> {
      const a = (await todas()).find((x) => x.id === id);
      if (a) await estante.gravarAnotacoes([{ ...a, apagadoEm: agora, pendente: 1 }]);
    },

    /** Envia as pendentes e recebe as mudadas. Sem conta: `so-aparelho`, e nada sai. */
    async sincronizar(): Promise<ResultadoDaSincronizacao> {
      const contas = { recusadas: 0, grandes: 0 };
      if (!(await deps.pode())) return { estado: 'so-aparelho', ...contas };
      const remoto = await deps.idRemoto(livroId);
      if (!remoto) return { estado: 'erro', ...contas };
      const paraOServidor = (a: AnotacaoLocal): AnotacaoDeLeitura => ({ ...semMarca(a), livroId: remoto });
      const doServidor = (a: AnotacaoDeLeitura): AnotacaoDeLeitura => ({ ...a, livroId });
      const agora = Date.now();

      /* ── ENVIAR: lotes por bytes; 413 parte o lote ao meio; um item sozinho grande demais sai da fila ── */
      const enviar = async (fatia: AnotacaoLocal[]): Promise<boolean> => {
        const r = await deps.enviar(fatia.map(paraOServidor));
        if (r.ok === false) {
          if (r.status !== 413) return false;
          if (fatia.length > 1) {
            const meio = Math.ceil(fatia.length / 2);
            return (await enviar(fatia.slice(0, meio))) && (await enviar(fatia.slice(meio)));
          }
          /* Sozinha, ela não cabe num pedido: fica só neste aparelho (e a tela diz), sem travar as outras. */
          contas.grandes++;
          await estante.gravarAnotacoes([{ ...fatia[0], pendente: 0 }]);
          return true;
        }
        const resolvidas = new Set([...r.gravadas.map((g) => g.id), ...r.ignoradas, ...r.recusadas.map((x) => x.id)]);
        contas.recusadas += r.recusadas.length;
        const locais = new Map(fatia.map((a) => [a.id, a]));
        const atualizadas: AnotacaoLocal[] = [];
        for (const g of r.gravadas) {
          const v = validarAnotacao(g, { agora });
          if (!v.ok || !locais.has(g.id)) continue;
          /* A versão do servidor vale; se a local for mais nova (outra edição entrou no meio), ela continua pendente. */
          const servidor = doServidor(v.anotacao);
          const [vencedora] = mesclarAnotacoes([servidor], [semMarca(locais.get(g.id)!)]);
          atualizadas.push({ ...vencedora, pendente: vencedora === servidor ? 0 : 1 });
        }
        for (const id of resolvidas) {
          if (!r.gravadas.some((g) => g.id === id) && locais.has(id))
            atualizadas.push({ ...locais.get(id)!, pendente: 0 });
        }
        await estante.gravarAnotacoes(atualizadas);
        return true;
      };
      const pendentes = (await todas()).filter((a) => a.pendente === 1);
      for (const lote of lotesPorBytes(pendentes, deps.maxBytes ?? MAX_BYTES_DO_LOTE)) {
        if (!(await enviar(lote))) return { estado: 'erro', ...contas };
      }

      /* ── RECEBER: página a página a partir do cursor; o cursor só é guardado no fim ── */
      const guardado = await estante.marca(chaveDoCursor);
      let cursor = typeof guardado === 'string' ? guardado : undefined;
      for (;;) {
        const lidas = await deps.ler(remoto, cursor);
        if (!lidas.ok) return { estado: 'erro', ...contas };
        const remotas = lidas.anotacoes
          .map((x) => validarAnotacao(x, { agora }))
          .flatMap((v) => (v.ok ? [doServidor(v.anotacao)] : []));
        const locais = (await todas()).map(semMarca);
        const mescladas = mesclarAnotacoes(locais, remotas);
        /* Só o que a remota venceu muda aqui — e aí ela vale (a edição local mais velha perdeu: última escrita vence). */
        const venceram = mescladas.filter((m) => remotas.includes(m));
        await estante.gravarAnotacoes(venceram.map((m) => ({ ...m, pendente: 0 as const })));
        cursor = lidas.cursor ?? cursor;
        if (!lidas.temMais) break;
      }
      if (cursor) await estante.gravarMarca(chaveDoCursor, cursor);
      const sobrou = (await todas()).some((a) => a.pendente === 1);
      return { estado: sobrou ? 'pendente' : 'sincronizada', ...contas };
    },
  };
}

export type AnotacoesDoLivro = ReturnType<typeof anotacoesDoLivro>;
