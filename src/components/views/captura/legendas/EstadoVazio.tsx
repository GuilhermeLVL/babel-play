import { AudioLines, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { NIVEL_DE_SOM, SEM_SOM_APOS_MS, suavizarNivel } from '../../../../core/legendas/janelaFlutuante';
import { t } from '../../../../lib/i18n';

/** O que a janela sabe da escuta enquanto ainda não há fala: de onde vem o som e o nível dele. */
export interface EscutaDaJanela {
  /** Do que se trata, já traduzido ("Ouvindo o som da aba"). */
  rotulo: string;
  /** A captura está rodando. Falso: a janela diz que está parada, em vez de "ouvindo". */
  gravando: boolean;
  /** O pico do nível (0..1) que as fontes de áudio escrevem; esta peça o lê e zera a cada amostra. */
  nivelRef?: { current: number };
}

const BARRAS = 5;
const AMOSTRA_MS = 120;

/**
 * O ESTADO VAZIO da legenda flutuante: em vez de um retângulo mudo, uma linha compacta com o que está
 * acontecendo — de onde se ouve, um medidor do som que chega e, se passar um tempo sem som algum, a dica
 * do que fazer. Some sozinho com a primeira fala (quem o desenha é o corpo da janela).
 */
export default function EstadoVazio({ escuta }: { escuta?: EscutaDaJanela }) {
  const raiz = useRef<HTMLParagraphElement>(null);
  const [nivel, setNivel] = useState(0);
  const [semSom, setSemSom] = useState(false);
  const gravando = escuta?.gravando ?? false;
  const nivelRef = escuta?.nivelRef;

  useEffect(() => {
    if (!gravando || !nivelRef) return;
    /* O relógio da janela dona (a PiP tem o dela; o da página principal é freado quando ela vai ao fundo). */
    const win = raiz.current?.ownerDocument.defaultView ?? window;
    const inicio = Date.now();
    let visto = false;
    let atual = 0;
    const id = win.setInterval(() => {
      const bruto = nivelRef.current;
      nivelRef.current = 0;
      atual = suavizarNivel(atual, bruto);
      if (bruto >= NIVEL_DE_SOM) visto = true;
      setNivel(atual);
      setSemSom(!visto && Date.now() - inicio >= SEM_SOM_APOS_MS);
    }, AMOSTRA_MS);
    return () => win.clearInterval(id);
  }, [gravando, nivelRef]);

  if (!escuta) {
    return (
      <p className="leg-vazio" role="status">
        <AudioLines aria-hidden />
        {t('Esperando a primeira fala')}
      </p>
    );
  }
  const acesas = Math.min(BARRAS, Math.round(nivel * BARRAS * 1.6));
  return (
    <p ref={raiz} className="leg-vazio leg-escuta" role="status" data-gravando={gravando || undefined}>
      {semSom ? <VolumeX aria-hidden /> : <AudioLines aria-hidden />}
      <span className="leg-escuta-txt">
        {!gravando
          ? t('A captura está parada')
          : semSom
            ? t('Nenhum som chegou ainda. Dê play em algo.')
            : `${escuta.rotulo} · ${t('esperando a primeira fala')}`}
      </span>
      {gravando && (
        <span className="leg-nivel" aria-hidden>
          {Array.from({ length: BARRAS }, (_, i) => (
            <i key={i} className={i < acesas ? 'acesa' : undefined} />
          ))}
        </span>
      )}
    </p>
  );
}
