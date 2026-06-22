// ─────────────────────────────────────────────────────────────────────────────
// TIPS — Tokengotchi is 100% free. Tips are a thank-you, never power.
// (Stripe restricts the word "donation" to registered charities; creators use "tip".)
//
// Drop your handle(s) below. The in-game "Support" panel shows only the links you
// fill in; leave a field as "" to hide it. There's no backend, so these are simply
// outbound links to platforms that handle the money for you.
//
//   • GitHub Sponsors — best fit for a dev audience; tied to your ACCOUNT, not a
//     repo (a private repo is fine). Requires one-time approval into the Sponsors
//     program (bank/Stripe + tax info), which can take a few days.
//   • Ko-fi / Buy Me a Coffee — instant to set up, also take real money (cards).
//   • Custom — any URL: a Stripe Payment Link, PayPal.me, etc.
// ─────────────────────────────────────────────────────────────────────────────

const GITHUB_SPONSORS_USER = ""; // e.g. "daniil"  → https://github.com/sponsors/daniil
const KOFI_HANDLE = "danzin"; // → https://ko-fi.com/danzin
const BUYMEACOFFEE_HANDLE = "danzin"; // → https://buymeacoffee.com/danzin
const CUSTOM_LINK = ""; // any full URL (Stripe payment link, PayPal.me, …)

export interface DonateLink {
  label: string;
  url: string;
}

export const DONATE_LINKS: DonateLink[] = (
  [
    GITHUB_SPONSORS_USER && { label: "GitHub Sponsors", url: `https://github.com/sponsors/${GITHUB_SPONSORS_USER}` },
    KOFI_HANDLE && { label: "Ko-fi", url: `https://ko-fi.com/${KOFI_HANDLE}` },
    BUYMEACOFFEE_HANDLE && { label: "Buy Me a Coffee", url: `https://buymeacoffee.com/${BUYMEACOFFEE_HANDLE}` },
    CUSTOM_LINK && { label: "Tip", url: CUSTOM_LINK },
  ] as (DonateLink | "" | false)[]
).filter(Boolean) as DonateLink[];
