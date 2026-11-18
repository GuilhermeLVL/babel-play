/**
 * A FICHA DE UM TEXTO DA LEITURA ATIVA (spec `leitura-ativa-acervo`) e o validador puro que o teste do acervo
 * roda em todos os textos. Uma ficha inválida quebra o TESTE, nunca a tela: o validador não lança, devolve a lista
 * de problemas com o id do texto, o número da pergunta e a palavra.
 */
import { dividirTexto, mesmoLema } from './textoDaLeitura';

export type NivelDoTexto = 'A1' | 'A2' | 'B1';
export const NIVEIS_DO_TEXTO: readonly NivelDoTexto[] = ['A1', 'A2', 'B1'];

/** "Nível 1 · A1": o número que a tela mostra para cada nível do acervo. */
export const nivelNumerico = (n: NivelDoTexto): 1 | 2 | 3 => (n === 'A1' ? 1 : n === 'A2' ? 2 : 3);

export interface PerguntaDoTexto {
  /** O enunciado, em inglês. */
  pergunta: string;
  /** O enunciado em português ("Ver em português"; no Nível 1 aparece junto por padrão). */
  traducao: string;
  opcoes: string[];
  /** O índice da opção certa em `opcoes`. */
  correta: number;
  /** Por que a certa é a certa, em português (aparece depois da segunda tentativa). */
  explicacao: string;
}

export interface FichaDeTexto {
  id: string;
  titulo: string;
  nivel: NivelDoTexto;
  categoria: string;
  texto: string;
  /** 3 a 10 palavras do texto que valem a pena (podem estar flexionadas no texto). */
  palavrasAlvo: string[];
  perguntas: PerguntaDoTexto[];
  tarefaDeEscrita: { reescrever: string; opinar: string };
  licenca: string;
  autoria: string;
}

export interface ProblemaDaFicha {
  id: string;
  mensagem: string;
}

const textoCheio = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function validarFicha(ficha: unknown): ProblemaDaFicha[] {
  if (!ficha || typeof ficha !== 'object') return [{ id: '?', mensagem: 'a ficha não é um objeto' }];
  const f = ficha as Partial<FichaDeTexto>;
  const id = textoCheio(f.id) ? f.id : '?';
  const problemas: ProblemaDaFicha[] = [];
  const falha = (mensagem: string) => problemas.push({ id, mensagem: `${id}: ${mensagem}` });

  for (const campo of ['id', 'titulo', 'categoria', 'texto', 'licenca', 'autoria'] as const) {
    if (!textoCheio(f[campo])) falha(`campo "${campo}" vazio ou ausente`);
  }
  if (!NIVEIS_DO_TEXTO.includes(f.nivel as NivelDoTexto)) falha(`nível "${String(f.nivel)}" fora de A1, A2, B1`);

  const palavras = textoCheio(f.texto) ? dividirTexto(f.texto, 'en').palavras : [];
  const alvo = Array.isArray(f.palavrasAlvo) ? f.palavrasAlvo : [];
  if (alvo.length < 3 || alvo.length > 10) falha(`palavrasAlvo tem ${alvo.length} (são de 3 a 10)`);
  for (const a of alvo) {
    if (!textoCheio(a)) falha('palavra-alvo vazia');
    else if (!palavras.some((p) => mesmoLema(p.texto, a, 'en'))) falha(`a palavra-alvo "${a}" não está no texto`);
  }

  const perguntas = Array.isArray(f.perguntas) ? f.perguntas : [];
  if (perguntas.length !== 3) falha(`tem ${perguntas.length} perguntas (são 3)`);
  perguntas.forEach((p, i) => {
    const n = `pergunta ${i + 1}`;
    if (!p || typeof p !== 'object') return falha(`${n} não é um objeto`);
    if (!textoCheio(p.pergunta)) falha(`${n} sem enunciado`);
    if (!textoCheio(p.traducao)) falha(`${n} sem tradução do enunciado`);
    if (!textoCheio(p.explicacao)) falha(`${n} sem explicação`);
    const opcoes = Array.isArray(p.opcoes) ? p.opcoes : [];
    if (opcoes.length !== 3 || !opcoes.every(textoCheio)) falha(`${n} precisa de 3 opções preenchidas`);
    if (!Number.isInteger(p.correta) || p.correta < 0 || p.correta >= opcoes.length) {
      falha(`${n}: "correta" = ${String(p.correta)} fora das opções`);
    }
  });

  const tarefa = f.tarefaDeEscrita;
  if (!tarefa || !textoCheio(tarefa.reescrever) || !textoCheio(tarefa.opinar)) {
    falha('tarefaDeEscrita precisa de "reescrever" e "opinar"');
  }
  return problemas;
}
