import {
  ChevronsLeft,
  ChevronsRight,
  Minus,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  SkipBack,
  SkipForward,
  Square,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  type AjustesDoEstilo,
  estiloAtual,
  ESTILOS_DE_LEITURA,
  IDS_DE_ESTILO,
  LIMITES_DA_NARRACAO,
  MINUTOS_DE_SONO,
  minutosDoSono,
  type OpcoesDaNarracao,
  passoDeVelocidade,
  type Sono,
} from '../../../core/leitura/estilosDeLeitura';
import { type ModoDaNarracao, MODOS_DA_NARRACAO, modoTraduz } from '../../../core/leitura/narracao';
import { t } from '../../../lib/i18n';
import { langLabelNaUI } from '../../../lib/languages';
import type { Narrador, VistaDoNarrador } from '../../../lib/leitor/narrador';
import { gravarMeuEstilo, lerMeuEstilo } from '../../../lib/leitor/preferenciasDaNarracao';
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

/** "1,3×" (o 1 inteiro sem vírgula). */
export const rotuloDaVelocidade = (v: number) => `${String(Math.round(v * 100) / 100).replace('.', ',')}×`;

/** As velocidades do seletor: de 0,5 a 2,5 em passos de 0,1. */
const VELOCIDADES = Array.from(
  { length: Math.round((LIMITES_DA_NARRACAO.velocidade.max - LIMITES_DA_NARRACAO.velocidade.min) / 0.1) + 1 },
  (_, i) => Math.round((LIMITES_DA_NARRACAO.velocidade.min + i * 0.1) * 10) / 10,
);

/* ─────────────────────────── atalhos de teclado ─────────────────────────── */

/** Os atalhos que a barra anuncia (`aria-keyshortcuts`). Setas não: o livro usa para virar a página. */
export const ATALHOS_DO_NARRADOR = {
  tocar: 'Space',
  anterior: ',',
  proxima: '.',
  voltar: 'J',
  maisDevagar: '[',
  maisRapido: ']',
} as const;

/**
 * Trata uma tecla da narração: Espaço toca/pausa, `,` e `.` mudam de frase, `J` volta 10 s, `[` e `]` regulam a
 * velocidade. Com o foco DENTRO da barra, as setas também mudam de frase. Devolve `true` se tratou (quem chama
 * dá `preventDefault`). Espaço num botão ou link é do próprio botão: não é tratado aqui.
 */
export function aoTeclarNoNarrador(e: KeyboardEvent, n: Narrador | null): boolean {
  if (!n || e.ctrlKey || e.metaKey || e.altKey) return false;
  const alvo = e.target instanceof Element ? e.target : null;
  if (alvo?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return false;
  const naBarra = !!alvo?.closest('.leitor-narrador');
  switch (e.key) {
    case ' ':
      if (alvo?.closest('button, a, summary, [role="button"], [role="radio"]')) return false;
      n.alternar();
      return true;
    case ',':
      n.anterior();
      return true;
    case '.':
      n.proxima();
      return true;
    case 'j':
    case 'J':
      n.voltar(10);
      return true;
    case '[':
      n.definirVelocidade(passoDeVelocidade(n.opcoes.velocidade, -1));
      return true;
    case ']':
      n.definirVelocidade(passoDeVelocidade(n.opcoes.velocidade, 1));
      return true;
    case 'ArrowLeft':
      if (!naBarra) return false;
      n.anterior();
      return true;
    case 'ArrowRight':
      if (!naBarra) return false;
      n.proxima();
      return true;
    default:
      return false;
  }
}

/* ─────────────────────────── a barra ─────────────────────────── */

/** Redesenha a cada 15 s enquanto o sono por tempo está armado (os minutos que faltam). */
function useMinutosDoSono(sono: Sono): number {
  const [, tic] = useState(0);
  useEffect(() => {
    if (sono?.tipo !== 'minutos') return;
    const id = window.setInterval(() => tic((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, [sono]);
  return minutosDoSono(sono, Date.now());
}

/**
 * A BARRA DO NARRADOR (L3): capítulo anterior, voltar 10 s, frase anterior, tocar/pausar, frase seguinte, capítulo
 * seguinte, velocidade em passos de 0,1, o temporizador de sono, os ajustes (estilo, tom, volume, pausas, modo,
 * voz) e parar. Fica no pé do leitor, como a barra do trecho: alcançável pelo teclado e sem cobrir o texto. O
 * contador de frases NÃO é anunciado (aria-live desligado): o leitor de tela ouviria uma mensagem a cada frase,
 * por cima da própria narração.
 */
export default function BarraDoNarrador({
  vista,
  narrador,
  ajustesAbertos,
  aoAlternar,
  aoAjustes,
  aoParar,
}: {
  vista: VistaDoNarrador;
  narrador: Narrador | null;
  ajustesAbertos: boolean;
  aoAlternar: () => void;
  aoAjustes: () => void;
  aoParar: () => void;
}) {
  const tocando = vista.fase === 'tocando' || vista.fase === 'virando';
  const ativa = vista.fase !== 'parada';
  const viaja = vista.fase === 'virando';
  const minutosQueFaltam = useMinutosDoSono(vista.sono);
  const v = vista.opcoes.velocidade;
  const valorDoSono = vista.sono?.tipo === 'capitulo' ? 'capitulo' : vista.sono ? 'ativo' : '';
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
          aria-label={t('Capítulo anterior')}
          disabled={!ativa || viaja}
          onClick={() => narrador?.irParaCapitulo(-1)}
        >
          <ChevronsLeft aria-hidden />
        </button>
        <button
          type="button"
          className="leitor-botao"
          aria-label={t('Voltar 10 segundos')}
          aria-keyshortcuts={ATALHOS_DO_NARRADOR.voltar}
          disabled={!ativa || viaja}
          onClick={() => narrador?.voltar(10)}
        >
          <RotateCcw aria-hidden />
        </button>
        <button
          type="button"
          className="leitor-botao"
          aria-label={t('Frase anterior')}
          aria-keyshortcuts={ATALHOS_DO_NARRADOR.anterior}
          disabled={!ativa}
          onClick={() => narrador?.anterior()}
        >
          <SkipBack aria-hidden />
        </button>
        <button
          type="button"
          className="leitor-botao leitor-narrador-tocar"
          aria-label={tocando ? t('Pausar a narração') : t('Ouvir a narração')}
          aria-keyshortcuts={ATALHOS_DO_NARRADOR.tocar}
          onClick={aoAlternar}
        >
          {tocando ? <Pause aria-hidden /> : <Play aria-hidden />}
        </button>
        <button
          type="button"
          className="leitor-botao"
          aria-label={t('Próxima frase')}
          aria-keyshortcuts={ATALHOS_DO_NARRADOR.proxima}
          disabled={!ativa}
          onClick={() => narrador?.proxima()}
        >
          <SkipForward aria-hidden />
        </button>
        <button
          type="button"
          className="leitor-botao"
          aria-label={t('Próximo capítulo')}
          disabled={!ativa || viaja}
          onClick={() => narrador?.irParaCapitulo(1)}
        >
          <ChevronsRight aria-hidden />
        </button>
      </div>
      <p className="leitor-narrador-onde" aria-live="off" data-testid="narrador-onde">
        {vista.fase === 'virando'
          ? t('Abrindo o capítulo…')
          : vista.total
            ? t('Frase {n} de {total}', { n: vista.indice + 1, total: vista.total })
            : t('Pronto para ouvir')}
      </p>
      <div className="leitor-narrador-velocidade" role="group" aria-label={t('Velocidade da narração')}>
        <button
          type="button"
          className="leitor-botao"
          aria-label={t('Mais devagar')}
          aria-keyshortcuts={ATALHOS_DO_NARRADOR.maisDevagar}
          disabled={v <= LIMITES_DA_NARRACAO.velocidade.min}
          onClick={() => narrador?.definirVelocidade(passoDeVelocidade(v, -1))}
        >
          <Minus aria-hidden />
        </button>
        <label>
          <span className="sr">{t('Velocidade da narração')}</span>
          <select
            className="campo"
            value={v}
            data-testid="narrador-velocidade"
            onChange={(e) => narrador?.definirVelocidade(Number(e.target.value))}
          >
            {VELOCIDADES.map((x) => (
              <option key={x} value={x}>
                {rotuloDaVelocidade(x)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="leitor-botao"
          aria-label={t('Mais rápido')}
          aria-keyshortcuts={ATALHOS_DO_NARRADOR.maisRapido}
          disabled={v >= LIMITES_DA_NARRACAO.velocidade.max}
          onClick={() => narrador?.definirVelocidade(passoDeVelocidade(v, 1))}
        >
          <Plus aria-hidden />
        </button>
      </div>
      <label className="leitor-narrador-sono">
        <Moon aria-hidden />
        <span className="sr">{t('Temporizador de sono')}</span>
        <select
          className="campo"
          value={valorDoSono}
          data-testid="narrador-sono"
          onChange={(e) => {
            const x = e.target.value;
            if (x === 'ativo') return;
            narrador?.definirSono(x === '' ? null : x === 'capitulo' ? 'capitulo' : Number(x));
          }}
        >
          <option value="">{t('Sem sono')}</option>
          {MINUTOS_DE_SONO.map((m) => (
            <option key={m} value={m}>
              {t('Parar em {n} min', { n: m })}
            </option>
          ))}
          <option value="capitulo">{t('Parar no fim do capítulo')}</option>
          {vista.sono?.tipo === 'minutos' && (
            <option value="ativo" hidden>
              {t('Para em {n} min', { n: Math.max(1, minutosQueFaltam) })}
            </option>
          )}
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

/* ─────────────────────────── o painel ─────────────────────────── */

/** Um controle deslizante com o valor à vista (o leitor de tela lê o valor formatado). */
function Deslizante({
  id,
  rotulo,
  valor,
  campo,
  formatar,
  aoMudar,
}: {
  id: string;
  rotulo: string;
  valor: number;
  campo: keyof OpcoesDaNarracao;
  formatar: (v: number) => string;
  aoMudar: (v: number) => void;
}) {
  const { min, max, passo } = LIMITES_DA_NARRACAO[campo];
  return (
    <div className="leitor-deslizante">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        aria-valuetext={formatar(valor)}
        data-testid={id}
        onChange={(e) => aoMudar(Number(e.target.value))}
      />
      <output htmlFor={id}>{formatar(valor)}</output>
    </div>
  );
}

const segundos = (s: number) => t('{n} s', { n: String(Math.round(s * 10) / 10).replace('.', ',') });
const porcento = (v: number) => `${Math.round(v * 100)}%`;

/**
 * O PAINEL "NARRAÇÃO": o estilo de leitura (e o "Meu estilo"), os ajustes finos (velocidade, tom, volume,
 * pausas, repetições), o modo (com o que cada um faz), "seguir a leitura", a voz de cada idioma que a narração
 * usa (o mesmo `SeletorDeVoz` da Leitura, dos Ajustes e do intérprete — a escolha vale no app inteiro) e, só
 * para quem pode ver oferta, uma linha sobre a voz natural.
 */
export function PainelDaNarracao({
  modo,
  seguir,
  opcoes,
  narrador,
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
  opcoes: OpcoesDaNarracao;
  narrador: Narrador | null;
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
  const [meu, setMeu] = useState<AjustesDoEstilo | null>(() => lerMeuEstilo());
  const atual = estiloAtual(opcoes, meu);
  const mudar = (parcial: Partial<OpcoesDaNarracao>) => narrador?.definirOpcoes(parcial);
  const usar = (a: AjustesDoEstilo) => narrador?.definirOpcoes(a, { adiar: false });
  return (
    <div className="leitor-narracao" data-testid="painel-narracao">
      <fieldset className="leitor-grupo">
        <legend>{t('Estilo de leitura')}</legend>
        <div className="leitor-modos" role="radiogroup" aria-label={t('Estilo de leitura')}>
          {IDS_DE_ESTILO.map((id) => (
            <label key={id} className="leitor-modo">
              <input
                type="radio"
                name="leitor-estilo"
                checked={atual === id}
                data-estilo={id}
                onChange={() => usar(ESTILOS_DE_LEITURA[id].ajustes)}
              />
              <span>
                <b>{t(ESTILOS_DE_LEITURA[id].nome)}</b>
                <small>{t(ESTILOS_DE_LEITURA[id].explica)}</small>
              </span>
            </label>
          ))}
          {meu && (
            <label className="leitor-modo">
              <input
                type="radio"
                name="leitor-estilo"
                checked={atual === 'meu'}
                data-estilo="meu"
                onChange={() => usar(meu)}
              />
              <span>
                <b>{t('Meu estilo')}</b>
                <small>{t('O que você salvou: velocidade, tom e pausas.')}</small>
              </span>
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="leitor-grupo leitor-ajustes-finos">
        <legend>{t('Ajustes da voz')}</legend>
        <Deslizante
          id="narr-velocidade"
          rotulo={t('Velocidade')}
          valor={opcoes.velocidade}
          campo="velocidade"
          formatar={rotuloDaVelocidade}
          aoMudar={(velocidade) => mudar({ velocidade })}
        />
        <Deslizante
          id="narr-tom"
          rotulo={t('Tom')}
          valor={opcoes.tom}
          campo="tom"
          formatar={(v) => (v === 1 ? t('Natural') : v < 1 ? t('Mais grave') : t('Mais agudo'))}
          aoMudar={(tom) => mudar({ tom })}
        />
        <Deslizante
          id="narr-volume"
          rotulo={t('Volume')}
          valor={opcoes.volume}
          campo="volume"
          formatar={porcento}
          aoMudar={(volume) => mudar({ volume })}
        />
        <Deslizante
          id="narr-pausa-frase"
          rotulo={t('Pausa entre frases')}
          valor={opcoes.pausaFrase}
          campo="pausaFrase"
          formatar={segundos}
          aoMudar={(pausaFrase) => mudar({ pausaFrase })}
        />
        <Deslizante
          id="narr-pausa-paragrafo"
          rotulo={t('Pausa extra entre parágrafos')}
          valor={opcoes.pausaParagrafo}
          campo="pausaParagrafo"
          formatar={segundos}
          aoMudar={(pausaParagrafo) => mudar({ pausaParagrafo })}
        />
        <div className="leitor-deslizante">
          <label htmlFor="narr-repeticoes">{t('Repetir cada frase')}</label>
          <select
            id="narr-repeticoes"
            className="campo"
            value={opcoes.repeticoes}
            data-testid="narr-repeticoes"
            onChange={(e) => mudar({ repeticoes: Number(e.target.value) })}
          >
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? t('1 vez') : t('{n} vezes', { n })}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-outline leitor-alvo"
          data-testid="salvar-meu-estilo"
          disabled={atual !== 'personalizado'}
          onClick={() => {
            gravarMeuEstilo(opcoes);
            setMeu(lerMeuEstilo());
          }}
        >
          {t('Salvar como meu estilo')}
        </button>
        <p className="leitor-apoio" data-testid="nota-pausar">
          {t('Ao pausar, a leitura volta ao início da frase quando você continua.')}
        </p>
      </fieldset>

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
