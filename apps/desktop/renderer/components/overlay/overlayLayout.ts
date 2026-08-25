import type { CSSProperties } from 'vue'

export const getOverlayWrapperStyle = (
  isCustomPosition: boolean,
  customStyle: CSSProperties,
): CSSProperties =>
  isCustomPosition
    ? {
        ...customStyle,
        // An absolutely positioned element with an automatic width shrinks to
        // the space remaining after `left`. Give it a viewport-based width so
        // moving it only changes its position, never the drop dimensions.
        width: 'max-content',
        maxWidth: '90vw',
      }
    : {}
