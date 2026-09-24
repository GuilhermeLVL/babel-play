import { BookOpen, Cpu, Github, Keyboard, LifeBuoy, Mail, MessageCircle, Mic, Search, Target } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { CRIADOR, preenchido } from '../../lib/criador';
import GuidePanel from '../GuidePanel';
import { CabecalhoDeTela, Dialogo, IconeEmBloco, Tela, TituloDeSecao } from '../ui';

/**
 * AJUDA E SUPORTE — a tela do protótipo aprovado (`T.ajuda`).
 *
 * Só o que existe de verdade: os artigos abrem o guia rápido do app; os atalhos são os que o app
 * tem (Ctrl+K, Ctrl+B, Esc e os da revisão), e "Ver todos" abre o diálogo `dialogoAtalhos()`; o contato usa os canais preenchidos em `lib/criador` — o app não tem
 * servidor de mensagens, então não há formulário fingindo enviar; e o status vem de `/api/health`.
 */

const ARTIGOS = [
  { Icone: Mic, titulo: 'Capturar o som do computador', desc: 'Funciona com vídeo, aula, chamada e jogo.' },
  { Icone: Target, titulo: 'Como funciona a revisão', desc: 'Por que as palavras voltam em dias diferentes.' },
  { Icone: Cpu, titulo: 'IA no aparelho ou na nuvem', desc: 'Diferenças de qualidade, privacidade e custo.' },
];

/** Os atalhos que o app TEM (o protótipo lista também `?` e `G I/J/V`, que o app não tem). */
const ATALHOS: [string[], string][] = [
  [['Ctrl', 'K'], 'Buscar gravação, palavra ou tela'],
  [['Ctrl', 'B'], 'Recolher ou abrir o menu lateral'],
  [['Espaço'], 'Mostrar a resposta (revisão)'],
  [['1', '–', '4'], 'Responder a revisão'],
  [['Esc'], 'Fechar painel ou diálogo'],
];

/** Uma linha `.atalho`: a descrição e as teclas; o "–" de um intervalo vira "a", como no protótipo. */
function LinhaDeAtalho({ teclas, desc }: { teclas: string[]; desc: string }) {
  return (
    <div className="entre atalho">
      <span>{desc}</span>
      <span>
        {teclas.map((t, i) => (
          <React.Fragment key={t}>
            {i > 0 && ' '}
            {t === '–' ? <span className="mut">a</span> : <kbd>{t}</kbd>}
          </React.Fragment>
        ))}
      </span>
    </div>
  );
}

type Status = 'verificando' | 'ok' | 'problema';

export default function Ajuda() {
  const [guiaAberto, setGuiaAberto] = useState(false);
  const [atalhosAbertos, setAtalhosAbertos] = useState(false);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<Status>('verificando');

  useEffect(() => {
    let vivo = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then((j: { status?: string }) => vivo && setStatus(j.status === 'ok' ? 'ok' : 'problema'))
      .catch(() => vivo && setStatus('problema'));
    return () => {
      vivo = false;
    };
  }, []);

  const termo = busca.trim().toLowerCase();
  const artigos = useMemo(
    () => (termo ? ARTIGOS.filter((a) => `${a.titulo} ${a.desc}`.toLowerCase().includes(termo)) : ARTIGOS),
    [termo],
  );
  const canais = [
    { href: CRIADOR.email, rotulo: 'E-mail', Icone: Mail },
    { href: CRIADOR.github, rotulo: 'GitHub', Icone: Github },
  ].filter((c) => preenchido(c.href));

  return (
    <Tela largura="estreita">
      <CabecalhoDeTela
        sobrancelha="Suporte"
        icone={LifeBuoy}
        titulo="Ajuda e suporte"
        sub="Respostas rápidas, atalhos e como falar com a gente."
      />
      <label className="busca" style={{ maxWidth: 'none' }}>
        <Search aria-hidden />
        <span className="sr">Buscar na ajuda</span>
        <input
          className="campo"
          placeholder="Ex.: como capturar o som do computador"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </label>

      <section className="secao">
        <TituloDeSecao icone={BookOpen} titulo="Primeiros passos" />
        {artigos.length ? (
          <div className="g3">
            {artigos.map(({ Icone, titulo, desc }) => (
              <button
                key={titulo}
                type="button"
                className="cartao clicavel p5"
                style={{ textAlign: 'left' }}
                onClick={() => setGuiaAberto(true)}
              >
                <IconeEmBloco icone={Icone} />
                <h3 style={{ fontSize: 15, fontWeight: 800, marginTop: 12 }}>{titulo}</h3>
                <p className="mut" style={{ fontSize: 13, marginTop: 4 }}>
                  {desc}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <p className="mut">Nada encontrado para “{busca}”. Tente outra palavra ou fale com a gente abaixo.</p>
        )}
      </section>

      <section className="secao">
        <TituloDeSecao
          icone={Keyboard}
          titulo="Atalhos de teclado"
          direita={
            <button type="button" className="link" onClick={() => setAtalhosAbertos(true)}>
              Ver todos
            </button>
          }
        />
        <div className="cartao p5">
          {ATALHOS.slice(0, 4).map(([teclas, desc]) => (
            <LinhaDeAtalho key={desc} teclas={teclas} desc={desc} />
          ))}
        </div>
      </section>

      <section className="secao">
        <TituloDeSecao
          icone={MessageCircle}
          titulo="Fale com a gente"
          desc="Dúvidas, problemas técnicos, sugestões ou pedidos sobre os seus dados."
        />
        <div className="cartao p5">
          {canais.length ? (
            <div className="linha" style={{ gap: 10, flexWrap: 'wrap' }}>
              {canais.map(({ href, rotulo, Icone }) => (
                <a
                  key={rotulo}
                  className="btn btn-outline"
                  href={href.includes('@') && !href.startsWith('http') ? `mailto:${href}` : href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel="noreferrer"
                >
                  <Icone aria-hidden /> {rotulo}
                </a>
              ))}
            </div>
          ) : (
            <p className="mut" style={{ fontSize: 13.5 }}>
              O contato ainda não foi configurado nesta instalação. Quando houver, ele aparece aqui e na tela Sobre.
            </p>
          )}
        </div>
      </section>

      <section className="secao">
        <div className="cartao p5 entre" role="status" aria-live="polite">
          <span className="linha" style={{ gap: 10 }}>
            <span
              className="ponto"
              style={{
                background:
                  status === 'ok' ? 'var(--good)' : status === 'problema' ? 'var(--error)' : 'var(--ink-faint)',
              }}
            />
            <b>
              {status === 'ok'
                ? 'Todos os sistemas funcionando'
                : status === 'problema'
                  ? 'O servidor não está respondendo direito agora'
                  : 'Verificando o servidor…'}
            </b>
          </span>
        </div>
      </section>

      {guiaAberto && <GuidePanel onClose={() => setGuiaAberto(false)} />}
      {atalhosAbertos && (
        <Dialogo
          icone={Keyboard}
          titulo="Atalhos de teclado"
          sub="Funcionam em qualquer tela, fora de campos de texto."
          largura=""
          aoFechar={() => setAtalhosAbertos(false)}
        >
          <div className="dlg-corpo">
            {ATALHOS.map(([teclas, desc]) => (
              <LinhaDeAtalho key={desc} teclas={teclas} desc={desc} />
            ))}
          </div>
        </Dialogo>
      )}
    </Tela>
  );
}
