export interface AccountProfile {
  email: string;
  displayName: string;
  hasPassword: boolean;
  avatarDataUrl: string | null;
}

export interface AccountPasswordChallenge {
  challengeId: string;
  expiresInSeconds: number;
}

export interface AccountPasswordSetup {
  setupToken: string;
  expiresInSeconds: number;
}

export type AccountAvatarMimeType = "image/png" | "image/jpeg" | "image/webp";
