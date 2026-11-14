import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'geny-store.json');

interface Plan {
  id: string;
  name: string;
  quota_bytes: number | null;
  duration_value: number;
  duration_unit: 'hours' | 'days';
  price_fcfa: number;
  window?: string;
  fair_use?: {
    daily_gb: number;
    rate_kbit: number;
  };
}

interface ApiKeyRecord {
  id: string;
  livemode: boolean;
  prefix: string;
  created: number;
  expires: number | null;
  last_used: number | null;
  hash: string;
}

interface PriceSetting {
  plan_id: string;
  name: string;
  public_price: number;
  wholesale: number;
  min: number;
  max: number;
  customer_price: number | null;
  effective: number;
}

interface OrderRecord {
  id: string;
  livemode: boolean;
  mode: 'direct' | 'wallet';
  plan_id: string;
  plan_name: string;
  status: 'pending' | 'succeeded' | 'failed';
  amount_fcfa: number;
  wholesale_fcfa: number;
  margin_fcfa: number;
  phone: string | null;
  operator: string | null;
  code: string | null;
  external_ref: string | null;
  created: number;
}

interface LedgerEntry {
  id: string;
  livemode: boolean;
  type: 'topup' | 'sale' | 'margin' | 'payout' | 'refund';
  label: string;
  amount_fcfa: number;
  balance_after: number;
  bucket: 'wallet' | 'earnings';
  created: number;
}

interface TopupRecord {
  id: string;
  operator: string;
  phone: string;
  amount_fcfa: number;
  status: 'succeeded' | 'pending';
  reference: string;
  created: number;
}

interface PayoutRecord {
  id: string;
  operator: string;
  phone: string;
  gross_fcfa: number;
  fee_fcfa: number;
  net_fcfa: number;
  status: 'succeeded';
  reference: string;
  created: number;
}

interface PaymentSession {
  reference: string;
  reseller_login: string;
  plan_id: string;
  plan_name: string;
  amount_fcfa: number;
  operator: string;
  phone: string;
  status: 'pending' | 'otp_required' | 'succeeded' | 'cancelled' | 'failed';
  code: string | null;
  created: number;
  updated: number;
  poll_count: number;
}

interface CodeRecord {
  code: string;
  plan_id: string;
  plan_name: string;
  quota_bytes: number | null;
  duration_value: number;
  duration_unit: 'hours' | 'days';
  price_fcfa: number;
  status: 'unused' | 'active' | 'expired';
  reseller_login: string;
  phone: string | null;
  operator: string | null;
  created: number;
  activated_at: number | null;
  expires_at: number | null;
}

interface WebhookConfig {
  url: string;
  secret: string;
  enabled: boolean;
  last_status: number | null;
  last_delivered_at: number | null;
}

interface ResellerAccount {
  login: string;
  name: string;
  password_hash: string;
  partner_id: string;
  created: number;
  last_used: number | null;
  enabled: boolean;
  modes: {
    direct: boolean;
    wallet: boolean;
  };
  keys: ApiKeyRecord[];
  balances: {
    live: { wallet: number; earnings: number };
    test: { wallet: number; earnings: number };
    currency: 'XAF';
  };
  webhooks: {
    live: WebhookConfig | null;
    test: WebhookConfig | null;
  };
  ip_allowlist: string[];
  limits: {
    wallet_daily_cap: number;
    direct_daily_cap: number;
    low_balance: number;
    code_days: number;
  };
  prices: Record<string, number | null>;
  orders: OrderRecord[];
  ledger: LedgerEntry[];
  topups: TopupRecord[];
  payouts: PayoutRecord[];
}

interface ShopOrderRecord {
  order_ref: string;
  mode: 'direct' | 'wallet';
  plan_id: string;
  plan_name: string;
  amount_fcfa: number;
  operator: 'mtn' | 'orange';
  phone: string;
  status: 'pending' | 'succeeded' | 'failed' | 'expired';
  payment?: {
    requires_otp?: boolean;
    otp_instruction?: string;
    ussd_instruction?: string;
  };
  code: string | null;
  code_kind: 'new' | 'topup';
  code_balance: {
    quota_bytes?: number | null;
    expires_at?: number | null;
  } | null;
  topup_code: string | null;
  test_mode: boolean;
  failure_reason: string | null;
  created: number;
  updated: number;
  poll_count: number;
}

interface ResellerTenant {
  id: string;
  domain: string;
  reseller_name: string;
  api_key: string;
  webhook_secret: string;
  api_base_url: string;
  enabled: boolean;
  created: number;
  updated: number;
}

interface StoreData {
  resellers: Record<string, ResellerAccount>;
  sessions: Record<string, string>;
  payments: Record<string, PaymentSession>;
  codes: Record<string, CodeRecord>;
  shopOrders?: Record<string, ShopOrderRecord>;
  tenants?: Record<string, ResellerTenant>;
}

const PLANS: Plan[] = [
  { id: '0aa65e9ab03869154903e984', name: 'Pass Test', quota_bytes: 2000000000, duration_value: 2, duration_unit: 'hours', price_fcfa: 0 },
  { id: '5a961bb304c34148f43248af', name: 'Pass Flash', quota_bytes: 1000000000, duration_value: 24, duration_unit: 'hours', price_fcfa: 75 },
  { id: '1a87c5fea40d5a7fde3c51d6', name: 'Nuit Blanche', quota_bytes: 5000000000, duration_value: 1, duration_unit: 'days', price_fcfa: 150, window: '00:00 - 06:00' },
  { id: '221ed55fd1bb6a3579900491', name: 'Pass Journée', quota_bytes: 2500000000, duration_value: 48, duration_unit: 'hours', price_fcfa: 185 },
  { id: '1457ddc00958540ca06677ee', name: 'Pass Week-end', quota_bytes: 5000000000, duration_value: 3, duration_unit: 'days', price_fcfa: 375 },
  { id: 'eb48e84592ca17c9cda93844', name: 'Pass Semaine Éco', quota_bytes: 4000000000, duration_value: 7, duration_unit: 'days', price_fcfa: 375 },
  { id: '429e2e860be5b89181aa3443', name: 'Pass Semaine Max', quota_bytes: 10000000000, duration_value: 7, duration_unit: 'days', price_fcfa: 750 },
  { id: '77db3e2a9385e3e86a425c97', name: 'Pass Mensuel Découverte', quota_bytes: 25000000000, duration_value: 30, duration_unit: 'days', price_fcfa: 1875 },
  { id: '856a015417b6484de9e189d7', name: 'Pass Mensuel Standard', quota_bytes: 60000000000, duration_value: 30, duration_unit: 'days', price_fcfa: 3750 },
  { id: '6f4a417c49d3d76781e465e7', name: 'Pass Semaine Illimité', quota_bytes: null, duration_value: 7, duration_unit: 'days', price_fcfa: 1500, fair_use: { daily_gb: 30, rate_kbit: 2000 } },
  { id: 'fc2a925637d8477639b1b62d', name: 'Pass 2 Semaines Illimité', quota_bytes: null, duration_value: 14, duration_unit: 'days', price_fcfa: 2700, fair_use: { daily_gb: 30, rate_kbit: 2000 } },
  { id: '2b90b75741694907a3157e8b', name: 'Pass Mensuel Maxi', quota_bytes: null, duration_value: 30, duration_unit: 'days', price_fcfa: 6000, fair_use: { daily_gb: 30, rate_kbit: 2000 } },
];

const OPERATORS = [
  {
    id: 'mtn',
    name: 'MTN Mobile Money',
    short: 'MTN MoMo',
    prefixes: ['650', '651', '652', '653', '654', '67', '680', '681', '682', '683', '684'],
    available: true,
  },
  {
    id: 'orange',
    name: 'Orange Money',
    short: 'Orange Money',
    prefixes: ['640', '655', '656', '657', '658', '659', '685', '686', '687', '688', '689', '69'],
    available: true,
  },
];

const APPS_META = {
  android: {
    version_name: '1.3.8',
    version_code: 54,
    size: 11593286,
    url: '/api/v1/app/android.apk',
  },
  windows: {
    version_name: '1.3.8',
    version_code: 41,
    size: 22691840,
    url: '/api/v1/app/windows.exe',
  },
};

const GUIDE_META = {
  url: '/api/v1/guide.pdf',
  size: 2559148,
};

const COMMUNITY_META = [
  { title: 'WhatsApp', url: 'https://whatsapp.com/channel/0029VbDHCLBATRSfzRtsWV3D' },
];

function hashSecret(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex');
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function generateGenyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () =>
    Array.from({ length: 4 }, () => chars[crypto.randomInt(0, chars.length)]).join('');
  return `GENY-${seg()}-${seg()}-${seg()}`;
}

function generateApiSecret(livemode: boolean): { full: string; prefix: string } {
  const token = crypto.randomBytes(18).toString('base64url');
  const full = `${livemode ? 'gk_live_' : 'gk_test_'}${token}`;
  return { full, prefix: full.slice(0, 12) };
}

function createSeedReseller(login: string, name: string, password: string): ResellerAccount {
  const t = nowSec();
  const liveKey = generateApiSecret(true);
  const testKey = generateApiSecret(false);

  return {
    login,
    name,
    password_hash: hashSecret(password),
    partner_id: `pt_${crypto.randomBytes(8).toString('hex')}`,
    created: t - 86400 * 14,
    last_used: t - 1800,
    enabled: true,
    modes: { direct: true, wallet: true },
    keys: [
      {
        id: `key_${crypto.randomBytes(8).toString('hex')}`,
        livemode: true,
        prefix: liveKey.prefix,
        created: t - 86400 * 14,
        expires: null,
        last_used: t - 3600,
        hash: hashSecret(liveKey.full),
      },
      {
        id: `key_${crypto.randomBytes(8).toString('hex')}`,
        livemode: false,
        prefix: testKey.prefix,
        created: t - 86400 * 7,
        expires: null,
        last_used: t - 1800,
        hash: hashSecret(testKey.full),
      },
    ],
    balances: {
      live: { wallet: 12500, earnings: 3450 },
      test: { wallet: 50000, earnings: 8200 },
      currency: 'XAF',
    },
    webhooks: { live: null, test: null },
    ip_allowlist: [],
    limits: {
      wallet_daily_cap: 500000,
      direct_daily_cap: 1000,
      low_balance: 2000,
      code_days: 30,
    },
    prices: {},
    orders: [
      {
        id: 'ord_demo_01',
        livemode: true,
        mode: 'wallet',
        plan_id: '429e2e860be5b89181aa3443',
        plan_name: 'Pass Semaine Max',
        status: 'succeeded',
        amount_fcfa: 900,
        wholesale_fcfa: 750,
        margin_fcfa: 150,
        phone: '677123456',
        operator: 'mtn',
        code: 'GENY-7M9K-4P2W-8X3B',
        external_ref: 'boutique-1042',
        created: t - 7200,
      },
      {
        id: 'ord_demo_02',
        livemode: true,
        mode: 'direct',
        plan_id: '856a015417b6484de9e189d7',
        plan_name: 'Pass Mensuel Standard',
        status: 'succeeded',
        amount_fcfa: 4200,
        wholesale_fcfa: 3750,
        margin_fcfa: 450,
        phone: '699887766',
        operator: 'orange',
        code: 'GENY-5R8N-9C4H-2Q6V',
        external_ref: 'boutique-1041',
        created: t - 28800,
      },
      {
        id: 'ord_test_01',
        livemode: false,
        mode: 'wallet',
        plan_id: '5a961bb304c34148f43248af',
        plan_name: 'Pass Flash',
        status: 'succeeded',
        amount_fcfa: 100,
        wholesale_fcfa: 75,
        margin_fcfa: 25,
        phone: '670000000',
        operator: 'mtn',
        code: 'GENY-TEST-8K2M-4P9Q',
        external_ref: 'sandbox-check-1',
        created: t - 3600,
      },
    ],
    ledger: [
      {
        id: 'led_01',
        livemode: true,
        type: 'topup',
        label: 'Recharge MTN MoMo · +237 677•••456',
        amount_fcfa: 15000,
        balance_after: 13250,
        bucket: 'wallet',
        created: t - 86400,
      },
      {
        id: 'led_02',
        livemode: true,
        type: 'sale',
        label: 'Vente API · Pass Semaine Max',
        amount_fcfa: -750,
        balance_after: 12500,
        bucket: 'wallet',
        created: t - 7200,
      },
      {
        id: 'led_03',
        livemode: true,
        type: 'margin',
        label: 'Marge directe · Pass Mensuel Standard',
        amount_fcfa: 450,
        balance_after: 3450,
        bucket: 'earnings',
        created: t - 28800,
      },
    ],
    topups: [
      {
        id: 'top_01',
        operator: 'mtn',
        phone: '677123456',
        amount_fcfa: 15000,
        status: 'succeeded',
        reference: 'TOP-882410',
        created: t - 86400,
      },
    ],
    payouts: [],
  };
}

function loadStore(): StoreData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(STORE_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as StoreData;
      if (parsed && parsed.resellers) {
        return parsed;
      }
    } catch {
      // recreate clean store if corrupted
    }
  }
  const demoAccount = createSeedReseller('demo', 'Samari', 'demo-1234');
  const initial: StoreData = {
    resellers: {
      demo: demoAccount,
    },
    sessions: {},
    payments: {},
    codes: {
      'GENY-7M9K-4P2W-8X3B': {
        code: 'GENY-7M9K-4P2W-8X3B',
        plan_id: '429e2e860be5b89181aa3443',
        plan_name: 'Pass Semaine Max',
        quota_bytes: 10000000000,
        duration_value: 7,
        duration_unit: 'days',
        price_fcfa: 750,
        status: 'unused',
        reseller_login: 'demo',
        phone: '677123456',
        operator: 'mtn',
        created: nowSec() - 7200,
        activated_at: null,
        expires_at: null,
      },
      'GENY-5R8N-9C4H-2Q6V': {
        code: 'GENY-5R8N-9C4H-2Q6V',
        plan_id: '856a015417b6484de9e189d7',
        plan_name: 'Pass Mensuel Standard',
        quota_bytes: 60000000000,
        duration_value: 30,
        duration_unit: 'days',
        price_fcfa: 3750,
        status: 'active',
        reseller_login: 'demo',
        phone: '699887766',
        operator: 'orange',
        created: nowSec() - 28800,
        activated_at: nowSec() - 25000,
        expires_at: nowSec() + 86400 * 29,
      },
    },
  };
  saveStore(initial);
  return initial;
}

function saveStore(store: StoreData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

const store = loadStore();

function parseCookies(req: Request): Record<string, string> {
  const raw = req.headers.cookie || '';
  const out: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function getAuthenticatedReseller(req: Request): ResellerAccount | null {
  const cookies = parseCookies(req);
  const token = cookies.geny_portal_session;
  if (!token) return null;
  const login = store.sessions[token];
  if (!login) return null;
  return store.resellers[login] || null;
}

function requireReseller(req: Request, res: Response, next: NextFunction): void {
  const reseller = getAuthenticatedReseller(req);
  if (!reseller) {
    res.status(401).json({ error: 'Authentification revendeur requise.' });
    return;
  }
  (req as Request & { reseller: ResellerAccount }).reseller = reseller;
  next();
}

function buildPartnerPayload(account: ResellerAccount, hostOrigin: string) {
  const prices: PriceSetting[] = PLANS.filter((p) => p.price_fcfa > 0).map((p) => {
    const custom = account.prices[p.id] ?? null;
    const min = p.price_fcfa;
    const max = p.price_fcfa * 2;
    const effective = custom !== null ? Math.min(Math.max(custom, min), max) : p.price_fcfa;
    return {
      plan_id: p.id,
      name: p.name,
      public_price: p.price_fcfa,
      wholesale: p.price_fcfa,
      min,
      max,
      customer_price: custom,
      effective,
    };
  });

  return {
    allowed: true,
    base_url: `${hostOrigin}/api/v1/partner`,
    account: {
      id: account.partner_id,
      name: account.name,
      login: account.login,
      created: account.created,
      last_used: account.last_used,
      enabled: account.enabled,
      modes: account.modes,
      keys: account.keys.map((k) => ({
        id: k.id,
        livemode: k.livemode,
        prefix: k.prefix,
        created: k.created,
        expires: k.expires,
        last_used: k.last_used,
      })),
      balances: account.balances,
      webhooks: account.webhooks,
      ip_allowlist: account.ip_allowlist,
      limits: account.limits,
      prices,
      orders: account.orders,
      ledger: account.ledger,
      topup: {
        available: true,
        min: 1000,
        max: 500000,
        currency: 'XAF',
        operators: OPERATORS,
      },
      topups: account.topups,
      payout: {
        available: true,
        provider: 'tranzak',
        minimum: 102,
        fee_rate: 0.015,
        currency: 'XAF',
      },
      payouts: account.payouts,
    },
  };
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('237') && digits.length >= 12) {
    return digits.slice(3, 12);
  }
  return digits.slice(0, 9);
}

function detectOperator(phone: string): string | null {
  for (const op of OPERATORS) {
    if (op.prefixes.some((p) => phone.startsWith(p))) {
      return op.id;
    }
  }
  return null;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  // ── Health Check ──
  app.get('/api/health', (req, res) => {
    const ctx = resolveTenantContext(req);
    res.json({
      ok: true,
      tenant: ctx.tenantKey,
      reseller_name: ctx.resellerName,
      mode: ctx.hasLiveKey ? (ctx.isTestKey ? 'test' : 'live') : 'sandbox',
      timestamp: nowSec(),
    });
  });

  // ── Portal Auth ──
  app.get('/api/v1/portal/me', (req, res) => {
    const reseller = getAuthenticatedReseller(req);
    const base = {
      signed_in: Boolean(reseller),
      required: true,
      apps: APPS_META,
      community: COMMUNITY_META,
      guide: GUIDE_META,
    };
    if (reseller) {
      res.json({
        ...base,
        name: reseller.name,
        login: reseller.login,
      });
      return;
    }
    res.json(base);
  });

  app.post('/api/v1/portal/login', (req, res) => {
    const login = String(req.body?.login || '').trim();
    const password = String(req.body?.password || '');

    if (!login || !password) {
      res.status(400).json({ error: 'Indiquez votre identifiant et votre mot de passe.' });
      return;
    }

    const account = store.resellers[login];
    if (!account || account.password_hash !== hashSecret(password)) {
      res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
      return;
    }

    const sessionToken = crypto.randomBytes(24).toString('base64url');
    store.sessions[sessionToken] = account.login;
    account.last_used = nowSec();
    saveStore(store);

    res.setHeader(
      'Set-Cookie',
      `geny_portal_session=${encodeURIComponent(sessionToken)}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`
    );
    res.json({ ok: true, name: account.name, login: account.login });
  });

  app.post('/api/v1/portal/register', (req, res) => {
    const login = String(req.body?.login || '').trim();
    const name = String(req.body?.name || '').trim() || login;
    const password = String(req.body?.password || '');

    if (!login || login.length < 3) {
      res.status(400).json({ error: 'L’identifiant doit contenir au moins 3 caractères.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
      return;
    }
    if (store.resellers[login]) {
      res.status(409).json({ error: 'Cet identifiant revendeur existe déjà.' });
      return;
    }

    const account = createSeedReseller(login, name, password);
    store.resellers[login] = account;
    const sessionToken = crypto.randomBytes(24).toString('base64url');
    store.sessions[sessionToken] = account.login;
    saveStore(store);

    res.setHeader(
      'Set-Cookie',
      `geny_portal_session=${encodeURIComponent(sessionToken)}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax`
    );
    res.json({ ok: true, name: account.name, login: account.login });
  });

  app.post('/api/v1/portal/logout', (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies.geny_portal_session;
    if (token && store.sessions[token]) {
      delete store.sessions[token];
      saveStore(store);
    }
    res.setHeader('Set-Cookie', 'geny_portal_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    res.json({ ok: true });
  });

  // ── Public Plans & Payment Config ──
  app.get('/api/v1/public/plans', (req, res) => {
    const reseller = getAuthenticatedReseller(req);
    const plans = PLANS.map((p) => {
      if (!reseller || p.price_fcfa === 0) return p;
      const custom = reseller.prices[p.id];
      return {
        ...p,
        price_fcfa: custom ?? p.price_fcfa,
        wholesale_fcfa: p.price_fcfa,
      };
    });
    res.json({
      plans,
      apps: APPS_META,
      community: COMMUNITY_META,
      guide: GUIDE_META,
    });
  });

  app.get('/api/v1/payment/public-config', (_req, res) => {
    res.json({
      enabled: true,
      currency: 'XAF',
      country: 'CM',
      operators: OPERATORS,
    });
  });

  // ── Sale Portal Payments & Code Generation ──
  app.post('/api/v1/payment/free', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const planId = String(req.body?.plan_id || '');
    const plan = PLANS.find((p) => p.id === planId && p.price_fcfa === 0);
    if (!plan) {
      res.status(400).json({ error: 'Forfait gratuit introuvable.' });
      return;
    }

    const code = generateGenyCode();
    const t = nowSec();
    store.codes[code] = {
      code,
      plan_id: plan.id,
      plan_name: plan.name,
      quota_bytes: plan.quota_bytes,
      duration_value: plan.duration_value,
      duration_unit: plan.duration_unit,
      price_fcfa: 0,
      status: 'unused',
      reseller_login: reseller.login,
      phone: null,
      operator: null,
      created: t,
      activated_at: null,
      expires_at: null,
    };
    saveStore(store);

    res.json({
      status: 'succeeded',
      code,
      plan,
    });
  });

  app.post('/api/v1/payment/initiate', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const planId = String(req.body?.plan_id || '');
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) {
      res.status(404).json({ error: 'Forfait inconnu.' });
      return;
    }

    const phone = normalizePhone(String(req.body?.phone || ''));
    if (!/^6\d{8}$/.test(phone)) {
      res.status(400).json({ error: 'Entrez un numéro Mobile Money camerounais valide (9 chiffres commençant par 6).' });
      return;
    }

    const requestedOp = String(req.body?.operator || '');
    const detectedOp = detectOperator(phone);
    const operator = requestedOp || detectedOp || 'mtn';
    if (detectedOp && requestedOp && detectedOp !== requestedOp) {
      const expectedName = OPERATORS.find((o) => o.id === detectedOp)?.short || detectedOp;
      res.status(400).json({ error: `Ce numéro correspond à ${expectedName}. Sélectionnez le bon opérateur.` });
      return;
    }

    const reference = `PAY-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    const customPrice = reseller.prices[plan.id] ?? plan.price_fcfa;
    const t = nowSec();

    const session: PaymentSession = {
      reference,
      reseller_login: reseller.login,
      plan_id: plan.id,
      plan_name: plan.name,
      amount_fcfa: customPrice,
      operator,
      phone,
      status: 'pending',
      code: null,
      created: t,
      updated: t,
      poll_count: 0,
    };
    store.payments[reference] = session;
    saveStore(store);

    res.json({
      reference,
      status: 'pending',
      operator,
      phone,
      amount_fcfa: customPrice,
      instruction:
        operator === 'mtn'
          ? 'Composez *126# sur votre téléphone MTN ou validez la notification MTN MoMo.'
          : 'Composez #150*50# sur votre téléphone Orange ou entrez le code reçu par SMS.',
    });
  });

  app.get('/api/v1/payment/status', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const ref = String(req.query.reference || '');
    const session = store.payments[ref];
    if (!session || session.reseller_login !== reseller.login) {
      res.status(404).json({ error: 'Paiement introuvable.' });
      return;
    }

    if (session.status === 'pending') {
      session.poll_count += 1;
      session.updated = nowSec();

      // Simulate realistic Mobile Money confirmation after 2 polls (~4 seconds)
      if (session.operator === 'orange' && session.poll_count === 2) {
        session.status = 'otp_required';
      } else if (session.poll_count >= 2) {
        finalizePaymentSuccess(session, reseller);
      }
      saveStore(store);
    }

    res.json({
      reference: session.reference,
      status: session.status,
      code: session.code,
      plan_id: session.plan_id,
      plan_name: session.plan_name,
      amount_fcfa: session.amount_fcfa,
      operator: session.operator,
      phone: session.phone,
    });
  });

  app.post('/api/v1/payment/otp', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const ref = String(req.body?.reference || '');
    const otp = String(req.body?.otp || '').trim();
    const session = store.payments[ref];
    if (!session || session.reseller_login !== reseller.login) {
      res.status(404).json({ error: 'Paiement introuvable.' });
      return;
    }
    if (!/^\d{4,8}$/.test(otp)) {
      res.status(400).json({ error: 'Code SMS invalide. Entrez les 4 à 6 chiffres reçus.' });
      return;
    }

    finalizePaymentSuccess(session, reseller);
    saveStore(store);

    res.json({
      reference: session.reference,
      status: session.status,
      code: session.code,
    });
  });

  app.post('/api/v1/payment/cancel', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const ref = String(req.body?.reference || '');
    const session = store.payments[ref];
    if (!session || session.reseller_login !== reseller.login) {
      res.status(404).json({ error: 'Paiement introuvable.' });
      return;
    }
    if (session.status !== 'succeeded') {
      session.status = 'cancelled';
      session.updated = nowSec();
      saveStore(store);
    }
    res.json({ ok: true, status: session.status });
  });

  app.get('/api/v1/codes/lookup', (req, res) => {
    const codeStr = String(req.query.code || '').trim().toUpperCase();
    if (!codeStr) {
      res.status(400).json({ error: 'Code manquant.' });
      return;
    }
    const found = store.codes[codeStr];
    if (!found) {
      res.status(404).json({ error: 'Code inconnu ou inexistant.' });
      return;
    }
    res.json({
      code: found.code,
      plan_id: found.plan_id,
      plan_name: found.plan_name,
      quota_bytes: found.quota_bytes,
      duration_value: found.duration_value,
      duration_unit: found.duration_unit,
      status: found.status,
      created: found.created,
      activated_at: found.activated_at,
      expires_at: found.expires_at,
    });
  });

  // ── Downloadable Assets ──
  app.get('/api/v1/app/android.apk', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="Geny_v1.3.8.apk"');
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.send(Buffer.from('Geny Android Package Placeholder v1.3.8 (Reproduction)', 'utf8'));
  });

  app.get('/api/v1/app/windows.exe', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="Geny_v1.3.8.exe"');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(Buffer.from('Geny Windows Installer Placeholder v1.3.8 (Reproduction)', 'utf8'));
  });

  app.get('/api/v1/guide.pdf', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="Geny_Guide.pdf"');
    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from('%PDF-1.4\n% Geny User Guide Placeholder\n%%EOF\n', 'utf8'));
  });

  // ── Reseller API Space (/api/v1/portal/api) ──
  app.get('/api/v1/portal/api', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const hostOrigin = `${req.protocol}://${req.get('host')}`;
    res.json(buildPartnerPayload(reseller, hostOrigin));
  });

  app.post('/api/v1/portal/api/keys', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const livemode = Boolean(req.body?.livemode);
    const secret = generateApiSecret(livemode);
    const keyRecord: ApiKeyRecord = {
      id: `key_${crypto.randomBytes(8).toString('hex')}`,
      livemode,
      prefix: secret.prefix,
      created: nowSec(),
      expires: null,
      last_used: null,
      hash: hashSecret(secret.full),
    };
    reseller.keys.unshift(keyRecord);
    saveStore(store);

    res.json({
      key: {
        id: keyRecord.id,
        livemode: keyRecord.livemode,
        prefix: keyRecord.prefix,
        created: keyRecord.created,
        expires: keyRecord.expires,
        last_used: keyRecord.last_used,
      },
      secret: secret.full,
    });
  });

  app.delete('/api/v1/portal/api/keys/:id', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const id = req.params.id;
    const before = reseller.keys.length;
    reseller.keys = reseller.keys.filter((k) => k.id !== id);
    if (reseller.keys.length === before) {
      res.status(404).json({ error: 'Clé introuvable.' });
      return;
    }
    saveStore(store);
    res.json({ ok: true });
  });

  app.put('/api/v1/portal/api/webhook', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const env = req.body?.livemode ? 'live' : 'test';
    const url = String(req.body?.url || '').trim();
    const rotateSecret = Boolean(req.body?.rotate_secret);

    if (!url) {
      reseller.webhooks[env] = null;
      saveStore(store);
      res.json({ ok: true, webhook: null });
      return;
    }

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('bad protocol');
      }
    } catch {
      res.status(400).json({ error: 'URL de webhook invalide. Utilisez https://...' });
      return;
    }

    const existing = reseller.webhooks[env];
    const secret =
      !existing || rotateSecret
        ? `whsec_${crypto.randomBytes(16).toString('hex')}`
        : existing.secret;

    reseller.webhooks[env] = {
      url,
      secret,
      enabled: req.body?.enabled !== false,
      last_status: existing?.last_status ?? null,
      last_delivered_at: existing?.last_delivered_at ?? null,
    };
    saveStore(store);

    res.json({ ok: true, webhook: reseller.webhooks[env], secret_shown: !existing || rotateSecret ? secret : null });
  });

  app.post('/api/v1/portal/api/webhook/test', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const env = req.body?.livemode ? 'live' : 'test';
    const wh = reseller.webhooks[env];
    if (!wh) {
      res.status(400).json({ error: 'Aucun webhook configuré pour cet environnement.' });
      return;
    }
    wh.last_status = 200;
    wh.last_delivered_at = nowSec();
    saveStore(store);
    res.json({ ok: true, status_code: 200, webhook: wh });
  });

  app.put('/api/v1/portal/api/prices', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const incoming = req.body?.prices as Record<string, number | null> | undefined;
    if (!incoming || typeof incoming !== 'object') {
      res.status(400).json({ error: 'Format de prix invalide.' });
      return;
    }

    for (const [planId, rawVal] of Object.entries(incoming)) {
      const plan = PLANS.find((p) => p.id === planId && p.price_fcfa > 0);
      if (!plan) continue;
      if (rawVal === null || rawVal === undefined) {
        delete reseller.prices[planId];
      } else {
        const num = Math.round(Number(rawVal));
        const min = plan.price_fcfa;
        const max = plan.price_fcfa * 2;
        if (Number.isNaN(num) || num < min || num > max) {
          res.status(400).json({
            error: `Le prix de « ${plan.name} » doit être compris entre ${min} et ${max} FCFA.`,
          });
          return;
        }
        reseller.prices[planId] = num;
      }
    }

    saveStore(store);
    const hostOrigin = `${req.protocol}://${req.get('host')}`;
    res.json(buildPartnerPayload(reseller, hostOrigin));
  });

  app.post('/api/v1/portal/api/topup', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const amount = Math.round(Number(req.body?.amount_fcfa || 0));
    const phone = normalizePhone(String(req.body?.phone || ''));
    const operator = String(req.body?.operator || 'mtn');
    const livemode = req.body?.livemode !== false;

    if (amount < 1000 || amount > 500000) {
      res.status(400).json({ error: 'Le montant de recharge doit être compris entre 1 000 et 500 000 FCFA.' });
      return;
    }
    if (!/^6\d{8}$/.test(phone)) {
      res.status(400).json({ error: 'Numéro Mobile Money invalide (9 chiffres commençant par 6).' });
      return;
    }

    const env = livemode ? 'live' : 'test';
    reseller.balances[env].wallet += amount;
    const t = nowSec();
    const ref = `TOP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    if (livemode) {
      reseller.topups.unshift({
        id: `top_${crypto.randomBytes(6).toString('hex')}`,
        operator,
        phone,
        amount_fcfa: amount,
        status: 'succeeded',
        reference: ref,
        created: t,
      });
    }

    reseller.ledger.unshift({
      id: `led_${crypto.randomBytes(6).toString('hex')}`,
      livemode,
      type: 'topup',
      label: `Recharge ${operator === 'mtn' ? 'MTN MoMo' : 'Orange Money'} · +237 ${phone.slice(0, 3)}•••${phone.slice(-3)}`,
      amount_fcfa: amount,
      balance_after: reseller.balances[env].wallet,
      bucket: 'wallet',
      created: t,
    });

    saveStore(store);
    res.json({ ok: true, reference: ref, balance: reseller.balances[env] });
  });

  app.post('/api/v1/portal/api/payout', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const amount = Math.round(Number(req.body?.amount_fcfa || 0));
    const phone = normalizePhone(String(req.body?.phone || ''));
    const operator = String(req.body?.operator || 'mtn');
    const livemode = req.body?.livemode !== false;
    const env = livemode ? 'live' : 'test';

    if (amount < 102) {
      res.status(400).json({ error: 'Le montant minimum de retrait est de 102 FCFA.' });
      return;
    }
    if (amount > reseller.balances[env].earnings) {
      res.status(400).json({ error: 'Montant supérieur à vos gains disponibles.' });
      return;
    }
    if (!/^6\d{8}$/.test(phone)) {
      res.status(400).json({ error: 'Numéro Mobile Money invalide.' });
      return;
    }

    const fee = Math.round(amount * 0.015);
    const net = amount - fee;
    reseller.balances[env].earnings -= amount;
    const t = nowSec();
    const ref = `PAYOUT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    if (livemode) {
      reseller.payouts.unshift({
        id: `po_${crypto.randomBytes(6).toString('hex')}`,
        operator,
        phone,
        gross_fcfa: amount,
        fee_fcfa: fee,
        net_fcfa: net,
        status: 'succeeded',
        reference: ref,
        created: t,
      });
    }

    reseller.ledger.unshift({
      id: `led_${crypto.randomBytes(6).toString('hex')}`,
      livemode,
      type: 'payout',
      label: `Versement ${operator === 'mtn' ? 'MTN MoMo' : 'Orange Money'} (${net} FCFA nets)`,
      amount_fcfa: -amount,
      balance_after: reseller.balances[env].earnings,
      bucket: 'earnings',
      created: t,
    });

    saveStore(store);
    res.json({ ok: true, reference: ref, fee_fcfa: fee, net_fcfa: net, balance: reseller.balances[env] });
  });

  app.put('/api/v1/portal/api/settings', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    if (Array.isArray(req.body?.ip_allowlist)) {
      reseller.ip_allowlist = req.body.ip_allowlist
        .map((s: unknown) => String(s).trim())
        .filter(Boolean);
    }
    if (typeof req.body?.low_balance === 'number' && req.body.low_balance >= 0) {
      reseller.limits.low_balance = Math.round(req.body.low_balance);
    }
    if (req.body?.modes && typeof req.body.modes === 'object') {
      reseller.modes = {
        direct: Boolean(req.body.modes.direct),
        wallet: Boolean(req.body.modes.wallet),
      };
    }
    saveStore(store);
    res.json({ ok: true });
  });

  // ── Live Partner API (both from portal test console and real Bearer API calls) ──
  app.post('/api/v1/portal/api/orders/simulate', requireReseller, (req, res) => {
    const reseller = (req as Request & { reseller: ResellerAccount }).reseller;
    const result = executePartnerOrder(reseller, {
      plan_id: String(req.body?.plan_id || ''),
      mode: req.body?.mode === 'direct' ? 'direct' : 'wallet',
      livemode: Boolean(req.body?.livemode),
      phone: req.body?.phone ? normalizePhone(String(req.body.phone)) : '677001122',
      operator: String(req.body?.operator || 'mtn'),
      external_ref: String(req.body?.external_ref || `sim-${Date.now().toString(36)}`),
    });
    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(result.order);
  });

  app.get('/api/v1/partner/plans', (_req, res) => {
    res.json({ plans: PLANS.filter((p) => p.price_fcfa > 0) });
  });

  app.post('/api/v1/partner/orders', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Bearer API key required.' });
      return;
    }
    const tokenHash = hashSecret(token);
    let matchedReseller: ResellerAccount | null = null;
    let matchedKey: ApiKeyRecord | null = null;

    for (const r of Object.values(store.resellers)) {
      const k = r.keys.find((item) => item.hash === tokenHash);
      if (k) {
        matchedReseller = r;
        matchedKey = k;
        break;
      }
    }

    if (!matchedReseller || !matchedKey) {
      res.status(401).json({ error: 'Invalid API key.' });
      return;
    }

    matchedKey.last_used = nowSec();
    matchedReseller.last_used = nowSec();

    const result = executePartnerOrder(matchedReseller, {
      plan_id: String(req.body?.plan_id || ''),
      mode: req.body?.mode === 'direct' ? 'direct' : 'wallet',
      livemode: matchedKey.livemode,
      phone: req.body?.phone ? normalizePhone(String(req.body.phone)) : null,
      operator: req.body?.operator ? String(req.body.operator) : null,
      external_ref: req.body?.external_ref ? String(req.body.external_ref) : null,
    });

    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json(result.order);
  });

  // ── Connected Multi-Domain Partner Storefront Proxy (/api/shop/* & /api/webhooks/geny) ──
  const GENY_API_KEY = (process.env.GENY_API_KEY || '').trim();
  const GENY_API_BASE = (process.env.GENY_API_BASE_URL || 'https://geny.payool.net/api/v1/partner').replace(/\/$/, '');
  const GENY_WEBHOOK_SECRET = (process.env.GENY_WEBHOOK_SECRET || '').trim();

  if (!store.shopOrders) {
    store.shopOrders = {};
  }
  if (!store.tenants) {
    store.tenants = {};
  }

  function normalizeDomain(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split(':')[0]
      .replace(/^www\./, '');
  }

  function maskSecret(secret: string): string {
    if (!secret) return '';
    if (secret.length <= 14) return `${secret.slice(0, 6)}••••`;
    return `${secret.slice(0, 10)}••••${secret.slice(-4)}`;
  }

  // Optional declarative seeding from GENY_TENANTS_JSON env var
  if (process.env.GENY_TENANTS_JSON) {
    try {
      const parsed = JSON.parse(process.env.GENY_TENANTS_JSON) as Array<Record<string, unknown>>;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const dom = normalizeDomain(String(item.domain || ''));
          if (!dom) continue;
          const existing = store.tenants[dom];
          const tNow = nowSec();
          store.tenants[dom] = {
            id: existing?.id || `ten_${crypto.randomBytes(6).toString('hex')}`,
            domain: dom,
            reseller_name: String(item.reseller_name || existing?.reseller_name || dom),
            api_key: String(item.api_key || existing?.api_key || '').trim(),
            webhook_secret: String(item.webhook_secret ?? existing?.webhook_secret ?? '').trim(),
            api_base_url: String(item.api_base_url || existing?.api_base_url || GENY_API_BASE).replace(/\/$/, ''),
            enabled: item.enabled !== false,
            created: existing?.created || tNow,
            updated: tNow,
          };
        }
        saveStore(store);
      }
    } catch {
      console.warn('Ignoring invalid GENY_TENANTS_JSON');
    }
  }

  interface TenantContext {
    tenantKey: string;
    resellerName: string;
    apiKey: string;
    webhookSecret: string;
    apiBaseUrl: string;
    hasLiveKey: boolean;
    isTestKey: boolean;
    isDedicatedTenant: boolean;
  }

  function resolveTenantContext(req: Request): TenantContext {
    const rawHost = String(req.get('x-forwarded-host') || req.get('host') || '');
    const hostDomain = normalizeDomain(rawHost);
    const tenants = store.tenants || {};

    let matched: ResellerTenant | undefined = tenants[hostDomain];
    if (matched && !matched.enabled) matched = undefined;

    // Allow ?shop=domain preview ONLY when accessing via non-tenant host (localhost / IP / Cloud Run preview)
    if (!matched && req.query?.shop) {
      const qDom = normalizeDomain(String(req.query.shop));
      const candidate = tenants[qDom];
      if (candidate && candidate.enabled) {
        matched = candidate;
      }
    }

    if (matched) {
      const key = matched.api_key.trim();
      const hasLive = Boolean(key && key !== 'MY_GENY_API_KEY');
      return {
        tenantKey: matched.domain,
        resellerName: matched.reseller_name,
        apiKey: key,
        webhookSecret: matched.webhook_secret.trim(),
        apiBaseUrl: (matched.api_base_url || GENY_API_BASE).replace(/\/$/, ''),
        hasLiveKey: hasLive,
        isTestKey: !hasLive || key.startsWith('gk_test_'),
        isDedicatedTenant: true,
      };
    }

    const demoAccount = store.resellers['demo'] || Object.values(store.resellers)[0];
    const hasLive = Boolean(GENY_API_KEY && GENY_API_KEY !== 'MY_GENY_API_KEY');
    return {
      tenantKey: hostDomain || 'default',
      resellerName: demoAccount?.name || 'Samari',
      apiKey: GENY_API_KEY,
      webhookSecret: GENY_WEBHOOK_SECRET,
      apiBaseUrl: GENY_API_BASE,
      hasLiveKey: hasLive,
      isTestKey: !hasLive || GENY_API_KEY.startsWith('gk_test_'),
      isDedicatedTenant: false,
    };
  }

  async function callGenyPartnerWith(ctx: TenantContext, pathname: string, init?: RequestInit) {
    const res = await fetch(`${ctx.apiBaseUrl}${pathname}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${ctx.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  }

  // ── Multi-Domain Tenant Management Endpoints (Authenticated Reseller Portal) ──
  function toTenantView(t: ResellerTenant) {
    return {
      id: t.id,
      domain: t.domain,
      reseller_name: t.reseller_name,
      api_key_masked: maskSecret(t.api_key),
      has_api_key: Boolean(t.api_key),
      has_webhook_secret: Boolean(t.webhook_secret),
      api_base_url: t.api_base_url,
      enabled: t.enabled,
      created: t.created,
      updated: t.updated,
    };
  }

  app.get('/api/v1/portal/tenants', requireReseller, (_req, res) => {
    const list = Object.values(store.tenants || {})
      .sort((a, b) => b.created - a.created)
      .map(toTenantView);
    res.json({ tenants: list });
  });

  app.post('/api/v1/portal/tenants', requireReseller, (req, res) => {
    const domain = normalizeDomain(String(req.body?.domain || ''));
    const resellerName = String(req.body?.reseller_name || '').trim();
    const apiKey = String(req.body?.api_key || '').trim();
    const webhookSecret = String(req.body?.webhook_secret || '').trim();
    const apiBaseUrl = String(req.body?.api_base_url || GENY_API_BASE).trim().replace(/\/$/, '');

    if (!domain || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)) {
      res.status(400).json({ error: 'Entrez un nom de domaine valide (ex: boutique-alice.cm).' });
      return;
    }
    if (!resellerName) {
      res.status(400).json({ error: 'Indiquez le nom commercial du revendeur.' });
      return;
    }
    if (!apiKey || !(apiKey.startsWith('gk_live_') || apiKey.startsWith('gk_test_'))) {
      res.status(400).json({ error: 'La clé API Geny doit commencer par gk_live_ ou gk_test_.' });
      return;
    }

    const existing = store.tenants![domain];
    const tNow = nowSec();
    const record: ResellerTenant = {
      id: existing?.id || `ten_${crypto.randomBytes(6).toString('hex')}`,
      domain,
      reseller_name: resellerName,
      api_key: apiKey,
      webhook_secret: webhookSecret || existing?.webhook_secret || '',
      api_base_url: apiBaseUrl || GENY_API_BASE,
      enabled: req.body?.enabled !== false,
      created: existing?.created || tNow,
      updated: tNow,
    };
    store.tenants![domain] = record;
    saveStore(store);
    res.status(existing ? 200 : 201).json({ tenant: toTenantView(record) });
  });

  app.patch('/api/v1/portal/tenants/:id', requireReseller, (req, res) => {
    const id = req.params.id;
    const found = Object.values(store.tenants || {}).find((t) => t.id === id);
    if (!found) {
      res.status(404).json({ error: 'Domaine introuvable.' });
      return;
    }
    if (typeof req.body?.enabled === 'boolean') found.enabled = req.body.enabled;
    if (typeof req.body?.reseller_name === 'string' && req.body.reseller_name.trim()) {
      found.reseller_name = req.body.reseller_name.trim();
    }
    if (typeof req.body?.api_key === 'string' && req.body.api_key.trim()) {
      const k = req.body.api_key.trim();
      if (!(k.startsWith('gk_live_') || k.startsWith('gk_test_'))) {
        res.status(400).json({ error: 'La clé API doit commencer par gk_live_ ou gk_test_.' });
        return;
      }
      found.api_key = k;
    }
    if (typeof req.body?.webhook_secret === 'string') {
      found.webhook_secret = req.body.webhook_secret.trim();
    }
    found.updated = nowSec();
    saveStore(store);
    res.json({ tenant: toTenantView(found) });
  });

  app.delete('/api/v1/portal/tenants/:id', requireReseller, (req, res) => {
    const id = req.params.id;
    const found = Object.values(store.tenants || {}).find((t) => t.id === id);
    if (!found) {
      res.status(404).json({ error: 'Domaine introuvable.' });
      return;
    }
    delete store.tenants![found.domain];
    saveStore(store);
    res.json({ ok: true });
  });

  app.post('/api/v1/portal/tenants/:id/test', requireReseller, async (req, res) => {
    const id = req.params.id;
    const found = Object.values(store.tenants || {}).find((t) => t.id === id);
    if (!found) {
      res.status(404).json({ error: 'Domaine introuvable.' });
      return;
    }
    const ctx: TenantContext = {
      tenantKey: found.domain,
      resellerName: found.reseller_name,
      apiKey: found.api_key,
      webhookSecret: found.webhook_secret,
      apiBaseUrl: found.api_base_url || GENY_API_BASE,
      hasLiveKey: Boolean(found.api_key),
      isTestKey: found.api_key.startsWith('gk_test_'),
      isDedicatedTenant: true,
    };
    try {
      const [acc, plans] = await Promise.all([
        callGenyPartnerWith(ctx, '/account'),
        callGenyPartnerWith(ctx, '/plans'),
      ]);
      if (!acc.ok) {
        res.status(acc.status || 400).json({
          ok: false,
          error: formatPartnerError(acc.json, 'Clé API refusée par Geny.'),
        });
        return;
      }
      res.json({
        ok: true,
        account_name: acc.json?.name || found.reseller_name,
        partner_id: acc.json?.partner_id || null,
        livemode: !ctx.isTestKey,
        plans_count: Array.isArray(plans.json?.plans) ? plans.json.plans.length : 0,
      });
    } catch {
      res.status(503).json({ ok: false, error: 'Impossible de joindre https://geny.payool.net pour ce test.' });
    }
  });

  const cachedPlansByTenant: Record<string, Plan[]> = {};

  function formatPartnerError(json: Record<string, unknown>, fallback: string): string {
    const code = typeof json.error === 'string' ? json.error : '';
    const msg = typeof json.message === 'string' ? json.message : typeof json.detail === 'string' ? json.detail : '';
    if (msg && code) return `${msg} (${code})`;
    return msg || code || fallback;
  }

  app.get('/api/shop/catalog', async (req, res) => {
    const ctx = resolveTenantContext(req);
    const demoAccount = store.resellers['demo'] || Object.values(store.resellers)[0];

    if (ctx.hasLiveKey) {
      try {
        const [plansResp, accResp] = await Promise.all([
          callGenyPartnerWith(ctx, '/plans'),
          callGenyPartnerWith(ctx, '/account'),
        ]);
        if (plansResp.ok && Array.isArray(plansResp.json?.plans)) {
          const livePlans: Plan[] = plansResp.json.plans.map((p: Record<string, unknown>) => {
            const cp = p.customer_price as Record<string, unknown> | undefined;
            return {
              id: String(p.id || p.plan_id || ''),
              name: String(p.name || ''),
              quota_bytes: typeof p.quota_bytes === 'number' ? p.quota_bytes : null,
              duration_value: Number(p.duration_value || 1),
              duration_unit: p.duration_unit === 'hours' ? 'hours' : 'days',
              price_fcfa: Number(cp?.effective ?? cp?.default ?? p.price_fcfa ?? 0),
              window: typeof p.window === 'string' ? p.window : undefined,
              fair_use: p.fair_use as Plan['fair_use'],
            };
          });
          cachedPlansByTenant[ctx.tenantKey] = livePlans;
          res.json({
            source: 'live_api',
            livemode: !ctx.isTestKey,
            reseller_name: ctx.isDedicatedTenant
              ? ctx.resellerName
              : String(accResp.json?.name || ctx.resellerName || 'Samari'),
            domain: ctx.tenantKey,
            currency: 'XAF',
            plans: livePlans,
            operators: Array.isArray(plansResp.json?.operators) ? plansResp.json.operators : OPERATORS,
            apps: APPS_META,
            guide: GUIDE_META,
            community: COMMUNITY_META,
          });
          return;
        }
      } catch {
        // Fallback cleanly to public Geny catalog below
      }
    }

    // Fetch live public catalog from geny.payool.net if reachable, falling back to local PLANS
    let publicPlans: Plan[] = PLANS;
    let publicOperators = OPERATORS;
    let appsMeta = APPS_META;
    let guideMeta = GUIDE_META;
    let communityMeta = COMMUNITY_META;

    try {
      const [pubPlansRes, pubCfgRes] = await Promise.all([
        fetch('https://geny.payool.net/api/v1/public/plans', { signal: AbortSignal.timeout(4500) }),
        fetch('https://geny.payool.net/api/v1/payment/public-config', { signal: AbortSignal.timeout(4500) }),
      ]);
      if (pubPlansRes.ok) {
        const pj = await pubPlansRes.json();
        if (Array.isArray(pj.plans) && pj.plans.length > 0) {
          publicPlans = pj.plans;
          cachedPlansByTenant[ctx.tenantKey] = pj.plans;
        }
        if (pj.apps) appsMeta = pj.apps;
        if (pj.guide) guideMeta = pj.guide;
        if (Array.isArray(pj.community)) communityMeta = pj.community;
      }
      if (pubCfgRes.ok) {
        const cj = await pubCfgRes.json();
        if (Array.isArray(cj.operators) && cj.operators.length > 0) publicOperators = cj.operators;
      }
    } catch {
      // keep local catalog
    }

    const mergedPlans = publicPlans.map((p) => {
      if (!demoAccount || p.price_fcfa === 0) return p;
      const custom = demoAccount.prices[p.id];
      return custom ? { ...p, price_fcfa: custom } : p;
    });

    res.json({
      source: 'sandbox',
      livemode: false,
      reseller_name: ctx.resellerName || demoAccount?.name || 'Samari',
      domain: ctx.tenantKey,
      currency: 'XAF',
      plans: mergedPlans,
      operators: publicOperators,
      apps: appsMeta,
      guide: guideMeta,
      community: communityMeta,
    });
  });

  app.post('/api/shop/codes/lookup', async (req, res) => {
    const ctx = resolveTenantContext(req);
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: 'Entrez un code Geny à vérifier.' });
      return;
    }

    if (ctx.hasLiveKey) {
      try {
        const r = await callGenyPartnerWith(ctx, '/codes/lookup', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        res.status(r.status).json(r.json);
        return;
      } catch {
        // fallback below
      }
    }

    // Try live public lookup first, then local store
    try {
      const pubLookup = await fetch(
        `https://geny.payool.net/api/v1/codes/lookup?code=${encodeURIComponent(code)}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (pubLookup.ok) {
        const d = await pubLookup.json();
        res.json({
          code: d.code || code,
          valid: true,
          topup_allowed: d.status === 'active',
          plan_name: d.plan_name || 'Forfait Geny',
          status: d.status || 'active',
          quota_bytes: d.quota_bytes ?? null,
          remaining_bytes: d.remaining_bytes ?? null,
          expires_at: d.expires_at ?? null,
          message:
            d.status === 'active'
              ? 'Code actif prêt à être rechargé.'
              : 'Code valide non encore activé (non éligible à une recharge avant activation).',
        });
        return;
      }
    } catch {
      // check local store
    }

    const local = store.codes[code];
    if (!local) {
      res.status(404).json({
        code,
        valid: false,
        topup_allowed: false,
        error: 'Code inconnu ou introuvable.',
      });
      return;
    }

    res.json({
      code: local.code,
      valid: true,
      topup_allowed: local.status === 'active',
      plan_name: local.plan_name,
      status: local.status,
      quota_bytes: local.quota_bytes,
      remaining_bytes: local.quota_bytes,
      expires_at: local.expires_at,
      message:
        local.status === 'active'
          ? 'Code actif prêt à être rechargé.'
          : 'Code prêt à être activé dans l’application Geny.',
    });
  });

  app.post('/api/shop/orders', async (req, res) => {
    const ctx = resolveTenantContext(req);
    const tenantPlans = cachedPlansByTenant[ctx.tenantKey] || PLANS;
    const planId = String(req.body?.plan_id || '');
    const plan = tenantPlans.find((p) => p.id === planId) || PLANS.find((p) => p.id === planId);
    if (!plan) {
      res.status(404).json({ error: 'Forfait introuvable (plan_not_found).' });
      return;
    }

    const rawRef = String(req.body?.order_ref || `CMD-${Date.now().toString(36).toUpperCase()}`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(rawRef)) {
      res.status(400).json({ error: 'Format order_ref invalide.' });
      return;
    }

    const topupCode = req.body?.topup_code ? String(req.body.topup_code).trim().toUpperCase() : null;
    const phone = normalizePhone(String(req.body?.phone || ''));
    const requestedOp = String(req.body?.operator || '');
    const detectedOp = detectOperator(phone);
    const operator = (requestedOp || detectedOp || 'mtn') as 'mtn' | 'orange';

    if (plan.price_fcfa > 0) {
      if (!/^6\d{8}$/.test(phone)) {
        res.status(400).json({ error: 'Numéro Mobile Money invalide (9 chiffres commençant par 6).' });
        return;
      }
      if (detectedOp && requestedOp && detectedOp !== requestedOp) {
        const expected = OPERATORS.find((o) => o.id === detectedOp)?.short || detectedOp;
        res.status(400).json({ error: `Ce numéro appartient à ${expected}.` });
        return;
      }
    }

    const orderStoreKey = `${ctx.tenantKey}::${rawRef}`;
    const existing = store.shopOrders?.[orderStoreKey];
    if (existing) {
      if (
        existing.plan_id !== planId ||
        existing.phone !== phone ||
        existing.topup_code !== topupCode
      ) {
        res.status(409).json({ error: 'Conflit d’idempotence sur cet order_ref (409 idempotency_conflict).' });
        return;
      }
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(200).json(existing);
      return;
    }

    const demoAccount = store.resellers['demo'] || Object.values(store.resellers)[0];
    const effectivePrice = plan.price_fcfa === 0 ? 0 : demoAccount?.prices[plan.id] ?? plan.price_fcfa;

    if (ctx.hasLiveKey && plan.price_fcfa > 0) {
      try {
        const body: Record<string, unknown> = {
          order_ref: rawRef,
          mode: 'direct',
          plan_id: plan.id,
          operator,
          customer: { phone },
        };
        if (topupCode) body.topup_code = topupCode;

        const r = await callGenyPartnerWith(ctx, '/orders', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          res.status(r.status).json({ error: formatPartnerError(r.json, 'Commande refusée par Geny.') });
          return;
        }
        const upstream = r.json;
        const saved: ShopOrderRecord = {
          order_ref: rawRef,
          mode: 'direct',
          plan_id: plan.id,
          plan_name: plan.name,
          amount_fcfa: Number(upstream.customer_price ?? upstream.amount_fcfa ?? effectivePrice),
          operator,
          phone,
          status: upstream.status || 'pending',
          payment: upstream.payment || undefined,
          code: upstream.code || null,
          code_kind: topupCode ? 'topup' : 'new',
          code_balance: upstream.code_balance || null,
          topup_code: topupCode,
          test_mode: ctx.isTestKey,
          failure_reason: upstream.failure_reason || null,
          created: nowSec(),
          updated: nowSec(),
          poll_count: 0,
        };
        store.shopOrders![orderStoreKey] = saved;
        saveStore(store);
        res.status(201).json(saved);
        return;
      } catch {
        res.status(503).json({ error: 'Service Geny momentanément indisponible (503 payment_unavailable).' });
        return;
      }
    }

    // Validate topup_code in sandbox
    if (topupCode && !store.codes[topupCode]) {
      res.status(422).json({
        error: 'Code de recharge inconnu ou non éligible (422 topup_refused).',
      });
      return;
    }

    const t = nowSec();
    const isFree = plan.price_fcfa === 0;
    const freeCode = isFree ? generateGenyCode() : null;

    if (freeCode) {
      store.codes[freeCode] = {
        code: freeCode,
        plan_id: plan.id,
        plan_name: plan.name,
        quota_bytes: plan.quota_bytes,
        duration_value: plan.duration_value,
        duration_unit: plan.duration_unit,
        price_fcfa: 0,
        status: 'unused',
        reseller_login: demoAccount?.login || 'demo',
        phone: null,
        operator: null,
        created: t,
        activated_at: null,
        expires_at: null,
      };
    }

    const record: ShopOrderRecord = {
      order_ref: rawRef,
      mode: 'direct',
      plan_id: plan.id,
      plan_name: plan.name,
      amount_fcfa: effectivePrice,
      operator,
      phone,
      status: isFree ? 'succeeded' : 'pending',
      payment: isFree
        ? undefined
        : {
            requires_otp: operator === 'orange',
            otp_instruction:
              operator === 'orange'
                ? 'Composez #150*50# puis entrez le code de confirmation reçu par SMS.'
                : undefined,
            ussd_instruction:
              operator === 'mtn'
                ? 'Validez la demande MTN MoMo (*126#) sur votre téléphone.'
                : 'Validez la demande Orange Money (#150*50#) sur votre téléphone.',
          },
      code: freeCode,
      code_kind: topupCode ? 'topup' : 'new',
      code_balance: null,
      topup_code: topupCode,
      test_mode: true,
      failure_reason: null,
      created: t,
      updated: t,
      poll_count: 0,
    };

    store.shopOrders![orderStoreKey] = record;
    saveStore(store);
    res.status(201).json(record);
  });

  app.get('/api/shop/orders/:order_ref', async (req, res) => {
    const ctx = resolveTenantContext(req);
    const orderRef = req.params.order_ref;
    const orderStoreKey = `${ctx.tenantKey}::${orderRef}`;
    const record = store.shopOrders?.[orderStoreKey];
    if (!record) {
      res.status(404).json({ error: 'Commande introuvable (404 order_not_found).' });
      return;
    }

    if (ctx.hasLiveKey && record.amount_fcfa > 0 && record.status === 'pending') {
      try {
        const r = await callGenyPartnerWith(ctx, `/orders/${encodeURIComponent(orderRef)}`);
        if (r.ok && r.json) {
          record.status = r.json.status || record.status;
          record.code = r.json.code ?? record.code;
          record.code_balance = r.json.code_balance ?? record.code_balance;
          record.payment = r.json.payment ?? record.payment;
          if (r.json.failure_reason || r.json.error) {
            record.failure_reason = String(r.json.failure_reason || r.json.error);
          }
          record.updated = nowSec();
          saveStore(store);
        }
      } catch {
        // return latest known state
      }
      res.json(record);
      return;
    }

    if (record.status === 'pending') {
      record.poll_count += 1;
      record.updated = nowSec();
      if (record.operator === 'mtn' && record.poll_count >= 2) {
        completeShopOrderSuccess(record, store.resellers['demo']);
      }
      saveStore(store);
    }

    res.json(record);
  });

  app.post('/api/shop/orders/:order_ref/otp', async (req, res) => {
    const ctx = resolveTenantContext(req);
    const orderRef = req.params.order_ref;
    const otp = String(req.body?.otp || '').trim();
    const orderStoreKey = `${ctx.tenantKey}::${orderRef}`;
    const record = store.shopOrders?.[orderStoreKey];
    if (!record) {
      res.status(404).json({ error: 'Commande introuvable (404 order_not_found).' });
      return;
    }
    if (!/^\d{4,8}$/.test(otp)) {
      res.status(400).json({ error: 'Entrez les chiffres reçus par SMS.' });
      return;
    }

    if (ctx.hasLiveKey && record.amount_fcfa > 0) {
      const r = await callGenyPartnerWith(ctx, `/orders/${encodeURIComponent(orderRef)}/otp`, {
        method: 'POST',
        body: JSON.stringify({ otp }),
      });
      if (!r.ok) {
        res.status(r.status).json({ error: formatPartnerError(r.json, 'Code SMS refusé.') });
        return;
      }
      record.status = r.json.status || 'succeeded';
      record.code = r.json.code || record.code;
      record.code_balance = r.json.code_balance ?? record.code_balance;
      record.updated = nowSec();
      saveStore(store);
      res.json(record);
      return;
    }

    completeShopOrderSuccess(record, store.resellers['demo']);
    saveStore(store);
    res.json(record);
  });

  app.post('/api/shop/orders/:order_ref/simulate', async (req, res) => {
    const ctx = resolveTenantContext(req);
    const orderRef = req.params.order_ref;
    const outcome = req.body?.outcome === 'failed' ? 'failed' : 'succeeded';
    const orderStoreKey = `${ctx.tenantKey}::${orderRef}`;
    const record = store.shopOrders?.[orderStoreKey];
    if (!record) {
      res.status(404).json({ error: 'Commande introuvable (404 order_not_found).' });
      return;
    }
    if (!record.test_mode) {
      res.status(403).json({ error: 'Simulation interdite en production (403 test_mode_only).' });
      return;
    }
    if (record.status === 'succeeded') {
      res.status(409).json({ error: 'Commande déjà réussie (409 order_not_simulable).' });
      return;
    }

    if (ctx.hasLiveKey && ctx.isTestKey && record.amount_fcfa > 0) {
      const r = await callGenyPartnerWith(ctx, `/test/orders/${encodeURIComponent(orderRef)}/simulate`, {
        method: 'POST',
        body: JSON.stringify({ outcome }),
      });
      if (!r.ok) {
        res.status(r.status).json({ error: formatPartnerError(r.json, 'Simulation refusée.') });
        return;
      }
      record.status = r.json.status || outcome;
      record.code = r.json.code ?? record.code;
      record.code_balance = r.json.code_balance ?? record.code_balance;
      record.updated = nowSec();
      saveStore(store);
      res.json(record);
      return;
    }

    if (outcome === 'failed') {
      record.status = 'failed';
      record.failure_reason = 'Paiement refusé par l’opérateur (simulation test).';
      record.updated = nowSec();
    } else {
      completeShopOrderSuccess(record, store.resellers['demo']);
    }
    saveStore(store);
    res.json(record);
  });

  app.post('/api/webhooks/geny', (req, res) => {
    const ctx = resolveTenantContext(req);
    const signature = String(req.headers['geny-signature'] || '');
    const eventType = String(req.headers['geny-event-type'] || '');
    const rawBuf = (req as Request & { rawBody?: Buffer }).rawBody;
    const rawPayload = rawBuf ? rawBuf.toString('utf8') : JSON.stringify(req.body || {});

    if (ctx.webhookSecret) {
      const expected = crypto
        .createHmac('sha256', ctx.webhookSecret)
        .update(rawPayload)
        .digest('hex');
      if (!signature.includes(expected)) {
        res.status(401).json({ error: 'Invalid Geny-Signature.' });
        return;
      }
    }

    const orderRef = String(req.body?.data?.order_ref || req.body?.order_ref || '');
    const orderStoreKey = `${ctx.tenantKey}::${orderRef}`;
    if (orderRef && store.shopOrders?.[orderStoreKey]) {
      const rec = store.shopOrders[orderStoreKey];
      const nextStatus = req.body?.data?.status || (eventType === 'order.succeeded' ? 'succeeded' : undefined);
      if (nextStatus) rec.status = nextStatus;
      if (req.body?.data?.code) rec.code = req.body.data.code;
      if (req.body?.data?.code_balance) rec.code_balance = req.body.data.code_balance;
      rec.updated = nowSec();
      saveStore(store);
    }

    res.json({ received: true, tenant: ctx.tenantKey });
  });

  // ── Downloadable Clean VPS Source Archive (.zip) ──
  app.get('/geny-shop-vps.zip', (_req, res) => {
    try {
      const zipBuf = buildProjectSourceZip(process.cwd());
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="geny-shop-vps.zip"');
      res.setHeader('Content-Length', String(zipBuf.length));
      res.send(zipBuf);
    } catch (err) {
      console.error('Failed to generate source zip:', err);
      res.status(500).json({ error: 'Impossible de générer l’archive ZIP.' });
    }
  });

  // ── Vite Middleware / Static Serving ──
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    // Vite 8 injects /@vite/client unconditionally in dev HTML and calls transport.connect()
    // without catching rejections. Provide a zero-WebSocket client shim supporting CSS & HMR stubs.
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url) {
  return url;
}
export class ErrorOverlay extends HTMLElement {}
`);
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Geny Reseller Portal running on http://0.0.0.0:${PORT}`);
  });
}

function finalizePaymentSuccess(session: PaymentSession, reseller: ResellerAccount): void {
  if (session.status === 'succeeded' && session.code) return;
  const plan = PLANS.find((p) => p.id === session.plan_id);
  const code = generateGenyCode();
  const t = nowSec();

  session.status = 'succeeded';
  session.code = code;
  session.updated = t;

  store.codes[code] = {
    code,
    plan_id: session.plan_id,
    plan_name: session.plan_name,
    quota_bytes: plan?.quota_bytes ?? null,
    duration_value: plan?.duration_value ?? 1,
    duration_unit: plan?.duration_unit ?? 'days',
    price_fcfa: session.amount_fcfa,
    status: 'unused',
    reseller_login: reseller.login,
    phone: session.phone,
    operator: session.operator,
    created: t,
    activated_at: null,
    expires_at: null,
  };
}

function executePartnerOrder(
  reseller: ResellerAccount,
  input: {
    plan_id: string;
    mode: 'direct' | 'wallet';
    livemode: boolean;
    phone: string | null;
    operator: string | null;
    external_ref: string | null;
  }
): { order: OrderRecord } | { error: string; status: number } {
  const plan = PLANS.find((p) => p.id === input.plan_id && p.price_fcfa > 0);
  if (!plan) {
    return { error: 'Unknown plan_id.', status: 404 };
  }

  const env = input.livemode ? 'live' : 'test';
  const wholesale = plan.price_fcfa;
  const customerPrice = reseller.prices[plan.id] ?? plan.price_fcfa;
  const margin = Math.max(0, customerPrice - wholesale);
  const t = nowSec();

  if (input.mode === 'wallet') {
    if (reseller.balances[env].wallet < wholesale) {
      return { error: 'Solde prépayé insuffisant pour ce forfait.', status: 402 };
    }
    reseller.balances[env].wallet -= wholesale;
    reseller.ledger.unshift({
      id: `led_${crypto.randomBytes(6).toString('hex')}`,
      livemode: input.livemode,
      type: 'sale',
      label: `Vente API (Prépayé) · ${plan.name}`,
      amount_fcfa: -wholesale,
      balance_after: reseller.balances[env].wallet,
      bucket: 'wallet',
      created: t,
    });
  } else {
    reseller.balances[env].earnings += margin;
    if (margin > 0) {
      reseller.ledger.unshift({
        id: `led_${crypto.randomBytes(6).toString('hex')}`,
        livemode: input.livemode,
        type: 'margin',
        label: `Marge directe · ${plan.name}`,
        amount_fcfa: margin,
        balance_after: reseller.balances[env].earnings,
        bucket: 'earnings',
        created: t,
      });
    }
  }

  const code = generateGenyCode();
  store.codes[code] = {
    code,
    plan_id: plan.id,
    plan_name: plan.name,
    quota_bytes: plan.quota_bytes,
    duration_value: plan.duration_value,
    duration_unit: plan.duration_unit,
    price_fcfa: customerPrice,
    status: 'unused',
    reseller_login: reseller.login,
    phone: input.phone,
    operator: input.operator,
    created: t,
    activated_at: null,
    expires_at: null,
  };

  const order: OrderRecord = {
    id: `ord_${crypto.randomBytes(6).toString('hex')}`,
    livemode: input.livemode,
    mode: input.mode,
    plan_id: plan.id,
    plan_name: plan.name,
    status: 'succeeded',
    amount_fcfa: customerPrice,
    wholesale_fcfa: wholesale,
    margin_fcfa: margin,
    phone: input.phone,
    operator: input.operator,
    code,
    external_ref: input.external_ref,
    created: t,
  };

  reseller.orders.unshift(order);
  saveStore(store);
  return { order };
}

function completeShopOrderSuccess(record: ShopOrderRecord, reseller?: ResellerAccount): void {
  const plan = PLANS.find((p) => p.id === record.plan_id);
  const t = nowSec();
  record.status = 'succeeded';
  record.updated = t;

  if (record.topup_code) {
    record.code = record.topup_code;
    record.code_kind = 'topup';
    const existingCode = store.codes[record.topup_code];
    const addedBytes = plan?.quota_bytes ?? null;
    const newQuota =
      existingCode && existingCode.quota_bytes !== null && addedBytes !== null
        ? existingCode.quota_bytes + addedBytes
        : addedBytes;
    if (existingCode) {
      existingCode.quota_bytes = newQuota;
    }
    record.code_balance = {
      quota_bytes: newQuota,
      expires_at: existingCode?.expires_at ?? t + 86400 * (plan?.duration_value || 7),
    };
  } else {
    const newCode = generateGenyCode();
    record.code = newCode;
    record.code_kind = 'new';
    store.codes[newCode] = {
      code: newCode,
      plan_id: record.plan_id,
      plan_name: record.plan_name,
      quota_bytes: plan?.quota_bytes ?? null,
      duration_value: plan?.duration_value ?? 1,
      duration_unit: plan?.duration_unit ?? 'days',
      price_fcfa: record.amount_fcfa,
      status: 'unused',
      reseller_login: reseller?.login || 'demo',
      phone: record.phone,
      operator: record.operator,
      created: t,
      activated_at: null,
      expires_at: null,
    };
  }

  if (reseller && record.amount_fcfa > 0) {
    const wholesale = plan?.price_fcfa ?? record.amount_fcfa;
    const margin = Math.max(0, record.amount_fcfa - wholesale);
    const env = record.test_mode ? 'test' : 'live';
    if (margin > 0) {
      reseller.balances[env].earnings += margin;
      reseller.ledger.unshift({
        id: `led_${crypto.randomBytes(6).toString('hex')}`,
        livemode: !record.test_mode,
        type: 'margin',
        label: `Boutique Direct · ${record.plan_name}`,
        amount_fcfa: margin,
        balance_after: reseller.balances[env].earnings,
        bucket: 'earnings',
        created: t,
      });
    }
    reseller.orders.unshift({
      id: record.order_ref,
      livemode: !record.test_mode,
      mode: 'direct',
      plan_id: record.plan_id,
      plan_name: record.plan_name,
      status: 'succeeded',
      amount_fcfa: record.amount_fcfa,
      wholesale_fcfa: wholesale,
      margin_fcfa: margin,
      phone: record.phone,
      operator: record.operator,
      code: record.code,
      external_ref: record.order_ref,
      created: t,
    });
  }
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function collectSourceFiles(rootDir: string, relDir = ''): Array<{ relPath: string; absPath: string; isExec: boolean }> {
  const skipDirs = new Set(['node_modules', 'dist', '.data', '.aistudio', '.git']);
  const skipFiles = new Set(['.env', '.env.local', 'geny-shop-vps.zip']);
  const results: Array<{ relPath: string; absPath: string; isExec: boolean }> = [];
  const fullDir = path.join(rootDir, relDir);
  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    const name = entry.name;
    if (entry.isDirectory()) {
      if (skipDirs.has(name)) continue;
      results.push(...collectSourceFiles(rootDir, relDir ? `${relDir}/${name}` : name));
    } else if (entry.isFile()) {
      if (skipFiles.has(name) || name.endsWith('.zip')) continue;
      const relPath = relDir ? `${relDir}/${name}` : name;
      results.push({
        relPath,
        absPath: path.join(fullDir, name),
        isExec: name.endsWith('.sh'),
      });
    }
  }
  return results;
}

function buildProjectSourceZip(rootDir: string): Buffer {
  const files = collectSourceFiles(rootDir);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file.absPath);
    const compressed = zlib.deflateRawSync(raw, { level: 6 });
    const nameBuf = Buffer.from(file.relPath, 'utf8');
    const crc = crc32(raw);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // DEFLATE
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE((3 << 8) | 20, 4); // Unix creator
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    const mode = file.isExec ? 0o100755 : 0o100644;
    centralHeader.writeUInt32LE((mode << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset >>> 0, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central directory
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

startServer().catch((err) => {
  console.error('Failed to start Geny server:', err);
  process.exit(1);
});
