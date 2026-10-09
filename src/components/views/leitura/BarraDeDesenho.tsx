/**
 * A BARRA DO DESENHO LIVRE (Leitura → "Desenho livre"): tipo de caneta, cor (amostras, últimas cores,
 * seletor nativo, R/G/B e HEX), grossura com pré-visualização, opacidade, desfazer/refazer e limpar.
 *
 * As peças são as do desenho do app (`.q-*`). A lógica toda mora em `useDesenhoLivre`.
 */
import '../../../styles/desenho.css';

import { Brush, Eraser, Highlighter, Pen, PenLine, Redo2, Trash2, Undo2 } from 'lucide-react';
import { type ComponentType, useEffect, useRef } from 'react';

import { hexParaRgb, normalizarHex, trocarCanal } from '../../../lib/desenho/cor';
import { opacidadeDe } from '../../../lib/desenho/preferencias';
import {
  desenharTraco,
  type Ferramenta,
  LARGURA_MAX,
  LARGURA_MIN,
  temOpacidade,
  type Traco,
} from '../../../lib/desenho/tracos';
import { t } from '../../../lib/i18n';
import type { DesenhoLivre } from './useDesenhoLivre';

/** Amostras que se leem bem no tema claro e no escuro (preto e branco incluídos). */
export const AMOSTRAS: ReadonlyArray<{ hex: string; nome: string }> = [
  { hex: '#000000', nome: 'Preto' },
  { hex: '#ffffff', nome: 'Branco' },
  { hex: '#e5484d', nome: 'Vermelho' },
  { hex: '#e8542b', nome: 'Laranja' },
  { hex: '#f5c518', nome: 'Amarelo' },
  { hex: '#30a46c', nome: 'Verde' },
  { hex: '#00a2c7', nome: 'Ciano' },
  { hex: '#3e63dd', nome: 'Azul' },
  { hex: '#8e4ec6', nome: 'Roxo' },
  { hex: '#e93d82', nome: 'Rosa' },
];

const TIPOS: ReadonlyArray<[Ferramenta, string, ComponentType<{ 'aria-hidden'?: boolean }>]> = [
  ['caneta', 'Caneta', Pen],
  ['tinteiro', 'Caneta-tinteiro', PenLine],
  ['pincel', 'Pincel', Brush],
  ['marca-texto', 'Marca-texto', Highlighter],
  ['borracha', 'Borracha', Eraser],
];

const NOME_DO_TIPO: Record<Ferramenta, string> = {
  caneta: 'Caneta',
  tinteiro: 'Caneta-tinteiro',
  pincel: 'Pincel',
  'marca-texto': 'Marca-texto',
  borracha: 'Borracha',
};

/** Um traço de exemplo (uma onda) para a pré-visualização mostrar cor, tamanho e tipo de verdade. */
export function tracoDeExemplo(
  f: Ferramenta,
  cor: string,
  w: number,
  a: number,
  largura: number,
  altura: number,
): Traco {
  const n = 28;
  const margem = Math.min(24, largura * 0.12);
  const pts: Traco['pts'] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const fator =
      f === 'tinteiro' ? 0.45 + 0.8 * Math.sin(u * Math.PI) : f === 'pincel' ? 0.85 + 0.2 * Math.sin(u * 5) : 1;
    pts.push([margem + u * (largura - 2 * margem), altura / 2 + Math.sin(u * Math.PI * 2) * altura * 0.22, fator]);
  }
  return { f, cor, w, a, pts };
}

function PreVisualizacao({ desenho }: { desenho: DesenhoLivre }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const { prefs } = desenho;
  const f = prefs.ferramenta;
  const w = prefs.larguras[f];
  const a = opacidadeDe(prefs, f);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (f === 'borracha') {
      // A borracha mostra o tamanho dela: um círculo vazado.
      ctx.strokeStyle = getComputedStyle(c).color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c.width / 2, c.height / 2, Math.min(w / 2, c.height / 2 - 2), 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    desenharTraco(ctx, tracoDeExemplo(f, prefs.cor, w, a, c.width, c.height));
  }, [f, w, a, prefs.cor]);
  return (
    <canvas
      ref={ref}
      className="desenho-previa"
      width={176}
      height={56}
      role="img"
      aria-label={t('Pré-visualização do traço')}
    />
  );
}

export default function BarraDeDesenho({ desenho }: { desenho: DesenhoLivre }) {
  const { prefs } = desenho;
  const f = prefs.ferramenta;
  const rgb = hexParaRgb(prefs.cor) ?? { r: 0, g: 0, b: 0 };
  const hexRef = useRef<HTMLInputElement | null>(null);

  // O campo HEX é texto livre enquanto a pessoa digita; só quando a cor está completa ela vale.
  useEffect(() => {
    if (hexRef.current && document.activeElement !== hexRef.current) hexRef.current.value = prefs.cor;
  }, [prefs.cor]);

  const w = prefs.larguras[f];
  const opacidade = Math.round(opacidadeDe(prefs, f) * 100);

  const campo = (rotulo: string, entrada: React.ReactNode) => (
    <label key={rotulo} className="q-campo desenho-campo">
      <span>{rotulo}</span>
      {entrada}
    </label>
  );

  const acao = (
    rotulo: string,
    Icone: ComponentType<{ 'aria-hidden'?: boolean }>,
    aoClicar: () => void,
    desabilitado: boolean,
    perigo = false,
  ) => (
    <button type="button" className={`q-ctl${perigo ? ' perigo' : ''}`} disabled={desabilitado} onClick={aoClicar}>
      <Icone aria-hidden /> {rotulo}
    </button>
  );

  return (
    <div className="desenho-barra q" role="group" aria-label={t('Ferramentas de desenho')}>
      <div className="desenho-linha">
        <div className="q-abas q-seg" role="group" aria-label={t('Ferramenta de desenho')}>
          {TIPOS.map(([v, nome, Icone]) => (
            <button
              key={v}
              type="button"
              className="q-aba"
              aria-pressed={f === v}
              onClick={() => desenho.escolherFerramenta(v)}
            >
              <Icone aria-hidden /> {t(nome)}
            </button>
          ))}
        </div>
      </div>

      {f !== 'borracha' && (
        <div className="desenho-linha desenho-cores" role="group" aria-label={t('Cor do traço')}>
          <div className="desenho-amostras">
            {AMOSTRAS.map(({ hex, nome }) => (
              <button
                key={hex}
                type="button"
                className="desenho-amostra"
                aria-label={t(nome)}
                aria-pressed={prefs.cor === hex}
                title={t(nome)}
                onClick={() => desenho.escolherCor(hex)}
              >
                <span className="desenho-cor" style={{ background: hex }} />
              </button>
            ))}
          </div>
          {prefs.recentes.length > 0 && (
            <div className="desenho-amostras" role="group" aria-label={t('Últimas cores')}>
              <span className="desenho-rotulo q">{t('Últimas')}</span>
              {prefs.recentes.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className="desenho-amostra"
                  aria-label={hex}
                  aria-pressed={prefs.cor === hex}
                  title={hex}
                  onClick={() => desenho.escolherCor(hex)}
                >
                  <span className="desenho-cor" style={{ background: hex }} />
                </button>
              ))}
            </div>
          )}
          <div className="desenho-rgb">
            {campo(
              t('Cor'),
              <input
                type="color"
                className="desenho-seletor"
                value={prefs.cor}
                aria-label={t('Escolher a cor')}
                onChange={(e) => desenho.escolherCor(normalizarHex(e.target.value) ?? prefs.cor)}
              />,
            )}
            {(['r', 'g', 'b'] as const).map((canal) =>
              campo(
                canal.toUpperCase(),
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={255}
                  step={1}
                  value={rgb[canal]}
                  aria-label={t('Cor, canal {canal} (0 a 255)', { canal: canal.toUpperCase() })}
                  onChange={(e) => desenho.escolherCor(trocarCanal(prefs.cor, canal, e.target.value))}
                />,
              ),
            )}
            {campo(
              'HEX',
              <input
                ref={hexRef}
                type="text"
                defaultValue={prefs.cor}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                aria-label={t('Cor em HEX')}
                onChange={(e) => {
                  const hex = normalizarHex(e.target.value);
                  if (hex) desenho.escolherCor(hex);
                }}
                onBlur={(e) => {
                  e.target.value = prefs.cor;
                }}
              />,
            )}
          </div>
        </div>
      )}

      <div className="desenho-linha desenho-grossura">
        <label className="desenho-controle">
          <span className="desenho-rotulo q">
            {t('Grossura')} <b className="desenho-valor">{w} px</b>
          </span>
          <input
            type="range"
            min={LARGURA_MIN}
            max={LARGURA_MAX}
            step={1}
            value={w}
            aria-label={t('Grossura do traço, em pixels')}
            aria-valuetext={`${w} px`}
            onChange={(e) => desenho.escolherLargura(Number(e.target.value))}
          />
        </label>
        {temOpacidade(f) && (
          <label className="desenho-controle">
            <span className="desenho-rotulo q">
              {t('Opacidade')} <b className="desenho-valor">{opacidade}%</b>
            </span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={opacidade}
              aria-label={t('Opacidade do traço, em porcentagem')}
              aria-valuetext={`${opacidade}%`}
              onChange={(e) => desenho.escolherOpacidade(Number(e.target.value) / 100)}
            />
          </label>
        )}
        <PreVisualizacao desenho={desenho} />
        <span className="desenho-nome-tipo mut" aria-hidden>
          {t(NOME_DO_TIPO[f])}
        </span>
      </div>

      <div className="desenho-linha desenho-acoes">
        {acao(t('Desfazer'), Undo2, desenho.desfazer, !desenho.podeDesfazer)}
        {acao(t('Refazer'), Redo2, desenho.refazer, !desenho.podeRefazer)}
        {acao(t('Limpar tudo'), Trash2, () => void desenho.limparTudo(), !desenho.temTracos, true)}
        <span className="desenho-dica mut">{t('Ctrl+Z desfaz, Ctrl+Shift+Z refaz')}</span>
      </div>
    </div>
  );
}
