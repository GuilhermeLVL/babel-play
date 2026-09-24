import type { TranscriptSettings } from '../../../lib/transcriptUtils';

/**
 * APARÊNCIA DA LEGENDA — a seção do diálogo "Dispositivos e modelos de IA" do protótipo aprovado
 * (`dialogoAjustesCaptura()`): cinco selects em `.g-vis` e a prévia `.previa-leg`, que muda com a
 * escolha. Os cinco campos são os de `TranscriptSettings`, os mesmos que a transcrição ao vivo lê.
 */
const CAMPOS: Array<{
  chave: keyof TranscriptSettings;
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
      </div>
      <div
        className={`previa-leg tema-${TEMA[tsSettings.textColor]} tam-${TAMANHO[tsSettings.fontSize]} fonte-${tsSettings.fontFamily}`}
        aria-label="Prévia da legenda"
      >
        {tsSettings.displayOrder === 'translated-first' && traduzida}
        {!tsSettings.hideOriginal && <span className="o">Let&apos;s go over the roadmap.</span>}
        {tsSettings.displayOrder === 'original-first' && traduzida}
      </div>
    </>
  );
}
