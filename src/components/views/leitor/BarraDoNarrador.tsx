import { Pause, Play, Settings2, SkipBack, SkipForward, Square } from 'lucide-react';

import {
  type ModoDaNarracao,
  MODOS_DA_NARRACAO,
  modoTraduz,
  VELOCIDADES_DA_NARRACAO,
} from '../../../core/leitura/narracao';
import { t } from '../../../lib/i18n';
import { langLabelNaUI } from '../../../lib/languages';
import type { VistaDoNarrador } from '../../../lib/leitor/narrador';
import SeletorDeVoz from '../../voz/SeletorDeVoz';

/** Os rótulos dizem o que cada modo faz (NAR02), os mesmos modos da Leitura. */
export const ROTULO_DO_MODO: Record<ModoDaNarracao, { nome: string; explica: string }> = {
  original: { nome: 'Original', explica: 'Lê o livro na voz do idioma dele.' },
  traducao: { nome: 'Tradução', explica: 'Lê a tradução de cada frase no seu idioma; o destaque segue o livro.' },
  bilingue: { nome: 'Bilíngue', explica: 'Lê cada frase do livro e, logo depois, a tradução.' },
  auto: {
    nome: 'Leitura inteligente',
    explica:
      'Descobre o idioma de cada frase e lê com a voz daquele idioma (bom para livro com trechos noutra língua).',
  },
};

const velocidade = (v: number) => `${String(v).replace('.', ',')}×`;

/**
 * A BARRA DO NARRADOR (L3): frase anterior, tocar/pausar, frase seguinte, velocidade, os ajustes (modo, voz,
 * "seguir a leitura") e parar. Fica no pé do leitor, como a barra do trecho: alcançável pelo teclado e sem
 * cobrir o texto. O contador de frases NÃO é anunciado (aria-live desligado): o leitor de tela ouviria uma
 * mensagem a cada frase, por cima da própria narração.
 */
export default function BarraDoNarrador({
  vista,
  velocidade: v,
  ajustesAbertos,
  aoAlternar,
  aoAnterior,
  aoProxima,
  aoVelocidade,
  aoAjustes,
  aoParar,
}: {
  vista: VistaDoNarrador;
  velocidade: number;
  ajustesAbertos: boolean;
  aoAlternar: () => void;
  aoAnterior: () => void;
  aoProxima: () => void;
  aoVelocidade: (v: number) => void;
  aoAjustes: () => void;
  aoParar: () => void;
}) {
  const tocando = vista.fase === 'tocando' || vista.fase === 'virando';
  const ativa = vista.fase !== 'parada';
  return (
    <section
      className="leitor-narrador"
      aria-label={t('Narração')}
      data-testid="barra-do-narrador"
      data-fase={vista.fase}
      data-indice={vista.indice}
      data-frase={vista.frase}
    >
      <div className="leitor-narrador-transporte">
        <button
          type="button"
          className="leitor-botao"
          aria-label={t('Frase anterior')}
          disabled={!ativa}
          onClick={aoAnterior}
        >
          <SkipBack aria-hidden />
        </button>
        <button
          type="button"
          className="leitor-botao leitor-narrador-tocar"
          aria-label={tocando ? t('Pausar a narração') : t('Ouvir a narração')}
          onClick={aoAlternar}
        >
          {tocando ? <Pause aria-hidden /> : <Play aria-hidden />}
        </button>
        <button
          type="button"
          className="leitor-botao"
          aria-label={t('Próxima frase')}
          disabled={!ativa}
          onClick={aoProxima}
        >
          <SkipForward aria-hidden />
        </button>
      </div>
      <p className="leitor-narrador-onde" aria-live="off" data-testid="narrador-onde">
        {vista.fase === 'virando'
          ? t('Abrindo o próximo capítulo…')
          : vista.total
            ? t('Frase {n} de {total}', { n: vista.indice + 1, total: vista.total })
            : t('Pronto para ouvir')}
      </p>
      <label className="leitor-narrador-velocidade">
        <span className="sr">{t('Velocidade da narração')}</span>
        <select className="campo" value={v} onChange={(e) => aoVelocidade(Number(e.target.value))}>
          {VELOCIDADES_DA_NARRACAO.map((x) => (
            <option key={x} value={x}>
              {velocidade(x)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="leitor-botao"
        aria-expanded={ajustesAbertos}
        aria-controls={ajustesAbertos ? 'leitor-painel' : undefined}
        onClick={aoAjustes}
      >
        <Settings2 aria-hidden />
        <span>{t('Voz e modo')}</span>
      </button>
      <button type="button" className="leitor-botao" aria-label={t('Parar e fechar a narração')} onClick={aoParar}>
        <Square aria-hidden />
      </button>
    </section>
  );
}

/**
 * O PAINEL "NARRAÇÃO": o modo (com o que cada um faz), "seguir a leitura", a voz de cada idioma que a narração
 * usa (o mesmo `SeletorDeVoz` da Leitura, dos Ajustes e do intérprete — a escolha vale no app inteiro) e, só
 * para quem pode ver oferta, uma linha sobre a voz natural.
 */
export function PainelDaNarracao({
  modo,
  seguir,
  idiomaDoLivro,
  idiomaDaPessoa,
  nuvem,
  convite,
  aoModo,
  aoSeguir,
  aoEscolherVoz,
  aoConhecerPlanos,
}: {
  modo: ModoDaNarracao;
  seguir: boolean;
  idiomaDoLivro: string;
  idiomaDaPessoa: string;
  /** A voz natural da nuvem está liberada (plano + flag)? */
  nuvem: boolean;
  /** Mostrar o convite da voz natural (nunca para menor). */
  convite: boolean;
  aoModo: (m: ModoDaNarracao) => void;
  aoSeguir: (s: boolean) => void;
  aoEscolherVoz: () => void;
  aoConhecerPlanos?: () => void;
}) {
  const idiomas = [
    idiomaDoLivro,
    ...(modoTraduz(modo) && idiomaDaPessoa !== idiomaDoLivro ? [idiomaDaPessoa] : []),
  ].filter(Boolean);
  return (
    <div className="leitor-narracao" data-testid="painel-narracao">
      <fieldset className="leitor-grupo">
        <legend>{t('O que ouvir')}</legend>
        <div className="leitor-modos">
          {MODOS_DA_NARRACAO.map((m) => (
            <label key={m} className="leitor-modo">
              <input type="radio" name="leitor-modo" checked={modo === m} onChange={() => aoModo(m)} />
              <span>
                <b>{t(ROTULO_DO_MODO[m].nome)}</b>
                <small>{t(ROTULO_DO_MODO[m].explica)}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="leitor-alternar">
        <input type="checkbox" checked={seguir} onChange={(e) => aoSeguir(e.target.checked)} />
        <span>{t('Seguir a leitura (a página vira com a frase lida)')}</span>
      </label>

      {idiomas.map((idioma) => (
        <section key={idioma} className="leitor-grupo">
          <h3 className="leitor-legenda">{t('Voz para {idioma}', { idioma: langLabelNaUI(idioma) })}</h3>
          <SeletorDeVoz idioma={idioma} nuvem={nuvem} aoEscolher={aoEscolherVoz} />
        </section>
      ))}

      <p className="leitor-apoio">{t('A voz do aparelho é grátis e funciona sem internet.')}</p>
      {convite && aoConhecerPlanos && (
        <div className="leitor-convite" data-testid="convite-voz-natural">
          <p className="leitor-apoio">
            {t('A voz natural, mais parecida com uma pessoa lendo, faz parte dos planos pagos.')}
          </p>
          <button type="button" className="btn btn-outline leitor-alvo" onClick={aoConhecerPlanos}>
            {t('Conhecer os planos')}
          </button>
        </div>
      )}
    </div>
  );
}
