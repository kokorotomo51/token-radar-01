# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kokorotomo51/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kokorotomo51/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — a dashboard ranking 198 pre-token protocols by implied value, each with a concrete farm plan. The model (radar-3, built 2026-11-17) scores every row from the sealed DefiLlama snapshot only: a pooled log-log regression over the 128 live-token protocols, log(mcap) = a + b·log(TVL) with fitted slope ≈ 0.52 (value grows roughly with the square root of TVL, not in proportion to it) × a small seven-day growth tilt (weight 0.10) × a maturity factor, with an unknown listing age set to the snapshot's own median known age (677 days). Leave-one-out reconstruction of the 128 live-token market caps gives a median absolute log error of 1.23, against 1.72 for the submitted radar-2 form and 1.62 for TVL alone with the global median multiple; the win holds under 5-fold cross-validation (1.27 against 1.59). A per-category offset on top of the fit was tried and made it worse, so no category multiple prices any row. Built by an AI agent for make.fun's “Build the best token launch radar” bounty.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Then open `out/dashboard/index.html` in a browser.

---

<sub>Entered on [make.fun](https://make.fun/?ref=7bd7933c&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
