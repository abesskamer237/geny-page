import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  Check,
  Copy,
  FileText,
  Globe,
  KeyRound,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sun,
  X,
  AlertCircle,
  Sparkles,
  Store,
} from 'lucide-react';
import type {
  CodeLookupResult,
  Lang,
  Plan,
  SavedCode,
  ShopCatalog,
  ShopOrder,
  ThemeMode,
} from '../types/geny';
import {
  AndroidIcon,
  GenyLogoMark,
  MtnLogo,
  OrangeLogo,
  WhatsAppIcon,
  WindowsIcon,
  formatDuration,
  formatFcfa,
  formatQuota,
  formatSize,
  formatTimestamp,
} from './Icons';

interface ShopPageProps {
  lang: Lang;
  theme: ThemeMode;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onOpenResellerPortal: () => void;
  onOpenApiSpace: () => void;
}

type PlanCategory = 'all' | 'short' | 'weekly_monthly' | 'unlimited';

export function ShopPage({
  lang,
  theme,
  onToggleLang,
  onToggleTheme,
  onOpenResellerPortal,
  onOpenApiSpace,
}: ShopPageProps) {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);

  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<PlanCategory>('all');

  // Purchase mode: new code vs recharge existing code (topup_code)
  const [purchaseIntent, setPurchaseIntent] = useState<'new' | 'topup'>('new');
  const [topupCodeInput, setTopupCodeInput] = useState('');
  const [topupCheck, setTopupCheck] = useState<CodeLookupResult | null>(null);
  const [topupCheckError, setTopupCheckError] = useState('');
  const [checkingTopup, setCheckingTopup] = useState(false);

  // Standalone Code Lookup section
  const [lookupInput, setLookupInput] = useState('');
  const [lookupResult, setLookupResult] = useState<CodeLookupResult | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [lookingUp, setLookingUp] = useState(false);

  const previewShop = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('shop')?.trim().toLowerCase() || '';
    } catch {
      return '';
    }
  }, []);

  const shopQuery = previewShop ? `?shop=${encodeURIComponent(previewShop)}` : '';
  const codesStorageKey = `geny_shop_saved_codes_${previewShop || window.location.host}`;

  // Saved customer codes in browser (isolated per reseller domain)
  const [savedCodes, setSavedCodes] = useState<SavedCode[]>(() => {
    try {
      const raw = localStorage.getItem(codesStorageKey);
      return raw ? (JSON.parse(raw) as SavedCode[]) : [];
    } catch {
      return [];
    }
  });
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [savedFilter, setSavedFilter] = useState('');

  // Checkout Modal State (Direct Mode following Geny Partner API Integration docs)
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);
  const [orderRef, setOrderRef] = useState('');
  const [operator, setOperator] = useState<'mtn' | 'orange'>('mtn');
  const [phone, setPhone] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [activeOrder, setActiveOrder] = useState<ShopOrder | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  async function loadCatalog() {
    setLoading(true);
    try {
      const res = await fetch(`/api/shop/catalog${shopQuery}`, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const json = (await res.json()) as ShopCatalog;
        setCatalog(json);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCatalog();
  }, [shopQuery]);

  useEffect(() => {
    if (catalog?.reseller_name) {
      document.title =
        lang === 'en'
          ? `${catalog.reseller_name} · Geny Storefront`
          : `${catalog.reseller_name} · Boutique Geny`;
    }
  }, [catalog?.reseller_name, lang]);

  useEffect(() => {
    try {
      localStorage.setItem(codesStorageKey, JSON.stringify(savedCodes));
    } catch {
      // ignore
    }
  }, [savedCodes, codesStorageKey]);

  // Auto-detect operator from Cameroon +237 prefix using catalog operators
  useEffect(() => {
    const clean = phone.replace(/\D/g, '');
    const national = clean.startsWith('237') ? clean.slice(3) : clean;
    if (national.length >= 2 && catalog?.operators) {
      const matched = catalog.operators.find((op) =>
        op.prefixes.some((p) => national.startsWith(p))
      );
      if (matched) setOperator(matched.id);
    }
  }, [phone, catalog]);

  // Poll GET /api/shop/orders/:order_ref while status === 'pending'
  useEffect(() => {
    if (!activeOrder || activeOrder.status !== 'pending') return;

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(
          `/api/shop/orders/${encodeURIComponent(activeOrder.order_ref)}${shopQuery}`,
          { headers: { Accept: 'application/json' } }
        );
        if (!res.ok) return;
        const next = (await res.json()) as ShopOrder;
        setActiveOrder(next);
        if (next.status === 'succeeded' && next.code) {
          saveIssuedCode(next);
        }
      } catch {
        // retry on next tick
      }
    }, 2500);

    return () => window.clearInterval(timer);
  }, [activeOrder, shopQuery]);

  function saveIssuedCode(ord: ShopOrder) {
    if (!ord.code) return;
    setSavedCodes((prev) => {
      if (prev.some((c) => c.code === ord.code && c.created >= ord.created - 5)) return prev;
      return [
        {
          code: ord.code!,
          plan_id: ord.plan_id,
          plan_name: ord.plan_name,
          price_fcfa: ord.amount_fcfa,
          created: ord.created || Math.floor(Date.now() / 1000),
          operator: ord.operator,
          phone: ord.phone,
        },
        ...prev,
      ];
    });
  }

  async function verifyCode(codeStr: string, target: 'topup' | 'standalone') {
    const trimmed = codeStr.trim().toUpperCase();
    if (!trimmed) return;
    if (target === 'topup') {
      setCheckingTopup(true);
      setTopupCheckError('');
      setTopupCheck(null);
    } else {
      setLookingUp(true);
      setLookupError('');
      setLookupResult(null);
    }

    try {
      const res = await fetch(`/api/shop/codes/lookup${shopQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = json.error || t('Code introuvable.', 'Code not found.');
        if (target === 'topup') setTopupCheckError(msg);
        else setLookupError(msg);
        return;
      }
      if (target === 'topup') setTopupCheck(json as CodeLookupResult);
      else setLookupResult(json as CodeLookupResult);
    } catch {
      const msg = t('Vérification impossible pour le moment.', 'Verification unavailable right now.');
      if (target === 'topup') setTopupCheckError(msg);
      else setLookupError(msg);
    } finally {
      if (target === 'topup') setCheckingTopup(false);
      else setLookingUp(false);
    }
  }

  function openCheckout(plan: Plan) {
    const newRef = `CMD-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    setCheckoutPlan(plan);
    setOrderRef(newRef);
    setCheckoutError('');
    setActiveOrder(null);
    setOtpCode('');
    setCopiedCode(false);
  }

  async function handleCreateOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!checkoutPlan) return;
    setCheckoutError('');

    if (purchaseIntent === 'topup' && !topupCodeInput.trim()) {
      setCheckoutError(
        t('Entrez le code Geny à recharger avant de continuer.', 'Enter the Geny code to top up first.')
      );
      return;
    }

    setSubmittingOrder(true);
    try {
      const res = await fetch(`/api/shop/orders${shopQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          order_ref: orderRef,
          plan_id: checkoutPlan.id,
          operator,
          phone,
          topup_code: purchaseIntent === 'topup' ? topupCodeInput.trim().toUpperCase() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCheckoutError(json.error || t('Commande refusée.', 'Order rejected.'));
        return;
      }
      const ord = json as ShopOrder;
      setActiveOrder(ord);
      if (ord.status === 'succeeded' && ord.code) {
        saveIssuedCode(ord);
      }
    } catch {
      setCheckoutError(t('Connexion interrompue. Réessayez.', 'Connection interrupted. Please retry.'));
    } finally {
      setSubmittingOrder(false);
    }
  }

  async function handleSubmitOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrder) return;
    setCheckoutError('');
    setSubmittingOrder(true);
    try {
      const res = await fetch(
        `/api/shop/orders/${encodeURIComponent(activeOrder.order_ref)}/otp${shopQuery}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ otp: otpCode }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setCheckoutError(json.error || t('Code SMS refusé.', 'SMS code rejected.'));
        return;
      }
      const updated = json as ShopOrder;
      setActiveOrder(updated);
      if (updated.status === 'succeeded' && updated.code) {
        saveIssuedCode(updated);
      }
    } finally {
      setSubmittingOrder(false);
    }
  }

  async function handleSimulateOutcome(outcome: 'succeeded' | 'failed') {
    if (!activeOrder) return;
    setCheckoutError('');
    setSubmittingOrder(true);
    try {
      const res = await fetch(
        `/api/shop/orders/${encodeURIComponent(activeOrder.order_ref)}/simulate${shopQuery}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ outcome }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setCheckoutError(json.error || t('Simulation impossible.', 'Simulation failed.'));
        return;
      }
      const updated = json as ShopOrder;
      setActiveOrder(updated);
      if (updated.status === 'succeeded' && updated.code) {
        saveIssuedCode(updated);
      }
    } finally {
      setSubmittingOrder(false);
    }
  }

  function copyCode(val: string) {
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1800);
  }

  const visiblePlans = useMemo(() => {
    const all = catalog?.plans || [];
    return all.filter((p) => {
      if (purchaseIntent === 'topup' && p.price_fcfa === 0) return false;
      if (category === 'all') return true;
      if (category === 'unlimited') return p.quota_bytes === null;
      if (category === 'short') return p.quota_bytes !== null && (p.duration_unit === 'hours' || p.duration_value <= 3);
      if (category === 'weekly_monthly') return p.quota_bytes !== null && p.duration_unit === 'days' && p.duration_value >= 7;
      return true;
    });
  }, [catalog, category, purchaseIntent]);

  const filteredSaved = useMemo(() => {
    const q = savedFilter.trim().toLowerCase();
    if (!q) return savedCodes;
    return savedCodes.filter(
      (c) => c.code.toLowerCase().includes(q) || c.plan_name.toLowerCase().includes(q)
    );
  }, [savedCodes, savedFilter]);

  const android = catalog?.apps?.android;
  const windows = catalog?.apps?.windows;
  const guide = catalog?.guide;

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F5FB] dark:bg-[#100E19] text-[#211A35] dark:text-[#F6F3FF]">
      {/* 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#F6F5FB]/92 dark:bg-[#100E19]/92 backdrop-blur-md border-b border-[#E8E4F2] dark:border-[#2B2638]">
        <div className="w-full max-w-[1160px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Title */}
          <a href="#forfaits" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <GenyLogoMark className="w-8 h-8" />
            <span className="font-display text-lg font-bold tracking-tight">
              {catalog?.reseller_name || 'Samari'} · Geny
            </span>
          </a>

          {/* Zone 2: Clean Single-Line Text Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#736B83] dark:text-[#A59DBA]">
            <a href="#forfaits" className="hover:text-[#211A35] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              {t('Forfaits', 'Plans')}
            </a>
            <a href="#verifier" className="hover:text-[#211A35] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              {t('Vérifier un code', 'Check code')}
            </a>
            <a href="#apps" className="hover:text-[#211A35] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              {t('Applications', 'Apps')}
            </a>
            <button
              type="button"
              onClick={onOpenResellerPortal}
              className="hover:text-[#211A35] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t('Espace revendeur', 'Reseller portal')}
            </button>
          </nav>

          {/* Zone 3: Primary Action + Theme/Lang Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowSavedModal(true)}
              className="h-9 px-3.5 rounded-xl bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white text-xs font-bold inline-flex items-center gap-2 hover:brightness-105 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{t('Mes codes', 'My codes')}</span>
              <span className="tabular-nums font-mono">{savedCodes.length}</span>
            </button>

            <button
              type="button"
              onClick={onToggleLang}
              className="h-9 px-2.5 rounded-lg border border-[#E8E4F2] dark:border-[#2B2638] bg-white dark:bg-[#18151F] text-xs font-semibold text-[#4A4460] dark:text-[#CFC8E0] hover:border-[#7544DD] transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              aria-label={t('Changer de langue', 'Switch language')}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang.toUpperCase()}</span>
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              className="w-9 h-9 rounded-lg border border-[#E8E4F2] dark:border-[#2B2638] bg-white dark:bg-[#18151F] text-xs font-semibold text-[#4A4460] dark:text-[#CFC8E0] hover:border-[#7544DD] transition-colors inline-flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={t('Basculer le thème', 'Toggle theme')}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1160px] mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-12">
        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-8 items-center">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[#736B83] dark:text-[#A59DBA]">
              <span className="inline-flex items-center gap-1.5 text-[#7544DD] dark:text-[#BCA3FF]">
                <Store className="w-3.5 h-3.5" />
                <span>{t('Revendeur agréé Geny', 'Approved Geny Reseller')}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {catalog?.source === 'live_api'
                  ? t('Connecté en direct à l’API Geny', 'Connected live to Geny API')
                  : t('Catalogue synchronisé · Mode démonstration prêt pour clé API', 'Synced catalog · Ready for API key')}
              </span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl font-bold leading-[1.06] tracking-tight text-balance">
              {t('Votre internet.', 'Your internet.')}
              <br />
              {t('Sans ', 'No ')}
              <span className="font-serif-accent text-[#D92D20] dark:text-[#FF6B6B]">BullShit</span>.
            </h1>

            <p className="text-[15px] leading-relaxed text-[#736B83] dark:text-[#BCB4CD] max-w-[540px]">
              {t(
                'Commandez votre code d’activation Geny ou rechargez un code existant directement par MTN Mobile Money ou Orange Money. Livraison instantanée après validation.',
                'Buy your Geny activation code or top up an existing code directly via MTN Mobile Money or Orange Money. Instant delivery on approval.'
              )}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href="#forfaits"
                className="h-11 px-5 rounded-xl bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm hover:brightness-105 transition-all whitespace-nowrap"
              >
                <span>{t('Choisir un forfait', 'Choose a plan')}</span>
              </a>
              <button
                type="button"
                onClick={onOpenApiSpace}
                className="h-11 px-4 rounded-xl border border-[#E8E4F2] dark:border-[#2B2638] bg-white dark:bg-[#18151F] text-sm font-semibold hover:border-[#7544DD] transition-colors whitespace-nowrap cursor-pointer"
              >
                {t('Ouvrir l’Espace API', 'Open API Space')}
              </button>
            </div>
          </div>

          {/* 3-Step Flow Summary */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] space-y-4">
            <h2 className="font-display text-base font-bold">
              {t('Comment recevoir votre code en 1 minute', 'How to get your code in 1 minute')}
            </h2>
            <ol className="space-y-3.5 text-sm">
              {[
                {
                  n: '1',
                  title: t('Choisissez un forfait ou une recharge', 'Select a plan or top-up'),
                  desc: t('À partir de 75 FCFA, ou rechargez un code déjà activé.', 'Starting at 75 FCFA, or top up an active code.'),
                },
                {
                  n: '2',
                  title: t('Validez par Mobile Money (+237)', 'Pay via Mobile Money (+237)'),
                  desc: t('Demande USSD MTN MoMo (*126#) ou Orange Money (#150*50#).', 'MTN MoMo (*126#) or Orange Money (#150*50#) prompt.'),
                },
                {
                  n: '3',
                  title: t('Copiez votre code dans l’app Geny', 'Paste your code in the Geny app'),
                  desc: t('Compatible Android 8+ et Windows 10 / 11 sans engagement.', 'Works on Android 8+ and Windows 10 / 11 with no commitment.'),
                },
              ].map((step) => (
                <li key={step.n} className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-lg bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF] font-display font-bold text-xs flex items-center justify-center shrink-0 tabular-nums mt-0.5">
                    {step.n}
                  </span>
                  <div>
                    <div className="font-semibold text-sm">{step.title}</div>
                    <div className="text-xs text-[#736B83] dark:text-[#A59DBA]">{step.desc}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Plans & Recharge Catalog */}
        <section id="forfaits" className="space-y-5 scroll-mt-20">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                {t('Nos forfaits Internet', 'Internet plans')}
              </h2>
              <p className="mt-1 text-sm text-[#736B83] dark:text-[#BCB4CD]">
                {t(
                  'Tarifs officiels en FCFA · Paiement sécurisé en mode direct sans compte requis.',
                  'Official FCFA pricing · Direct Mobile Money checkout with no account required.'
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Intent Switch: New Code vs Top-up existing code */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638]">
                <button
                  type="button"
                  onClick={() => setPurchaseIntent('new')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    purchaseIntent === 'new'
                      ? 'bg-[#7544DD] text-white'
                      : 'text-[#736B83] dark:text-[#A59DBA]'
                  }`}
                >
                  {t('Nouveau code', 'New code')}
                </button>
                <button
                  type="button"
                  onClick={() => setPurchaseIntent('topup')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    purchaseIntent === 'topup'
                      ? 'bg-[#7544DD] text-white'
                      : 'text-[#736B83] dark:text-[#A59DBA]'
                  }`}
                >
                  {t('Recharger un code', 'Top up code')}
                </button>
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] overflow-x-auto">
                {[
                  { id: 'all', label: t('Tous', 'All') },
                  { id: 'short', label: t('Court terme', 'Short') },
                  { id: 'weekly_monthly', label: t('Semaine & Mois', 'Weekly & Monthly') },
                  { id: 'unlimited', label: t('Illimité', 'Unlimited') },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCategory(tab.id as PlanCategory)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      category === tab.id
                        ? 'bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF]'
                        : 'text-[#736B83] dark:text-[#A59DBA]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Topup Existing Code Pre-check Panel (from Geny Integration docs) */}
          {purchaseIntent === 'topup' && (
            <div className="p-5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] space-y-3">
              <div className="text-sm font-bold">
                {t('Code Geny à recharger', 'Geny code to top up')}
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  value={topupCodeInput}
                  onChange={(e) => {
                    setTopupCodeInput(e.target.value.toUpperCase());
                    setTopupCheck(null);
                    setTopupCheckError('');
                  }}
                  placeholder="GENY-XXXX-XXXX-XXXX"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#E8E4F2] dark:border-[#2B2638] bg-[#F6F5FB] dark:bg-[#100E19] font-mono text-sm font-bold tracking-wider uppercase focus:outline-none focus:border-[#7544DD]"
                />
                <button
                  type="button"
                  onClick={() => verifyCode(topupCodeInput, 'topup')}
                  disabled={checkingTopup || !topupCodeInput.trim()}
                  className="h-11 px-4 rounded-xl bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF] text-xs font-bold whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  {checkingTopup ? t('Vérification…', 'Checking…') : t('Vérifier ce code', 'Verify code')}
                </button>
              </div>
              {topupCheckError && (
                <div className="text-xs font-medium text-[#D92D20] dark:text-[#FF6B6B]">
                  {topupCheckError}
                </div>
              )}
              {topupCheck && (
                <div className="text-xs font-medium text-[#237C5D] dark:text-[#86DFB8]">
                  {topupCheck.plan_name} · {formatQuota(topupCheck.quota_bytes, lang)} · {topupCheck.message}
                </div>
              )}
            </div>
          )}

          {/* Plans Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-40 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visiblePlans.map((plan) => {
                const isFree = plan.price_fcfa === 0;
                return (
                  <article
                    key={plan.id}
                    className="flex flex-col justify-between p-5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] hover:border-[#7544DD] transition-colors shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display font-bold text-base leading-snug">{plan.name}</h3>
                        <span className="font-mono text-xs font-semibold text-[#7544DD] dark:text-[#BCA3FF] tabular-nums shrink-0">
                          {formatDuration(plan.duration_value, plan.duration_unit, lang)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#736B83] dark:text-[#A59DBA]">
                        <span className="font-semibold text-[#211A35] dark:text-[#F6F3FF]">
                          {formatQuota(plan.quota_bytes, lang)}
                        </span>
                        {plan.window && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{plan.window}</span>
                          </>
                        )}
                        {plan.fair_use && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {plan.fair_use.daily_gb} {t('Go/j puis', 'GB/d then')} {plan.fair_use.rate_kbit / 1000} Mbit/s
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-[#E8E4F2] dark:border-[#2B2638] flex items-center justify-between gap-3">
                      <div
                        className={`font-display text-lg font-extrabold tabular-nums ${
                          isFree ? 'text-[#237C5D] dark:text-[#86DFB8]' : ''
                        }`}
                      >
                        {formatFcfa(plan.price_fcfa, lang)}
                      </div>
                      <button
                        type="button"
                        onClick={() => openCheckout(plan)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                          isFree
                            ? 'bg-[#237C5D]/12 text-[#237C5D] dark:text-[#86DFB8] hover:bg-[#237C5D]/20'
                            : 'bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white hover:brightness-105'
                        }`}
                      >
                        {purchaseIntent === 'topup'
                          ? t('Recharger', 'Top up')
                          : isFree
                          ? t('Tester', 'Try free')
                          : t('Acheter', 'Buy')}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Code Lookup + App Downloads */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Verify Code Card */}
          <div
            id="verifier"
            className="p-6 rounded-3xl bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] flex flex-col justify-between gap-4 scroll-mt-20"
          >
            <div className="space-y-1.5">
              <h2 className="font-display text-xl font-bold">
                {t('Vérifier un code Geny', 'Check a Geny code')}
              </h2>
              <p className="text-xs text-[#736B83] dark:text-[#A59DBA]">
                {t(
                  'Consultez l’état et le quota restant d’un code d’activation avant de le recharger.',
                  'Check the status and remaining data of an activation code before topping up.'
                )}
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                verifyCode(lookupInput, 'standalone');
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <input
                type="text"
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value.toUpperCase())}
                placeholder="GENY-XXXX-XXXX-XXXX"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#E8E4F2] dark:border-[#2B2638] bg-[#F6F5FB] dark:bg-[#100E19] font-mono text-sm font-bold uppercase focus:outline-none focus:border-[#7544DD]"
              />
              <button
                type="submit"
                disabled={lookingUp || !lookupInput.trim()}
                className="h-11 px-5 rounded-xl bg-[#7544DD] text-white text-xs font-bold whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {lookingUp ? t('Recherche…', 'Checking…') : t('Vérifier', 'Lookup')}
              </button>
            </form>

            {lookupError && (
              <div className="text-xs font-medium text-[#D92D20] dark:text-[#FF6B6B]">{lookupError}</div>
            )}
            {lookupResult && (
              <div className="p-3.5 rounded-xl bg-[#F6F5FB] dark:bg-[#100E19] border border-[#E8E4F2] dark:border-[#2B2638] text-xs space-y-1">
                <div className="font-mono font-bold text-[#6733CF] dark:text-[#BCA3FF]">
                  {lookupResult.code} · {lookupResult.plan_name}
                </div>
                <div className="text-[#736B83] dark:text-[#A59DBA]">
                  {t('Statut', 'Status')} : {lookupResult.status} · {formatQuota(lookupResult.quota_bytes, lang)}
                </div>
              </div>
            )}
          </div>

          {/* Apps & Community Card */}
          <div
            id="apps"
            className="p-6 rounded-3xl bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] space-y-4 scroll-mt-20"
          >
            <h2 className="font-display text-xl font-bold">
              {t('Installer l’application Geny', 'Install the Geny app')}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href={android?.url || '/api/v1/app/android.apk'}
                download={`Geny_v${android?.version_name || '1.3.8'}.apk`}
                className="flex items-center gap-3 p-3.5 rounded-2xl text-white bg-gradient-to-br from-[#9160F7] to-[#6733CF] hover:brightness-105 transition-all"
              >
                <span className="w-9 h-9 rounded-xl bg-white text-[#3DDC84] flex items-center justify-center shrink-0">
                  <AndroidIcon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">Android</div>
                  <div className="text-[11px] text-white/85 truncate tabular-nums">
                    {android ? formatSize(android.size, lang) : '11,6 Mo'}
                  </div>
                </div>
                <ArrowDown className="w-4 h-4 ml-auto shrink-0" />
              </a>

              <a
                href={windows?.url || '/api/v1/app/windows.exe'}
                download={`Geny_v${windows?.version_name || '1.3.8'}.exe`}
                className="flex items-center gap-3 p-3.5 rounded-2xl text-white bg-gradient-to-br from-[#9160F7] to-[#6733CF] hover:brightness-105 transition-all"
              >
                <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 p-1.5">
                  <WindowsIcon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">Windows</div>
                  <div className="text-[11px] text-white/85 truncate tabular-nums">
                    {windows ? formatSize(windows.size, lang) : '22,7 Mo'}
                  </div>
                </div>
                <ArrowDown className="w-4 h-4 ml-auto shrink-0" />
              </a>

              <a
                href={guide?.url || '/api/v1/guide.pdf'}
                download="Geny_Guide.pdf"
                className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF] border border-[#E8E4F2] dark:border-[#3A3349]"
              >
                <FileText className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{t('Guide PDF', 'PDF Guide')}</div>
                  <div className="text-[11px] opacity-80 truncate">
                    {guide ? formatSize(guide.size, lang) : '2,6 Mo'}
                  </div>
                </div>
              </a>

              {catalog?.community?.[0] && (
                <a
                  href={catalog.community[0].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#F6F5FB] dark:bg-[#100E19] border border-[#E8E4F2] dark:border-[#2B2638] hover:border-[#25D366]"
                >
                  <span className="w-8 h-8 rounded-lg bg-[#25D366] text-white flex items-center justify-center shrink-0">
                    <WhatsAppIcon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">WhatsApp</div>
                    <div className="text-[11px] text-[#736B83] dark:text-[#A59DBA] truncate">
                      {t('Chaîne officielle', 'Official channel')}
                    </div>
                  </div>
                </a>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full max-w-[1160px] mx-auto px-4 sm:px-6 py-5 border-t border-[#E8E4F2] dark:border-[#2B2638] flex flex-wrap items-center justify-between gap-4 text-xs text-[#736B83] dark:text-[#A59DBA]">
        <span>© {catalog?.reseller_name || 'Samari'} · Geny</span>
        <div className="flex flex-wrap items-center gap-4">
          <a
            href="/geny-shop-vps.zip"
            download="geny-shop-vps.zip"
            className="hover:text-[#7544DD] dark:hover:text-[#BCA3FF] font-semibold transition-colors"
          >
            {t('Code source VPS (.zip)', 'VPS source (.zip)')}
          </a>
          <button
            type="button"
            onClick={onOpenResellerPortal}
            className="hover:text-[#211A35] dark:hover:text-white transition-colors cursor-pointer"
          >
            {t('Espace revendeur', 'Reseller portal')}
          </button>
          <button
            type="button"
            onClick={onOpenApiSpace}
            className="hover:text-[#211A35] dark:hover:text-white transition-colors cursor-pointer"
          >
            {t('Espace API', 'API Space')}
          </button>
          <span>{t('Votre internet. Sans BullShit.', 'Your internet. No BullShit.')}</span>
        </div>
      </footer>

      {/* ── Checkout Modal (Mode Direct API flow) ── */}
      {checkoutPlan && (
        <div className="fixed inset-0 z-50 bg-[#140F24]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[440px] bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] rounded-3xl p-6 shadow-xl flex flex-col gap-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#7544DD] dark:text-[#BCA3FF]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{t('Paiement direct sécurisé', 'Secure direct checkout')}</span>
                </div>
                <h3 className="font-display text-xl font-bold mt-0.5">
                  {purchaseIntent === 'topup'
                    ? t('Recharger un code', 'Top up a code')
                    : t('Acheter un forfait', 'Buy a plan')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutPlan(null)}
                className="w-8 h-8 rounded-lg border border-[#E8E4F2] dark:border-[#2B2638] flex items-center justify-center cursor-pointer"
                aria-label={t('Fermer', 'Close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selected Plan & Order Ref */}
            <div className="p-3.5 rounded-2xl bg-[#F6F5FB] dark:bg-[#100E19] border border-[#E8E4F2] dark:border-[#2B2638] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display font-bold text-sm truncate">{checkoutPlan.name}</div>
                <div className="text-xs text-[#736B83] dark:text-[#A59DBA] tabular-nums">
                  {formatQuota(checkoutPlan.quota_bytes, lang)} ·{' '}
                  {formatDuration(checkoutPlan.duration_value, checkoutPlan.duration_unit, lang)}
                </div>
                <div className="mt-1 font-mono text-[11px] text-[#736B83] dark:text-[#A59DBA] truncate">
                  {orderRef}
                </div>
              </div>
              <div className="font-display text-lg font-extrabold text-[#7544DD] dark:text-[#BCA3FF] tabular-nums shrink-0">
                {formatFcfa(checkoutPlan.price_fcfa, lang)}
              </div>
            </div>

            {/* Form before order creation */}
            {!activeOrder && (
              <form onSubmit={handleCreateOrder} className="space-y-4">
                {checkoutPlan.price_fcfa > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-2.5">
                      {(['mtn', 'orange'] as const).map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setOperator(op)}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border text-left cursor-pointer ${
                            operator === op
                              ? 'border-[#7544DD] bg-[#EFE7FF]/50 dark:bg-[#2C2145]'
                              : 'border-[#E8E4F2] dark:border-[#2B2638] bg-[#F6F5FB] dark:bg-[#100E19]'
                          }`}
                        >
                          {op === 'mtn' ? <MtnLogo className="w-8 h-8" /> : <OrangeLogo className="w-8 h-8" />}
                          <div className="text-xs font-bold">
                            {op === 'mtn' ? 'MTN MoMo' : 'Orange Money'}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="shopPhoneInput" className="text-xs font-semibold">
                        {t('Numéro Mobile Money (+237)', 'Mobile Money number (+237)')}
                      </label>
                      <div className="flex items-center rounded-xl border border-[#E8E4F2] dark:border-[#2B2638] bg-[#F6F5FB] dark:bg-[#100E19] focus-within:border-[#7544DD] overflow-hidden">
                        <span className="px-3 text-sm font-bold text-[#736B83] border-r border-[#E8E4F2] dark:border-[#2B2638] tabular-nums">
                          +237
                        </span>
                        <input
                          id="shopPhoneInput"
                          type="tel"
                          inputMode="numeric"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="6XX XX XX XX"
                          className="w-full px-3 py-2.5 bg-transparent text-sm font-semibold tabular-nums focus:outline-none"
                          required
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-3 rounded-xl bg-[#237C5D]/10 text-xs font-medium text-[#237C5D] dark:text-[#86DFB8]">
                    {t(
                      'Forfait d’essai gratuit : votre code est généré immédiatement sans paiement.',
                      'Free trial plan: your code is generated immediately without payment.'
                    )}
                  </div>
                )}

                {checkoutError && (
                  <div className="text-xs font-medium text-[#D92D20] dark:text-[#FF6B6B] bg-[#D92D20]/10 rounded-xl px-3 py-2.5">
                    {checkoutError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submittingOrder}
                  className="w-full h-11 rounded-xl bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white font-bold text-sm cursor-pointer disabled:opacity-60"
                >
                  {submittingOrder
                    ? t('Envoi…', 'Submitting…')
                    : checkoutPlan.price_fcfa === 0
                    ? t('Obtenir le code gratuit', 'Get free code')
                    : t('Confirmer le paiement', 'Confirm payment')}
                </button>
              </form>
            )}

            {/* Pending / OTP / Failed Order View */}
            {activeOrder && activeOrder.status === 'pending' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#EFE7FF]/60 dark:bg-[#2C2145] border border-[#E8E4F2] dark:border-[#3A3349]">
                  <Smartphone className="w-5 h-5 text-[#7544DD] dark:text-[#BCA3FF] shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <div className="font-bold">
                      {activeOrder.payment?.requires_otp
                        ? t('Code SMS requis', 'SMS OTP required')
                        : t('En attente de validation sur votre téléphone', 'Waiting for phone approval')}
                    </div>
                    <div className="text-[#736B83] dark:text-[#BCB4CD]">
                      {activeOrder.payment?.otp_instruction || activeOrder.payment?.ussd_instruction}
                    </div>
                  </div>
                </div>

                {activeOrder.payment?.requires_otp && (
                  <form onSubmit={handleSubmitOtp} className="space-y-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder={t('Code reçu par SMS (ex. 1234)', 'SMS code (e.g. 1234)')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E4F2] dark:border-[#2B2638] bg-[#F6F5FB] dark:bg-[#100E19] text-center font-mono text-base font-bold tracking-widest"
                      required
                    />
                    <button
                      type="submit"
                      disabled={submittingOrder}
                      className="w-full h-11 rounded-xl bg-[#7544DD] text-white text-sm font-bold cursor-pointer"
                    >
                      {t('Valider le code SMS', 'Submit SMS code')}
                    </button>
                  </form>
                )}

                {!activeOrder.payment?.requires_otp && (
                  <div className="flex items-center justify-center gap-2 py-2 text-xs text-[#736B83]">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#7544DD]" />
                    <span>{t('Interrogation de GET /orders…', 'Polling GET /orders…')}</span>
                  </div>
                )}

                {checkoutError && (
                  <div className="text-xs text-[#D92D20] dark:text-[#FF6B6B]">{checkoutError}</div>
                )}

                {activeOrder.test_mode && (
                  <div className="pt-3 border-t border-[#E8E4F2] dark:border-[#2B2638] space-y-2">
                    <div className="text-[11px] font-semibold text-[#736B83] dark:text-[#A59DBA] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#7544DD]" />
                      <span>{t('Mode Test · Simuler le retour opérateur', 'Test Mode · Simulate operator')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSimulateOutcome('succeeded')}
                        className="h-9 rounded-lg bg-[#237C5D]/12 text-[#237C5D] dark:text-[#86DFB8] text-xs font-bold cursor-pointer"
                      >
                        {t('Simuler succès', 'Simulate success')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulateOutcome('failed')}
                        className="h-9 rounded-lg bg-[#D92D20]/10 text-[#D92D20] dark:text-[#FF6B6B] text-xs font-bold cursor-pointer"
                      >
                        {t('Simuler échec', 'Simulate failure')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Failed Order */}
            {activeOrder && (activeOrder.status === 'failed' || activeOrder.status === 'expired') && (
              <div className="space-y-4 text-center">
                <div className="w-11 h-11 mx-auto rounded-2xl bg-[#D92D20]/10 text-[#D92D20] flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="text-sm font-bold">
                  {activeOrder.failure_reason || t('Le paiement n’a pas abouti.', 'Payment did not complete.')}
                </div>
                <button
                  type="button"
                  onClick={() => openCheckout(checkoutPlan)}
                  className="w-full h-10 rounded-xl bg-[#7544DD] text-white text-xs font-bold cursor-pointer"
                >
                  {t('Réessayer avec une nouvelle référence', 'Retry with new order_ref')}
                </button>
              </div>
            )}

            {/* Succeeded Order */}
            {activeOrder && activeOrder.status === 'succeeded' && (
              <div className="space-y-4 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[#237C5D]/15 text-[#237C5D] dark:text-[#86DFB8] flex items-center justify-center">
                  <Check className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-display text-lg font-bold">
                    {activeOrder.code_kind === 'topup'
                      ? t('Code rechargé avec succès !', 'Code topped up!')
                      : t('Paiement confirmé !', 'Payment confirmed!')}
                  </h4>
                  <p className="text-xs text-[#736B83] dark:text-[#A59DBA] mt-1">
                    {activeOrder.code_kind === 'topup' && activeOrder.code_balance
                      ? `${t('Nouveau quota', 'New quota')} : ${formatQuota(
                          activeOrder.code_balance.quota_bytes ?? null,
                          lang
                        )}`
                      : t('Voici votre code d’activation Geny :', 'Here is your Geny activation code:')}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#EFE7FF] dark:bg-[#2C2145] border border-dashed border-[#7544DD] font-mono text-xl font-bold tracking-wider text-[#6733CF] dark:text-[#BCA3FF] select-all">
                  {activeOrder.code}
                </div>

                {activeOrder.code && (
                  <button
                    type="button"
                    onClick={() => copyCode(activeOrder.code!)}
                    className="w-full h-11 rounded-xl bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedCode ? t('Copié !', 'Copied!') : t('Copier le code', 'Copy code')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mes Codes Modal ── */}
      {showSavedModal && (
        <div className="fixed inset-0 z-50 bg-[#140F24]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-[500px] bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] rounded-3xl p-6 shadow-xl flex flex-col gap-4 max-h-[85vh]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-bold">{t('Mes codes Geny', 'My Geny codes')}</h3>
              <button
                type="button"
                onClick={() => setShowSavedModal(false)}
                className="w-8 h-8 rounded-lg border border-[#E8E4F2] dark:border-[#2B2638] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F6F5FB] dark:bg-[#100E19] border border-[#E8E4F2] dark:border-[#2B2638]">
              <Search className="w-4 h-4 text-[#736B83]" />
              <input
                type="text"
                value={savedFilter}
                onChange={(e) => setSavedFilter(e.target.value)}
                placeholder={t('Rechercher un code…', 'Search a code…')}
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#E8E4F2] dark:divide-[#2B2638]">
              {filteredSaved.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#736B83] dark:text-[#A59DBA]">
                  {t('Aucun code acheté dans ce navigateur.', 'No codes purchased in this browser yet.')}
                </div>
              ) : (
                filteredSaved.map((c, idx) => (
                  <div key={`${c.code}-${idx}`} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-sm text-[#6733CF] dark:text-[#BCA3FF]">
                        {c.code}
                      </div>
                      <div className="text-xs text-[#736B83] dark:text-[#A59DBA]">
                        {c.plan_name} · {formatFcfa(c.price_fcfa, lang)} · {formatTimestamp(c.created, lang)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyCode(c.code)}
                      className="px-3 py-1.5 rounded-lg bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF] text-xs font-semibold cursor-pointer"
                    >
                      {t('Copier', 'Copy')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
