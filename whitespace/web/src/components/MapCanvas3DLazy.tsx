import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";
import type { MapCanvas3D as MapCanvas3DType } from "./MapCanvas3D";

const Inner = lazy(() => import("./MapCanvas3D").then((m) => ({ default: m.MapCanvas3D })));

/** Drop-in wrapper: three.js loads in its own chunk only when the 3D map is mounted. */
export function MapCanvas3DLazy(props: ComponentProps<typeof MapCanvas3DType>) {
  return (
    <Suspense fallback={<div className="ws3d ws3d--loading" role="status">Loading 3D map…</div>}>
      <Inner {...props} />
    </Suspense>
  );
}

export default MapCanvas3DLazy;
