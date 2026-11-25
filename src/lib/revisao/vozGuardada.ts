/**
 * "GUARDAR MINHA VOZ NESTE CARTÃO" — as gravações de "Minha voz", SÓ NESTE APARELHO.
 *
 * No protótipo é `CX.voz[cartao]` (`cartoes2.js:39`, `cartoes4.js:345-385`): uma lista por cartão, com
 * a onda, a duração e o áudio. Aqui a lista mora no IndexedDB do navegador. NADA SOBE AO SERVIDOR: não
 * existe rota para a voz da pessoa, e este módulo não fala com a rede.
 *
 * O que vale:
 *  · desligado de fábrica (`lerVozNaRevisao().guardarVoz`); quem liga é a pessoa, na folha;
 *  · uma gravação por dia e por cartão (gravar de novo no mesmo dia troca a de hoje, como o protótipo
 *    troca a "você hoje"), e no máximo `MAXIMO_POR_CARTAO` por cartão: a mais antiga sai;
 *  · "Apagar" tira todas as gravações do cartão; cada gravação leva o DONO (`lib/armazemLocalPorConta`):
 *    a de outra conta não aparece e sai, a guarda nasce no boot e sair, limpar tudo e excluir a conta apagam tudo (a voz
 *    de uma pessoa não fica à espera da próxima conta);
 *  · sem IndexedDB (navegação privada, banco bloqueado), guardar não dá certo e a folha diz isso.
 */
import { registrarArmazemPorConta } from '../armazemLocalPorConta';
import { criarBancoPorConta } from '../bancoLocalPorConta';

export interface GravacaoGuardada {
  /** Quando foi gravada (ms). */
  em: number;
  /** A onda, já em barras de 0,08 a 1 (`reamostrar`). */
  picos: number[];
  /** A duração (ms). */
  dur: number;
  audio: Blob;
}

interface Linha {
  chave: string;
  cartao: string;
  dia: string;
  em: number;
  picos: number[];
  dur: number;
  bytes: ArrayBuffer;
  tipo: string;
  /** A conta que gravou; sem ele, a linha é de antes da regra e não é de ninguém. */
  dono?: string;
}

export const MAXIMO_POR_CARTAO = 12;
/** Uma frase não passa de 8 s; acima disto não é uma gravação desta tela. */
export const MAIOR_GRAVACAO_BYTES = 2 * 1024 * 1024;

const BANCO = 'babel-minha-voz';
const GRAVACOES = 'gravacoes';

const pedido = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });

const diaDe = (em: number): string => {
  const d = new Date(em);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface VozesGuardadas {
  /** As gravações do cartão, da mais antiga à mais nova. */
  listar(cartao: string): Promise<GravacaoGuardada[]>;
  /** Guarda (ou troca a de hoje). Devolve se guardou. */
  guardar(cartao: string, g: { picos: number[]; dur: number; audio: Blob }): Promise<boolean>;
  apagar(cartao: string): Promise<void>;
  limpar(): Promise<void>;
}

export function criarVozesGuardadas(
  o: { fabrica?: IDBFactory | null; agora?: () => number; dono?: () => string | null } = {},
): VozesGuardadas & { purgarDeOutros(): Promise<void>; destruir(): Promise<void> } {
  const agora = o.agora ?? (() => Date.now());
  const b = criarBancoPorConta<Linha>({
    banco: BANCO,
    loja: GRAVACOES,
    chave: 'chave',
    aoCriar: (loja) => loja.createIndex('cartao', 'cartao'),
    fabrica: o.fabrica,
    dono: o.dono,
  });
  const abrir = b.abrir;

  const linhasDe = async (db: IDBDatabase, cartao: string, dono: string): Promise<Linha[]> => {
    const linhas = (await b.soDoDono(db, dono)).filter((l) => l.cartao === cartao);
    return linhas.sort((x, y) => x.em - y.em);
  };

  return {
    async listar(cartao) {
      try {
        const dono = b.dono();
        if (!dono) return [];
        const db = await abrir();
        if (!db) return [];
        return (await linhasDe(db, cartao, dono)).map((l) => ({
          em: l.em,
          picos: l.picos,
          dur: l.dur,
          audio: new Blob([l.bytes], { type: l.tipo }),
        }));
      } catch {
        return [];
      }
    },
    async guardar(cartao, g) {
      try {
        const dono = b.dono();
        if (!dono || !g.audio.size || g.audio.size > MAIOR_GRAVACAO_BYTES) return false;
        const db = await abrir();
        if (!db) return false;
        const em = agora();
        const dia = diaDe(em);
        const bytes = await g.audio.arrayBuffer();
        const antigas = (await linhasDe(db, cartao, dono)).filter((l) => l.dia !== dia);
        const loja = b.loja(db, 'readwrite');
        /* a mais antiga sai quando o cartão já tem o máximo (contando a de hoje, que entra agora) */
        for (const l of antigas.slice(0, Math.max(0, antigas.length + 1 - MAXIMO_POR_CARTAO)))
          void loja.delete(l.chave);
        const linha: Linha = {
          chave: `${cartao}|${dia}`,
          cartao,
          dia,
          em,
          picos: g.picos.slice(),
          dur: g.dur,
          bytes,
          tipo: g.audio.type || 'audio/webm',
          dono,
        };
        await pedido(loja.put(linha));
        return true;
      } catch {
        return false;
      }
    },
    async apagar(cartao) {
      try {
        const dono = b.dono();
        if (!dono) return;
        const db = await abrir();
        if (!db) return;
        const linhas = await linhasDe(db, cartao, dono);
        const loja = b.loja(db, 'readwrite');
        await Promise.all(linhas.map((l) => pedido(loja.delete(l.chave))));
      } catch {
        /* nada guardado, nada a apagar */
      }
    },
    limpar: b.apagarTudo,
    purgarDeOutros: b.purgarDeOutros,
    destruir: b.destruir,
  };
}

let doAparelho: ReturnType<typeof criarVozesGuardadas> | null = null;

const doDispositivo = () => (doAparelho ??= criarVozesGuardadas());

registrarArmazemPorConta({
  nome: 'minha-voz-do-cartao',
  apagarTudo: () => doDispositivo().limpar(),
  purgarDeOutros: () => doDispositivo().purgarDeOutros(),
  destruir: () => doDispositivo().destruir(),
});

/** As gravações deste aparelho. Trocar de conta apaga todas (guarda comum: `lib/armazemLocalPorConta`). */
export function vozesGuardadas(): VozesGuardadas {
  return doDispositivo();
}

/** Só para testes: esquece as gravações do aparelho. */
export function _reiniciarVozesGuardadas(): void {
  doAparelho = null;
}

/** "você hoje", "você em março", "você em 12 de março" (quando há mais de uma no mesmo mês). */
export function rotuloDaGravacao(em: number, todas: readonly number[], agora: number, idioma = 'pt-BR'): string {
  if (diaDe(em) === diaDe(agora)) return 'hoje';
  const d = new Date(em);
  const mesmoMes = todas.filter((x) => {
    const y = new Date(x);
    return y.getFullYear() === d.getFullYear() && y.getMonth() === d.getMonth() && diaDe(x) !== diaDe(agora);
  }).length;
  const outroAno = d.getFullYear() !== new Date(agora).getFullYear();
  return d.toLocaleDateString(idioma, {
    ...(mesmoMes > 1 ? { day: 'numeric' } : {}),
    month: 'long',
    ...(outroAno ? { year: 'numeric' } : {}),
  });
}
