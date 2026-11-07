import { Loading, Screen, Source, Stat } from "../components";
import { fmtEnergy, fmtNum, useJson, type CurtailmentDaily, type CurtailmentDay } from "../data";

const W = 960, H = 300, PAD_L = 64, PAD_R = 16, PAD_T = 24, PAD_B = 28;
const HI = 2, LO = 0.3;

const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function niceMax(v: number) {
  const step = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return Math.ceil(v / step) * step;
}

function line(days: CurtailmentDay[], key: "curtailed_mwh" | "neso_thermal_mwh", x: (i: number) => number, y: (v: number) => number) {
  return days.map((d, i) => {
    const v = d[key];
    if (v == null) return "";
    return `${i && days[i - 1][key] != null ? "L" : "M"}${x(i)},${y(v)}`;
  }).join("");
}

function DailyChart({ days }: { days: CurtailmentDay[] }) {
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (days.length > 1 ? (i / (days.length - 1)) * plotW : plotW / 2);
  const yMax = niceMax(Math.max(1, ...days.flatMap((d) => [d.curtailed_mwh ?? 0, d.neso_thermal_mwh ?? 0])));
  const y = (v: number) => PAD_T + plotH - (v / yMax) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * yMax);
  const months = days.map((d, i) => ({ d, i })).filter(({ d, i }) => i === 0 || d.date.slice(5, 7) !== days[i - 1].date.slice(5, 7));
  const ours = days.reduce((s, d) => s + (d.curtailed_mwh ?? 0), 0);
  const neso = days.reduce((s, d) => s + (d.neso_thermal_mwh ?? 0), 0);
  const label = `Daily curtailed energy, ${days.length} days from ${days[0].date} to ${days[days.length - 1].date}. ` +
    `Our reconstruction totals ${fmtEnergy(ours)}; NESO's thermal constraint volume totals ${fmtEnergy(neso)}.`;

  return (
    <figure className="chart card">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} />
            <text x={PAD_L - 8} y={y(t) + 4} textAnchor="end">{fmtNum(t / 1000)}k</text>
          </g>
        ))}
        <text className="axis-title" x={PAD_L} y={PAD_T - 10}>MWh per day</text>
        <path className="hood-neso" d={line(days, "neso_thermal_mwh", x, y)} />
        <path className="hood-ours" d={line(days, "curtailed_mwh", x, y)} />
        {months.map(({ d, i }) => (
          <text key={d.date} className="tick" x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : "middle"}>
            {new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
          </text>
        ))}
      </svg>
      <figcaption className="legend">
        <span><i className="key key-ours" />Our reconstruction (solid)</span>
        <span><i className="key key-neso" />NESO thermal constraint volume (dashed)</span>
      </figcaption>
    </figure>
  );
}

export function UnderTheHood() {
  const { data, error } = useJson<CurtailmentDaily>("curtailment_daily.json");
  const eyebrow = "6 · Under the hood";
  if (!data) return <Screen eyebrow={eyebrow} title="Can you trust these numbers?" lede=""><Loading error={error} /></Screen>;
  const { days, validation: v } = data;
  const odd = days
    .map((d) => ({ d, ratio: d.curtailed_mwh != null && d.neso_thermal_mwh ? d.curtailed_mwh / d.neso_thermal_mwh : null }))
    .filter(({ ratio }) => ratio == null || ratio > HI || ratio < LO);

  return (
    <Screen eyebrow={eyebrow} title="Can you trust these numbers?"
      lede="We rebuild curtailment from raw instructions, then check it against what NESO publishes. Here is how close it gets, how it works, and where it doesn't match.">
      <div className="stats">
        <Stat label="daily correlation with NESO" value={v.volume_corr_daily.toFixed(2)} hint="Pearson, daily MWh" />
        <Stat label="our volume ÷ NESO's" value={`${v.volume_ratio.toFixed(2)}×`} hint="whole window" />
        <Stat label="validation window" value={`${days.length} days`} hint={`${v.window[0]} to ${v.window[1]}`} />
      </div>
      {days.length ? <DailyChart days={days} /> : <p className="muted">No daily data.</p>}

      <div className="hood-grid">
        <section className="card method" aria-labelledby="method-title">
          <h2 id="method-title">How we count it</h2>
          <dl>
            <dt>Curtailed energy</dt>
            <dd>For each accepted wind bid, curtailed MWh = ∫ (PN − instructed level) dt: the gap between what the farm said it would generate and what it was told to run at, over the time the bid applies.</dd>
            <dt>NESO's figure</dt>
            <dd>NESO publishes wind turn-down as average MW over each half-hour, so MWh = MW ÷ 2.</dd>
            <dt>Outage, not curtailment</dt>
            <dd>When availability drops below the plan with no bid accepted, the farm is unavailable (an outage). We show it, but never count it as paid curtailment.</dd>
          </dl>
        </section>

        <section className="card reconcile" aria-labelledby="odd-title">
          <h2 id="odd-title">Days that don't reconcile</h2>
          <p className="muted small">Days where our MWh ÷ NESO's MWh is above {HI} or below {LO}, or one side is missing.</p>
          {odd.length === 0 ? (
            <p><strong>None.</strong> All {days.length} days are within {LO}–{HI}× of NESO.</p>
          ) : (
            <table className="table">
              <thead><tr><th>Date</th><th>Ours</th><th>NESO</th><th>Ratio</th></tr></thead>
              <tbody>
                {odd.map(({ d, ratio }) => (
                  <tr key={d.date}>
                    <td>{fmtDate(d.date)} {d.date.slice(0, 4)}</td>
                    <td>{fmtEnergy(d.curtailed_mwh)}</td>
                    <td>{fmtEnergy(d.neso_thermal_mwh)}</td>
                    <td>{ratio == null ? "missing" : `${ratio.toFixed(2)}× ${ratio > HI ? "(high)" : "(low)"}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <Source meta={data.meta} />
    </Screen>
  );
}
