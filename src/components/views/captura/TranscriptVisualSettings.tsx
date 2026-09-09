import { TranscriptSettings } from '../../../lib/transcriptUtils';

/**
 * Painel "Visual" da transcrição — componente ÚNICO usado tanto inline quanto no Modo Foco
 * (antes eram dois blocos JSX quase idênticos que divergiam a cada ajuste).
 */
export default function TranscriptVisualSettings({ idPrefix, dense, tsSettings, updateSetting }: {
  idPrefix: string;
  dense: boolean;
  tsSettings: TranscriptSettings;
  updateSetting: <K extends keyof TranscriptSettings>(key: K, value: TranscriptSettings[K]) => void;
}) {
  const wrap = dense
    ? 'p-4 bg-canvas border border-border-subtle rounded-xl mb-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px] animate-in slide-in-from-top-2 duration-200'
    : 'bg-surface border border-border-subtle rounded-2xl p-4 mb-6 grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs animate-in slide-in-from-top-2 duration-200 shadow-card shrink-0';
  const labelCls = dense ? 'font-bold text-ink-muted text-[9px] uppercase tracking-wide' : 'font-bold text-ink-muted text-[10px] uppercase';
  const selectCls = dense
    ? 'w-full bg-surface border border-border-subtle rounded-lg p-1.5 font-bold text-ink cursor-pointer outline-none focus:border-accent'
    : 'w-full bg-canvas border border-border-subtle rounded-lg p-2 font-semibold text-ink cursor-pointer outline-none focus:border-accent';
  const fields: Array<{ id: string; label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]>; span?: boolean }> = [
    { id: 'font-size', label: 'Tamanho', value: tsSettings.fontSize, onChange: v => updateSetting('fontSize', v as any), options: [['small', 'Pequeno'], ['medium', 'Médio'], ['large', 'Grande'], ['xlarge', 'Extra Grande'], ['xxlarge', 'Gigante']] },
    { id: 'text-color', label: 'Tema de Cor', value: tsSettings.textColor, onChange: v => updateSetting('textColor', v as any), options: [['standard', 'Padrão'], ['highContrast', 'Alto Contraste'], ['sepia', 'Sépia'], ['ocean', 'Oceano'], ['neon', 'Neon']] },
    { id: 'font-family', label: 'Fonte', value: tsSettings.fontFamily, onChange: v => updateSetting('fontFamily', v as any), options: [['sans', 'Sans (padrão)'], ['serif', 'Serif'], ['mono', 'Mono']] },
    { id: 'display-order', label: 'Ordem', value: tsSettings.displayOrder, onChange: v => updateSetting('displayOrder', v as any), options: [['original-first', 'Original primeiro'], ['translated-first', 'Tradução primeiro']] },
    { id: 'hide-original', label: 'Original', value: tsSettings.hideOriginal ? 'true' : 'false', onChange: v => updateSetting('hideOriginal', v === 'true'), options: [['false', 'Mostrar'], ['true', 'Ocultar']], span: true },
  ];
  return (
    <div className={wrap}>
      {fields.map(f => (
        <div key={f.id} className={`space-y-1 ${f.span ? 'col-span-2 sm:col-span-1' : ''}`}>
          <label htmlFor={`${idPrefix}-${f.id}`} className={labelCls}>{f.label}</label>
          <select id={`${idPrefix}-${f.id}`} name={`${idPrefix}-${f.id}`} value={f.value} onChange={(e) => f.onChange(e.target.value)} className={selectCls}>
            {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}
