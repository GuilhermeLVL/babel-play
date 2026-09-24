import { INTERESSES, MAX_INTERESSES } from '@core';
import { Check, CircleDot, Heart, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { iniciaisDe, salvarPerfil, usePerfil } from '../../../lib/usePerfil';
import { TituloDeSecao } from '../../ui';

/**
 * QUEM É VOCÊ — nome, objetivo, bio e interesses, na marcação do protótipo aprovado
 * (`.perfil-cab`, `.form-l`, `.chips` de `.pill`, `.barra-salvar`).
 *
 * NADA SALVA SOZINHO. Os campos de texto têm botão explícito (na barra que aparece quando há
 * alteração): gravação automática por digitação mandaria um PATCH por tecla, e o servidor apara e
 * sanea — o valor voltaria diferente no meio da frase. Os interesses, sim, salvam ao clicar: são
 * um toggle, e a intenção é inequívoca.
 *
 * O QUE DO PROTÓTIPO FICOU DE FORA: foto (upload exigiria armazenamento de imagem que o projeto não
 * tem — as iniciais SÃO o avatar), meta diária em minutos e o nível autoavaliado por idioma (o
 * perfil não guarda nenhum dos dois). Senha, 2FA e sair continuam em Ajustes → Conta.
 */

type Estado = 'parado' | 'salvando' | 'salvo' | 'erro';

const GRUPOS = [
  ['cultura', 'Cultura'],
  ['trabalho', 'Trabalho'],
  ['vida', 'Vida'],
  ['estudo', 'Estudo'],
] as const;

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
  const sujo =
    !!perfil && (nome !== (perfil.displayName ?? '') || bio !== (perfil.bio ?? '') || goal !== (perfil.goal ?? ''));

  async function salvar() {
    setEstado('salvando');
    const ok = await salvarPerfil({ displayName: nome, bio, goal });
    setEstado(ok ? 'salvo' : 'erro');
    if (ok) setTimeout(() => setEstado('parado'), 2000);
  }

  /** Volta os campos ao que o SERVIDOR tem. */
  function descartar() {
    if (!perfil) return;
    setNome(perfil.displayName ?? '');
    setBio(perfil.bio ?? '');
    setGoal(perfil.goal ?? '');
    setEstado('parado');
  }

  async function alternarInteresse(slug: string) {
    const jaTem = marcados.includes(slug);
    if (!jaTem && marcados.length >= MAX_INTERESSES) return;
    const proximos = jaTem ? marcados.filter((s) => s !== slug) : [...marcados, slug];
    // O servidor devolve a lista saneada; `salvarPerfil` a publica para todas as telas inscritas.
    await salvarPerfil({ interests: proximos });
  }

  if (carregando) {
    return (
      <div className="cartao p6 linha" style={{ gap: 8, justifyContent: 'center' }}>
        <Loader2 className="animate-spin" aria-hidden style={{ width: 16, height: 16 }} />
        <span className="mut">Carregando o seu perfil…</span>
      </div>
    );
  }

  return (
    <>
      {/* ── IDENTIDADE ── */}
      <section className="cartao p6 perfil-cab">
        <div className="foto-perfil">
          {/* As iniciais SÃO o avatar: upload exigiria armazenamento de imagem, que o projeto não tem. */}
          <span className="avatar" aria-hidden style={{ width: 96, height: 96, fontSize: 34 }}>
            {iniciaisDe(nome || perfil?.displayName, perfil?.email) || '?'}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="form-l">
            <label htmlFor="perfil-nome">Como você quer ser chamado</label>
            <input
              id="perfil-nome"
              className="campo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={60}
              placeholder="Seu nome"
              autoComplete="nickname"
            />
          </div>
          <div className="form-l">
            <label htmlFor="perfil-goal">O que você quer alcançar</label>
            <input
              id="perfil-goal"
              className="campo"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={120}
              placeholder="Ex.: acompanhar reuniões em inglês"
            />
          </div>
          <div className="form-l">
            <label htmlFor="perfil-bio">
              Sobre você{' '}
              <small className="mut tn" style={{ fontWeight: 500 }}>
                ({bio.length}/280)
              </small>
            </label>
            <textarea
              id="perfil-bio"
              className="campo"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
            />
          </div>
        </div>
      </section>

      {/* ── INTERESSES ── */}
      <section className="secao">
        <TituloDeSecao
          icone={Heart}
          titulo="Do que você gosta"
          desc={`Guia o que vale importar e que exemplos aparecem nos jogos. Escolha até ${MAX_INTERESSES}.`}
        />
        <div className="cartao p5">
          {GRUPOS.map(([grupo, rotulo], gi) => (
            <div key={grupo}>
              <div className="label-mono" style={{ margin: `${gi === 0 ? 0 : 14}px 0 8px` }}>
                {rotulo}
              </div>
              <div className="chips">
                {INTERESSES.filter((i) => i.grupo === grupo).map((i) => {
                  const ativo = marcados.includes(i.slug);
                  const noTeto = !ativo && marcados.length >= MAX_INTERESSES;
                  return (
                    <button
                      key={i.slug}
                      type="button"
                      className="pill"
                      onClick={() => void alternarInteresse(i.slug)}
                      disabled={noTeto}
                      aria-pressed={ativo}
                      /* Desabilitado COM MOTIVO: um chip que não responde ao clique, sem explicar,
                         ensina que a tela está quebrada. */
                      title={noTeto ? `Você já escolheu ${MAX_INTERESSES}. Desmarque um para trocar.` : undefined}
                    >
                      {i.rotulo}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="mut" style={{ fontSize: 12.5, marginTop: 14 }}>
            <span className="tn">{marcados.length}</span> de {MAX_INTERESSES} escolhidos · salvo assim que você marca
          </p>
        </div>
      </section>

      {/* ── SALVAR ── A barra aparece quando há alteração; o aviso é sobre o que o SERVIDOR fez. */}
      <div className={`barra-salvar ${sujo || estado === 'erro' ? 'on' : ''}`} role="status" aria-live="polite">
        {sujo || estado === 'erro' ? (
          <>
            <span style={estado === 'erro' ? { color: 'var(--error-ink)' } : undefined}>
              <CircleDot aria-hidden />
              {estado === 'erro'
                ? 'Não consegui salvar. Verifique a conexão e tente de novo.'
                : 'Alterações não salvas'}
            </span>
            <div className="linha" style={{ gap: 8 }}>
              <button type="button" className="btn btn-outline peq" onClick={descartar}>
                Descartar
              </button>
              <button
                type="button"
                className="btn btn-solid peq"
                onClick={() => void salvar()}
                disabled={estado === 'salvando'}
              >
                {estado === 'salvando' ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}{' '}
                Salvar
              </button>
            </div>
          </>
        ) : estado === 'salvo' ? (
          <span className="ok-txt">
            <Check aria-hidden /> Salvo
          </span>
        ) : null}
      </div>
    </>
  );
}
