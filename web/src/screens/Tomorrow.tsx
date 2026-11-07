import { Loading, Screen, Source } from "../components";
import { fmtEnergy, fmtNum, fmtTime, useJson, type Forecast, type ForecastPeriod } from "../data";

const W = 960, PAD_L = 64, PAD_R = 16, TOP_H = 240, GAP = 36, BOT_H = 110, AXIS_H = 28;
const TOP_PAD = 24;
const H = TOP_PAD + TOP_H + GAP + BOT_H + AXIS_H;
const plotW = W - PAD_L - PAD_R;

const hhmm = (iso: string) => iso.slice(11, 16);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

// Smallest y-axis top, so a calm day reads as flat at zero rather than as noise on a tiny scale.
const MIN_Y_MAX = 10;

// Round ticks from zero. The floor keeps the step at 5 or more, so whole-number labels never repeat.
function yTicks(v: number) {
  const top = Math.max(v, MIN_Y_MAX);
  const mag = 10 ** Math.floor(Math.log10(top / 4));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= top / 4)!;
  return Array.from({ length: Math.ceil(top / step) + 1 }, (_, i) => i * step);
}

function ForecastChart({ periods }: { periods: ForecastPeriod[] }) {
  const n = periods.length;
  const slot = plotW / n;
  const x = (i: number) => PAD_L + slot * (i + 0.5);
  const ticks = yTicks(Math.max(...periods.map((p) => p.curtailed_mwh_p90 ?? p.curtailed_mwh_p50 ?? 0)));
  const yMax = ticks[ticks.length - 1];
  const y = (v: number) => TOP_H - (v / yMax) * TOP_H;
  const pTop = TOP_H + GAP;
  const yp = (v: number) => pTop + BOT_H - v * BOT_H;
  const hasTurnup = periods.some((p) => p.p_turnup_request != null);

  // Break the band and lines at nulls rather than drawing through missing data.
  const segments: number[][] = [];
  periods.forEach((p, i) => {
    const ok = p.curtailed_mwh_p10 != null && p.curtailed_mwh_p50 != null && p.curtailed_mwh_p90 != null;
    if (!ok) return;
    const last = segments[segments.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i); else segments.push([i]);
  });
  const band = segments.map((s) =>
    s.map((i, k) => `${k ? "L" : "M"}${x(i)},${y(periods[i].curtailed_mwh_p90!)}`).join("") +
    [...s].reverse().map((i) => `L${x(i)},${y(periods[i].curtailed_mwh_p10!)}`).join("") + "Z").join("");
  const median = segments.map((s) => s.map((i, k) => `${k ? "L" : "M"}${x(i)},${y(periods[i].curtailed_mwh_p50!)}`).join("")).join("");
  const turnup = hasTurnup
    ? periods.map((p, i) => (p.p_turnup_request == null ? "" : `${i && periods[i - 1].p_turnup_request != null ? "L" : "M"}${x(i)},${yp(p.p_turnup_request)}`)).join("")
    : "";
  const peak = periods.reduce((b, p, i) => ((p.curtailed_mwh_p50 ?? -1) > (periods[b].curtailed_mwh_p50 ?? -1) ? i : b), 0);

  const label = `Half-hourly forecast for ${n} periods from ${hhmm(periods[0].start_utc)} UTC. ` +
    `Median curtailment peaks at ${fmtNum(periods[peak].curtailed_mwh_p50)} MWh at ${hhmm(periods[peak].start_utc)} UTC ` +
    `(p10 ${fmtNum(periods[peak].curtailed_mwh_p10)}, p90 ${fmtNum(periods[peak].curtailed_mwh_p90)}). ` +
    `Highest chance of a heavy period is ${pct(Math.max(...periods.map((p) => p.p_heavy ?? 0)))}.`;

  return (
    <figure className="chart card">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <g transform={`translate(0 ${TOP_PAD})`}>
        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} />
            <text x={PAD_L - 8} y={y(t) + 4} textAnchor="end">{fmtNum(t)}</text>
          </g>
        ))}
        <text className="axis-title" x={PAD_L} y={-10}>MWh curtailed per half-hour</text>
        <path className="fc-band" d={band} />
        <path className="fc-median" d={median} />

        {[0, 0.5, 1].map((t) => (
          <g key={t} className="grid">
            <line x1={PAD_L} x2={W - PAD_R} y1={yp(t)} y2={yp(t)} />
            <text x={PAD_L - 8} y={yp(t) + 4} textAnchor="end">{pct(t)}</text>
          </g>
        ))}
        <text className="axis-title" x={PAD_L} y={pTop - 10}>Probability</text>
        {periods.map((p, i) => p.p_heavy == null ? null : (
          <rect key={p.start_utc} className="fc-heavy" x={x(i) - slot * 0.35} width={slot * 0.7} y={yp(p.p_heavy)} height={p.p_heavy * BOT_H} rx={2}>
            <title>{`${hhmm(p.start_utc)} UTC · P(heavy) ${pct(p.p_heavy)}`}</title>
          </rect>
        ))}
        {hasTurnup && <path className="fc-turnup" d={turnup} />}

        {periods.map((p, i) => i % 6 === 0 && (
          <text key={p.start_utc} className="tick" x={x(i)} y={H - TOP_PAD - 8} textAnchor="middle">{hhmm(p.start_utc)}</text>
        ))}
        {periods.map((p, i) => (
          <rect key={`hit-${p.start_utc}`} className="hit" x={PAD_L + slot * i} width={slot} y={0} height={TOP_H + GAP + BOT_H}>
            <title>{`${hhmm(p.start_utc)} UTC\nMedian ${fmtNum(p.curtailed_mwh_p50)} MWh (p10 ${fmtNum(p.curtailed_mwh_p10)} – p90 ${fmtNum(p.curtailed_mwh_p90)})\nP(heavy) ${pct(p.p_heavy)}` +
              (hasTurnup ? `\nP(turn-up request) ${pct(p.p_turnup_request)}` : "")}</title>
          </rect>
        ))}
        </g>
      </svg>
      <figcaption className="legend">
        <span><i className="key key-band" />p10–p90 range (shaded)</span>
        <span><i className="key key-line" />Median, p50 (solid line)</span>
        <span><i className="key key-bar" />P(heavy curtailment) (bars)</span>
        {hasTurnup && <span><i className="key key-dash" />P(NESO turn-up request) (dashed line)</span>}
        <span>Times in UTC</span>
      </figcaption>
    </figure>
  );
}

type Row = { name: string; value: number; ours?: boolean };

function Metric({ title, unit, better, rows, fmt }: { title: string; unit: string; better: "lower" | "higher"; rows: Row[]; fmt: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  const best = better === "lower" ? Math.min(...rows.map((r) => r.value)) : Math.max(...rows.map((r) => r.value));
  return (
    <div className="metric card">
      <h3>{title}</h3>
      <p className="muted small">{unit} · {better} is better</p>
      <ul className="metric-rows">
        {rows.map((r) => (
          <li key={r.name} className={r.ours ? "ours" : ""}>
            <span className="metric-name">{r.name}{r.value === best && <span className="sr-only"> (best)</span>}</span>
            <span className="metric-track" aria-hidden><span className="metric-bar" style={{ width: `${(r.value / max) * 100}%` }} /></span>
            <span className="metric-value">{fmt(r.value)}{r.value === best && <span aria-hidden> ✓</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Reliability({ bins }: { bins: Forecast["backtest"]["reliability"] }) {
  const S = 220, P = 34, inner = S - P - 10;
  const sx = (v: number) => P + v * inner;
  const sy = (v: number) => 10 + inner - v * inner;
  const maxN = Math.max(1, ...bins.map((b) => b.n));
  const label = "Reliability of P(heavy): predicted versus observed frequency. " +
    bins.map((b) => `predicted ${pct(b.predicted)}, observed ${pct(b.observed)}, ${fmtNum(b.n)} periods`).join("; ") + ".";
  return (
    <figure className="metric card reliability">
      <h3>Reliability</h3>
      <p className="muted small">P(heavy) · on the diagonal is perfect</p>
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label={label}>
        {[0, 0.5, 1].map((t) => (
          <g key={t} className="grid">
            <line x1={sx(0)} x2={sx(1)} y1={sy(t)} y2={sy(t)} />
            <text x={P - 6} y={sy(t) + 4} textAnchor="end">{pct(t)}</text>
            <text x={sx(t)} y={S - 4} textAnchor="middle">{pct(t)}</text>
          </g>
        ))}
        <line className="diag" x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} />
        <polyline className="rel-line" points={bins.map((b) => `${sx(b.predicted)},${sy(b.observed)}`).join(" ")} />
        {bins.map((b) => (
          <circle key={b.bin} className="rel-dot" cx={sx(b.predicted)} cy={sy(b.observed)} r={3 + 4 * Math.sqrt(b.n / maxN)}>
            <title>{`Predicted ${pct(b.predicted)} · observed ${pct(b.observed)} · ${fmtNum(b.n)} periods`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="muted small">Across: predicted. Up: observed. Dot size: number of periods.</figcaption>
    </figure>
  );
}

export function Tomorrow() {
  const { data, error } = useJson<Forecast>("forecast.json");
  if (!data) return <Screen eyebrow="4 · Forecast" title="Curtailment outlook" lede=""><Loading error={error} /></Screen>;
  const { periods, backtest: bt } = data;
  const sameDayReplay = data.mode === "same_day_replay";
  const title = sameDayReplay ? "Latest available curtailment" : "Tomorrow's wasted wind";
  const eyebrow = sameDayReplay ? "4 · Same-day replay" : "4 · Tomorrow";
  const lede = sameDayReplay
    ? data.meta.target_note ?? "Same-day replay. This is not a day-ahead forecast."
    : "A day-ahead forecast of how much Scottish wind will be paid to switch off, half-hour by half-hour, with the uncertainty shown honestly.";
  const total = periods.reduce((s, p) => s + (p.curtailed_mwh_p50 ?? 0), 0);
  const heavy = periods.filter((p) => (p.p_heavy ?? 0) >= 0.5).length;
  const issued = new Date(data.issued_utc);

  return (
    <Screen eyebrow={eyebrow} title={title} lede={lede}>
      <div className="fc-head">
        <p className="muted">
          Issued <time dateTime={data.issued_utc}>{issued.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} at {fmtTime(data.issued_utc)}</time>
          {" "}for {periods.length} half-hours from {periods[0]?.start_utc.slice(0, 10)}.
        </p>
        {data.meta.retrospective && (
          <p className="retro" role="note"><strong>Retrospective</strong> Built from data that may have been published after the day, not from snapshots archived at forecast time. Treat it as a replay, not a live forecast.</p>
        )}
      </div>
      <div className="stats">
        <div className="stat"><div className="stat-value">{fmtEnergy(total)}</div><div className="stat-label">sum of half-hourly medians</div></div>
        <div className="stat"><div className="stat-value">{heavy}</div><div className="stat-label">half-hours with P(heavy) ≥ 50%</div></div>
      </div>
      {periods.length ? <ForecastChart periods={periods} /> : <p className="muted">No periods in this forecast.</p>}

      <h2 className="section-title">How good is it?</h2>
      <p className="muted section-lede">
        Chronological backtest, {bt.test_window[0]} to {bt.test_window[1]}, {fmtNum(bt.n_periods)} half-hours. Each score sits next to the simple baselines it has to beat.
      </p>
      <div className="backtest">
        <Metric title="Volume error" unit="MAE, MWh per half-hour" better="lower" fmt={fmtNum}
          rows={[{ name: "Our model", value: bt.mae_mwh.model, ours: true }, { name: "Persistence", value: bt.mae_mwh.persistence }, { name: "Training mean", value: bt.mae_mwh.training_mean }, ...(bt.mae_mwh.headroom_rule == null ? [] : [{ name: "Headroom rule", value: bt.mae_mwh.headroom_rule }])]} />
        <Metric title="Heavy-period calls" unit="Brier score" better="lower" fmt={(v) => v.toFixed(3)}
          rows={[{ name: "Our model", value: bt.brier_heavy.model, ours: true }, { name: "Persistence", value: bt.brier_heavy.persistence }, { name: "Training mean (prior)", value: bt.brier_heavy.prior }, ...(bt.brier_heavy.headroom_rule == null ? [] : [{ name: "Headroom rule", value: bt.brier_heavy.headroom_rule }])]} />
        <Metric title="Ranking heavy periods" unit="AUC, 0.5 = coin flip" better="higher" fmt={(v) => v.toFixed(2)}
          rows={[{ name: "Our model", value: bt.auc_heavy.model, ours: true }, { name: "Persistence", value: bt.auc_heavy.persistence }, ...(bt.auc_heavy.headroom_rule == null ? [] : [{ name: "Headroom rule", value: bt.auc_heavy.headroom_rule }])]} />
        <Reliability bins={bt.reliability} />
      </div>
      <Source meta={data.meta} />
    </Screen>
  );
}
