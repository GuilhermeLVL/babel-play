import { Download } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

import type { IdiomaDeVoz } from '../../core/leitura/prepararTextoParaVoz';
import { VOZES_DO_KITTEN } from '../../core/voz/kitten';
import { t } from '../../lib/i18n';
import { langLabelNaUI } from '../../lib/languages';
import { falar } from '../../lib/tts';
import {
  aoMudarKitten,
  apagarVozKitten,
  baixarVozKitten,
  cancelarDownloadDoKitten,
  decisaoDoKitten,
  definirVozDoKitten,
  destravarKitten,
  downloadDoKitten,
  estadoDoKitten,
  kittenOferecido,
  modeloKittenPronto,
  raizDoKitten,
  verificarArmazenamentoDoKitten,
  vozDoKittenNoIdioma,
} from '../../lib/voz/vozKitten';
import { Dialogo } from '../ui';

const IDIOMAS: readonly IdiomaDeVoz[] = ['pt', 'en', 'es'];
const AMOSTRA: Record<IdiomaDeVoz, string> = {
  pt: 'Olá! Esta é a voz natural, que roda no seu aparelho.',
  en: 'Hello! This is the natural voice, running on your device.',
  es: '¡Hola! Esta es la voz natural, que funciona en tu dispositivo.',
};
const mb = (bytes: number) => Math.round(bytes / 1_000_000);
const maiuscula = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

/**
 * A VOZ NATURAL NO APARELHO (Kitten TTS 2, flag `voz_kitten`) em Ajustes → Modelos no aparelho: por idioma, o tamanho
 * dito ANTES de baixar, baixar (com confirmação acima do teto do perfil), progresso, cancelar, a voz escolhida, ouvir
 * uma amostra e apagar. Nada é baixado sem o toque da pessoa. Sem a flag ou sem a raiz dos pesos, não desenha nada.
 */
export default function VozNaturalNoAparelho() {
  const estado = useSyncExternalStore(aoMudarKitten, estadoDoKitten);
  const [confirmar, setConfirmar] = useState<IdiomaDeVoz | null>(null);
  /* a sonda do OPFS (uma vez por sessão): sem armazenamento que funcione, a seção some em vez de falhar no download */
  useEffect(() => void verificarArmazenamentoDoKitten(), []);
  if (!raizDoKitten() || !kittenOferecido()) return null;
  const variante = decisaoDoKitten().variante;

  const baixar = (idioma: IdiomaDeVoz) => {
    if (downloadDoKitten(idioma).confirmar) setConfirmar(idioma);
    else void baixarVozKitten(idioma);
  };
  const algumPronto = IDIOMAS.some((i) => modeloKittenPronto(i));

  return (
    <div data-testid="voz-natural-no-aparelho">
      <h3 className="mna-titulo">{t('Voz natural')}</h3>
      <p className="mna-vazio">
        {t(
          'Uma voz natural e grátis que lê em voz alta direto no seu aparelho: baixa uma vez por idioma, funciona sem internet depois, e o texto não sai daqui.',
        )}
      </p>
      <ul className="mna-lista">
        {IDIOMAS.map((idioma) => {
          const nome = maiuscula(langLabelNaUI(idioma));
          const pronto = modeloKittenPronto(idioma);
          const baixando = estado.fase === 'baixando' && estado.idioma === idioma;
          const { mb: tamanho } = downloadDoKitten(idioma);
          const voz = vozDoKittenNoIdioma(idioma);
          return (
            <li key={idioma} className="q-ajuste mna-item" aria-label={nome} data-idioma={idioma}>
              <div>
                <strong>{nome}</strong>
                <p className="q-aju-nota" role={baixando ? 'status' : undefined}>
                  {baixando
                    ? t('Baixando: {feito} de {total} MB.', {
                        feito: mb(estado.recebidos),
                        total: mb(estado.total || tamanho * 1_000_000),
                      })
                    : pronto
                      ? t('Pronta neste aparelho.')
                      : t('≈ {mb} MB', { mb: tamanho })}
                </p>
                {baixando && (
                  <progress
                    value={estado.recebidos}
                    max={estado.total || tamanho * 1_000_000}
                    aria-label={t('Baixando a voz natural')}
                  />
                )}
              </div>
              <div className="mna-acoes">
                {pronto && (
                  <>
                    <select
                      className="q-ctl"
                      aria-label={t('Voz em {idioma}', { idioma: nome })}
                      value={voz}
                      onChange={(e) => definirVozDoKitten(idioma, e.target.value)}
                    >
                      {VOZES_DO_KITTEN[variante][idioma].map((v) => (
                        <option key={v.chave} value={v.chave}>
                          {v.genero === 'feminina'
                            ? t('{nome} (feminina)', { nome: v.nome })
                            : t('{nome} (masculina)', { nome: v.nome })}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="q-ctl"
                      data-testid={`ouvir-voz-natural-${idioma}`}
                      onClick={() => {
                        destravarKitten();
                        falar(AMOSTRA[idioma], idioma);
                      }}
                    >
                      {t('Ouvir')}
                    </button>
                  </>
                )}
                {!pronto && !baixando && (
                  <button
                    type="button"
                    className="q-ctl"
                    data-testid={`baixar-voz-natural-${idioma}`}
                    disabled={estado.fase === 'baixando'}
                    onClick={() => baixar(idioma)}
                  >
                    {t('Baixar ({mb} MB)', { mb: tamanho })}
                  </button>
                )}
                {baixando && (
                  <button type="button" className="q-ctl" onClick={cancelarDownloadDoKitten}>
                    {t('Cancelar')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {estado.fase === 'erro' && (
        <p className="q-aju-nota" role="status">
          {t('Não deu para baixar agora. Você pode tentar de novo: o que já veio fica guardado.')}
        </p>
      )}
      {algumPronto && (
        <button type="button" className="q-ctl mna-perigo" onClick={() => void apagarVozKitten()}>
          {t('Apagar a voz natural')}
        </button>
      )}
      {confirmar && (
        <Dialogo
          icone={Download}
          titulo={t('Baixar a voz natural?')}
          sub={t('São cerca de {mb} MB. Se estiver nos dados móveis, talvez prefira esperar o Wi-Fi.', {
            mb: downloadDoKitten(confirmar).mb,
          })}
          largura=""
          aoFechar={() => setConfirmar(null)}
        >
          <div className="dlg-pe">
            <button type="button" className="btn btn-outline" data-autofocus onClick={() => setConfirmar(null)}>
              {t('Agora não')}
            </button>
            <button
              type="button"
              className="btn btn-solid"
              onClick={() => {
                const i = confirmar;
                setConfirmar(null);
                void baixarVozKitten(i);
              }}
            >
              {t('Baixar')}
            </button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
