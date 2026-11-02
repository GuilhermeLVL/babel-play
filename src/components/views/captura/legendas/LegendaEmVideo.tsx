import { useEffect, useMemo, useRef, useState } from 'react';

import { type Formato, ladoDoAvatarNoQuadro } from '../../../../core/legendas/janelaFlutuante';
import { FLAG_AVATAR_3D } from '../../../../core/planos';
import { useAvatarDoPip } from '../../../../lib/avatar/avatarDoPip';
import { avancar, type EstadoDoRitmo, RITMO_VAZIO, saltarParaOFim } from '../../../../lib/captura/ritmoDaLegenda';
import { useFlag } from '../../../../lib/flags';
import { t } from '../../../../lib/i18n';
import { DIMENSOES_DO_QUADRO, type LegendaEmVideo as Controlador } from '../../../../lib/legendas/legendaEmVideo';
import PonteDoAvatarNoVideo from '../../../avatar/PonteDoAvatarNoVideo';
import { fundoResolvido, lerAparencia } from './aparenciaDaLegenda';
import type { LegendaAoVivo } from './LinhaDaLegenda';

/** Quantas falas cada formato desenha no quadro do vídeo. */
const FALAS_NO_QUADRO: Readonly<Record<Formato, number>> = { faixa: 1, legenda: 2, conversa: 4, estudo: 1 };

/**
 * O QUE O PiP DE VÍDEO MOSTRA (Safari): a mesma fila com ritmo de leitura das outras janelas, desenhada
 * no canvas de `lib/legendas/legendaEmVideo` — e só quando algo muda. Não renderiza nada na página.
 *
 * `pausado` vem de quem abriu (o controle do navegador pausa); pausada, a janela congela onde estava,
 * e ao continuar pula para a mais recente, como as outras.
 */
export default function LegendaEmVideo({
  aberta,
  controlador,
  falas,
  formato,
  pausado,
  seloDePausa = pausado,
  glosas,
}: {
  aberta: boolean;
  controlador: Controlador | null;
  falas: LegendaAoVivo[];
  formato: Formato;
  pausado: boolean;
  /**
   * Desenhar o selo "Pausada". Não quando quem pausou foi o botão da janelinha do Safari: ali o VÍDEO
   * para, o quadro novo nem chegaria a aparecer, e o próprio botão já mostra a pausa.
   */
  seloDePausa?: boolean;
  /**
   * A glosa do assistente ao vivo por fala (Fase C2): no máximo UMA linha curta embaixo da legenda, a da fala mais nova
   * à vista. Na faixa (jogo), nenhuma: lá fica só o texto.
   */
  glosas?: ReadonlyMap<string, string>;
}) {
  /* A aparência guardada (fundo, o que mostrar, letra, ritmo), relida a cada abertura. */
  const [ap, setAp] = useState(lerAparencia);
  useEffect(() => {
    if (aberta) setAp(lerAparencia());
  }, [aberta]);
  const [temaEscuro, setTemaEscuro] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    if (!aberta) return;
    const ler = () => setTemaEscuro(document.documentElement.classList.contains('dark'));
    ler(); // o tema pode ter mudado com a janela fechada
    const obs = new MutationObserver(ler);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [aberta]);

  const comTexto = useMemo(() => falas.filter((f) => f.original.trim()), [falas]);
  const doRitmo = useMemo(
    () => comTexto.map((f) => ({ id: f.id, caracteres: f.original.length + (f.traducao?.length ?? 0) })),
    [comTexto],
  );
  const [ritmo, setRitmo] = useState<EstadoDoRitmo>(RITMO_VAZIO);
  const [tique, setTique] = useState(0);
  /* A janela nasce na fala mais recente (o passado não entra em fila). */
  useEffect(() => {
    if (aberta) setRitmo(saltarParaOFim(RITMO_VAZIO, doRitmo, Date.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [aberta]);
  useEffect(() => {
    if (!aberta || pausado) return;
    const { estado, proximaEmMs } = avancar(ritmo, doRitmo, Date.now(), ap.leitura);
    if (estado !== ritmo) setRitmo(estado);
    if (proximaEmMs === null) return;
    const id = window.setTimeout(() => setTique((n) => n + 1), proximaEmMs + 16);
    return () => window.clearTimeout(id);
  }, [ritmo, doRitmo, aberta, pausado, tique, ap.leitura]);
  /* Continuar volta ao fim: o que chegou na pausa entra de uma vez. */
  const estavaPausado = useRef(pausado);
  useEffect(() => {
    if (estavaPausado.current && !pausado) setRitmo((r) => saltarParaOFim(r, doRitmo, Date.now()));
    estavaPausado.current = pausado;
  }, [pausado, doRitmo]);

  const reveladas = new Set(ritmo.reveladas);
  const aVista = comTexto.filter((f) => reveladas.has(f.id)).slice(-FALAS_NO_QUADRO[formato]);
  /* Pausada, a janela para onde estava (as falas que chegam esperam). */
  const [congeladas, setCongeladas] = useState<LegendaAoVivo[] | null>(null);
  const aVistaRef = useRef(aVista);
  aVistaRef.current = aVista;
  useEffect(() => setCongeladas(pausado ? aVistaRef.current : null), [pausado]);
  const desenhadas = congeladas ?? aVista;
  const maisNova = desenhadas[desenhadas.length - 1];
  const glosa = formato !== 'faixa' && maisNova ? glosas?.get(maisNova.id) : undefined;

  /* O AVATAR no quadro do vídeo (flag `avatar_3d`, só nos formatos horizontais): a ponte copia o canvas WebGL oculto. */
  const flagDoAvatar = useFlag(FLAG_AVATAR_3D);
  const doPip = useAvatarDoPip();
  const avatarPublicado = doPip.ativo;
  const soletracaoLigada = !!doPip.soletracao;
  const comAvatar = flagDoAvatar && avatarPublicado && formato !== 'estudo';
  const ladoDoAvatar = ladoDoAvatarNoQuadro(formato, DIMENSOES_DO_QUADRO[formato]);

  const quadro = {
    falas: desenhadas.map((f) => ({ original: f.original, traducao: f.traducao || undefined, quem: f.quem })),
    formato,
    fundo: fundoResolvido(ap.fundo, temaEscuro),
    mostrar: ap.mostrar,
    escala: ap.tam / 100,
    pausado: seloDePausa,
    ...(glosa ? { glosa } : {}),
    ...(comAvatar && aberta ? { avatar: { lado: ladoDoAvatar } } : {}),
    ...(comAvatar && aberta && soletracaoLigada ? { avisoDaSoletracao: t('Demonstração · não é tradução') } : {}),
    textos: { vazio: t('Esperando a primeira fala'), pausada: t('Pausada') },
  };
  /* O controlador compara a chave e só pinta o que mudou. */
  useEffect(() => {
    if (aberta) controlador?.desenhar(quadro);
  });

  return comAvatar && aberta && controlador ? (
    <PonteDoAvatarNoVideo controlador={controlador} lado={ladoDoAvatar} />
  ) : null;
}
