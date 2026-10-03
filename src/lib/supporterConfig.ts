/**
 * Shared Stripe supporter plan for the desktop app and website.
 *
 * Enable only after the monthly Price, benefits, terms, Checkout, signed
 * webhooks and Customer Portal have been verified in Stripe test mode.
 * This is the planned price; configure Stripe's Price separately on the server.
 * No secret keys or Checkout URLs belong here.
 */
export type SupporterConfig = {
  enabled: boolean;
  provider: "stripe";
  monthlyAmount: number;
  currency: "USD";
  taxBehavior: "exclusive";
  freeServerLimit: number;
};

export const supportConfig: SupporterConfig = {
  enabled: false,
  provider: "stripe",
  monthlyAmount: 3,
  currency: "USD",
  taxBehavior: "exclusive",
  freeServerLimit: 3,
};

export function formatSupportMonthlyAmount(locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: supportConfig.currency,
    maximumFractionDigits: 0,
  }).format(supportConfig.monthlyAmount);
}
