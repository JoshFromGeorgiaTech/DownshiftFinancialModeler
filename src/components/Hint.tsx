import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { colors } from "../lib/colors.js";

// Cross-instance "only one open at a time" bus. A plain module-level singleton
// is simpler than lifting state into context given how deeply Fields/Toggles
// are nested across ScenarioModeler and ScenarioCard.
const listeners = new Set<(openId: string) => void>();
function broadcastOpen(openId: string) {
  listeners.forEach((notify) => notify(openId));
}

const supportsHover =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(hover: hover) and (pointer: fine)").matches
    : false;

const PANEL_MARGIN = 10;

interface HintProps {
  text: string;
}

export function Hint({ text }: HintProps) {
  const id = useId();
  const tooltipId = `hint-${id}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(false);
  const pinnedRef = useRef(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const notify = (openId: string) => {
      if (openId !== id) {
        setOpen(false);
        pinnedRef.current = false;
      }
    };
    listeners.add(notify);
    return () => { listeners.delete(notify); };
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        pinnedRef.current = false;
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        pinnedRef.current = false;
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    panel.style.transform = "translateX(-50%)";
    const boundary = wrapRef.current?.closest<HTMLElement>("[data-hint-boundary]");
    const limitLeft = boundary ? boundary.getBoundingClientRect().left + PANEL_MARGIN : PANEL_MARGIN;
    const limitRight = boundary
      ? boundary.getBoundingClientRect().right - PANEL_MARGIN
      : window.innerWidth - PANEL_MARGIN;
    const rect = panel.getBoundingClientRect();
    let dx = 0;
    if (rect.right > limitRight) dx = limitRight - rect.right;
    else if (rect.left + dx < limitLeft) dx = limitLeft - rect.left;
    if (dx !== 0) panel.style.transform = `translateX(calc(-50% + ${dx}px))`;
  }, [open]);

  function openHint() {
    broadcastOpen(id);
    setOpen(true);
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      pinnedRef.current = false;
    } else {
      pinnedRef.current = true;
      openHint();
    }
  }

  function handleMouseEnter() {
    if (!supportsHover) return;
    if (!open) openHint();
  }

  function handleMouseLeave() {
    if (!supportsHover) return;
    if (open && !pinnedRef.current) setOpen(false);
  }

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 5 }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="More information"
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          border: `1px solid ${open || active ? colors.amber : colors.panelBorder}`,
          background: "transparent",
          color: open || active ? colors.amber : colors.subtext,
          borderRadius: "50%",
          width: 14,
          height: 14,
          minWidth: 14,
          fontSize: 9,
          lineHeight: "12px",
          padding: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "inherit",
        }}
      >
        ?
      </button>
      {open && (
        <div
          ref={panelRef}
          id={tooltipId}
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 20,
            width: 220,
            maxWidth: "60vw",
            padding: "8px 10px",
            borderRadius: 8,
            background: colors.panel,
            border: `1px solid ${colors.panelBorder}`,
            color: colors.subtext,
            fontSize: 11.5,
            lineHeight: 1.5,
            fontFamily: "inherit",
            fontWeight: 400,
            textTransform: "none",
            letterSpacing: "normal",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}
