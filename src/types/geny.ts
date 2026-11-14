export type Lang = 'fr' | 'en';
export type ThemeMode = 'light' | 'dark';

export interface AppDownloadMeta {
  version_name: string;
  version_code: number;
  size: number;
  url: string;
}

export interface CommunityLink {
  title: string;
  url: string;
}

export interface PortalMe {
  signed_in: boolean;
  required: boolean;
  name?: string;
  login?: string;
  apps: {
    android?: AppDownloadMeta;
    windows?: AppDownloadMeta;
  };
  community: CommunityLink[];
  guide?: {
    url: string;
    size: number;
  };
}

export interface Plan {
  id: string;
  name: string;
  quota_bytes: number | null;
  duration_value: number;
  duration_unit: 'hours' | 'days';
  price_fcfa: number;
  wholesale_fcfa?: number;
  window?: string;
  fair_use?: {
    daily_gb: number;
    rate_kbit: number;
  };
}

export interface Operator {
  id: 'mtn' | 'orange';
  name: string;
  short: string;
  prefixes: string[];
  available: boolean;
}

export interface SavedCode {
  code: string;
  plan_id: string;
  plan_name: string;
  price_fcfa: number;
  created: number;
  operator?: string;
  phone?: string;
}

export interface PendingPayment {
  reference: string;
  plan_id: string;
  plan_name: string;
  amount_fcfa: number;
  operator: 'mtn' | 'orange';
  phone: string;
  status: 'pending' | 'otp_required' | 'succeeded' | 'cancelled' | 'failed';
  instruction?: string;
  code?: string | null;
  created: number;
}

export interface ApiKeyInfo {
  id: string;
  livemode: boolean;
  prefix: string;
  created: number;
  expires: number | null;
  last_used: number | null;
}

export interface PriceSetting {
  plan_id: string;
  name: string;
  public_price: number;
  wholesale: number;
  min: number;
  max: number;
  customer_price: number | null;
  effective: number;
}

export interface PartnerOrder {
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

export interface LedgerEntry {
  id: string;
  livemode: boolean;
  type: 'topup' | 'sale' | 'margin' | 'payout' | 'refund';
  label: string;
  amount_fcfa: number;
  balance_after: number;
  bucket: 'wallet' | 'earnings';
  created: number;
}

export interface WebhookConfig {
  url: string;
  secret: string;
  enabled: boolean;
  last_status: number | null;
  last_delivered_at: number | null;
}

export interface PartnerData {
  allowed: boolean;
  base_url: string;
  account: {
    id: string;
    name: string;
    login: string;
    created: number;
    last_used: number | null;
    enabled: boolean;
    modes: { direct: boolean; wallet: boolean };
    keys: ApiKeyInfo[];
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
    prices: PriceSetting[];
    orders: PartnerOrder[];
    ledger: LedgerEntry[];
    topup: {
      available: boolean;
      min: number;
      max: number;
      currency: 'XAF';
      operators: Operator[];
    };
    topups: Array<{
      id: string;
      operator: string;
      phone: string;
      amount_fcfa: number;
      status: string;
      reference: string;
      created: number;
    }>;
    payout: {
      available: boolean;
      provider: string;
      minimum: number;
      fee_rate: number;
      currency: 'XAF';
    };
    payouts: Array<{
      id: string;
      operator: string;
      phone: string;
      gross_fcfa: number;
      fee_fcfa: number;
      net_fcfa: number;
      status: string;
      reference: string;
      created: number;
    }>;
  };
}

export interface ShopCatalog {
  source: 'live_api' | 'sandbox';
  livemode: boolean;
  reseller_name: string;
  domain?: string;
  currency: 'XAF';
  plans: Plan[];
  operators: Operator[];
  apps: {
    android?: AppDownloadMeta;
    windows?: AppDownloadMeta;
  };
  guide?: {
    url: string;
    size: number;
  };
  community: CommunityLink[];
}

export interface ResellerTenantView {
  id: string;
  domain: string;
  reseller_name: string;
  api_key_masked: string;
  has_api_key: boolean;
  has_webhook_secret: boolean;
  api_base_url: string;
  enabled: boolean;
  created: number;
  updated: number;
}

export interface ShopOrder {
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
  code?: string | null;
  code_kind?: 'new' | 'topup';
  code_balance?: {
    quota_bytes?: number | null;
    expires_at?: number | null;
  } | null;
  topup_code?: string | null;
  test_mode?: boolean;
  failure_reason?: string | null;
  created: number;
}

export interface CodeLookupResult {
  code: string;
  valid: boolean;
  topup_allowed: boolean;
  plan_name: string;
  status: 'unused' | 'active' | 'expired' | 'disabled';
  quota_bytes: number | null;
  remaining_bytes?: number | null;
  expires_at?: number | null;
  message?: string;
}
