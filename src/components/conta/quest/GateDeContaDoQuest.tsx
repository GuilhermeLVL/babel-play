import '../../../styles/questConta.css';

import { Lock, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { t } from '../../../lib/i18n';

/**
 * "ISTO PRECISA DE CONTA" NO META QUEST: o mesmo aviso de `GateDeConta`, no centro da tela, com as
 * mesmas saídas (entrar ou criar conta, continuar sem conta, fechar) em alvos de 60 px.
 *
 * Só apresentação: quando abre, o motivo, o Esc e o que cada saída faz continuam em `GateDeConta`, que
 * carrega este arquivo sob demanda (ele mora no pacote inicial; o CSS do headset, não).
 */
export default function GateDeContaDoQuest({
  motivo,
  semServidor,
  onFechar,
  onEntrar,
}: {
  motivo: string;
  /** Edição estática: não há conta a criar; o aviso informa e a única saída é fechar. */
  semServidor: boolean;
  onFechar: () => void;
  onEntrar: () => void;
}) {
  const primeiro = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    primeiro.current?.focus();
  }, []);

  return (
    <div className="qc-fundo" onClick={onFechar} data-testid="gate-de-conta-do-quest">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-conta-titulo"
        className="qc-caixa"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="qc-caixa-cab">
          <span className="q-ic" aria-hidden>
            <Lock />
          </span>
          <div>
            <h2 id="gate-conta-titulo">
              {semServidor ? t('Disponível na versão completa') : t('Isto precisa de conta')}
            </h2>
            <p>{motivo}</p>
          </div>
          <button type="button" className="qc-fechar" aria-label={t('Fechar')} onClick={onFechar}>
            <X aria-hidden />
          </button>
        </div>
        <p className="qc-nota">
          {semServidor
            ? t('Transcrever, traduzir e jogar continuam livres nesta edição, tudo no seu navegador.')
            : t(
                'Transcrever, traduzir e jogar com a sessão atual continuam livres. O que você já fez neste navegador sobe para a conta quando você entrar.',
              )}
        </p>
        <div className="qc-caixa-acoes">
          {semServidor ? (
            <button ref={primeiro} type="button" className="q-ctl pri" onClick={onFechar}>
              {t('Entendi')}
            </button>
          ) : (
            <>
              <button ref={primeiro} type="button" className="q-ctl pri" onClick={onEntrar}>
                {t('Entrar ou criar conta')}
              </button>
              <button type="button" className="q-ctl" onClick={onFechar}>
                {t('Continuar sem conta')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
