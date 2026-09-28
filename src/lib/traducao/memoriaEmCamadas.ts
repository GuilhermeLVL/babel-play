/**
 * A MEMÓRIA DE TRADUÇÃO EM CAMADAS que a legenda ao vivo consulta antes de chamar um tradutor
 * (harness adaptativo §1.2, degrau M2).
 *
 * Ordem da busca, da mais confiável à menos:
 *   1. exata do usuário   — a tradução que ESTA pessoa já recebeu para ESTA frase;
 *   2. exata da semente   — tradução humana (Tatoeba) desta frase, fora de contexto;
 *   3. aproximada do usuário — a tradução de uma frase PARECIDA, com diferença segura;
 *   4. aproximada da semente.
 * A exata da semente passa na frente da aproximada do usuário: a mesma frase traduzida por gente
 * erra menos que outra frase traduzida pelo motor.
 *
 * `aceitarMotor` e `limiar` são de quem chama (`traducaoDaFala.ts`): quem paga pela nuvem só aceita
 * o que a nuvem traduziu e só aproximada ≥ 0,97; o grátis aceita tudo e 0,9. A camada da semente
 * nem é consultada — nem baixada — quando o motor dela não é aceito.
 *
 * O ÍNDICE APROXIMADO do usuário guarda só as CHAVES (em memória, ~5.000): monta-se na primeira
 * busca a partir do armazém (`chaves()`), cresce a cada `gravar`, e uma vizinha que o armazém já
 * esqueceu (vencida, podada) sai do índice quando aparece.
 */
import { criarIndiceAproximado, diferencaSegura, LIMIAR_APROXIMADA, separarChave } from './memoriaAproximada';
import { type ArmazemDeTraducoes, armazemPadrao, type ResultadoDaMemoria } from './memoriaDeTraducao';
import { criarSemente, MOTOR_DA_SEMENTE, type SementeDeTraducao } from './sementeDeTraducao';

export interface OpcoesDaBusca {
  /** Similaridade mínima da aproximada (padrão `LIMIAR_APROXIMADA`). */
  limiar?: number;
  /** O texto com a caixa original: é como se vê um nome próprio. */
  consultaOriginal?: string;
  /** Quais motores servem a quem pergunta (padrão: todos). */
  aceitarMotor?: (motor: string) => boolean;
}

export interface MemoriaDeTraducao extends ArmazemDeTraducoes {
  buscar(chave: string, opts?: OpcoesDaBusca): Promise<ResultadoDaMemoria | undefined>;
}

interface DepsDaMemoria {
  usuario: ArmazemDeTraducoes;
  semente: SementeDeTraducao | null;
}

/** Quantas vizinhas conferir antes de desistir (a diferença insegura de uma não condena a seguinte). */
const MAX_VIZINHAS = 5;

export function criarMemoriaEmCamadas({ usuario, semente }: DepsDaMemoria): MemoriaDeTraducao {
  const indice = criarIndiceAproximado();
  let hidratado: Promise<void> | null = null;
  const hidratar = () =>
    (hidratado ??= (usuario.chaves?.() ?? Promise.resolve([])).then(
      (cs) => cs.forEach((c) => indice.adicionar(c)),
      () => undefined,
    ));

  return {
    ler: (chave) => usuario.ler(chave),
    async gravar(chave, texto, motor) {
      await usuario.gravar(chave, texto, motor);
      indice.adicionar(chave);
    },
    chaves: () => usuario.chaves?.() ?? Promise.resolve([]),
    async buscar(chave, opts = {}) {
      const aceitar = opts.aceitarMotor ?? (() => true);
      const limiar = opts.limiar ?? LIMIAR_APROXIMADA;
      const comSemente = semente && aceitar(MOTOR_DA_SEMENTE) ? semente : null;

      const propria = await usuario.ler(chave);
      if (propria && aceitar(propria.motor))
        return { ...propria, aproximada: false, similaridade: 1, camada: 'usuario' };

      const daSemente = await comSemente?.exata(chave);
      if (daSemente) return daSemente;

      await hidratar();
      const { texto } = separarChave(chave);
      for (const v of indice.buscar(chave, limiar).slice(0, MAX_VIZINHAS)) {
        const e = await usuario.ler(v.chave);
        if (!e) {
          indice.remover(v.chave);
          continue;
        }
        if (!aceitar(e.motor)) continue;
        const outra = separarChave(v.chave).texto;
        if (diferencaSegura(texto, outra, { consultaOriginal: opts.consultaOriginal, traducaoCandidata: e.texto }))
          return { ...e, aproximada: true, similaridade: v.similaridade, camada: 'usuario' };
      }

      return comSemente?.aproximada(chave, { limiar, consultaOriginal: opts.consultaOriginal });
    },
  };
}

let padrao: MemoriaDeTraducao | null = null;

/** A memória da aplicação: IndexedDB do usuário + semente do Tatoeba. Uma por página. */
export function memoriaPadrao(): MemoriaDeTraducao {
  return (padrao ??= criarMemoriaEmCamadas({ usuario: armazemPadrao(), semente: criarSemente() }));
}

/**
 * Busca em qualquer armazém: a memória em camadas usa as camadas; um armazém simples (teste,
 * injeção) só sabe a exata, e ela volta como exata do usuário.
 */
export async function buscarNaMemoria(
  memoria: ArmazemDeTraducoes | MemoriaDeTraducao,
  chave: string,
  opts: OpcoesDaBusca = {},
): Promise<ResultadoDaMemoria | undefined> {
  if ('buscar' in memoria) return memoria.buscar(chave, opts);
  const e = await memoria.ler(chave);
  if (!e || (opts.aceitarMotor && !opts.aceitarMotor(e.motor))) return undefined;
  return { ...e, aproximada: false, similaridade: 1, camada: 'usuario' };
}
