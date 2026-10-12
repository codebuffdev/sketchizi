const PHONE_USER_AGENT = /\b(?:iPhone|iPod)\b|Windows Phone|IEMobile|BlackBerry|BB10|Opera Mini|webOS/i;
const TABLET_USER_AGENT = /\b(?:iPad|Tablet|PlayBook)\b/i;

/**
 * Detect phone devices without using the current browser viewport width.
 * A desktop browser with a narrow window is still a desktop, and tablets
 * should remain supported even when they have touch screens.
 *
 * The optional arguments make the policy deterministic in unit tests.
 */
export function isPhoneDevice({
  userAgent = "",
  mobileHint = false,
  maxTouchPoints = 0,
  screenWidth = 0,
  screenHeight = 0,
} = {}) {
  const ua = String(userAgent || "");

  // Keep recognizable tablet browsers allowed, including iPadOS desktop mode.
  if (TABLET_USER_AGENT.test(ua)) return false;

  // Explicit smartphone identifiers are the most reliable signal.
  if (PHONE_USER_AGENT.test(ua)) return true;

  const isAndroid = /\bAndroid\b/i.test(ua);
  const hasMobileToken = /\bMobile\b/i.test(ua);

  // Android tablet UAs normally omit "Mobile". Preserve tablet access instead
  // of treating every Android + touch device as a phone.
  if (isAndroid && !hasMobileToken) return false;
  if (isAndroid && hasMobileToken) return true;

  const dimensions = [Number(screenWidth), Number(screenHeight)]
    .filter((value) => Number.isFinite(value) && value > 0);
  const smallestScreenDimension = dimensions.length === 2
    ? Math.min(...dimensions)
    : 0;

  // UA Client Hints can still identify phones when the user agent string has
  // been reduced or the browser is requesting a desktop version of the site.
  if (mobileHint === true) {
    return smallestScreenDimension === 0 || smallestScreenDimension <= 600;
  }

  // iPhones using desktop-site mode can present a Macintosh UA. Touch support
  // plus a phone-sized physical screen distinguishes them from iPad devices.
  if (/\bMacintosh\b|\bMacIntel\b/i.test(ua)
      && Number(maxTouchPoints) > 1
      && smallestScreenDimension > 0
      && smallestScreenDimension <= 600) {
    return true;
  }

  return false;
}

export function isCurrentDevicePhone() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  return isPhoneDevice({
    userAgent: navigator.userAgent,
    mobileHint: navigator.userAgentData?.mobile === true,
    maxTouchPoints: navigator.maxTouchPoints || 0,
    screenWidth: window.screen?.width || 0,
    screenHeight: window.screen?.height || 0,
  });
}
