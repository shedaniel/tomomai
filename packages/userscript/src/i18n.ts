// The panel's strings. This module has no userscript manager APIs, so the site imports it too and its
// preview of the panel says exactly what the panel says. SEGA's sign-in form is in English whatever the
// language, so its auto login checkbox is quoted by its English label.

const en = {
  language: "Language",
  close: "Close",
  checking: "Looking for your login cookie",
  signedOutTitle: "Sign in to maimai DX NET",
  signedOutText: "You'll come back here afterwards to send your cookie.",
  signInButton: "Sign in to maimai DX NET",
  unreadableTitle: "No login cookie found",
  unreadableText: "Sign in again with auto login ticked. If it still doesn't work, turn on your userscript manager's cookie setting from the tomomai guide.",
  signInAgain: "Sign in again",
  signingInTitle: "Sign in to tomomai",
  signingInText: "Finish in the tomomai window. Your cookie is sent right after.",
  signingInButton: "Waiting for sign-in...",
  readyTitle: "Ready to send",
  readyPopupNote: "A tomomai window opens first to sign you in.",
  send: "Send to tomomai",
  sending: "Sending...",
  sentTitle: "Sent to tomomai",
  sentText: "Your fetch is starting in the tomomai tab. Stay signed in to maimai DX NET here to keep it working.",
  closeTab: "Close this tab",
  canCloseTab: "You can close this tab now.",
  errorTitle: "Couldn't send your cookie",
  tryAgain: "Try again",
  signedIn: "Signed in to tomomai",
  signOut: "Sign out",
  hintTitle: "Sign in to continue",
  hintText: "Keep auto login ticked. You'll come back to the tomomai panel afterwards.",
  errors: {
    signInExpired: "Your tomomai sign-in has expired. Send again to sign in.",
    noCookieApi: "This userscript manager can't read cookies.",
    unreachable: "Couldn't reach tomomai.",
    timeout: "tomomai didn't answer in time.",
    popupBlocked: "Allow popups for this page, then try again.",
    signInCancelled: "Sign-in was cancelled.",
    signInClosed: "The sign-in window was closed.",
    signInFailed: "Sign-in failed ({status}).",
    refused: "tomomai refused the cookie ({status}).",
  },
};

export type Messages = typeof en;
export type ErrorKey = keyof Messages["errors"];

const ja: Messages = {
  language: "言語",
  close: "閉じる",
  checking: "ログインクッキーを探しています",
  signedOutTitle: "maimai DX NET にログイン",
  signedOutText: "ログイン後、ここに戻ってクッキーを送信します。",
  signInButton: "maimai DX NET にログイン",
  unreadableTitle: "ログインクッキーが見つかりません",
  unreadableText: "「Check to enable auto login」にチェックを入れたまま、もう一度ログインしてください。それでも見つからない場合は、tomomai のガイドを見てユーザースクリプトマネージャーのクッキー設定をオンにしてください。",
  signInAgain: "もう一度ログイン",
  signingInTitle: "tomomai にログイン",
  signingInText: "tomomai のウィンドウでログインを完了してください。完了するとすぐにクッキーを送信します。",
  signingInButton: "ログインを待っています…",
  readyTitle: "送信の準備ができました",
  readyPopupNote: "最初に tomomai のログインウィンドウが開きます。",
  send: "tomomai に送信",
  sending: "送信中…",
  sentTitle: "tomomai に送信しました",
  sentText: "tomomai のタブで取得が始まります。取得を続けるには、このブラウザで maimai DX NET にログインしたままにしてください。",
  closeTab: "このタブを閉じる",
  canCloseTab: "このタブはもう閉じてかまいません。",
  errorTitle: "クッキーを送信できませんでした",
  tryAgain: "もう一度試す",
  signedIn: "tomomai にログイン中",
  signOut: "ログアウト",
  hintTitle: "ログインして続ける",
  hintText: "「Check to enable auto login」にチェックを入れたままにしてください。ログイン後、tomomai のパネルに戻ります。",
  errors: {
    signInExpired: "tomomai のログインが切れました。もう一度送信してログインしてください。",
    noCookieApi: "このユーザースクリプトマネージャーはクッキーを読み取れません。",
    unreachable: "tomomai に接続できませんでした。",
    timeout: "tomomai から時間内に応答がありませんでした。",
    popupBlocked: "このページのポップアップを許可してから、もう一度試してください。",
    signInCancelled: "ログインがキャンセルされました。",
    signInClosed: "ログインウィンドウが閉じられました。",
    signInFailed: "ログインに失敗しました（{status}）。",
    refused: "tomomai がクッキーを受け付けませんでした（{status}）。",
  },
};

const ko: Messages = {
  language: "언어",
  close: "닫기",
  checking: "로그인 쿠키를 찾는 중",
  signedOutTitle: "maimai DX NET에 로그인",
  signedOutText: "로그인한 뒤 이곳으로 돌아와 쿠키를 보냅니다.",
  signInButton: "maimai DX NET에 로그인",
  unreadableTitle: "로그인 쿠키를 찾을 수 없습니다",
  unreadableText: "\"Check to enable auto login\"을 체크한 채로 다시 로그인하세요. 그래도 안 되면 tomomai 가이드를 보고 유저스크립트 관리자의 쿠키 설정을 켜세요.",
  signInAgain: "다시 로그인",
  signingInTitle: "tomomai에 로그인",
  signingInText: "tomomai 창에서 로그인을 마치세요. 마치면 바로 쿠키를 보냅니다.",
  signingInButton: "로그인을 기다리는 중...",
  readyTitle: "보낼 준비 완료",
  readyPopupNote: "먼저 로그인할 수 있도록 tomomai 창이 열립니다.",
  send: "tomomai로 보내기",
  sending: "보내는 중...",
  sentTitle: "tomomai로 보냈습니다",
  sentText: "tomomai 탭에서 가져오기가 시작됩니다. 계속 가져오려면 이 브라우저에서 maimai DX NET 로그인을 유지하세요.",
  closeTab: "이 탭 닫기",
  canCloseTab: "이제 이 탭을 닫아도 됩니다.",
  errorTitle: "쿠키를 보내지 못했습니다",
  tryAgain: "다시 시도",
  signedIn: "tomomai에 로그인됨",
  signOut: "로그아웃",
  hintTitle: "로그인하여 계속하기",
  hintText: "\"Check to enable auto login\"을 체크한 채로 두세요. 로그인 후 tomomai 패널로 돌아옵니다.",
  errors: {
    signInExpired: "tomomai 로그인이 만료되었습니다. 다시 보내서 로그인하세요.",
    noCookieApi: "이 유저스크립트 관리자는 쿠키를 읽을 수 없습니다.",
    unreachable: "tomomai에 연결할 수 없습니다.",
    timeout: "tomomai가 제시간에 응답하지 않았습니다.",
    popupBlocked: "이 페이지의 팝업을 허용한 뒤 다시 시도하세요.",
    signInCancelled: "로그인이 취소되었습니다.",
    signInClosed: "로그인 창이 닫혔습니다.",
    signInFailed: "로그인에 실패했습니다 ({status}).",
    refused: "tomomai가 쿠키를 거부했습니다 ({status}).",
  },
};

const zhHans: Messages = {
  language: "语言",
  close: "关闭",
  checking: "正在查找登录 Cookie",
  signedOutTitle: "登录 maimai DX NET",
  signedOutText: "登录后会回到这里发送 Cookie。",
  signInButton: "登录 maimai DX NET",
  unreadableTitle: "找不到登录 Cookie",
  unreadableText: "请勾选“Check to enable auto login”后重新登录。如果仍然不行，请按照 tomomai 的指南开启用户脚本管理器的 Cookie 设置。",
  signInAgain: "重新登录",
  signingInTitle: "登录 tomomai",
  signingInText: "请在 tomomai 窗口中完成登录，完成后会立即发送 Cookie。",
  signingInButton: "正在等待登录…",
  readyTitle: "可以发送了",
  readyPopupNote: "会先打开 tomomai 窗口让你登录。",
  send: "发送到 tomomai",
  sending: "正在发送…",
  sentTitle: "已发送到 tomomai",
  sentText: "tomomai 标签页中的获取正在开始。请在此浏览器中保持登录 maimai DX NET，以便持续获取。",
  closeTab: "关闭此标签页",
  canCloseTab: "现在可以关闭此标签页了。",
  errorTitle: "无法发送 Cookie",
  tryAgain: "重试",
  signedIn: "已登录 tomomai",
  signOut: "退出登录",
  hintTitle: "登录以继续",
  hintText: "请保持勾选“Check to enable auto login”。登录后会回到 tomomai 面板。",
  errors: {
    signInExpired: "tomomai 登录已过期，请重新发送以登录。",
    noCookieApi: "此用户脚本管理器无法读取 Cookie。",
    unreachable: "无法连接到 tomomai。",
    timeout: "tomomai 没有及时响应。",
    popupBlocked: "请允许此页面的弹出窗口，然后重试。",
    signInCancelled: "登录已取消。",
    signInClosed: "登录窗口已关闭。",
    signInFailed: "登录失败（{status}）。",
    refused: "tomomai 拒绝了此 Cookie（{status}）。",
  },
};

const zhHant: Messages = {
  language: "語言",
  close: "關閉",
  checking: "正在尋找登入 Cookie",
  signedOutTitle: "登入 maimai DX NET",
  signedOutText: "登入後會回到這裡傳送 Cookie。",
  signInButton: "登入 maimai DX NET",
  unreadableTitle: "找不到登入 Cookie",
  unreadableText: "請勾選「Check to enable auto login」後重新登入。如果仍然不行，請依照 tomomai 的指南開啟使用者腳本管理器的 Cookie 設定。",
  signInAgain: "重新登入",
  signingInTitle: "登入 tomomai",
  signingInText: "請在 tomomai 視窗中完成登入，完成後會立即傳送 Cookie。",
  signingInButton: "正在等待登入…",
  readyTitle: "可以傳送了",
  readyPopupNote: "會先開啟 tomomai 視窗讓你登入。",
  send: "傳送到 tomomai",
  sending: "正在傳送…",
  sentTitle: "已傳送到 tomomai",
  sentText: "tomomai 分頁中的擷取正在開始。請在此瀏覽器中保持登入 maimai DX NET，以便持續擷取。",
  closeTab: "關閉此分頁",
  canCloseTab: "現在可以關閉此分頁了。",
  errorTitle: "無法傳送 Cookie",
  tryAgain: "重試",
  signedIn: "已登入 tomomai",
  signOut: "登出",
  hintTitle: "登入以繼續",
  hintText: "請保持勾選「Check to enable auto login」。登入後會回到 tomomai 面板。",
  errors: {
    signInExpired: "tomomai 登入已過期，請重新傳送以登入。",
    noCookieApi: "此使用者腳本管理器無法讀取 Cookie。",
    unreachable: "無法連線到 tomomai。",
    timeout: "tomomai 沒有及時回應。",
    popupBlocked: "請允許此頁面的彈出視窗，然後重試。",
    signInCancelled: "登入已取消。",
    signInClosed: "登入視窗已關閉。",
    signInFailed: "登入失敗（{status}）。",
    refused: "tomomai 拒絕了此 Cookie（{status}）。",
  },
};

export const LOCALES = ["en", "ja", "ko", "zh-Hans", "zh-Hant"] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language in its own name, for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ja: "日本語",
  ko: "한국어",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
};

export const MESSAGES: Record<Locale, Messages> = { en, ja, ko, "zh-Hans": zhHans, "zh-Hant": zhHant };

/** The panel language for a language tag such as tomomai's site locales or the browser's, or null. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (lower.startsWith("zh")) {
    return /hant|-(tw|hk|mo)\b/.test(lower) ? "zh-Hant" : "zh-Hans";
  }
  const base = lower.split("-")[0];
  return (LOCALES as readonly string[]).includes(base) ? (base as Locale) : null;
}

export function format(message: string, vars: Record<string, string | number> = {}): string {
  return message.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
