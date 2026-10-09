import { ArrowRight, CircleAlert, CreditCard, HeartHandshake, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { aceitarConvite, type ConviteParaAceitar, ehFalha, verConvite } from '../../data/rotas/idade';
import { definirBeneficiario } from '../../lib/assinatura';
import { esquecerTokenDoConvite } from '../../lib/conviteNaUrl';
import { t } from '../../lib/i18n';
import { navegarPara } from '../../lib/rotas';
import { T } from '../../lib/T';
import CascaDeEntradaDoQuest from '../auth/quest/CascaDeEntradaDoQuest';

/**
 * O RESPONSÁVEL ACEITA O CONVITE (Fase 4 — ECA Digital art. 24, LGPD art. 14 §1º).
 *
 * Chega aqui quem abriu o link `/responsavel?token=…` e entrou na PRÓPRIA conta (o App guarda o token
 * durante o login — `lib/conviteNaUrl.ts`). A tela mostra de quem é o pedido e o TEXTO que será
 * aceito; abaixo de 12 anos, o consentimento específico é uma caixa separada e obrigatória. O
 * servidor grava quem, quando e o texto — e confere de novo tudo o que esta tela confere.
 *
 * Depois do aceite, o responsável pode assinar PELO menor: o botão guarda a escolha
 * (`definirBeneficiario`) e abre o checkout, que manda `paraUsuario`.
 */
const MENSAGENS: Record<string, string> = {
  convite_invalido: 'Este convite não existe mais — talvez tenha sido substituído por um mais novo.',
  convite_usado: 'Este convite já foi usado.',
  convite_expirado: 'Este convite expirou. Peça um novo a quem convidou você.',
  mesma_conta: 'Você entrou com a conta de quem convidou. Saia e entre com a SUA conta de responsável.',
  idade_nao_informada: 'Informe a sua data de nascimento antes de aceitar.',
  responsavel_nao_adulto: 'Só um adulto (18 anos ou mais) pode ser o responsável.',
  consentimento_obrigatorio: 'Para menores de 12 anos, marque a autorização específica.',
  versao_desatualizada: 'O texto mudou enquanto a página estava aberta. Recarregue e leia de novo.',
};

export default function AceiteDoResponsavel({ token, aoSair }: { token: string; aoSair: () => void }) {
  const [convite, setConvite] = useState<ConviteParaAceitar | null>(null);
  const [erro, setErro] = useState('');
  const [nome, setNome] = useState('');
  const [declaro, setDeclaro] = useState(false);
  const [consinto, setConsinto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aceito, setAceito] = useState<{ nome: string | null; id: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    void verConvite(token).then((r) => {
      if (!vivo) return;
      if (!ehFalha(r)) setConvite(r);
      else setErro(MENSAGENS[r.code ?? ''] ?? `Não consegui abrir o convite (${r.error}).`);
    });
    return () => {
      vivo = false;
    };
  }, [token]);

  const sair = () => {
    esquecerTokenDoConvite();
    aoSair();
  };

  const aceitar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convite) return;
    if (nome.trim().length < 2 || !declaro || (convite.exigeConsentimentoEspecifico && !consinto)) {
      setErro('Preencha o seu nome e marque as confirmações.');
      return;
    }
    setErro('');
    setOcupado(true);
    const r = await aceitarConvite({
      token,
      nomeDoResponsavel: nome.trim(),
      ...(convite.exigeConsentimentoEspecifico ? { consentimentoEspecifico: true } : {}),
      versaoDoConsentimento: convite.versao,
    });
    setOcupado(false);
    if (ehFalha(r)) {
      setErro(MENSAGENS[r.code ?? ''] ?? `Não consegui registrar agora (${r.error}).`);
      return;
    }
    esquecerTokenDoConvite();
    setAceito({ nome: r.nomeDoMenor, id: r.menorId });
  };

  const assinarPorEle = () => {
    if (!aceito) return;
    definirBeneficiario({ id: aceito.id, nome: aceito.nome });
    aoSair();
    navegarPara({ view: 'planos', planosTela: 'assinar' });
  };

  const quem = convite?.nomeDoMenor ?? aceito?.nome ?? 'a pessoa que convidou você';

  /* QUEST: o mesmo pedido, o mesmo texto de consentimento e as mesmas confirmações, num cartão ao
     centro. O texto aparece INTEIRO, como na tela de sempre (LGPD, art. 14: ninguém marca a
     confirmação sem ter o texto todo à frente); quem rola é a tela, e as confirmações vêm depois dele,
     cada uma numa linha de 60 px. */
  return (
    <CascaDeEntradaDoQuest semMarca testId="aceite-do-quest">
      <header className="qen-cab">
        <span className="qen-ic" aria-hidden>
          <HeartHandshake />
        </span>
        <div>
          <h1>{aceito ? t('Conta vinculada') : t('Pedido de vínculo de responsável')}</h1>
          <p>
            {aceito
              ? t('A conta de {quem} agora está ligada à sua.', { quem })
              : t('{quem} pediu para você ser o responsável pela conta no Babel Play.', { quem })}
          </p>
        </div>
        <button type="button" className="qen-fechar" aria-label={t('Fechar')} onClick={sair}>
          <X aria-hidden />
        </button>
      </header>

      {aceito ? (
        <>
          <p className="qen-aviso">
            <ShieldCheck aria-hidden />
            <span>
              {t(
                'A conta segue no perfil protegido e os dados de estudo passam a sincronizar pela nuvem. Compras e assinaturas para ela só podem ser feitas por você.',
              )}
            </span>
          </p>
          <div className="qen-acoes">
            <button type="button" className="qen-botao" onClick={sair}>
              {t('Voltar ao app')}
            </button>
            <button type="button" className="qen-botao pri" onClick={assinarPorEle}>
              <CreditCard aria-hidden /> {t('Assinar um plano para {nome}', { nome: aceito.nome ?? t('essa conta') })}
            </button>
          </div>
        </>
      ) : convite ? (
        <form className="qen-form" onSubmit={(e) => void aceitar(e)}>
          <div className="qen-campo">
            <span className="qen-sobre" style={{ margin: 0 }}>
              {t('O que você está aceitando')}
            </span>
            <p className="qen-texto" data-testid="texto-do-consentimento">
              {convite.textoDoConsentimento}
            </p>
          </div>
          <div className="qen-campo">
            <label htmlFor="nome-responsavel">{t('Seu nome completo')}</label>
            <input id="nome-responsavel" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <label className="qen-check">
            <input type="checkbox" checked={declaro} onChange={(e) => setDeclaro(e.target.checked)} />
            <span>
              {t('Declaro que sou pai, mãe ou responsável legal por {quem} e que tenho 18 anos ou mais.', { quem })}
            </span>
          </label>
          {convite.exigeConsentimentoEspecifico && (
            <label className="qen-check forte">
              <input type="checkbox" checked={consinto} onChange={(e) => setConsinto(e.target.checked)} />
              <span>
                <T
                  txt="<b>Autorizo, de forma específica,</b> o tratamento dos dados de {quem}, que tem menos de 12 anos, nos termos do texto acima (LGPD, art. 14, § 1º)."
                  val={{ quem }}
                />
              </span>
            </label>
          )}
          {erro && (
            <p className="qen-erro" role="alert">
              <CircleAlert aria-hidden />
              <span>{erro}</span>
            </p>
          )}
          <div className="qen-acoes">
            <button type="button" className="qen-botao" onClick={sair}>
              {t('Agora não')}
            </button>
            <button type="submit" className="qen-botao pri" disabled={ocupado}>
              {ocupado ? t('Registrando…') : t('Aceitar e vincular')} <ArrowRight aria-hidden />
            </button>
          </div>
        </form>
      ) : erro ? (
        <>
          <p className="qen-erro" role="alert">
            <CircleAlert aria-hidden />
            <span>{erro}</span>
          </p>
          <div className="qen-acoes">
            <button type="button" className="qen-botao pri" onClick={sair}>
              {t('Voltar ao app')}
            </button>
          </div>
        </>
      ) : (
        <div className="qen-espera" role="status">
          <LoaderCircle aria-hidden />
          {t('Carregando o convite…')}
        </div>
      )}
    </CascaDeEntradaDoQuest>
  );
}
