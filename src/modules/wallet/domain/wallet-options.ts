export interface WalletOptions {
  /** Largest single top-up / transfer / withdrawal, paise. */
  maxTxnPaise: number;
  /** Outgoing (transfers + withdrawals) per calendar day in timeZone, paise. */
  dailyOutgoingLimitPaise: number;
  /** Most a wallet may hold (RBI-style cap for small PPIs), paise. */
  maxBalancePaise: number;
  timeZone: string;
  gatewayLatencyMs: number;
}

export const DEFAULT_WALLET_OPTIONS: WalletOptions = {
  maxTxnPaise: 50_000_00,
  dailyOutgoingLimitPaise: 1_00_000_00,
  maxBalancePaise: 2_00_000_00,
  timeZone: 'Asia/Kolkata',
  gatewayLatencyMs: 100,
};

export const WALLET_OPTIONS = Symbol('WALLET_OPTIONS');
