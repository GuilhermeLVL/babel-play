import { useCallback, useEffect, useRef } from 'react';

/**
 * O QUE A TELA DE CAPTURA PASSA À CONVERSA SEM A RE-RENDERIZAR À TOA (ei/f2).
 *
 * Medido no Playwright com falas injetadas: com 3.000 falas a tela ficava 191 ms por quadro parado
 * e 5.000 falas levavam 8 s do "Parar" ao diálogo. Duas das causas moram aqui:
 *
 *  1. `examineWord`, `speakWord` e `revelarTraducao` são recriados a cada render (fábricas por
 *     render de `lib/captura/*`). Passados crus à `ChatTranscript`, derrubavam o memo dela a cada
 *     tique do relógio de 1 s. `useFuncaoEstavel` dá uma identidade fixa que chama a mais recente.
 *  2. O texto da conversa subia ao App (`onTranscriptChange`) a CADA parcial do streaming, com um
 *     `join` de todas as falas: O(n) por atualização e um render do App inteiro junto. Quem lê esse
 *     texto é o contexto do iChat (contagem de palavras, trecho da tela) — meio segundo de atraso
 *     não muda nada para ele. `useTextoDaConversa` o manda no máximo a cada 500 ms.
 */

/**
 * Função de identidade FIXA que chama sempre a versão mais recente de `fn`. Para callbacks de
 * evento (clique numa palavra, "Mostrar tradução"), nunca para algo lido durante o render.
 */
export function useFuncaoEstavel<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}

/** O texto corrido da conversa, como o App sempre recebeu: as falas na ordem, separadas por espaço. */
export function textoDaConversa<S extends { originalText: string; isPartial?: boolean }>(
  segmentos: ReadonlyArray<S>,
  opcoes?: { semParcial?: boolean | ((s: S) => boolean) },
): string {
  const sem = opcoes?.semParcial;
  /* `true`: nenhum parcial. Função: só os parciais para os quais ela responde `true` (os parciais vivos; os demais seguem como sempre). */
  const fora = (s: S): boolean => !!s.isPartial && (typeof sem === 'function' ? sem(s) : sem === true);
  return (sem ? segmentos.filter((s) => !fora(s)) : segmentos).map((s) => s.originalText).join(' ');
}

/**
 * Manda `textoDaConversa(segmentos)` para `aoMudar` no máximo a cada `intervaloMs`, e só quando o
 * texto mudou. É um ACELERADOR, não um adiador: sob streaming contínuo (parcial a cada ~100 ms) sai
 * a cada intervalo, em vez de esperar uma pausa que pode não vir. Ao desmontar, o pendente sai na
 * hora — a última fala não fica fora do contexto do iChat.
 */
export function useTextoDaConversa<S extends { originalText: string; isPartial?: boolean }>(
  segmentos: ReadonlyArray<S>,
  aoMudar: ((texto: string) => void) | undefined,
  intervaloMs = 500,
  /**
   * Parciais vivos (V6): o texto do parcial em curso não vai ao App (só as falas fechadas). Cada texto novo do parcial era um render do App
   * inteiro, para um contexto do iChat que só lê a conversa fechada. Função: decide POR FALA (só a fala cujo parcial é vivo, isto é, que mora
   * no armazém, fica de fora; as de outra rota seguem com o texto de sempre). Sem a flag, o texto de sempre.
   */
  semParcial: boolean | ((s: S) => boolean) = false,
): void {
  const segmentosRef = useRef(segmentos);
  segmentosRef.current = segmentos;
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  const semParcialRef = useRef(semParcial);
  semParcialRef.current = semParcial;
  const ultimoRef = useRef<string | null>(null);
  const pendenteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitirRef = useRef(() => {
    pendenteRef.current = null;
    const cb = aoMudarRef.current;
    if (!cb) return;
    const texto = textoDaConversa(segmentosRef.current, { semParcial: semParcialRef.current });
    if (texto === ultimoRef.current) return;
    ultimoRef.current = texto;
    cb(texto);
  });

  useEffect(() => {
    if (!aoMudarRef.current || pendenteRef.current) return;
    pendenteRef.current = setTimeout(emitirRef.current, intervaloMs);
  }, [segmentos, intervaloMs]);

  useEffect(() => {
    const emitir = emitirRef.current;
    return () => {
      if (!pendenteRef.current) return;
      clearTimeout(pendenteRef.current);
      emitir();
    };
  }, []);
}
