import React from "react";
import { brandMarkMarkup, type ModelBrand } from "@/utils/ai/modelBrand";

/**
 * One vendor mark, inlined so the mono logos inherit `currentColor`.
 *
 * `brand` is a stable object from the rule table, so the memo actually holds:
 * the picker re-renders on hover and on every keystroke in the composer, and
 * re-parsing the markup would rebuild the icon's DOM each time.
 */
const ModelBrandIconImpl: React.FC<{ brand: ModelBrand; className?: string }> = ({
  brand,
  className = "",
}) => (
  <span
    className={`ai-brand ${className}`.trim()}
    role="img"
    aria-label={brand.label}
    title={brand.label}
    dangerouslySetInnerHTML={{ __html: brandMarkMarkup(brand) }}
  />
);

const ModelBrandIcon = React.memo(ModelBrandIconImpl);

export default ModelBrandIcon;
