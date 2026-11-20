import { Globe, Loader2, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { ColecaoDaGaleria, ItemDaGaleria } from '../../../core/avatar/galeria';
import { baixarModelo, carregarColecoes, carregarItens, ErroDaGaleria } from '../../../lib/avatar/galeria';
import { t } from '../../../lib/i18n';

const POR_PAGINA = 12;

interface Props {
  /** Entrega o modelo baixado ao mesmo importador do arquivo (validador, licença, tetos). */
  aoBaixar: (bytes: Uint8Array, nome: string) => void;
  ocupado: boolean;
}

const NOME_DA_COLECAO: Record<ColecaoDaGaleria, () => string> = {
  '100avatars-r1': () => t('Série 1'),
  '100avatars-r2': () => t('Série 2'),
  '100avatars-r3': () => t('Série 3'),
};

/**
 * A GALERIA AO VIVO: SÓ a coleção 100Avatars (ToxSam, CC0). Nada é pedido a terceiros ANTES do "Quero ver":
 * sem o opt-in, o componente não faz nenhuma requisição e não mostra miniatura de ninguém. Quem é do perfil
 * protegido nem recebe este componente (`TragaOSeu` só existe para adultos). Cada requisição vai sem cookie e sem
 * referer (`lib/avatar/galeria`). O modelo escolhido passa pelo mesmo importador do arquivo próprio.
 */
export default function GaleriaDeTerceiros({ aoBaixar, ocupado }: Props) {
  const [aceitou, setAceitou] = useState(false);
  const [colecoes, setColecoes] = useState<ColecaoDaGaleria[] | null>(null);
  const [colecao, setColecao] = useState<ColecaoDaGaleria | null>(null);
  const [itens, setItens] = useState<ItemDaGaleria[] | null>(null);
  const [mostrando, setMostrando] = useState(POR_PAGINA);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const controle = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!aceitou) return;
    const c = new AbortController();
    controle.current = c;
    setErro(null);
    carregarColecoes(fetch, c.signal)
      .then((lista) => {
        if (c.signal.aborted) return;
        setColecoes(lista);
        setColecao(lista[0] ?? null);
        if (lista.length === 0) setErro(t('A galeria não devolveu nenhuma coleção aceita.'));
      })
      .catch(() => {
        if (!c.signal.aborted) setErro(t('Não deu para abrir a galeria agora. Tente de novo mais tarde.'));
      });
    return () => c.abort();
  }, [aceitou]);

  useEffect(() => {
    if (!aceitou || !colecao) return;
    const c = new AbortController();
    setItens(null);
    setMostrando(POR_PAGINA);
    carregarItens(colecao, fetch, c.signal)
      .then((l) => !c.signal.aborted && setItens(l))
      .catch(() => {
        if (!c.signal.aborted) setErro(t('Não deu para abrir essa série agora. Tente de novo mais tarde.'));
      });
    return () => c.abort();
  }, [aceitou, colecao]);

  async function usar(item: ItemDaGaleria) {
    setErro(null);
    setBaixando(item.id);
    try {
      const bytes = await baixarModelo(item, fetch, controle.current?.signal);
      aoBaixar(bytes, item.nome);
    } catch (e) {
      setErro(
        e instanceof ErroDaGaleria && e.codigo === 'grande'
          ? t('Esse modelo passa do tamanho aceito.')
          : t('Não deu para baixar esse modelo agora. Em alguns ambientes a galeria fica indisponível.'),
      );
    } finally {
      setBaixando(null);
    }
  }

  if (!aceitou) {
    return (
      <section className="q-secao" data-testid="avatar-galeria-optin">
        <header>
          <div>
            <h3>{t('Galeria ao vivo (opcional)')}</h3>
            <p>
              {t(
                'Avatares de uso livre (CC0) da série 100Avatars, da Polygonal Mind, no registro Open Source Avatars.',
              )}
            </p>
          </div>
        </header>
        <div className="av-aviso" role="note">
          <ShieldAlert aria-hidden />
          <div>
            <b>{t('Antes de abrir')}</b>
            <ul>
              <li>
                {t(
                  'Ao abrir a galeria, sites de fora (GitHub e Arweave) podem ver o endereço de internet do seu aparelho (IP).',
                )}
              </li>
              <li>{t('O Frasy não envia cookie nem dados seus.')}</li>
              <li>{t('Se você não abrir, nada é pedido. Seu arquivo e seu avatar nunca saem do aparelho.')}</li>
            </ul>
          </div>
        </div>
        <div className="av-acoes">
          <button type="button" className="q-ctl" onClick={() => setAceitou(true)} data-testid="avatar-galeria-abrir">
            <Globe aria-hidden /> {t('Quero ver a galeria')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="q-secao" data-testid="avatar-galeria">
      <header>
        <div>
          <h3>{t('Galeria ao vivo')}</h3>
          <p>{t('Série 100Avatars, Polygonal Mind, CC0. Tudo passa pela mesma verificação do seu arquivo.')}</p>
        </div>
        <button
          type="button"
          className="q-ctl"
          onClick={() => {
            controle.current?.abort();
            setAceitou(false);
            setColecoes(null);
            setItens(null);
            setErro(null);
          }}
        >
          {t('Fechar a galeria')}
        </button>
      </header>
      {erro && (
        <div className="av-aviso" role="alert" data-tom="erro">
          <ShieldAlert aria-hidden />
          <div>{erro}</div>
        </div>
      )}
      {colecoes && colecoes.length > 1 && (
        <div className="q-abas q-seg" role="group" aria-label={t('Séries')}>
          {colecoes.map((c) => (
            <button key={c} type="button" className="q-aba" aria-pressed={colecao === c} onClick={() => setColecao(c)}>
              {NOME_DA_COLECAO[c]()}
            </button>
          ))}
        </div>
      )}
      {!itens && !erro && (
        <p className="qc-nota" role="status">
          <Loader2 className="qc-gira" aria-hidden /> {t('Abrindo a galeria…')}
        </p>
      )}
      {itens && (
        <>
          <ul className="av-galeria">
            {itens.slice(0, mostrando).map((item) => (
              <li key={item.id} className="av-fonte">
                <img src={item.miniatura} alt="" loading="lazy" referrerPolicy="no-referrer" decoding="async" />
                <h4>{item.nome}</h4>
                <button
                  type="button"
                  className="q-ctl"
                  disabled={ocupado || baixando !== null}
                  onClick={() => void usar(item)}
                  aria-label={t('Usar {nome}', { nome: item.nome })}
                >
                  {baixando === item.id ? <Loader2 className="qc-gira" aria-hidden /> : null}
                  {t('Usar')}
                </button>
              </li>
            ))}
          </ul>
          {mostrando < itens.length && (
            <div className="av-acoes">
              <button type="button" className="q-ctl" onClick={() => setMostrando((n) => n + POR_PAGINA)}>
                {t('Mostrar mais')}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
