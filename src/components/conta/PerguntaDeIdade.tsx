import { CakeSlice, CircleAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { declararNascimento, ehFalha } from '../../data/rotas/idade';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../lib/i18n';
import { IconeEmBloco } from '../ui';
import { usePedacoDoQuest } from './quest/usePedacoDoQuest';

const carregarIdadeDoQuest = () => import('./quest/IdadeDoQuest');

/**
 * A DATA DE NASCIMENTO — perguntada uma vez, no primeiro acesso com conta (e na próxima entrada das
 * contas que já existiam). Fase 4 do lançamento: ECA Digital (Lei 15.211/2025) e LGPD art. 14.
 *
 * POR QUE BLOQUEIA: sem a idade o app não sabe se deve ligar o perfil protegido, pedir o vínculo
 * com o responsável ou recusar uma compra. Enquanto a pessoa não responde, o servidor já trata a
 * conta como protegida — esta tela só pede a informação que falta, e diz para que ela serve.
 *
 * A DATA NÃO SE TROCA DEPOIS (o servidor recusa com 409): a tela avisa antes de confirmar.
 */
export default function PerguntaDeIdade({ aoConcluir }: { aoConcluir: () => void }) {
  const [data, setData] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const questNovo = useQuestNovo();
  /* Se o desenho do headset não chegar, vale o de sempre: esta tela bloqueia o app, e não pode
     depender de um arquivo a mais nem recarregar a página. */
  const doQuest = usePedacoDoQuest(carregarIdadeDoQuest, questNovo);
  const hoje = new Date().toISOString().slice(0, 10);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      setErro('Escolha a sua data de nascimento.');
      return;
    }
    setErro('');
    setOcupado(true);
    const r = await declararNascimento(data);
    setOcupado(false);
    if (ehFalha(r)) {
      setErro(
        r.code === 'nascimento_ja_informado'
          ? 'A sua data de nascimento já estava registrada. Para corrigir, fale com o suporte.'
          : r.code === 'nascimento_invalido'
            ? 'Essa data não parece certa. Confira o dia, o mês e o ano.'
            : `Não consegui salvar agora (${r.error}). Tente de novo.`,
      );
      if (r.code === 'nascimento_ja_informado') aoConcluir();
      return;
    }
    aoConcluir();
  };

  /* QUEST: a mesma pergunta nas medidas do headset. O arquivo desce só no Quest (esta tela mora no
     pacote inicial do app; o CSS do headset fica fora dele). */
  if (questNovo && doQuest.Componente) {
    const IdadeDoQuest = doQuest.Componente;
    return (
      <IdadeDoQuest
        data={data}
        aoMudarData={setData}
        hoje={hoje}
        erro={erro}
        ocupado={ocupado}
        aoEnviar={(e) => void enviar(e)}
      />
    );
  }
  /* Enquanto o arquivo não chega, uma espera visível (a mesma do App); se não chegar, a tela de sempre. */
  if (questNovo && !doQuest.falhou)
    return (
      <div
        className="flex h-tela w-full items-center justify-center bg-canvas text-base font-bold text-ink"
        role="status"
      >
        {t('Carregando…')}
      </div>
    );

  return (
    <div
      className="flex w-full items-center justify-center bg-canvas p-4"
      style={{ minHeight: 'calc(100dvh / var(--zoom-a, 1))' }}
    >
      <form className="cartao p6" style={{ maxWidth: 520, width: '100%' }} onSubmit={(e) => void enviar(e)}>
        <div className="linha" style={{ gap: 12, marginBottom: 12 }}>
          <IconeEmBloco icone={CakeSlice} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900 }}>Quando você nasceu?</h1>
            <p className="mut" style={{ fontSize: 13.5 }}>
              Pedimos uma vez só, para deixar o app certo para a sua idade.
            </p>
          </div>
        </div>
        <div className="form-l">
          <label htmlFor="nascimento">Data de nascimento</label>
          <input
            className="campo"
            id="nascimento"
            type="date"
            max={hoje}
            value={data}
            onChange={(e) => setData(e.target.value)}
            aria-invalid={erro ? true : undefined}
            aria-describedby="nascimento-ajuda"
            required
          />
        </div>
        <p className="aviso-info" id="nascimento-ajuda" style={{ marginTop: 12 }}>
          <ShieldCheck aria-hidden />
          <span>
            Abaixo de 18 anos, a conta fica no <b>perfil protegido</b>: sem ranking público, sem pressão por sequência
            de dias e sem compras. Abaixo de 16, um responsável precisa vincular a conta para os dados irem para a
            nuvem. Depois de confirmada, a data só muda pelo suporte.
          </span>
        </p>
        {erro && (
          <p className="erro-auth" role="alert">
            <CircleAlert aria-hidden /> {erro}
          </p>
        )}
        <div className="linha" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="submit" className="btn btn-solid" disabled={ocupado}>
            {ocupado ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      </form>
    </div>
  );
}
