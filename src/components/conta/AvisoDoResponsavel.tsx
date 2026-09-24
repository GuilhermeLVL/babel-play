import { CircleAlert, CloudOff, MailCheck, Send } from 'lucide-react';
import { useState } from 'react';

import { carregarProtecao, convidarResponsavel, ehFalha } from '../../data/rotas/idade';
import type { EstadoDeProtecao } from '../../lib/protecaoDoMenor';
import { IconeEmBloco } from '../ui';

/**
 * CONTA DE MENOR ESPERANDO O RESPONSÁVEL (Fase 4 — ECA Digital art. 24, LGPD art. 14).
 *
 * Aparece no topo do app enquanto a conta está RESTRITA: menor de 16 sem vínculo aceito (ou de 12
 * sem o consentimento específico). NÃO BLOQUEIA: o app inteiro funciona no aparelho, como no modo
 * sem conta (o funil desvia os dados para o servidor local). O que falta é a nuvem, e o cartão diz
 * isso e oferece o convite.
 *
 * O convite vai por e-mail QUANDO o servidor tiver envio configurado; enquanto não tiver, a resposta
 * diz `enviado: false` e, em desenvolvimento, traz o link para testar (`linkDeTeste`).
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
      setErro(`Não consegui criar o convite agora (${r.error}).`);
      return;
    }
    setResultado({ enviado: r.enviado, para: r.emailMascarado, link: r.linkDeTeste });
    void carregarProtecao();
  };

  return (
    <section className="cartao p5" style={{ margin: '12px 16px 0' }} data-testid="aviso-do-responsavel">
      <div className="linha" style={{ gap: 12, alignItems: 'flex-start' }}>
        <IconeEmBloco icone={CloudOff} tom="warn" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 16, fontWeight: 900 }}>
            {menor12 ? 'Falta a autorização do seu responsável' : 'Falta vincular a conta ao seu responsável'}
          </h2>
          <p className="mut" style={{ fontSize: 13.5, marginTop: 4, maxWidth: '72ch' }}>
            Até lá, tudo funciona <b>só neste aparelho</b>: as sessões e palavras ficam aqui e não vão para a nuvem.
            {menor12
              ? ' Para crianças com menos de 12 anos, a lei pede que um dos pais ou responsável autorize.'
              : ' Para quem tem menos de 16 anos, a conta precisa estar ligada à de um responsável.'}
          </p>

          {resultado ? (
            <p className="aviso-info" style={{ marginTop: 10 }}>
              <MailCheck aria-hidden />
              <span>
                {resultado.enviado
                  ? `Convite enviado para ${resultado.para}. Ele vale por 7 dias.`
                  : `Convite criado para ${resultado.para}, mas o envio de e-mail ainda não está disponível neste servidor.`}
                {resultado.link && (
                  <>
                    {' '}
                    Link para testes:{' '}
                    <a className="link" href={resultado.link}>
                      abrir o convite
                    </a>
                  </>
                )}
              </span>
            </p>
          ) : (
            <form
              className="linha"
              style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}
              onSubmit={(e) => void enviar(e)}
            >
              <div className="form-l" style={{ flex: '1 1 240px', margin: 0 }}>
                <label htmlFor="email-responsavel">E-mail do seu responsável</label>
                <input
                  className="campo"
                  id="email-responsavel"
                  type="email"
                  autoComplete="off"
                  placeholder="responsavel@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-solid" disabled={ocupado} style={{ alignSelf: 'flex-end' }}>
                <Send aria-hidden /> {ocupado ? 'Enviando…' : convidado ? 'Enviar de novo' : 'Enviar convite'}
              </button>
            </form>
          )}
          {convidado && !resultado && (
            <p className="mut" style={{ fontSize: 12.5, marginTop: 6 }}>
              Já existe um convite para {estado.vinculo.emailMascarado}. Enviar de novo cancela o anterior.
            </p>
          )}
          {erro && (
            <p className="erro-auth" role="alert">
              <CircleAlert aria-hidden /> {erro}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
