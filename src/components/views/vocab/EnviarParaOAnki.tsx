/**
 * "ANKI NO COMPUTADOR" — o painel que manda os cartões ao Anki aberto, pelo complemento AnkiConnect.
 *
 * Tudo acontece neste navegador (`src/lib/anki/ankiConnect.ts`): o servidor do Frasy não participa e nada sai
 * para terceiros. O painel só existe no computador (o AnkiConnect é do Anki de mesa).
 *
 * Fluxo: testar a conexão (o Anki pede permissão na 1ª vez) → escolher baralho, modelo e campos → enviar,
 * com progresso e resumo (adicionados, já existiam, erros). As escolhas ficam só neste aparelho.
 */
import { Check, Plug, Send } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  type CartaoParaAnki,
  type MapeamentoDeCampos,
  mapeamentoPadrao,
  mapeamentoUsavel,
  PAPEIS_DO_CAMPO,
  type PapelDoCampo,
} from '../../../core/anki/paraAnkiConnect';
import {
  camposDoModelo,
  definirChaveDoAnki,
  enviarCartoes,
  type EnvioInterrompido,
  ErroDoAnkiConnect,
  listarBaralhos,
  listarModelos,
  type ResumoDoEnvio,
  testarConexao,
  trechoDeConfiguracao,
} from '../../../lib/anki/ankiConnect';
import {
  gravarChaveDoAnki,
  gravarPrefsDoAnki,
  lerChaveDoAnki,
  lerPrefsDoAnki,
  type PrefsDoAnki,
} from '../../../lib/anki/ankiConnectPrefs';
import { numero, t } from '../../../lib/i18n';
import type { VocabCard } from '../../../types';
import { toast } from '../../Toast';
import { CampoLinha } from './Dialogo';

export const BARALHO_PADRAO = 'Frasy';
const MODELOS_BASICOS = ['Basic', 'Básico', 'Basique'];

/** Os campos do cartão do Frasy que o Anki recebe. Etiqueta: o nível, se houver (o `frasy` entra sempre). */
export function cartaoParaAnki(c: VocabCard): CartaoParaAnki {
  return {
    palavra: c.word,
    traducao: c.translation ?? '',
    frase: c.sentence,
    nota: c.explanation,
    nivel: c.cefrLevel,
    etiquetas: c.cefrLevel ? [c.cefrLevel] : [],
  };
}

const rotuloDoPapel = (p: PapelDoCampo): string =>
  ({
    palavra: t('Palavra'),
    traducao: t('Tradução'),
    verso: t('Tradução e frase de contexto'),
    frase: t('Frase de contexto'),
    cloze: t('Frase com lacuna (cloze)'),
    nota: t('Nota'),
    nivel: t('Nível'),
    nenhum: t('Deixar em branco'),
  })[p];

type Etapa = 'inicio' | 'testando' | 'pronto' | 'enviando' | 'feito';

export default function EnviarParaOAnki({ cartoes }: { cartoes: VocabCard[] }) {
  const [etapa, setEtapa] = useState<Etapa>('inicio');
  const [erro, setErro] = useState<ErroDoAnkiConnect | null>(null);
  const [baralhos, setBaralhos] = useState<string[]>([]);
  const [modelos, setModelos] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<PrefsDoAnki>(() => lerPrefsDoAnki());
  const [chave, setChave] = useState(() => lerChaveDoAnki());
  const [campos, setCampos] = useState<string[]>([]);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [resumo, setResumo] = useState<ResumoDoEnvio | null>(null);
  const [interrompido, setInterrompido] = useState(false);
  const cancelar = useRef<AbortController | null>(null);

  useEffect(() => () => cancelar.current?.abort(), []);

  const baralho = prefs.baralho || BARALHO_PADRAO;
  const modelo = prefs.modelo;
  const mapeamento: MapeamentoDeCampos = useMemo(
    () => ({ ...mapeamentoPadrao(campos), ...(prefs.mapeamentos[modelo] ?? {}) }),
    [campos, prefs.mapeamentos, modelo],
  );
  /** Só vale o que o modelo ATUAL tem: campo apagado no Anki some do mapa. */
  const mapaFinal = useMemo(
    () => Object.fromEntries(campos.map((c) => [c, mapeamento[c] ?? 'nenhum'])),
    [campos, mapeamento],
  );

  const guardar = (novo: PrefsDoAnki) => {
    setPrefs(novo);
    gravarPrefsDoAnki(novo);
  };

  /** O modelo pedido por último: a resposta de um modelo que já foi trocado é descartada. */
  const modeloPedido = useRef('');
  const carregarCampos = async (nome: string) => {
    modeloPedido.current = nome;
    try {
      const lista = await camposDoModelo(nome);
      if (modeloPedido.current === nome) setCampos(lista);
    } catch (e) {
      if (modeloPedido.current !== nome) return;
      setErro(e instanceof ErroDoAnkiConnect ? e : null);
      setCampos([]);
    }
  };

  const testar = async () => {
    setErro(null);
    setResumo(null);
    setEtapa('testando');
    try {
      definirChaveDoAnki(chave.chave);
      gravarChaveDoAnki(chave.chave, chave.lembrar);
      await testarConexao();
      const [decks, models] = await Promise.all([listarBaralhos(), listarModelos()]);
      setBaralhos(decks);
      setModelos(models);
      const salvo = lerPrefsDoAnki();
      const escolhido =
        (models.includes(salvo.modelo) && salvo.modelo) ||
        MODELOS_BASICOS.find((m) => models.includes(m)) ||
        models[0] ||
        '';
      guardar({ ...salvo, modelo: escolhido, baralho: salvo.baralho || BARALHO_PADRAO });
      if (escolhido) await carregarCampos(escolhido);
      setEtapa('pronto');
    } catch (e) {
      setErro(
        e instanceof ErroDoAnkiConnect ? e : new ErroDoAnkiConnect('erro-do-anki', t('O Anki recusou o pedido.')),
      );
      setEtapa('inicio');
    }
  };

  const trocarModelo = (nome: string) => {
    guardar({ ...prefs, modelo: nome });
    void carregarCampos(nome);
  };

  const trocarPapel = (campo: string, papel: PapelDoCampo) =>
    guardar({ ...prefs, mapeamentos: { ...prefs.mapeamentos, [modelo]: { ...mapaFinal, [campo]: papel } } });

  const nomeDeBaralhoOk = baralho.trim().length > 0 && baralho.length <= 200;
  const podeEnviar =
    etapa === 'pronto' && cartoes.length > 0 && !!modelo && nomeDeBaralhoOk && mapeamentoUsavel(mapaFinal);

  const enviar = async () => {
    const ctl = new AbortController();
    cancelar.current = ctl;
    setErro(null);
    setResumo(null);
    setInterrompido(false);
    let ultimo: ResumoDoEnvio | null = null;
    setProgresso({ feitos: 0, total: cartoes.length });
    setEtapa('enviando');
    try {
      definirChaveDoAnki(chave.chave);
      const r = await enviarCartoes(
        cartoes.map(cartaoParaAnki),
        { baralho: baralho.trim(), modelo, mapeamento: mapaFinal },
        {
          sinal: ctl.signal,
          aoProgredir: (feitos, total, parcial) => {
            ultimo = parcial;
            setProgresso({ feitos, total });
          },
        },
      );
      setResumo(r);
      setInterrompido(ctl.signal.aborted);
      setEtapa(ctl.signal.aborted ? 'pronto' : 'feito');
      if (r.adicionados > 0) toast.ok(t('{n} no Anki.', { n: numero(r.adicionados) }));
    } catch (e) {
      // Parou, o Anki fechou ou deu erro no meio: volta ao painel com o que já foi feito.
      const parcial = (e as EnvioInterrompido | null)?.parcial ??
        ultimo ?? { adicionados: 0, duplicados: 0, invalidas: 0, erros: 0 };
      setResumo(parcial);
      setInterrompido(true);
      if (!ctl.signal.aborted) {
        setErro(
          e instanceof ErroDoAnkiConnect ? e : new ErroDoAnkiConnect('erro-do-anki', t('O Anki recusou o pedido.')),
        );
      }
      setEtapa('pronto');
    } finally {
      setProgresso(null);
    }
  };

  const ocupado = etapa === 'testando' || etapa === 'enviando';

  return (
    <section className="pilha" aria-label={t('Anki no computador')} data-testid="enviar-anki">
      <p className="mut" style={{ fontSize: 12.5 }}>
        {t(
          'Manda os cartões direto para o Anki aberto neste computador, sem baixar arquivo. Precisa do complemento AnkiConnect e do Anki aberto. Nada passa pelo servidor do Frasy.',
        )}
      </p>
      <CampoLinha
        rotulo={t('Chave do AnkiConnect')}
        desc={t('Só se o seu AnkiConnect tiver “apiKey”. Recomendamos ter: protege o seu Anki.')}
      >
        <input
          className="input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          value={chave.chave}
          disabled={ocupado}
          aria-label={t('Chave do AnkiConnect')}
          onChange={(e) => setChave({ ...chave, chave: e.target.value })}
        />
        <label style={{ display: 'block', fontSize: 12.5 }}>
          <input
            type="checkbox"
            checked={chave.lembrar}
            disabled={ocupado}
            onChange={(e) => setChave({ ...chave, lembrar: e.target.checked })}
          />{' '}
          {t('Lembrar neste aparelho')}
        </label>
      </CampoLinha>
      <div>
        <button type="button" className="btn btn-outline" disabled={ocupado} onClick={() => void testar()}>
          <Plug aria-hidden /> {etapa === 'testando' ? t('Conectando…') : t('Testar conexão com o Anki')}
        </button>
        {etapa === 'pronto' || etapa === 'enviando' || etapa === 'feito' ? (
          <span className="mut" style={{ marginInlineStart: 8 }} role="status">
            <Check style={{ width: 13, height: 13, verticalAlign: -2, display: 'inline' }} aria-hidden />{' '}
            {t('Conectado ao Anki.')}
          </span>
        ) : null}
      </div>

      {erro && (
        <div role="alert" className="cartao" style={{ padding: 12 }}>
          <p>{erro.message}</p>
          {erro.motivo === 'origem-nao-liberada' && (
            <pre style={{ userSelect: 'all', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              <code>{trechoDeConfiguracao()}</code>
            </pre>
          )}
        </div>
      )}

      {(etapa === 'pronto' || etapa === 'enviando' || etapa === 'feito') && (
        <>
          <CampoLinha rotulo={t('Baralho')} desc={t('Se não existir, o Anki cria.')}>
            <input
              className="input"
              list="anki-baralhos"
              value={baralho}
              maxLength={200}
              disabled={ocupado}
              aria-label={t('Baralho')}
              onChange={(e) => guardar({ ...prefs, baralho: e.target.value })}
            />
            <datalist id="anki-baralhos">
              {baralhos.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </CampoLinha>
          <CampoLinha rotulo={t('Modelo de cartão')} desc={t('O “Basic” serve para a maioria.')}>
            <select
              className="input"
              value={modelo}
              disabled={ocupado}
              aria-label={t('Modelo de cartão')}
              onChange={(e) => trocarModelo(e.target.value)}
            >
              {modelos.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </CampoLinha>
          {campos.length > 0 && (
            <fieldset className="pilha" style={{ border: 0, padding: 0, margin: 0 }} disabled={ocupado}>
              <legend className="label-mono">{t('O que vai em cada campo')}</legend>
              {campos.map((campo) => (
                <CampoLinha key={campo} rotulo={campo}>
                  <select
                    className="input"
                    value={mapaFinal[campo]}
                    aria-label={t('O que vai no campo {campo}', { campo })}
                    onChange={(e) => trocarPapel(campo, e.target.value as PapelDoCampo)}
                  >
                    {PAPEIS_DO_CAMPO.map((p) => (
                      <option key={p} value={p}>
                        {rotuloDoPapel(p)}
                      </option>
                    ))}
                  </select>
                </CampoLinha>
              ))}
              {!mapeamentoUsavel(mapaFinal) && (
                <p className="mut" role="status">
                  {t('Escolha ao menos um campo para a palavra ou a tradução.')}
                </p>
              )}
            </fieldset>
          )}
          <p className="mut" style={{ fontSize: 12.5 }}>
            {t(
              'As etiquetas do cartão e a etiqueta “frasy” vão junto. Palavras que já estão no baralho não são repetidas.',
            )}
          </p>
          <div>
            <button type="button" className="btn btn-solid" disabled={!podeEnviar} onClick={() => void enviar()}>
              <Send aria-hidden />{' '}
              {etapa === 'enviando' ? t('Enviando…') : t('Enviar {n} para o Anki', { n: numero(cartoes.length) })}
            </button>
            {etapa === 'enviando' && (
              <button
                type="button"
                className="btn btn-outline"
                style={{ marginInlineStart: 8 }}
                onClick={() => cancelar.current?.abort()}
              >
                {t('Parar')}
              </button>
            )}
          </div>
        </>
      )}

      {progresso && (
        <div role="status" aria-live="polite">
          <progress value={progresso.feitos} max={progresso.total} aria-label={t('Progresso do envio')} />{' '}
          <small className="mut">
            {numero(progresso.feitos)} / {numero(progresso.total)}
          </small>
        </div>
      )}

      {resumo && (
        <div role="status" className="cartao" style={{ padding: 12 }} data-testid="resumo-anki">
          <b>{interrompido ? t('Envio interrompido. Até aqui:') : t('Pronto.')}</b>
          <ul>
            <li>{t('Adicionados: {n}', { n: numero(resumo.adicionados) })}</li>
            <li>{t('Já estavam no baralho: {n}', { n: numero(resumo.duplicados) })}</li>
            <li>{t('Que o Anki não aceita: {n}', { n: numero(resumo.invalidas) })}</li>
            <li>{t('Com erro: {n}', { n: numero(resumo.erros) })}</li>
          </ul>
        </div>
      )}
    </section>
  );
}
