const DIRECTION_LOCK_RATIO = 1.15;
const PHOTO_PAGING_SLOP = 8;
const DETAIL_DISMISS_SLOP = 10;
const DETAIL_DISMISS_DISTANCE_RATIO = 0.16;
const DETAIL_DISMISS_VELOCITY = 0.9;
const DETAIL_DISMISS_FLICK_DISTANCE = 28;

export function circularPhotoIndex(
  currentIndex: number,
  direction: -1 | 1,
  photoCount: number,
): number {
  if (photoCount <= 1) return 0;
  return ((currentIndex + direction) % photoCount + photoCount) % photoCount;
}

export function shouldStartPhotoPaging(dx: number, dy: number): boolean {
  return Math.abs(dx) > PHOTO_PAGING_SLOP
    && Math.abs(dx) > Math.abs(dy) * DIRECTION_LOCK_RATIO;
}

export function shouldStartDetailDismiss(dx: number, dy: number): boolean {
  return dy > DETAIL_DISMISS_SLOP
    && dy > Math.abs(dx) * DIRECTION_LOCK_RATIO;
}

export function shouldDismissDetail(dy: number, vy: number, height: number): boolean {
  return dy > height * DETAIL_DISMISS_DISTANCE_RATIO
    || (dy > DETAIL_DISMISS_FLICK_DISTANCE && vy > DETAIL_DISMISS_VELOCITY);
}
