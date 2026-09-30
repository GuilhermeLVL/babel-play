import { memo, type RefObject, useEffect, useRef } from 'react';

import { reduzirEfeitos } from '../../../lib/dispositivo/perfil';

/**
 * AS ONDAS DO NÍVEL — as cinco barrinhas que seguem o áudio capturado ("Grátis sem travar", A2).
 *
 * POR QUE É UMA FOLHA. O amostrador morava na `LiveCapture` como um `setLevels` a cada 50 ms: a tela
 * de ~4 mil linhas re-renderizava INTEIRA 20 vezes por segundo só para mexer cinco barras, e no
 * aparelho fraco isso sozinho disputava o main thread com a legenda. Aqui não há estado React: o
 * laço lê o pico que as fontes de áudio escrevem em `nivelRef` (o `currentLevelRef` da tela) e
 * escreve `style.height` direto nos cinco `<i>`. O pai não fica sabendo.
 *
 * O MESMO DESENHO DE ANTES. Histórico de ~2,4 s (48 amostras a 20 fps), as cinco barras lendo as
 * mesmas posições dele, altura = nível × 120 % com piso de 18 % no computador e 20 % no celular, o
 * pico decaindo a 0,55 por amostra. As classes (`ondas`, `cel-ondas`) são as do sistema visual.
 *
 * O LAÇO. Um `setInterval` no ritmo (20 fps; 8 no modo leve ou com movimento reduzido — ali a barra
 * andando é justamente o efeito que a pessoa pediu para cortar) que pede UM `requestAnimationFrame`
 * por amostra: a escrita cai no quadro, e com a aba escondida o rAF não roda — nada é pintado à toa.
 */
const JANELA_MS = 2_400;
const BARRAS = [0, 1, 2, 3, 4];
const DECAIMENTO = 0.55;

function movimentoReduzido(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function OndasDoNivel({
  nivelRef,
  ativo,
  variante = 'computador',
}: {
  /** O pico do nível instantâneo (0..1) que as fontes escrevem; o laço lê e o faz decair. */
  nivelRef: RefObject<number>;
  /** Gravando e sem pausa. Falso: o laço para e as barras ficam no piso. */
  ativo: boolean;
  variante?: 'computador' | 'celular';
}) {
  const caixaRef = useRef<HTMLSpanElement>(null);
  const piso = variante === 'celular' ? 20 : 18;

  useEffect(() => {
    const barras = Array.from(caixaRef.current?.children ?? []) as HTMLElement[];
    // O pico guardado na pausa (ou na sessão anterior) não pode aparecer na volta.
    nivelRef.current = 0;
    if (!ativo) {
      for (const b of barras) b.style.height = `${piso}%`;
      return;
    }
    const intervaloMs = reduzirEfeitos() || movimentoReduzido() ? 125 : 50;
    const historico: number[] = new Array(Math.round(JANELA_MS / intervaloMs)).fill(0);
    let quadro = 0;
    const amostrar = () => {
      quadro = 0;
      const v = nivelRef.current;
      nivelRef.current = v * DECAIMENTO; // decai para o pico "cair" entre amostras
      historico.shift();
      historico.push(v);
      for (const k of BARRAS) {
        const nivel = historico[Math.floor((k * historico.length) / BARRAS.length)] ?? 0;
        const b = barras[k];
        if (b) b.style.height = `${Math.round(Math.max(piso, Math.min(100, nivel * 120)))}%`;
      }
    };
    const ritmo = setInterval(() => {
      if (!quadro) quadro = requestAnimationFrame(amostrar);
    }, intervaloMs);
    return () => {
      clearInterval(ritmo);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [ativo, nivelRef, piso]);

  return (
    <span ref={caixaRef} className={variante === 'celular' ? 'cel-ondas' : 'ondas'} aria-hidden>
      {BARRAS.map((k) => (
        <i
          key={k}
          style={variante === 'celular' ? { height: `${piso}%` } : { height: `${piso}%`, animation: 'none' }}
        />
      ))}
    </span>
  );
}

export default memo(OndasDoNivel);
