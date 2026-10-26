/**
 * AS ANOTAÇÕES DE UM LIVRO, DO LADO DO APARELHO: grava primeiro no IndexedDB (nunca se perde por falta de
 * rede ou de conta) e, com conta, sincroniza — envia as pendentes em lotes de 200 e recebe as mudadas desde a
 * última vez, mesclando pela última escrita (`mesclarAnotacoes`). É o "aparelho A grava, aparelho B vê"
 * (critério 8 da spec).
 *
 * As dependências são injetáveis (o teste troca a API e o relógio); a tela usa `anotacoesDoLivro(livroId)`.
 */
import { type AnotacaoDeLeitura, anotacoesVivas, mesclarAnotacoes, validarAnotacao } from '../../core/leitura/anotacao';
import * as api from '../../data/rotas/leitura';
import { type AnotacaoLocal, estante } from './armazem';

const LOTE = 200;

export interface DependenciasDaSincronizacao {
  pode: () => Promise<boolean>;
  ler: typeof api.lerAnotacoesDoServidor;
  enviar: typeof api.enviarAnotacoes;
}

const PADRAO: DependenciasDaSincronizacao = {
  pode: api.podeSincronizarAnotacoes,
  ler: api.lerAnotacoesDoServidor,
  enviar: api.enviarAnotacoes,
};

export type EstadoDaSincronizacao = 'so-aparelho' | 'sincronizada' | 'pendente' | 'erro';

export interface ResultadoDaSincronizacao {
  estado: EstadoDaSincronizacao;
  /** As que o servidor recusou (teto), para a tela dizer. */
  recusadas: number;
}

const semMarca = ({ pendente: _p, ...a }: AnotacaoLocal): AnotacaoDeLeitura => {
  void _p;
  return a;
};

export function anotacoesDoLivro(livroId: string, deps: DependenciasDaSincronizacao = PADRAO) {
  const chaveDaMarca = `sinc:${livroId}`;

  async function todas(): Promise<AnotacaoLocal[]> {
    return estante.anotacoes(livroId);
  }

  return {
    /** As vivas do livro, na ordem de leitura (só o aparelho; sem rede). */
    async vivas(): Promise<AnotacaoDeLeitura[]> {
      return anotacoesVivas((await todas()).map(semMarca));
    },

    /** Grava (cria ou edita) no aparelho, marcada para subir. */
    async gravar(a: AnotacaoDeLeitura): Promise<void> {
      await estante.gravarAnotacoes([{ ...a, pendente: 1 }]);
    },

    /** Apaga (lápide) no aparelho, marcada para subir. */
    async apagar(id: string, agora = Date.now()): Promise<void> {
      const a = (await todas()).find((x) => x.id === id);
      if (a) await estante.gravarAnotacoes([{ ...a, apagadoEm: agora, pendente: 1 }]);
    },

    /** Envia as pendentes e recebe as mudadas. Sem conta: `so-aparelho`, e nada sai. */
    async sincronizar(): Promise<ResultadoDaSincronizacao> {
      if (!(await deps.pode())) return { estado: 'so-aparelho', recusadas: 0 };
      let recusadas = 0;
      let erro = false;
      const pendentes = (await todas()).filter((a) => a.pendente === 1);
      for (let i = 0; i < pendentes.length; i += LOTE) {
        const fatia = pendentes.slice(i, i + LOTE);
        const r = await deps.enviar(fatia.map(semMarca));
        if (!r.ok) {
          erro = true;
          break;
        }
        const resolvidas = new Set([...r.gravadas.map((g) => g.id), ...r.ignoradas, ...r.recusadas.map((x) => x.id)]);
        recusadas += r.recusadas.length;
        const locais = new Map(fatia.map((a) => [a.id, a]));
        const atualizadas: AnotacaoLocal[] = [];
        for (const g of r.gravadas) {
          const v = validarAnotacao(g);
          if (!v.ok) continue;
          /* A versão do servidor vale; se a local for mais nova (outra edição entrou no meio), ela continua pendente. */
          const [vencedora] = mesclarAnotacoes([v.anotacao], [semMarca(locais.get(g.id)!)]);
          atualizadas.push({ ...vencedora, pendente: vencedora === v.anotacao ? 0 : 1 });
        }
        for (const id of resolvidas) {
          if (!r.gravadas.some((g) => g.id === id)) atualizadas.push({ ...locais.get(id)!, pendente: 0 });
        }
        await estante.gravarAnotacoes(atualizadas);
      }
      if (erro) return { estado: 'erro', recusadas };
      const desde = await estante.marca(chaveDaMarca);
      const lidas = await deps.ler(livroId, desde);
      if (!lidas.ok) return { estado: 'erro', recusadas };
      const remotas = lidas.anotacoes.map((x) => validarAnotacao(x)).flatMap((v) => (v.ok ? [v.anotacao] : []));
      const locais = (await todas()).map(semMarca);
      const mescladas = mesclarAnotacoes(locais, remotas);
      /* Só o que a remota venceu muda aqui — e aí ela vale (a edição local mais velha perdeu: última escrita vence). */
      const venceram = mescladas.filter((m) => remotas.includes(m));
      await estante.gravarAnotacoes(venceram.map((m) => ({ ...m, pendente: 0 as const })));
      await estante.gravarMarca(chaveDaMarca, lidas.agora);
      const sobrou = (await todas()).some((a) => a.pendente === 1);
      return { estado: sobrou ? 'pendente' : 'sincronizada', recusadas };
    },
  };
}

export type AnotacoesDoLivro = ReturnType<typeof anotacoesDoLivro>;
