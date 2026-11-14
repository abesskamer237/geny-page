import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Box,
  Check,
  Code,
  Copy,
  Globe,
  History,
  Key,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Sun,
  Tag,
  Trash2,
  Wallet,
  Webhook,
  X,
  Play,
} from 'lucide-react';
import type { Lang, PartnerData, ResellerTenantView, ThemeMode } from '../types/geny';
import { GenyLogoMark, MtnLogo, OrangeLogo, formatMoney, formatTimestamp } from './Icons';

interface ApiSpaceProps {
  lang: Lang;
  theme: ThemeMode;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onBackToSale: () => void;
  onLoggedOut: () => void;
}

type ApiPageId =
  | 'overview'
  | 'keys'
  | 'webhook'
  | 'prices'
  | 'payout'
  | 'topup'
  | 'orders'
  | 'ledger'
  | 'tenants'
  | 'integration'
  | 'settings';

const VALID_PAGES: ApiPageId[] = [
  'overview',
  'keys',
  'webhook',
  'prices',
  'payout',
  'topup',
  'orders',
  'ledger',
  'tenants',
  'integration',
  'settings',
];

function getPageFromHash(): ApiPageId {
  const m = window.location.hash.match(/^#\/([a-z0-9_-]+)/i);
  if (m && VALID_PAGES.includes(m[1] as ApiPageId)) {
    return m[1] as ApiPageId;
  }
  return 'overview';
}

export function ApiSpace({
  lang,
  theme,
  onToggleLang,
  onToggleTheme,
  onBackToSale,
  onLoggedOut,
}: ApiSpaceProps) {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);

  const [page, setPageState] = useState<ApiPageId>(() => getPageFromHash());

  function setPage(next: ApiPageId) {
    setPageState(next);
    const nextHash = `#/${next}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', `/espace-api${nextHash}`);
    }
  }
  const [envMode, setEnvMode] = useState<'live' | 'test'>('live');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [data, setData] = useState<PartnerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Key creation state
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);

  // Prices state
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);

  // Topup state
  const [topupAmount, setTopupAmount] = useState('5000');
  const [topupOp, setTopupOp] = useState<'mtn' | 'orange'>('mtn');
  const [topupPhone, setTopupPhone] = useState('');
  const [submittingTopup, setSubmittingTopup] = useState(false);

  // Payout state
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutOp, setPayoutOp] = useState<'mtn' | 'orange'>('mtn');
  const [payoutPhone, setPayoutPhone] = useState('');
  const [submittingPayout, setSubmittingPayout] = useState(false);

  // Settings state
  const [ipText, setIpText] = useState('');
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState('2000');
  const [savingSettings, setSavingSettings] = useState(false);

  // Integration simulator state
  const [simPlanId, setSimPlanId] = useState('');
  const [simMode, setSimMode] = useState<'wallet' | 'direct'>('wallet');
  const [simResult, setSimResult] = useState<string | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [codeSnippetTab, setCodeSnippetTab] = useState<'curl' | 'node' | 'php' | 'python'>('curl');

  // Multi-domain reseller tenants state
  const [tenants, setTenants] = useState<ResellerTenantView[]>([]);
  const [tenantDomain, setTenantDomain] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantApiKey, setTenantApiKey] = useState('');
  const [tenantWebhookSecret, setTenantWebhookSecret] = useState('');
  const [savingTenant, setSavingTenant] = useState(false);
  const [testingTenantId, setTestingTenantId] = useState<string | null>(null);
  const [tenantTestResults, setTenantTestResults] = useState<Record<string, string>>({});

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }

  async function fetchTenants() {
    try {
      const res = await fetch('/api/v1/portal/tenants', { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const json = await res.json();
        setTenants(json.tenants || []);
      }
    } catch {
      // ignore
    }
  }

  async function fetchPartner() {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/portal/api', { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const json = (await res.json()) as PartnerData;
        setData(json);
        const wh = json.account.webhooks[envMode];
        setWebhookUrl(wh?.url || '');
        const priceDraft: Record<string, string> = {};
        for (const p of json.account.prices) {
          priceDraft[p.plan_id] = String(p.effective);
        }
        setDraftPrices(priceDraft);
        setIpText(json.account.ip_allowlist.join('\n'));
        setLowBalanceThreshold(String(json.account.limits.low_balance));
        if (!simPlanId && json.account.prices.length > 0) {
          setSimPlanId(json.account.prices[0].plan_id);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPartner();
    fetchTenants();
    if (!window.location.hash) {
      window.history.replaceState(null, '', '/espace-api#/overview');
    }
    const onHashChange = () => setPageState(getPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (data) {
      setWebhookUrl(data.account.webhooks[envMode]?.url || '');
    }
  }, [envMode, data]);

  async function handleCreateKey() {
    setCreatingKey(true);
    try {
      const res = await fetch('/api/v1/portal/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ livemode: envMode === 'live' }),
      });
      const json = await res.json();
      if (res.ok) {
        setNewKeySecret(json.secret);
        await fetchPartner();
        showToast(t('Nouvelle clé API créée.', 'New API key created.'));
      }
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleRevokeKey(id: string) {
    const res = await fetch(`/api/v1/portal/api/keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await fetchPartner();
      showToast(t('Clé révoquée.', 'Key revoked.'));
    }
  }

  async function handleSaveWebhook(rotateSecret = false) {
    setSavingWebhook(true);
    try {
      const res = await fetch('/api/v1/portal/api/webhook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          livemode: envMode === 'live',
          url: webhookUrl,
          rotate_secret: rotateSecret,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || t('Erreur webhook', 'Webhook error'));
        return;
      }
      await fetchPartner();
      showToast(t('Webhook enregistré.', 'Webhook saved.'));
    } finally {
      setSavingWebhook(false);
    }
  }

  async function handleTestWebhook() {
    const res = await fetch('/api/v1/portal/api/webhook/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ livemode: envMode === 'live' }),
    });
    const json = await res.json();
    if (res.ok) {
      await fetchPartner();
      showToast(t('Événement test envoyé (HTTP 200).', 'Test event delivered (HTTP 200).'));
    } else {
      showToast(json.error || t('Échec du test webhook.', 'Webhook test failed.'));
    }
  }

  async function handleSavePrices() {
    if (!data) return;
    setSavingPrices(true);
    try {
      const payload: Record<string, number> = {};
      for (const p of data.account.prices) {
        const val = Number(draftPrices[p.plan_id] ?? p.effective);
        payload[p.plan_id] = val;
      }
      const res = await fetch('/api/v1/portal/api/prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices: payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || t('Prix invalide.', 'Invalid price.'));
        return;
      }
      setData(json);
      showToast(t('Tarifs client mis à jour.', 'Customer prices updated.'));
    } finally {
      setSavingPrices(false);
    }
  }

  async function handleTopup(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingTopup(true);
    try {
      const res = await fetch('/api/v1/portal/api/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_fcfa: Number(topupAmount),
          operator: topupOp,
          phone: topupPhone,
          livemode: envMode === 'live',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || t('Échec de la recharge.', 'Top-up failed.'));
        return;
      }
      setTopupPhone('');
      await fetchPartner();
      showToast(t('Solde prépayé crédité avec succès !', 'Prepaid balance credited!'));
    } finally {
      setSubmittingTopup(false);
    }
  }

  async function handlePayout(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingPayout(true);
    try {
      const res = await fetch('/api/v1/portal/api/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_fcfa: Number(payoutAmount),
          operator: payoutOp,
          phone: payoutPhone,
          livemode: envMode === 'live',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || t('Échec du retrait.', 'Payout failed.'));
        return;
      }
      setPayoutAmount('');
      setPayoutPhone('');
      await fetchPartner();
      showToast(t(`Versement envoyé (${formatMoney(json.net_fcfa, lang)} nets).`, `Payout sent (${formatMoney(json.net_fcfa, lang)} net).`));
    } finally {
      setSubmittingPayout(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const ips = ipText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch('/api/v1/portal/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip_allowlist: ips,
          low_balance: Number(lowBalanceThreshold) || 0,
        }),
      });
      if (res.ok) {
        await fetchPartner();
        showToast(t('Paramètres enregistrés.', 'Settings saved.'));
      }
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSimulateOrder() {
    if (!simPlanId) return;
    setSimRunning(true);
    setSimResult(null);
    try {
      const res = await fetch('/api/v1/portal/api/orders/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: simPlanId,
          mode: simMode,
          livemode: envMode === 'live',
        }),
      });
      const json = await res.json();
      setSimResult(JSON.stringify(json, null, 2));
      if (res.ok) {
        await fetchPartner();
        showToast(t('Commande exécutée et code généré.', 'Order executed and code issued.'));
      }
    } finally {
      setSimRunning(false);
    }
  }

  const navGroups: Array<{
    group: string;
    items: Array<{ id: ApiPageId; label: string; icon: React.ReactNode }>;
  }> = [
    {
      group: '',
      items: [{ id: 'overview', label: t('Vue d’ensemble', 'Overview'), icon: <LayoutGrid className="w-4 h-4" /> }],
    },
    {
      group: t('Configuration', 'Setup'),
      items: [
        { id: 'keys', label: t('Clés d’API', 'API keys'), icon: <Key className="w-4 h-4" /> },
        { id: 'webhook', label: 'Webhook', icon: <Webhook className="w-4 h-4" /> },
        { id: 'prices', label: t('Prix', 'Prices'), icon: <Tag className="w-4 h-4" /> },
      ],
    },
    {
      group: t('Activité', 'Activity'),
      items: [
        { id: 'payout', label: t('Retirer mes gains', 'Withdraw earnings'), icon: <Send className="w-4 h-4" /> },
        { id: 'topup', label: t('Recharger le solde', 'Top up balance'), icon: <Wallet className="w-4 h-4" /> },
        { id: 'orders', label: t('Commandes', 'Orders'), icon: <Box className="w-4 h-4" /> },
        { id: 'ledger', label: t('Relevé', 'Statement'), icon: <History className="w-4 h-4" /> },
      ],
    },
    {
      group: t('Développeurs', 'Developers'),
      items: [
        { id: 'tenants', label: t('Boutiques & Domaines', 'Multi-Domain Shops'), icon: <Globe className="w-4 h-4" /> },
        { id: 'integration', label: t('Intégration', 'Integration'), icon: <Code className="w-4 h-4" /> },
        { id: 'settings', label: t('Paramètres', 'Settings'), icon: <Shield className="w-4 h-4" /> },
      ],
    },
  ];

  const account = data?.account;
  const balances = account?.balances[envMode] || { wallet: 0, earnings: 0 };
  const envKeys = (account?.keys || []).filter((k) => k.livemode === (envMode === 'live'));
  const envOrders = (account?.orders || []).filter((o) => o.livemode === (envMode === 'live'));
  const envLedger = (account?.ledger || []).filter((l) => l.livemode === (envMode === 'live'));

  const currentNavLabel =
    navGroups.flatMap((g) => g.items).find((i) => i.id === page)?.label || '';

  const baseUrl = data?.base_url || `${window.location.origin}/api/v1/partner`;

  const codeSnippets: Record<'curl' | 'node' | 'php' | 'python', string> = {
    curl: `curl -X POST "${baseUrl}/orders" \\
  -H "Authorization: Bearer ${envMode === 'live' ? 'gk_live_...' : 'gk_test_...'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "plan_id": "${simPlanId || '429e2e860be5b89181aa3443'}",
    "mode": "${simMode}",
    "phone": "677001122",
    "external_ref": "cmd-1042"
  }'`,
    node: `const res = await fetch("${baseUrl}/orders", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${envMode === 'live' ? 'gk_live_...' : 'gk_test_...'}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    plan_id: "${simPlanId || '429e2e860be5b89181aa3443'}",
    mode: "${simMode}",
    phone: "677001122",
    external_ref: "cmd-1042"
  })
});
const order = await res.json();
console.log(order.code);`,
    php: `$ch = curl_init("${baseUrl}/orders");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer ${envMode === 'live' ? 'gk_live_...' : 'gk_test_...'}",
    "Content-Type: application/json"
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "plan_id" => "${simPlanId || '429e2e860be5b89181aa3443'}",
    "mode" => "${simMode}",
    "phone" => "677001122"
  ])
]);
$order = json_decode(curl_exec($ch), true);`,
    python: `import requests

r = requests.post(
    "${baseUrl}/orders",
    headers={"Authorization": "Bearer ${envMode === 'live' ? 'gk_live_...' : 'gk_test_...'}"},
    json={
        "plan_id": "${simPlanId || '429e2e860be5b89181aa3443'}",
        "mode": "${simMode}",
        "phone": "677001122",
    },
)
print(r.json()["code"])`,
  };

  return (
    <div className="min-h-screen flex bg-[#F5F5F9] dark:bg-[#0F0D16] text-[#1B1530] dark:text-[#F3F0FA]">
      {/* Mobile Drawer Backdrop */}
      {mobileNavOpen && (
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label={t('Fermer le menu', 'Close navigation')}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[256px] shrink-0 bg-white dark:bg-[#14121C] border-r border-[#E6E3EF] dark:border-[#2B2638] flex flex-col transition-transform duration-200 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#E6E3EF] dark:border-[#2B2638]">
          <button
            type="button"
            onClick={() => {
              setPage('overview');
              setMobileNavOpen(false);
            }}
            className="flex items-center gap-2.5 text-left cursor-pointer"
          >
            <GenyLogoMark className="w-7 h-7" />
            <div>
              <div className="font-display font-bold text-sm leading-none">Geny</div>
              <div className="text-[11px] font-medium text-[#787290] dark:text-[#A59DBA]">
                {t('Espace API', 'API space')}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Account Summary Box */}
        <div className="m-3 p-3 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#1E1A28] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#6D3FE0] text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
            {(account?.name || 'G').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold truncate">{account?.name || '—'}</div>
            <div className="text-[11px] font-mono text-[#787290] dark:text-[#A59DBA] truncate">
              {account?.id || ''}
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-4">
          {navGroups.map((grp) => (
            <div key={grp.group || 'root'} className="space-y-1">
              {grp.group && (
                <div className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-[#787290] dark:text-[#A59DBA]">
                  {grp.group}
                </div>
              )}
              {grp.items.map((item) => {
                const active = page === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setPage(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#F1EBFF] dark:bg-[#2A2140] text-[#5A2FC8] dark:text-[#C3ADFF]'
                        : 'text-[#4A4460] dark:text-[#CFC8E0] hover:bg-[#F7F6FB] dark:hover:bg-[#1E1A28]'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-[#E6E3EF] dark:border-[#2B2638] space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onToggleTheme}
              className="h-8 rounded-lg border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#1E1A28] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{theme === 'dark' ? t('Clair', 'Light') : t('Sombre', 'Dark')}</span>
            </button>
            <button
              type="button"
              onClick={onToggleLang}
              className="h-8 rounded-lg border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#1E1A28] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang.toUpperCase()}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onBackToSale}
            className="w-full h-9 px-2.5 rounded-lg text-xs font-semibold text-[#4A4460] dark:text-[#CFC8E0] hover:bg-[#F7F6FB] dark:hover:bg-[#1E1A28] flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t('Retour à la vente', 'Back to sale page')}</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await fetch('/api/v1/portal/logout', { method: 'POST' });
              onLoggedOut();
            }}
            className="w-full h-9 px-2.5 rounded-lg text-xs font-semibold text-[#B4334D] dark:text-[#FF9FB2] hover:bg-[#FDEBEF] dark:hover:bg-[#3A1D27] flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t('Se déconnecter', 'Sign out')}</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 bg-white/90 dark:bg-[#14121C]/90 backdrop-blur-md border-b border-[#E6E3EF] dark:border-[#2B2638] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden w-8 h-8 rounded-lg border border-[#E6E3EF] dark:border-[#2B2638] flex items-center justify-center cursor-pointer"
              aria-label={t('Ouvrir le menu', 'Open menu')}
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-[#787290] dark:text-[#A59DBA] truncate">
              <span>{t('Espace API', 'API Space')}</span>
              <span>/</span>
              <span className="font-semibold text-[#1B1530] dark:text-white truncate">{currentNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center p-0.5 rounded-lg bg-[#F5F5F9] dark:bg-[#1E1A28] border border-[#E6E3EF] dark:border-[#2B2638]">
              <button
                type="button"
                onClick={() => setEnvMode('live')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  envMode === 'live'
                    ? 'bg-[#6D3FE0] text-white'
                    : 'text-[#787290] dark:text-[#A59DBA]'
                }`}
              >
                Production
              </button>
              <button
                type="button"
                onClick={() => setEnvMode('test')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  envMode === 'test'
                    ? 'bg-[#946006] text-white'
                    : 'text-[#787290] dark:text-[#A59DBA]'
                }`}
              >
                Test
              </button>
            </div>

            <button
              type="button"
              onClick={fetchPartner}
              className="w-8 h-8 rounded-lg border border-[#E6E3EF] dark:border-[#2B2638] bg-white dark:bg-[#18151F] flex items-center justify-center text-[#6D3FE0] dark:text-[#A786FF] cursor-pointer"
              aria-label={t('Actualiser', 'Refresh')}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          {loading && !data ? (
            <div className="space-y-4">
              <div className="h-28 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] animate-pulse" />
              <div className="h-64 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] animate-pulse" />
            </div>
          ) : (
            <>
              {/* ── PAGE: OVERVIEW ── */}
              {page === 'overview' && account && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h1 className="font-display text-2xl font-bold">{t('Vue d’ensemble', 'Overview')}</h1>
                      <p className="text-sm text-[#787290] dark:text-[#A59DBA] mt-1">
                        {t(
                          'Vos soldes, l’état de votre intégration et vos accès rapides.',
                          'Your balances, integration status, and quick actions.'
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#787290] dark:text-[#A59DBA]">
                      <span className="font-mono font-semibold text-[#1B1530] dark:text-white">{account.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t('Devise', 'Currency')} : {account.balances.currency}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t('Validité des codes', 'Code validity')} : {account.limits.code_days} {t('jours', 'days')}</span>
                    </div>
                  </div>

                  {/* KPI Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638]">
                      <div className="text-xs font-semibold text-[#787290] dark:text-[#A59DBA]">
                        {t('Solde prépayé', 'Prepaid wallet')} ({envMode === 'live' ? 'Production' : 'Test'})
                      </div>
                      <div className="mt-2 font-display text-2xl font-extrabold tabular-nums">
                        {formatMoney(balances.wallet, lang)}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPage('topup')}
                        className="mt-3 text-xs font-bold text-[#6D3FE0] dark:text-[#A786FF] hover:underline cursor-pointer"
                      >
                        {t('Recharger le solde →', 'Top up balance →')}
                      </button>
                    </div>

                    <div className="p-5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638]">
                      <div className="text-xs font-semibold text-[#787290] dark:text-[#A59DBA]">
                        {t('Gains mode direct', 'Direct mode earnings')}
                      </div>
                      <div className="mt-2 font-display text-2xl font-extrabold text-[#17754B] dark:text-[#7FDCAE] tabular-nums">
                        {formatMoney(balances.earnings, lang)}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPage('payout')}
                        className="mt-3 text-xs font-bold text-[#6D3FE0] dark:text-[#A786FF] hover:underline cursor-pointer"
                      >
                        {t('Retirer mes gains →', 'Withdraw earnings →')}
                      </button>
                    </div>

                    <div className="p-5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638]">
                      <div className="text-xs font-semibold text-[#787290] dark:text-[#A59DBA]">
                        {t('Clés d’API actives', 'Active API keys')}
                      </div>
                      <div className="mt-2 font-display text-2xl font-extrabold tabular-nums">
                        {envKeys.length}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPage('keys')}
                        className="mt-3 text-xs font-bold text-[#6D3FE0] dark:text-[#A786FF] hover:underline cursor-pointer"
                      >
                        {t('Gérer les clés →', 'Manage keys →')}
                      </button>
                    </div>

                    <div className="p-5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638]">
                      <div className="text-xs font-semibold text-[#787290] dark:text-[#A59DBA]">
                        {t('Commandes passées', 'Orders placed')}
                      </div>
                      <div className="mt-2 font-display text-2xl font-extrabold tabular-nums">
                        {envOrders.length}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPage('orders')}
                        className="mt-3 text-xs font-bold text-[#6D3FE0] dark:text-[#A786FF] hover:underline cursor-pointer"
                      >
                        {t('Voir les commandes →', 'View orders →')}
                      </button>
                    </div>
                  </div>

                  {/* Quick Start Checklist + Modes */}
                  <div className="p-5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    <div className="space-y-1.5">
                      <h2 className="font-display font-bold text-base">
                        {t('Démarrer votre intégration API', 'Get started with the API')}
                      </h2>
                      <p className="text-xs text-[#4A4460] dark:text-[#CFC8E0] max-w-[60ch] leading-relaxed">
                        {t(
                          '1. Créez une clé API · 2. Ajustez vos prix client · 3. Appelez POST /api/v1/partner/orders depuis votre serveur ou testez dans le simulateur.',
                          '1. Create an API key · 2. Set your customer prices · 3. Call POST /api/v1/partner/orders from your server or test in the simulator.'
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPage('prices')}
                        className="h-9 px-3.5 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] text-xs font-bold hover:border-[#6D3FE0] cursor-pointer"
                      >
                        {t('Définir mes prix', 'Set prices')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage('integration')}
                        className="h-9 px-4 rounded-xl bg-[#6D3FE0] text-white text-xs font-bold hover:brightness-105 cursor-pointer"
                      >
                        {t('Tester l’intégration', 'Test integration')}
                      </button>
                    </div>
                  </div>

                  {/* 2 Modes Comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] space-y-2">
                      <div className="font-display font-bold text-base">
                        {t('Mode Prépayé (Wallet)', 'Prepaid Mode (Wallet)')}
                      </div>
                      <p className="text-xs text-[#4A4460] dark:text-[#CFC8E0] leading-relaxed">
                        {t(
                          'Vous rechargez votre solde par Mobile Money. Chaque appel API génère un code Geny instantanément au tarif revendeur sans attendre le paiement du client.',
                          'Top up your balance via Mobile Money. Each API call issues a Geny code instantly at wholesale rate.'
                        )}
                      </p>
                    </div>
                    <div className="p-5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] space-y-2">
                      <div className="font-display font-bold text-base">
                        {t('Mode Direct (Mobile Money)', 'Direct Mode (Mobile Money)')}
                      </div>
                      <p className="text-xs text-[#4A4460] dark:text-[#CFC8E0] leading-relaxed">
                        {t(
                          'Geny encaisse votre client au prix public personnalisé que vous fixez. Votre marge est créditée automatiquement sur vos gains retirables.',
                          'Geny collects payment from your customer at your custom price. Your margin is automatically credited to withdrawable earnings.'
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── PAGE: API KEYS ── */}
              {page === 'keys' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="font-display text-2xl font-bold">{t('Clés d’API', 'API keys')}</h1>
                      <p className="text-sm text-[#787290] dark:text-[#A59DBA] mt-1">
                        {t(
                          'Authentifiez vos requêtes serveur avec l’en-tête Authorization: Bearer.',
                          'Authenticate your server requests using the Authorization: Bearer header.'
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCreateKey}
                      disabled={creatingKey}
                      className="h-10 px-4 rounded-xl bg-[#6D3FE0] text-white text-xs font-bold inline-flex items-center gap-2 hover:brightness-105 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>
                        {creatingKey
                          ? t('Création…', 'Creating…')
                          : t(`Créer une clé ${envMode === 'live' ? 'Production' : 'Test'}`, `Create ${envMode} key`)}
                      </span>
                    </button>
                  </div>

                  {newKeySecret && (
                    <div className="p-4 rounded-2xl bg-[#F1EBFF] dark:bg-[#2A2140] border border-dashed border-[#6D3FE0] space-y-2">
                      <div className="text-xs font-bold text-[#5A2FC8] dark:text-[#C3ADFF]">
                        {t(
                          'Copiez cette clé secrète maintenant : elle ne sera plus affichée.',
                          'Copy this secret key now: it will not be shown again.'
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 p-2.5 rounded-lg bg-white dark:bg-[#14121C] font-mono text-xs font-bold break-all">
                          {newKeySecret}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(newKeySecret);
                            showToast(t('Clé copiée.', 'Key copied.'));
                          }}
                          className="h-9 px-3 rounded-lg bg-[#6D3FE0] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t('Copier', 'Copy')}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] divide-y divide-[#E6E3EF] dark:divide-[#2B2638]">
                    {envKeys.length === 0 ? (
                      <div className="p-8 text-center text-sm text-[#787290] dark:text-[#A59DBA]">
                        {t('Aucune clé active dans cet environnement.', 'No active keys in this environment.')}
                      </div>
                    ) : (
                      envKeys.map((k) => (
                        <div key={k.id} className="p-4 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="font-mono text-sm font-bold text-[#5A2FC8] dark:text-[#C3ADFF]">
                              {k.prefix}••••••••••••
                            </div>
                            <div className="text-xs text-[#787290] dark:text-[#A59DBA] mt-0.5 tabular-nums">
                              {t('Créée le', 'Created')} {formatTimestamp(k.created, lang)}
                              {k.last_used ? ` · ${t('Dernier appel', 'Last used')} ${formatTimestamp(k.last_used, lang)}` : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRevokeKey(k.id)}
                            className="h-8 px-3 rounded-lg border border-[#E6E3EF] dark:border-[#2B2638] text-xs font-semibold text-[#B4334D] dark:text-[#FF9FB2] hover:bg-[#FDEBEF] dark:hover:bg-[#3A1D27] inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{t('Révoquer', 'Revoke')}</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ── PAGE: WEBHOOK ── */}
              {page === 'webhook' && account && (
                <div className="space-y-5">
                  <div>
                    <h1 className="font-display text-2xl font-bold">Webhook ({envMode === 'live' ? 'Production' : 'Test'})</h1>
                    <p className="text-sm text-[#787290] dark:text-[#A59DBA] mt-1">
                      {t(
                        'Geny prévient votre serveur en HTTP POST à chaque paiement confirmé.',
                        'Geny notifies your server via HTTP POST when each payment is confirmed.'
                      )}
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="webhookUrlInput" className="text-xs font-semibold">
                        {t('URL de réception HTTPS', 'HTTPS Endpoint URL')}
                      </label>
                      <input
                        id="webhookUrlInput"
                        type="url"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://votre-site.com/webhooks/geny"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] text-sm font-mono focus:outline-none focus:border-[#6D3FE0]"
                      />
                    </div>

                    {account.webhooks[envMode] && (
                      <div className="p-3.5 rounded-xl bg-[#F7F6FB] dark:bg-[#100E19] border border-[#E6E3EF] dark:border-[#2B2638] flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-[#787290] dark:text-[#A59DBA]">
                            {t('Secret de signature HMAC-SHA256', 'HMAC-SHA256 signing secret')}
                          </div>
                          <div className="font-mono text-xs font-bold truncate">
                            {account.webhooks[envMode]?.secret}
                          </div>
                        </div>
                        {account.webhooks[envMode]?.last_delivered_at && (
                          <div className="text-xs font-semibold text-[#17754B] dark:text-[#7FDCAE] tabular-nums">
                            HTTP {account.webhooks[envMode]?.last_status} ·{' '}
                            {formatTimestamp(account.webhooks[envMode]!.last_delivered_at!, lang)}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleSaveWebhook(false)}
                        disabled={savingWebhook}
                        className="h-10 px-4 rounded-xl bg-[#6D3FE0] text-white text-xs font-bold cursor-pointer"
                      >
                        {savingWebhook ? t('Enregistrement…', 'Saving…') : t('Enregistrer', 'Save')}
                      </button>
                      {account.webhooks[envMode] && (
                        <>
                          <button
                            type="button"
                            onClick={handleTestWebhook}
                            className="h-10 px-4 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] text-xs font-bold hover:border-[#6D3FE0] cursor-pointer"
                          >
                            {t('Envoyer un événement test', 'Send test event')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveWebhook(true)}
                            className="h-10 px-4 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] text-xs font-semibold text-[#787290] cursor-pointer"
                          >
                            {t('Renouveler le secret', 'Rotate secret')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── PAGE: PRICES ── */}
              {page === 'prices' && account && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="font-display text-2xl font-bold">{t('Prix et marges', 'Prices & margins')}</h1>
                      <p className="text-sm text-[#787290] dark:text-[#A59DBA] mt-1">
                        {t(
                          'Définissez votre prix client pour chaque forfait (jusqu’à 2× le tarif revendeur).',
                          'Set your customer price for each plan (up to 2× the wholesale rate).'
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSavePrices}
                      disabled={savingPrices}
                      className="h-10 px-4 rounded-xl bg-[#6D3FE0] text-white text-xs font-bold cursor-pointer"
                    >
                      {savingPrices ? t('Enregistrement…', 'Saving…') : t('Enregistrer les prix', 'Save prices')}
                    </button>
                  </div>

                  <div className="rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[#E6E3EF] dark:border-[#2B2638] text-xs text-[#787290] dark:text-[#A59DBA]">
                          <th className="py-3 px-4 font-semibold">{t('Forfait', 'Plan')}</th>
                          <th className="py-3 px-4 font-semibold text-right">{t('Prix revendeur', 'Wholesale')}</th>
                          <th className="py-3 px-4 font-semibold text-right">{t('Plafond', 'Max')}</th>
                          <th className="py-3 px-4 font-semibold text-right">{t('Votre prix client', 'Customer price')}</th>
                          <th className="py-3 px-4 font-semibold text-right">{t('Marge', 'Margin')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E6E3EF] dark:divide-[#2B2638]">
                        {account.prices.map((p) => {
                          const raw = Number(draftPrices[p.plan_id] ?? p.effective);
                          const invalid = Number.isNaN(raw) || raw < p.min || raw > p.max;
                          const margin = invalid ? 0 : raw - p.wholesale;
                          return (
                            <tr key={p.plan_id} className="hover:bg-[#F7F6FB] dark:hover:bg-[#1E1A28]">
                              <td className="py-3 px-4 font-semibold">{p.name}</td>
                              <td className="py-3 px-4 text-right tabular-nums text-[#787290] dark:text-[#A59DBA]">
                                {formatMoney(p.wholesale, lang)}
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums text-[#787290] dark:text-[#A59DBA]">
                                {formatMoney(p.max, lang)}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <input
                                  type="number"
                                  min={p.min}
                                  max={p.max}
                                  value={draftPrices[p.plan_id] ?? String(p.effective)}
                                  onChange={(e) =>
                                    setDraftPrices((prev) => ({ ...prev, [p.plan_id]: e.target.value }))
                                  }
                                  className={`w-28 px-2.5 py-1.5 rounded-lg border text-right font-mono text-xs font-bold tabular-nums bg-[#F7F6FB] dark:bg-[#100E19] ${
                                    invalid
                                      ? 'border-[#B4334D] text-[#B4334D]'
                                      : 'border-[#E6E3EF] dark:border-[#2B2638]'
                                  }`}
                                />
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums font-bold text-[#17754B] dark:text-[#7FDCAE]">
                                +{formatMoney(margin, lang)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── PAGE: TOPUP ── */}
              {page === 'topup' && account && (
                <div className="space-y-5 max-w-[680px]">
                  <div>
                    <h1 className="font-display text-2xl font-bold">{t('Recharger le solde', 'Top up balance')}</h1>
                    <p className="text-sm text-[#787290] dark:text-[#A59DBA] mt-1">
                      {t(
                        'Créditez votre solde prépayé par MTN Mobile Money ou Orange Money (1 000 à 500 000 FCFA).',
                        'Credit your prepaid wallet via MTN Mobile Money or Orange Money (1,000 to 500,000 FCFA).'
                      )}
                    </p>
                  </div>

                  <form
                    onSubmit={handleTopup}
                    className="p-6 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] space-y-4"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#787290] dark:text-[#A59DBA]">{t('Solde actuel', 'Current balance')}</span>
                      <span className="font-display text-base font-extrabold tabular-nums">
                        {formatMoney(balances.wallet, lang)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {(['mtn', 'orange'] as const).map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setTopupOp(op)}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border text-left cursor-pointer ${
                            topupOp === op
                              ? 'border-[#6D3FE0] bg-[#F1EBFF]/60 dark:bg-[#2A2140]'
                              : 'border-[#E6E3EF] dark:border-[#2B2638]'
                          }`}
                        >
                          {op === 'mtn' ? <MtnLogo className="w-7 h-7" /> : <OrangeLogo className="w-7 h-7" />}
                          <span className="text-xs font-bold">
                            {op === 'mtn' ? 'MTN MoMo' : 'Orange Money'}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="topupAmountInput" className="text-xs font-semibold">
                        {t('Montant (FCFA)', 'Amount (FCFA)')}
                      </label>
                      <input
                        id="topupAmountInput"
                        type="number"
                        min={1000}
                        max={500000}
                        value={topupAmount}
                        onChange={(e) => setTopupAmount(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] font-display text-lg font-bold tabular-nums"
                      />
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {['2000', '5000', '10000', '25000', '50000'].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setTopupAmount(preset)}
                            className="px-2.5 py-1 rounded-lg bg-[#F1EBFF] dark:bg-[#2A2140] text-[#5A2FC8] dark:text-[#C3ADFF] text-xs font-semibold tabular-nums cursor-pointer"
                          >
                            {Number(preset).toLocaleString('fr-FR')} FCFA
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="topupPhoneInput" className="text-xs font-semibold">
                        {t('Numéro Mobile Money (+237)', 'Mobile Money number (+237)')}
                      </label>
                      <input
                        id="topupPhoneInput"
                        type="tel"
                        value={topupPhone}
                        onChange={(e) => setTopupPhone(e.target.value)}
                        placeholder="677 00 00 00"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] text-sm font-semibold tabular-nums"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingTopup}
                      className="w-full h-11 rounded-xl bg-[#6D3FE0] text-white text-sm font-bold cursor-pointer"
                    >
                      {submittingTopup ? t('Crédit en cours…', 'Crediting…') : t('Recharger maintenant', 'Top up now')}
                    </button>
                  </form>
                </div>
              )}

              {/* ── PAGE: PAYOUT ── */}
              {page === 'payout' && account && (
                <div className="space-y-5 max-w-[680px]">
                  <div>
                    <h1 className="font-display text-2xl font-bold">{t('Retirer mes gains', 'Withdraw earnings')}</h1>
                    <p className="text-sm text-[#787290] dark:text-[#A59DBA] mt-1">
                      {t(
                        'Transférez vos marges du mode direct vers votre compte Mobile Money (frais 1,5 %).',
                        'Transfer your direct-mode margins to Mobile Money (1.5% fee).'
                      )}
                    </p>
                  </div>

                  <form
                    onSubmit={handlePayout}
                    className="p-6 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] space-y-4"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#787290] dark:text-[#A59DBA]">{t('Gains disponibles', 'Available earnings')}</span>
                      <span className="font-display text-base font-extrabold text-[#17754B] dark:text-[#7FDCAE] tabular-nums">
                        {formatMoney(balances.earnings, lang)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {(['mtn', 'orange'] as const).map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setPayoutOp(op)}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border text-left cursor-pointer ${
                            payoutOp === op
                              ? 'border-[#6D3FE0] bg-[#F1EBFF]/60 dark:bg-[#2A2140]'
                              : 'border-[#E6E3EF] dark:border-[#2B2638]'
                          }`}
                        >
                          {op === 'mtn' ? <MtnLogo className="w-7 h-7" /> : <OrangeLogo className="w-7 h-7" />}
                          <span className="text-xs font-bold">
                            {op === 'mtn' ? 'MTN MoMo' : 'Orange Money'}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="payoutAmountInput" className="text-xs font-semibold">
                        {t('Montant à retirer (min. 102 FCFA)', 'Amount to withdraw (min. 102 FCFA)')}
                      </label>
                      <input
                        id="payoutAmountInput"
                        type="number"
                        min={102}
                        max={balances.earnings}
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        placeholder={String(balances.earnings)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] font-display text-lg font-bold tabular-nums"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="payoutPhoneInput" className="text-xs font-semibold">
                        {t('Numéro bénéficiaire (+237)', 'Recipient number (+237)')}
                      </label>
                      <input
                        id="payoutPhoneInput"
                        type="tel"
                        value={payoutPhone}
                        onChange={(e) => setPayoutPhone(e.target.value)}
                        placeholder="677 00 00 00"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] text-sm font-semibold tabular-nums"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingPayout || balances.earnings < 102}
                      className="w-full h-11 rounded-xl bg-[#6D3FE0] text-white text-sm font-bold disabled:opacity-50 cursor-pointer"
                    >
                      {submittingPayout ? t('Versement…', 'Sending…') : t('Retirer vers Mobile Money', 'Withdraw to Mobile Money')}
                    </button>
                  </form>
                </div>
              )}

              {/* ── PAGE: ORDERS ── */}
              {page === 'orders' && (
                <div className="space-y-5">
                  <div>
                    <h1 className="font-display text-2xl font-bold">{t('Commandes', 'Orders')}</h1>
                    <p className="text-sm text-[#787290] dark:text-[#A59DBA] mt-1">
                      {t('Les commandes passées par votre serveur, des plus récentes aux plus anciennes.', 'Orders placed by your server, newest first.')}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] overflow-x-auto">
                    {envOrders.length === 0 ? (
                      <div className="p-8 text-center text-sm text-[#787290] dark:text-[#A59DBA]">
                        {t('Aucune commande enregistrée dans cet environnement.', 'No orders recorded in this environment.')}
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-[#E6E3EF] dark:border-[#2B2638] text-xs text-[#787290] dark:text-[#A59DBA]">
                            <th className="py-3 px-4 font-semibold">{t('Forfait', 'Plan')}</th>
                            <th className="py-3 px-4 font-semibold">{t('Code', 'Code')}</th>
                            <th className="py-3 px-4 font-semibold">{t('Mode', 'Mode')}</th>
                            <th className="py-3 px-4 font-semibold text-right">{t('Montant', 'Amount')}</th>
                            <th className="py-3 px-4 font-semibold text-right">{t('Date', 'Date')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E6E3EF] dark:divide-[#2B2638]">
                          {envOrders.map((ord) => (
                            <tr key={ord.id} className="hover:bg-[#F7F6FB] dark:hover:bg-[#1E1A28]">
                              <td className="py-3 px-4 font-semibold">{ord.plan_name}</td>
                              <td className="py-3 px-4 font-mono text-xs font-bold text-[#5A2FC8] dark:text-[#C3ADFF]">
                                {ord.code || '—'}
                              </td>
                              <td className="py-3 px-4 text-xs capitalize">{ord.mode}</td>
                              <td className="py-3 px-4 text-right tabular-nums font-semibold">
                                {formatMoney(ord.amount_fcfa, lang)}
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums text-xs text-[#787290] dark:text-[#A59DBA]">
                                {formatTimestamp(ord.created, lang)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* ── PAGE: LEDGER ── */}
              {page === 'ledger' && (
                <div className="space-y-5">
                  <div>
                    <h1 className="font-display text-2xl font-bold">{t('Relevé', 'Statement')}</h1>
                    <p className="text-sm text-[#787290] dark:text-[#A59DBA] mt-1">
                      {t('Chaque mouvement de vos soldes : ventes, marges, crédits et versements.', 'Every movement on your balances: sales, margins, top-ups, and payouts.')}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] overflow-x-auto">
                    {envLedger.length === 0 ? (
                      <div className="p-8 text-center text-sm text-[#787290] dark:text-[#A59DBA]">
                        {t('Aucun mouvement pour le moment.', 'No statement entries yet.')}
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-[#E6E3EF] dark:border-[#2B2638] text-xs text-[#787290] dark:text-[#A59DBA]">
                            <th className="py-3 px-4 font-semibold">{t('Opération', 'Description')}</th>
                            <th className="py-3 px-4 font-semibold">{t('Compte', 'Bucket')}</th>
                            <th className="py-3 px-4 font-semibold text-right">{t('Variation', 'Amount')}</th>
                            <th className="py-3 px-4 font-semibold text-right">{t('Solde après', 'Balance after')}</th>
                            <th className="py-3 px-4 font-semibold text-right">{t('Date', 'Date')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E6E3EF] dark:divide-[#2B2638]">
                          {envLedger.map((entry) => (
                            <tr key={entry.id} className="hover:bg-[#F7F6FB] dark:hover:bg-[#1E1A28]">
                              <td className="py-3 px-4 font-medium">{entry.label}</td>
                              <td className="py-3 px-4 text-xs text-[#787290] dark:text-[#A59DBA]">
                                {entry.bucket === 'wallet' ? t('Prépayé', 'Wallet') : t('Gains', 'Earnings')}
                              </td>
                              <td
                                className={`py-3 px-4 text-right tabular-nums font-bold ${
                                  entry.amount_fcfa >= 0
                                    ? 'text-[#17754B] dark:text-[#7FDCAE]'
                                    : 'text-[#B4334D] dark:text-[#FF9FB2]'
                                }`}
                              >
                                {entry.amount_fcfa >= 0 ? '+' : ''}
                                {formatMoney(entry.amount_fcfa, lang)}
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums font-semibold">
                                {formatMoney(entry.balance_after, lang)}
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums text-xs text-[#787290] dark:text-[#A59DBA]">
                                {formatTimestamp(entry.created, lang)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* ── PAGE: INTEGRATION ── */}
              {page === 'integration' && account && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="font-display text-2xl font-bold">{t('Intégration API', 'API Integration')}</h1>
                      <p className="text-sm text-[#787290] dark:text-[#A59DBA] mt-1">
                        {t(
                          'Branchez votre site ou bot sur l’API Geny. Testez une commande en direct ci-dessous.',
                          'Connect your website or bot to the Geny API. Test a live order below.'
                        )}
                      </p>
                    </div>
                    <a
                      href="/geny-shop-vps.zip"
                      download="geny-shop-vps.zip"
                      className="h-10 px-4 rounded-xl bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white text-xs font-bold inline-flex items-center justify-center gap-2 hover:brightness-105 transition-all whitespace-nowrap shrink-0"
                    >
                      <span>{t('Télécharger le projet VPS (.zip)', 'Download VPS project (.zip)')}</span>
                    </a>
                  </div>

                  {/* Interactive Sandbox Tester */}
                  <div className="p-5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] space-y-4">
                    <div className="font-display font-bold text-base">
                      {t('Simulateur de commande API', 'API Order Simulator')} ({envMode === 'live' ? 'Production' : 'Test'})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <select
                        value={simPlanId}
                        onChange={(e) => setSimPlanId(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] text-xs font-semibold"
                      >
                        {account.prices.map((p) => (
                          <option key={p.plan_id} value={p.plan_id}>
                            {p.name} ({formatMoney(p.wholesale, lang)})
                          </option>
                        ))}
                      </select>

                      <select
                        value={simMode}
                        onChange={(e) => setSimMode(e.target.value as 'wallet' | 'direct')}
                        className="px-3 py-2 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] text-xs font-semibold"
                      >
                        <option value="wallet">{t('Mode Prépayé (Wallet)', 'Wallet Mode')}</option>
                        <option value="direct">{t('Mode Direct (Marge)', 'Direct Mode')}</option>
                      </select>

                      <button
                        type="button"
                        onClick={handleSimulateOrder}
                        disabled={simRunning}
                        className="h-10 px-4 rounded-xl bg-[#6D3FE0] text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{simRunning ? t('Exécution…', 'Running…') : t('Tester POST /orders', 'Test POST /orders')}</span>
                      </button>
                    </div>

                    {simResult && (
                      <pre className="p-3.5 rounded-xl bg-[#F7F6FB] dark:bg-[#100E19] border border-[#E6E3EF] dark:border-[#2B2638] font-mono text-xs overflow-x-auto">
                        {simResult}
                      </pre>
                    )}
                  </div>

                  {/* Code Snippets */}
                  <div className="rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#1E1A28] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        {(['curl', 'node', 'php', 'python'] as const).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setCodeSnippetTab(tab)}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase cursor-pointer ${
                              codeSnippetTab === tab
                                ? 'bg-[#6D3FE0] text-white'
                                : 'text-[#787290] dark:text-[#A59DBA]'
                            }`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(codeSnippets[codeSnippetTab]);
                          showToast(t('Code copié.', 'Snippet copied.'));
                        }}
                        className="px-2.5 py-1 rounded-lg border border-[#E6E3EF] dark:border-[#2B2638] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{t('Copier', 'Copy')}</span>
                      </button>
                    </div>
                    <pre className="p-4 font-mono text-xs overflow-x-auto leading-relaxed">
                      {codeSnippets[codeSnippetTab]}
                    </pre>
                  </div>
                </div>
              )}

              {/* ── PAGE: MULTI-DOMAIN RESELLER SHOPS ── */}
              {page === 'tenants' && account && (
                <div className="space-y-6">
                  <div>
                    <h1 className="font-display text-2xl font-bold">
                      {t('Boutiques & Domaines multi-revendeurs', 'Multi-Domain Reseller Shops')}
                    </h1>
                    <p className="text-sm text-[#787290] dark:text-[#A59DBA] mt-1">
                      {t(
                        'Hébergez plusieurs boutiques Geny sur ce même VPS : chaque nom de domaine pointe vers son propre compte revendeur et sa propre clé API.',
                        'Host multiple Geny storefronts on this single VPS: each domain routes automatically to its own reseller API key.'
                      )}
                    </p>
                  </div>

                  {/* Add / Update Reseller Domain Form */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setSavingTenant(true);
                      try {
                        const res = await fetch('/api/v1/portal/tenants', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                          body: JSON.stringify({
                            domain: tenantDomain,
                            reseller_name: tenantName,
                            api_key: tenantApiKey,
                            webhook_secret: tenantWebhookSecret,
                          }),
                        });
                        const json = await res.json();
                        if (!res.ok) {
                          showToast(json.error || t('Erreur lors de l’ajout.', 'Could not save domain.'));
                          return;
                        }
                        setTenantDomain('');
                        setTenantName('');
                        setTenantApiKey('');
                        setTenantWebhookSecret('');
                        await fetchTenants();
                        showToast(t('Boutique enregistrée pour ce domaine.', 'Reseller domain saved.'));
                      } finally {
                        setSavingTenant(false);
                      }
                    }}
                    className="p-5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] space-y-4"
                  >
                    <div className="font-display font-bold text-base">
                      {t('Ajouter ou mettre à jour un domaine revendeur', 'Add or update a reseller domain')}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="flex flex-col gap-1">
                        <label htmlFor="tenantDomainInput" className="text-xs font-semibold">
                          {t('Nom de domaine', 'Domain name')}
                        </label>
                        <input
                          id="tenantDomainInput"
                          type="text"
                          value={tenantDomain}
                          onChange={(e) => setTenantDomain(e.target.value)}
                          placeholder="boutique-alice.cm"
                          className="px-3.5 py-2.5 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] font-mono text-xs font-semibold"
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor="tenantNameInput" className="text-xs font-semibold">
                          {t('Nom affiché sur la boutique', 'Storefront brand name')}
                        </label>
                        <input
                          id="tenantNameInput"
                          type="text"
                          value={tenantName}
                          onChange={(e) => setTenantName(e.target.value)}
                          placeholder="Alice WiFi"
                          className="px-3.5 py-2.5 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] text-xs font-semibold"
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor="tenantKeyInput" className="text-xs font-semibold">
                          {t('Clé API Geny du revendeur', 'Reseller Geny API Key')}
                        </label>
                        <input
                          id="tenantKeyInput"
                          type="password"
                          value={tenantApiKey}
                          onChange={(e) => setTenantApiKey(e.target.value)}
                          placeholder="gk_live_..."
                          className="px-3.5 py-2.5 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] font-mono text-xs"
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor="tenantWhInput" className="text-xs font-semibold">
                          {t('Secret Webhook (optionnel)', 'Webhook Secret (optional)')}
                        </label>
                        <input
                          id="tenantWhInput"
                          type="password"
                          value={tenantWebhookSecret}
                          onChange={(e) => setTenantWebhookSecret(e.target.value)}
                          placeholder="whsec_..."
                          className="px-3.5 py-2.5 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] font-mono text-xs"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={savingTenant}
                      className="h-10 px-5 rounded-xl bg-gradient-to-br from-[#8956F7] to-[#6532D1] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{savingTenant ? t('Enregistrement…', 'Saving…') : t('Enregistrer ce domaine', 'Save domain')}</span>
                    </button>
                  </form>

                  {/* Configured Domains List */}
                  <div className="rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-[#E6E3EF] dark:border-[#2B2638] flex items-center justify-between">
                      <span className="font-display font-bold text-sm">
                        {t('Domaines configurés', 'Configured domains')} ({tenants.length})
                      </span>
                    </div>

                    {tenants.length === 0 ? (
                      <div className="p-8 text-center text-sm text-[#787290] dark:text-[#A59DBA]">
                        {t(
                          'Aucun domaine secondaire configuré. Ajoutez votre premier revendeur ci-dessus.',
                          'No secondary reseller domains yet. Add one above.'
                        )}
                      </div>
                    ) : (
                      <div className="divide-y divide-[#E6E3EF] dark:divide-[#2B2638]">
                        {tenants.map((ten) => (
                          <div key={ten.id} className="p-5 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-display font-bold text-base">{ten.reseller_name}</span>
                                  <span className="font-mono text-xs font-bold text-[#6D3FE0] dark:text-[#BCA3FF]">
                                    {ten.domain}
                                  </span>
                                  <span
                                    className={`text-[11px] font-bold ${
                                      ten.enabled
                                        ? 'text-[#17754B] dark:text-[#7FDCAE]'
                                        : 'text-[#787290] dark:text-[#A59DBA]'
                                    }`}
                                  >
                                    · {ten.enabled ? t('Actif', 'Active') : t('Désactivé', 'Disabled')}
                                  </span>
                                </div>
                                <div className="text-xs text-[#787290] dark:text-[#A59DBA] font-mono mt-1">
                                  API: {ten.api_key_masked || t('Manquante', 'Missing')} · Webhook: https://{ten.domain}/api/webhooks/geny
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <a
                                  href={`/?shop=${encodeURIComponent(ten.domain)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-lg bg-[#F0E9FF] dark:bg-[#2C2145] text-[#6D3FE0] dark:text-[#BCA3FF] text-xs font-semibold"
                                >
                                  {t('Prévisualiser', 'Preview')}
                                </a>
                                <button
                                  type="button"
                                  disabled={testingTenantId === ten.id}
                                  onClick={async () => {
                                    setTestingTenantId(ten.id);
                                    try {
                                      const r = await fetch(`/api/v1/portal/tenants/${ten.id}/test`, { method: 'POST' });
                                      const j = await r.json();
                                      setTenantTestResults((prev) => ({
                                        ...prev,
                                        [ten.id]: j.ok
                                          ? `${j.account_name} · ${j.livemode ? 'LIVE' : 'TEST'} · ${j.plans_count} plans`
                                          : j.error || t('Échec du test', 'Test failed'),
                                      }));
                                    } finally {
                                      setTestingTenantId(null);
                                    }
                                  }}
                                  className="px-3 py-1.5 rounded-lg border border-[#E6E3EF] dark:border-[#2B2638] text-xs font-semibold cursor-pointer"
                                >
                                  {testingTenantId === ten.id ? t('Test…', 'Testing…') : t('Tester la clé', 'Test key')}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await fetch(`/api/v1/portal/tenants/${ten.id}`, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ enabled: !ten.enabled }),
                                    });
                                    await fetchTenants();
                                  }}
                                  className="px-3 py-1.5 rounded-lg border border-[#E6E3EF] dark:border-[#2B2638] text-xs font-semibold cursor-pointer"
                                >
                                  {ten.enabled ? t('Désactiver', 'Disable') : t('Activer', 'Enable')}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await fetch(`/api/v1/portal/tenants/${ten.id}`, { method: 'DELETE' });
                                    await fetchTenants();
                                    showToast(t('Domaine supprimé.', 'Domain removed.'));
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg border border-[#E6E3EF] dark:border-[#2B2638] text-[#D92D20] cursor-pointer"
                                  aria-label={t('Supprimer', 'Delete')}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {tenantTestResults[ten.id] && (
                              <div className="text-xs font-mono text-[#17754B] dark:text-[#7FDCAE]">
                                {tenantTestResults[ten.id]}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F7F6FB] dark:bg-[#100E19] border border-[#E6E3EF] dark:border-[#2B2638] text-[11px] font-mono">
                              <span className="truncate">
                                sudo bash /opt/geny-shop/scripts/add-domain.sh {ten.domain}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(
                                    `sudo bash /opt/geny-shop/scripts/add-domain.sh ${ten.domain}`
                                  );
                                  showToast(t('Commande Nginx+SSL copiée.', 'Nginx+SSL command copied.'));
                                }}
                                className="text-[#6D3FE0] dark:text-[#BCA3FF] font-bold shrink-0 cursor-pointer"
                              >
                                {t('Copier SSL', 'Copy SSL cmd')}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── PAGE: SETTINGS ── */}
              {page === 'settings' && account && (
                <div className="space-y-5 max-w-[680px]">
                  <div>
                    <h1 className="font-display text-2xl font-bold">{t('Paramètres', 'Settings')}</h1>
                    <p className="text-sm text-[#787290] dark:text-[#A59DBA] mt-1">
                      {t('Adresses IP autorisées et seuils de sécurité.', 'Allowed IP addresses and security thresholds.')}
                    </p>
                  </div>

                  <form
                    onSubmit={handleSaveSettings}
                    className="p-6 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E6E3EF] dark:border-[#2B2638] space-y-4"
                  >
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="ipAllowInput" className="text-xs font-semibold">
                        {t('Liste blanche IP (une par ligne, vide = toutes)', 'IP allowlist (one per line, empty = all)')}
                      </label>
                      <textarea
                        id="ipAllowInput"
                        rows={4}
                        value={ipText}
                        onChange={(e) => setIpText(e.target.value)}
                        placeholder="203.0.113.10"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] font-mono text-xs"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="lowBalanceInput" className="text-xs font-semibold">
                        {t('Alerte solde bas (FCFA)', 'Low balance alert (FCFA)')}
                      </label>
                      <input
                        id="lowBalanceInput"
                        type="number"
                        min={0}
                        value={lowBalanceThreshold}
                        onChange={(e) => setLowBalanceThreshold(e.target.value)}
                        className="w-48 px-3.5 py-2 rounded-xl border border-[#E6E3EF] dark:border-[#2B2638] bg-[#F7F6FB] dark:bg-[#100E19] font-mono text-sm font-bold tabular-nums"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={savingSettings}
                      className="h-10 px-5 rounded-xl bg-[#6D3FE0] text-white text-xs font-bold cursor-pointer"
                    >
                      {savingSettings ? t('Enregistrement…', 'Saving…') : t('Enregistrer', 'Save')}
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-[#1B1530] dark:bg-white text-white dark:text-[#1B1530] text-xs font-bold shadow-lg flex items-center gap-2"
        >
          <Check className="w-4 h-4 text-[#7FDCAE] dark:text-[#17754B]" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
