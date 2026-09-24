/**
 * ADICIONAR PALAVRA — o diálogo "V4" do protótipo aprovado (`dialogoAddPalavra()`).
 *
 * Grava pelo MESMO caminho do Analista de Vocabulário (`ficharPalavraDoAnalista`): resolução do
 * idioma, régua de qualidade e deduplicação no servidor, e o motivo dito quando ele recusa.
 *
 * FICA DE FORA do desenho: o campo "Nível" (o cartão novo não recebe nível escrito à mão — o
 * servidor o lê da wordlist) e a tradução automática de campo vazio (o fichamento grava a tradução
 * que existe, nunca uma inventada; vazia, a palavra entra sem verso e a tela avisa).
 */
import { Plus } from 'lucide-react';
import React, { useId, useState } from 'react';

import { ficharPalavraDoAnalista } from '../../../lib/adicionarAoDeck';
import type { LangConfig } from '../../../lib/langConfig';
import { baseLang } from '../../../lib/languages';
import type { VocabCard } from '../../../types';
import { toast } from '../../Toast';
import Dialogo from './Dialogo';

export default function AdicionarPalavra({
  cartoes,
  langCfg,
  aoFechar,
  aoAdicionar,
}: {
  cartoes: VocabCard[];
  langCfg: LangConfig;
  aoFechar: () => void;
  aoAdicionar: (criados: VocabCard[]) => void;
}) {
  const [palavra, setPalavra] = useState('');
  const [traducao, setTraducao] = useState('');
  const [frase, setFrase] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const id = useId();

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = palavra.trim();
    if (!w) {
      setErro('Escreva a palavra.');
      return;
    }
    if (cartoes.some((c) => c.word.toLowerCase() === w.toLowerCase())) {
      setErro(`“${w}” já está no caderno.`);
      return;
    }
    setEnviando(true);
    const criados = await ficharPalavraDoAnalista(
      { word: w, translation: traducao.trim(), example: frase.trim() || undefined, lang: baseLang(langCfg.studying) },
      langCfg,
    );
    setEnviando(false);
    if (!criados.length) return; // o motivo da recusa já foi dito por `ficharCartao`
    aoAdicionar(criados);
    toast.ok(`“${w}” entrou no caderno`);
    aoFechar();
  };

  return (
    <Dialogo icone={Plus} titulo="Adicionar palavra" sub="Entra no caderno e na próxima revisão." aoFechar={aoFechar}>
      <form className="dlg-corpo pilha" noValidate onSubmit={(e) => void enviar(e)}>
        <div>
          <label className="rot" htmlFor={`${id}-w`}>
            Palavra ou expressão
          </label>
          <input
            className="campo"
            id={`${id}-w`}
            required
            autoComplete="off"
            autoFocus
            aria-describedby={`${id}-erro`}
            aria-invalid={erro ? true : undefined}
            value={palavra}
            onChange={(e) => {
              setPalavra(e.target.value);
              if (erro) setErro('');
            }}
          />
          <p className="erro-campo" id={`${id}-erro`} role="alert">
            {erro}
          </p>
        </div>
        <div>
          <label className="rot" htmlFor={`${id}-t`}>
            Tradução
          </label>
          <input
            className="campo"
            id={`${id}-t`}
            placeholder="Deixe vazio se ainda não souber"
            value={traducao}
            onChange={(e) => setTraducao(e.target.value)}
          />
        </div>
        <div>
          <label className="rot" htmlFor={`${id}-ex`}>
            Frase de exemplo <span className="mut">(opcional)</span>
          </label>
          <input className="campo" id={`${id}-ex`} value={frase} onChange={(e) => setFrase(e.target.value)} />
        </div>
        <div className="dlg-pe" style={{ padding: '8px 0 0' }}>
          <button type="button" className="btn btn-outline" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn btn-solid" disabled={enviando}>
            <Plus aria-hidden /> Adicionar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
