import { Minus, Plus, RotateCcw } from 'lucide-react';

import {
  CORES_DOS_TEMAS,
  type FonteDeLeitura,
  FONTES_DE_LEITURA,
  LIMITES,
  type PerfilDeLeitura,
  type TemaDeLeitura,
  TEMAS_DE_LEITURA,
} from '../../../core/leitura/perfilDeLeitura';
import { t } from '../../../lib/i18n';

const NOME_DO_TEMA: Record<TemaDeLeitura, string> = {
  claro: 'Claro',
  sepia: 'Sépia',
  creme: 'Creme',
  escuro: 'Escuro',
  cinza: 'Cinza escuro',
  contraste: 'Alto contraste suave',
};

const NOME_DA_FONTE: Record<FonteDeLeitura, string> = {
  original: 'Do livro',
  serifa: 'Serifa',
  'sem-serifa': 'Sem serifa',
  atkinson: 'Atkinson (legibilidade)',
};

const FAMILIA_DA_AMOSTRA: Record<FonteDeLeitura, string> = {
  original: 'inherit',
  serifa: "'Merriweather Variable', Georgia, serif",
  'sem-serifa': "'Inter Variable', system-ui, sans-serif",
  atkinson: "'Atkinson Hyperlegible', system-ui, sans-serif",
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const em = (v: number) => `${String(Math.round(v * 100) / 100).replace('.', ',')} em`;

/**
 * O KIT TIPOGRÁFICO (ACE01, ACE02, ACE04): tema, fonte, tamanho, entrelinha, espaçamentos, largura da
 * coluna, margens, alinhamento, hifenização e o modo (páginas ou rolagem). Tudo vale para todo livro.
 * Cada controle é nativo (rádio, `range`, botão) com rótulo em texto: teclado e leitor de tela de graça.
 */
export default function PainelDeTipografia({
  perfil,
  mudar,
  restaurar,
  ehPdf,
}: {
  perfil: PerfilDeLeitura;
  mudar: (m: Partial<PerfilDeLeitura>) => void;
  restaurar: () => void;
  /** PDF é página fixa: fonte, espaçamentos e modo não se aplicam. */
  ehPdf: boolean;
}) {
  const faixa = (
    chave: 'entrelinha' | 'espacoLetra' | 'espacoPalavra' | 'largura' | 'margem',
    rotulo: string,
    mostrar: (v: number) => string,
  ) => {
    const l = LIMITES[chave];
    return (
      <label className="leitor-faixa">
        <span>
          {rotulo} <output>{mostrar(perfil[chave])}</output>
        </span>
        <input
          type="range"
          min={l.min}
          max={l.max}
          step={l.passo}
          value={perfil[chave]}
          onChange={(e) => mudar({ [chave]: Number(e.target.value) })}
        />
      </label>
    );
  };

  return (
    <div className="leitor-tipografia" data-testid="painel-tipografia">
      <fieldset className="leitor-grupo">
        <legend>{t('Tema')}</legend>
        <div className="leitor-temas">
          {TEMAS_DE_LEITURA.map((tema) => {
            const c = CORES_DOS_TEMAS[tema];
            return (
              <label key={tema} className="leitor-tema" data-tema={tema}>
                <input
                  type="radio"
                  name="leitor-tema"
                  value={tema}
                  checked={perfil.tema === tema}
                  onChange={() => mudar({ tema })}
                />
                <span className="leitor-tema-amostra" style={{ background: c.fundo, color: c.texto }} aria-hidden>
                  Aa
                </span>
                <span className="leitor-tema-nome">{t(NOME_DO_TEMA[tema])}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {!ehPdf && (
        <>
          <fieldset className="leitor-grupo">
            <legend>{t('Fonte')}</legend>
            <div className="leitor-fontes">
              {FONTES_DE_LEITURA.map((fonte) => (
                <label key={fonte} className="leitor-fonte">
                  <input
                    type="radio"
                    name="leitor-fonte"
                    value={fonte}
                    checked={perfil.fonte === fonte}
                    onChange={() => mudar({ fonte })}
                  />
                  <span style={{ fontFamily: FAMILIA_DA_AMOSTRA[fonte] }}>{t(NOME_DA_FONTE[fonte])}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="leitor-grupo leitor-tamanho" role="group" aria-labelledby="leitor-rotulo-tamanho">
            <span id="leitor-rotulo-tamanho" className="leitor-legenda">
              {t('Tamanho da letra')}
            </span>
            <button
              type="button"
              className="btn btn-outline leitor-alvo"
              aria-label={t('Diminuir a letra')}
              disabled={perfil.tamanho <= LIMITES.tamanho.min}
              onClick={() => mudar({ tamanho: perfil.tamanho - 1 })}
            >
              <Minus aria-hidden />
            </button>
            <output aria-live="polite" className="leitor-valor">
              {perfil.tamanho} px
            </output>
            <button
              type="button"
              className="btn btn-outline leitor-alvo"
              aria-label={t('Aumentar a letra')}
              disabled={perfil.tamanho >= LIMITES.tamanho.max}
              onClick={() => mudar({ tamanho: perfil.tamanho + 1 })}
            >
              <Plus aria-hidden />
            </button>
          </div>

          {faixa('entrelinha', t('Entrelinha'), (v) => String(v).replace('.', ','))}
          {faixa('espacoLetra', t('Espaço entre letras'), em)}
          {faixa('espacoPalavra', t('Espaço entre palavras'), em)}
          {faixa('largura', t('Largura da coluna'), (v) => `${v} px`)}
          {faixa('margem', t('Margens'), (v) => pct(v / 100))}

          <fieldset className="leitor-grupo">
            <legend>{t('Alinhamento')}</legend>
            <div className="seg">
              {(['esquerda', 'justificado'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={perfil.alinhamento === a}
                  onClick={() => mudar({ alinhamento: a })}
                >
                  {a === 'esquerda' ? t('À esquerda') : t('Justificado')}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="leitor-alternar">
            <input
              type="checkbox"
              checked={perfil.hifenizar}
              onChange={(e) => mudar({ hifenizar: e.target.checked })}
            />
            <span>{t('Hifenizar palavras longas')}</span>
          </label>

          <fieldset className="leitor-grupo">
            <legend>{t('Modo de leitura')}</legend>
            <div className="seg">
              {(['paginado', 'rolagem'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={perfil.modo === m} onClick={() => mudar({ modo: m })}>
                  {m === 'paginado' ? t('Páginas') : t('Rolagem')}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <button type="button" className="btn btn-outline leitor-alvo" onClick={restaurar}>
        <RotateCcw aria-hidden /> {t('Voltar ao padrão')}
      </button>
      <p className="leitor-apoio">{t('Estas escolhas valem para todos os livros neste aparelho.')}</p>
    </div>
  );
}
