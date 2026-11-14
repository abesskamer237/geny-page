import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  Check,
  Code2,
  Copy,
  FileText,
  Globe,
  KeyRound,
  LogOut,
  MessageCircle,
  Moon,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sun,
  User,
  X,
  Clock,
  RotateCcw,
} from 'lucide-react';
import type {
  Lang,
  Operator,
  PendingPayment,
  Plan,
  PortalMe,
  SavedCode,
  ThemeMode,
} from '../types/geny';
import {
  AndroidIcon,
  GenyLogoMark,
  MtnLogo,
  OrangeLogo,
  WindowsIcon,
  formatDuration,
  formatFcfa,
  formatQuota,
  formatSize,
  formatTimestamp,
} from './Icons';

interface SalePortalProps {
  portalInfo: PortalMe;
  lang: Lang;
  theme: ThemeMode;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onOpenApiSpace: () => void;
  onLoggedOut: () => void;
  onOpenShop?: () => void;
}

type PlanFilter = 'all' | 'short' | 'weekly_monthly' | 'unlimited';

interface ChatMessage {
  id: string;
  from: 'bot' | 'user';
  text: string;
}

export function SalePortal({
  portalInfo,
  lang,
  theme,
  onToggleLang,
  onToggleTheme,
  onOpenApiSpace,
  onLoggedOut,
  onOpenShop,
}: SalePortalProps) {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all');

  // Saved codes in localStorage keyed by reseller login
  const storageKey = `geny_saved_codes_${portalInfo.login || 'default'}`;
  const [savedCodes, setSavedCodes] = useState<SavedCode[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as SavedCode[]) : [];
    } catch {
      return [];
    }
  });

  // Pending payments in current session
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);

  // Active modals
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [payStep, setPayStep] = useState<'form' | 'wait' | 'success'>('form');
  const [payOperator, setPayOperator] = useState<'mtn' | 'orange'>('mtn');
  const [payPhone, setPayPhone] = useState('');
  const [payError, setPayError] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [activePayment, setActivePayment] = useState<PendingPayment | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const [showSavedModal, setShowSavedModal] = useState(false);
  const [savedSearch, setSavedSearch] = useState('');
  const [lookupResult, setLookupResult] = useState<Record<string, string>>({});

  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showSellerModal, setShowSellerModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Assistant Geny chat widget
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      from: 'bot',
      text:
        lang === 'en'
          ? 'Hello! I am the Geny assistant. Ask me about plans, Mobile Money payments, or your access codes.'
          : 'Bonjour ! Je suis l’assistant Geny. Posez-moi une question sur les forfaits, le paiement Mobile Money ou vos codes.',
    },
  ]);

  async function loadData(isManualRefresh = false) {
    if (isManualRefresh) setRefreshing(true);
    try {
      const [plansRes, cfgRes] = await Promise.all([
        fetch('/api/v1/public/plans', { headers: { Accept: 'application/json' } }),
        fetch('/api/v1/payment/public-config', { headers: { Accept: 'application/json' } }),
      ]);
      if (plansRes.ok) {
        const pData = await plansRes.json();
        setPlans(pData.plans || []);
      }
      if (cfgRes.ok) {
        const cData = await cfgRes.json();
        setOperators(cData.operators || []);
      }
    } finally {
      setLoadingPlans(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(savedCodes));
    } catch {
      // ignore storage quota
    }
  }, [savedCodes, storageKey]);

  // Auto-detect MTN vs Orange prefix as user types
  useEffect(() => {
    const clean = payPhone.replace(/\D/g, '');
    const national = clean.startsWith('237') ? clean.slice(3) : clean;
    if (national.length >= 2 && operators.length > 0) {
      const match = operators.find((op) => op.prefixes.some((p) => national.startsWith(p)));
      if (match) {
        setPayOperator(match.id);
      }
    }
  }, [payPhone, operators]);

  // Poll pending payment status while in 'wait' step
  useEffect(() => {
    if (payStep !== 'wait' || !activePayment || activePayment.status !== 'pending') return;

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(
          `/api/v1/payment/status?reference=${encodeURIComponent(activePayment.reference)}`,
          { headers: { Accept: 'application/json' } }
        );
        if (!res.ok) return;
        const data = await res.json();
        setPendingPayments((prev) =>
          prev.map((p) => (p.reference === activePayment.reference ? { ...p, status: data.status, code: data.code } : p))
        );

        if (data.status === 'otp_required') {
          setActivePayment((prev) => (prev ? { ...prev, status: 'otp_required' } : prev));
        } else if (data.status === 'succeeded' && data.code) {
          handlePaymentSucceeded(data.code, activePayment.plan_id, activePayment.plan_name, activePayment.amount_fcfa, activePayment.operator, activePayment.phone);
        }
      } catch {
        // retry on next tick
      }
    }, 1800);

    return () => window.clearInterval(timer);
  }, [payStep, activePayment]);

  function handlePaymentSucceeded(
    code: string,
    planId: string,
    planName: string,
    priceFcfa: number,
    operator?: string,
    phone?: string
  ) {
    setGeneratedCode(code);
    setPayStep('success');
    setActivePayment((prev) => (prev ? { ...prev, status: 'succeeded', code } : prev));
    setSavedCodes((prev) => {
      if (prev.some((c) => c.code === code)) return prev;
      return [
        {
          code,
          plan_id: planId,
          plan_name: planName,
          price_fcfa: priceFcfa,
          created: Math.floor(Date.now() / 1000),
          operator,
          phone,
        },
        ...prev,
      ];
    });
  }

  function openBuyModal(plan: Plan) {
    setSelectedPlan(plan);
    setPayStep('form');
    setPayError('');
    setOtpInput('');
    setGeneratedCode('');
    setCopiedCode(false);
    setActivePayment(null);
  }

  async function handleInitiatePayment() {
    if (!selectedPlan) return;
    setPayError('');

    if (selectedPlan.price_fcfa === 0) {
      setPaySubmitting(true);
      try {
        const res = await fetch('/api/v1/payment/free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ plan_id: selectedPlan.id }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPayError(data.error || t('Impossible de générer le code.', 'Could not generate code.'));
          return;
        }
        handlePaymentSucceeded(data.code, selectedPlan.id, selectedPlan.name, 0);
      } catch {
        setPayError(t('Erreur réseau. Réessayez.', 'Network error. Please retry.'));
      } finally {
        setPaySubmitting(false);
      }
      return;
    }

    setPaySubmitting(true);
    try {
      const res = await fetch('/api/v1/payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          plan_id: selectedPlan.id,
          operator: payOperator,
          phone: payPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayError(data.error || t('Paiement refusé.', 'Payment rejected.'));
        return;
      }

      const newPending: PendingPayment = {
        reference: data.reference,
        plan_id: selectedPlan.id,
        plan_name: selectedPlan.name,
        amount_fcfa: data.amount_fcfa,
        operator: data.operator,
        phone: data.phone,
        status: 'pending',
        instruction: data.instruction,
        created: Math.floor(Date.now() / 1000),
      };
      setActivePayment(newPending);
      setPendingPayments((prev) => [newPending, ...prev]);
      setPayStep('wait');
    } catch {
      setPayError(t('Connexion interrompue.', 'Connection interrupted.'));
    } finally {
      setPaySubmitting(false);
    }
  }

  async function handleConfirmOtp() {
    if (!activePayment) return;
    setPayError('');
    setPaySubmitting(true);
    try {
      const res = await fetch('/api/v1/payment/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ reference: activePayment.reference, otp: otpInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayError(data.error || t('Code SMS invalide.', 'Invalid SMS code.'));
        return;
      }
      setPendingPayments((prev) =>
        prev.map((p) =>
          p.reference === activePayment.reference ? { ...p, status: 'succeeded', code: data.code } : p
        )
      );
      handlePaymentSucceeded(
        data.code,
        activePayment.plan_id,
        activePayment.plan_name,
        activePayment.amount_fcfa,
        activePayment.operator,
        activePayment.phone
      );
    } catch {
      setPayError(t('Erreur réseau.', 'Network error.'));
    } finally {
      setPaySubmitting(false);
    }
  }

  async function handleCancelPayment() {
    if (!activePayment) {
      setSelectedPlan(null);
      return;
    }
    await fetch('/api/v1/payment/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ reference: activePayment.reference }),
    }).catch(() => {});
    setPendingPayments((prev) =>
      prev.map((p) => (p.reference === activePayment.reference ? { ...p, status: 'cancelled' } : p))
    );
    setSelectedPlan(null);
    setActivePayment(null);
  }

  async function handleLookupCode(code: string) {
    try {
      const res = await fetch(`/api/v1/codes/lookup?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (res.ok) {
        const label =
          data.status === 'unused'
            ? t('Prêt à activer', 'Ready to activate')
            : data.status === 'active'
            ? t('Actif', 'Active')
            : t('Expiré', 'Expired');
        setLookupResult((prev) => ({ ...prev, [code]: label }));
      } else {
        setLookupResult((prev) => ({ ...prev, [code]: t('Introuvable', 'Not found') }));
      }
    } catch {
      setLookupResult((prev) => ({ ...prev, [code]: t('Erreur', 'Error') }));
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/v1/portal/logout', { method: 'POST' });
      onLoggedOut();
    } finally {
      setLoggingOut(false);
    }
  }

  function copyText(val: string) {
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1800);
  }

  function handleChatCommand(cmdOrText: string) {
    const trimmed = cmdOrText.trim();
    if (!trimmed) return;
    const userMsg: ChatMessage = { id: `u_${Date.now()}`, from: 'user', text: trimmed };

    const lower = trimmed.toLowerCase();
    let reply = '';
    if (lower.includes('forfait') || lower.includes('plan') || lower === 'plans') {
      reply = t(
        `Nous proposons ${plans.length} forfaits de 0 FCFA (Pass Test 2 Go / 2h) jusqu’au Pass Mensuel Maxi illimité à 6 000 FCFA. Cliquez sur un forfait pour générer un code.`,
        `We offer ${plans.length} plans from 0 FCFA (Pass Test 2 GB / 2h) up to Pass Mensuel Maxi unlimited at 6,000 FCFA. Click any plan to generate a code.`
      );
    } else if (lower.includes('recharg') || lower === 'topup') {
      reply = t(
        'Pour recharger votre solde prépayé ou vendre depuis votre site, ouvrez « Espace API » depuis le bouton de votre compte revendeur en haut.',
        'To top up your prepaid wallet or sell from your website, open “API Space” from your reseller account menu at the top.'
      );
    } else if (lower.includes('code') || lower === 'codes') {
      reply = t(
        `Vous avez ${savedCodes.length} code(s) sauvegardé(s) dans ce navigateur. Ouvrez « Mes codes » dans la barre du haut pour les copier ou vérifier leur état.`,
        `You have ${savedCodes.length} saved code(s) in this browser. Open “My codes” in the top bar to copy or verify them.`
      );
    } else if (lower.includes('aide') || lower.includes('help')) {
      reply = t(
        '1) Choisissez un forfait et entrez le numéro MTN MoMo ou Orange Money (+237). 2) Validez sur le téléphone ou saisissez le code SMS. 3) Transmettez le code GENY-XXXX au client.',
        '1) Pick a plan and enter the MTN MoMo or Orange Money number (+237). 2) Approve on the phone or enter the SMS OTP. 3) Share the GENY-XXXX code with the customer.'
      );
    } else {
      reply = t(
        'Merci pour votre message. Utilisez les raccourcis ci-dessous pour consulter les forfaits, vos codes ou l’Espace API revendeur.',
        'Thanks for your message. Use the shortcuts below to browse plans, your saved codes, or the Reseller API Space.'
      );
    }

    const botMsg: ChatMessage = { id: `b_${Date.now() + 1}`, from: 'bot', text: reply };
    setChatMessages((prev) => [...prev, userMsg, botMsg]);
    setChatInput('');
  }

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      if (planFilter === 'all') return true;
      if (planFilter === 'unlimited') return p.quota_bytes === null;
      if (planFilter === 'short') return p.quota_bytes !== null && (p.duration_unit === 'hours' || p.duration_value <= 3);
      if (planFilter === 'weekly_monthly') return p.quota_bytes !== null && p.duration_unit === 'days' && p.duration_value >= 7;
      return true;
    });
  }, [plans, planFilter]);

  const filteredSavedCodes = useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    if (!q) return savedCodes;
    return savedCodes.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.plan_name.toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
    );
  }, [savedCodes, savedSearch]);

  const activePendingCount = pendingPayments.filter((p) => p.status === 'pending' || p.status === 'otp_required').length;
  const android = portalInfo.apps?.android;
  const windows = portalInfo.apps?.windows;
  const guide = portalInfo.guide;

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F5FB] dark:bg-[#100E19] text-[#211A35] dark:text-[#F6F3FF]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#F6F5FB]/90 dark:bg-[#100E19]/90 backdrop-blur-md border-b border-[#E8E4F2] dark:border-[#2B2638]">
        <div className="w-full max-w-[1160px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
              <GenyLogoMark className="w-8 h-8" />
              <span className="font-display text-lg font-bold tracking-tight">Geny</span>
            </div>

            <button
              type="button"
              onClick={() => setShowSellerModal(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF] border border-[#E8E4F2] dark:border-[#3A3349] text-xs font-semibold hover:brightness-95 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="max-w-[140px] truncate">{portalInfo.name || portalInfo.login}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {pendingPayments.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPendingModal(true)}
                className="h-9 px-3 rounded-lg bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] text-xs font-semibold hover:border-[#7544DD] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-[#D97706]" />
                <span className="hidden sm:inline">{t('Paiements', 'Payments')}</span>
                <span className="tabular-nums font-mono text-[11px] font-bold text-[#7544DD] dark:text-[#BCA3FF]">
                  {activePendingCount > 0 ? activePendingCount : pendingPayments.length}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowSavedModal(true)}
              className="h-9 px-3 rounded-lg bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] text-xs font-semibold hover:border-[#7544DD] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#7544DD] dark:text-[#BCA3FF]" />
              <span>{t('Mes codes', 'My codes')}</span>
              <span className="tabular-nums font-mono text-[11px] font-bold text-[#736B83] dark:text-[#A59DBA]">
                {savedCodes.length}
              </span>
            </button>

            {onOpenShop && (
              <button
                type="button"
                onClick={onOpenShop}
                className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] text-xs font-semibold hover:border-[#7544DD] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>{t('Boutique', 'Storefront')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenApiSpace}
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white text-xs font-semibold hover:brightness-105 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{t('Espace API', 'API Space')}</span>
            </button>

            <button
              type="button"
              onClick={onToggleLang}
              className="h-9 px-2.5 rounded-lg bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] text-xs font-semibold text-[#4A4460] dark:text-[#CFC8E0] hover:border-[#7544DD] transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              aria-label={t('Changer de langue', 'Switch language')}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang.toUpperCase()}</span>
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              className="w-9 h-9 rounded-lg bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] text-[#4A4460] dark:text-[#CFC8E0] hover:border-[#7544DD] transition-colors inline-flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={t('Basculer le thème', 'Toggle theme')}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => loadData(true)}
              className="w-9 h-9 rounded-lg bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] text-[#7544DD] dark:text-[#BCA3FF] hover:border-[#7544DD] transition-colors inline-flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={t('Actualiser', 'Refresh')}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1160px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-10">
        {/* Hero + Downloads */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-8 items-start">
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="font-display text-4xl sm:text-5xl font-bold leading-[1.06] tracking-tight text-balance">
                {t('Votre internet.', 'Your internet.')}
                <br />
                {t('Sans ', 'No ')}
                <span className="font-serif-accent text-[#D92D20] dark:text-[#FF6B6B]">BullShit</span>.
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-[#736B83] dark:text-[#BCB4CD] max-w-[540px]">
                {t(
                  'Un forfait simple, activé en un geste, sur votre téléphone Android ou votre ordinateur Windows.',
                  'A simple plan, activated in one tap, on your Android phone or Windows computer.'
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-[#736B83] dark:text-[#A59DBA]">
              <span>{t('Activation en 1 geste', 'One-tap activation')}</span>
              <span aria-hidden="true">·</span>
              <span>{t('Android et Windows', 'Android and Windows')}</span>
              <span aria-hidden="true">·</span>
              <span>{t('Sans engagement', 'No commitment')}</span>
            </div>

            {/* 3 steps strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {[
                { num: '1', text: t('Achetez un code chez un revendeur', 'Buy a code from a reseller') },
                { num: '2', text: t('Installez Geny', 'Install Geny') },
                { num: '3', text: t('Activez et connectez-vous', 'Activate and connect') },
              ].map((step) => (
                <div
                  key={step.num}
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638]"
                >
                  <span className="w-7 h-7 rounded-lg bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF] font-display font-bold text-xs flex items-center justify-center shrink-0 tabular-nums">
                    {step.num}
                  </span>
                  <span className="text-xs font-semibold leading-snug">{step.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* App Downloads Card */}
          <div className="flex flex-col gap-3">
            <a
              href={android?.url || '/api/v1/app/android.apk'}
              download={`Geny_v${android?.version_name || '1.3.8'}.apk`}
              className="flex items-center gap-3.5 min-h-[62px] px-4 py-3 rounded-2xl text-white bg-gradient-to-br from-[#9160F7] to-[#6733CF] shadow-sm hover:brightness-105 transition-all"
            >
              <span className="w-9 h-9 rounded-xl bg-white text-[#3DDC84] flex items-center justify-center shrink-0">
                <AndroidIcon className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[15px] leading-tight">Android</div>
                <div className="text-xs text-white/85 tabular-nums">
                  Android 8+ · {android ? formatSize(android.size, lang) : '11,6 Mo'}
                </div>
              </div>
              <ArrowDown className="w-4 h-4 ml-auto opacity-85 shrink-0" />
            </a>

            <a
              href={windows?.url || '/api/v1/app/windows.exe'}
              download={`Geny_v${windows?.version_name || '1.3.8'}.exe`}
              className="flex items-center gap-3.5 min-h-[62px] px-4 py-3 rounded-2xl text-white bg-gradient-to-br from-[#9160F7] to-[#6733CF] shadow-sm hover:brightness-105 transition-all"
            >
              <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 p-1.5">
                <WindowsIcon className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[15px] leading-tight">Windows</div>
                <div className="text-xs text-white/85 tabular-nums">
                  Windows 10 / 11 · {windows ? formatSize(windows.size, lang) : '22,7 Mo'}
                </div>
              </div>
              <ArrowDown className="w-4 h-4 ml-auto opacity-85 shrink-0" />
            </a>

            <a
              href={guide?.url || '/api/v1/guide.pdf'}
              download="Geny_Guide.pdf"
              className="flex items-center gap-3.5 min-h-[60px] px-4 py-3 rounded-2xl bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF] border border-[#E8E4F2] dark:border-[#3A3349] hover:brightness-98 transition-all"
            >
              <span className="w-9 h-9 rounded-xl bg-[#7544DD] text-white flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-[15px] leading-tight">
                  {t('Guide d’utilisation', 'User guide')}
                </div>
                <div className="text-xs opacity-85 truncate">
                  {t('PDF à envoyer à vos clients', 'PDF for your customers')} · {guide ? formatSize(guide.size, lang) : '2,6 Mo'}
                </div>
              </div>
              <ArrowDown className="w-4 h-4 ml-auto opacity-85 shrink-0" />
            </a>
          </div>
        </section>

        {/* Plans Panel */}
        <section className="flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                {t('Nos forfaits', 'Our plans')}
              </h2>
              <p className="mt-1 text-sm text-[#736B83] dark:text-[#BCB4CD]">
                {t(
                  'Codes d’activation en vente chez les revendeurs Geny. Cliquez sur un forfait pour générer un code.',
                  'Activation codes sold by Geny resellers. Click a plan to issue a code.'
                )}
              </p>
            </div>

            {/* Interactive Segmented Filter */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] self-start sm:self-auto overflow-x-auto">
              {[
                { id: 'all', label: t('Tous', 'All') },
                { id: 'short', label: t('Court terme', 'Short term') },
                { id: 'weekly_monthly', label: t('Semaine & Mois', 'Weekly & Monthly') },
                { id: 'unlimited', label: t('Illimité', 'Unlimited') },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPlanFilter(tab.id as PlanFilter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    planFilter === tab.id
                      ? 'bg-[#7544DD] text-white'
                      : 'text-[#736B83] dark:text-[#A59DBA] hover:text-[#211A35] dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loadingPlans ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-44 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredPlans.map((plan) => {
                const isFree = plan.price_fcfa === 0;
                const isUnlimited = plan.quota_bytes === null;
                const hasCustomMarkup =
                  typeof plan.wholesale_fcfa === 'number' && plan.price_fcfa > plan.wholesale_fcfa;

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
                        {isUnlimited && plan.fair_use && (
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
                      <div className="min-w-0">
                        <div
                          className={`font-display text-lg font-extrabold tabular-nums ${
                            isFree ? 'text-[#237C5D] dark:text-[#86DFB8]' : ''
                          }`}
                        >
                          {formatFcfa(plan.price_fcfa, lang)}
                        </div>
                        {hasCustomMarkup && (
                          <div className="text-[11px] text-[#736B83] dark:text-[#A59DBA] tabular-nums">
                            {t('Revendeur', 'Wholesale')} : {formatFcfa(plan.wholesale_fcfa!, lang)}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => openBuyModal(plan)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                          isFree
                            ? 'bg-[#237C5D]/12 text-[#237C5D] dark:text-[#86DFB8] hover:bg-[#237C5D]/20'
                            : 'bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white hover:brightness-105'
                        }`}
                      >
                        {isFree ? t('Obtenir', 'Get free') : t('Vendre', 'Sell')}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="w-full max-w-[1160px] mx-auto px-4 sm:px-6 py-5 border-t border-[#E8E4F2] dark:border-[#2B2638] flex items-center justify-between text-xs text-[#736B83] dark:text-[#A59DBA]">
        <span>© Geny</span>
        <span>{t('Votre internet. Sans BullShit.', 'Your internet. No BullShit.')}</span>
      </footer>

      {/* ── Payment Modal ── */}
      {selectedPlan && (
        <div className="fixed inset-0 z-50 bg-[#140F24]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[440px] bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] rounded-3xl p-6 shadow-xl flex flex-col gap-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#7544DD] dark:text-[#BCA3FF]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{t('Paiement sécurisé', 'Secure payment')}</span>
                </div>
                <h3 className="font-display text-xl font-bold mt-0.5">
                  {t('Acheter un forfait', 'Buy a plan')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
                className="w-8 h-8 rounded-lg border border-[#E8E4F2] dark:border-[#2B2638] flex items-center justify-center text-[#736B83] hover:text-[#211A35] dark:hover:text-white cursor-pointer"
                aria-label={t('Fermer', 'Close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stepper */}
            <ol className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
              {[
                { key: 'form', label: t('1. Paiement', '1. Payment') },
                { key: 'wait', label: t('2. Validation', '2. Approval') },
                { key: 'success', label: t('3. Votre code', '3. Your code') },
              ].map((st) => {
                const active = payStep === st.key;
                return (
                  <li
                    key={st.key}
                    className={`py-1.5 px-2 rounded-lg border ${
                      active
                        ? 'bg-[#EFE7FF] dark:bg-[#2C2145] border-[#7544DD] text-[#6733CF] dark:text-[#BCA3FF]'
                        : 'bg-[#F6F5FB] dark:bg-[#100E19] border-[#E8E4F2] dark:border-[#2B2638] text-[#736B83] dark:text-[#A59DBA]'
                    }`}
                  >
                    {st.label}
                  </li>
                );
              })}
            </ol>

            {/* Plan Summary */}
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#F6F5FB] dark:bg-[#100E19] border border-[#E8E4F2] dark:border-[#2B2638]">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-[#736B83] dark:text-[#A59DBA]">
                  {t('Forfait choisi', 'Selected plan')}
                </div>
                <div className="font-display font-bold text-sm truncate">{selectedPlan.name}</div>
                <div className="text-xs text-[#736B83] dark:text-[#A59DBA] tabular-nums">
                  {formatQuota(selectedPlan.quota_bytes, lang)} ·{' '}
                  {formatDuration(selectedPlan.duration_value, selectedPlan.duration_unit, lang)}
                </div>
              </div>
              <div className="font-display text-lg font-extrabold text-[#7544DD] dark:text-[#BCA3FF] tabular-nums shrink-0">
                {formatFcfa(selectedPlan.price_fcfa, lang)}
              </div>
            </div>

            {/* Step 1: Form */}
            {payStep === 'form' && (
              <div className="flex flex-col gap-4">
                {selectedPlan.price_fcfa > 0 ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-[#4A4460] dark:text-[#CFC8E0]">
                        {t('Opérateur Mobile Money', 'Mobile Money operator')}
                      </span>
                      <div className="grid grid-cols-2 gap-2.5">
                        {(['mtn', 'orange'] as const).map((op) => {
                          const selected = payOperator === op;
                          return (
                            <button
                              key={op}
                              type="button"
                              onClick={() => setPayOperator(op)}
                              className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                selected
                                  ? 'border-[#7544DD] bg-[#EFE7FF]/50 dark:bg-[#2C2145]'
                                  : 'border-[#E8E4F2] dark:border-[#2B2638] bg-[#F6F5FB] dark:bg-[#100E19]'
                              }`}
                            >
                              {op === 'mtn' ? (
                                <MtnLogo className="w-8 h-8 shrink-0" />
                              ) : (
                                <OrangeLogo className="w-8 h-8 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="text-xs font-bold truncate">
                                  {op === 'mtn' ? 'MTN MoMo' : 'Orange Money'}
                                </div>
                                <div className="text-[11px] text-[#736B83] dark:text-[#A59DBA]">
                                  Mobile Money
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="payPhoneInput" className="text-xs font-semibold text-[#4A4460] dark:text-[#CFC8E0]">
                        {t('Numéro Mobile Money', 'Mobile Money number')}
                      </label>
                      <div className="flex items-center rounded-xl border border-[#E8E4F2] dark:border-[#2B2638] bg-[#F6F5FB] dark:bg-[#100E19] focus-within:border-[#7544DD] overflow-hidden">
                        <span className="px-3 text-sm font-bold text-[#736B83] dark:text-[#A59DBA] border-r border-[#E8E4F2] dark:border-[#2B2638] tabular-nums">
                          +237
                        </span>
                        <input
                          id="payPhoneInput"
                          type="tel"
                          inputMode="numeric"
                          value={payPhone}
                          onChange={(e) => setPayPhone(e.target.value)}
                          placeholder="6XX XX XX XX"
                          className="w-full px-3 py-2.5 bg-transparent text-[15px] font-semibold tabular-nums focus:outline-none"
                        />
                      </div>
                      <span className="text-[11px] text-[#736B83] dark:text-[#A59DBA]">
                        {t('Le numéro qui recevra la demande de paiement.', 'The number that will receive the payment request.')}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[#237C5D] dark:text-[#86DFB8] bg-[#237C5D]/10 border border-[#237C5D]/20 rounded-xl p-3">
                    {t(
                      'Forfait d’essai gratuit : aucun paiement Mobile Money requis. Votre code est généré instantanément.',
                      'Free trial plan: no Mobile Money payment required. Your code is issued immediately.'
                    )}
                  </p>
                )}

                {payError && (
                  <div className="text-xs font-medium text-[#D92D20] dark:text-[#FF6B6B] bg-[#D92D20]/10 border border-[#D92D20]/20 rounded-xl px-3 py-2.5">
                    {payError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleInitiatePayment}
                  disabled={paySubmitting}
                  className="w-full h-11 rounded-xl bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white font-bold text-sm shadow-sm hover:brightness-105 disabled:opacity-60 transition-all cursor-pointer"
                >
                  {paySubmitting
                    ? t('Traitement…', 'Processing…')
                    : selectedPlan.price_fcfa === 0
                    ? t('Générer le code gratuit', 'Generate free code')
                    : t('Valider le paiement', 'Confirm payment')}
                </button>

                {selectedPlan.price_fcfa > 0 && (
                  <p className="text-center text-[11px] text-[#736B83] dark:text-[#A59DBA]">
                    {t(
                      'Votre code secret Mobile Money ne vous est jamais demandé ici.',
                      'Your Mobile Money PIN is never asked here.'
                    )}
                  </p>
                )}
              </div>
            )}

            {/* Step 2: Waiting / OTP */}
            {payStep === 'wait' && activePayment && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#EFE7FF]/60 dark:bg-[#2C2145] border border-[#E8E4F2] dark:border-[#3A3349]">
                  <Smartphone className="w-6 h-6 text-[#7544DD] dark:text-[#BCA3FF] shrink-0" />
                  <div>
                    <div className="font-bold text-sm">
                      {activePayment.status === 'otp_required'
                        ? t('Entrez le code reçu par SMS', 'Enter the SMS code')
                        : t('Validez sur votre téléphone', 'Approve on your phone')}
                    </div>
                    <div className="text-xs text-[#736B83] dark:text-[#BCB4CD]">
                      {activePayment.instruction}
                    </div>
                  </div>
                </div>

                {activePayment.status === 'otp_required' ? (
                  <div className="flex flex-col gap-3">
                    <label htmlFor="otpInput" className="text-xs font-semibold">
                      {t('Code reçu par SMS (ex. 1234)', 'Code received by SMS (e.g. 1234)')}
                    </label>
                    <input
                      id="otpInput"
                      type="text"
                      inputMode="numeric"
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      placeholder="• • • •"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E4F2] dark:border-[#2B2638] bg-[#F6F5FB] dark:bg-[#100E19] text-center font-mono text-lg font-bold tracking-widest"
                    />
                    {payError && (
                      <div className="text-xs text-[#D92D20] dark:text-[#FF6B6B]">{payError}</div>
                    )}
                    <button
                      type="button"
                      onClick={handleConfirmOtp}
                      disabled={paySubmitting}
                      className="w-full h-11 rounded-xl bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white font-bold text-sm cursor-pointer"
                    >
                      {t('Confirmer le code', 'Confirm code')}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <RefreshCw className="w-6 h-6 text-[#7544DD] dark:text-[#BCA3FF] animate-spin" />
                    <span className="text-xs font-medium text-[#736B83] dark:text-[#A59DBA]">
                      {t('Vérification de la transaction Mobile Money…', 'Checking Mobile Money transaction…')}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-[#E8E4F2] dark:border-[#2B2638] text-xs">
                  <span className="font-mono text-[#736B83] dark:text-[#A59DBA]">{activePayment.reference}</span>
                  <button
                    type="button"
                    onClick={handleCancelPayment}
                    className="font-semibold text-[#D92D20] dark:text-[#FF6B6B] hover:underline cursor-pointer"
                  >
                    {t('Annuler', 'Cancel')}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Success */}
            {payStep === 'success' && (
              <div className="flex flex-col gap-4 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-[#237C5D]/15 text-[#237C5D] dark:text-[#86DFB8] flex items-center justify-center">
                  <Check className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-display text-lg font-bold">
                    {t('Paiement confirmé !', 'Payment confirmed!')}
                  </h4>
                  <p className="text-xs text-[#736B83] dark:text-[#A59DBA] mt-1">
                    {t('Voici votre code d’accès personnel :', 'Here is your personal access code:')}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#EFE7FF] dark:bg-[#2C2145] border border-dashed border-[#7544DD] font-mono text-xl font-bold tracking-wider text-[#6733CF] dark:text-[#BCA3FF] select-all">
                  {generatedCode}
                </div>

                <button
                  type="button"
                  onClick={() => copyText(generatedCode)}
                  className="w-full h-11 rounded-xl bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? t('Code copié !', 'Copied!') : t('Copier le code', 'Copy code')}</span>
                </button>

                <ol className="text-left text-xs text-[#736B83] dark:text-[#BCB4CD] space-y-1.5 pl-4 list-decimal">
                  <li>{t('Installez l’application Geny (Android ou Windows).', 'Install the Geny app (Android or Windows).')}</li>
                  <li>{t('Collez ce code dans l’application pour activer votre forfait.', 'Paste this code in the app to activate your plan.')}</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mes Codes Modal ── */}
      {showSavedModal && (
        <div className="fixed inset-0 z-50 bg-[#140F24]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-[520px] bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] rounded-3xl p-6 shadow-xl flex flex-col gap-4 max-h-[85vh]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-bold">{t('Mes codes d’accès', 'My access codes')}</h3>
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
                value={savedSearch}
                onChange={(e) => setSavedSearch(e.target.value)}
                placeholder={t('Rechercher un code ou forfait…', 'Search code or plan…')}
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#E8E4F2] dark:divide-[#2B2638]">
              {filteredSavedCodes.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#736B83] dark:text-[#A59DBA]">
                  {t('Aucun code sauvegardé pour le moment.', 'No saved code yet.')}
                </div>
              ) : (
                filteredSavedCodes.map((item) => (
                  <div key={item.code} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-sm text-[#6733CF] dark:text-[#BCA3FF]">
                        {item.code}
                      </div>
                      <div className="text-xs text-[#736B83] dark:text-[#A59DBA] truncate">
                        {item.plan_name} · {formatFcfa(item.price_fcfa, lang)} · {formatTimestamp(item.created, lang)}
                      </div>
                      {lookupResult[item.code] && (
                        <div className="text-[11px] font-semibold text-[#237C5D] dark:text-[#86DFB8] mt-0.5">
                          {t('État', 'Status')} : {lookupResult[item.code]}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLookupCode(item.code)}
                        className="px-2.5 py-1.5 rounded-lg border border-[#E8E4F2] dark:border-[#2B2638] text-xs font-semibold hover:border-[#7544DD] cursor-pointer"
                      >
                        {t('Vérifier', 'Check')}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyText(item.code)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF] text-xs font-semibold cursor-pointer"
                      >
                        {t('Copier', 'Copy')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Paiements en cours Modal ── */}
      {showPendingModal && (
        <div className="fixed inset-0 z-50 bg-[#140F24]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-[480px] bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] rounded-3xl p-6 shadow-xl flex flex-col gap-4 max-h-[80vh]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-bold">{t('Paiements en cours', 'Pending payments')}</h3>
              <button
                type="button"
                onClick={() => setShowPendingModal(false)}
                className="w-8 h-8 rounded-lg border border-[#E8E4F2] dark:border-[#2B2638] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-[#E8E4F2] dark:divide-[#2B2638]">
              {pendingPayments.map((p) => (
                <div key={p.reference} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">{p.plan_name}</div>
                    <div className="text-xs text-[#736B83] dark:text-[#A59DBA] tabular-nums">
                      +237 {p.phone} · {formatFcfa(p.amount_fcfa, lang)} · {p.status}
                    </div>
                  </div>
                  {p.code ? (
                    <span className="font-mono text-xs font-bold text-[#237C5D] dark:text-[#86DFB8]">
                      {p.code}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const matchPlan = plans.find((pl) => pl.id === p.plan_id) || null;
                        setSelectedPlan(matchPlan);
                        setActivePayment(p);
                        setPayStep('wait');
                        setShowPendingModal(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#EFE7FF] dark:bg-[#2C2145] text-xs font-semibold text-[#6733CF] dark:text-[#BCA3FF] cursor-pointer"
                    >
                      {t('Ouvrir', 'Open')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Seller Modal ── */}
      {showSellerModal && (
        <div className="fixed inset-0 z-50 bg-[#140F24]/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-[400px] bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] rounded-3xl p-6 shadow-xl flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#7544DD] dark:text-[#BCA3FF]">
                  {t('Espace revendeur', 'Reseller area')}
                </div>
                <h3 className="font-display text-xl font-bold mt-0.5">{portalInfo.name || portalInfo.login}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSellerModal(false)}
                className="w-8 h-8 rounded-lg border border-[#E8E4F2] dark:border-[#2B2638] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-[#736B83] dark:text-[#BCB4CD]">
              {t('Identifiant revendeur :', 'Reseller ID:')}{' '}
              <span className="font-mono font-semibold text-[#211A35] dark:text-white">{portalInfo.login}</span>
            </p>

            <button
              type="button"
              onClick={() => {
                setShowSellerModal(false);
                onOpenApiSpace();
              }}
              className="w-full h-11 rounded-xl bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF] border border-[#E8E4F2] dark:border-[#3A3349] font-semibold text-sm inline-flex items-center justify-center gap-2 hover:brightness-95 cursor-pointer"
            >
              <Code2 className="w-4 h-4" />
              <span>{t('API revendeur : vendre depuis votre site', 'Reseller API: sell from your website')}</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full h-11 rounded-xl bg-[#D92D20] text-white font-bold text-sm inline-flex items-center justify-center gap-2 hover:brightness-105 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{loggingOut ? t('Déconnexion…', 'Signing out…') : t('Se déconnecter', 'Sign out')}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Assistant Geny Chat Widget ── */}
      {!chatOpen ? (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="fixed bottom-5 right-5 z-40 h-12 px-4 rounded-2xl bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white shadow-lg flex items-center gap-2 text-sm font-bold hover:brightness-105 transition-all cursor-pointer"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="hidden sm:inline">{t('Discuter avec Geny', 'Chat with Geny')}</span>
        </button>
      ) : (
        <section
          aria-label={t('Assistant Geny', 'Geny assistant')}
          className="fixed bottom-5 right-5 z-40 w-[340px] max-w-[calc(100vw-2rem)] h-[440px] bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-[#E8E4F2] dark:border-[#2B2638] flex items-center justify-between gap-2 bg-[#F6F5FB] dark:bg-[#1E1A28]">
            <div className="flex items-center gap-2.5 min-w-0">
              <GenyLogoMark className="w-8 h-8 shrink-0" />
              <div className="min-w-0">
                <div className="font-display font-bold text-sm truncate">
                  {t('Assistant Geny', 'Geny assistant')}
                </div>
                <div className="text-[11px] text-[#736B83] dark:text-[#A59DBA] truncate">
                  {t('Forfaits, paiement et aide', 'Plans, payment and help')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setChatMessages([
                    {
                      id: 'reset',
                      from: 'bot',
                      text: t('Conversation réinitialisée. Comment puis-je vous aider ?', 'Conversation reset. How can I help?'),
                    },
                  ])
                }
                className="w-7 h-7 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer"
                aria-label={t('Réinitialiser', 'Reset')}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer"
                aria-label={t('Fermer', 'Close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 text-xs">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`max-w-[85%] px-3 py-2 rounded-2xl leading-relaxed ${
                  msg.from === 'user'
                    ? 'ml-auto bg-[#7544DD] text-white'
                    : 'mr-auto bg-[#F6F5FB] dark:bg-[#1E1A28] text-[#211A35] dark:text-[#F6F3FF] border border-[#E8E4F2] dark:border-[#2B2638]'
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>

          <div className="px-3 py-2 border-t border-[#E8E4F2] dark:border-[#2B2638] flex flex-wrap gap-1.5">
            {[
              { cmd: 'plans', label: t('Forfaits', 'Plans') },
              { cmd: 'topup', label: t('Recharger', 'Recharge') },
              { cmd: 'codes', label: t('Mes codes', 'My codes') },
              { cmd: 'help', label: t('Aide', 'Help') },
            ].map((q) => (
              <button
                key={q.cmd}
                type="button"
                onClick={() => handleChatCommand(q.cmd)}
                className="px-2.5 py-1 rounded-lg bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF] text-[11px] font-semibold cursor-pointer"
              >
                {q.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleChatCommand(chatInput);
            }}
            className="p-2.5 border-t border-[#E8E4F2] dark:border-[#2B2638] flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={t('Posez votre question…', 'Ask a question…')}
              className="flex-1 px-3 py-2 rounded-xl bg-[#F6F5FB] dark:bg-[#100E19] text-xs focus:outline-none"
            />
            <button
              type="submit"
              className="w-8 h-8 rounded-xl bg-[#7544DD] text-white flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={t('Envoyer', 'Send')}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
