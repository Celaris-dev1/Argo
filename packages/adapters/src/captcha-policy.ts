/** A screen the bot can finish itself. Passwords, 2FA, and payment still go to the user. */
const CAPTCHA_REASON =
  /captcha|verify you are human|are you a human|are you human|i'?m not a robot|not a robot|cloudflare|turnstile|hcaptcha|recaptcha|funcaptcha|arkose|security check|bot check|robot check/i;

export function isCaptchaTakeover(reason: string): boolean {
  return CAPTCHA_REASON.test(reason);
}

export const CAPTCHA_SOLVE_NOTE =
  "Takeover was not requested. This is a CAPTCHA, and it stays with you. Do not ask the user. " +
  "The desktop browser is Chromium and its profile, cookies, and history must be left in place. " +
  "Run `argo-captcha` once. " +
  "`solved` means continue the task. `image-challenge` means look at the screenshot and click every tile that matches the words, then the Verify button, with computer_act. " +
  "`still-blocked` or `clicked-still-there` means click the checkbox yourself: it is the small box on the left of the widget. " +
  "Then snapshot again and continue.";
