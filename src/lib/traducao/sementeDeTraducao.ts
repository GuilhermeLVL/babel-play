/**
 * SEMENTE DA MEMÓRIA DE TRADUÇÃO: frases curtas e frequentes do Tatoeba, já traduzidas por gente
 * (harness adaptativo §1.2, degrau M2). A memória do usuário começa vazia; a semente faz o "Thank
 * you." e o "Good morning." da PRIMEIRA sessão já saírem sem motor nenhum.
 *
 * SÓ LEITURA E ATRÁS DA MEMÓRIA DO USUÁRIO (`memoriaEmCamadas.ts`): a tradução que a pessoa já
 * recebeu e aceitou vence a do Tatoeba. Nada do que ela fala entra aqui.
 *
 * PREGUIÇOSA E FORA DO BUNDLE: o arquivo mora em `public/semente-traducao/<a>-<b>.tsv` (gerado por
 * `scripts/semente-traducao/gerar.mjs`) e só é pedido na primeira busca daquele par. A busca que
 * dispara o download NÃO espera por ele — responde "não sei" e segue para o tradutor —, então a
 * rede lenta ou ausente nunca atrasa uma legenda. Um arquivo serve às duas direções (`en-pt` atende
 * `en→pt` e `pt→en`).
 *
 * QUEM PAGA PELA NUVEM não recebe a semente: o motor dela (`tatoeba`) não está na lista de motores
 * de nuvem que `traducaoDaFala.ts` aceita da memória. É tradução humana, mas de uma frase fora de
 * contexto (o "you" do Tatoeba não sabe se é "você" ou "vocês"); o grátis ganha, o pago segue igual.
 *
 * LICENÇA: Tatoeba, CC BY 2.0 FR — atribuição obrigatória. Vai no cabeçalho de cada arquivo e na
 * tela Sobre (`atribuicaoTatoeba.ts`, traduzida pelo i18n).
 */
import { criarIndiceAproximado, diferencaSegura, separarChave } from './memoriaAproximada';
import type { ResultadoDaMemoria } from './memoriaDeTraducao';
import { chaveNormalizada } from './prepararFala';

/** O "motor" das entradas da semente, para a regra de quem aceita o quê. */
export const MOTOR_DA_SEMENTE = 'tatoeba';

/** Os arquivos publicados, um por par sem direção. */
export const PARES_DA_SEMENTE: readonly string[] = ['en-pt', 'es-pt'];

const RAIZ = '/semente-traducao';

/** `origem \t destino` por linha; `#` abre comentário (o cabeçalho de atribuição). */
export function lerSementeTsv(tsv: string): Array<[string, string]> {
  const fora: Array<[string, string]> = [];
  for (const linha of tsv.split('\n')) {
    if (!linha || linha.startsWith('#')) continue;
    const [a, b] = linha.split('\t');
    if (a?.trim() && b?.trim()) fora.push([a.trim(), b.trim()]);
  }
  return fora;
}

async function baixarSemente(par: string): Promise<string | undefined> {
  try {
    const r = await fetch(`${RAIZ}/${par}.tsv`);
    return r.ok ? await r.text() : undefined;
  } catch {
    return undefined; // offline: a semente só não ajuda nesta sessão
  }
}

export interface OpcoesDaBuscaNaSemente {
  limiar: number;
  consultaOriginal?: string;
}

export interface SementeDeTraducao {
  /** A frase exata. `undefined` também enquanto o par ainda baixa (e aí começa a baixar). */
  exata(chave: string): Promise<ResultadoDaMemoria | undefined>;
  /** A frase parecida o bastante e com diferença segura (ver `memoriaAproximada.ts`). */
  aproximada(chave: string, opts: OpcoesDaBuscaNaSemente): Promise<ResultadoDaMemoria | undefined>;
}

interface OpcoesDaSemente {
  /** Quem busca o TSV de um par (`en-pt`). Injeção para teste; o padrão é `fetch` em `public/`. */
  carregar?: (par: string) => Promise<string | undefined>;
}

export function criarSemente(opts: OpcoesDaSemente = {}): SementeDeTraducao {
  const carregar = opts.carregar ?? baixarSemente;
  const traducoes = new Map<string, string>();
  const indice = criarIndiceAproximado();
  const pedidos = new Set<string>();

  const guardar = (a: string, b: string, origem: string, destino: string) => {
    const chave = `${a}|${b}|${chaveNormalizada(origem)}`;
    // Primeira vence: o gerador ordena da frase mais frequente para a menos.
    if (traducoes.has(chave)) return;
    traducoes.set(chave, destino);
    indice.adicionar(chave);
  };

  /** O arquivo que cobre a chave, disparando o download na primeira vez. `true` = já está pronto. */
  const pronto = (chave: string): boolean => {
    const [a, b] = separarChave(chave).par.split('|');
    const arquivo = PARES_DA_SEMENTE.find((p) => p === `${a}-${b}` || p === `${b}-${a}`);
    if (!arquivo) return false;
    if (!pedidos.has(arquivo)) {
      pedidos.add(arquivo);
      const [x, y] = arquivo.split('-');
      void carregar(arquivo).then((tsv) => {
        for (const [ox, oy] of lerSementeTsv(tsv ?? '')) {
          guardar(x, y, ox, oy);
          guardar(y, x, oy, ox);
        }
      });
      return false;
    }
    return true;
  };

  const resultado = (texto: string, aproximada: boolean, similaridade: number): ResultadoDaMemoria => ({
    texto,
    motor: MOTOR_DA_SEMENTE,
    aproximada,
    similaridade,
    camada: 'semente',
  });

  return {
    async exata(chave) {
      if (!pronto(chave)) return undefined;
      const t = traducoes.get(chave);
      return t === undefined ? undefined : resultado(t, false, 1);
    },
    async aproximada(chave, { limiar, consultaOriginal }) {
      if (!pronto(chave)) return undefined;
      const { texto } = separarChave(chave);
      for (const v of indice.buscar(chave, limiar).slice(0, 5)) {
        const t = traducoes.get(v.chave);
        if (t === undefined) continue;
        if (diferencaSegura(texto, separarChave(v.chave).texto, { consultaOriginal, traducaoCandidata: t }))
          return resultado(t, true, v.similaridade);
      }
      return undefined;
    },
  };
}
