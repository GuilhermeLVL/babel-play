/**
 * O PLANO DA REESCRITA DE `norm_key` (openspec `modelo-do-aluno-e-dados`, tarefas 5.2 e 5.3): pura, sem banco.
 *
 * Dada a lista de cartões de UMA pessoa, diz quais mudam de chave ao ir da versão `de` para a `para`
 * (`chaveDedup`), quais já estão certos e quais não dá para tocar. O servidor aplica o plano em lotes
 * (`server/operacao/chaveDeDuplicata.ts`) e o ensaio só o conta.
 *
 * Regras que o plano garante:
 *  - NUNCA junta nem apaga cartão. Só troca a chave; o cartão e seu histórico ficam.
 *  - Só toca cartão cuja chave de hoje é EXATAMENTE a da versão `de` (o que sobra é `foraDoPadrao`: chave nula,
 *    de outro formato ou de um idioma reetiquetado), então rodar de novo não faz nada (idempotente).
 *  - O índice único é parcial (`deleted_at is null`): só cartão vivo disputa chave. Se a chave nova de um vivo já
 *    é de outro vivo, o cartão fica como está e entra em `conflitos` (só acontece na volta, v2 → v1).
 */
import { chaveDaPalavra, chaveDaPalavraV2, chaveDedup, type VersaoDaChaveDedup } from './palavra';

export interface CartaoParaReescrever {
  id: string;
  word: string;
  srcLang: string | null;
  normKey: string | null;
  /** `deleted_at` preenchido: o cartão não disputa a chave única. */
  apagado: boolean;
}

export interface MudancaDeChave {
  id: string;
  de: string;
  para: string;
  idioma: string;
}

export interface PlanoDeChaves {
  mudam: MudancaDeChave[];
  /** Já estão na chave de destino (ou ela é igual à de origem). */
  iguais: number;
  /** Chave nova já pertence a OUTRO cartão vivo: o cartão fica como está. */
  conflitos: { id: string; chave: string; donoId: string }[];
  /** A chave de hoje não é a da versão `de`: não se mexe. */
  foraDoPadrao: string[];
  /** Quantos cartões mudam de chave, por idioma base. */
  porIdioma: Record<string, number>;
}

const idiomaBase = (l: string | null | undefined) => (l ?? '').toLowerCase().split('-')[0];

export function planejarReescritaDeChaves(
  cartoes: readonly CartaoParaReescrever[],
  de: VersaoDaChaveDedup,
  para: VersaoDaChaveDedup,
): PlanoDeChaves {
  const plano: PlanoDeChaves = { mudam: [], iguais: 0, conflitos: [], foraDoPadrao: [], porIdioma: {} };
  /* Quem é dono de cada chave entre os vivos, na situação de HOJE; as trocas planejadas atualizam o mapa. */
  const dono = new Map<string, string>();
  for (const c of cartoes) if (!c.apagado && c.normKey) dono.set(c.normKey, c.id);

  for (const c of cartoes) {
    const origem = chaveDedup(c.word, c.srcLang, de);
    const destino = chaveDedup(c.word, c.srcLang, para);
    if (c.normKey === destino) {
      plano.iguais++;
      continue;
    }
    if (c.normKey !== origem) {
      plano.foraDoPadrao.push(c.id);
      continue;
    }
    if (!c.apagado) {
      const outro = dono.get(destino);
      if (outro && outro !== c.id) {
        plano.conflitos.push({ id: c.id, chave: destino, donoId: outro });
        continue;
      }
      dono.delete(origem);
      dono.set(destino, c.id);
    }
    const idioma = idiomaBase(c.srcLang);
    plano.mudam.push({ id: c.id, de: origem, para: destino, idioma });
    plano.porIdioma[idioma] = (plano.porIdioma[idioma] ?? 0) + 1;
  }
  return plano;
}

/**
 * A PROVA DE FUSÃO: uma frase guardada do cartão traz uma palavra que a chave v1 tratava como a mesma e a v2 trata
 * como outra. Ex.: cartão `ano` com a frase "ele fez dez años" — o cartão juntou `ano` e `año`. Só ocorrência assim
 * justifica separar de novo (decisão do dono, tarefa 5.3); o ensaio apenas CONTA.
 */
export function cartaoComProvaDeFusao(
  palavra: string,
  idioma: string | null | undefined,
  frases: readonly (string | null | undefined)[],
): boolean {
  const base = idiomaBase(idioma);
  const v1 = chaveDaPalavra(palavra);
  const v2 = chaveDaPalavraV2(palavra, base);
  if (!v1) return false;
  for (const frase of frases) {
    if (!frase) continue;
    for (const token of frase.split(/[^\p{L}\p{M}\p{N}]+/u)) {
      if (token && chaveDaPalavra(token) === v1 && chaveDaPalavraV2(token, base) !== v2) return true;
    }
  }
  return false;
}

/** Uma palavra marcada sem cartão (`palavras_marcadas`): o idioma é o base. */
export interface MarcadaParaReescrever {
  lang: string;
  chave: string;
  estado: string;
}

export interface PlanoDeMarcadas {
  /** Linhas a CRIAR (a original fica). Só na ida (v1 → v2). */
  inserir: MarcadaParaReescrever[];
  /** Volta (v2 → v1): linhas que trocam de chave. */
  mover: { lang: string; de: string; para: string; estado: string }[];
  /** Volta: linhas que saem porque a chave v1 de destino já existe (o estado do destino prevalece). */
  apagar: { lang: string; chave: string }[];
  /** Ida: marcadas que nenhuma palavra conhecida da pessoa desdobra (ficam como estão). */
  semDesdobra: number;
}

/**
 * O PLANO DA REESCRITA DE `palavras_marcadas.chave` (openspec `modelo-do-aluno-e-dados`, 5.3). A tabela guarda só a
 * chave, não a palavra: a v1 (`ano`) perdeu a informação de que podia ser `año`. Por isso a IDA nunca troca nem
 * apaga: a linha v1 continua (ela é também uma chave v2 válida, a da forma sem marca) e, para cada palavra
 * CONHECIDA da pessoa (cartões e falas) cuja chave v1 é a marcada e cuja v2 é outra, cria a linha v2 com o mesmo
 * estado. Palavra nunca vista não ganha linha: a marcação dela só vale para a forma sem marca.
 * A VOLTA (v2 → v1) leva cada linha à chave v1 (`chaveDaPalavra` da chave v2 é a v1); se o destino já existe, a
 * linha que sai é apagada e o estado do destino prevalece.
 */
export function planejarReescritaDeMarcadas(
  marcadas: readonly MarcadaParaReescrever[],
  palavras: readonly { palavra: string; lang: string }[],
  para: VersaoDaChaveDedup,
): PlanoDeMarcadas {
  const plano: PlanoDeMarcadas = { inserir: [], mover: [], apagar: [], semDesdobra: 0 };
  const existe = new Set(marcadas.map((m) => `${m.lang}|${m.chave}`));
  if (para === 2) {
    const porV1 = new Map<string, Set<string>>();
    for (const p of palavras) {
      const lang = idiomaBase(p.lang);
      const v1 = chaveDaPalavra(p.palavra);
      const v2 = chaveDaPalavraV2(p.palavra, lang);
      if (!v1 || v1 === v2) continue;
      const k = `${lang}|${v1}`;
      (porV1.get(k) ?? porV1.set(k, new Set()).get(k)!).add(v2);
    }
    for (const m of marcadas) {
      const desdobra = porV1.get(`${m.lang}|${m.chave}`);
      if (!desdobra) {
        plano.semDesdobra++;
        continue;
      }
      for (const v2 of [...desdobra].sort()) {
        const k = `${m.lang}|${v2}`;
        if (existe.has(k)) continue;
        existe.add(k);
        plano.inserir.push({ lang: m.lang, chave: v2, estado: m.estado });
      }
    }
    return plano;
  }
  for (const m of marcadas) {
    const v1 = chaveDaPalavra(m.chave);
    if (!v1 || v1 === m.chave) continue;
    if (existe.has(`${m.lang}|${v1}`)) plano.apagar.push({ lang: m.lang, chave: m.chave });
    else {
      existe.add(`${m.lang}|${v1}`);
      plano.mover.push({ lang: m.lang, de: m.chave, para: v1, estado: m.estado });
    }
    existe.delete(`${m.lang}|${m.chave}`);
  }
  return plano;
}
