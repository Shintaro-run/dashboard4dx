import React, { useEffect, useRef, useState } from "react";

/**
 * Lightweight dropdown menu — toggle button + click-outside-to-close panel.
 *
 * Children may be ReactNodes or a render-prop function `({ close }) => ...`
 * which receives a `close` callback so menu items can dismiss themselves
 * after firing.
 */
export default function Menu({
  label = "⋯",
  title,
  align = "right",
  disabled = false,
  className = "",
  children,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className={`arch-menu${className ? " " + className : ""}`} ref={ref}>
      <button
        type="button"
        className={`arch-btn${open ? " arch-btn-active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title={title}
        disabled={disabled}
      >
        {label}
      </button>
      {open && (
        <div
          className={`arch-menu-dropdown arch-menu-${align}`}
          onClick={(e) => e.stopPropagation()}
        >
          {typeof children === "function" ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}
