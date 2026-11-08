import { useEffect, useMemo, useRef, useState } from "react";
import type { GapDetailResponse, GapListResponse, GapSummary } from "../api";
import { GapDrawer } from "../components/gaps/GapDrawer";
import { GapTable } from "../components/gaps/GapTable";
import type { GapSortKey } from "../components/gaps/GapTable";
import "../components/gaps/gaps.css";

export interface GapsPageProps {
  response: GapListResponse;
  loadDetail: (gap: GapSummary) => Promise<GapDetailResponse>;
  loading?: boolean;
  error?: string | null;
}

const sorters: Record<GapSortKey, (gap: GapSummary) => number | null> = {
  p_link: (gap) => gap.p_link,
  momentum: (gap) => gap.momentum,
  novelty: (gap) => gap.novelty,
  gap_rate: (gap) => gap.gap_rate,
  gap_score: (gap) => gap.gap_score,
};

function id(gap: GapSummary): string {
  return `${gap.a}::${gap.b}`;
}

export function GapsPage({ response, loadDetail, loading = false, error }: GapsPageProps) {
  const [area, setArea] = useState("");
  const [minimumProbability, setMinimumProbability] = useState(0);
  const [sort, setSort] = useState<GapSortKey>("p_link");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<GapSummary | null>(null);
  const [detail, setDetail] = useState<GapDetailResponse>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const requestId = useRef(0);

  const items = useMemo(() => {
    const query = area.trim().toLocaleLowerCase();
    return response.items
      .filter((gap) => gap.p_link >= minimumProbability)
      .filter((gap) => !query || `${gap.a_label} ${gap.b_label}`.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        const a = sorters[sort](left);
        const b = sorters[sort](right);
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        return (a - b) * (sortDirection === "asc" ? 1 : -1);
      })
      .slice(0, 50);
  }, [response.items, area, minimumProbability, sort, sortDirection]);

  useEffect(() => {
    if (!selected) return;
    const currentRequest = ++requestId.current;
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    loadDetail(selected)
      .then((result) => {
        if (currentRequest === requestId.current) setDetail(result);
      })
      .catch((reason: unknown) => {
        if (currentRequest === requestId.current) {
          setDetailError(reason instanceof Error ? reason.message : "The detail could not be loaded.");
        }
      })
      .finally(() => {
        if (currentRequest === requestId.current) setDetailLoading(false);
      });
    return () => {
      requestId.current += 1;
    };
  }, [selected, loadDetail]);

  function handleSort(key: GapSortKey) {
    if (sort === key) setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setSortDirection("desc");
    }
  }

  function closeDetail() {
    requestId.current += 1;
    setSelected(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }

  return (
    <div className="gaps-page">
      <p className="gaps-page__intro">Explore concept pairs that the model ranks as possible future links. P(link) is a model probability; the gap score is a separate ranking score.</p>
      <form className="gaps-filters" onSubmit={(event) => event.preventDefault()} aria-label="Filter ranked gaps">
        <label className="gaps-filter">
          <span>Filter by area or concept</span>
          <input type="search" value={area} onChange={(event) => setArea(event.currentTarget.value)} placeholder="Search concept labels" />
        </label>
        <label className="gaps-filter">
          <span>Minimum P(link)</span>
          <input type="number" min="0" max="1" step="0.05" value={minimumProbability} onChange={(event) => setMinimumProbability(Math.min(1, Math.max(0, Number(event.currentTarget.value) || 0)))} />
        </label>
        <p className="gaps-filters__count" aria-live="polite">Showing {items.length} of {response.items.length} pairs</p>
      </form>
      <GapTable
        items={items}
        selectedId={selected ? id(selected) : null}
        sort={sort}
        sortDirection={sortDirection}
        loading={loading}
        error={error}
        placeholder={response.placeholder && items.length === 0}
        onSort={handleSort}
        onSelect={setSelected}
      />
      <GapDrawer
        open={selected !== null}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        placeholder={response.placeholder}
        onClose={closeDetail}
      />
    </div>
  );
}
