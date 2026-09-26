import type { LucideIcon } from 'lucide-react';
import {
  AtSign,
  Check,
  History,
  Info,
  KeyRound,
  Laptop,
  LogIn,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import * as auth from '../../../lib/auth';
import { edicaoEstatica } from '../../../lib/edicaoEstatica';
import { t } from '../../../lib/i18n';
import { authRequired, carregarSupabase } from '../../../lib/supabase';
import { toast } from '../../Toast';
import { IconeEmBloco, TituloDeSecao } from '../../ui';
import DialogosDaConta, { type DialogoDaConta } from './DialogosDaConta';
import { Linha } from './Linha';

/**
 * AJUSTES → CONTA (override de `T.ajustes`, 4042-4055): entrada, aparelhos conectados, atividade
 * recente, recomeçar e a zona de perigo.
 *
 * O QUE É REAL E O QUE NÃO EXISTE. Com login (Supabase), e-mail, senha, 2FA, "sair" e "sair dos
 * outros" são as operações de verdade do provedor. O que o provedor NÃO entrega ao navegador fica
 * no estado honesto, sem dado inventado: a lista de aparelhos mostra só ESTE aparelho (o Supabase
 * não lista as sessões dos outros para o cliente, mas sabe encerrá-las — daí "Sair dos outros"
 * funcionar), e a atividade recente mostra as datas que a conta tem (última entrada, criação).
 * Os códigos de recuperação do 2FA não existem no Supabase: com o 2FA ativo, o que aparece é
 * "Desativar". Sem login (self-host), a tela diz que não há conta a gerenciar.
 */

interface EstadoDaConta {
  email: string;
  verificado: boolean;
  ultimaEntrada: string | null;
  criadaEm: string | null;
  fator: auth.TotpFactor | null;
}

const quando = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === hoje.toDateString()
    ? `hoje, ${hh}`
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/** "Chrome no Windows" a partir do user agent — é tudo o que o navegador sabe de si mesmo. */
export function descreverAparelho(ua: string): { nome: string; det: string; icone: LucideIcon } {
  const navegador = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navegador';
  const sistema = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iOS/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'sistema desconhecido';
  const movel = /Android|iPhone|iPad|Mobile/.test(ua);
  return {
    nome: t('Este aparelho'),
    det: `${navegador} no ${sistema}`,
    icone: movel ? Smartphone : /Mac|Linux/.test(sistema) ? Laptop : Monitor,
  };
}

export default function AbaConta({
  onReplayTour,
  aoIrParaPrivacidade,
}: {
  onReplayTour: () => void;
  aoIrParaPrivacidade: () => void;
}) {
  const [conta, setConta] = useState<EstadoDaConta | null>(null);
  const [dialogo, setDialogo] = useState<DialogoDaConta | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const aparelho = descreverAparelho(typeof navigator === 'undefined' ? '' : navigator.userAgent);

  const reler = useCallback(async () => {
    if (!authRequired) return;
    const sb = await carregarSupabase();
    const { data } = (await sb?.auth.getUser()) ?? { data: { user: null } };
    const u = data.user;
    const fatores = await auth.listTotpFactors();
    setConta({
      email: u?.email ?? '',
      verificado: !!u?.email_confirmed_at,
      ultimaEntrada: u?.last_sign_in_at ?? null,
      criadaEm: u?.created_at ?? null,
      fator: fatores.find((f) => f.verified) ?? null,
    });
  }, []);

  useEffect(() => {
    void reler();
  }, [reler]);

  const desativar2fa = async () => {
    if (!conta?.fator) return;
    setOcupado(true);
    const r = await auth.unenrollTotp(conta.fator.id);
    setOcupado(false);
    if (!r.ok) toast.warn(r.message ?? 'Não deu para desativar agora.');
    else {
      toast.ok('Verificação em duas etapas desativada');
      void reler();
    }
  };

  const sairDosOutros = async () => {
    const sb = await carregarSupabase();
    const r = await sb?.auth.signOut({ scope: 'others' });
    if (!r || r.error) toast.warn('Não deu para desconectar os outros aparelhos agora.');
    else toast.ok('Os outros aparelhos saíram da conta');
  };

  const semLogin = <span className="badge neu">{t('sem login')}</span>;
  const atividade: Array<[LucideIcon, string, string]> = authRequired
    ? [
        ...(conta?.ultimaEntrada
          ? ([[LogIn, `Entrada no ${aparelho.det}`, quando(conta.ultimaEntrada)]] as Array<
              [LucideIcon, string, string]
            >)
          : []),
        ...(conta?.fator
          ? ([[ShieldCheck, 'Verificação em duas etapas ativa', t('agora')]] as Array<[LucideIcon, string, string]>)
          : []),
        ...(conta?.criadaEm
          ? ([[UserPlus, 'Conta criada', quando(conta.criadaEm)]] as Array<[LucideIcon, string, string]>)
          : []),
      ]
    : [[Info, 'Sem login neste modo: não há entradas para registrar', '']];

  return (
    <>
      <section>
        <TituloDeSecao icone={AtSign} titulo={t('Entrada')} />
        <div className="cartao">
          {authRequired ? (
            <>
              <Linha
                titulo={t('E-mail')}
                desc={conta ? `${conta.email} · ${conta.verificado ? 'verificado' : 'não verificado'}` : '…'}
              >
                <button
                  type="button"
                  className="btn btn-outline peq"
                  onClick={() => setDialogo('email')}
                  disabled={!conta}
                >
                  <Pencil aria-hidden /> {t('Trocar')}
                </button>
              </Linha>
              <Linha titulo={t('Senha')} desc="Troque quando quiser. Os outros aparelhos saem da conta.">
                <button
                  type="button"
                  className="btn btn-outline peq"
                  onClick={() => setDialogo('senha')}
                  disabled={!conta}
                >
                  <KeyRound aria-hidden /> {t('Trocar senha')}
                </button>
              </Linha>
              <Linha
                titulo={t('Verificação em duas etapas')}
                desc={
                  conta?.fator
                    ? 'Ativa: pede um código do app autenticador ao entrar.'
                    : 'Um código do app autenticador além da senha. Recomendado.'
                }
              >
                {conta?.fator ? (
                  <div className="linha" style={{ gap: 8 }}>
                    <span className="badge ok">
                      <Check aria-hidden /> {t('Ativa')}
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline peq"
                      disabled={ocupado}
                      onClick={() => void desativar2fa()}
                    >
                      {t('Desativar')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-solid peq"
                    onClick={() => setDialogo('2fa')}
                    disabled={!conta}
                  >
                    <ShieldCheck aria-hidden /> {t('Ativar')}
                  </button>
                )}
              </Linha>
            </>
          ) : (
            <>
              <Linha
                titulo={t('E-mail')}
                desc={
                  edicaoEstatica()
                    ? t(
                        'Esta é a edição de demonstração: roda no seu navegador, sem conta, e não há e-mail cadastrado.',
                      )
                    : 'Este app roda no seu computador, sem conta: não há e-mail cadastrado.'
                }
              >
                {semLogin}
              </Linha>
              <Linha titulo={t('Senha')} desc="Sem login, não há senha para trocar.">
                {semLogin}
              </Linha>
              <Linha titulo={t('Verificação em duas etapas')} desc="Só existe no modo com conta, junto da senha.">
                {semLogin}
              </Linha>
            </>
          )}
        </div>
      </section>

      <section className="secao">
        <TituloDeSecao
          icone={MonitorSmartphone}
          titulo={t('Aparelhos conectados')}
          direita={
            authRequired ? (
              <button type="button" className="btn btn-outline peq" onClick={() => void sairDosOutros()}>
                <LogOut aria-hidden /> {t('Sair dos outros')}
              </button>
            ) : undefined
          }
        />
        <div className="cartao">
          <div className="ajuste ajuste-l">
            <div className="linha" style={{ gap: 12 }}>
              <IconeEmBloco icone={aparelho.icone} />
              <div>
                <h3>
                  {aparelho.nome} <span className="badge ok">{t('Você está aqui')}</span>
                </h3>
                <p className="mut" style={{ margin: 0 }}>
                  {aparelho.det} · agora
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="secao">
        <TituloDeSecao icone={History} titulo={t('Atividade recente')} />
        <div className="cartao p5">
          <ul className="atividade">
            {atividade.map(([Icone, t, q]) => (
              <li key={t}>
                <Icone aria-hidden />
                <span>{t}</span>
                <small className="mut">{q}</small>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="secao">
        <TituloDeSecao icone={RotateCcw} titulo={t('Recomeçar')} />
        <div className="cartao">
          <Linha titulo={t('Rever a apresentação')} desc={t('Os passos do primeiro uso, de novo.')}>
            <button type="button" className="btn btn-outline peq" onClick={onReplayTour}>
              <RotateCcw aria-hidden /> {t('Rever')}
            </button>
          </Linha>
          {authRequired && (
            <Linha titulo={t('Sair da conta')} desc={t('Neste aparelho.')}>
              <button type="button" className="btn btn-outline peq" onClick={() => void auth.signOut()}>
                <LogOut aria-hidden /> {t('Sair')}
              </button>
            </Linha>
          )}
        </div>
      </section>

      {/* Edição estática: não há conta a excluir (a ação iria ao servidor, que ela não tem). */}
      {!edicaoEstatica() && (
        <section className="secao zona-perigo">
          <div>
            <b>{t('Excluir a conta')}</b>
            <p className="mut">
              Apaga sessões, palavras e progresso na hora. Não tem volta: baixe uma cópia antes se quiser guardar.
            </p>
          </div>
          <button type="button" className="btn btn-outline perigo" onClick={() => setDialogo('excluir')}>
            <Trash2 aria-hidden /> {t('Excluir a conta')}
          </button>
        </section>
      )}

      {dialogo && (
        <DialogosDaConta
          qual={dialogo}
          email={conta?.email ?? ''}
          aoFechar={() => setDialogo(null)}
          aoMudar={() => void reler()}
          aoIrParaPrivacidade={aoIrParaPrivacidade}
        />
      )}
    </>
  );
}
