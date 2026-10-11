import { Play, Trash2 } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';

import { idiomaDaInterface, t } from '../../../../lib/i18n';
import { chegarFicha } from '../../../../lib/polimento/revisao';
import { sentir } from '../../../../lib/polimento/sentidos';
import { gravarVozNaRevisao, lerVozNaRevisao } from '../../../../lib/revisao/preferencias';
import { type GravacaoGuardada, rotuloDaGravacao, vozesGuardadas } from '../../../../lib/revisao/vozGuardada';
import { toast } from '../../../Toast';
import FolhaDeBaixo from '../../captura/celular/FolhaDeBaixo';
import Gravador, { type ControleDoGravador, type Gravado } from './Gravador';
import { CabecalhoDaFolha, FraseMarcada, Interruptor } from './pecas';

/**
 * A FOLHA "MINHA VOZ" — porte de `cxAbrirVoz()` (`cartoes4.js:335-393`): gravar a própria fala, ver a
 * onda, ouvir a original e a sua, comparar no olho e no ouvido. Sem nota e sem reprovar.
 *
 * "Guardar minha voz neste cartão" vem DESLIGADO. Ligado, a gravação fica SÓ NESTE APARELHO
 * (`lib/revisao/vozGuardada.ts`, IndexedDB): nada da voz da pessoa sobe ao servidor. A linha do tempo
 * mostra as gravações que existem de verdade, com a data de cada uma; "Apagar" tira todas.
 *
 * Carregada só quando abre (`React.lazy` em `RevisaoEnxuta`): o gravador não entra no arranque.
 */
export default function FolhaMinhaVoz({
  idDoCartao,
  palavra,
  frase,
  idioma,
  quem,
  originalGravada,
  aoOuvirOriginal,
  gravarAoAbrir = true,
  aoFechar,
  aoMudarGuardadas,
}: {
  idDoCartao: string;
  palavra: string;
  frase: string;
  /** O idioma da frase (BCP-47). */
  idioma: string;
  quem?: string;
  originalGravada: boolean;
  aoOuvirOriginal?: () => Promise<void>;
  gravarAoAbrir?: boolean;
  aoFechar: () => void;
  /** O cartão passou a ter (ou deixou de ter) gravação guardada: o ponto no ícone acompanha. */
  aoMudarGuardadas?: (tem: boolean) => void;
}) {
  const folha = useRef<HTMLDialogElement>(null);
  const gravador = useRef<ControleDoGravador>(null);
  const tempos = useRef<HTMLDivElement>(null);
  const [guardar, setGuardar] = useState(() => lerVozNaRevisao().guardarVoz);
  const [guardadas, setGuardadas] = useState<GravacaoGuardada[]>([]);
  const acabouDeGuardar = useRef(false);

  const reler = useCallback(async () => {
    const l = await vozesGuardadas().listar(idDoCartao);
    setGuardadas(l);
    aoMudarGuardadas?.(l.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDoCartao]);
  useEffect(() => {
    void reler();
  }, [reler]);

  /* `guarda()` de `cartoes4.js:351-361`. */
  const guardarAgora = useCallback(
    async (g: Gravado, avisar: boolean) => {
      const deu = await vozesGuardadas().guardar(idDoCartao, g);
      if (!deu) {
        toast.warn(t('Não consegui guardar a gravação neste aparelho (o navegador não deixou).'));
        return;
      }
      acabouDeGuardar.current = true;
      await reler();
      if (avisar) toast.ok(t('Guardada neste aparelho. Ela aparece na sua evolução deste cartão.'));
    },
    [idDoCartao, reler],
  );
  useEffect(() => {
    if (!acabouDeGuardar.current) return;
    acabouDeGuardar.current = false;
    chegarFicha(tempos.current?.querySelector<HTMLElement>('.cx-linha-do-tempo .q-chip:last-of-type') ?? null);
  }, [guardadas]);

  const agora = Date.now();
  const datas = guardadas.map((v) => v.em);

  return (
    <FolhaDeBaixo
      titulo={t('Minha voz: gravar e comparar com a fala original')}
      doPrototipo
      classe="cx-folha cx-folha-voz"
      refDaFolha={folha}
      aoFechar={aoFechar}
    >
      <CabecalhoDaFolha aoFechar={() => folha.current?.close()}>
        <p className="folha-rotulo">{t('Minha voz')}</p>
        <p className="folha-frase cx-frase-da-folha" lang={idioma}>
          “<FraseMarcada frase={frase} palavra={palavra} />”
        </p>
      </CabecalhoDaFolha>
      <div className="cx-voz-caixa">
        <Gravador
          ref={gravador}
          frase={frase}
          idioma={idioma}
          quem={quem}
          originalGravada={originalGravada}
          aoOuvirOriginal={aoOuvirOriginal}
          gravarAoAbrir={gravarAoAbrir}
          aoGravar={(g) => {
            if (guardar) void guardarAgora(g, false);
          }}
        />
      </div>
      <div className="cx-tempos" ref={tempos}>
        {guardadas.length > 0 && (
          <>
            <p className="folha-rotulo">{t('A sua evolução neste cartão')}</p>
            <div className="cx-linha-do-tempo">
              {guardadas.map((v, i) => {
                const quando = rotuloDaGravacao(v.em, datas, agora, idiomaDaInterface());
                const rotulo = quando === 'hoje' ? t('você hoje') : t('você em {quando}', { quando });
                return (
                  <Fragment key={v.em}>
                    {i > 0 && <i aria-hidden />}
                    <button
                      type="button"
                      className="q-chip"
                      onClick={() => {
                        sentir('toque');
                        gravador.current?.ouvirGuardada({
                          rotulo: rotulo[0].toUpperCase() + rotulo.slice(1),
                          picos: v.picos,
                          dur: v.dur,
                          audio: v.audio,
                        });
                      }}
                    >
                      <Play aria-hidden />
                      <span>{rotulo}</span>
                    </button>
                  </Fragment>
                );
              })}
              <button
                type="button"
                className="cx-link cx-apagar"
                onClick={() => {
                  void vozesGuardadas()
                    .apagar(idDoCartao)
                    .then(reler)
                    .then(() => {
                      sentir('fecha');
                      toast.ok(t('Gravações deste cartão apagadas do aparelho.'));
                    });
                }}
              >
                <Trash2 aria-hidden />
                <span>{t('Apagar')}</span>
              </button>
            </div>
          </>
        )}
      </div>
      <Interruptor
        titulo={t('Guardar minha voz neste cartão')}
        texto={t('Fica só neste aparelho; você apaga quando quiser.')}
        ligado={guardar}
        aoTrocar={(ligado) => {
          setGuardar(ligado);
          gravarVozNaRevisao({ guardarVoz: ligado });
          sentir(ligado ? 'liga' : 'desliga');
          const g = gravador.current?.gravado();
          if (ligado && g) void guardarAgora(g, true);
        }}
      />
    </FolhaDeBaixo>
  );
}
