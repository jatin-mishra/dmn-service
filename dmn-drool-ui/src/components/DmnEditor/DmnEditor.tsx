import type { RefObject } from "react";

/** Host element for the Apache KIE DMN editor iframe; useDmnEditor mounts the editor into it. */
export function DmnEditor({ containerRef }: { containerRef: RefObject<HTMLDivElement> }) {
  return <div className="dmn-editor" ref={containerRef} />;
}
