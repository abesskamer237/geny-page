import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowDown, ArrowUpRight, FileText, Sun, Moon, Globe, Sparkles, UserPlus } from 'lucide-react';
import type { Lang, PortalMe, ThemeMode } from '../types/geny';
import { AndroidIcon, GenyLogoMark, WhatsAppIcon, WindowsIcon, formatSize } from './Icons';

interface LoginPortalProps {
  portalInfo: PortalMe | null;
  lang: Lang;
  theme: ThemeMode;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onSignedIn: () => void;
  onOpenShop?: () => void;
}

export function LoginPortal({
  portalInfo,
  lang,
  theme,
  onToggleLang,
  onToggleTheme,
  onSignedIn,
  onOpenShop,
}: LoginPortalProps) {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [login, setLogin] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const android = portalInfo?.apps?.android;
  const windows = portalInfo?.apps?.windows;
  const guide = portalInfo?.guide;
  const community = portalInfo?.community || [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!login.trim() || !password) {
      setError(t('Indiquez votre identifiant et votre mot de passe.', 'Enter your login and password.'));
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = mode === 'login' ? '/api/v1/portal/login' : '/api/v1/portal/register';
      const payload =
        mode === 'login'
          ? { login: login.trim(), password }
          : { login: login.trim(), name: name.trim() || login.trim(), password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('Connexion impossible pour le moment.', 'Sign-in unavailable right now.'));
        return;
      }
      onSignedIn();
    } catch {
      setError(t('Connexion au service interrompue. Réessayez.', 'Connection interrupted. Please retry.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemoLogin() {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ login: 'demo', password: 'demo-1234' }),
      });
      if (res.ok) {
        onSignedIn();
      } else {
        setError(t('Compte démo indisponible.', 'Demo account unavailable.'));
      }
    } catch {
      setError(t('Erreur réseau.', 'Network error.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F5FB] dark:bg-[#100E19] text-[#211A35] dark:text-[#F6F3FF]">
      {/* Header: clean 3-zone contract */}
      <header className="w-full max-w-[1080px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-8">
        <a href="#top" className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <GenyLogoMark className="w-9 h-9" />
          <span className="font-display text-xl font-bold tracking-tight">Geny</span>
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#736B83] dark:text-[#A59DBA]">
          {onOpenShop && (
            <button
              type="button"
              onClick={onOpenShop}
              className="hover:text-[#211A35] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t('Boutique client', 'Storefront')}
            </button>
          )}
          <a href="#apps" className="hover:text-[#211A35] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
            {t('Applications', 'Apps')}
          </a>
          <a href="#community" className="hover:text-[#211A35] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
            {t('Communauté', 'Community')}
          </a>
          <a href="#connexion" className="hover:text-[#211A35] dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
            {t('Espace revendeur', 'Reseller area')}
          </a>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleLang}
            className="h-9 px-3 rounded-lg border border-[#E8E4F2] dark:border-[#2B2638] bg-white dark:bg-[#18151F] text-xs font-semibold text-[#4A4460] dark:text-[#CFC8E0] hover:border-[#7544DD] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            aria-label={t('Changer de langue', 'Switch language')}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang.toUpperCase()}</span>
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-9 h-9 rounded-lg border border-[#E8E4F2] dark:border-[#2B2638] bg-white dark:bg-[#18151F] text-[#4A4460] dark:text-[#CFC8E0] hover:border-[#7544DD] transition-colors inline-flex items-center justify-center shrink-0 cursor-pointer"
            aria-label={t('Basculer le thème', 'Toggle theme')}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <a
            href="#connexion"
            className="md:hidden h-9 px-3 rounded-lg bg-[#EFE7FF] dark:bg-[#2C2145] text-[#7544DD] dark:text-[#BCA3FF] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{t('Connexion', 'Sign in')}</span>
          </a>
        </div>
      </header>

      {/* Main Split Grid */}
      <main className="flex-1 w-full max-w-[1080px] mx-auto px-4 sm:px-6 py-6 sm:py-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,410px)] items-center gap-8 lg:gap-14">
        {/* Left Column: Brand pitch, App downloads & Community */}
        <div className="flex flex-col gap-7 order-2 lg:order-1 min-w-0">
          <div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold leading-[1.06] tracking-tight text-balance">
              {t('Votre internet.', 'Your internet.')}
              <br />
              {t('Sans ', 'No ')}
              <span className="font-serif-accent text-[#D92D20] dark:text-[#FF6B6B]">BullShit</span>.
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[#736B83] dark:text-[#BCB4CD] max-w-[490px]">
              {t(
                'Installez Geny sur votre téléphone Android ou votre ordinateur Windows, puis achetez votre code auprès d’un revendeur agréé de la communauté.',
                'Install Geny on your Android phone or Windows computer, then buy your code from an approved reseller of the community.'
              )}
            </p>
          </div>

          {/* Installer Geny */}
          <section id="apps" className="flex flex-col gap-3" aria-labelledby="appsTitle">
            <h2 id="appsTitle" className="text-xs font-bold tracking-wider uppercase text-[#736B83] dark:text-[#A59DBA]">
              {t('Installer Geny', 'Install Geny')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href={android?.url || '/api/v1/app/android.apk'}
                download={`Geny_v${android?.version_name || '1.3.8'}.apk`}
                className="flex items-center gap-3.5 min-h-[64px] px-4 py-3 rounded-2xl text-white bg-gradient-to-br from-[#9160F7] to-[#6733CF] shadow-md hover:brightness-105 transition-all"
              >
                <span className="w-9 h-9 rounded-xl bg-white text-[#3DDC84] flex items-center justify-center shrink-0">
                  <AndroidIcon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] leading-tight">Android</div>
                  <div className="text-xs text-white/85 truncate tabular-nums">
                    Android 8+ · {android ? formatSize(android.size, lang) : '11,6 Mo'}
                  </div>
                </div>
                <ArrowDown className="w-4 h-4 ml-auto opacity-85 shrink-0" />
              </a>

              <a
                href={windows?.url || '/api/v1/app/windows.exe'}
                download={`Geny_v${windows?.version_name || '1.3.8'}.exe`}
                className="flex items-center gap-3.5 min-h-[64px] px-4 py-3 rounded-2xl text-white bg-gradient-to-br from-[#9160F7] to-[#6733CF] shadow-md hover:brightness-105 transition-all"
              >
                <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 p-1.5">
                  <WindowsIcon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] leading-tight">Windows</div>
                  <div className="text-xs text-white/85 truncate tabular-nums">
                    Windows 10 / 11 · {windows ? formatSize(windows.size, lang) : '22,7 Mo'}
                  </div>
                </div>
                <ArrowDown className="w-4 h-4 ml-auto opacity-85 shrink-0" />
              </a>

              <a
                href={guide?.url || '/api/v1/guide.pdf'}
                download="Geny_Guide.pdf"
                className="sm:col-span-2 flex items-center gap-3.5 min-h-[60px] px-4 py-3 rounded-2xl bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF] border border-[#E8E4F2] dark:border-[#3A3349] hover:brightness-98 transition-all"
              >
                <span className="w-9 h-9 rounded-xl bg-[#7544DD] text-white flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] leading-tight">
                    {t('Guide d’utilisation', 'User guide')}
                  </div>
                  <div className="text-xs opacity-85 truncate tabular-nums">
                    {t('Mode d’emploi en images', 'Illustrated how-to')} · PDF · {guide ? formatSize(guide.size, lang) : '2,6 Mo'}
                  </div>
                </div>
                <ArrowDown className="w-4 h-4 ml-auto opacity-85 shrink-0" />
              </a>
            </div>
          </section>

          {/* Community */}
          {community.length > 0 && (
            <section id="community" className="flex flex-col gap-3" aria-labelledby="communityTitle">
              <h2 id="communityTitle" className="text-xs font-bold tracking-wider uppercase text-[#736B83] dark:text-[#A59DBA]">
                {t('Communauté Geny', 'Geny community')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {community.map((c) => {
                  let host = '';
                  try {
                    host = new URL(c.url).hostname.replace(/^www\./, '');
                  } catch {
                    host = c.url;
                  }
                  return (
                    <a
                      key={c.url}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3.5 min-h-[60px] px-4 py-3 rounded-2xl bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] hover:border-[#7544DD] transition-colors shadow-xs"
                    >
                      <span className="w-9 h-9 rounded-xl bg-[#25D366] text-white flex items-center justify-center shrink-0">
                        <WhatsAppIcon className="w-5 h-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-[15px] leading-tight">{c.title}</div>
                        <div className="text-xs text-[#736B83] dark:text-[#A59DBA] truncate">{host}</div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 ml-auto text-[#736B83] shrink-0" />
                    </a>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Connexion Revendeur Card */}
        <section
          id="connexion"
          aria-labelledby="loginCardTitle"
          className="order-1 lg:order-2 bg-white dark:bg-[#18151F] border border-[#E8E4F2] dark:border-[#2B2638] rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col gap-4"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase text-[#7544DD] dark:text-[#BCA3FF]">
              <Lock className="w-3.5 h-3.5" />
              <span>{t('Espace revendeurs', 'Reseller area')}</span>
            </span>

            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#F6F5FB] dark:bg-[#1E1A28] border border-[#E8E4F2] dark:border-[#2B2638]">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'login'
                    ? 'bg-white dark:bg-[#2C2145] text-[#211A35] dark:text-white shadow-xs'
                    : 'text-[#736B83] dark:text-[#A59DBA]'
                }`}
              >
                {t('Connexion', 'Sign in')}
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(''); }}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'register'
                    ? 'bg-white dark:bg-[#2C2145] text-[#211A35] dark:text-white shadow-xs'
                    : 'text-[#736B83] dark:text-[#A59DBA]'
                }`}
              >
                {t('Créer un accès', 'Register')}
              </button>
            </div>
          </div>

          <div>
            <h2 id="loginCardTitle" className="font-display text-2xl font-bold tracking-tight">
              {mode === 'login' ? t('Connexion revendeur', 'Reseller sign-in') : t('Nouveau compte revendeur', 'New reseller account')}
            </h2>
            <p className="mt-1.5 text-sm text-[#736B83] dark:text-[#BCB4CD] leading-relaxed">
              {mode === 'login'
                ? t(
                    'La vente de codes Geny est réservée aux revendeurs agréés. Connectez-vous avec votre identifiant et mot de passe.',
                    'Selling Geny codes is reserved to approved resellers. Sign in with your login and password.'
                  )
                : t(
                    'Créez un profil revendeur local pour tester la vente de codes, les paiements Mobile Money et l’Espace API.',
                    'Create a local reseller profile to test code sales, Mobile Money checkout, and the API Space.'
                  )}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" noValidate>
            {mode === 'register' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="resellerName" className="text-xs font-semibold text-[#4A4460] dark:text-[#CFC8E0]">
                  {t('Nom commercial / Boutique', 'Business / Reseller name')}
                </label>
                <input
                  id="resellerName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('Ex. Boutique Samari', 'e.g. Samari Store')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E4F2] dark:border-[#2B2638] bg-[#F6F5FB] dark:bg-[#100E19] text-[15px] font-medium focus:outline-none focus:border-[#7544DD]"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="loginInput" className="text-xs font-semibold text-[#4A4460] dark:text-[#CFC8E0]">
                {t('Identifiant', 'Login')}
              </label>
              <input
                id="loginInput"
                type="text"
                autoComplete="username"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder={mode === 'login' ? 'demo' : t('Votre identifiant', 'Your login')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E4F2] dark:border-[#2B2638] bg-[#F6F5FB] dark:bg-[#100E19] text-[15px] font-semibold focus:outline-none focus:border-[#7544DD]"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="passwordInput" className="text-xs font-semibold text-[#4A4460] dark:text-[#CFC8E0]">
                {t('Mot de passe', 'Password')}
              </label>
              <div className="flex items-center rounded-xl border border-[#E8E4F2] dark:border-[#2B2638] bg-[#F6F5FB] dark:bg-[#100E19] focus-within:border-[#7544DD] overflow-hidden">
                <input
                  id="passwordInput"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  className="w-full px-3.5 py-2.5 bg-transparent text-[15px] font-semibold focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="px-3 h-10 text-xs font-semibold text-[#7544DD] dark:text-[#BCA3FF] hover:opacity-80 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPassword ? t('Masquer', 'Hide') : t('Afficher', 'Show')}</span>
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="text-xs font-medium text-[#D92D20] dark:text-[#FF6B6B] bg-[#D92D20]/10 border border-[#D92D20]/20 rounded-xl px-3 py-2.5"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full h-12 rounded-xl bg-gradient-to-br from-[#9160F7] to-[#6733CF] text-white font-bold text-[15px] shadow-md hover:brightness-105 disabled:opacity-60 transition-all cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {mode === 'register' && <UserPlus className="w-4 h-4" />}
              <span>
                {submitting
                  ? t('Chargement…', 'Loading…')
                  : mode === 'login'
                  ? t('Se connecter', 'Sign in')
                  : t('Créer et accéder au portail', 'Create & open portal')}
              </span>
            </button>
          </form>

          {mode === 'login' && (
            <div className="pt-3 border-t border-[#E8E4F2] dark:border-[#2B2638] flex items-center justify-between gap-2">
              <span className="text-xs text-[#736B83] dark:text-[#A59DBA]">
                {t('Aperçu rapide du portail', 'Quick portal preview')}
              </span>
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg bg-[#EFE7FF] dark:bg-[#2C2145] text-[#6733CF] dark:text-[#BCA3FF] text-xs font-semibold hover:brightness-95 transition-all inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('Compte démo (Samari)', 'Demo (Samari)')}</span>
              </button>
            </div>
          )}
        </section>
      </main>

      <footer className="w-full max-w-[1080px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between text-xs text-[#736B83] dark:text-[#A59DBA]">
        <span>© Geny</span>
        <span>{t('Votre internet. Sans BullShit.', 'Your internet. No BullShit.')}</span>
      </footer>
    </div>
  );
}
