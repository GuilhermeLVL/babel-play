import '../../styles/questConta.css';

import { CircleAlert, CloudOff, MailCheck, Send } from 'lucide-react';
import { useState } from 'react';

import { carregarProtecao, convidarResponsavel, ehFalha } from '../../data/rotas/idade';
import { t } from '../../lib/i18n';
import type { EstadoDeProtecao } from '../../lib/protecaoDoMenor';
import { T } from '../../lib/T';

/**
 * CONTA DE MENOR ESPERANDO O RESPONSÁVEL (Fase 4 — ECA Digital art. 24, LGPD art. 14).
 *
 * Aparece no topo do app enquanto a conta está RESTRITA: menor de 16 sem vínculo aceito (ou de 12
 * sem o consentimento específico). NÃO BLOQUEIA: o app inteiro funciona no aparelho, como no modo
 * sem conta (o funil desvia os dados para o servidor local). O que falta é a nuvem, e o cartão diz
 * isso e oferece o convite.
 *
 * O convite vai por e-mail (Resend) quando o servidor tem envio configurado; sem ele (dev,
 * self-host), a resposta diz `enviado: false` e, em desenvolvimento, traz o link para testar
 * (`linkDeTeste`).
 */
export default function AvisoDoResponsavel({ estado }: { estado: EstadoDeProtecao }) {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ enviado: boolean; para: string; link?: string } | null>(null);

  const convidado = estado.vinculo.estado === 'convidado';
  const menor12 = estado.exigeConsentimentoEspecifico;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErro('Confira o e-mail do seu responsável.');
      return;
    }
    setErro('');
    setOcupado(true);
    const r = await convidarResponsavel(email.trim());
    setOcupado(false);
    if (ehFalha(r)) {
      /* As duas recusas que a pessoa resolve esperando têm texto próprio: o e-mail que não saiu
         (o provedor falhou; o convite anterior continua valendo) e o teto diário de convites. */
      if (r.code === 'convite_nao_enviado')
        setErro(t('Não conseguimos enviar o convite agora. Tente de novo em alguns minutos.'));
      else if (r.code === 'limite_de_convites')
        setErro(t('Você já enviou muitos convites hoje. Tente de novo amanhã.'));
      else setErro(`Não consegui criar o convite agora (${r.error}).`);
      return;
    }
    setResultado({ enviado: r.enviado, para: r.emailMascarado, link: r.linkDeTeste });
    void carregarProtecao();
  };

  /* QUEST: o mesmo aviso (não bloqueia), o mesmo convite por e-mail e os mesmos resultados, acima do
     palco. O campo tem 60 px e o teclado do sistema sobe no foco. */
  return (
    <section className="q-cartao qc-topo" data-testid="aviso-do-responsavel">
      <span className="q-ic" aria-hidden>
        <CloudOff />
      </span>
      <div className="qc-topo-corpo">
        <h2>
          {menor12 ? t('Falta a autorização do seu responsável') : t('Falta vincular a conta ao seu responsável')}
        </h2>
        <p>
          <T txt="Até lá, tudo funciona <b>só neste aparelho</b>: as sessões e palavras ficam aqui e não vão para a nuvem." />{' '}
          {menor12
            ? t('Para crianças com menos de 12 anos, a lei pede que um dos pais ou responsável autorize.')
            : t('Para quem tem menos de 16 anos, a conta precisa estar ligada à de um responsável.')}
        </p>

        {resultado ? (
          <p className="qc-ok" role="status">
            <MailCheck aria-hidden />
            <span>
              {resultado.enviado
                ? t('Convite enviado para {para}. Ele vale por 7 dias.', { para: resultado.para })
                : t('Convite criado para {para}, mas o envio de e-mail ainda não está disponível neste servidor.', {
                    para: resultado.para,
                  })}
              {resultado.link && (
                <>
                  {' '}
                  {t('Link para testes:')}{' '}
                  <a href={resultado.link} style={{ textDecoration: 'underline', fontWeight: 800 }}>
                    {t('abrir o convite')}
                  </a>
                </>
              )}
            </span>
          </p>
        ) : (
          <form className="qc-convidar" onSubmit={(e) => void enviar(e)}>
            <div className="q-campo">
              <label htmlFor="email-responsavel">{t('E-mail do seu responsável')}</label>
              <input
                id="email-responsavel"
                type="email"
                autoComplete="off"
                placeholder={t('responsavel@exemplo.com')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="q-ctl pri" disabled={ocupado}>
              <Send aria-hidden /> {ocupado ? t('Enviando…') : convidado ? t('Enviar de novo') : t('Enviar convite')}
            </button>
          </form>
        )}
        {convidado && !resultado && (
          <p className="qc-nota">
            {t('Já existe um convite para {email}. Enviar de novo cancela o anterior.', {
              email: estado.vinculo.emailMascarado ?? '',
            })}
          </p>
        )}
        {erro && (
          <p className="qc-erro" role="alert">
            <CircleAlert aria-hidden />
            <span>{erro}</span>
          </p>
        )}
      </div>
    </section>
  );
}
