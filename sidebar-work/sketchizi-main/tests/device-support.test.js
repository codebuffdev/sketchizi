import test from "node:test";
import assert from "node:assert/strict";
import { isPhoneDevice } from "../src/features/device/deviceSupport.js";

const iphoneUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const androidPhoneUa = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const androidTabletUa = "Mozilla/5.0 (Linux; Android 14; SM-X900 Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const ipadUa = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ipadDesktopUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const desktopUa = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

test("blocks iPhone browsers", () => {
  assert.equal(isPhoneDevice({ userAgent: iphoneUa, screenWidth: 390, screenHeight: 844 }), true);
});

test("blocks Android phone browsers", () => {
  assert.equal(isPhoneDevice({ userAgent: androidPhoneUa, screenWidth: 412, screenHeight: 915 }), true);
});

test("allows Android tablets", () => {
  assert.equal(isPhoneDevice({ userAgent: androidTabletUa, screenWidth: 800, screenHeight: 1280, maxTouchPoints: 10 }), false);
});

test("allows iPads including desktop-site mode", () => {
  assert.equal(isPhoneDevice({ userAgent: ipadUa, mobileHint: true, screenWidth: 820, screenHeight: 1180, maxTouchPoints: 5 }), false);
  assert.equal(isPhoneDevice({ userAgent: ipadDesktopUa, screenWidth: 1024, screenHeight: 1366, maxTouchPoints: 5 }), false);
});

test("blocks phones whose browser requests desktop-site user-agent", () => {
  assert.equal(isPhoneDevice({ userAgent: ipadDesktopUa, mobileHint: true, screenWidth: 390, screenHeight: 844, maxTouchPoints: 5 }), true);
});

test("does not block a desktop browser because its window is narrow", () => {
  assert.equal(isPhoneDevice({ userAgent: desktopUa, mobileHint: false, screenWidth: 390, screenHeight: 844, maxTouchPoints: 0 }), false);
});

test("keeps Android tablet user agents allowed even when touch-enabled", () => {
  assert.equal(isPhoneDevice({ userAgent: androidTabletUa, mobileHint: false, screenWidth: 600, screenHeight: 960, maxTouchPoints: 10 }), false);
});
