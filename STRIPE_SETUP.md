# Stripe one-time purchases

Current production status (2026-09-26): STRIPE_MODE=live verified. The user authorized formal launch and all website test accounts and business data have been cleared after a private local backup. Do not switch back to test as part of ordinary maintenance. Stripe's own sandbox history is retained.

User selected manual monthly renewal. Checkout always uses payment mode, never subscription mode.

- Live account: acct_1UJRY9GmudGo0yp2 (wyfit).
- Sandbox: acct_1UJTEtGf6PxBJOtl (Yvonne Fitness Test).
- Vercel: vinclo/yvone-fitness only.
- Private environment variables: STRIPE_SECRET_KEY (restricted key), STRIPE_WEBHOOK_SECRET.
- STRIPE_MODE: disabled (default), test (coach only), live (members).
- Callback: https://www.yvonnefitness.com/api/stripe/webhook
- Snapshot events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.expired, charge.refunded.
- Test orders never grant live credits/memberships or send purchase emails.
- Live prices are read server-side and snapshotted. Students can only buy for themselves.
- Single purchases grant 1-100 in-person credits. Starter/Standard/Premium grant 5/10/20 credits valid for 3 months. Monthly grants unlimited in-person training; online_monthly/online_quarterly/online_annual grant separate online coaching for 1/3/12 months and never cover in-person deductions. Legacy quarterly/annual orders retain their original unlimited meaning. Periods use Pacific dates with inclusive end dates and calendar month-end clamping.
- Settlement verifies signature, order/session, amount, currency and live mode. Duplicate callbacks cannot duplicate entitlements.
- Refunds are recorded and flagged for coach reconciliation; existing journal entries are not silently removed.
- Order history uses 10 rows per page. Test orders are hidden from students.

Validation: 87 tests passed, production build passed, local student purchase UI verified.
Migration 202609250003_stripe_payments.sql applied to zhyxlzalrpwfsqpxfftt.
Restricted sandbox Checkout key saved to Vercel. User confirmed event destination and STRIPE_WEBHOOK_SECRET / STRIPE_MODE=test configured.
Payment implementation deployed; user confirmed successful sandbox Checkout and subsequent manual acceptance, then configured live mode and authorized formal launch. Current automated suite: 105 tests passed, including the expanded catalog. New prices are blank until the coach configures each member's quote. No live charge was made during launch cleanup.
