import { CakeSlice, CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react';
import type { FormEvent } from 'react';

import { t } from '../../../lib/i18n';
import { T } from '../../../lib/T';
import CascaDeEntradaDoQuest from '../../auth/quest/CascaDeEntradaDoQuest';

/**
 * A PERGUNTA DE IDADE NO META QUEST: a mesma data, o mesmo aviso do perfil protegido e o mesmo erro de
 * `PerguntaDeIdade`, num cartão ao centro com o campo de 60 px (o teclado do sistema sobe no foco).
 *
 * Só apresentação: a data, o envio e as recusas do servidor continuam em `PerguntaDeIdade`, que carrega
 * este arquivo sob demanda (ela mora no pacote inicial; o CSS do headset, não).
 */
export default function IdadeDoQuest({
  data,
  aoMudarData,
  hoje,
  erro,
  ocupado,
  aoEnviar,
}: {
  data: string;
  aoMudarData: (data: string) => void;
  /** `AAAA-MM-DD` de hoje: a data não pode ser futura. */
  hoje: string;
  erro: string;
  ocupado: boolean;
  aoEnviar: (e: FormEvent) => void;
}) {
  return (
    <CascaDeEntradaDoQuest semMarca testId="idade-do-quest">
      <header className="qen-cab">
        <span className="qen-ic" aria-hidden>
          <CakeSlice />
        </span>
        <div>
          <h1>{t('Quando você nasceu?')}</h1>
          <p>{t('Pedimos uma vez só, para deixar o app certo para a sua idade.')}</p>
        </div>
      </header>

      <form className="qen-form" onSubmit={aoEnviar}>
        <div className="qen-campo">
          <label htmlFor="nascimento">{t('Data de nascimento')}</label>
          <input
            id="nascimento"
            type="date"
            max={hoje}
            value={data}
            onChange={(e) => aoMudarData(e.target.value)}
            aria-invalid={erro ? true : undefined}
            aria-describedby="nascimento-ajuda"
            required
          />
        </div>

        <p className="qen-aviso" id="nascimento-ajuda">
          <ShieldCheck aria-hidden />
          <span>
            <T txt="Abaixo de 18 anos, a conta fica no <b>perfil protegido</b>: sem ranking público, sem pressão por sequência de dias e sem compras. Abaixo de 16, um responsável precisa vincular a conta para os dados irem para a nuvem. Depois de confirmada, a data só muda pelo suporte." />
          </span>
        </p>

        {erro && (
          <p className="qen-erro" role="alert">
            <CircleAlert aria-hidden />
            <span>{erro}</span>
          </p>
        )}

        <button type="submit" className="qen-botao pri" disabled={ocupado}>
          {ocupado && <LoaderCircle className="qen-gira" aria-hidden />}
          {ocupado ? t('Salvando…') : t('Confirmar')}
        </button>
      </form>
    </CascaDeEntradaDoQuest>
  );
}
