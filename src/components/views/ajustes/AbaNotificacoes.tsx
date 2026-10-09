import type { LucideIcon } from 'lucide-react';
import { Award, Eye, Megaphone, Receipt, Target } from 'lucide-react';
import { useState } from 'react';

import { t } from '../../../lib/i18n';
import {
  type Canal,
  type Preferencias,
  salvarPreferencias,
  type TipoDeAviso,
  usePreferencias,
} from '../../../lib/preferencias';
import { usePerfil } from '../../../lib/usePerfil';
import { toast } from '../../Toast';
import RelatorioSemanal from './RelatorioSemanal';

/**
 * AJUSTES → NOTIFICAÇÕES, a aba do protótipo aprovado (override de `T.ajustes`, 4012-4027):
 * lembrete diário, a tabela "o que avisar e por onde", horário silencioso e o resumo semanal.
 *
 * Tudo aqui é PREFERÊNCIA e é guardado de verdade (`lib/preferencias` → `settings.ui`). O "Ver
 * exemplo" abre o resumo da semana montado com os dados reais.
 */

const TIPOS: Array<[TipoDeAviso, string, LucideIcon]> = [
  ['revisao', t('Revisão pendente'), Target],
  ['conquista', t('Conquistas e níveis'), Award],
  ['fatura', t('Pagamentos e recibos'), Receipt],
  ['novidades', t('Novidades do app'), Megaphone],
];
const CANAIS: Array<[Canal, string, string]> = [
  ['app', t('No app'), 'no app'],
  ['email', t('E-mail'), 'por e-mail'],
  ['push', t('Push'), 'por push'],
];
const HORAS_DO_LEMBRETE = ['07:00', '08:00', '12:00', '18:00', '19:00', '20:00', '21:00'];

async function salvar(mudar: (p: Preferencias) => Preferencias, aviso?: string) {
  const ok = await salvarPreferencias(mudar);
  if (!ok) toast.warn('Não consegui salvar a preferência. Verifique a conexão e tente de novo.');
  else if (aviso) toast.ok(aviso);
}

export default function AbaNotificacoes() {
  const p = usePreferencias();
  const { perfil } = usePerfil();
  const [exemplo, setExemplo] = useState(false);

  /* QUEST: as mesmas quatro seções, uma decisão por linha. A matriz tipo × canal continua uma tabela:
     é assim que se lê "o que" contra "por onde". */
  const liga = (ligado: boolean, rotulo: string, aoTrocar: (on: boolean) => void) => (
    <button
      type="button"
      className="q-interruptor"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => aoTrocar(!ligado)}
    />
  );
  const hora = (valor: string, opcoes: string[], rotulo: string, aoMudar: (v: string) => void) => (
    <select className="q-campo q-aju-hora" aria-label={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value)}>
      {opcoes.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <section className="q-secao">
        <header>
          <div>
            <h2>{t('Lembrete diário')}</h2>
            <p>{t('Um aviso por dia, no horário que você escolher, se ainda não estudou.')}</p>
          </div>
        </header>
        <div className="q-ajustes">
          <div className="q-ajuste">
            <div>
              <b>{t('Lembrar de estudar')}</b>
              <small>
                {t('Só avisa se a meta de {min} minutos do dia ainda não foi cumprida.', { min: p.metaMin })}
              </small>
            </div>
            {liga(
              p.lembrete.on,
              t('Lembrete diário'),
              (on) => void salvar((x) => ({ ...x, lembrete: { ...x.lembrete, on } })),
            )}
          </div>
          {p.lembrete.on && (
            <div className="q-ajuste">
              <div>
                <b>{t('Horário')}</b>
                <small>{t('No fuso do seu aparelho.')}</small>
              </div>
              {hora(
                p.lembrete.hora,
                HORAS_DO_LEMBRETE,
                t('Horário do lembrete'),
                (h) => void salvar((x) => ({ ...x, lembrete: { ...x.lembrete, hora: h } }), t('Preferência salva')),
              )}
            </div>
          )}
        </div>
      </section>

      <section className="q-secao">
        <header>
          <div>
            <h2>{t('O que avisar e por onde')}</h2>
            <p>{t('Recibos e avisos de segurança chegam por e-mail mesmo com o resto desligado.')}</p>
          </div>
        </header>
        <div className="q-tabela-caixa">
          <table className="q-tabela q-aju-matriz" aria-label={t('Preferências de notificação')}>
            <thead>
              <tr>
                <th scope="col">{t('Tipo')}</th>
                {CANAIS.map(([c, r]) => (
                  <th key={c} scope="col">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIPOS.map(([k, r, Icone]) => (
                <tr key={k}>
                  <th scope="row">
                    <span>
                      <Icone aria-hidden />
                      {r}
                    </span>
                  </th>
                  {CANAIS.map(([c, , por]) => (
                    <td key={c}>
                      {liga(
                        p.avisos[k][c],
                        `${r} ${por}`,
                        (on) =>
                          void salvar((x) => ({ ...x, avisos: { ...x.avisos, [k]: { ...x.avisos[k], [c]: on } } })),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="q-secao">
        <header>
          <div>
            <h2>{t('Horário silencioso')}</h2>
          </div>
        </header>
        <div className="q-ajustes">
          <div className="q-ajuste">
            <div>
              <b>{t('Não avisar à noite')}</b>
              <small>{t('Nada de push nesse intervalo; o que chegar espera na central.')}</small>
            </div>
            {liga(
              p.silencio.on,
              t('Horário silencioso'),
              (on) => void salvar((x) => ({ ...x, silencio: { ...x.silencio, on } })),
            )}
          </div>
          {p.silencio.on && (
            <div className="q-ajuste">
              <div>
                <b>{t('Intervalo')}</b>
                <small>{t('Do começo ao fim do silêncio, no fuso do seu aparelho.')}</small>
              </div>
              <div className="q-acoes">
                {hora(
                  p.silencio.de,
                  ['21:00', '22:00', '23:00'],
                  t('Início'),
                  (de) => void salvar((x) => ({ ...x, silencio: { ...x.silencio, de } }), t('Preferência salva')),
                )}
                <span className="q-aju-nota">{t('até')}</span>
                {hora(
                  p.silencio.ate,
                  ['06:00', '07:00', '08:00', '09:00'],
                  t('Fim'),
                  (ate) => void salvar((x) => ({ ...x, silencio: { ...x.silencio, ate } }), t('Preferência salva')),
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="q-secao">
        <header>
          <div>
            <h2>{t('Resumo semanal por e-mail')}</h2>
          </div>
        </header>
        <div className="q-ajustes">
          <div className="q-ajuste">
            <div>
              <b>{t('Receber o resumo')}</b>
              <small>{t('Minutos, palavras novas, ofensiva e o que revisar na semana.')}</small>
            </div>
            {liga(
              p.semanal.on,
              t('Resumo semanal'),
              (on) => void salvar((x) => ({ ...x, semanal: { ...x.semanal, on } })),
            )}
          </div>
          {p.semanal.on && (
            <div className="q-ajuste">
              <div>
                <b>{t('Dia')}</b>
                <small>{t('O dia em que o resumo chega.')}</small>
              </div>
              <div className="q-abas q-seg" role="group" aria-label={t('Dia do resumo')}>
                {(['domingo', 'segunda'] as const).map((dia) => (
                  <button
                    key={dia}
                    type="button"
                    className="q-aba"
                    aria-pressed={p.semanal.dia === dia}
                    onClick={() =>
                      void salvar((x) => ({ ...x, semanal: { ...x.semanal, dia } }), t('Preferência salva'))
                    }
                  >
                    {dia === 'domingo' ? t('Domingo') : t('Segunda')}
                  </button>
                ))}
              </div>
              <button type="button" className="q-ctl" onClick={() => setExemplo(true)}>
                <Eye aria-hidden /> {t('Ver exemplo')}
              </button>
            </div>
          )}
        </div>
      </section>

      {exemplo && <RelatorioSemanal nome={perfil?.displayName ?? ''} aoFechar={() => setExemplo(false)} />}
    </>
  );
}
