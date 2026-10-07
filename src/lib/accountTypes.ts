export interface AccountBillingStatus {
  signedIn: boolean;
  enabled: boolean;
  // Older API/native builds may omit this field; absence must never enable sales.
  checkoutEnabled?: boolean;
}

export interface AccountProfile {
  userId?: string | null;
  email: string;
  displayName: string;
  hasPassword: boolean;
  avatarDataUrl: string | null;
  createdAt?: number | null;
}

export interface AccountPasswordChallenge {
  challengeId: string;
  expiresInSeconds: number;
}

export interface AccountPasswordSetup {
  setupToken: string;
  expiresInSeconds: number;
}

export type AccountBrowserAuthMode = "login" | "register";
export type AccountBrowserAuthLocale = "ja" | "en";

export interface AccountBrowserAuthStart {
  browserUrl: string;
  requestId: string;
  userCode: string;
  expiresInSeconds: number;
  intervalSeconds: number;
}

export interface AccountBrowserAuthPoll {
  status: "pending" | "complete" | "expired";
  account: AccountProfile | null;
}

export type AccountAvatarMimeType = "image/png" | "image/jpeg" | "image/webp";
