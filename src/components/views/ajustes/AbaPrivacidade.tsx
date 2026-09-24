import { Check, Database, Download, FileArchive, Hand, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { CRIADOR } from '../../../lib/criador';
import { t } from '../../../lib/i18n';
import { type Consentimento, mudarConsentimento, salvarPreferencias, usePreferencias } from '../../../lib/preferencias';
import { toast } from '../../Toast';
import { IconeEmBloco, TituloDeSecao } from '../../ui';
import { baixarArquivo, prepararCopia } from '../perfil/AbaDados';
import DialogoLegal from '../sobre/DialogoLegal';
import { Interruptor, Linha } from './Linha';

/**
 * AJUSTES → PRIVACIDADE (override de `T.ajustes`, 4029-4041): o que você autoriza, baixar os seus
 * dados e onde eles ficam.
 *
 * Os três consentimentos são guardados com o registro de cada mudança (data e valor), como a nota da
 * tela promete. A cópia dos dados é a exportação REAL (`GET /api/me/exportar`, LGPD art. 18, V), em
 * JSON ou em CSV; ela é gerada na hora, então "preparando" dura o tempo da requisição.
 */

const CONSENTIMENTOS: Array<[Consentimento, string, string, string]> = [
  [
    'metricas',
    t('Métricas de uso anônimas'),
    t('Quais telas e botões são usados, sem conteúdo. Ajuda a decidir o que melhorar.'),
    t('Métricas de uso'),
  ],
  [
    'novidades',
    t('E-mails de novidades'),
    t('No máximo um por mês. Recibos e segurança não dependem disto.'),
    t('E-mails de novidades'),
  ],
  [
    'ia',
    t('Usar trechos para melhorar a IA'),
    t('Frases das suas sessões, sem nome nem e-mail, para medir a qualidade da tradução. Desligado por padrão.'),
    t('Usar trechos para melhorar a IA'),
  ],
];

const tamanho = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

export default function AbaPrivacidade() {
  const p = usePreferencias();
  const [copia, setCopia] = useState<'parado' | 'preparando' | { blob: Blob; nome: string }>('parado');
  const [legal, setLegal] = useState(false);

  const autorizar = async (k: Consentimento, on: boolean) => {
    const ok = await mudarConsentimento(k, on);
    if (!ok) toast.warn('Não consegui registrar a mudança. Verifique a conexão e tente de novo.');
    else toast.ok(on ? t('Autorização registrada') : 'Autorização retirada');
  };

  const pedirCopia = async () => {
    setCopia('preparando');
    const pronta = await prepararCopia(p.formatoDaCopia);
    if (!pronta) {
      setCopia('parado');
      toast.warn('Não consegui gerar o arquivo agora. Tente de novo em instantes.');
      return;
    }
    setCopia(pronta);
  };

  return (
    <>
      <section>
        <TituloDeSecao
          icone={Hand}
          titulo={t('O que você autoriza')}
          desc={t('Você pode mudar a qualquer momento. Desligar não afeta o que o app faz por você.')}
        />
        <div className="cartao">
          {CONSENTIMENTOS.map(([k, t, d, rot]) => (
            <Linha key={k} titulo={t} desc={d}>
              <Interruptor ligado={p.consentimentos[k]} rotulo={rot} aoTrocar={(on) => void autorizar(k, on)} />
            </Linha>
          ))}
        </div>
        <p className="mut" style={{ fontSize: 12.5, marginTop: 8 }}>
          {t('Cada mudança fica registrada com data, para você e para nós.')}
        </p>
      </section>

      <section className="secao">
        <TituloDeSecao
          icone={Download}
          titulo={t('Baixar os seus dados')}
          desc={t('Uma cópia de tudo o que o app guarda sobre você: sessões, palavras, progresso, preferências.')}
        />
        <div className="cartao p5">
          {typeof copia === 'object' ? (
            <div className="linha" style={{ gap: 12, flexWrap: 'wrap' }}>
              <IconeEmBloco icone={FileArchive} tom="good" />
              <div style={{ flex: 1, minWidth: 200 }}>
                <b>{t('Seu arquivo está pronto')}</b>
                <p className="mut" style={{ fontSize: 13 }}>
                  {copia.nome} · {tamanho(copia.blob.size)} · gerado agora
                </p>
              </div>
              <button
                type="button"
                className="btn btn-solid"
                onClick={() => {
                  baixarArquivo(copia.blob, copia.nome);
                  toast.ok('Download iniciado');
                }}
              >
                <Download aria-hidden /> {t('Baixar')}
              </button>
            </div>
          ) : copia === 'preparando' ? (
            <div className="linha" style={{ gap: 12 }} role="status">
              <Loader2 className="gira" aria-hidden />
              <span>{t('Preparando o arquivo…')}</span>
            </div>
          ) : (
            <div className="linha" style={{ gap: 10, flexWrap: 'wrap' }}>
              <div className="seg" role="radiogroup" aria-label={t('Formato')}>
                {(['json', 'csv'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={p.formatoDaCopia === f}
                    onClick={() => void salvarPreferencias((x) => ({ ...x, formatoDaCopia: f }))}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-outline" onClick={() => void pedirCopia()}>
                <Download aria-hidden /> {t('Pedir uma cópia')}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="secao">
        <TituloDeSecao
          icone={Database}
          titulo={t('Onde ficam')}
          desc={t('No self-host, tudo fica neste computador. Na nuvem, em servidores no Brasil, cifrado.')}
        />
        <div className="cartao p5">
          <ul className="lista-check">
            {[
              t('Gravações e transcrições: neste aparelho'),
              t('Palavras e progresso: neste aparelho'),
              t('Chave de IA (se usar): cifrada no servidor, nunca volta ao navegador'),
            ].map((x) => (
              <li key={x}>
                <Check aria-hidden />
                {x}
              </li>
            ))}
          </ul>
          <div className="linha" style={{ gap: 14, marginTop: 12 }}>
            <button type="button" className="link" onClick={() => setLegal(true)}>
              {t('Política de privacidade')}
            </button>
            <a
              className="link"
              href={`mailto:${CRIADOR.contatoDePrivacidade}?subject=${encodeURIComponent('Encarregado de dados · Babel Play')}`}
            >
              {t('Falar com o encarregado de dados')}
            </a>
          </div>
        </div>
      </section>

      {legal && <DialogoLegal doc="privacidade" aoFechar={() => setLegal(false)} />}
    </>
  );
}
