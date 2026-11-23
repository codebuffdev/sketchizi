import { memo } from "react";
import { ICON_SHAPES, ICON_TAGS } from "./primitiveIconShapes.js";
import { getPrimitive } from "./primitives.js";

const TAGS = { path: "path", rect: "rect", circle: "circle", ellipse: "ellipse", polyline: "polyline", polygon: "polygon" };

/** Crisp 16x16 line icon. Colour comes from CSS `color` (currentColor), so accents/tints are pure CSS. */
export const Icon = memo(function Icon({ name, size = 16, className = "" }) {
  const shapes = ICON_SHAPES[name];
  if (!shapes) return <span className={`sd-icon ${className}`} style={{ width: size, height: size }} aria-hidden="true" />;
  return (
    <svg className={`sd-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {shapes.map(([tag, attrs], index) => {
        if (!ICON_TAGS.includes(tag)) return null;
        const Tag = TAGS[tag];
        return <Tag key={index} {...attrs} />;
      })}
    </svg>
  );
});

/** Icon for a primitive kind, tinted by its accent (slate / emerald / amber). A node's own accent overrides the default. */
export function PrimitiveIcon({ kind, accent, size = 16, className = "" }) {
  const primitive = getPrimitive(kind);
  return <Icon name={primitive?.icon || "cpu"} size={size} className={`sd-prim-icon is-${accent || primitive?.accent || "slate"} ${className}`.trim()} />;
}
