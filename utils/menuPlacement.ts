export type MenuPlacement = {
  left: number;
  top: number;
  opensUp: boolean;
  menuHeight: number;
};

type MenuPlacementOptions = {
  width?: number;
  itemHeight?: number;
  paddingY?: number;
  margin?: number;
};

export const getAnchoredMenuPlacement = (
  anchor: { x: number; y: number } | undefined,
  itemCount: number,
  options: MenuPlacementOptions = {},
): MenuPlacement | null => {
  if (!anchor) return null;

  const width = options.width ?? 236;
  const itemHeight = options.itemHeight ?? 48;
  const paddingY = options.paddingY ?? 12;
  const margin = options.margin ?? 12;
  const menuHeight = itemCount * itemHeight + paddingY;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const left = Math.min(maxLeft, Math.max(margin, anchor.x));
  const bottomLimit = window.innerHeight - margin;
  const opensUp = anchor.y + menuHeight > bottomLimit;

  if (!opensUp) {
    return {
      left,
      top: Math.min(bottomLimit - menuHeight, Math.max(margin, anchor.y - 6)),
      opensUp,
      menuHeight,
    };
  }

  const firstActionTopWhenReversed = anchor.y - 6;
  const top = firstActionTopWhenReversed - paddingY / 2 - (itemCount - 1) * itemHeight;
  return {
    left,
    top: Math.min(bottomLimit - menuHeight, Math.max(margin, top)),
    opensUp,
    menuHeight,
  };
};
