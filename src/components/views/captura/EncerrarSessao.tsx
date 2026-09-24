import { ArrowRight, Check, ImagePlus, Info, Loader2, Search, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { ImageResult } from '../../../data/rotas/imagens';
import { Dialogo } from '../../ui';

/**
 * ENCERRAR A SESSÃO — o `dialogoEncerrar()` do protótipo aprovado (C8), aberto ao parar a captura.
 *
 * Título, a fileira de capas `.capas` e o rodapé com as quatro saídas: descartar (com confirmação,
 * como no protótipo), continuar gravando, salvar e ficar, salvar e ir para a análise.
 *
 * As capas são as do app, não os gradientes do protótipo: "Padrão" (o ícone do tipo de mídia), a
 * capa já escolhida e os resultados da busca de imagens (Openverse, sem chave). O botão de imagem
 * abre a busca e o endereço; colar com Ctrl+V e escolher um arquivo continuam valendo.
 * O protótipo diz ainda quantas palavras novas foram para o caderno: esse número só existe depois
 * de salvar (o vocabulário é fichado em seguida), então fica de fora.
 */
export default function EncerrarSessao({
  resumo,
  retomada,
  titulo,
  aoTrocarTitulo,
  capa,
  aoTrocarCapa,
  busca,
  aoTrocarBusca,
  aoBuscar,
  buscando,
  resultados,
  aoEscolherArquivo,
  aoContinuar,
  aoSalvar,
  aoDescartar,
}: {
  /** "N falas · mm:ss" */
  resumo: string;
  /** Sessão retomada: salvar atualiza o mesmo item da Biblioteca. */
  retomada: boolean;
  titulo: string;
  aoTrocarTitulo: (v: string) => void;
  capa: string;
  aoTrocarCapa: (v: string) => void;
  busca: string;
  aoTrocarBusca: (v: string) => void;
  aoBuscar: () => void;
  buscando: boolean;
  resultados: ImageResult[];
  aoEscolherArquivo: () => void;
  /** Continuar gravando (também é o que o Esc faz). */
  aoContinuar: () => void;
  aoSalvar: (irParaAnalise: boolean) => void;
  aoDescartar: () => void;
}) {
  const [descartando, setDescartando] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);

  const opcoes: Array<{ url: string; thumb: string; rotulo: string }> = [
    ...(capa && !resultados.some((r) => r.url === capa) ? [{ url: capa, thumb: capa, rotulo: 'Capa escolhida' }] : []),
    ...resultados.slice(0, 7).map((r) => ({ url: r.url, thumb: r.thumbnail, rotulo: r.title || 'Capa' })),
  ];

  if (descartando) {
    return (
      <Dialogo
        icone={Trash2}
        titulo="Descartar esta captura?"
        sub="As falas desta captura somem. Não dá para desfazer."
        largura=""
        aoFechar={() => setDescartando(false)}
      >
        <div className="dlg-pe">
          <button type="button" className="btn btn-outline" data-autofocus onClick={() => setDescartando(false)}>
            Voltar
          </button>
          <button type="button" className="btn btn-solid perigo-solid" onClick={aoDescartar}>
            <Trash2 aria-hidden /> Descartar
          </button>
        </div>
      </Dialogo>
    );
  }

  return (
    <Dialogo icone={Square} titulo="Encerrar a sessão" sub={resumo} aoFechar={aoContinuar}>
      <div className="dlg-corpo pilha">
        {retomada && (
          <p className="aviso-info">
            <Info aria-hidden />
            <span>Sessão retomada: ao salvar, ela é atualizada no mesmo item da Biblioteca.</span>
          </p>
        )}
        <div>
          <label className="rot" htmlFor="enc-titulo">
            Título
          </label>
          <input
            className="campo"
            id="enc-titulo"
            value={titulo}
            maxLength={80}
            onChange={(e) => aoTrocarTitulo(e.target.value)}
            placeholder="Um título para a sessão"
          />
        </div>
        <div>
          <span className="label-mono">Capa</span>
          <div className="capas" role="radiogroup" aria-label="Capa">
            <button
              type="button"
              className="capa-op"
              role="radio"
              aria-checked={capa === ''}
              aria-label="Padrão"
              title="Padrão: o ícone do tipo de mídia"
              style={{ background: 'linear-gradient(135deg,var(--accent),var(--warn))' }}
              onClick={() => aoTrocarCapa('')}
            >
              {capa === '' && <Check aria-hidden />}
            </button>
            {opcoes.map((o) => (
              <button
                key={o.url}
                type="button"
                className="capa-op"
                role="radio"
                aria-checked={capa === o.url}
                aria-label={o.rotulo}
                title={o.rotulo}
                style={{ background: `center / cover no-repeat url("${o.thumb.replace(/"/g, '%22')}")` }}
                onClick={() => aoTrocarCapa(o.url)}
              >
                {capa === o.url && <Check aria-hidden />}
              </button>
            ))}
            <button
              type="button"
              className="capa-op mais"
              aria-label="Buscar imagem de capa"
              aria-expanded={buscaAberta}
              onClick={() => setBuscaAberta((v) => !v)}
            >
              <ImagePlus aria-hidden />
            </button>
          </div>
          {buscaAberta && (
            <div className="pilha entra" style={{ marginTop: 10 }}>
              <div className="linha" style={{ gap: 8 }}>
                <label className="busca" style={{ flex: 1, maxWidth: 'none' }}>
                  <Search aria-hidden />
                  <span className="sr">Buscar imagem de capa</span>
                  <input
                    className="campo"
                    value={busca}
                    placeholder="Ex.: reunião, arquitetura, oceano…"
                    onChange={(e) => aoTrocarBusca(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') aoBuscar();
                    }}
                  />
                </label>
                <button type="button" className="btn btn-outline" onClick={aoBuscar} disabled={buscando}>
                  {buscando ? <Loader2 aria-hidden className="animate-spin" /> : <Search aria-hidden />} Buscar
                </button>
              </div>
              <label className="sr" htmlFor="enc-capa-url">
                Endereço de uma imagem
              </label>
              <input
                className="campo"
                id="enc-capa-url"
                value={capa}
                placeholder="Ou cole o endereço de uma imagem: https://…"
                onChange={(e) => aoTrocarCapa(e.target.value)}
              />
            </div>
          )}
          <p className="mut aj" style={{ marginTop: 6 }}>
            Também dá para colar uma imagem com <kbd>Ctrl</kbd>+<kbd>V</kbd> ou{' '}
            <button type="button" className="link" onClick={aoEscolherArquivo}>
              escolher um arquivo
            </button>
            .
          </p>
        </div>
      </div>
      <div className="dlg-pe col-celular">
        <button
          type="button"
          className="link perigo"
          style={{ marginRight: 'auto' }}
          onClick={() => setDescartando(true)}
        >
          Descartar
        </button>
        <button type="button" className="btn btn-outline" onClick={aoContinuar}>
          Continuar gravando
        </button>
        <button type="button" className="btn btn-outline" onClick={() => aoSalvar(false)}>
          Salvar e ficar aqui
        </button>
        <button type="button" className="btn btn-solid" data-autofocus onClick={() => aoSalvar(true)}>
          <ArrowRight aria-hidden /> Salvar e ir para a análise
        </button>
      </div>
    </Dialogo>
  );
}
