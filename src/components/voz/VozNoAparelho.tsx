import { useSyncExternalStore } from 'react';

import type { MotivoDaOferta } from '../../core/harness/vozNoAparelho';
import { idiomaDoSupertonic, MB_DO_SUPERTONIC } from '../../core/voz/supertonic';
import { t } from '../../lib/i18n';
import {
  aoMudarVozNoAparelho,
  apagarVozNoAparelho,
  baixarVozNoAparelho,
  cancelarDownloadDaVozNoAparelho,
  decisaoDaVozNoAparelho,
  estadoDaVozNoAparelho,
  modeloNoAparelho,
  raizDoModelo,
} from '../../lib/voz/vozNoAparelho';
import ChipVozSintetizada from '../views/leitor/ChipVozSintetizada';

/** O motivo, em uma linha, de a voz não aparecer NESTE aparelho (os motivos de conta e de flag não são ditos). */
function motivoDoAparelho(m: MotivoDaOferta): string | null {
  if (m === 'ios' || m === 'aparelho-de-pouca-memoria' || m === 'memoria-insuficiente')
    return t(
      'A voz de alta qualidade não está disponível neste aparelho: ela precisa de mais memória do que celulares e tablets costumam ter.',
    );
  if (m === 'sem-motor' || m === 'sem-armazenamento')
    return t('A voz de alta qualidade não está disponível neste navegador.');
  return null;
}

const mb = (bytes: number) => Math.round(bytes / 1_000_000);

/**
 * A VOZ DE ALTA QUALIDADE NO APARELHO, dentro do `SeletorDeVoz` (flag `voz_no_aparelho`): o custo dito ANTES de baixar,
 * o botão de baixar com progresso e cancelar, "pronta", a voz do narrador e apagar. Nada é baixado sem o toque da pessoa.
 * Sem a flag, sem a raiz dos pesos ou em perfil protegido, não desenha nada.
 */
export default function VozNoAparelho({ idioma, aoFicarPronta }: { idioma: string; aoFicarPronta: () => void }) {
  const estado = useSyncExternalStore(aoMudarVozNoAparelho, estadoDaVozNoAparelho);
  if (!raizDoModelo() || !idiomaDoSupertonic(idioma)) return null;
  const d = decisaoDaVozNoAparelho();
  if (d.oferta === 'nao') {
    const motivo = motivoDoAparelho(d.motivo);
    return motivo ? (
      <p className="q-aju-nota" role="note" data-testid="voz-no-aparelho-indisponivel">
        {motivo}
      </p>
    ) : null;
  }
  const pronta = modeloNoAparelho();

  if (estado.fase === 'baixando') {
    const total = estado.total || MB_DO_SUPERTONIC * 1_000_000;
    return (
      <div className="voz-no-aparelho" data-testid="voz-no-aparelho" data-estado="baixando">
        <progress value={estado.recebidos} max={total} aria-label={t('Baixando a voz de alta qualidade')} />
        <p className="q-aju-nota" role="status">
          {t('Baixando: {feito} de {total} MB.', { feito: mb(estado.recebidos), total: mb(total) })}
        </p>
        <button type="button" className="btn btn-outline" onClick={cancelarDownloadDaVozNoAparelho}>
          {t('Cancelar')}
        </button>
      </div>
    );
  }

  if (pronta) {
    return (
      <div className="voz-no-aparelho voz-no-aparelho-pronta" data-testid="voz-no-aparelho" data-estado="pronta">
        <p className="q-aju-nota" role="status">
          {t('Voz de alta qualidade pronta neste aparelho.')} <ChipVozSintetizada />
        </p>
        <button type="button" className="btn btn-ghost" onClick={() => void apagarVozNoAparelho()}>
          {t('Apagar')}
        </button>
      </div>
    );
  }

  return (
    <div className="voz-no-aparelho" data-testid="voz-no-aparelho" data-estado="livre">
      <p className="q-aju-nota">
        {t(
          'Baixa uma vez, ≈ {mb} MB; fica só neste aparelho; funciona sem internet depois; você apaga quando quiser.',
          {
            mb: MB_DO_SUPERTONIC,
          },
        )}
      </p>
      {d.avisoDeMemoria && (
        <p className="q-aju-nota" data-testid="voz-no-aparelho-memoria">
          {t('Usa cerca de 2 a 3 GB de memória enquanto lê. Se o computador ficar lento, feche outras abas.')}
        </p>
      )}
      {d.backend === 'wasm' && d.threadsWasm === 1 && (
        <p className="q-aju-nota">
          {t('Neste navegador ela roda mais devagar: a primeira frase pode levar alguns segundos.')}
        </p>
      )}
      {estado.fase === 'erro' && (
        <p className="q-aju-nota" role="status">
          {t('Não deu para baixar agora. Você pode tentar de novo: o que já veio fica guardado.')}
        </p>
      )}
      <button
        type="button"
        className="btn btn-outline"
        data-testid="baixar-voz-no-aparelho"
        onClick={() => void baixarVozNoAparelho().then((ok) => ok && aoFicarPronta())}
      >
        {t('Baixar a voz ({mb} MB)', { mb: MB_DO_SUPERTONIC })}
      </button>
    </div>
  );
}
