import type { AppLocale } from "./i18n";
type Copy = { manage: string; opened: string; failed: string };
type ReadinessCopy = { login: string; checking: string; unavailable: string };
const checkFailed: Record<AppLocale, string> = {
  ja: "受付状態を確認できません", en: "Could not check availability",
  de: "Verfügbarkeit nicht bestätigt", es: "No se pudo verificar la disponibilidad",
  fr: "Disponibilité non confirmée", ko: "결제 가능 여부 확인 실패",
  "pt-BR": "Disponibilidade não confirmada", "zh-CN": "无法确认购买状态", "zh-TW": "無法確認購買狀態",
};
const readiness: Record<AppLocale, ReadinessCopy> = {
  ja: { login: "ログインしてプランを確認", checking: "購入の受付状態を確認中…", unavailable: "受付状態を確認できませんでした。「会員状態を再確認」から再試行してください。" },
  en: { login: "Sign in to view plans", checking: "Checking billing availability…", unavailable: "Could not check billing availability. Refresh membership to try again." },
  de: { login: "Anmelden und Abos ansehen", checking: "Abo-Verfügbarkeit wird geprüft…", unavailable: "Die Verfügbarkeit konnte nicht geprüft werden. Aktualisiere die Mitgliedschaft, um es erneut zu versuchen." },
  es: { login: "Iniciar sesión para ver los planes", checking: "Comprobando la disponibilidad…", unavailable: "No se pudo comprobar la disponibilidad. Actualiza la membresía para volver a intentarlo." },
  fr: { login: "Se connecter pour voir les offres", checking: "Vérification de la disponibilité…", unavailable: "Impossible de vérifier la disponibilité. Actualisez l’abonnement pour réessayer." },
  ko: { login: "로그인하여 플랜 확인", checking: "결제 가능 여부 확인 중…", unavailable: "결제 가능 여부를 확인할 수 없습니다. 회원 상태를 새로 확인하여 다시 시도하세요." },
  "pt-BR": { login: "Entrar para ver os planos", checking: "Verificando a disponibilidade…", unavailable: "Não foi possível verificar a disponibilidade. Atualize a assinatura para tentar novamente." },
  "zh-CN": { login: "登录后查看计划", checking: "正在检查购买是否开放…", unavailable: "无法检查购买是否开放。请刷新会员状态后重试。" },
  "zh-TW": { login: "登入後查看方案", checking: "正在確認是否開放購買…", unavailable: "無法確認是否開放購買。請重新確認會員狀態後再試。" },
};
const copies: Record<AppLocale, Copy> = {
  ja: { manage: "契約・支払い方法を管理", opened: "Stripeをブラウザで開きました。支払い後は会員状態を再確認してください。", failed: "決済ページを開けませんでした。会員状態を再確認し、契約済みの場合は契約管理を使ってください。" },
  en: { manage: "Manage subscription and payments", opened: "Stripe opened in your browser. Refresh membership after payment.", failed: "Could not open billing. Refresh membership; if already subscribed, use subscription management." },
  de: { manage: "Abo und Zahlungen verwalten", opened: "Stripe wurde im Browser geöffnet. Aktualisiere die Mitgliedschaft nach der Zahlung.", failed: "Abrechnung konnte nicht geöffnet werden. Aktualisiere die Mitgliedschaft oder verwalte ein bestehendes Abo." },
  es: { manage: "Gestionar suscripción y pagos", opened: "Stripe se abrió en el navegador. Actualiza la membresía después del pago.", failed: "No se pudo abrir el pago. Actualiza la membresía o gestiona la suscripción existente." },
  fr: { manage: "Gérer l’abonnement et les paiements", opened: "Stripe est ouvert dans le navigateur. Actualisez l’abonnement après le paiement.", failed: "Impossible d’ouvrir le paiement. Actualisez l’abonnement ou gérez votre abonnement existant." },
  ko: { manage: "구독 및 결제 관리", opened: "브라우저에서 Stripe를 열었습니다. 결제 후 회원 상태를 새로 확인하세요.", failed: "결제 페이지를 열 수 없습니다. 회원 상태를 확인하거나 기존 구독을 관리하세요." },
  "pt-BR": { manage: "Gerenciar assinatura e pagamentos", opened: "Stripe aberto no navegador. Atualize a assinatura após o pagamento.", failed: "Não foi possível abrir o pagamento. Atualize a assinatura ou gerencie a assinatura existente." },
  "zh-CN": { manage: "管理订阅和付款方式", opened: "已在浏览器打开Stripe。付款后请刷新会员状态。", failed: "无法打开付款页面。请刷新会员状态，已有订阅请使用订阅管理。" },
  "zh-TW": { manage: "管理訂閱和付款方式", opened: "已在瀏覽器開啟Stripe。付款後請重新確認會員狀態。", failed: "無法開啟付款頁面。請重新確認會員狀態，已有訂閱請使用訂閱管理。" },
};
export const billingText = (locale: AppLocale) => ({ ...copies[locale], ...readiness[locale], checkFailed: checkFailed[locale] });
