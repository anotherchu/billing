# Hermes Desktop Plugin — Billing

Nous Portal usage widget for the Hermes desktop statusbar.

A compact chip in the statusbar's right cluster: remaining spendable credits
plus the plan-usage percentage (green; red when the plan is ≥90% used). Hover
shows plan / top-up / rollover detail; click opens the Nous Portal billing
page in the system browser.

## Features

- Statusbar chip (right side, order 90 — rightmost of the contributed items,
  left of the core readouts and version number): remaining balance + plan-usage
  percentage.
- Palette command (`⌘K` → "Billing: Open portal") to open the Nous Portal
  billing page.
- Data from one gateway RPC (`billing.state`, which embeds the shared two-bar
  usage model) — the same read the Settings → Billing page and TUI `/topup`
  use.
- The chip hides itself when the portal reports no signed-in account or the
  usage model is unavailable.

## Install

Drop `plugin.js` into:

```
<hermes home>/desktop-plugins/billing/plugin.js
```

(`~/.hermes` by default), then run **Reload desktop plugins** from `⌘K` in the
Hermes desktop app. The plugin loads within a few seconds; the statusbar chip
appears in the right side of the statusbar.

## Requirements

- Hermes desktop app (the CLI/gateway alone does not load desktop plugins).
- A signed-in Nous Portal account with a subscription.

## Development

Plain ESM, loaded uncompiled — UI is `jsx()` calls, not JSX syntax. Only
`@hermes/plugin-sdk`, `react`, and `react/jsx-runtime` resolve.

## License

MIT — see [LICENSE](LICENSE).
