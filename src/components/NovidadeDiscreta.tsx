/**
 * A NOVIDADE DISCRETA — o cartão pequeno, no canto, para a recompensa que NÃO tem peça a equipar
 * (dono, 22/10/2026: "notificações mais limpas e discretas"). Conquista sem exclusivo, nível sem item
 * novo, maestria sem peça e baú repetido entravam um a um no modal de resgate, com confete e
 * "Resgatar e continuar" — dez diálogos seguidos ao abrir o app num navegador novo. Aqui o lote inteiro
 * vira UM cartão: o que chegou, os Seeds e o XP somados, "Ver" para a tela certa, e some sozinho.
 *
 * O modal (`RecompensaDesbloqueada`) continua para o que tem peça a equipar — foi por isso que ele
 * nasceu (Personalizar v3, 28/08/2026) — e a central de Avisos já guarda conquistas e níveis
 * (`useNotificacoes.ts`): fechar o cartão não perde nada.
 *
 * Nada de som nem festa: a discrição é o ponto. `role="status"`: o leitor de tela anuncia sem roubar o foco.
 */
import '../styles/novidadeDiscreta.css';

import { rotuloDaMaestria } from '@core';
import { Award, Gift, Sprout, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { marcarVista, type Recompensa } from '../lib/filaDeRecompensas';
import { t } from '../lib/i18n';
import { iconeDaConquista } from './iconesDaConquista';

/** Quanto o cartão fica (ms) antes de sair sozinho; o mouse em cima segura. */
export const DURACAO_DA_NOVIDADE_MS = 6000;

/** A recompensa precisa do modal (há peça a equipar) ou cabe no cartão discreto? Pura. */
export function precisaDeModal(r: Recompensa): boolean {
  if (r.tipo === 'nivel' || r.tipo === 'maestria') return r.itens.length > 0;
  return !!r.item;
}

/** Tudo o que está na fila e cabe num cartão só (o que não pede modal), na ordem da fila. */
export function loteDiscreto(fila: readonly Recompensa[]): Recompensa[] {
  return fila.filter((r) => !precisaDeModal(r));
}

function tituloDe(r: Recompensa): string {
  switch (r.tipo) {
    case 'nivel':
      return t('Nível {n}!', { n: r.nivel });
    case 'conquista':
      return r.nome;
    case 'maestria':
      return rotuloDaMaestria(r.jogo, r.nivel);
    default:
      return t('Peça repetida');
  }
}

export default function NovidadeDiscreta({
  novidades,
  onFechar,
  onVer,
}: {
  novidades: Recompensa[];
  /** Tira a recompensa da fila (já marcada como vista aqui). Chamada uma vez por item do lote. */
  onFechar: (r: Recompensa) => void;
  /** "Ver": a tela certa (Desafios para conquista; Personalizar para o resto). */
  onVer: (destino: 'conquistas' | 'personalizar') => void;
}) {
  const [segurado, setSegurado] = useState(false);
  const fechado = useRef(false);
  const seeds = novidades.reduce((s, r) => s + (r.tipo === 'nivel' ? 0 : r.seeds), 0);
  const xp = novidades.reduce((s, r) => s + (r.tipo === 'conquista' ? r.xp : 0), 0);
  const conquistas = novidades.filter((r) => r.tipo === 'conquista').length;
  const primeira = novidades[0];
  const Icone =
    primeira?.tipo === 'conquista' ? iconeDaConquista(primeira.id) : primeira?.tipo === 'drop' ? Gift : Award;

  const fechar = () => {
    if (fechado.current) return;
    fechado.current = true;
    for (const r of novidades) {
      marcarVista(r);
      onFechar(r);
    }
  };

  useEffect(() => {
    if (segurado) return;
    const id = setTimeout(fechar, DURACAO_DA_NOVIDADE_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o relógio reinicia só quando o mouse solta
  }, [segurado]);

  if (!primeira) return null;
  const titulo = novidades.length === 1 ? tituloDe(primeira) : t('{n} novidades', { n: novidades.length });
  const partes: string[] = [];
  if (conquistas > 0 && novidades.length > 1)
    partes.push(conquistas === 1 ? t('1 conquista') : t('{n} conquistas', { n: conquistas }));
  if (seeds > 0) partes.push(`+${seeds} Seeds`);
  if (xp > 0) partes.push(`+${xp} XP`);
  const destino: 'conquistas' | 'personalizar' = conquistas > 0 ? 'conquistas' : 'personalizar';

  return (
    <div
      className="novidade-discreta"
      role="status"
      aria-live="polite"
      data-testid="novidade-discreta"
      data-novidades={novidades.length}
      onMouseEnter={() => setSegurado(true)}
      onMouseLeave={() => setSegurado(false)}
    >
      <span className="novidade-icone" aria-hidden>
        <Icone />
      </span>
      <span className="novidade-texto">
        <b>{titulo}</b>
        {partes.length > 0 && (
          <small>
            {seeds > 0 && <Sprout aria-hidden />}
            {partes.join(' · ')}
          </small>
        )}
      </span>
      <button
        type="button"
        className="btn btn-outline peq"
        onClick={() => {
          fechar();
          onVer(destino);
        }}
      >
        {t('Ver')}
      </button>
      <button type="button" className="novidade-fechar" aria-label={t('Fechar')} onClick={fechar}>
        <X aria-hidden />
      </button>
    </div>
  );
}
