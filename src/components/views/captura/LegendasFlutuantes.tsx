import '../../../styles/legendas.css';

import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  MousePointerClick,
  Palette,
  PictureInPicture2,
  X,
} from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';

import { fetchSettings, patchUiSettings } from '../../../data/api';
import {
  classesDoEstilo,
  EVENTO_AJUSTES_DA_LEGENDA,
  lerEstiloDeLegenda,
  pedacosDaLegenda,
  resolverEstiloDeLegenda,
} from '../../../lib/estilosDeLegenda';
import { toast } from '../../Toast';
import { Interruptor, Segmentos } from '../vocab/Dialogo';

/**
 * LEGENDAS FLUTUANTES — o `desenharLegendas()` do protótipo aprovado (C6): a janelinha escura com a
 * barra (travar o clique, modo, personalizar, esconder, recolher, fechar), as últimas falas e o
 * painel de personalização (predefinições, tradução, tamanho, histórico, cores, "Meu perfil").
 *
 * O MECANISMO é o de antes: no Chrome/Edge a janelinha vive numa Document Picture-in-Picture,
 * SEMPRE NO TOPO por cima do jogo, do vídeo ou da chamada (`emJanela`). Sem essa API, ela flutua
 * dentro do app, no canto, como no protótipo. As falas são as REAIS da captura, nunca texto fixo.
 */

/** Uma fala real da captura, pronta para a legenda. `lado` = de quem é (sistema = eles). */
export interface LegendaAoVivo {
  id: string;
  quem: string;
  original: string;
  traducao: string;
  lado: 'eles' | 'voce';
}

type Modo = 'video' | 'conversa' | 'jogo';
type Traducao = 'sempre' | 'discreta' | 'oculta';
type Preset = 'filme' | 'conversa' | 'jogo' | 'imersao' | 'meu';

/** O que é GUARDADO (aparência). Travar, esconder, recolher e o painel valem só enquanto a janela está aberta. */
interface Aparencia {
  modo: Modo;
  preset: Preset;
  traducao: Traducao;
  tam: number;
  historico: boolean;
  cores: { legenda: string; traducao: string };
}

const PADRAO: Aparencia = {
  modo: 'video',
  preset: 'filme',
  traducao: 'discreta',
  tam: 100,
  historico: true,
  cores: { legenda: '#FFFFFF', traducao: '#FFEA00' },
};

/** As predefinições do protótipo: modo, tradução e tamanho de uma vez. */
const PRESETS: Record<Exclude<Preset, 'meu'>, [Modo, Traducao, number]> = {
  filme: ['video', 'discreta', 100],
  conversa: ['conversa', 'sempre', 110],
  jogo: ['jogo', 'discreta', 90],
  imersao: ['video', 'oculta', 100],
};

const CHAVE = 'babel.legendasFlutuantes';
const CHAVE_MEU = 'babel.legendasMeuPerfil';
/** A configuração da janela antiga (Overlay), migrada na primeira abertura para ninguém perder a sua. */
const CHAVE_ANTIGA = 'babel.overlaySettings';

const MODOS = new Set<Modo>(['video', 'conversa', 'jogo']);
const TRADUCOES = new Set<Traducao>(['sempre', 'discreta', 'oculta']);

/** Aceita só o que tem forma de `Aparencia` (o que vem do disco ou do servidor pode ser qualquer coisa). */
function normalizar(bruto: unknown): Aparencia {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Partial<Aparencia>;
  const cores = (o.cores && typeof o.cores === 'object' ? o.cores : {}) as Partial<Aparencia['cores']>;
  const tam = typeof o.tam === 'number' && Number.isFinite(o.tam) ? Math.min(160, Math.max(70, o.tam)) : PADRAO.tam;
  return {
    modo: o.modo && MODOS.has(o.modo) ? o.modo : PADRAO.modo,
    preset: o.preset && (o.preset in PRESETS || o.preset === 'meu') ? o.preset : PADRAO.preset,
    traducao: o.traducao && TRADUCOES.has(o.traducao) ? o.traducao : PADRAO.traducao,
    tam: Math.round(tam / 10) * 10,
    historico: typeof o.historico === 'boolean' ? o.historico : PADRAO.historico,
    cores: {
      legenda: typeof cores.legenda === 'string' ? cores.legenda : PADRAO.cores.legenda,
      traducao: typeof cores.traducao === 'string' ? cores.traducao : PADRAO.cores.traducao,
    },
  };
}

/** A janela antiga guardava outro formato: modo em inglês, "independência" e escala de fonte. */
function migrarDaAntiga(bruto: Record<string, unknown>): Aparencia {
  const modo = { video: 'video', conversation: 'conversa', game: 'jogo' }[String(bruto.layoutMode)] as Modo | undefined;
  const traducao = { assisted: 'sempre', intermediate: 'discreta', immersion: 'oculta' }[String(bruto.independence)] as
    | Traducao
    | undefined;
  return normalizar({
    modo,
    traducao,
    tam: typeof bruto.fontScale === 'number' ? bruto.fontScale * 100 : undefined,
    historico: bruto.videoShowHistory,
    cores: { legenda: bruto.originalTextColor, traducao: bruto.translatedTextColor },
  });
}

export function lerAparencia(): Aparencia {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo) return normalizar(JSON.parse(salvo));
    const antiga = localStorage.getItem(CHAVE_ANTIGA);
    if (antiga) return migrarDaAntiga(JSON.parse(antiga));
  } catch {
    /* disco corrompido ou bloqueado: segue o padrão */
  }
  return PADRAO;
}

/** As falas que a janela mostra: a última, ou as duas últimas no modo vídeo com histórico (protótipo). */
export function falasVisiveis<T>(falas: T[], modo: Modo, historico: boolean): T[] {
  return falas.slice(historico && modo === 'video' ? -2 : -1);
}

export default function LegendasFlutuantes({
  falas,
  emJanela,
  aoFechar,
  aprendidas,
}: {
  falas: LegendaAoVivo[];
  /** Dentro da janela sempre-no-topo (Document PiP): ocupa a janela inteira. */
  emJanela: boolean;
  aoFechar: () => void;
  /** Palavras já aprendidas (minúsculas): ganham `data-aprendida`, que o estilo destaca. */
  aprendidas?: ReadonlySet<string>;
}) {
  const [ap, setAp] = useState<Aparencia>(lerAparencia);
  /* O ESTILO DE LEGENDA equipado (onda 4) — o mesmo da transcrição, relido quando muda. As cores
     que a pessoa escolheu aqui (`--leg-cor`) continuam valendo: o estilo não pinta o texto. */
  const [estiloId, setEstiloId] = useState(lerEstiloDeLegenda);
  useEffect(() => {
    const reler = () => setEstiloId(lerEstiloDeLegenda());
    window.addEventListener(EVENTO_AJUSTES_DA_LEGENDA, reler);
    return () => window.removeEventListener(EVENTO_AJUSTES_DA_LEGENDA, reler);
  }, []);
  const classesDoEstiloEquipado = classesDoEstilo(resolverEstiloDeLegenda(estiloId));
  const [travado, setTravado] = useState(false);
  const [oculto, setOculto] = useState(false);
  const [recolhido, setRecolhido] = useState(false);
  const [painel, setPainel] = useState(false);

  /* Guarda cada mudança: no disco (abre instantâneo) e no servidor (vale em outra máquina). */
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    try {
      localStorage.setItem(CHAVE, JSON.stringify(ap));
    } catch {
      /* best-effort */
    }
    const t = setTimeout(() => void patchUiSettings({ legendasFlutuantes: ap }), 600);
    return () => clearTimeout(t);
  }, [ap]);

  /* Reidrata do servidor uma vez, se este navegador ainda não tem a sua. */
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        if (localStorage.getItem(CHAVE)) return;
        const s = await fetchSettings();
        const ui = s?.ui ? JSON.parse(s.ui) : null;
        const remoto = ui && typeof ui === 'object' ? (ui as Record<string, unknown>).legendasFlutuantes : null;
        if (!cancelado && remoto) setAp(normalizar(remoto));
      } catch {
        /* sem rede: fica o local */
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const mudar = (patch: Partial<Aparencia>) => setAp((a) => ({ ...a, ...patch }));

  const aplicarPreset = (p: Preset) => {
    if (p === 'meu') {
      let meu: Aparencia | null;
      try {
        const raw = localStorage.getItem(CHAVE_MEU);
        meu = raw ? normalizar(JSON.parse(raw)) : null;
      } catch {
        meu = null;
      }
      if (!meu) {
        toast.info('Você ainda não salvou um “Meu perfil”: ajuste e use “Salvar como Meu perfil”.');
        return;
      }
      setAp({ ...meu, preset: 'meu' });
      return;
    }
    const [modo, traducao, tam] = PRESETS[p];
    mudar({ preset: p, modo, traducao, tam });
  };

  const salvarMeu = () => {
    try {
      localStorage.setItem(CHAVE_MEU, JSON.stringify({ ...ap, preset: 'meu' }));
      setAp((a) => ({ ...a, preset: 'meu' }));
      toast.info('Configuração salva como “Meu perfil”');
    } catch {
      toast.info('Não deu para salvar o perfil neste navegador.');
    }
  };

  const resetar = () => mudar({ ...PADRAO });

  const alternarTravado = () => {
    const novo = !travado;
    setTravado(novo);
    toast.info(
      novo ? 'Clique travado: ele passa através da janela. Destrave pelo cadeado.' : 'A janela volta a receber cliques',
    );
  };

  const ult = falasVisiveis(falas, ap.modo, ap.historico);
  const corpo = recolhido ? null : oculto ? (
    <p className="leg-vazio">Legenda escondida</p>
  ) : !ult.length ? (
    <p className="leg-vazio">
      <AudioLines aria-hidden /> Esperando a primeira fala
    </p>
  ) : (
    ult.map((x) => (
      <div key={x.id} className={`leg-fala ${ap.modo === 'conversa' ? (x.lado === 'eles' ? 'eles' : 'eles b') : ''}`}>
        {ap.modo === 'conversa' && <span className="leg-quem">{x.quem}</span>}
        <span className="leg-o">
          {pedacosDaLegenda(x.original, aprendidas).map((p, i) =>
            p.aprendida ? (
              <span key={i} data-aprendida>
                {p.texto}
              </span>
            ) : (
              p.texto
            ),
          )}
        </span>
        {ap.traducao !== 'oculta' && x.traducao && <span className={`leg-t ${ap.traducao}`}>{x.traducao}</span>}
      </div>
    ))
  );

  const estilo = {
    '--leg-tam': ap.tam / 100,
    '--leg-cor': ap.cores.legenda,
    '--leg-trad': ap.cores.traducao,
    /* Na janela sempre-no-topo, a caixa É a janela: ocupa tudo e rola se o painel não couber. */
    ...(emJanela
      ? {
          position: 'static',
          width: '100%',
          height: '100vh',
          borderRadius: 0,
          boxShadow: 'none',
          overflowY: 'auto',
        }
      : {}),
  } as CSSProperties;

  return (
    <div
      id="leg-flut"
      role="region"
      aria-label="Legendas flutuantes"
      className={`leg-flut modo-${ap.modo} ${classesDoEstiloEquipado} ${travado ? 'travado' : ''} ${recolhido ? 'recolhido' : ''}`}
      style={estilo}
    >
      <div className="leg-barra">
        <span className="leg-tit">
          <PictureInPicture2 aria-hidden /> Legendas
        </span>
        {/* Deixar o clique passar só existe dentro do app: uma janela sempre-no-topo do navegador
            sempre recebe o clique (limitação da plataforma), então lá o cadeado não aparece. */}
        {!emJanela && (
          <button
            type="button"
            aria-pressed={travado}
            aria-label={travado ? 'Destravar o clique' : 'Deixar o clique passar pela janela'}
            title="Travar o clique"
            onClick={alternarTravado}
          >
            {travado ? <Lock aria-hidden /> : <MousePointerClick aria-hidden />}
          </button>
        )}
        <select aria-label="Modo da janela" value={ap.modo} onChange={(e) => mudar({ modo: e.target.value as Modo })}>
          <option value="video">Modo vídeo</option>
          <option value="conversa">Conversa</option>
          <option value="jogo">Jogo</option>
        </select>
        <button
          type="button"
          aria-pressed={painel}
          aria-label="Personalizar"
          title="Personalizar"
          onClick={() => setPainel((v) => !v)}
        >
          <Palette aria-hidden />
        </button>
        <button
          type="button"
          aria-pressed={oculto}
          aria-label={oculto ? 'Mostrar a legenda' : 'Esconder a legenda'}
          title="Esconder"
          onClick={() => setOculto((v) => !v)}
        >
          {oculto ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
        </button>
        <button
          type="button"
          aria-pressed={recolhido}
          aria-label={recolhido ? 'Expandir' : 'Recolher'}
          title="Recolher"
          onClick={() => setRecolhido((v) => !v)}
        >
          {recolhido ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
        </button>
        <button type="button" aria-label="Fechar as legendas flutuantes" title="Fechar" onClick={aoFechar}>
          <X aria-hidden />
        </button>
      </div>
      {corpo && (
        <div className="leg-corpo" aria-live="polite" style={travado ? { pointerEvents: 'none' } : undefined}>
          {corpo}
        </div>
      )}
      {painel && !recolhido && (
        <div className="leg-painel">
          <div className="entre">
            <b>Personalização</b>
            <button type="button" className="link" onClick={resetar}>
              Resetar tudo
            </button>
          </div>
          <span className="label-mono">Predefinições</span>
          <div className="chips">
            {(
              [
                ['filme', 'Filme'],
                ['conversa', 'Conversa'],
                ['jogo', 'Jogo'],
                ['imersao', 'Imersão'],
                ['meu', 'Meu perfil'],
              ] as Array<[Preset, string]>
            ).map(([v, r]) => (
              <button
                key={v}
                type="button"
                className="pill"
                aria-pressed={ap.preset === v}
                onClick={() => aplicarPreset(v)}
              >
                {r}
              </button>
            ))}
          </div>
          <span className="label-mono">Tradução</span>
          <Segmentos<Traducao>
            rotulo="Tradução"
            atual={ap.traducao}
            opcoes={[
              ['sempre', 'Sempre visível'],
              ['discreta', 'Discreta'],
              ['oculta', 'Imersão'],
            ]}
            aoTrocar={(traducao) => mudar({ traducao })}
          />
          <label>
            <span className="label-mono">Tamanho · {ap.tam}%</span>
            <input
              type="range"
              min={70}
              max={160}
              step={10}
              value={ap.tam}
              aria-label="Tamanho da legenda"
              className="trilho"
              style={{ '--p': `${((ap.tam - 70) / 90) * 100}%` } as CSSProperties}
              onChange={(e) => mudar({ tam: +e.target.value })}
            />
          </label>
          <div className="entre">
            <span>Histórico no modo vídeo</span>
            <Interruptor
              ligado={ap.historico}
              rotulo="Histórico no modo vídeo"
              aoTrocar={() => mudar({ historico: !ap.historico })}
            />
          </div>
          <div className="linha" style={{ gap: 10, flexWrap: 'wrap' }}>
            {(
              [
                ['legenda', 'Legenda'],
                ['traducao', 'Tradução'],
              ] as Array<[keyof Aparencia['cores'], string]>
            ).map(([k, r]) => (
              <label key={k} className="cor">
                <input
                  type="color"
                  value={ap.cores[k]}
                  aria-label={`Cor da ${r.toLowerCase()}`}
                  onChange={(e) => mudar({ cores: { ...ap.cores, [k]: e.target.value } })}
                />
                {r}
              </label>
            ))}
          </div>
          <button type="button" className="link" onClick={salvarMeu}>
            Salvar como “Meu perfil”
          </button>
        </div>
      )}
    </div>
  );
}
