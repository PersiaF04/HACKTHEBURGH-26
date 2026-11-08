// TEMPORARY: delete src/demo and DemoToggle when real data is connected.
import { DEMO_TOGGLE_ENABLED, useDemoMode } from "./mode";

const TIP = "Show invented demo data to preview the screens; remove when real data is connected";

export function DemoToggle() {
  const [demo, setDemo] = useDemoMode();
  if (!DEMO_TOGGLE_ENABLED) return null;
  return (
    <button type="button" className="demo-toggle" aria-pressed={demo} onClick={() => setDemo(!demo)} title={TIP}>
      <span className="demo-toggle__track" aria-hidden="true"><span className="demo-toggle__knob" /></span>
      <span>Demo data</span>
    </button>
  );
}
