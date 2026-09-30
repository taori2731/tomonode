const API_BASE = "https://tomonode-account-api.rafaerunacaya27.workers.dev";

const translations = {
  ja: {
    languageLabel: "表示言語",
    loginTitle: "TomoNode にログイン",
    loginIntro: "アカウント情報を入力してください。",
    registerTitle: "アカウントを作成",
    registerIntro: "メールアドレスを確認して、TomoNode アカウントを作成します。",
    verifyTitle: "メールアドレスを確認",
    verifyIntro: "メールに届いた確認コードを入力してください。",
    resetTitle: "パスワードを再設定",
    resetIntro: "登録したメールアドレスにパスワード再設定リンクを送信します。",
    connectTitle: "デスクトップアプリに接続",
    connectIntro: "内容を確認して、アカウントへの接続を承認してください。",
    accountTitle: "ログインしました",
    accountIntro: "このページではログイン状態を保持しています。",
    completeTitle: "完了しました",
    completeIntro: "手続きが完了しました。",
    pairingTitle: "デスクトップアプリとの接続",
    pairingCopy: "アプリに表示されたコードと一致していることを確認してください。",
    pairingCodeLabel: "デスクトップアプリの確認コード",
    pairingExpiry: "このコードは約{minutes}分間有効です。",
    emailLabel: "メールアドレス",
    passwordLabel: "パスワード",
    passwordHint: "6〜128文字（UTF-8で512バイト以内）",
    confirmPasswordLabel: "パスワード（確認）",
    showPassword: "パスワードを表示",
    hidePassword: "パスワードを隠す",
    forgotLink: "パスワードを忘れた場合",
    loginButton: "ログイン",
    noAccount: "アカウントをお持ちでない場合",
    createAccount: "新規登録",
    loginCodeIntro: "登録メールアドレスに届いた6桁の確認コードを入力してください。",
    codeLabel: "確認コード",
    verifyButton: "確認して続行",
    backToLogin: "ログインに戻る",
    sendEnrollmentCodeButton: "確認コードを送信",
    enrollmentCodeIntro: "メールに届いた6桁の確認コードを入力してください。",
    finishEnrollmentButton: "確認してアカウントを作成",
    hasAccount: "すでにアカウントをお持ちの場合",
    loginLink: "ログイン",
    resetIntroText: "登録したメールアドレスにパスワード再設定リンクを送信します。",
    sendResetButton: "再設定リンクを送信",
    consentAccountLabel: "ログイン中のアカウント",
    consentCodeLabel: "接続するデスクトップアプリのコード",
    consentIntro: "このアカウントを使って、表示中のTomoNodeデスクトップアプリにログインします。",
    approveButton: "このアプリにログイン",
    cancelButton: "ログアウト",
    signedInAs: "ログイン中のアカウント",
    logoutButton: "ログアウト",
    continueToLogin: "ログインして続ける",
    backHome: "TomoNode に戻る",
    accountDataLabel: "認証とデータの扱い",
    accountDataCloud: "メールアドレスとアカウント情報は Cloudflare に保存されます。パスワードの確認・管理には Firebase Authentication を使用し、TomoNode のデータベースには平文パスワードを保存しません。確認コードを含むメールは Resend 経由で送信されます。",
    accountDataToken: "このページのセッショントークンはメモリ内だけに保持され、ブラウザーの保存領域には書き込みません。デスクトップアプリの認証情報は Windows Credential Manager に保存されます。",
    accountDataTracking: "このアカウントページには広告・解析ツールを設置していません。",
    accountDataPolicyPending: "正式なプライバシーポリシーは現在整備中です。",
    helpLink: "ヘルプ",
    emailInvalid: "有効なメールアドレスを入力してください。",
    passwordInvalid: "パスワードは6〜128文字、UTF-8で512バイト以内にしてください。",
    passwordMismatch: "確認用パスワードが一致しません。",
    codeInvalid: "6桁の数字を入力してください。",
    pairingChecking: "デスクトップアプリの接続を確認しています…",
    pairingInvalid: "このアプリ接続リンクは無効か期限切れです。アプリに戻って接続をやり直してください。",
    pairingNotPending: "このアプリ接続リンクはすでに使用されたか、期限切れです。アプリに戻って接続をやり直してください。",
    loginCodeSent: "確認コードをメールに送信しました。",
    loginFailed: "メールアドレスまたはパスワードを確認してください。",
    loginRateLimited: "試行回数が上限に達しました。時間をおいてからもう一度お試しください。",
    serviceUnavailable: "現在サービスを利用できません。時間をおいてからもう一度お試しください。",
    codeRejected: "確認コードが無効か期限切れです。メールの最新のコードを確認してください。",
    networkError: "通信に失敗しました。インターネット接続を確認して、もう一度お試しください。",
    resetRequested: "該当するアカウントがある場合、再設定リンクをメールで送信します。受信箱をご確認ください。",
    resetRateLimited: "試行回数が上限に達しました。時間をおいてからもう一度お試しください。",
    resetRequestFailed: "再設定メールを送信できませんでした。メールアドレスを確認して、もう一度お試しください。",
    enrollmentCodeSent: "確認コードをメールに送信しました。",
    enrollmentRequestFailed: "確認コードを送信できませんでした。メールアドレスを確認するか、ログインをお試しください。",
    enrollmentCodeRejected: "確認コードが無効か期限切れです。メールの最新のコードを確認してください。",
    enrollmentFailed: "アカウントを作成できませんでした。入力内容を確認して、もう一度お試しください。",
    enrollmentSuccess: "アカウントを作成しました。続けるにはログインしてください。デスクトップアプリの接続がある場合は、ログイン後にコードを確認して承認できます。",
    desktopSuccess: "TomoNodeデスクトップアプリへのログインを承認しました。このタブを閉じてアプリに戻ってください。",
    approveFailed: "アプリへの接続を承認できませんでした。コードを確認するか、アプリで接続をやり直してください。",
    reauthRequired: "セッションの有効期限が切れました。もう一度ログインしてください。",
    logoutDone: "ログアウトしました。",
    logoutLocalDone: "このページのログイン状態を終了しました。",
    forgotLinkTitle: "パスワードを再設定",
  },
  en: {
    languageLabel: "Language",
    loginTitle: "Sign in to TomoNode",
    loginIntro: "Enter your account details.",
    registerTitle: "Create an account",
    registerIntro: "Verify your email address to create a TomoNode account.",
    verifyTitle: "Verify your email",
    verifyIntro: "Enter the verification code sent to your email.",
    resetTitle: "Reset your password",
    resetIntro: "We’ll email a password reset link if an account matches this address.",
    connectTitle: "Connect to the desktop app",
    connectIntro: "Review the details and approve access to your account.",
    accountTitle: "You’re signed in",
    accountIntro: "Your sign-in stays in memory on this page.",
    completeTitle: "Complete",
    completeIntro: "The request is complete.",
    pairingTitle: "Connect to the desktop app",
    pairingCopy: "Check that this code matches the one shown in the app.",
    pairingCodeLabel: "Desktop app confirmation code",
    pairingExpiry: "This code is valid for about {minutes} minutes.",
    emailLabel: "Email address",
    passwordLabel: "Password",
    passwordHint: "6–128 characters (up to 512 UTF-8 bytes)",
    confirmPasswordLabel: "Confirm password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    forgotLink: "Forgot your password?",
    loginButton: "Sign in",
    noAccount: "New to TomoNode?",
    createAccount: "Create an account",
    loginCodeIntro: "Enter the six-digit code sent to your email address.",
    codeLabel: "Verification code",
    verifyButton: "Verify and continue",
    backToLogin: "Back to sign in",
    sendEnrollmentCodeButton: "Send verification code",
    enrollmentCodeIntro: "Enter the six-digit code sent to your email address.",
    finishEnrollmentButton: "Verify and create account",
    hasAccount: "Already have an account?",
    loginLink: "Sign in",
    resetIntroText: "We’ll email a password reset link if an account matches this address.",
    sendResetButton: "Send reset link",
    consentAccountLabel: "Signed-in account",
    consentCodeLabel: "Desktop app confirmation code",
    consentIntro: "This will sign in to the TomoNode desktop app shown on this page using this account.",
    approveButton: "Sign in to this app",
    cancelButton: "Sign out",
    signedInAs: "Signed-in account",
    logoutButton: "Sign out",
    continueToLogin: "Continue to sign in",
    backHome: "Back to TomoNode",
    accountDataLabel: "Authentication and data",
    accountDataCloud: "Email addresses and account records are stored on Cloudflare. Password verification and management use Firebase Authentication; the TomoNode database does not store plaintext passwords. Verification-code emails are sent through Resend.",
    accountDataToken: "This page keeps its session token in memory only and does not write it to browser storage. The desktop app stores its credential in Windows Credential Manager.",
    accountDataTracking: "This account page does not include advertising or analytics tools.",
    accountDataPolicyPending: "A formal privacy policy is being prepared.",
    helpLink: "Help",
    emailInvalid: "Enter a valid email address.",
    passwordInvalid: "Use 6–128 characters and no more than 512 UTF-8 bytes.",
    passwordMismatch: "The passwords do not match.",
    codeInvalid: "Enter a six-digit code.",
    pairingChecking: "Checking the desktop app connection…",
    pairingInvalid: "This app connection link is invalid or expired. Return to the app and start again.",
    pairingNotPending: "This app connection was already used or has expired. Return to the app and start again.",
    loginCodeSent: "A verification code was sent to your email.",
    loginFailed: "Check your email address or password.",
    loginRateLimited: "Too many attempts. Wait a while, then try again.",
    serviceUnavailable: "The service is unavailable right now. Try again later.",
    codeRejected: "The code is invalid or expired. Check the latest code in your email.",
    networkError: "Connection failed. Check your internet connection and try again.",
    resetRequested: "If an account matches this address, a reset link has been sent. Check your inbox.",
    resetRateLimited: "Too many attempts. Wait a while, then try again.",
    resetRequestFailed: "The reset email could not be sent. Check the address and try again.",
    enrollmentCodeSent: "A verification code was sent to your email.",
    enrollmentRequestFailed: "The code could not be sent. Check the address or try signing in.",
    enrollmentCodeRejected: "The code is invalid or expired. Check the latest code in your email.",
    enrollmentFailed: "The account could not be created. Check your details and try again.",
    enrollmentSuccess: "Your account is ready. Sign in to continue. If you started from the desktop app, you can review and approve its code after signing in.",
    desktopSuccess: "Sign-in to the TomoNode desktop app is approved. Close this tab and return to the app.",
    approveFailed: "The app connection could not be approved. Check the code or start again in the app.",
    reauthRequired: "Your session expired. Please sign in again.",
    logoutDone: "You are signed out.",
    logoutLocalDone: "The sign-in on this page has ended.",
    forgotLinkTitle: "Reset your password",
  },
};

const query = new URLSearchParams(window.location.search);
const rawRequestId = query.get("request") ?? "";
const requestMode = query.get("mode") ?? "";
const queryLocale = query.get("lang") ?? "";
const browserRequestId = /^[a-f0-9]{32}$/i.test(rawRequestId) ? rawRequestId.toLowerCase() : "";
let locale = queryLocale === "ja" || queryLocale === "en"
  ? queryLocale
  : (navigator.language?.toLowerCase().startsWith("ja") ? "ja" : "en");

// The desktop request id is a short-lived capability. Keep it in memory only,
// and remove all incoming query values before making any network request.
if (window.location.search || window.location.hash) {
  history.replaceState(null, "", window.location.pathname);
}

const pageTitle = document.querySelector("#page-title");
const pageIntro = document.querySelector("#page-intro");
const languageSelect = document.querySelector("#language-select");
const statusElement = document.querySelector("#status");
const pairingPanel = document.querySelector("#pairing-panel");
const pairingCodeElement = document.querySelector("#pairing-code");
const pairingExpiryElement = document.querySelector("#pairing-expiry");
const completionCopy = document.querySelector("#completion-copy");
const completionLoginButton = document.querySelector("#completion-login");
const viewElements = {
  login: document.querySelector("#login-view"),
  "login-code": document.querySelector("#login-code-view"),
  register: document.querySelector("#register-view"),
  reset: document.querySelector("#reset-view"),
  consent: document.querySelector("#consent-view"),
  signedIn: document.querySelector("#signed-in-view"),
  complete: document.querySelector("#complete-view"),
};

const viewCopy = {
  login: ["loginTitle", "loginIntro"],
  "login-code": ["verifyTitle", "verifyIntro"],
  register: ["registerTitle", "registerIntro"],
  reset: ["resetTitle", "resetIntro"],
  consent: ["connectTitle", "connectIntro"],
  signedIn: ["accountTitle", "accountIntro"],
  complete: ["completeTitle", "completeIntro"],
};

let currentView = "login";
let currentStatus = null;
let completionKey = "enrollmentSuccess";
let loginChallengeId = "";
let session = null;
let pairingRequestId = browserRequestId;
let pairingUserCode = "";
let pairingExpiresInSeconds = 0;
let pairingReady = !rawRequestId || !browserRequestId;
let busy = false;

function t(key) {
  return translations[locale][key] ?? translations.en[key] ?? key;
}

function renderStatus() {
  if (!currentStatus) {
    statusElement.hidden = true;
    statusElement.textContent = "";
    statusElement.classList.remove("error", "success");
    return;
  }
  let message = t(currentStatus.key);
  for (const [name, value] of Object.entries(currentStatus.values ?? {})) {
    message = message.replace(`{${name}}`, String(value));
  }
  statusElement.textContent = message;
  statusElement.hidden = false;
  statusElement.classList.toggle("error", currentStatus.kind === "error");
  statusElement.classList.toggle("success", currentStatus.kind === "success");
}

function renderLanguage() {
  const strings = translations[locale];
  document.documentElement.lang = locale;
  document.title = `${t(viewCopy[currentView][0])} | TomoNode`;
  pageTitle.textContent = t(viewCopy[currentView][0]);
  pageIntro.textContent = t(viewCopy[currentView][1]);
  pageIntro.hidden = currentView === "complete";
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = strings[element.dataset.i18n] ?? translations.en[element.dataset.i18n] ?? "";
  }
  languageSelect.value = locale;
  languageSelect.setAttribute("aria-label", t("languageLabel"));
  pairingCodeElement.setAttribute("aria-label", t("pairingCodeLabel"));
  if (pairingExpiresInSeconds > 0) {
    pairingExpiryElement.textContent = t("pairingExpiry").replace("{minutes}", String(Math.ceil(pairingExpiresInSeconds / 60)));
  }
  if (currentView === "complete") {
    completionCopy.textContent = t(completionKey);
    completionLoginButton.hidden = completionKey === "desktopSuccess";
  }
  for (const button of document.querySelectorAll("[data-toggle-password]")) {
    const input = document.getElementById(button.dataset.togglePassword);
    const visible = input.type === "text";
    button.setAttribute("aria-label", t(visible ? "hidePassword" : "showPassword"));
    button.setAttribute("aria-pressed", String(visible));
  }
  renderStatus();
}

function showStatus(key, kind = "info", values = {}) {
  currentStatus = { key, kind, values };
  renderStatus();
}

function clearStatus() {
  currentStatus = null;
  renderStatus();
}

function setView(name, focusSelector = null) {
  currentView = name;
  for (const [viewName, element] of Object.entries(viewElements)) {
    element.hidden = viewName !== name;
  }
  clearStatus();
  renderLanguage();
  if (focusSelector) requestAnimationFrame(() => document.querySelector(focusSelector)?.focus());
}

function setBusy(button, value) {
  busy = value;
  if (button) button.disabled = value;
}

async function withLock(button, operation) {
  if (busy) return;
  setBusy(button, true);
  try {
    await operation();
  } catch {
    showStatus("networkError", "error");
  } finally {
    setBusy(button, false);
  }
}

async function callApi(path, { method = "POST", body, accessToken } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
  });
  let data = {};
  try { data = await response.json(); } catch {}
  return { ok: response.ok, status: response.status, data };
}

function emailIsValid(input) {
  input.value = input.value.trim();
  if (!input.value || !input.checkValidity()) {
    input.focus();
    showStatus("emailInvalid", "error");
    return false;
  }
  return true;
}

function passwordIsValid(value, input) {
  const length = Array.from(value).length;
  const valid = length >= 6 && length <= 128 && new TextEncoder().encode(value).byteLength <= 512;
  if (!valid) {
    input.focus();
    showStatus("passwordInvalid", "error");
  }
  return valid;
}

function codeIsValid(input) {
  input.value = input.value.trim();
  if (!/^\d{6}$/.test(input.value)) {
    input.focus();
    showStatus("codeInvalid", "error");
    return false;
  }
  return true;
}

function handleAuthFailure(status, operation) {
  if (status === 429) {
    showStatus(operation === "reset" ? "resetRateLimited" : "loginRateLimited", "error");
  } else if (status === 503) {
    showStatus("serviceUnavailable", "error");
  } else if (operation === "login") {
    showStatus("loginFailed", "error");
  } else if (operation === "code") {
    showStatus("codeRejected", "error");
  } else if (operation === "enrollment-code") {
    showStatus("enrollmentCodeRejected", "error");
  } else if (operation === "enrollment") {
    showStatus("enrollmentFailed", "error");
  } else if (operation === "reset") {
    showStatus("resetRequestFailed", "error");
  } else {
    showStatus("approveFailed", "error");
  }
}

async function initializePairing() {
  if (!rawRequestId) return;
  if (!pairingRequestId) {
    pairingReady = true;
    showStatus("pairingInvalid", "error");
    return;
  }
  showStatus("pairingChecking");
  const params = new URLSearchParams({ requestId: pairingRequestId });
  try {
    const result = await callApi(`/v1/auth/browser/request?${params.toString()}`, { method: "GET" });
    const userCode = typeof result.data.userCode === "string" ? result.data.userCode.trim().toUpperCase() : "";
    const expiresInSeconds = Number(result.data.expiresInSeconds);
    if (!result.ok || result.data.status !== "pending" || !/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(userCode)
      || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
      pairingRequestId = "";
      pairingReady = true;
      showStatus(result.status === 410 || result.data.status !== "pending" ? "pairingNotPending" : "pairingInvalid", "error");
      return;
    }
    pairingReady = true;
    pairingUserCode = userCode;
    pairingExpiresInSeconds = Math.min(600, Math.ceil(expiresInSeconds));
    pairingCodeElement.textContent = pairingUserCode;
    pairingPanel.hidden = false;
    document.querySelector("#consent-user-code").textContent = pairingUserCode;
    renderLanguage();
    clearStatus();
  } catch {
    pairingRequestId = "";
    pairingReady = true;
    showStatus("pairingInvalid", "error");
  }
}

document.querySelector("#login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const emailInput = document.querySelector("#login-email");
  const passwordInput = document.querySelector("#login-password");
  if (pairingRequestId && !pairingReady) {
    showStatus("pairingChecking");
    return;
  }
  if (!emailIsValid(emailInput) || !passwordIsValid(passwordInput.value, passwordInput)) return;
  const button = event.currentTarget.querySelector("button[type=submit]");
  void withLock(button, async () => {
    const result = await callApi("/v1/auth/password/login", {
      body: { email: emailInput.value, password: passwordInput.value },
    });
    if (!result.ok || !/^[a-f0-9]{64}$/i.test(result.data.challengeId ?? "")
      || !Number.isFinite(Number(result.data.expiresInSeconds)) || Number(result.data.expiresInSeconds) <= 0) {
      handleAuthFailure(result.status, "login");
      return;
    }
    loginChallengeId = result.data.challengeId.toLowerCase();
    passwordInput.value = "";
    document.querySelector("#login-code").value = "";
    setView("login-code", "#login-code");
    showStatus("loginCodeSent", "success");
  });
});

document.querySelector("#login-code-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const codeInput = document.querySelector("#login-code");
  if (!loginChallengeId || !codeIsValid(codeInput)) return;
  const button = event.currentTarget.querySelector("button[type=submit]");
  void withLock(button, async () => {
    const result = await callApi("/v1/auth/password/verify-login-code", {
      body: { challengeId: loginChallengeId, code: codeInput.value },
    });
    const accessToken = typeof result.data.accessToken === "string" ? result.data.accessToken.toLowerCase() : "";
    const accountEmail = typeof result.data.account?.email === "string" ? result.data.account.email : "";
    if (!result.ok || !/^[a-f0-9]{64}$/.test(accessToken) || !accountEmail) {
      handleAuthFailure(result.status, "code");
      return;
    }
    loginChallengeId = "";
    codeInput.value = "";
    session = { accessToken, email: accountEmail };
    if (pairingRequestId && pairingUserCode) {
      document.querySelector("#consent-email").textContent = session.email;
      document.querySelector("#consent-user-code").textContent = pairingUserCode;
      setView("consent");
    } else {
      document.querySelector("#signed-in-email").textContent = session.email;
      setView("signedIn");
    }
  });
});

document.querySelector("#register-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const emailInput = document.querySelector("#register-email");
  const passwordInput = document.querySelector("#register-password");
  const confirmInput = document.querySelector("#register-confirm");
  if (!emailIsValid(emailInput) || !passwordIsValid(passwordInput.value, passwordInput)) return;
  if (passwordInput.value !== confirmInput.value) {
    confirmInput.focus();
    showStatus("passwordMismatch", "error");
    return;
  }
  const button = event.currentTarget.querySelector("button[type=submit]");
  const form = event.currentTarget;
  void withLock(button, async () => {
    const result = await callApi("/v1/auth/password/request-enrollment-code", {
      body: { email: emailInput.value },
    });
    if (!result.ok) {
      if (result.status === 429) showStatus("loginRateLimited", "error");
      else if (result.status === 503) showStatus("serviceUnavailable", "error");
      else showStatus("enrollmentRequestFailed", "error");
      return;
    }
    document.querySelector("#register-code").value = "";
    document.querySelector("#register-code-form").hidden = false;
    form.hidden = true;
    setView("register", "#register-code");
    showStatus("enrollmentCodeSent", "success");
  });
});

document.querySelector("#register-code-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const emailInput = document.querySelector("#register-email");
  const passwordInput = document.querySelector("#register-password");
  const codeInput = document.querySelector("#register-code");
  if (!emailInput.value || !passwordIsValid(passwordInput.value, passwordInput) || !codeIsValid(codeInput)) return;
  const button = event.currentTarget.querySelector("button[type=submit]");
  const form = event.currentTarget;
  void withLock(button, async () => {
    const verified = await callApi("/v1/auth/password/verify-enrollment-code", {
      body: { email: emailInput.value, code: codeInput.value },
    });
    const setupToken = typeof verified.data.setupToken === "string" ? verified.data.setupToken.toLowerCase() : "";
    if (!verified.ok || !/^[a-f0-9]{64}$/.test(setupToken)
      || !Number.isFinite(Number(verified.data.expiresInSeconds)) || Number(verified.data.expiresInSeconds) <= 0) {
      handleAuthFailure(verified.status, "enrollment-code");
      return;
    }
    const enrolled = await callApi("/v1/auth/password/enroll", {
      body: { email: emailInput.value, setupToken, password: passwordInput.value },
    });
    if (!enrolled.ok) {
      handleAuthFailure(enrolled.status, "enrollment");
      return;
    }
    document.querySelector("#login-email").value = emailInput.value;
    passwordInput.value = "";
    document.querySelector("#register-confirm").value = "";
    codeInput.value = "";
    document.querySelector("#register-form").hidden = false;
    form.hidden = true;
    completionKey = "enrollmentSuccess";
    setView("complete");
    showStatus("enrollmentSuccess", "success");
  });
});

document.querySelector("#reset-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const emailInput = document.querySelector("#reset-email");
  if (!emailIsValid(emailInput)) return;
  const button = event.currentTarget.querySelector("button[type=submit]");
  void withLock(button, async () => {
    const result = await callApi("/v1/auth/password/request-reset", { body: { email: emailInput.value } });
    if (result.ok) showStatus("resetRequested", "success");
    else if (result.status === 429) showStatus("resetRateLimited", "error");
    else if (result.status === 503) showStatus("serviceUnavailable", "error");
    else showStatus("resetRequestFailed", "error");
  });
});

async function endSession(button) {
  if (!session) {
    setView("login", "#login-email");
    return;
  }
  const token = session.accessToken;
  let loggedOut = false;
  try {
    const result = await callApi("/v1/auth/logout", { accessToken: token });
    loggedOut = result.ok;
  } catch {}
  session = null;
  document.querySelector("#login-password").value = "";
  setView("login", "#login-email");
  showStatus(loggedOut ? "logoutDone" : "logoutLocalDone", "success");
  if (button) button.disabled = false;
}

document.querySelector("#approve-button").addEventListener("click", (event) => {
  void withLock(event.currentTarget, async () => {
    if (!session || !pairingRequestId || !pairingUserCode) {
      showStatus("pairingInvalid", "error");
      return;
    }
    const result = await callApi("/v1/auth/browser/approve", {
      body: { requestId: pairingRequestId, userCode: pairingUserCode },
      accessToken: session.accessToken,
    });
    if (!result.ok) {
      if (result.status === 401) {
        session = null;
        setView("login", "#login-email");
        showStatus("reauthRequired", "error");
      } else if (result.status === 410 || result.status === 409) {
        pairingRequestId = "";
        pairingUserCode = "";
        pairingPanel.hidden = true;
        showStatus("pairingNotPending", "error");
      } else if (result.status === 429) {
        showStatus("loginRateLimited", "error");
      } else {
        handleAuthFailure(result.status, "approve");
      }
      return;
    }
    // The Worker consumes and revokes this session when it approves the app.
    session = null;
    pairingRequestId = "";
    pairingUserCode = "";
    pairingPanel.hidden = true;
    completionKey = "desktopSuccess";
    setView("complete");
  });
});

document.querySelector("#cancel-approval").addEventListener("click", (event) => {
  void withLock(event.currentTarget, () => endSession(event.currentTarget));
});

document.querySelector("#logout-button").addEventListener("click", (event) => {
  void withLock(event.currentTarget, () => endSession(event.currentTarget));
});

document.querySelector("#show-register").addEventListener("click", () => {
  const loginEmail = document.querySelector("#login-email").value.trim();
  if (loginEmail) document.querySelector("#register-email").value = loginEmail;
  document.querySelector("#register-form").hidden = false;
  document.querySelector("#register-code-form").hidden = true;
  setView("register", "#register-email");
});

function clearRegistration() {
  document.querySelector("#register-form").reset();
  document.querySelector("#register-code-form").reset();
  document.querySelector("#register-form").hidden = false;
  document.querySelector("#register-code-form").hidden = true;
}

document.querySelector("#register-back-to-login").addEventListener("click", () => {
  clearRegistration();
  setView("login", "#login-email");
});

document.querySelector("#back-to-login").addEventListener("click", () => {
  loginChallengeId = "";
  document.querySelector("#login-code-form").reset();
  document.querySelector("#login-password").value = "";
  setView("login", "#login-email");
});

document.querySelector("#show-reset").addEventListener("click", (event) => {
  event.preventDefault();
  const email = document.querySelector("#login-email").value.trim();
  if (email) document.querySelector("#reset-email").value = email;
  setView("reset", "#reset-email");
});

document.querySelector("#reset-back-to-login").addEventListener("click", () => {
  document.querySelector("#reset-form").reset();
  setView("login", "#login-email");
});

completionLoginButton.addEventListener("click", () => {
  setView("login", "#login-email");
});

languageSelect.addEventListener("change", () => {
  locale = languageSelect.value === "ja" ? "ja" : "en";
  renderLanguage();
});

for (const button of document.querySelectorAll("[data-toggle-password]")) {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.togglePassword);
    input.type = input.type === "password" ? "text" : "password";
    const visible = input.type === "text";
    button.setAttribute("aria-pressed", String(visible));
    button.setAttribute("aria-label", t(visible ? "hidePassword" : "showPassword"));
    input.focus();
  });
}

setView(requestMode === "register" ? "register" : "login");
if (rawRequestId) void initializePairing();
