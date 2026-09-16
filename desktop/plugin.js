/**
 * Billing — Nous Portal usage widget for the Hermes desktop statusbar.
 *
 * A compact chip in the statusbar's right cluster — rightmost among the
 * contributed items (every core readout, including the version number, sits
 * to its right): remaining spendable credits plus the plan-usage percentage,
 * red when the plan is >=90% used. Hover shows plan / top-up / rollover
 * detail; click opens the Nous Portal billing page in the system browser
 * (`window.open` is denied app-wide; the click goes through
 * `ctx.os.openExternal`).
 *
 * Data comes from ONE gateway RPC — `billing.state`, which embeds the shared
 * two-bar usage model the Settings → Billing page and TUI `/topup` consume.
 * The chip hides itself when the portal reports no signed-in account or the
 * usage model is unavailable.
 *
 * Plain ESM loaded uncompiled — UI is jsx() calls, not JSX syntax. Only
 * @hermes/plugin-sdk, react, and react/jsx-runtime resolve.
 */

import { jsx, jsxs } from 'react/jsx-runtime'

import {
  cn,
  Codicon,
  host,
  PALETTE_AREA,
  STATUSBAR_AREAS,
  Tip,
  useQuery
} from '@hermes/plugin-sdk'

const ID = 'billing'
const REFRESH_MS = 60_000
const PORTAL_URL = 'https://portal.nousresearch.com'

// ── data ────────────────────────────────────────────────────────────────────

function useBillingWidget() {
  return useQuery({
    // ONE RPC: `billing.state` already embeds the usage model, and every
    // usage build is a fresh portal fetch — the second call only doubled
    // portal traffic and opened a window where the two models disagreed.
    queryKey: ['billing', 'widget'],
    queryFn: () => host.request('billing.state'),
    refetchInterval: REFRESH_MS,
    staleTime: 30_000,
    retry: 1
  })
}

// ── helpers ──────────────────────────────────────────────────────────────────

const clampPct = value => {
  // `Number(null)` is 0, which would silently turn a MISSING percentage into
  // "0%" — keep the nullish case null.
  if (value == null) {
    return null
  }

  const n = Number(value)

  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null
}

function statusLabel(status) {
  if (status === 'depleted') return 'Depleted'
  if (status === 'low') return 'Low credits'
  if (status === 'healthy') return 'Healthy'

  return 'Free'
}

// ── chip ──────────────────────────────────────────────────────────────────────

function BillingChip({ ctx }) {
  const query = useBillingWidget()

  // No data yet, a transport failure, or an account the portal does not know:
  // the chip simply does not render (the statusbar slot is owned by render()).
  if (query.isPending || query.isError) {
    return null
  }

  const billing = query.data
  const usage = billing?.usage

  if (!billing || billing.ok !== true || billing.logged_in === false) {
    return null
  }

  if (!usage || usage.available !== true) {
    return null
  }

  const planBar = usage.plan_bar ?? null
  const topupBar = usage.topup_bar ?? null
  // `balance_display` is the em dash when the account carries no balance, so
  // gate it on the underlying `balance_usd` — a placeholder string must not
  // defeat the "nothing to show" guard below.
  const balanceDisplay = billing.balance_usd != null ? billing.balance_display : null
  const totalDisplay = usage.total_spendable_display ?? balanceDisplay ?? null

  if (!totalDisplay && !planBar && !topupBar) {
    return null
  }

  // Remaining share of the PLAN bucket — the only percentage the model
  // supports: `pct_used` is emitted for plan bars alone, and a top-up bucket
  // has no denominator (its fill_fraction is always 1), so deriving a figure
  // from it painted a constant, inverted 0%.
  const pctUsed = planBar ? clampPct(planBar.pct_used) : null
  const pctRemaining = pctUsed != null ? 100 - pctUsed : null
  const danger = pctRemaining != null && pctRemaining <= 10
  const portalUrl = billing.portal_url ?? PORTAL_URL

  const planDetail = planBar
    ? `${usage.plan_name ?? 'Plan'}: ${planBar.remaining_display} of ${planBar.total_display} left`
    : 'Plan: no active plan credits'
  const topupDetail = topupBar ? ` · Top-up: ${topupBar.remaining_display} left` : ''
  const renewDetail = usage.renews_display ? ` · Renews ${usage.renews_display}` : ''
  const statusDetail = usage.status ? ` · ${statusLabel(usage.status)}` : ''

  return jsx(Tip, {
    label: `${planDetail}${topupDetail}${renewDetail}${statusDetail} — click to open the portal`,
    children: jsx('button', {
      className: cn(
        'inline-flex h-full items-center gap-1 rounded-none px-1.5 text-[0.6875rem] tabular-nums transition-colors',
        'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
      ),
      onClick: () => void ctx.os.openExternal(portalUrl),
      type: 'button',
      children: jsxs('span', {
        className: 'inline-flex items-center gap-1',
        children: [
          jsx(Codicon, { name: 'credit-card', size: '0.7rem' }),
          totalDisplay
            ? jsx('span', { className: 'truncate', children: totalDisplay })
            : null,
          pctRemaining != null
            ? jsx('span', {
                className: danger ? 'text-destructive' : 'text-(--ui-green)',
                children: `${Math.round(pctRemaining)}%`
              })
            : null
        ]
      })
    })
  })
}

// ── plugin ────────────────────────────────────────────────────────────────────

export default {
  id: ID, // must match the folder name
  name: 'Billing',
  description:
    'Nous Portal usage widget — remaining credits and plan-usage percentage in the statusbar, with portal detail on hover.',
  register(ctx) {
    ctx.registerMany([
      {
        id: 'usage',
        area: STATUSBAR_AREAS.right,
        // Rightmost contributed item on the right side: contributed items
        // render LEFT of every core item, so this lands after Kanban's
        // in-flight count (order 80) but still left of the core readouts
        // (terminal toggle, version number).
        order: 90,
        render: () => jsx(BillingChip, { ctx })
      },
      {
        id: 'open',
        area: PALETTE_AREA,
        data: {
          id: 'billing.open',
          label: 'Billing: Open portal',
          keywords: ['billing', 'credits', 'usage', 'topup', 'spend', 'rollover', 'portal'],
          run: async () => {
            let url = PORTAL_URL

            try {
              const billing = await host.request('billing.state')

              if (billing && billing.portal_url) {
                url = billing.portal_url
              }
            } catch {
              // Fall back to the canonical portal URL.
            }

            // `window.open` is denied app-wide — the shell's audited
            // open-external door is the only path that reaches the browser.
            await ctx.os.openExternal(url)
          }
        }
      }
    ])
  }
}
