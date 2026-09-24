import { ArrowRight, Info, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Dialogo } from '../../ui';
import SeletorDeCapa from '../../ui/SeletorDeCapa';

/**
 * ENCERRAR A SESSÃO — o `dialogoEncerrar()` do protótipo aprovado (C8), aberto ao parar a captura.
 *
 * Título, a fileira de capas `.capas` e o rodapé com as quatro saídas: descartar (com confirmação,
 * como no protótipo), continuar gravando, salvar e ficar, salvar e ir para a análise.
 *
 * A fileira de capas é a `SeletorDeCapa` (a mesma de "Editar sessão" na Biblioteca): as quatro capas
 * do protótipo, a escolhida e a busca de imagens; colar com Ctrl+V e escolher um arquivo valem.
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
  buscaInicial,
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
  /** Termo já preenchido na busca de capa (o título da sessão). */
  buscaInicial: string;
  aoEscolherArquivo: () => void;
  /** Continuar gravando (também é o que o Esc faz). */
  aoContinuar: () => void;
  aoSalvar: (irParaAnalise: boolean) => void;
  aoDescartar: () => void;
}) {
  const [descartando, setDescartando] = useState(false);

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
        <SeletorDeCapa
          capa={capa}
          aoTrocar={aoTrocarCapa}
          buscaInicial={buscaInicial}
          aoEscolherArquivo={aoEscolherArquivo}
          extraDaBusca={
            <>
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
            </>
          }
        />
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
