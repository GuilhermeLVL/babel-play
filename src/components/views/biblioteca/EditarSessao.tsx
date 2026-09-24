import { Check, FileAudio, FileText, Pencil, Youtube } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { numero } from '../../../lib/i18n';
import type { Recording } from '../../../types';
import { Dialogo, fecharDialogoDe } from '../../ui';
import SeletorDeCapa, { fundoDaCapa } from '../../ui/SeletorDeCapa';

/**
 * EDITAR SESSÃO — o `dialogoEditarMidia()` (B3) do protótipo aprovado, aberto pelo menu "⋮" do card.
 *
 * Prévia (capa + título ao vivo + "quando · N palavras"), o título com validação no campo, a fileira
 * de capas e o endereço de uma imagem. Colar uma imagem (Ctrl+V) e escolher um arquivo também valem:
 * viram a capa em data URL, como já era.
 */
export default function EditarSessao({
  rec,
  aoFechar,
  aoSalvar,
}: {
  rec: Recording;
  aoFechar: () => void;
  aoSalvar: (titulo: string, capa: string) => void;
}) {
  const [titulo, setTitulo] = useState(rec.title);
  const [erro, setErro] = useState('');
  const [capa, setCapa] = useState(rec.imageUrl ?? '');
  const arquivo = useRef<HTMLInputElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const Icone = rec.type === 'video' ? Youtube : rec.type === 'document' ? FileText : FileAudio;

  const lerImagem = (f: File) => {
    const r = new FileReader();
    r.onloadend = () => setCapa(String(r.result));
    r.readAsDataURL(f);
  };

  useEffect(() => {
    const aoColar = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image'));
      const f = item?.getAsFile();
      if (f) lerImagem(f);
    };
    window.addEventListener('paste', aoColar);
    return () => window.removeEventListener('paste', aoColar);
  }, []);

  const salvar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = titulo.trim();
    if (!t) {
      setErro('O título não pode ficar vazio.');
      campo.current?.focus();
      return;
    }
    aoSalvar(t, capa.trim());
    fecharDialogoDe(e.currentTarget);
  };

  return (
    <Dialogo
      icone={Pencil}
      titulo="Editar sessão"
      sub="Título e capa aparecem na Biblioteca e na busca."
      aoFechar={aoFechar}
    >
      <form className="dlg-corpo pilha" noValidate onSubmit={salvar}>
        <div className="previa-midia">
          <span className="capa-mini" style={{ background: fundoDaCapa(capa) }}>
            {!capa && <Icone aria-hidden />}
          </span>
          <div style={{ minWidth: 0 }}>
            <b>{titulo || '—'}</b>
            <small className="mut">
              {rec.date} · {numero(rec.wordCount)} palavras
            </small>
          </div>
        </div>
        <div>
          <label className="rot" htmlFor="ed-titulo">
            Título
          </label>
          <input
            ref={campo}
            className="campo"
            id="ed-titulo"
            value={titulo}
            maxLength={80}
            required
            aria-invalid={erro ? true : undefined}
            aria-describedby="ed-erro"
            onChange={(e) => {
              setTitulo(e.target.value);
              if (e.target.value.trim()) setErro('');
            }}
          />
          <p className="erro-campo" id="ed-erro" role="alert">
            {erro}
          </p>
        </div>
        <SeletorDeCapa
          capa={capa}
          aoTrocar={setCapa}
          buscaInicial={rec.title}
          aoEscolherArquivo={() => arquivo.current?.click()}
        />
        <input
          ref={arquivo}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) lerImagem(f);
          }}
        />
        <div>
          <label className="rot" htmlFor="ed-url">
            Ou o endereço de uma imagem
          </label>
          <input
            className="campo"
            id="ed-url"
            placeholder="https://…"
            inputMode="url"
            value={capa.startsWith('data:') ? '' : capa}
            onChange={(e) => setCapa(e.target.value)}
          />
        </div>
        <div className="dlg-pe" style={{ padding: '8px 0 0' }}>
          <button type="button" className="btn btn-outline" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-solid">
            <Check aria-hidden /> Salvar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
