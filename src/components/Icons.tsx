import React from 'react';
import type { Lang } from '../types/geny';

export function GenyLogoMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="genyGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9160F7" />
          <stop offset="100%" stopColor="#6733CF" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#genyGrad)" />
      <path
        d="M27.5 14.5C25.9 12.4 23.2 11 20.1 11C14.8 11 10.5 15.1 10.5 20.2C10.5 25.3 14.8 29.4 20.1 29.4C24.7 29.4 28.5 26.3 29.2 22.1H20.4V18.6H32.5V20.5C32.5 27.6 27.1 33 20.1 33C12.9 33 7 27.3 7 20.2C7 13.1 12.9 7.4 20.1 7.4C24.4 7.4 28.2 9.4 30.6 12.5L27.5 14.5Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function AndroidIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.64.64 0 0 0-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67a.64.64 0 0 0-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52M7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5m10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5"
      />
    </svg>
  );
}

export function WindowsIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden="true">
      <path
        fill="#0078d4"
        d="M67.328 67.331h60.669V128H67.328zm-67.325 0h60.669V128H.003zM67.328 0h60.669v60.669H67.328zM.003 0h60.669v60.669H.003z"
      />
    </svg>
  );
}

export function WhatsAppIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z" />
    </svg>
  );
}

export function MtnLogo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#FFCC00" />
      <ellipse cx="20" cy="20" rx="14" ry="9" fill="none" stroke="#111111" strokeWidth="2.2" />
      <text x="20" y="23.5" textAnchor="middle" fill="#111111" fontSize="9.5" fontWeight="800" fontFamily="sans-serif">
        MTN
      </text>
    </svg>
  );
}

export function OrangeLogo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#FF7900" />
      <rect x="9" y="25" width="22" height="5" rx="1.5" fill="#FFFFFF" />
      <text x="20" y="20" textAnchor="middle" fill="#FFFFFF" fontSize="8.5" fontWeight="800" fontFamily="sans-serif">
        OM
      </text>
    </svg>
  );
}

export function formatFcfa(val: number, lang: Lang): string {
  if (val === 0) return lang === 'en' ? 'Free' : 'Gratuit';
  return `${Math.round(val).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} FCFA`;
}

export function formatMoney(val: number, lang: Lang): string {
  return `${Math.round(val).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} FCFA`;
}

export function formatSize(bytes: number, lang: Lang): string {
  const mb = (bytes / 1_000_000).toFixed(1);
  return `${Number(mb).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR')} ${lang === 'en' ? 'MB' : 'Mo'}`;
}

export function formatQuota(quotaBytes: number | null, lang: Lang): string {
  if (quotaBytes === null) return lang === 'en' ? 'Unlimited' : 'Illimité';
  const gb = quotaBytes / 1_000_000_000;
  if (gb >= 1) {
    const formatted = Number.isInteger(gb) ? String(gb) : gb.toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR');
    return `${formatted} ${lang === 'en' ? 'GB' : 'Go'}`;
  }
  return `${Math.round(quotaBytes / 1_000_000)} ${lang === 'en' ? 'MB' : 'Mo'}`;
}

export function formatDuration(val: number, unit: 'hours' | 'days', lang: Lang): string {
  if (unit === 'hours') {
    return lang === 'en' ? `${val}h` : `${val}h`;
  }
  if (lang === 'en') {
    return val === 1 ? '1 day' : `${val} days`;
  }
  return val === 1 ? '1 jour' : `${val} jours`;
}

export function formatTimestamp(ts: number, lang: Lang): string {
  return new Date(ts * 1000).toLocaleString(lang === 'en' ? 'en-US' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
