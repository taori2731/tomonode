/**
 * Single switch for the optional GitHub Sponsors flow.
 *
 * Keep this disabled until the GitHub Sponsors recipient setup and listing
 * review are complete. The URLs are fixed constants so UI callers never
 * accept an arbitrary external destination.
 */
export type SupporterConfig = {
  enabled: boolean;
  sponsorUrl: string;
  setupUrl: string;
};

export const GITHUB_SPONSORS_URL = "https://github.com/sponsors/taori2731";
export const GITHUB_SPONSORS_SETUP_URL = "https://docs.github.com/ja/sponsors/receiving-sponsorships-through-github-sponsors/setting-up-github-sponsors-for-your-personal-account";

export const supportConfig: SupporterConfig = {
  enabled: false,
  sponsorUrl: GITHUB_SPONSORS_URL,
  setupUrl: GITHUB_SPONSORS_SETUP_URL,
};

export const supportExternalUrls = [GITHUB_SPONSORS_URL, GITHUB_SPONSORS_SETUP_URL] as const;

export type SupportExternalUrl = (typeof supportExternalUrls)[number];

export function isSupportExternalUrl(value: string): value is SupportExternalUrl {
  return supportExternalUrls.includes(value as SupportExternalUrl);
}
