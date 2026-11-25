import { useEffect, useRef, useState } from 'react';

import { type Cobertura, cobrirNoCanvas, codificarCena } from '../../../lib/cartoes/cenaDoCartao';
import { t } from '../../../lib/i18n';
import FolhaDeBaixo from './celular/FolhaDeBaixo';

/**
 * A FOLHA DA CENA (openspec `cartao-com-captura-de-tela`, tarefa 3.2): mostra o quadro que a pessoa pediu, deixa cobrir
 * pedaços (retângulo opaco aplicado no canvas ANTES de codificar: o pixel coberto não existe no arquivo) e só então guarda.
 * "Descartar" ou fechar a folha não grava nada. Quando o compartilhamento é a tela inteira, "Guardar" só liga depois de a pessoa
 * confirmar que revisou a imagem toda.
 */
const CHAVE_DO_AVISO = 'cartoes.cenaAvisoVisto';

const jaViuOAviso = (): boolean => {
  try {
    return localStorage.getItem(CHAVE_DO_AVISO) === '1';
  } catch {
    return false;
  }
};

export default function FolhaDaCena({
  quadro,
  telaInteira,
  aoGuardar,
  aoFechar,
}: {
  quadro: HTMLCanvasElement;
  /** O compartilhamento é a tela inteira (`monitor`): pede a confirmação extra. */
  telaInteira: boolean;
  /** Recebe a imagem JÁ coberta e codificada. Devolve se guardou. */
  aoGuardar: (imagem: Blob) => Promise<boolean>;
  aoFechar: () => void;
}) {
  const vista = useRef<HTMLCanvasElement>(null);
  const [coberturas, setCoberturas] = useState<Cobertura[]>([]);
  const [rascunho, setRascunho] = useState<Cobertura | null>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const [revisei, setRevisei] = useState(!telaInteira);
  const [aviso, setAviso] = useState(() => !jaViuOAviso());
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const c = vista.current;
    if (!c) return;
    c.width = quadro.width;
    c.height = quadro.height;
    c.getContext('2d')?.drawImage(quadro, 0, 0);
  }, [quadro]);

  const ponto = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  const retangulo = (a: { x: number; y: number }, b: { x: number; y: number }): Cobertura => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    /* Cobre numa cópia: a folha continua mostrando o quadro original até fechar. */
    const copia = document.createElement('canvas');
    copia.width = quadro.width;
    copia.height = quadro.height;
    copia.getContext('2d')?.drawImage(quadro, 0, 0);
    cobrirNoCanvas(copia, coberturas);
    const imagem = await codificarCena(copia);
    const ok = imagem ? await aoGuardar(imagem) : false;
    setGuardando(false);
    if (ok) {
      try {
        localStorage.setItem(CHAVE_DO_AVISO, '1');
      } catch {
        /* sem localStorage o aviso volta na próxima vez */
      }
      aoFechar();
    }
  };

  return (
    <FolhaDeBaixo titulo={t('Guardar a cena')} aoFechar={aoFechar} classe="folha-da-cena">
      <div data-testid="folha-da-cena">
        {aviso && (
          <p className="mut" data-testid="aviso-da-cena">
            {t(
              'A imagem fica só neste aparelho: não vai para o servidor nem para a IA. Ela pode mostrar nomes, mensagens e rostos de outras pessoas; cubra o que não quiser guardar.',
            )}{' '}
            <button type="button" className="btn btn-outline peq" onClick={() => setAviso(false)}>
              {t('Entendi')}
            </button>
          </p>
        )}
        <div
          className="cena-previa"
          style={{ position: 'relative', touchAction: 'none', lineHeight: 0 }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            inicio.current = ponto(e);
          }}
          onPointerMove={(e) => {
            if (inicio.current) setRascunho(retangulo(inicio.current, ponto(e)));
          }}
          onPointerUp={(e) => {
            if (inicio.current) {
              const r = retangulo(inicio.current, ponto(e));
              if (r.w > 0.01 && r.h > 0.01) setCoberturas((c) => [...c, r]);
            }
            inicio.current = null;
            setRascunho(null);
          }}
        >
          <canvas ref={vista} style={{ width: '100%', height: 'auto' }} aria-label={t('O quadro da tela')} />
          {[...coberturas, ...(rascunho ? [rascunho] : [])].map((c, i) => (
            <span
              key={i}
              data-testid="cobertura"
              style={{
                position: 'absolute',
                left: `${c.x * 100}%`,
                top: `${c.y * 100}%`,
                width: `${c.w * 100}%`,
                height: `${c.h * 100}%`,
                background: '#000',
              }}
            />
          ))}
        </div>
        <p className="mut">{t('Arraste sobre a imagem para cobrir um pedaço.')}</p>
        {telaInteira && (
          <label className="q-ajuste">
            <input type="checkbox" checked={revisei} onChange={(e) => setRevisei(e.target.checked)} />{' '}
            {t('Você compartilhou a tela inteira. Revisei a imagem toda e cobri o que não quero guardar.')}
          </label>
        )}
        <div className="cx-fileira">
          <button
            type="button"
            className="btn btn-outline"
            disabled={!coberturas.length}
            onClick={() => setCoberturas([])}
          >
            {t('Desfazer as coberturas')}
          </button>
          <button type="button" className="btn btn-outline" data-testid="descartar-cena" onClick={aoFechar}>
            {t('Descartar')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="guardar-cena"
            disabled={!revisei || guardando}
            onClick={() => void guardar()}
          >
            {t('Guardar')}
          </button>
        </div>
      </div>
    </FolhaDeBaixo>
  );
}
