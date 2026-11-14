import React, { useEffect, useState } from 'react';
import { ApiSpace } from './components/ApiSpace';
import { LoginPortal } from './components/LoginPortal';
import { SalePortal } from './components/SalePortal';
import { ShopPage } from './components/ShopPage';
import type { Lang, PortalMe, ThemeMode } from './types/geny';

type AppView = 'shop' | 'reseller' | 'api';

function resolveViewFromPath(pathname: string): AppView {
  if (pathname.startsWith('/espace-api')) return 'api';
  if (pathname.startsWith('/revendeur')) return 'reseller';
  return 'shop';
}

export default function App() {
  const [portalInfo, setPortalInfo] = useState<PortalMe | null>(null);
  const [loading, setLoading] = useState(true);

  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem('geny_lang');
      if (saved === 'en' || saved === 'fr') return saved;
    } catch {
      // ignore
    }
    return /^en\b/i.test(navigator.language || '') ? 'en' : 'fr';
  });

  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('geny_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [view, setView] = useState<AppView>(() => resolveViewFromPath(window.location.pathname));

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('geny_lang', lang);
    } catch {
      // ignore
    }
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('geny_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    if (view === 'shop') {
      document.title = lang === 'en' ? 'Samari · Geny Storefront' : 'Samari · Boutique Geny';
    } else if (!portalInfo?.signed_in) {
      document.title = lang === 'en' ? 'Geny · Reseller area' : 'Geny · Espace revendeurs';
    } else if (view === 'api') {
      document.title = lang === 'en' ? 'API Space · Geny' : 'Espace API · Geny';
    } else {
      document.title = lang === 'en' ? 'Geny · Reseller portal' : 'Geny · Portail revendeur';
    }
  }, [portalInfo?.signed_in, view, lang]);

  async function refreshSession() {
    try {
      const res = await fetch('/api/v1/portal/me', { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = (await res.json()) as PortalMe;
        setPortalInfo(data);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSession();
    const onPopState = () => {
      setView(resolveViewFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigateTo(nextView: AppView) {
    setView(nextView);
    const targetPath =
      nextView === 'api'
        ? '/espace-api#/overview'
        : nextView === 'reseller'
        ? '/revendeur'
        : '/';
    const currentFull = window.location.pathname + window.location.hash;
    if (currentFull !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  }

  if (view === 'shop') {
    return (
      <ShopPage
        lang={lang}
        theme={theme}
        onToggleLang={() => setLang((l) => (l === 'fr' ? 'en' : 'fr'))}
        onToggleTheme={() => setTheme((th) => (th === 'light' ? 'dark' : 'light'))}
        onOpenResellerPortal={() => navigateTo('reseller')}
        onOpenApiSpace={() => navigateTo('api')}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F5FB] dark:bg-[#100E19] text-[#7544DD]">
        <div className="w-8 h-8 rounded-full border-2 border-[#7544DD]/30 border-t-[#7544DD] animate-spin" />
      </div>
    );
  }

  if (!portalInfo?.signed_in) {
    return (
      <LoginPortal
        portalInfo={portalInfo}
        lang={lang}
        theme={theme}
        onToggleLang={() => setLang((l) => (l === 'fr' ? 'en' : 'fr'))}
        onToggleTheme={() => setTheme((th) => (th === 'light' ? 'dark' : 'light'))}
        onSignedIn={refreshSession}
        onOpenShop={() => navigateTo('shop')}
      />
    );
  }

  if (view === 'api') {
    return (
      <ApiSpace
        lang={lang}
        theme={theme}
        onToggleLang={() => setLang((l) => (l === 'fr' ? 'en' : 'fr'))}
        onToggleTheme={() => setTheme((th) => (th === 'light' ? 'dark' : 'light'))}
        onBackToSale={() => navigateTo('reseller')}
        onLoggedOut={() => {
          navigateTo('reseller');
          refreshSession();
        }}
      />
    );
  }

  return (
    <SalePortal
      portalInfo={portalInfo}
      lang={lang}
      theme={theme}
      onToggleLang={() => setLang((l) => (l === 'fr' ? 'en' : 'fr'))}
      onToggleTheme={() => setTheme((th) => (th === 'light' ? 'dark' : 'light'))}
      onOpenApiSpace={() => navigateTo('api')}
      onOpenShop={() => navigateTo('shop')}
      onLoggedOut={refreshSession}
    />
  );
}
