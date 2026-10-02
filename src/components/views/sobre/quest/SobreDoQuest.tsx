import '../../../../styles/questInstitucional.css';

import type { LucideIcon } from 'lucide-react';
import { BookOpen, Check, Copy, ExternalLink, FileText, HandHeart, Heart, Quote, Shield, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { CRIADOR } from '../../../../lib/criador';
import { t } from '../../../../lib/i18n';
import { ATRIBUICAO_TATOEBA } from '../../../../lib/traducao/atribuicaoTatoeba';
import { VERSAO_DO_APP } from '../../../../lib/versao';
import AbasDoQuest from '../../ajustes/quest/AbasDoQuest';
import type { Documento } from '../DialogoLegal';

export interface RedeDoCriador {
  href: string;
  icone: LucideIcon;
  rotulo: string;
}
export interface JeitoDeAjudar {
  icone: LucideIcon;
  titulo: string;
  desc: string;
  /** Link de fora (abre em outra aba). */
  href?: string;
  /** Destino dentro do app. */
  aoClicar?: () => void;
}
export interface FonteDeDados {
  nome: string;
  licenca: string;
  uso: string;
  href: string;
}

type Aba = 'quem' | 'historia' | 'ajudar' | 'dados';

/**
 * SOBRE NO META QUEST — o mesmo conteúdo de `Sobre.tsx`, em quatro abas que cabem na janela do
 * headset sem rolar: quem faz (e as redes), a história, como ajudar (e o Pix), e os dados abertos com
 * a política, os termos e os créditos que as licenças exigem. A versão fica no cabeçalho, sempre à
 * vista: é o que se cita num relato de problema.
 *
 * Só apresentação: as redes preenchidas, os jeitos de ajudar (sem "Assine um plano" na edição
 * estática), o Pix e a foto vêm prontos de `Sobre.tsx`.
 */
export default function SobreDoQuest({
  redes,
  fatos,
  ajudas,
  dadosAbertos,
  pix,
  copiado,
  aoCopiarPix,
  semFoto,
  aoFalharAFoto,
  aoAbrirLegal,
}: {
  redes: readonly RedeDoCriador[];
  fatos: readonly string[];
  ajudas: readonly JeitoDeAjudar[];
  dadosAbertos: readonly FonteDeDados[];
  /** A chave Pix, quando o dono a preencheu. */
  pix: string | null;
  copiado: boolean;
  aoCopiarPix: () => void;
  semFoto: boolean;
  aoFalharAFoto: () => void;
  aoAbrirLegal: (doc: Documento) => void;
}) {
  const [aba, setAba] = useState<Aba>('quem');

  const abas = [
    { id: 'quem', rotulo: t('Quem faz'), icone: <Heart aria-hidden /> },
    { id: 'historia', rotulo: t('A história'), icone: <Sparkles aria-hidden /> },
    { id: 'ajudar', rotulo: t('Quer ajudar?'), icone: <HandHeart aria-hidden /> },
    { id: 'dados', rotulo: t('Dados e termos'), icone: <BookOpen aria-hidden /> },
  ];

  return (
    <div className="q-palco q-inst" data-testid="sobre-do-quest">
      <header className="q-cab">
        <div>
          <p className="q-sobre">{t('Quem faz o app')}</p>
          <h1>{t('Sobre o Babel Play')}</h1>
        </div>
        {VERSAO_DO_APP && <span className="q-chip">{t('Versão {versao}', { versao: VERSAO_DO_APP })}</span>}
      </header>

      <AbasDoQuest itens={abas} ativo={aba} aoTrocar={(id) => setAba(id as Aba)} rotuloDoGrupo={t('Seções do Sobre')} />

      {aba === 'quem' && (
        <div className="q-inst-painel" role="tabpanel" id="painel-quem" aria-labelledby="aba-quem">
          <section className="q-cartao q-sobre-heroi">
            <div className="q-avatar" aria-hidden="true">
              {semFoto ? (
                CRIADOR.nome.charAt(0)
              ) : (
                <img src={CRIADOR.foto} alt="" loading="lazy" onError={aoFalharAFoto} />
              )}
            </div>
            <div>
              <h2>{t('Oi, eu sou o {nome}.', { nome: CRIADOR.nome })}</h2>
              <p className="q-texto">
                {t(
                  'Sou desenvolvedor independente e faço o Babel Play sozinho, nas noites e nos fins de semana. Se quiser conhecer o resto do meu trabalho, ou só trocar uma ideia, é por aqui:',
                )}
              </p>
              {redes.length > 0 ? (
                <div className="q-acoes">
                  {redes.map(({ href, icone: Icone, rotulo }, k) => (
                    <a
                      key={rotulo}
                      href={href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={k === 0 ? 'q-ctl pri' : 'q-ctl'}
                    >
                      <Icone aria-hidden /> {t(rotulo)}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="q-inst-nota">{t('As redes ainda não foram preenchidas nesta instalação.')}</p>
              )}
            </div>
          </section>
          <ul className="q-inst-fatos" aria-label={t('O que o app garante')}>
            {fatos.map((f) => (
              <li key={f} className="q-chip">
                <Check aria-hidden /> {t(f)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {aba === 'historia' && (
        <div className="q-inst-painel q-inst-duas" role="tabpanel" id="painel-historia" aria-labelledby="aba-historia">
          <section className="q-secao">
            <header>
              <div>
                <h2>{t('Por que eu fiz o Babel Play')}</h2>
              </div>
            </header>
            <p className="q-texto">
              {t(
                'Eu aprendi inglês do jeito que muita gente aprende: vendo série, jogando online, assistindo vídeo de gente do mundo inteiro. O problema é que eu entendia metade, e as palavras novas sumiam da cabeça no dia seguinte.',
              )}
            </p>
            <p className="q-texto">
              {t(
                'Então fiz a ferramenta que eu queria ter. Você dá play em qualquer coisa e o Babel Play escuta junto: mostra a legenda, traduz do lado e guarda as palavras novas para você revisar e jogar depois.',
              )}
            </p>
            <p className="q-texto">
              {t('E tem uma coisa que eu faço questão:')} <b>{t('aprender aqui vai continuar sendo de graça.')}</b>
            </p>
          </section>
          <figure className="q-cartao fundo q-citacao">
            <Quote aria-hidden />
            <blockquote>{t('“Você não precisa largar o que gosta de assistir para aprender um idioma.”')}</blockquote>
          </figure>
        </div>
      )}

      {aba === 'ajudar' && (
        <div className="q-inst-painel" role="tabpanel" id="painel-ajudar" aria-labelledby="aba-ajudar">
          <section className="q-secao">
            <header>
              <div>
                <h2>{t('Quer ajudar?')}</h2>
                <p>{t('Qualquer uma dessas faz diferença para um projeto feito por uma pessoa só.')}</p>
              </div>
            </header>
            <div className={ajudas.length >= 3 ? 'q-grade g3' : 'q-grade g2'}>
              {ajudas.map(({ icone: Icone, titulo, desc, href, aoClicar }) => {
                const miolo = (
                  <>
                    <span className="q-ic">
                      <Icone aria-hidden />
                    </span>
                    <b>{t(titulo)}</b>
                    <span className="q-d">{t(desc)}</span>
                  </>
                );
                /* O cartão É o alvo: leva para onde o título diz. Sem destino, é só um cartão. */
                if (href)
                  return (
                    <a key={titulo} className="q-tile" href={href} target="_blank" rel="noreferrer noopener">
                      {miolo}
                    </a>
                  );
                if (aoClicar)
                  return (
                    <button key={titulo} type="button" className="q-tile" onClick={aoClicar}>
                      {miolo}
                    </button>
                  );
                return (
                  <div key={titulo} className="q-cartao">
                    {miolo}
                  </div>
                );
              })}
            </div>
          </section>
          {/* O Pix só aparece quando o dono preencheu a chave. */}
          {pix && (
            <div className="q-ajuste" data-testid="pix-do-quest">
              <div>
                <b>{t('Ou um Pix do tamanho de um café')}</b>
                <small>
                  <code>{pix}</code>
                </small>
              </div>
              <button type="button" className="q-ctl" onClick={aoCopiarPix}>
                {copiado ? <Check aria-hidden /> : <Copy aria-hidden />} {copiado ? t('Copiado!') : t('Copiar Pix')}
              </button>
            </div>
          )}
        </div>
      )}

      {aba === 'dados' && (
        <div className="q-inst-painel" role="tabpanel" id="painel-dados" aria-labelledby="aba-dados">
          <section className="q-secao">
            <header>
              <div>
                <h2>{t('Política e termos')}</h2>
                <p>{t('O resumo abre aqui; o documento completo, em "Baixar PDF".')}</p>
              </div>
              <div className="q-acoes">
                <button type="button" className="q-ctl" onClick={() => aoAbrirLegal('privacidade')}>
                  <Shield aria-hidden /> {t('Política de privacidade')}
                </button>
                <button type="button" className="q-ctl" onClick={() => aoAbrirLegal('termos')}>
                  <FileText aria-hidden /> {t('Termos de uso')}
                </button>
              </div>
            </header>
          </section>

          <section className="q-secao">
            <header>
              <div>
                <h2>{t('Dados abertos')}</h2>
                <p>{t('O dicionário e as trilhas do app são feitos com dados livres. Obrigado a quem os escreve.')}</p>
              </div>
            </header>
            <div className="q-lista">
              {dadosAbertos.map((d) => (
                <a key={d.nome} className="q-linha" href={d.href} target="_blank" rel="noreferrer noopener">
                  <span>
                    <b>{d.nome}</b>
                    <small>
                      {d.licenca} · {t(d.uso)}
                    </small>
                  </span>
                  <span className="q-fim">
                    <ExternalLink aria-hidden />
                  </span>
                </a>
              ))}
              <a
                className="q-linha"
                href={`${CRIADOR.github}/babel-play/blob/main/FONTES.md`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <span>
                  <b>{t('Lista completa de fontes e autores')}</b>
                </span>
                <span className="q-fim">
                  <ExternalLink aria-hidden />
                </span>
              </a>
            </div>
            {/* Créditos que a licença exige (CC BY 2.0 FR): a semente da memória de tradução é do Tatoeba. */}
            <p className="q-inst-nota">{t(ATRIBUICAO_TATOEBA)}</p>
          </section>
        </div>
      )}
    </div>
  );
}
