import React from 'react';
import { Loader2, Search } from 'lucide-react';
import type { ImageResult } from '../data/api';

/**
 * ESCOLHER A CAPA DA SESSÃO — busca no Openverse e a grade de miniaturas.
 *
 * `Library.tsx` (editar sessão salva) e `LiveCapture.tsx` (salvar sessão recém-gravada) tinham o
 * mesmo bloco de 15 linhas: o campo com busca no Enter, o botão com spinner e a grade de 1+7
 * miniaturas onde a selecionada ganha anel. É a mesma decisão do usuário nos dois lugares, e o
 * `jscpd` a media como clone.
 *
 * DUAS DIFERENÇAS FORAM PRESERVADAS COMO PROPS em vez de niveladas, porque nivelar mudaria o que
 * está na tela hoje:
 *
 *  · `idCampo` — a Biblioteca dá `id`/`name`/`htmlFor` ao campo, a Captura não. Emitir o `id` nos
 *    dois faria a Captura ganhar rótulo associado; é uma melhoria de acessibilidade, mas seria uma
 *    mudança de DOM entrando de carona numa extração de duplicação, e a medição de a11y deste
 *    repositório é ratchet — passaria como "melhorou" sem ninguém ter decidido isso. Fica opcional:
 *    sem `idCampo`, o markup sai idêntico ao de hoje.
 *  · `dica` — só a Biblioteca mostra a linha "digite um termo e clique em Buscar". Idem.
 */
export interface BuscaDeCapaProps {
  /** Termo digitado. A busca só dispara no Enter ou no botão — nunca a cada tecla. */
  query: string;
  onQueryChange: (q: string) => void;
  onBuscar: () => void;
  carregando: boolean;
  resultados: ImageResult[];
  /** URL da capa escolhida. `''` = ícone padrão. */
  selecionada: string;
  onSelecionar: (url: string) => void;
  /** `id`/`name` do campo. Ausente = campo sem id, como na Captura hoje. */
  idCampo?: string;
  /** Linha de ajuda mostrada quando a busca não devolveu nada. Ausente = nada, como na Captura hoje. */
  dica?: React.ReactNode;
}

export default function BuscaDeCapa({
  query,
  onQueryChange,
  onBuscar,
  carregando,
  resultados,
  selecionada,
  onSelecionar,
  idCampo,
  dica,
}: BuscaDeCapaProps) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-mono uppercase tracking-wider text-ink-muted" htmlFor={idCampo}>Buscar imagem de capa</label>
      <div className="flex gap-2">
        <input
          id={idCampo}
          name={idCampo}
          type="text"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onBuscar(); }}
          placeholder="Ex.: reunião, arquitetura, oceano..."
          className="flex-1 px-3 py-2 bg-canvas text-xs border border-border-subtle rounded-xl outline-none text-ink font-medium focus:border-accent"
        />
        <button onClick={onBuscar} disabled={carregando} className="btn-outline shrink-0 text-[12px] py-1.5">
          {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Buscar
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={() => onSelecionar('')}
          className={`aspect-video border flex items-center justify-center text-[10px] font-bold cursor-pointer transition-all rounded-lg ${selecionada === '' ? 'border-accent bg-accent-soft/20 text-accent-ink font-mono' : 'border-border-subtle hover:border-accent bg-canvas'}`}
        >
          Padrão
        </button>
        {resultados.slice(0, 7).map((img) => (
          <button
            key={img.id}
            onClick={() => onSelecionar(img.url)}
            title={img.title || ''}
            className={`aspect-video relative overflow-hidden border cursor-pointer transition-all rounded-lg ${selecionada === img.url ? 'border-accent ring-2 ring-accent' : 'border-border-subtle hover:border-ink'}`}
          >
            <img src={img.thumbnail} className="w-full h-full object-cover" alt={img.title || 'capa'} />
          </button>
        ))}
      </div>
      {dica}
    </div>
  );
}
