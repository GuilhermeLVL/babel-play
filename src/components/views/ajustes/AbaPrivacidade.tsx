import { Check, Download, FileText, Loader2, Mail } from 'lucide-react';
import { useState } from 'react';

import { CRIADOR } from '../../../lib/criador';
import { t } from '../../../lib/i18n';
import { type Consentimento, mudarConsentimento, salvarPreferencias, usePreferencias } from '../../../lib/preferencias';
import { toast } from '../../Toast';
import { baixarArquivo, prepararCopia } from '../perfil/AbaDados';
import DialogoLegal from '../sobre/DialogoLegal';

/**
 * AJUSTES → PRIVACIDADE (override de `T.ajustes`, 4029-4041): o que você autoriza, baixar os seus
 * dados e onde eles ficam.
 *
 * Os consentimentos são guardados com o registro de cada mudança (data e valor), como a nota da
 * tela promete. A cópia dos dados é a exportação REAL (`GET /api/me/exportar`, LGPD art. 18, V), em
 * JSON ou em CSV; ela é gerada na hora, então "preparando" dura o tempo da requisição.
 */

const CONSENTIMENTOS: Array<[Consentimento, string, string, string]> = [
  [
    'nuvem',
    t('Usar IA de nuvem'),
    t(
      'Tradução, transcrição e tutor por servidores de IA (Groq, OpenRouter) e o tradutor público MyMemory. Desligado, tudo roda no seu aparelho.',
    ),
    t('Usar IA de nuvem'),
  ],
  [
    /* O "Rápido" do microfone: consentimento PRÓPRIO (o destinatário é o fornecedor do navegador, não
       os nossos servidores de IA). Desligar vale como "Privado" (`consentimentoDeNuvem.ts`). */
    'reconhecimentoDoNavegador',
    t('Reconhecimento de voz do navegador'),
    t(
      'O modo Rápido do microfone: o navegador envia o áudio da sua voz ao Google, à Microsoft ou à Apple para transcrever. Desligado, a sua voz é transcrita no aparelho.',
    ),
    t('Reconhecimento de voz do navegador'),
  ],
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

  /* QUEST: um consentimento por linha com interruptor; a cópia dos dados com os três estados
     (escolher, preparando, pronta) no mesmo cartão. */
  return (
    <>
      <section className="q-secao">
        <header>
          <div>
            <h2>{t('O que você autoriza')}</h2>
            <p>{t('Você pode mudar a qualquer momento. Desligar não afeta o que o app faz por você.')}</p>
          </div>
        </header>
        <div className="q-ajustes">
          {CONSENTIMENTOS.map(([k, titulo, desc, rotulo]) => (
            <div key={k} className="q-ajuste">
              <div>
                <b>{titulo}</b>
                <small>{desc}</small>
              </div>
              <button
                type="button"
                className="q-interruptor"
                role="switch"
                aria-checked={p.consentimentos[k]}
                aria-label={rotulo}
                onClick={() => void autorizar(k, !p.consentimentos[k])}
              />
            </div>
          ))}
        </div>
        <p className="q-aju-nota">{t('Cada mudança fica registrada com data, para você e para nós.')}</p>
      </section>

      <section className="q-secao">
        <header>
          <div>
            <h2>{t('Baixar os seus dados')}</h2>
            <p>{t('Uma cópia de tudo o que o app guarda sobre você: sessões, palavras, progresso, preferências.')}</p>
          </div>
        </header>
        {typeof copia === 'object' ? (
          <div className="q-ajuste" data-testid="copia-pronta">
            <div>
              <b>{t('Seu arquivo está pronto')}</b>
              <small>
                {copia.nome} · {tamanho(copia.blob.size)} · {t('gerado agora')}
              </small>
            </div>
            <button
              type="button"
              className="q-ctl pri"
              onClick={() => {
                baixarArquivo(copia.blob, copia.nome);
                toast.ok(t('Download iniciado'));
              }}
            >
              <Download aria-hidden /> {t('Baixar')}
            </button>
          </div>
        ) : copia === 'preparando' ? (
          <div className="q-aju-espera" role="status">
            <Loader2 className="gira" aria-hidden />
            <span>{t('Preparando o arquivo…')}</span>
          </div>
        ) : (
          <div className="q-ajuste">
            <div>
              <b>{t('Formato do arquivo')}</b>
              <small>{t('JSON guarda tudo; CSV abre em planilha.')}</small>
            </div>
            <div className="q-abas q-seg" role="group" aria-label={t('Formato')}>
              {(['json', 'csv'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="q-aba"
                  aria-pressed={p.formatoDaCopia === f}
                  onClick={() => void salvarPreferencias((x) => ({ ...x, formatoDaCopia: f }))}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <button type="button" className="q-ctl" onClick={() => void pedirCopia()}>
              <Download aria-hidden /> {t('Pedir uma cópia')}
            </button>
          </div>
        )}
      </section>

      <section className="q-secao">
        <header>
          <div>
            <h2>{t('Onde ficam')}</h2>
            <p>{t('No self-host, tudo fica neste computador. Na nuvem, em servidores no Brasil, cifrado.')}</p>
          </div>
        </header>
        <div className="q-cartao">
          <ul className="q-aju-lista">
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
          <div className="q-acoes">
            <button type="button" className="q-ctl" onClick={() => setLegal(true)}>
              <FileText aria-hidden /> {t('Política de privacidade')}
            </button>
            <a
              className="q-ctl"
              href={`mailto:${CRIADOR.contatoDePrivacidade}?subject=${encodeURIComponent('Encarregado de dados · Babel Play')}`}
            >
              <Mail aria-hidden /> {t('Falar com o encarregado de dados')}
            </a>
          </div>
        </div>
      </section>

      {legal && <DialogoLegal doc="privacidade" aoFechar={() => setLegal(false)} />}
    </>
  );
}
