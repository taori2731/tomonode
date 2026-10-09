/**
 * Shared Stripe supporter plan for the desktop app and website.
 *
 * Client integration is available after isolated billing acceptance. This
 * flag never authorizes sales: the authenticated server checkoutEnabled flag,
 * verified live deployment policy and native qualification checks still gate it.
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
  enabled: true,
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
