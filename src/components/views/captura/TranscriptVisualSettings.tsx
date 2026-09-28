import '../../../styles/legendas.css';

import {
  classesDoEstilo,
  ESTILOS_DE_LEGENDA,
  possuiEstiloDeLegenda,
  resolverEstiloDeLegenda,
} from '../../../lib/estilosDeLegenda';
import { CATALOGO_DA_LOJA } from '../../../lib/loja';
import type { TranscriptSettings } from '../../../lib/transcriptUtils';

/** O nome de um estilo de legenda, do catálogo (a mesma fonte da Loja). */
const nomeDoEstilo = (id: string) =>
  CATALOGO_DA_LOJA.find((i) => i.tipo === 'legenda' && i.alvo === id)?.nome.replace(/^Legenda /, '') ?? id;

/**
 * APARÊNCIA DA LEGENDA — a seção do diálogo "Dispositivos e modelos de IA" do protótipo aprovado
 * (`dialogoAjustesCaptura()`): cinco selects em `.g-vis` e a prévia `.previa-leg`, que muda com a
 * escolha. Os cinco campos são os de `TranscriptSettings`, os mesmos que a transcrição ao vivo lê.
 */
const CAMPOS: Array<{
  chave: Exclude<keyof TranscriptSettings, 'estilo'>;
  rotulo: string;
  opcoes: Array<[string, string]>;
}> = [
  {
    chave: 'fontSize',
    rotulo: 'Tamanho',
    opcoes: [
      ['small', 'Pequeno'],
      ['medium', 'Médio'],
      ['large', 'Grande'],
      ['xlarge', 'Extra grande'],
      ['xxlarge', 'Gigante'],
    ],
  },
  {
    chave: 'textColor',
    rotulo: 'Tema de cor',
    opcoes: [
      ['standard', 'Padrão'],
      ['highContrast', 'Alto contraste'],
      ['sepia', 'Sépia'],
      ['ocean', 'Oceano'],
      ['neon', 'Neon'],
    ],
  },
  {
    chave: 'fontFamily',
    rotulo: 'Fonte',
    opcoes: [
      ['sans', 'Sans (padrão)'],
      ['serif', 'Serif'],
      ['mono', 'Mono'],
    ],
  },
  {
    chave: 'displayOrder',
    rotulo: 'Ordem',
    opcoes: [
      ['original-first', 'Original primeiro'],
      ['translated-first', 'Tradução primeiro'],
    ],
  },
  {
    chave: 'hideOriginal',
    rotulo: 'Original',
    opcoes: [
      ['false', 'Mostrar'],
      ['true', 'Ocultar'],
    ],
  },
];

/** As classes da prévia no vocabulário do protótipo (`tema-*`, `tam-*`, `fonte-*`). */
export const TEMA: Record<TranscriptSettings['textColor'], string> = {
  standard: 'padrao',
  highContrast: 'contraste',
  sepia: 'sepia',
  ocean: 'oceano',
  neon: 'neon',
};
const TAMANHO: Record<TranscriptSettings['fontSize'], string> = {
  small: 'pequeno',
  medium: 'medio',
  large: 'grande',
  xlarge: 'extra',
  xxlarge: 'gigante',
};

export default function TranscriptVisualSettings({
  idPrefix,
  tsSettings,
  updateSetting,
}: {
  idPrefix: string;
  tsSettings: TranscriptSettings;
  updateSetting: <K extends keyof TranscriptSettings>(key: K, value: TranscriptSettings[K]) => void;
}) {
  const trocar = (chave: keyof TranscriptSettings, v: string) => {
    if (chave === 'hideOriginal') updateSetting('hideOriginal', v === 'true');
    else updateSetting(chave, v as never);
  };
  const traduzida = <span className="t">Vamos repassar o roteiro.</span>;
  /* O ESTILO (onda 4): só os que a pessoa tem; a prévia veste o estilo resolvido, com a cor de
     alto contraste por cima, igual à legenda de verdade. */
  const meusEstilos = ESTILOS_DE_LEGENDA.filter((e) => possuiEstiloDeLegenda(e.id));
  const estilo = resolverEstiloDeLegenda(tsSettings.estilo, { altoContraste: tsSettings.textColor === 'highContrast' });
  return (
    <>
      <div className="g-vis">
        {CAMPOS.map(({ chave, rotulo, opcoes }) => (
          <label key={chave} htmlFor={`${idPrefix}-${chave}`}>
            <span className="label-mono">{rotulo}</span>
            <select
              className="campo"
              id={`${idPrefix}-${chave}`}
              name={`${idPrefix}-${chave}`}
              aria-label={rotulo}
              value={String(tsSettings[chave])}
              onChange={(e) => trocar(chave, e.target.value)}
            >
              {opcoes.map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label htmlFor={`${idPrefix}-estilo`}>
          <span className="label-mono">Estilo</span>
          <select
            className="campo"
            id={`${idPrefix}-estilo`}
            name={`${idPrefix}-estilo`}
            aria-label="Estilo"
            value={estilo.id}
            onChange={(e) => updateSetting('estilo', e.target.value)}
          >
            {meusEstilos.map((e) => (
              <option key={e.id} value={e.id}>
                {nomeDoEstilo(e.id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className={`previa-leg tema-${TEMA[tsSettings.textColor]} tam-${TAMANHO[tsSettings.fontSize]} fonte-${tsSettings.fontFamily} ${classesDoEstilo(estilo)}`}
        aria-label="Prévia da legenda"
      >
        {tsSettings.displayOrder === 'translated-first' && traduzida}
        {!tsSettings.hideOriginal && (
          <span className="o leg-o">
            Let&apos;s go over the <span data-aprendida>roadmap</span>.
          </span>
        )}
        {tsSettings.displayOrder === 'original-first' && traduzida}
      </div>
    </>
  );
}
