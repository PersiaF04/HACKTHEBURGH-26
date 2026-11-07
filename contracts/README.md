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
| `replay/index.json` | A | Waste Map (day picker, Live mode) | Which replay days exist (`days`) and where live data is (`live`: a file name under `replay/` or an absolute https URL) |
| `iceberg.json` | A | The Iceberg | Visible vs hidden constraint cost over a window |
| `dfs_requests.json` | A | Help Wanted | NESO DFS `Upwards`/`System` requirements, procured volume and prices |
| `forecast.json` | B | Tomorrow, Under the Hood | Half-hourly forecasts plus backtest scores and a reliability curve |
| `copilot.json` | B | Flex Copilot, judge game | Naive, ours and oracle policy results for a load on replay days |
| `sandbox.json` (optional) | B | Interactive load sandbox | Per-half-hour inputs and a scoring rule so the client can re-score a load the user places |
| `grid.json` (optional) | A | Power Dashboard | Transmission line geometry (275/400 kV and the Western HVDC link) for the power-lines layer |
| `dashboard.json` (optional) | B | Map dashboard | Tomorrow headline and numbers, request probability per half-hour, and the Copilot's call for each replay day |
| `ask-the-grid-tools.json` (optional) | B | Ask the Grid chat | Manifest of 8 read-only tools over `data/public/`; golden questions in `fixtures/ask-golden.json`, reference code in `models/ask_golden.py` |

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

Optional fields (lane A writes them; the web app may ignore them):

- `periods[]`: `scotex_limit_mw` and `scotex_flow_mw`. These are NESO's day-ahead limit for the SCOTEX boundary (the "cables south" from Scotland to England) and NESO's day-ahead scheduled-flow forecast across it, made before later changes and without expected constraint actions. A flow above the limit signals potential constraint pressure, but it is a forecast: it is not a measured flow and does not prove how much was turned down. They are the latest published day-ahead values, not measured outturn, and are `null` when NESO has no value for that half-hour. `meta.scotex_note` explains this.
- `replay/live.json` (written by the lane A live poller) has the same shape, with `meta.live: true`, `meta.retrospective: false` and `paid_gbp: null` (Elexon settles payments the next morning).
- `replay/index.json`: `{ "meta": {}, "days": ["2026-10-13", ...], "live": "<file name under replay/ or an absolute https URL>" }`. When `live` is an absolute URL, the app fetches it as-is (CORS-enabled).

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

### `sandbox.json` (optional, issue #76)

Per-half-hour inputs for re-running the Copilot's scoring client-side for a load the user places, plus the rule. The web app must still work when this file is absent.

```json
{ "meta": {}, "load_defaults": { "type": "electrolyser", "capacity_mw": 50, "zone": "Z1", "value_gbp_per_mwh": 100, "max_periods": 12 },
  "grids": { "zones": ["Z1", "Z2", "Z3"], "value_gbp_per_mwh": [0, 50, 100, 150, 200] },
  "scoring_rule": [ "plain-words steps" ],
  "days": { "2026-10-27": {
    "ours_available": true,
    "half_hours": [ { "sp": 30, "start_utc": "2026-10-27T14:30:00Z", "curtailed_mwh": 900.0, "mid_gbp_per_mwh": 55.2, "request": true,
      "caps_mw": { "Z1": 500, "Z2": 500, "Z3": 0 }, "ceiling_gbp_per_mwh": { "Z1": 60.0, "Z2": null, "Z3": null } } ],
    "policies": { "Z1": { "100": { "naive": [[28, 60.0]], "ours": [[24, 60.0]], "oracle": [[24, 60.0]] } } } } },
  "test_vectors": [ { "id": "ours-2026-10-27-Z1-100", "day": "2026-10-27", "load": { "capacity_mw": 50, "zone": "Z1", "value_gbp_per_mwh": 100, "max_periods": 12 },
    "schedule": [[24, 60.0]], "expected": { "mwh": 25, "wind_matched_mwh": 25, "gross_gbp": 1500, "energy_cost_gbp": 1000, "value_gbp": 2500, "net_gbp": 3000, "accepted_half_hours": 1 } } ] }
```

- `days` has one entry per day with a live turn-up request (18 so far), each with all 48 half-hours (`half_hours[sp - 1]`). `mid_gbp_per_mwh` is a market index price, not a tariff; `request` is whether NESO published an `Upwards`/`System` requirement; `caps_mw` and `ceiling_gbp_per_mwh` are per zone ID (the highest price NESO accepted in that zone that half-hour, or `null`). Zones are IDs, not regions.
- `policies[zone][site value]` holds the Copilot's naive, ours and oracle schedules as `[sp, bid]` lists, so the client does not have to port the policies. `ours` is `null` on warm-up days (`ours_available: false`). Schedules do not depend on the load's MW.
- **Scoring rule** (also in `scoring_rule`): take the schedule in ascending `sp` order; stop once `accepted >= max_periods`; skip a half-hour unless `request` is true, `caps_mw[zone] >= capacity_mw`, `ceiling_gbp_per_mwh[zone]` and `mid_gbp_per_mwh` are not null and `bid <= ceiling`; otherwise `gross += bid x (capacity_mw x 0.5)`, `energy += mid x (capacity_mw x 0.5)`, `accepted += 1`. Then `mwh = accepted x capacity_mw x 0.5`, `value_gbp = value_gbp_per_mwh x mwh`, `net_gbp = gross + value_gbp - energy`.
- **`mwh` is the electricity the load buys and uses** in the half-hours NESO would have accepted, assuming full delivery. It is **not** proof that the same MWh of curtailed wind was absorbed. `wind_matched_mwh` is a separate, **approximate upper bound** on how much of it could have been otherwise-curtailed Scottish wind: in each accepted half-hour, `min(capacity_mw x 0.5, curtailed_mwh)`. It ignores which farms or zone the wind is in (the zone-to-region mapping is unconfirmed) and assumes no other load competes for the wind. Label it as approximate wherever it is shown.
- `test_vectors` give expected results for the default load on every day with a call, user-style schedules and edge cases (a load above the zone cap scores nothing). A port must match `expected` within 0.005. Numbers are exported unrounded so IEEE doubles summed in the stated order match exactly.
- On the real data the default 50 MW, Z1, GBP 100/MWh case on 27 Oct gives net 8,533.25 (naive), 11,909.25 (ours) and 12,594.50 (oracle), the same as `copilot.json` for that day. Totals across all 13 scored days differ for naive (1,976) because naive loses money on other days; ours and oracle are zero on those days.

### `grid.json` (optional)

Line geometry for the Power Dashboard's power-lines layer. The web app must still work when this file is absent.

```json
{ "meta": { "attribution": "Power line geometry (c) OpenStreetMap contributors, ODbL",
             "attribution_url": "https://www.openstreetmap.org/copyright" },
  "border": [[-3.65, 54.96], [-3.06, 54.99]],
  "counts": { "lines": 1694, "osm_ways": 1693, "kv400": 604, "kv275": 1089, "crossing_border": 3 },
  "lines": [ { "id": "osm-143219037", "kv": 400, "operator": "National Grid Electricity Transmission",
               "coords": [[-3.0378, 55.0101], [-2.9629, 54.9439]], "crosses_border": true } ] }
```

- `lines[].coords` are `[lon, lat]` pairs, simplified from OpenStreetMap (about 400 m tolerance). `kv` is 275 or 400, or 600 for the HVDC link. `lines` holds 1,693 OpenStreetMap ways plus one schematic feature (`counts.osm_ways` and `counts.lines`). `crosses_border` is true for a line that spans or touches the Scotland-England land border (the SCOTEX boundary). `border` is an approximate polyline of that border, not a legal boundary.
- The `western-link` entry is the subsea HVDC link between Hunterston and Flintshire Bridge (Wales), drawn as a **schematic** route (`schematic: true`, `capacity_mw` 2,250). It does **not** cross the Scotland-England land border, so it has `crosses_border: false` and `southbound_link: true` instead. Whether NESO counts its flow inside SCOTEX is not confirmed, so the app should show it as a separate southbound link and not as part of the border-crossing set.
- **No per-line flow is published by anyone.** This file is geometry only. To animate power moving south, scale the effect on the `crosses_border` lines by `scotex_flow_mw` against `scotex_limit_mw` from the replay periods, and label it "forecast demand on the cables vs their limit", not a measured flow.
- The map must show the attribution in `meta.attribution` as a **visible link** to `meta.attribution_url` (OpenStreetMap's copyright and ODbL page) wherever it draws these lines.

### `dashboard.json` (optional, issue #74)

Summaries for the map dashboard (#73), derived from `forecast.json`, `copilot.json` and the replay index. The web app must still work when this file is absent.

```json
{ "meta": {},
  "tomorrow": { "target_date": "2026-11-08", "mode": "next_day", "model": "wind_forecast",
    "headline": "Tomorrow, Sunday 8 Nov: calm. ...",
    "facts": { "total_p50_mwh": 0, "peak_p50_mwh": 0, "peak_p50_start_utc": "2026-11-08T00:00:00Z", "peak_p90_mwh": 0,
      "peak_p_heavy": 0, "heavy_half_hours": 0, "peak_p_request": 0.233, "request_window_utc": ["11:00", "22:30"] },
    "request_probability": [ { "start_utc": "2026-11-08T00:00:00Z", "p_turnup_request": 0.0 } ],
    "caveat": "Retrospective: ..." },
  "replay_days": [ { "date": "2026-10-27",
    "request_probability": [ { "start_utc": "2026-10-26T23:00:00Z", "p_turnup_request": 0.0, "actual_request": false } ],
    "copilot": { "status": "scored", "ready_windows_utc": [["2026-10-27T11:00:00Z", "2026-10-27T14:30:00Z"]], "ready_half_hours": 7,
      "bid_gbp_per_mwh": 60.0, "bid_range_gbp_per_mwh": null, "net_gbp": { "naive": 8533, "ours": 11909, "oracle": 12594 },
      "pct_of_oracle": 0.946, "caveat": "Replay, net of electricity ..." } } ] }
```

- `tomorrow.headline` is **templated from `tomorrow.facts`**, never written by hand or by a model, so a sentence cannot say more than the numbers. It says "Tomorrow" only when `mode` is `next_day`; for `same_day_replay` it says it is a replay, not tomorrow.
- `tomorrow.request_probability` has one entry per half-hour of the target day and lines up with `forecast.json` `periods`.
- `replay_days` has one entry per day in `replay/index.json`. `request_probability` has 48 entries aligned to the replay timeline (`start_utc`, the same instants as the replay periods). `p_turnup_request` is a **walk-forward** value (the model saw only earlier days) and `null` when there is not enough history; `actual_request` is whether NESO really published a turn-up request that half-hour.
- `copilot.status` is `scored` or `not_scored`. A `not_scored` day carries a `reason` (before requests began, a warm-up day, or not in the scored set) and no numbers. On a `scored` day with nothing tradable, `pct_of_oracle` is `null` and a `note` says there was nothing to answer. The Copilot only has a scored call on days after its warm-up; today that is 27 Oct among the replay days.
