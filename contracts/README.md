# Data contract v1

This is the shared interface between the three lanes. The web app (lane C) only reads the JSON files below. The pipeline (lane A) and models (lane B) produce them. Changing a field means a contract PR approved by all three lane owners. Adding an optional field only needs the consumer's approval.

## Rules

- **Location:** producers write generated files to `data/public/`, at the same relative paths as `contracts/fixtures/`. The web app serves `data/public/` and falls back to `contracts/fixtures/` when a file is missing, so lane C never waits on lanes A and B.
- **Times** are ISO 8601 UTC strings ending in `Z`. Settlement periods (`sp`) run from 1 to 50, with GB local dates (`date`, `YYYY-MM-DD`).
- **Units** are in the field name: `_mw`, `_mwh`, `_gbp`. Energy is MWh. NESO wind BOA volumes are average MW over a half-hour, so MWh = MW / 2 (see #21).
- **Provenance:** every top-level object has `meta` with `source` (a list of dataset names), `generated_utc` and `retrospective` (`true` unless the file was produced from snapshots we archived ourselves with `fetched_at`).
- **Missing data** is `null`, never `0`.
- **Fixtures** in `contracts/fixtures/` are hand-made samples with realistic shapes. They are **not real data** and carry `"fixture": true` in `meta`.

## Files

| File | Producer | Used by screen | Contents |
| --- | --- | --- | --- |
| `farms.json` | A | Waste Map | Wind BMUs: `id`, `name`, `region`, `lat`, `lon`, `capacity_mw` |
| `curtailment_daily.json` | A | Waste Map, Under the Hood | Daily totals and the NESO reconciliation |
| `replay/<date>.json` | A | Waste Map (replay), hardware | Per half-hour, per farm: planned, instructed and curtailed output and cost |
| `iceberg.json` | A | The Iceberg | Visible vs hidden constraint cost over a window |
| `dfs_requests.json` | A | Help Wanted | NESO DFS `Upwards`/`System` requirements, procured volume and prices |
| `forecast.json` | B | Tomorrow, Under the Hood | Half-hourly forecasts plus backtest scores and a reliability curve |
| `copilot.json` | B | Flex Copilot, judge game | Naive, ours and oracle policy results for a load on replay days |

## Schemas

### `farms.json`

```json
{ "meta": {}, "farms": [ { "id": "T_SGRWO-1", "name": "Seagreen 1", "region": "North Scotland", "lat": 56.6, "lon": -1.8, "capacity_mw": 180 } ] }
```

`region` uses NESO's Day Ahead Wind BMU Forecast `Region` value. `lat` and `lon` may be `null` until geocoded.

### `curtailment_daily.json`

```json
{ "meta": {}, "days": [ { "date": "2026-10-14", "curtailed_mwh": 169000, "wind_paid_gbp": 4200000, "neso_thermal_mwh": 175000, "neso_thermal_gbp": 31000000 } ],
  "validation": { "window": ["2026-04-01", "2026-11-06"], "volume_ratio": 0.85, "volume_corr_daily": 0.91 } }
```

### `replay/<date>.json`

```json
{ "meta": {}, "date": "2026-10-14",
  "periods": [ { "sp": 30, "start_utc": "2026-10-14T13:30:00Z",
    "farms": { "T_SGRWO-1": { "pn_mw": 180, "level_mw": 0, "curtailed_mwh": 90, "paid_gbp": 2340, "state": "instructed" } } } ] }
```

`state` is one of `generating`, `instructed` (paid to turn down), `unavailable` (outage: PN above MEL with no bid) or `unknown`.

### `iceberg.json`

```json
{ "meta": {}, "window": ["2026-04-01", "2026-11-06"], "days": 201,
  "wind_bids_gbp": 193000000, "ccgt_offers_gbp": 1781000000, "neso_thermal_gbp": 1782000000,
  "ccgt_vs_neso_corr_daily": 0.94, "note": "Magnitude comparison, not additive" }
```

### `dfs_requests.json`

```json
{ "meta": {}, "requests": [ { "event_id": "DFS-2026-10-07-1", "start_utc": "2026-10-07T16:00:00Z", "end_utc": "2026-10-07T16:30:00Z",
  "direction": "Upwards", "tag": "System", "required_mw": 500, "zone_caps_mw": { "Z1": 500, "Z2": 500, "Z3": 500 },
  "procured_mw": 1.2, "accepted_price_median_gbp_per_mwh": 60, "auction_close_utc": "2026-10-07T11:00:00Z" } ] }
```

The zone-to-region mapping is unconfirmed (PRD risk K-2). The UI shows zone IDs, not "Scotland".

### `forecast.json`

```json
{ "meta": {}, "issued_utc": "2026-11-07T11:00:00Z",
  "periods": [ { "start_utc": "2026-11-08T00:00:00Z", "curtailed_mwh_p10": 200, "curtailed_mwh_p50": 600, "curtailed_mwh_p90": 1400, "p_heavy": 0.62, "p_turnup_request": 0.41 } ],
  "backtest": { "test_window": ["2026-09-01", "2026-11-01"], "n_periods": 2055,
    "mae_mwh": { "model": 762, "persistence": 1171, "training_mean": 1061 },
    "brier_heavy": { "model": 0.167, "persistence": 0.443, "prior": 0.299 },
    "auc_heavy": { "model": 0.83, "persistence": 0.52 },
    "reliability": [ { "bin": 0.1, "predicted": 0.17, "observed": 0.35, "n": 510 } ] } }
```

Optional fields (lane B writes them; the web app may ignore them):

- Top level: `target_date` (the day the periods cover) and `mode`: `next_day` when the target is after `issued_utc`'s date, or `same_day_replay` when no future day-ahead snapshot had been published (a retrospective replay, not a forecast of tomorrow).
- `meta`: `model` (`flow_utilisation` or `wind_forecast`), `leakage_note`, `mode`, `target_note`, `persistence_note`, `region_definition`, `last_actual_date`.
- `backtest`: `heavy_threshold_mwh`, `heavy_share_in_test`, `interval_coverage_p10_p90`, `by_month`, `method`, `turnup` (provisional request-probability scores) and `morning_update` (a same-morning wind-forecast sensitivity, not the tomorrow model, flow model only) and `flow_model` (the flow model's scores, present when the wind model produced the periods). `mae_mwh`, `brier_heavy` and `auc_heavy` carry a `headroom_rule` baseline only when `meta.model` is `flow_utilisation`.

### `copilot.json`

```json
{ "meta": {}, "load": { "type": "electrolyser", "capacity_mw": 50, "zone": "Z1" },
  "days": [ { "date": "2026-10-14",
    "policies": { "naive": { "gbp": 1500, "mwh": 50 }, "ours": { "gbp": 10800, "mwh": 225 }, "oracle": { "gbp": 15000, "mwh": 300 } },
    "schedule": [ { "start_utc": "2026-10-14T16:00:00Z", "action": "ready", "bid_gbp_per_mwh": 55 } ] } ],
  "summary": { "pct_of_oracle": 0.72, "gross_settlement_gbp": 12000, "caveat": "Fixture figures, not real data. Gross settlement before levies" } }
```

**Meaning of `policies.*.gbp` (shared definition): it is NET.** `gbp = gross_settlement_gbp + value_gbp - energy_cost_gbp`, where `value_gbp = load.value_gbp_per_mwh x mwh` is what the extra energy is worth to the site (an assumption the user sets) and `energy_cost_gbp` is the electricity bought. `pct_of_oracle` is `ours.gbp / oracle.gbp` summed over the scored days (`null` when the oracle is not positive).

Optional fields (lane B writes them; the web app may ignore them):

- `load`: `value_gbp_per_mwh`, `max_periods_per_day`.
- `days[].policies.*`: `gross_settlement_gbp`, `energy_cost_gbp`, `value_gbp`, `accepted_periods`, `bid_periods`.
- `summary`: `energy_cost_gbp`, `net_gbp` (`naive`, `ours`, `oracle`), `break_even_value_gbp_per_mwh`, `tradable_half_hours`, `ours_beats_naive_at_values_gbp_per_mwh`.
- Top level: `sensitivity` (the same replay at several site values: `value_gbp_per_mwh`, `net_gbp`, `pct_of_oracle`), `assumptions` and `validation` (a check of the pay-as-bid arithmetic against NESO's published costs).
- `meta`: `scored_days`, `warmup_days`.
