# Crypto Performance & Trend Analysis (BTC & ETH)

## Inputs

- **Timestamp**: {{timestamp}}
- **BTC current price**: {{btc_current_price}}
- **ETH current price**: {{eth_current_price}}

### BTC - 24H minute-by-minute prices (one price per minute)

{{bitcoin_recent_minutes_24h}}

### BTC - ~900 daily close prices (one close per day)

{{bitcoin_daily_900d_close}}

### ETH - 24H minute-by-minute prices (one price per minute)

{{ethereum_recent_minutes_24h}}

### ETH - ~900 daily close prices (one close per day)

{{ethereum_daily_900d_close}}

## Task

Produce a concise, objective per‑asset analysis. Use only the data shown. No cross‑asset comparisons, no predictions, no causal claims.

- Bitcoin: infer the short‑term trend from the 24H minute data and the long‑term trend from the ~900d daily closes. Note momentum, clear reversals, and simple price zones implied by the series.
- Ethereum: same as above, independently.

Formatting rules

- Keep language neutral and factual. Avoid adjectives and hype.
- "short_term_trend" and "long_term_trend": 1–2 sentences each.
- "momentum_signals" and "notable_levels": up to 3 items each; use empty arrays if unclear.
- "summary": one sentence synthesis. If data is insufficient, state "insufficient_data".

## Respond with EXACT JSON

```json
{
  "bitcoin": {
    "short_term_trend": "string",
    "long_term_trend": "string",
    "momentum_signals": ["string"],
    "notable_levels": ["string"],
    "summary": "string"
  },
  "ethereum": {
    "short_term_trend": "string",
    "long_term_trend": "string",
    "momentum_signals": ["string"],
    "notable_levels": ["string"],
    "summary": "string"
  }
}
```

Only output valid JSON. No commentary.
