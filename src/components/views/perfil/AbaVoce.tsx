import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { usePerfil, salvarPerfil, iniciaisDe } from '../../../lib/usePerfil';
import { INTERESSES, MAX_INTERESSES } from '@core';
import AccountSecuritySection from '../../auth/AccountSecuritySection';
import { authRequired } from '../../../lib/supabase';

/**
 * QUEM É VOCÊ — a metade da tela de perfil que o app nunca teve.
 *
 * A aplicação inteira era anônima: nenhuma tela mostrava nome ou e-mail, e o banco só guardava id,
 * e-mail, papel e status. Nome, bio, objetivo e interesses passaram a existir na migração 0008.
 *
 * OS DADOS DE IDENTIDADE FICAM ACIMA DA SEGURANÇA, e isso é o conserto de um defeito concreto:
 * `AccountSecuritySection` devolve `null` quando não há login configurado, então em modo local a
 * aba "Conta e recomeço" de Ajustes ficava LITERALMENTE vazia — foi por isso que o botão de sair
 * nunca foi encontrado. Aqui, sem login, a aba continua útil: identidade e interesses funcionam
 * igual, porque `usersRepo.ensure(LOCAL_OWNER)` provisiona a linha do dono local.
 *
 * NADA SALVA SOZINHO. Os campos de texto têm botão explícito: gravação automática por digitação
 * mandaria um PATCH por tecla, e o servidor apara e sanea — o valor voltaria diferente no meio da
 * frase. Os interesses, sim, salvam ao clicar: são um toggle, e a intenção é inequívoca.
 */

type Estado = 'parado' | 'salvando' | 'salvo' | 'erro';

export default function AbaVoce() {
  const { perfil, carregando } = usePerfil();

  const [nome, setNome] = useState('');
  const [bio, setBio] = useState('');
  const [goal, setGoal] = useState('');
  const [estado, setEstado] = useState<Estado>('parado');

  /* O formulário parte do servidor quando o perfil chega — mas só uma vez por carga. Sincronizar a
     cada render sobrescreveria o que está sendo digitado. */
  useEffect(() => {
    if (!perfil) return;
    setNome(perfil.displayName ?? '');
    setBio(perfil.bio ?? '');
    setGoal(perfil.goal ?? '');
    /* Depende SÓ do id, e não do objeto inteiro: `perfil` muda de identidade a cada gravação
       (o servidor devolve uma linha nova), e reagir a isso apagaria o que está sendo digitado no
       meio de uma edição. O que importa aqui é "trocou de usuário", não "o perfil mudou". */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.id]);

  const marcados = perfil?.interests ?? [];
  const sujo = !!perfil && (
    nome !== (perfil.displayName ?? '') || bio !== (perfil.bio ?? '') || goal !== (perfil.goal ?? '')
  );

  async function salvar() {
    setEstado('salvando');
    const ok = await salvarPerfil({ displayName: nome, bio, goal });
    setEstado(ok ? 'salvo' : 'erro');
    if (ok) setTimeout(() => setEstado('parado'), 2000);
  }

  async function alternarInteresse(slug: string) {
    const jaTem = marcados.includes(slug);
    if (!jaTem && marcados.length >= MAX_INTERESSES) return;
    const proximos = jaTem ? marcados.filter(s => s !== slug) : [...marcados, slug];
    // O servidor devolve a lista saneada; `salvarPerfil` a publica para todas as telas inscritas.
    await salvarPerfil({ interests: proximos });
  }

  if (carregando) {
    return (
      <div className="card-panel bg-surface p-8 flex items-center justify-center gap-2 text-ink-muted text-[13px]">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Carregando o seu perfil…
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── IDENTIDADE ──────────────────────────────────────────────────────────────────────── */}
      <section>
        <div className="card-panel bg-surface p-5 flex flex-col sm:flex-row gap-5">
          <div
            className="w-20 h-20 rounded-full bg-accent-soft text-accent-ink font-display font-black text-2xl flex items-center justify-center shrink-0 mx-auto sm:mx-0"
            aria-hidden
          >
            {/* As iniciais SÃO o avatar. Upload exigiria Supabase Storage, que o projeto não usa em
                lugar nenhum, e não há quota de armazenamento por usuário. */}
            {iniciaisDe(nome || perfil?.displayName, perfil?.email) || '-'}
          </div>

          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <label htmlFor="perfil-nome" className="block font-bold text-[13px] text-ink mb-1">Como você quer ser chamado</label>
              <input
                id="perfil-nome"
                value={nome}
                onChange={e => setNome(e.target.value)}
                maxLength={60}
                placeholder="Seu nome"
                className="field-input"
              />
            </div>

            <div>
              <label htmlFor="perfil-goal" className="block font-bold text-[13px] text-ink mb-1">O que você quer alcançar</label>
              <input
                id="perfil-goal"
                value={goal}
                onChange={e => setGoal(e.target.value)}
                maxLength={120}
                placeholder="Ex.: conseguir acompanhar reuniões em inglês"
                className="field-input"
              />
            </div>

            <div>
              <label htmlFor="perfil-bio" className="block font-bold text-[13px] text-ink mb-1">Sobre você</label>
              <textarea
                id="perfil-bio"
                value={bio}
                onChange={e => setBio(e.target.value)}
                maxLength={280}
                rows={3}
                className="field-input resize-none"
              />
              <p className="text-[11px] text-ink-faint mt-1 tabular-nums">{bio.length}/280</p>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => void salvar()} disabled={!sujo || estado === 'salvando'} className="btn-solid disabled:opacity-50">
                {estado === 'salvando' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
                Salvar
              </button>
              {/* O aviso é sobre o que o SERVIDOR fez, não sobre o que a tela tentou. */}
              {estado === 'salvo' && <span className="text-[12.5px] text-good-ink flex items-center gap-1.5"><Check className="w-4 h-4" aria-hidden /> Salvo</span>}
              {estado === 'erro' && <span className="text-[12.5px] text-error-ink">Não consegui salvar. Verifique a conexão e tente de novo.</span>}
            </div>
          </div>
        </div>
      </section>

      {/* ── INTERESSES ──────────────────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="font-display font-bold text-lg text-ink mb-1">Do que você gosta</h2>
        <p className="text-[12.5px] text-ink-muted mb-4 max-w-[64ch]">
          Isto guia o que vale a pena importar e que exemplos aparecem nos jogos. Escolha até{' '}
          <b>{MAX_INTERESSES}</b>, marcar tudo não diz nada sobre você.
        </p>

        <div className="card-panel bg-surface p-5 space-y-4">
          {(['cultura', 'trabalho', 'vida', 'estudo'] as const).map(grupo => (
            <div key={grupo}>
              <p className="label-mono mb-2">{grupo}</p>
              <div className="flex flex-wrap gap-1.5">
                {INTERESSES.filter(i => i.grupo === grupo).map(i => {
                  const ativo = marcados.includes(i.slug);
                  const noTeto = !ativo && marcados.length >= MAX_INTERESSES;
                  return (
                    <button
                      key={i.slug}
                      onClick={() => void alternarInteresse(i.slug)}
                      disabled={noTeto}
                      aria-pressed={ativo}
                      /* Desabilitado COM MOTIVO: um chip que não responde ao clique, sem explicar,
                         ensina que a tela está quebrada. */
                      title={noTeto ? `Você já escolheu ${MAX_INTERESSES}. Desmarque um para trocar.` : undefined}
                      className={`kpi-pill ${ativo ? 'active' : ''} ${noTeto ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {i.rotulo}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[11.5px] text-ink-faint pt-1">
            {marcados.length} de {MAX_INTERESSES} escolhidos · salvo assim que você marca
          </p>
        </div>
      </section>

      {/* ── CONTA E SEGURANÇA ───────────────────────────────────────────────────────────────
          Fica por ÚLTIMO e devolve `null` sem login, por isso os campos de identidade vêm acima.
          Era o inverso disso que deixava a aba de conta vazia no modo local. */}
      {authRequired
        ? <AccountSecuritySection />
        : (
          <section>
            <h2 className="font-display font-bold text-lg text-ink mb-1">Conta</h2>
            <div className="card-panel bg-surface p-5">
              <p className="text-[13px] text-ink-muted max-w-[64ch]">
                Este app está rodando no seu computador, sem login. Não há senha nem sessão para
                gerenciar, os seus dados ficam neste dispositivo.
              </p>
            </div>
          </section>
        )}
    </div>
  );
}
