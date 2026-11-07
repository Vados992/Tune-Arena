/** @typedef {"ios" | "android" | "desktop"} InstallPlatform */

/** @param {string} userAgent @param {number} [maxTouchPoints] @returns {InstallPlatform} */
export function detectInstallPlatform(userAgent, maxTouchPoints = 0) {
  // iPadOS can identify as Macintosh when requesting desktop websites.
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return "ios";
  return /Android/i.test(userAgent) ? "android" : "desktop";
}

/** @param {InstallPlatform} platform @param {boolean} hasPrompt */
export function installAction(platform, hasPrompt) {
  // Safari/iOS cannot open an install prompt from a site's JavaScript button.
  return platform !== "ios" && hasPrompt ? "prompt" : "guide";
}
