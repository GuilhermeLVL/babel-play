import { ArrowLeftRight, Check, ChevronDown, Info, Languages, Search } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { langLabel, langMatches, LANGUAGES } from '../../../lib/languages';
import { LangFlag } from '../../LangFlag';
import { Dialogo, fecharDialogoDe } from '../../ui';

/**
 * IDIOMAS DA SESSÃO — o `dialogoIdiomas()` do protótipo aprovado (C7).
 *
 * Os dois campos `.campo-idioma` com o botão de inverter no meio; escolher um abre a lista
 * `.picker` com busca logo abaixo (não um menu solto), o resumo da direção em linguagem simples e
 * os avisos que a pessoa precisa ver (os dois lados iguais, detecção sem Whisper, par sem tradutor
 * local). Quem decide o que cada lado significa é a Captura: aqui só entram os dois `Lado`s.
 */
export interface Lado {
  rotulo: string;
  codigo: string;
  /** No automático (o app detecta o idioma). */
  auto: boolean;
  /** Este lado aceita "Detectar automaticamente". */
  aceitaAuto: boolean;
  aoEscolher: (v: { auto: boolean; code?: string }) => void;
}

function CampoIdioma({ lado, aberto, aoAbrir }: { lado: Lado; aberto: boolean; aoAbrir: () => void }) {
  return (
    <button type="button" className={`campo-idioma ${aberto ? 'on' : ''}`} aria-expanded={aberto} onClick={aoAbrir}>
      <span className="label-mono">{lado.rotulo}</span>
      <span className="v">
        {lado.auto ? (
          <>✦ Detectar automaticamente</>
        ) : (
          <>
            <LangFlag code={lado.codigo} className="inline-block w-4 h-3 align-[-1px]" /> {langLabel(lado.codigo)}
          </>
        )}
      </span>
      <ChevronDown aria-hidden />
    </button>
  );
}

export default function IdiomasDaSessao({
  sub,
  lados,
  resumo,
  avisos,
  aoFechar,
}: {
  sub: string;
  lados: [Lado, Lado];
  /** A direção em linguagem simples (a mesma frase que a Captura já monta). */
  resumo: ReactNode;
  /** Os avisos que valem para o par atual; cada um já no formato `.aviso-info`. */
  avisos: ReactNode;
  aoFechar: () => void;
}) {
  const [escolhendo, setEscolhendo] = useState<0 | 1 | null>(null);
  const [busca, setBusca] = useState('');
  const campoBusca = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (escolhendo !== null) campoBusca.current?.focus();
  }, [escolhendo]);

  const [a, b] = lados;
  const lado = escolhendo === null ? null : lados[escolhendo];
  const lista = lado ? LANGUAGES.filter((l) => langMatches(l, busca)) : [];
  const detectarCabe =
    !!lado?.aceitaAuto && langMatches({ code: 'auto', short: 'auto', label: 'Detectar automaticamente' }, busca);

  const abrir = (k: 0 | 1) => {
    setBusca('');
    setEscolhendo((atual) => (atual === k ? null : k));
  };
  const escolher = (v: { auto: boolean; code?: string }) => {
    lado?.aoEscolher(v);
    setEscolhendo(null);
  };
  // Inverter só faz sentido com os dois idiomas escolhidos: "detectar" não tem para onde ir.
  const inverter = () => {
    if (a.auto || b.auto) return;
    const [ca, cb] = [a.codigo, b.codigo];
    a.aoEscolher({ auto: false, code: cb });
    b.aoEscolher({ auto: false, code: ca });
  };

  return (
    <Dialogo icone={Languages} titulo="Idiomas da sessão" sub={sub} aoFechar={aoFechar}>
      <div className="dlg-corpo pilha">
        <div className="par-idiomas">
          <CampoIdioma lado={a} aberto={escolhendo === 0} aoAbrir={() => abrir(0)} />
          <button
            type="button"
            className="btn btn-outline icone"
            aria-label="Inverter os idiomas"
            onClick={inverter}
            disabled={a.auto || b.auto}
          >
            <ArrowLeftRight aria-hidden />
          </button>
          <CampoIdioma lado={b} aberto={escolhendo === 1} aoAbrir={() => abrir(1)} />
        </div>

        {lado && (
          <div className="picker entra">
            <label className="busca">
              <Search aria-hidden />
              <span className="sr">Buscar idioma</span>
              <input
                ref={campoBusca}
                className="campo"
                placeholder="Buscar idioma…"
                value={busca}
                autoComplete="off"
                onChange={(e) => setBusca(e.target.value)}
              />
            </label>
            {lista.length || detectarCabe ? (
              <div className="picker-lista" role="listbox" aria-label="Idiomas">
                {detectarCabe && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={lado.auto}
                    onClick={() => escolher({ auto: true })}
                  >
                    <span aria-hidden>✦</span>Detectar automaticamente
                    {lado.auto && <Check aria-hidden />}
                  </button>
                )}
                {lista.map((l) => {
                  const marcado = !lado.auto && lado.codigo === l.code;
                  return (
                    <button
                      key={l.code}
                      type="button"
                      role="option"
                      aria-selected={marcado}
                      onClick={() => escolher({ auto: false, code: l.code })}
                    >
                      <LangFlag code={l.code} className="inline-block w-4 h-3" />
                      {l.label}
                      {marcado && <Check aria-hidden />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mut" style={{ padding: 12 }}>
                Nenhum idioma encontrado.
              </p>
            )}
          </div>
        )}

        <p className="resumo-idioma">
          <Info aria-hidden />
          <span>{resumo}</span>
        </p>
        {avisos}
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-solid" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          <Check aria-hidden /> Usar estes idiomas
        </button>
      </div>
    </Dialogo>
  );
}
