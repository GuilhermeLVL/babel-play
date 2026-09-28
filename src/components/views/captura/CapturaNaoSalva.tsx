import { Download, HardDrive, RotateCw, Trash2, TriangleAlert, UserPlus } from 'lucide-react';
import { useState } from 'react';

import type { FalhaDoSalvamento } from '../../../lib/captura/estadoDoSalvamento';
import type { RascunhoDaCaptura } from '../../../lib/captura/rascunhoDaCaptura';
import { t, tp } from '../../../lib/i18n';
import type { Recording } from '../../../types';

/**
 * O FIM DA CAPTURA SEM PORTA TRANCADA (relato do dono, 2026-09-28: "fico preso na tela").
 *
 * Dois momentos, o mesmo aviso e as mesmas saídas, sempre na própria tela de captura (nunca um
 * diálogo que só reabre a si mesmo):
 *
 *  - `teto`: ANTES de gravar, o acervo sem conta está cheio. Gravar só terminaria numa recusa, então
 *    a tela diz o limite e o que fazer: apagar uma gravação antiga ali mesmo e, na edição completa,
 *    criar a conta (grátis). Na edição estática não há conta a criar e o botão não existe.
 *  - `naoSalva`: a captura foi recusada (teto, rede, servidor). Ela está no rascunho do navegador;
 *    as saídas são tentar de novo, baixar (texto e áudio) e descartar — com confirmação, porque é
 *    a única que perde alguma coisa.
 *
 * A Biblioteca não serve de saída aqui: sem conta ela mostra o convite, não a lista. Por isso a
 * lista das gravações guardadas, com "Apagar", aparece dentro do próprio aviso.
 */
export default function CapturaNaoSalva({
  modo,
  estatica,
  teto,
  falha,
  rascunho,
  gravacoes,
  salvando,
  aoCriarConta,
  aoApagarGravacao,
  aoTentarDeNovo,
  aoBaixar,
  aoDescartar,
}: {
  modo: 'teto' | 'naoSalva';
  /** Edição estática: não há conta a criar. */
  estatica: boolean;
  /** O teto de gravações desta edição. */
  teto: number;
  falha?: FalhaDoSalvamento | null;
  rascunho?: RascunhoDaCaptura | null;
  /** As gravações guardadas, para apagar uma antiga. */
  gravacoes: Recording[];
  salvando?: boolean;
  aoCriarConta?: () => void;
  aoApagarGravacao: (id: string) => Promise<boolean>;
  aoTentarDeNovo?: () => void;
  aoBaixar?: () => void;
  aoDescartar?: () => void;
}) {
  const [listaAberta, setListaAberta] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [descartando, setDescartando] = useState(false);

  const pediuTeto = modo === 'teto' || !!falha?.teto;
  const podeCriarConta = pediuTeto && !estatica && !!aoCriarConta;

  const titulo =
    modo === 'teto' ? t('O limite de gravações deste navegador foi atingido') : t('Esta captura ainda não foi salva');
  const motivo = pediuTeto
    ? estatica
      ? t('Esta é a edição de demonstração: ela guarda até {n} gravações neste navegador.', { n: teto })
      : t('Sem conta dá para guardar {n} gravações neste navegador.', { n: teto })
    : (falha?.mensagem ?? '');
  const oQueFazer =
    modo === 'teto'
      ? estatica
        ? t('Para gravar de novo, apague uma gravação antiga.')
        : t('Para gravar de novo, apague uma gravação antiga ou crie uma conta (grátis): com conta não há limite.')
      : t('Ela está guardada neste navegador: dá para tentar de novo agora ou depois, baixar ou descartar.');

  const apagar = async (id: string) => {
    setApagando(id);
    try {
      await aoApagarGravacao(id);
    } finally {
      setApagando(null);
      setConfirmarApagar(null);
    }
  };

  return (
    <section className="cartao pilha" aria-labelledby="captura-nao-salva-titulo" data-testid="captura-nao-salva" role="region">
      <p className="aviso-info warn">
        <TriangleAlert aria-hidden />
        <span>
          <b id="captura-nao-salva-titulo">{titulo}</b>
          {rascunho && modo === 'naoSalva' && (
            <>
              {' · '}
              {rascunho.titulo} ·{' '}
              {tp(rascunho.utterances.length, '{n} fala', '{n} falas')}
            </>
          )}
        </span>
      </p>
      {motivo && <p style={{ fontSize: 13 }}>{motivo}</p>}
      <p className="mut" style={{ fontSize: 12.5 }}>
        {oQueFazer}
      </p>

      <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
        {modo === 'naoSalva' && aoTentarDeNovo && (
          <button type="button" className="btn btn-solid peq" onClick={aoTentarDeNovo} disabled={salvando}>
            <RotateCw aria-hidden /> {salvando ? t('Salvando…') : t('Tentar de novo')}
          </button>
        )}
        {podeCriarConta && (
          <button type="button" className="btn btn-solid peq" onClick={aoCriarConta}>
            <UserPlus aria-hidden /> {t('Criar conta (grátis)')}
          </button>
        )}
        {pediuTeto && gravacoes.length > 0 && (
          <button
            type="button"
            className="btn btn-outline peq"
            aria-expanded={listaAberta}
            onClick={() => setListaAberta((v) => !v)}
          >
            <HardDrive aria-hidden /> {t('Apagar uma gravação antiga')}
          </button>
        )}
        {modo === 'naoSalva' && aoBaixar && (
          <button type="button" className="btn btn-outline peq" onClick={aoBaixar}>
            <Download aria-hidden /> {t('Baixar esta sessão')}
          </button>
        )}
        {modo === 'naoSalva' &&
          aoDescartar &&
          (descartando ? (
            <>
              <button type="button" className="btn btn-solid perigo-solid peq" onClick={aoDescartar}>
                <Trash2 aria-hidden /> {t('Descartar de vez')}
              </button>
              <button type="button" className="btn btn-outline peq" onClick={() => setDescartando(false)}>
                {t('Voltar')}
              </button>
            </>
          ) : (
            <button type="button" className="link perigo" onClick={() => setDescartando(true)}>
              {t('Descartar')}
            </button>
          ))}
      </div>

      {listaAberta && pediuTeto && (
        <ul className="pilha" style={{ gap: 6 }} aria-label={t('Gravações guardadas neste navegador')}>
          {gravacoes.map((g) => (
            <li key={g.id} className="linha" style={{ gap: 8, justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {g.title} <span className="mut">· {g.date}</span>
              </span>
              {confirmarApagar === g.id ? (
                <button
                  type="button"
                  className="btn btn-solid perigo-solid peq"
                  disabled={apagando === g.id}
                  onClick={() => void apagar(g.id)}
                >
                  <Trash2 aria-hidden /> {t('Apagar de vez')}
                </button>
              ) : (
                <button type="button" className="link perigo" onClick={() => setConfirmarApagar(g.id)}>
                  {t('Apagar')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
