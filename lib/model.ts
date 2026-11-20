// Token Radar's model, radar-3 (rebuilt 2026-11-17): one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks only launch candidates: protocols that record no token and are not a wrapped,
// staked or bridged product of a token that already trades, not a versioned pool and not an
// exchange. That is the house watchlist's own rule, applied to every row, not just the forty the
// watchlist names: WBTC, Binance staked ETH and the bridges sit at the top of the TVL list, and
// ranking them as "pre-token" would be ranking tokens that already trade. The watchlist is the
// floor — every one of its 40 slugs is on the board — and the other 158 rows are the early ones the
// radar exists to find.
//
// Implied value follows only from the snapshot's own figures, through a pooled log-log fit over
// the live market:
//
//   log(mcap) = a + b x log(tvl), fit by ordinary least squares on the snapshot's live-token
//               protocols (the 128 that carry both a market cap and a TVL) at run time.
//               The fitted slope is about 0.52 on this snapshot: the market pays a smaller
//               multiple of TVL as protocols get bigger — a token's value grows roughly with the
//               square root of TVL, not in proportion to it. That is what the live market says:
//               corr(log TVL, log(mcap/TVL)) is -0.41 across the 128 live comps. A flat multiple
//               for every size pays the biggest protocols far too much.
//               The slope is clamped to [0.20, 0.90] as a guard against a degenerate fit; the
//               clamp is inactive on this snapshot (fitted slope about 0.52). With fewer than two
//               live comps the fit falls back to a slope of 1 with the median live ratio, which is
//               the old TVL-times-median model.
//   base     = exp(a + b x log(tvl_usd))
//   growth   = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x 0.10
//                       The weight is 0.10: one week of TVL change is a noisy signal and the
//                       inflow it measures is already inside today's TVL, so the model must not
//                       pay for the same expansion twice. Leave-one-out (below) moves by less
//                       than 1% between a weight of 0 and 0.25, so the small weight is a tilt
//                       toward the inputs the radar is asked to use, not a fitted parameter.
//   maturity = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age unknown: the snapshot's own median
//                       known listing age, 677 days here, not an assumed 365 — an unknown age
//                       is unknown, not young, and must not carry a silent ~27% discount)
//   implied  = max(1, round(base x growthMult x maturity))
//
// Validation, leave-one-out reconstruction of the 128 live-token market caps from this snapshot
// (each protocol held out in turn, the fit re-run on the other 127, error |log pred - log actual|):
//   radar-3: median absolute log error 1.23, mean 1.62, p90 3.61, Spearman 0.40
//   submitted radar-2 (hard category threshold, growth weight 0.5): median 1.72, mean 1.91,
//     p90 3.97, Spearman 0.39 — radar-3's median error is 29% lower.
//   TVL alone with the global median multiple: median 1.62, Spearman 0.42.
//   The recalibrated radar-2 (partial pooling, growth weight 0.25): median 1.64, but it does
//     NOT hold up under 5-fold cross-validation (1.64 against 1.58 for the submitted form),
//     so no claim is made for it here. Radar-3's win does hold up: 5-fold CV (four seeded
//     shuffles, median of fold medians) gives 1.27 against 1.59 for the submitted form.
//   Adding a per-category intercept offset on top of the log-log fit was tried and hurts:
//     median 1.31-1.37 and lower Spearman, so the category multiple is not a pricing input
//     here. The live market's category medians are still shown on the dashboard's live tab as
//     the calibration data they are. The error is still large in absolute terms — a median
//     factor of about e^1.23, roughly 3.4x — so the claim is only "less wrong than the
//     submitted model", never "accurate". One record carries mcap_usd -1, a missing-value
//     sentinel, and is excluded from the comps.
//
// No protocol name is ever special-cased: the same function scores every row, and the fit is
// computed from the snapshot at run time, so the model is the data's, not a list's.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  slope_floor: number;
  slope_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.1,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  slope_floor: 0.2,
  slope_cap: 0.9,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 40;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The pooled log-log fit over the live market, with its residual dispersion. */
export interface LogLogFit {
  intercept: number;
  slope: number;
  live_n: number;
  residual_q1: number;
  residual_median: number;
  residual_q3: number;
  residual_median_abs: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  is_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_value_usd: number;
    effective_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  base_value_usd: number;
  effective_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  is_watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  board_total_implied: number;
  fit: LogLogFit;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list, or null. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The quartile of a sorted list at position `q` (0..1), by linear interpolation. */
function quartile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** The median known listing age in the snapshot, in days; the model's fallback when none is known. */
export function medianKnownAge(snapshot: Snapshot, model: ModelConstants = MODEL): number {
  const ages = snapshot.protocols
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null);
  return ages.length === 0 ? model.unknown_age_days : Math.round(median(ages) ?? model.unknown_age_days);
}

/** The live-token protocols in a list: both a market cap and a TVL, both positive. The -1
 *  market-cap sentinel is a missing value, not a market cap, so it is excluded here. */
export function liveComps(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/**
 * The pooled log-log fit over a list's live protocols: log(mcap) = a + b x log(tvl) by ordinary
 * least squares. The slope is clamped to [slope_floor, slope_cap] as a guard against a
 * degenerate fit; with fewer than two live comps the fit falls back to a slope of 1 with the
 * median live mcap/TVL ratio as its intercept, which is the TVL-times-median model. The
 * residual quartiles ride along for the dashboard's peer range: dispersion of the live market
 * around its own fit, not a confidence interval.
 */
export function fitLogLog(protocols: SnapshotProtocol[], model: ModelConstants = MODEL): LogLogFit {
  const live = liveComps(protocols);
  const ratios = live.map((p) => (p.mcap_usd as number) / p.tvl_usd);
  const globalMedian = median(ratios) ?? 0.25;
  if (live.length < 2) {
    return {
      intercept: Math.log(Math.max(0.001, globalMedian)),
      slope: 1,
      live_n: live.length,
      residual_q1: 0,
      residual_median: 0,
      residual_q3: 0,
      residual_median_abs: 0,
    };
  }
  const xs = live.map((p) => Math.log(p.tvl_usd));
  const ys = live.map((p) => Math.log(p.mcap_usd as number));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  const slopeRaw = den === 0 ? 1 : num / den;
  const slope = Math.min(model.slope_cap, Math.max(model.slope_floor, slopeRaw));
  const intercept = my - slope * mx;
  const residuals = live.map((p) => Math.log(p.mcap_usd as number) - (intercept + slope * Math.log(p.tvl_usd)));
  const sorted = [...residuals].sort((a, b) => a - b);
  const absSorted = residuals.map((r) => Math.abs(r)).sort((a, b) => a - b);
  return {
    intercept: Math.round(intercept * 10000) / 10000,
    slope: Math.round(slope * 10000) / 10000,
    live_n: live.length,
    residual_q1: Math.round(quartile(sorted, 0.25) * 10000) / 10000,
    residual_median: Math.round((median(residuals) ?? 0) * 10000) / 10000,
    residual_q3: Math.round(quartile(sorted, 0.75) * 10000) / 10000,
    residual_median_abs: Math.round((median(absSorted) ?? 0) * 10000) / 10000,
  };
}

/** The multipliers and the implied value one protocol gets under `model` and `fit`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: LogLogFit,
  model: ModelConstants,
  unknownAgeDays: number,
): { implied: number; base: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? unknownAgeDays;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = Math.exp(fit.intercept + fit.slope * Math.log(protocol.tvl_usd));
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, base, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** The watchlist rule's wrapped/staked wording, as a whole word. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** The watchlist rule's exchange prefixes. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** The watchlist rule's excluded categories: bridged or staked products of a token that trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a launch candidate: pre-token, and not a wrapped, staked or bridged
 * product of a token that already trades — the watchlist's rule, applied to every board row.
 * A protocol the rule leaves out is no worse a subject in general, but this board ranks only
 * protocols that could plausibly launch a token of their own.
 */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  // An unknown age is unknown, not young: the effective model carries the snapshot's own median
  // known listing age instead of the 365-day assumption, so the dashboard's recompute agrees.
  const effectiveModel: ModelConstants = { ...model, unknown_age_days: medianKnownAge(snapshot, model) };
  const fit = fitLogLog(snapshot.protocols, effectiveModel);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it, in full.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other launch candidate, whatever its TVL — no floor, no top-N cut.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isLaunchCandidate(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, base, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, fit, effectiveModel, effectiveModel.unknown_age_days);
    return { p, implied, base, growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    is_watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_value_usd: Math.max(1, Math.round(s.base)),
      effective_multiple: Math.round((s.implied / s.p.tvl_usd) * 10000) / 10000,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs: a small pilot where the protocol is small, young or
 *  of unknown age, capped at $100 otherwise. The deposit is capital at risk, never a fee: only
 *  gas is spent, the deposit stays the farmer's and must come back out through the exit step. */
function capitalFor(p: SnapshotProtocol, age: number | null): number {
  if (p.tvl_usd < 50_000_000 || age === null || age < 90) return 25;
  if (p.tvl_usd >= 250_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

/** What one transaction costs on a chain, in whole dollars of gas. */
function gasUsd(chain: string): number {
  if (chain === 'Ethereum') return 12;
  if (chain === 'Solana') return 1;
  return 2;
}

/** One family's main action and its weekly action, matched on the category's words. */
interface Family {
  match: string[];
  action: (name: string, capital: number, chain: string) => string;
  weekly: (name: string, chain: string) => string;
}

const FAMILIES: Family[] = [
  {
    match: ['lend', 'cdp', 'collateral', 'uncollateralized'],
    action: (n, c, ch) => `Supply $${c} of USDC to ${n} on ${ch} and leave it earning; do not borrow against it, supplying alone is the position.`,
    weekly: (n) => `Check the supply position and any points balance on ${n}; top up or withdraw a little only if you need to move it.`,
  },
  {
    match: ['dex'],
    action: (n, c, ch) => `Provide $${c} of liquidity to ${n}'s largest pool on ${ch} and keep the position in range.`,
    weekly: (n) => `Check whether the pool drifted out of range on ${n} and re-balance it only if it did.`,
  },
  {
    match: ['yield', 'leveraged farm', 'farm'],
    action: (n, c, ch) => `Deposit $${c} of USDC into ${n}'s highest-TVL vault on ${ch} and leave the yield compounding.`,
    weekly: (n) => `Harvest or compound the vault rewards on ${n} once a week.`,
  },
  {
    match: ['perpetual', 'derivative'],
    action: (n, c, ch) => `Deposit $${c} of USDC as margin on ${n} and open one small hedged position.`,
    weekly: (n) => `Check the open position and the funding rate on ${n}; close it if the hedge no longer holds.`,
  },
  {
    match: ['prediction'],
    action: (n, c, ch) => `Fund $${c} and take one position in a market on ${n} that settles after at least a week.`,
    weekly: (n) => `Place one more market position on ${n} in a different market.`,
  },
  {
    match: ['curator', 'allocator', 'risk'],
    action: (n, c, ch) => `Deposit $${c} into a ${n} vault on ${ch} and hold the vault shares.`,
    weekly: (n) => `Check the vault's allocation on ${n} and add $10 when a new vault opens.`,
  },
  {
    match: ['stable'],
    action: (n, c, ch) => `Mint or deposit $${c} of the stable asset through ${n} on ${ch} and hold it.`,
    weekly: (n) => `Use the stable asset in one payment or swap through ${n} each week.`,
  },
  {
    match: ['rwa'],
    action: (n, c, ch) => `Mint $${c} of ${n}'s yield-bearing asset on ${ch} and hold it in the farming wallet.`,
    weekly: (n) => `Check the asset's yield accrual on ${n} and reinvest the payout once a week.`,
  },
  {
    match: ['insurance'],
    action: (n, c, ch) => `Buy $${c} of cover from ${n} on ${ch} and keep the policy for the full term.`,
    weekly: (n) => `Review the cover terms on ${n} once a week; renew before it lapses.`,
  },
  {
    match: ['staking', 'restak'],
    action: (n, c, ch) => `Stake $${c} of the chain's staking asset through ${n} and keep the receipt token.`,
    weekly: (n) => `Use the receipt token in one DeFi position through ${n} each week.`,
  },
  {
    match: ['bridge'],
    action: (n, c, ch) => `Bridge $${c} of USDC to ${ch} through ${n} and use the bridged funds in its app.`,
    weekly: (n) => `Check the route's fee on ${n} before bridging again; only bridge when you need funds moved.`,
  },
  {
    match: ['basis'],
    action: (n, c, ch) => `Deposit $${c} into ${n}'s basis-trading vault on ${ch} and hold the shares.`,
    weekly: (n) => `Check the funding-rate yield on ${n} and add $10 when the vault reopens.`,
  },
  {
    match: ['index'],
    action: (n, c, ch) => `Buy $${c} of the index token on ${n} and hold it in the farming wallet.`,
    weekly: (n) => `Rebalance the index holding on ${n} by $5 once a week.`,
  },
  {
    match: ['payment', 'card'],
    action: (n, c, ch) => `Load $${c} onto the ${n} card or account and spend $10 through it.`,
    weekly: (n) => `Make one real payment through ${n} each week.`,
  },
  {
    match: ['option'],
    action: (n, c, ch) => `Buy one small option on ${n} with $${c} of collateral and let it run to expiry.`,
    weekly: (n) => `Open one small option position on ${n} each week.`,
  },
  {
    match: ['launchpad'],
    action: (n, c, ch) => `Stake $${c} through ${n} to qualify for its next sale and join it when it opens.`,
    weekly: (n) => `Check ${n} for a new sale and keep the qualifying stake in place.`,
  },
  {
    match: ['governance'],
    action: (n, c, ch) => `Deposit $${c} with ${n} and vote or delegate on its next live proposal.`,
    weekly: (n) => `Vote on every new proposal ${n} opens that week.`,
  },
];

/** The family a protocol's category belongs to, or the default deposit. */
function familyFor(p: SnapshotProtocol): Family | null {
  const c = (p.category ?? '').toLowerCase();
  for (const f of FAMILIES) if (f.match.some((m) => c.includes(m))) return f;
  return null;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list
 * of names; the first chain sets the gas cost, the TVL and age set the capital, the age sets the
 * hold. The first chain is the deterministic default, not the cheapest chain: use whichever chain
 * you already hold funds on. Fees consumed, capital committed and time are kept apart — a deposit
 * is not a fee — and every plan ends with a tested exit, because a position you cannot leave is
 * not a farm. No step claims a reward, an allocation or eligibility: the plan farms a position,
 * it does not promise an airdrop.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p, age);
  const hold = holdDaysFor(age);
  const gas = gasUsd(chain);
  const family = familyFor(p);
  const action = family !== null ? family.action(p.name, capital, chain) : `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
  const weekly = family !== null ? family.weekly(p.name, chain) : `Make one deposit, swap or vote on ${p.name} each week.`;
  const scale = capital > 25
    ? `First send $25 as a test, confirm it lands, then scale the position to the full amount: ${action}`
    : `Send $25 as a test first, confirm it lands, then keep the position at that amount: ${action}`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. First check the protocol's official domain and docs from its own site, and never connect through a link someone sent you.`,
      cost: `about $${gas} of gas for the first transaction on ${chain}`,
      time: '10 minutes',
    },
    {
      text: scale,
      cost: `$${capital} of capital at risk and about $${gas} of gas; only the gas is spent, the deposit stays yours`,
      time: '15 minutes to set up',
    },
    {
      text: weekly,
      cost: `about $${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Withdraw a small test amount first to confirm the exit works, then the rest.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it, and revoke any token approvals you no longer need.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? Math.round((p.mcap_usd / p.tvl_usd) * 10000) / 10000 : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. The peer
 *  range is the middle half of the log-log fit's residuals among the live market (the fit's
 *  residual quartiles), carried through the row's own growth and maturity multipliers:
 *  dispersion among peers, not a confidence interval. */
export function radarRow(
  row: BoardRow,
  fit: LogLogFit,
): RadarRow {
  const low = Math.max(1, Math.round(row.model.base_value_usd * Math.exp(fit.residual_q1) * row.model.growth_multiplier * row.model.maturity_multiplier));
  const high = Math.max(1, Math.round(row.model.base_value_usd * Math.exp(fit.residual_q3) * row.model.growth_multiplier * row.model.maturity_multiplier));
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: Math.min(low, row.implied_value_usd),
    implied_high_usd: Math.max(high, row.implied_value_usd),
    base_value_usd: row.model.base_value_usd,
    effective_multiple: row.model.effective_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    is_watchlist: row.is_watchlist,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const effectiveModel: ModelConstants = { ...model, unknown_age_days: medianKnownAge(snapshot, model) };
  const fit = fitLogLog(snapshot.protocols, effectiveModel);
  const early = board.filter((r) => !r.is_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: effectiveModel,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    board_total_implied: board.reduce((n, r) => n + r.implied_value_usd, 0),
    fit,
    rows: board.map((r) => radarRow(r, fit)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
