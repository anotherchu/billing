/**
 * Billing — Nous Portal usage widget for the Hermes desktop statusbar.
 *
 * A compact chip beside the version number: remaining spendable credits plus
 * the plan-usage percentage, colour-coded (green while healthy, red when the
 * plan is >=90% used). Hover shows plan / top-up / rollover detail; click
 * opens the Nous Portal billing page.
 *
 * Data comes from the gateway RPC surface (`billing.state`, `usage.bars`) —
 * the same endpoints the Settings → Billing page and TUI `/topup` consume.
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
    queryKey: ['billing', 'widget'],
    queryFn: async () => {
      const [billing, usage] = await Promise.all([
        host.request('billing.state'),
        host.request('usage.bars')
      ])

      return { billing, usage }
    },
    refetchInterval: REFRESH_MS,
    staleTime: 30_000,
    retry: 1
  })
}

// ── helpers ──────────────────────────────────────────────────────────────────

const clampPct = value => {
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

function BillingChip() {
  const query = useBillingWidget()

  // No data yet, a transport failure, or an account the portal does not know:
  // the chip simply does not render (the statusbar slot is owned by render()).
  if (query.isPending || query.isError) {
    return null
  }

  const billing = query.data?.billing
  const usage = query.data?.usage

  if (!billing || billing.ok !== true || billing.logged_in === false) {
    return null
  }

  if (!usage || usage.available !== true) {
    return null
  }

  const planBar = usage.plan_bar ?? null
  const topupBar = usage.topup_bar ?? null
  const totalDisplay = usage.total_spendable_display ?? billing.balance_display ?? null

  if (totalDisplay == null && !planBar && !topupBar) {
    return null
  }

  // Remaining percentage: 100 minus the plan bucket's spent share when
  // present, else the top-up bucket's — the single "how much is left" figure.
  const pctSpent =
    planBar
      ? clampPct(planBar.pct_used ?? planBar.fill_fraction * 100)
      : topupBar
        ? clampPct(topupBar.pct_used ?? topupBar.fill_fraction * 100)
        : null

  const pctRemaining = pctSpent != null ? 100 - pctSpent : null
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
      onClick: () => window.open(portalUrl, '_blank', 'noopener,noreferrer'),
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
    'Nous Portal usage widget — remaining credits and usage percentage beside the version number, with portal detail on hover.',
  register(ctx) {
    ctx.registerMany([
      {
        id: 'usage',
        area: STATUSBAR_AREAS.right,
        // Immediately left of the version number (rightmost core items);
        // after Kanban's in-flight count (order 80).
        order: 90,
        render: () => jsx(BillingChip, {})
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

            window.open(url, '_blank', 'noopener,noreferrer')
          }
        }
      }
    ])
  }
}
