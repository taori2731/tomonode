const API_BASE = "https://tomonode-account-api.rafaerunacaya27.workers.dev";
const form = document.querySelector("#reset-form");
const status = document.querySelector("#status");
const submitButton = document.querySelector("#submit-button");
const passwordInput = document.querySelector("#password");
const confirmInput = document.querySelector("#confirm-password");
const parameters = new URLSearchParams(window.location.search);
const actionCode = parameters.get("oobCode") ?? "";
const actionMode = parameters.get("mode") ?? "";
if (actionCode) history.replaceState(null, "", "/password-reset.html");

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function validPassword(value) {
  const length = Array.from(value).length;
  return length >= 15 && length <= 128 && new TextEncoder().encode(value).byteLength <= 512;
}

if (actionMode === "resetPassword" && actionCode.length >= 10 && actionCode.length <= 4096) {
  form.hidden = false;
  showStatus("メール内のリンクを確認しました。新しいパスワードを設定できます。");
} else {
  showStatus("このリンクは無効か期限切れです。アプリからパスワード再設定をもう一度依頼してください。", true);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = passwordInput.value;
  if (!validPassword(password)) {
    showStatus("パスワードは15〜128文字、UTF-8で512バイト以内にしてください。", true);
    return;
  }
  if (password !== confirmInput.value) {
    showStatus("確認用パスワードが一致しません。", true);
    confirmInput.focus();
    return;
  }

  submitButton.disabled = true;
  passwordInput.disabled = true;
  confirmInput.disabled = true;
  showStatus("パスワードを更新しています…");
  try {
    const response = await fetch(`${API_BASE}/v1/auth/password/complete-reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oobCode: actionCode, newPassword: password }),
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) {
      showStatus(response.status === 429
        ? "試行回数が上限に達しました。時間をおいてから、再設定メールをもう一度依頼してください。"
        : "パスワードを更新できませんでした。リンクの期限切れの場合は、アプリから再設定を依頼してください。", true);
      submitButton.disabled = false;
      passwordInput.disabled = false;
      confirmInput.disabled = false;
      return;
    }
    history.replaceState(null, "", "/password-reset.html");
    form.hidden = true;
    showStatus("パスワードを更新しました。TomoNodeアプリで新しいパスワードを使ってサインインしてください。");
  } catch {
    showStatus("通信に失敗しました。インターネット接続を確認して、もう一度お試しください。", true);
    submitButton.disabled = false;
    passwordInput.disabled = false;
    confirmInput.disabled = false;
  }
});
