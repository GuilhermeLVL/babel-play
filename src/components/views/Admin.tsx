import '../../styles/admin.css';

import { CreditCard, Flag, Gauge, type LucideIcon, ShieldCheck, TriangleAlert, Users } from 'lucide-react';
import { Suspense, useCallback, useState } from 'react';

import { useEhAdmin } from '../../lib/adminAcesso';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../lib/i18n';
import { lazyComRecarga } from '../../lib/lazyComRecarga';
import { usePerfil } from '../../lib/usePerfil';
import { Abas, CabecalhoDeTela, Tela } from '../ui';
import PainelCobranca from './admin/PainelCobranca';
import PainelContas from './admin/PainelContas';
import PainelErros from './admin/PainelErros';
import PainelFlags from './admin/PainelFlags';
import PainelResumo from './admin/PainelResumo';
import { Aviso, Botao } from './admin/pecas';
import AbasDoQuest from './ajustes/quest/AbasDoQuest';
import NaoEncontrado from './NaoEncontrado';

// O desafio do segundo fator é o MESMO da entrada (login): reaproveitado, não reescrito.
const DesafioSegundoFator = lazyComRecarga(() => import('../auth/DesafioSegundoFator'));

type IdDaAba = 'resumo' | 'contas' | 'cobranca' | 'erros' | 'flags';

/**
 * ADMINISTRAÇÃO (`/admin`) — a tela mínima do dono para operar o serviço depois do lançamento pago.
 *
 * Só quem tem papel admin a vê (o item de menu some para os outros, e `/admin` sem papel cai no
 * "Página não encontrada"). Isso é conforto: QUEM DECIDE É O SERVIDOR, que recusa com 403 toda rota
 * de administração de quem não é admin e, com 2FA ativo, de sessão que não é `aal2`. Nesse segundo
 * caso a tela pede o código (o mesmo desafio do login) e recarrega tudo.
 *
 * Uma lógica, dois desenhos: o de sempre (`ui/`) e o do headset/desenho novo (`.q-*`) só diferem na
 * apresentação (`admin/pecas.tsx`). Nenhum dado de outra conta é guardado fora da memória da tela.
 */
export default function Admin({
  onChangeView,
  onBuscar,
}: {
  onChangeView: (view: string) => void;
  onBuscar: () => void;
}) {
  const { carregando } = usePerfil();
  const ehAdmin = useEhAdmin();
  const questNovo = useQuestNovo();
  const [aba, setAba] = useState<IdDaAba>('resumo');
  const [codigo, setCodigo] = useState<'nao' | 'pedido' | 'digitando'>('nao');
  /** Sobe depois do código aceito: cada painel remonta e busca de novo, agora com a sessão `aal2`. */
  const [rodada, setRodada] = useState(0);

  const aoPedirCodigo = useCallback(() => setCodigo((c) => (c === 'digitando' ? c : 'pedido')), []);

  if (carregando)
    return (
      <div className={questNovo ? 'q-carregando' : 'carregando-da-tela'} role="status">
        {t('Carregando…')}
      </div>
    );
  if (!ehAdmin) return <NaoEncontrado onChangeView={onChangeView} onBuscar={onBuscar} />;

  if (codigo === 'digitando')
    return (
      <Suspense fallback={<div role="status">{t('Carregando…')}</div>}>
        <DesafioSegundoFator
          onConcluido={() => {
            setCodigo('nao');
            setRodada((n) => n + 1);
          }}
        />
      </Suspense>
    );

  const definicao: Array<{ id: IdDaAba; rotulo: string; Icone: LucideIcon }> = [
    { id: 'resumo', rotulo: t('Resumo'), Icone: Gauge },
    { id: 'contas', rotulo: t('Contas'), Icone: Users },
    { id: 'cobranca', rotulo: t('Cobrança'), Icone: CreditCard },
    { id: 'erros', rotulo: t('Erros'), Icone: TriangleAlert },
    { id: 'flags', rotulo: t('Flags'), Icone: Flag },
  ];
  const abasDoQuest = definicao.map(({ id, rotulo, Icone }) => ({ id, rotulo, icone: <Icone aria-hidden /> }));
  const abasDeSempre = definicao.map(({ id, rotulo, Icone }) => ({
    id,
    rotulo,
    icone: <Icone className="w-4 h-4" aria-hidden />,
  }));

  const painel =
    codigo === 'pedido' ? (
      <Aviso
        icone={<ShieldCheck aria-hidden />}
        titulo={t('Confirme o código da verificação em duas etapas')}
        explicacao={t(
          'A administração só abre com o segundo fator confirmado nesta sessão. Digite o código de 6 dígitos do seu app autenticador. Ainda não ativou? Em Ajustes, na aba Conta, ligue a verificação em duas etapas.',
        )}
        acao={{ rotulo: t('Digitar o código'), aoClicar: () => setCodigo('digitando') }}
      />
    ) : (
      <div key={rodada}>
        {aba === 'resumo' && <PainelResumo aoPedirCodigo={aoPedirCodigo} />}
        {aba === 'contas' && <PainelContas aoPedirCodigo={aoPedirCodigo} />}
        {aba === 'cobranca' && <PainelCobranca aoPedirCodigo={aoPedirCodigo} />}
        {aba === 'erros' && <PainelErros aoPedirCodigo={aoPedirCodigo} />}
        {aba === 'flags' && <PainelFlags aoPedirCodigo={aoPedirCodigo} />}
      </div>
    );

  const corpo = (
    <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`}>
      {painel}
    </div>
  );

  if (questNovo)
    return (
      <div className="q-palco q-admin" data-testid="admin-do-quest">
        <header className="q-cab">
          <div>
            <p className="q-sobre">{t('Dono do serviço')}</p>
            <h1>{t('Administração')}</h1>
          </div>
          <Botao aoClicar={() => setRodada((n) => n + 1)}>{t('Atualizar tudo')}</Botao>
        </header>
        <AbasDoQuest
          itens={abasDoQuest}
          ativo={aba}
          aoTrocar={(id) => setAba(id as IdDaAba)}
          rotuloDoGrupo={t('Partes da administração')}
        />
        {corpo}
      </div>
    );

  return (
    <Tela largura="larga">
      <CabecalhoDeTela
        sobrancelha={t('Dono do serviço')}
        icone={ShieldCheck}
        titulo={t('Administração')}
        sub={t('Operação do Babel Play. Cada ação pede confirmação, e o servidor confere o seu papel.')}
        acoes={<Botao aoClicar={() => setRodada((n) => n + 1)}>{t('Atualizar tudo')}</Botao>}
        abas={
          <Abas
            itens={abasDeSempre}
            ativo={aba}
            aoTrocar={(id) => setAba(id as IdDaAba)}
            rotuloDoGrupo={t('Partes da administração')}
          />
        }
      />
      {corpo}
    </Tela>
  );
}
