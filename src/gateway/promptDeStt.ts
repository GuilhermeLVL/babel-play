/**
 * O PROMPT DE CONTEXTO DO STT DE NUVEM — a última fala FINAL da mesma fonte, no mesmo idioma.
 *
 * O Whisper aceita um `prompt`: o texto que veio antes do trecho. Com ele o modelo mantém a grafia
 * de nomes próprios, o estilo de pontuação e, sobretudo, o FIO DA FRASE — o corte do VAD parte
 * frases (o forçado, a cada 6/12 s, parte no meio da palavra), e sem contexto cada metade é
 * transcrita como se fosse o começo de uma conversa.
 *
 * Por que MESMA FONTE: sistema e microfone são duas conversas diferentes (o vídeo e você). A sua
 * última frase como prompt do trecho do vídeo empurraria o modelo para o SEU vocabulário.
 * Por que MESMO IDIOMA: um prompt em inglês num trecho em espanhol puxa a decodificação para o
 * inglês — é o jeito documentado de induzir o Whisper a TRADUZIR sem querer. Idioma desconhecido
 * (dica vazia) é "não sei se é o mesmo": sem prompt.
 *
 * Contrato com o servidor: cabeçalho `x-stt-prompt` = `encodeURIComponent(texto)`, até 224
 * caracteres (o FIM do texto, que é o que encosta no trecho novo). O Whisper corta o prompt em 224
 * TOKENS; caracteres é o limite conservador e barato de medir aqui.
 */
import { baseLang } from '@core/texto/idioma';

export const MAX_PROMPT_STT = 224;

/** Fica com o FIM do texto, até o teto, sem começar no meio de uma palavra. */
export function cortarPrompt(texto: string): string {
  const t = texto.trim();
  if (t.length <= MAX_PROMPT_STT) return t;
  const fim = t.slice(-MAX_PROMPT_STT);
  const espaco = fim.indexOf(' ');
  // Uma "palavra" de 224 caracteres (URL, texto sem espaço) não tem onde cortar: vai o fim cru.
  return (espaco >= 0 ? fim.slice(espaco + 1) : fim).trim();
}

type Fonte = 'system' | 'mic';

/** A última final de cada fonte, com o idioma em que ela foi transcrita. Uma instância por tela. */
export class ContextoDoStt {
  private ultimo = new Map<Fonte, { texto: string; idioma: string }>();

  registrar(fonte: Fonte, texto: string, idioma: string | undefined): void {
    const t = texto.trim();
    if (!t) return;
    this.ultimo.set(fonte, { texto: t, idioma: baseLang(idioma || '') });
  }

  promptPara(fonte: Fonte, idioma: string | undefined): string | undefined {
    const u = this.ultimo.get(fonte);
    const l = baseLang(idioma || '');
    if (!u || !l || u.idioma !== l) return undefined;
    return cortarPrompt(u.texto) || undefined;
  }

  /**
   * O idioma em que a última final DESTA fonte foi transcrita ('' = nenhuma ainda). No "Detectar",
   * é o idioma que o Whisper MEDIU pelo áudio da fala inteira — a dica provisória dos parciais da
   * fala seguinte, enquanto o perfil da sessão ainda não convergiu.
   */
  idiomaDe(fonte: Fonte): string {
    return this.ultimo.get(fonte)?.idioma ?? '';
  }

  limpar(): void {
    this.ultimo.clear();
  }
}
