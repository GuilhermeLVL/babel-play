import { AlertTriangle, CheckCircle2, ExternalLink, FileUp, Info, Loader2 } from 'lucide-react';
import { type DragEvent, useEffect, useId, useRef, useState } from 'react';

import type { CreditoDoModelo, PassoDoGuia, RelatorioDeImportacao } from '../../../core/avatar/importador/validar';
import type { TierDoAvatar } from '../../../core/avatar/tiers';
import { FERRAMENTAS_DE_AVATAR, FONTES_DE_AVATAR } from '../../../data/avatar/fontes';
import { analisarArquivo, prepararParaUso } from '../../../lib/avatar/importador';
import { t } from '../../../lib/i18n';
import GaleriaDeTerceiros from './GaleriaDeTerceiros';
import {
  ehTelaDeToque,
  NOME_DO_PASSO,
  NUMERO_DO_PASSO,
  textoDaLicenca,
  textoDaRecusa,
  textoDoAviso,
} from './mensagens';

export interface ModeloPreparado {
  bytes: Uint8Array;
  id: string;
  titulo: string;
  credito: CreditoDoModelo | null;
}

interface Props {
  tier: TierDoAvatar;
  aoUsar: (m: ModeloPreparado) => void;
  /**
   * Um arquivo que passou na conferência (e só ele) é mostrado na prévia NA HORA, antes de "Usar este modelo":
   * recebe os bytes e o título; `null` quando não há mais arquivo aceito (outro arquivo, recusa, erro, usado).
   */
  aoPrevisualizar?: (m: { bytes: Uint8Array; titulo: string } | null) => void;
}

type Fase =
  | { fase: 'ocioso' }
  | { fase: 'analisando'; nome: string }
  | { fase: 'resultado'; nome: string; relatorio: RelatorioDeImportacao; bytes: Uint8Array | null }
  | { fase: 'preparando'; nome: string }
  | { fase: 'falhou'; nome: string };

const PASSOS: PassoDoGuia[] = ['encontre', 'baixe', 'arraste', 'licenca'];

function linkSeguro(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * TRAGA O SEU: o guia de 4 passos (Encontre, Baixe, Arraste, Confira a licença), o importador local, a mini-FAQ,
 * "Onde encontrar" e a galeria ao vivo (com opt-in). SÓ adultos chegam aqui (`politicaDeAvatar`): o perfil protegido
 * nem vê esta aba. O arquivo NUNCA vai ao servidor: tudo acontece neste navegador.
 */
export default function TragaOSeu({ tier, aoUsar, aoPrevisualizar }: Props) {
  const [estado, setEstado] = useState<Fase>({ fase: 'ocioso' });
  const [direitos, setDireitos] = useState(false);
  const [sobre, setSobre] = useState(false);
  const resultado = useRef<HTMLHeadingElement>(null);
  const id = useId();

  // Arquivo aceito: vai para a prévia na hora (a prévia diz "não salvo" e oferece voltar ao anterior).
  const aoPrevisualizarRef = useRef(aoPrevisualizar);
  aoPrevisualizarRef.current = aoPrevisualizar;
  useEffect(() => {
    const aceito = estado.fase === 'resultado' && estado.relatorio.decisao !== 'recusado' && estado.bytes;
    if (aceito && estado.fase === 'resultado' && estado.bytes) {
      aoPrevisualizarRef.current?.({
        bytes: estado.bytes,
        titulo: estado.relatorio.credito?.titulo || estado.nome.replace(/\.[^.]+$/, '').slice(0, 40),
      });
    } else if (estado.fase !== 'preparando') {
      aoPrevisualizarRef.current?.(null);
    }
  }, [estado]);

  // Leva o foco ao resultado: quem usa teclado ou leitor de tela cai direto no que aconteceu.
  useEffect(() => {
    if (estado.fase === 'resultado' || estado.fase === 'falhou') resultado.current?.focus();
  }, [estado.fase]);

  async function analisar(arquivo: Blob, nome: string) {
    setDireitos(false);
    setEstado({ fase: 'analisando', nome });
    try {
      // Perfil protegido nem chega aqui; mesmo assim a regra estrita (falha fechada) é a do core: `protegido: false`
      // só vale porque este componente só existe para adultos.
      const r = await analisarArquivo(arquivo, { protegido: false, tier });
      setEstado({ fase: 'resultado', nome, relatorio: r.relatorio, bytes: r.bytes });
    } catch {
      setEstado({ fase: 'falhou', nome });
    }
  }

  async function usar() {
    if (estado.fase !== 'resultado' || !estado.bytes) return;
    const { relatorio, bytes, nome } = estado;
    setEstado({ fase: 'preparando', nome });
    try {
      const p = await prepararParaUso(bytes, relatorio, { protegido: false, tier, direitosConfirmados: direitos });
      aoUsar({
        bytes: p.bytes,
        id: p.id,
        titulo: p.relatorio.credito?.titulo || nome.replace(/\.[^.]+$/, '').slice(0, 40),
        credito: p.relatorio.credito,
      });
      setEstado({ fase: 'ocioso' });
    } catch {
      setEstado({ fase: 'falhou', nome });
    }
  }

  const soltou = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSobre(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void analisar(f, f.name);
  };

  const rel = estado.fase === 'resultado' ? estado.relatorio : null;
  const passoAtivo: PassoDoGuia =
    estado.fase === 'ocioso'
      ? 'encontre'
      : estado.fase === 'analisando' || estado.fase === 'preparando'
        ? 'arraste'
        : rel?.recusas[0]
          ? rel.recusas[0].passo
          : 'licenca';
  const ocupado = estado.fase === 'analisando' || estado.fase === 'preparando';
  const podeUsar = rel && rel.decisao !== 'recusado' && (rel.decisao === 'aceito' || direitos) && !!estado.fase;
  const credito = rel?.credito;
  const linkDaLicenca = credito ? linkSeguro(credito.urlDaLicenca) : null;

  return (
    <div className="av-tela" data-testid="avatar-traga">
      <section className="q-secao" aria-labelledby={`${id}-guia`}>
        <header>
          <div>
            <h3 id={`${id}-guia`}>{t('Traga o seu avatar')}</h3>
            <p>{t('Seu arquivo fica só neste aparelho. Nada é enviado para o Frasy nem para ninguém.')}</p>
          </div>
        </header>
        <ol className="av-passos" data-testid="avatar-passos">
          {PASSOS.map((p) => (
            <li
              key={p}
              className={p === passoAtivo ? 'av-passo-ativo' : undefined}
              aria-current={p === passoAtivo ? 'step' : undefined}
              data-passo={p}
            >
              <span>
                <b>{NOME_DO_PASSO[p]()}</b>
                {p === 'encontre' &&
                  t('Ache um modelo VRM ou GLB em um dos sites abaixo, ou crie o seu no VRoid Studio.')}
                {p === 'baixe' &&
                  t('Baixe o arquivo .vrm ou .glb. Se vier num .zip, abra-o e pegue o arquivo de dentro.')}
                {p === 'arraste' &&
                  (ehTelaDeToque()
                    ? t('Escolha o arquivo .vrm ou .glb pelo botão abaixo. O Frasy confere tudo aqui mesmo.')
                    : t(
                        'Escolha o arquivo .vrm ou .glb (ou arraste, no computador). O Frasy confere tudo aqui mesmo.',
                      ))}
                {p === 'licenca' && t('Leia o que a licença permite e confirme. O crédito do autor fica à mostra.')}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="q-secao">
        <div
          className="av-solta"
          data-sobre={sobre}
          onDragOver={(e) => {
            e.preventDefault();
            setSobre(true);
          }}
          onDragLeave={() => setSobre(false)}
          onDrop={soltou}
          data-testid="avatar-solta"
        >
          <FileUp aria-hidden />
          <p style={{ margin: 0, font: '700 17px/1.4 var(--font-body, inherit)' }}>
            {ehTelaDeToque()
              ? t('Toque em Escolher arquivo.')
              : t('Escolher arquivo .vrm ou .glb. No computador, você também pode arrastar para cá.')}
          </p>
          <label className="q-ctl av-arquivo">
            {t('Escolher arquivo')}
            <input
              type="file"
              accept=".vrm,.glb,model/gltf-binary"
              className="sr"
              disabled={ocupado}
              data-testid="avatar-arquivo"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void analisar(f, f.name);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </section>

      <div aria-live="polite" role="status" className="sr" data-testid="avatar-importador-status">
        {estado.fase === 'analisando' && t('Conferindo o arquivo…')}
        {estado.fase === 'preparando' && t('Preparando o modelo…')}
      </div>

      {ocupado && (
        <p className="qc-nota">
          <Loader2 className="qc-gira" aria-hidden />{' '}
          {estado.fase === 'analisando' ? t('Conferindo o arquivo…') : t('Preparando o modelo…')}
        </p>
      )}

      {estado.fase === 'falhou' && (
        <div className="av-aviso" role="alert" data-tom="erro" data-testid="avatar-importador-erro">
          <AlertTriangle aria-hidden />
          <div>
            <h4 ref={resultado} tabIndex={-1} style={{ margin: 0 }}>
              {t('Não deu para usar “{nome}”', { nome: estado.nome })}
            </h4>
            <p style={{ margin: '6px 0 0' }}>
              {t('Algo deu errado ao conferir o arquivo. Tente de novo ou use outro modelo.')}
            </p>
          </div>
        </div>
      )}

      {rel && rel.decisao === 'recusado' && (
        <div className="av-aviso" role="alert" data-tom="erro" data-testid="avatar-importador-recusado">
          <AlertTriangle aria-hidden />
          <div>
            <h4 ref={resultado} tabIndex={-1} style={{ margin: 0 }}>
              {t('Esse arquivo não pode ser usado')}
            </h4>
            <ul>
              {dedupe(rel.recusas.map(textoDaRecusa)).map((r) => (
                <li key={r.problema} data-recusa-passo={r.passo}>
                  <b>{r.problema}</b> {r.ajuda}{' '}
                  {r.mostrarPasso && (
                    <i style={{ fontStyle: 'normal', color: 'var(--ink-muted)' }}>
                      {t('(Passo {n}: {nome})', { n: NUMERO_DO_PASSO[r.passo], nome: NOME_DO_PASSO[r.passo]() })}
                    </i>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {rel && rel.decisao !== 'recusado' && (
        <section className="q-cartao" data-testid="avatar-importador-ok" aria-labelledby={`${id}-ok`}>
          <h4 id={`${id}-ok`} ref={resultado} tabIndex={-1} className="av-titulo-ok">
            <CheckCircle2 aria-hidden />
            <span>
              {rel.decisao === 'aceito' ? t('O arquivo passou na conferência') : t('Falta só confirmar a licença')}
            </span>
          </h4>
          <p className="av-credito" style={{ textAlign: 'start', maxWidth: 'none' }}>
            {credito && (credito.titulo || credito.autores.length > 0)
              ? t('Modelo: {titulo} · Autor: {autor}', {
                  titulo: credito.titulo || t('sem título'),
                  autor: credito.autores.join(', ') || t('não informado'),
                })
              : t('O arquivo não informa título nem autor.')}
            {linkDaLicenca && (
              <span className="av-nowrap">
                {' · '}
                <a className="av-link-licenca" href={linkDaLicenca} target="_blank" rel="noopener noreferrer">
                  {t('Ver a licença')} <ExternalLink aria-hidden />
                </a>
              </span>
            )}
          </p>
          {rel.licenca && (rel.licenca.avisos.length > 0 || rel.licenca.confirmacoes.length > 0) && (
            <div className="av-aviso" role="note">
              <Info aria-hidden />
              <ul style={{ margin: 0 }}>
                {[...rel.licenca.confirmacoes, ...rel.licenca.avisos].map((c) => (
                  <li key={c}>{textoDaLicenca(c)}</li>
                ))}
              </ul>
            </div>
          )}
          {rel.avisos.length > 0 && (
            <ul className="qc-nota" style={{ margin: 0, paddingInlineStart: 20 }}>
              {rel.avisos.map((a) => (
                <li key={a.codigo}>{textoDoAviso(a)}</li>
              ))}
            </ul>
          )}
          <p className="qc-nota">
            {t('Isto é uma triagem do que o arquivo declara, não um parecer jurídico. O uso é local e pessoal.')}
          </p>
          {rel.decisao === 'precisa_confirmar' && (
            <label className="av-confirma">
              <input
                type="checkbox"
                checked={direitos}
                onChange={(e) => setDireitos(e.target.checked)}
                data-testid="avatar-direitos"
              />
              <span>{t('Confirmo que tenho direito de usar este modelo')}</span>
            </label>
          )}
          <div className="av-acoes">
            <button
              type="button"
              className="q-ctl pri"
              disabled={!podeUsar || ocupado}
              onClick={() => void usar()}
              data-testid="avatar-usar-modelo"
            >
              {t('Usar este modelo')}
            </button>
          </div>
        </section>
      )}

      <section className="q-secao av-faq" aria-label={t('Perguntas frequentes')}>
        <header>
          <div>
            <h3>{t('Dúvidas')}</h3>
          </div>
        </header>
        <details>
          <summary>{t('O que é um arquivo VRM?')}</summary>
          <p>
            {t(
              'É um modelo de personagem em 3D que já traz esqueleto, expressões do rosto e a licença do autor dentro do próprio arquivo. O GLB é parecido, mas sem a licença e as expressões.',
            )}
          </p>
        </details>
        <details>
          <summary>{t('Baixei um .zip, .fbx ou .blend. E agora?')}</summary>
          <p>
            {t(
              'Um .zip é só uma caixa: abra-o e procure o arquivo .vrm ou .glb de dentro. Um .fbx ou .blend precisa ser convertido: abra no Blender e exporte em GLB (Arquivo, Exportar, glTF 2.0, formato glTF Binary).',
            )}
          </p>
          <ul style={{ paddingInlineStart: 20 }}>
            {FERRAMENTAS_DE_AVATAR.map((f) => (
              <li key={f.id}>
                <a href={f.url} target="_blank" rel="noopener noreferrer">
                  {f.nome}
                </a>
                {': '}
                {t(f.para)}
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>{t('Meu arquivo foi recusado. Por quê?')}</summary>
          <p>
            {t(
              'O Frasy confere o tamanho, a quantidade de peças, as imagens, se o arquivo está completo e o que a licença permite. A mensagem diz o que houve e em qual passo do guia resolver.',
            )}
          </p>
        </details>
        <details>
          <summary>{t('Meu arquivo vai para algum servidor?')}</summary>
          <p>
            {t(
              'Não. A conferência acontece neste navegador e o modelo fica guardado só neste aparelho. Você pode apagá-lo quando quiser.',
            )}
          </p>
        </details>
      </section>

      <section className="q-secao" aria-label={t('Onde encontrar')}>
        <header>
          <div>
            <h3>{t('Onde encontrar')}</h3>
            <p>
              {t(
                'Links para sites de fora. O Frasy não hospeda nem recomenda um modelo específico: leia a licença de cada um antes de usar.',
              )}
            </p>
          </div>
        </header>
        <ul className="av-fontes" data-testid="avatar-fontes">
          {FONTES_DE_AVATAR.map((f) => (
            <li key={f.id} className="av-fonte">
              <h4>{f.nome}</h4>
              <p>{t(f.oferece)}</p>
              <p>
                <b>{t('Licença:')}</b> {t(f.licenca)}
              </p>
              {f.aviso && <p>{t(f.aviso)}</p>}
              {!f.confirmado && <p>{t('Não conseguimos conferir os termos desta fonte: leia-os no site.')}</p>}
              <a href={f.url} target="_blank" rel="noopener noreferrer">
                {t('Abrir {nome}', { nome: f.nome })} <ExternalLink aria-hidden />
              </a>
              <a
                href={f.termosUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('Ler os termos de {nome} (abre em nova aba)', { nome: f.nome })}
              >
                {t('Ler os termos')} <ExternalLink aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <GaleriaDeTerceiros
        ocupado={ocupado}
        aoBaixar={(bytes, nome) => void analisar(new Blob([bytes.slice().buffer as ArrayBuffer]), nome)}
      />
    </div>
  );
}

function dedupe<T extends { problema: string }>(lista: T[]): T[] {
  const vistos = new Set<string>();
  return lista.filter((x) => (vistos.has(x.problema) ? false : (vistos.add(x.problema), true)));
}
