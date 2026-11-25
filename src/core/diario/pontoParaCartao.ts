/**
 * DA CORREÇÃO AO CARTÃO (openspec `diario-com-correcao-que-vira-cartao`, "Cada correção pode virar um cartão da pessoa").
 * Um ponto do retorno (`trecho` errado, `dica`, `exemplo` corrigido) vira um cartão do ERRO DA PRÓPRIA PESSOA:
 *
 *   frase    = a frase da pessoa onde o trecho está, com o trecho trocado pelo exemplo (a frase CORRIGIDA)
 *   palavra  = o exemplo corrigido (é o que a pessoa precisa lembrar)
 *   lacuna   = `makeCloze(frase corrigida, exemplo)`: a frente esconde SÓ o exemplo, nunca o entrega
 *   verso    = o exemplo corrigido e a dica
 *
 * Nenhuma chamada de IA: o cartão nasce do retorno já pago. Sem lacuna possível (a frase é só o exemplo, ou o trecho
 * não está no texto), o ponto é RECUSADO com motivo, em vez de gerar um cartão que já traz a resposta na frente.
 * A régua de qualidade e a deduplicação por (palavra, idioma) continuam no `bulk-add` do servidor.
 *
 * Puro: sem DOM, sem rede.
 */
import { makeCloze } from '../learning/cloze';

export interface PontoDoDiario {
  trecho: string;
  dica: string;
  exemplo: string;
}

export interface CartaoDoDiario {
  /** O exemplo corrigido (a chave do cartão). */
  word: string;
  /** O exemplo corrigido e a dica. */
  back: string;
  /** A frase da pessoa, já corrigida. */
  sentence: string;
  clozePrompt: string;
  clozeAnswer: string;
  srcLang: string;
  tgtLang: string;
}

export type MotivoDaRecusaDoPonto =
  | 'sem_trecho'
  | 'sem_exemplo'
  | 'trecho_fora_do_texto'
  | 'sem_correcao'
  | 'lacuna_indisponivel';

/** A etiqueta que marca o cartão como vindo do diário (já normalizada: `normalizarEtiqueta('do diário')`). */
export const ETIQUETA_DO_DIARIO = 'do-diário';

const junta = (s: string): string => s.replace(/\s+/g, ' ').trim();
const baixo = (s: string): string => junta(s).toLocaleLowerCase();

/** As frases do texto da pessoa (por pontuação final e por linha). */
export function frasesDoTexto(texto: string): string[] {
  return texto
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map(junta)
    .filter(Boolean);
}

export function pontoParaCartao(
  ponto: PontoDoDiario,
  texto: string,
  idioma: string,
  idiomaDaPessoa = 'pt',
): { ok: true; cartao: CartaoDoDiario } | { ok: false; motivo: MotivoDaRecusaDoPonto } {
  const trecho = junta(ponto.trecho ?? '');
  const exemplo = junta(ponto.exemplo ?? '');
  const dica = junta(ponto.dica ?? '');
  if (!trecho) return { ok: false, motivo: 'sem_trecho' };
  if (!exemplo) return { ok: false, motivo: 'sem_exemplo' };
  if (baixo(trecho) === baixo(exemplo)) return { ok: false, motivo: 'sem_correcao' };

  const frase = frasesDoTexto(texto).find((f) => baixo(f).includes(baixo(trecho)));
  if (!frase) return { ok: false, motivo: 'trecho_fora_do_texto' };
  const inicio = baixo(frase).indexOf(baixo(trecho));
  const corrigida = junta(frase.slice(0, inicio) + exemplo + frase.slice(inicio + trecho.length));

  const lacuna = makeCloze(corrigida, exemplo);
  if (!lacuna || lacuna.prompt.toLocaleLowerCase().includes(baixo(exemplo))) {
    return { ok: false, motivo: 'lacuna_indisponivel' };
  }
  return {
    ok: true,
    cartao: {
      word: exemplo,
      back: dica ? `${exemplo} — ${dica}` : exemplo,
      sentence: corrigida,
      clozePrompt: lacuna.prompt,
      clozeAnswer: lacuna.answer,
      srcLang: idioma,
      tgtLang: idiomaDaPessoa,
    },
  };
}
