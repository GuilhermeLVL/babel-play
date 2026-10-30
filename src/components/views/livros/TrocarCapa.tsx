import { ImagePlus, Undo2, X } from 'lucide-react';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

import { type ModoDoAjuste, TETO_DA_IMAGEM_DE_ORIGEM, TIPOS_DE_IMAGEM } from '../../../core/livros/imagemDeCapa';
import { t } from '../../../lib/i18n';
import {
  ErroDaCapa,
  guardarCapaDoUsuario,
  reduzirParaCapa,
  useCapaLocal,
  voltarAoOriginal,
} from '../../../lib/livros/capasLocais';

const MB = 1024 * 1024;

function mensagemDoErro(e: unknown): string {
  const motivo = e instanceof ErroDaCapa ? e.motivo : 'ilegivel';
  switch (motivo) {
    case 'grande':
      return t('Essa imagem passa de {mb} MB. Escolha uma menor.', { mb: TETO_DA_IMAGEM_DE_ORIGEM / MB });
    case 'tipo':
      return t('Use uma imagem JPG, PNG, WebP ou GIF. SVG e outros formatos não são aceitos.');
    case 'pixels':
      return t('Essa imagem é grande demais em pixels. Escolha uma menor.');
    case 'vazia':
      return t('Esse arquivo está vazio.');
    default:
      return t('Não consegui ler essa imagem. Tente outra.');
  }
}

/**
 * "TROCAR CAPA": a pessoa escolhe (ou arrasta) uma imagem do aparelho, vê como ficará em 2:3 e confirma. A
 * imagem é validada pelo conteúdo, reduzida e guardada SÓ neste aparelho; vale também para livro do catálogo
 * (é preferência dela, o catálogo não muda). "Voltar à capa original" apaga a escolha.
 */
export default function TrocarCapa({
  livroId,
  titulo,
  aoFechar,
}: {
  /** O id NA ESTANTE (`cat:<id>` ou `meu-…`). */
  livroId: string;
  titulo: string;
  aoFechar: () => void;
}) {
  const tituloId = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const atual = useCapaLocal(livroId);
  const [origem, setOrigem] = useState<File | null>(null);
  const [modo, setModo] = useState<ModoDoAjuste>('preencher');
  const [previa, setPrevia] = useState<{ blob: Blob; url: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sobre, setSobre] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  /* Devolve o foco a quem abriu, e fecha com Esc; o Tab não escapa da caixa. */
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    caixa.current?.focus();
    return () => anterior?.focus?.();
  }, []);

  /* Refaz a prévia quando muda a imagem ou o modo; revoga a URL anterior. */
  useEffect(() => {
    if (!origem) return;
    let vivo = true;
    void reduzirParaCapa(origem, modo)
      .then((blob) => {
        if (!vivo) return;
        setErro(null);
        setPrevia({ blob, url: URL.createObjectURL(blob) });
      })
      .catch((e) => {
        if (!vivo) return;
        setPrevia(null);
        setErro(mensagemDoErro(e));
      });
    return () => {
      vivo = false;
    };
  }, [origem, modo]);
  useEffect(() => () => void (previa && URL.revokeObjectURL(previa.url)), [previa]);

  const escolher = useCallback((arquivo: File | undefined) => {
    if (!arquivo) return;
    setErro(null);
    setPrevia(null);
    setOrigem(arquivo);
  }, []);

  const salvar = async () => {
    if (!previa) return;
    setOcupado(true);
    const ok = await guardarCapaDoUsuario(livroId, previa.blob);
    setOcupado(false);
    if (ok) aoFechar();
    else setErro(t('Não deu para guardar a capa neste aparelho (espaço ou modo privado). Tente de novo.'));
  };

  const voltar = async () => {
    setOcupado(true);
    await voltarAoOriginal(livroId);
    setOcupado(false);
    aoFechar();
  };

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      aoFechar();
      return;
    }
    if (e.key !== 'Tab' || !caixa.current) return;
    const itens = [...caixa.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, [href]')].filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (!itens.length) return;
    const primeiro = itens[0];
    const ultimo = itens[itens.length - 1];
    if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === caixa.current)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  return (
    <div className="lvc-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div
        ref={caixa}
        className="lvc-caixa"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        onKeyDown={aoTeclar}
        data-testid="trocar-capa"
      >
        <h2 id={tituloId}>{t('Trocar a capa de {titulo}', { titulo })}</h2>
        <p className="lvc-aviso">
          {t('Use uma imagem que você tem direito de usar. Ela fica só no seu aparelho e não muda o catálogo.')}
        </p>

        <div
          className={`lvc-soltar${sobre ? ' sobre' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setSobre(true);
          }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSobre(false);
            escolher(e.dataTransfer.files?.[0]);
          }}
        >
          <span>{t('Arraste uma imagem para cá ou escolha no aparelho.')}</span>
          <button type="button" className="q-ctl pri" onClick={() => entrada.current?.click()}>
            <ImagePlus aria-hidden /> {t('Escolher imagem')}
          </button>
          <input
            ref={entrada}
            type="file"
            hidden
            accept={TIPOS_DE_IMAGEM.join(',')}
            data-testid="capa-arquivo"
            aria-label={t('Imagem da capa')}
            onChange={(e) => {
              escolher(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {erro && (
          <p className="lvc-erro" role="alert" data-testid="capa-erro">
            {erro}
          </p>
        )}

        {previa && (
          <div className="lvc-previa" data-testid="capa-previa">
            <span className="lv-capa" aria-hidden>
              <img className="lv-capa-img" src={previa.url} alt="" width={300} height={450} />
            </span>
            <div className="lvc-modos" role="group" aria-label={t('Como ajustar a imagem')}>
              <button
                type="button"
                className="q-ctl"
                aria-pressed={modo === 'preencher'}
                onClick={() => setModo('preencher')}
              >
                {t('Preencher a capa')}
              </button>
              <button
                type="button"
                className="q-ctl"
                aria-pressed={modo === 'inteira'}
                onClick={() => setModo('inteira')}
              >
                {t('Mostrar a imagem inteira')}
              </button>
            </div>
          </div>
        )}

        <div className="lvc-acoes">
          {atual?.origem === 'usuario' && (
            <button type="button" className="q-ctl" onClick={() => void voltar()} disabled={ocupado}>
              <Undo2 aria-hidden /> {t('Voltar à capa original')}
            </button>
          )}
          <button type="button" className="q-ctl" onClick={aoFechar}>
            <X aria-hidden /> {t('Cancelar')}
          </button>
          <button
            type="button"
            className="q-ctl pri"
            onClick={() => void salvar()}
            disabled={!previa || ocupado}
            data-testid="capa-usar"
          >
            {t('Usar esta capa')}
          </button>
        </div>
      </div>
    </div>
  );
}
