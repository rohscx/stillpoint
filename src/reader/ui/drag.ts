import type { ReaderPosition } from '../../shared/types.js';

export const DEFAULT_POSITION: Readonly<ReaderPosition> = { x: 50, y: 38 };
export const POSITION_NUDGE = 2;

export interface Size {
  width: number;
  height: number;
}

export function positionToPixels(position: ReaderPosition, viewport: Size): ReaderPosition {
  return {
    x: position.x * viewport.width / 100,
    y: position.y * viewport.height / 100,
  };
}

export function pixelsToPosition(point: ReaderPosition, viewport: Size): ReaderPosition {
  return {
    x: viewport.width === 0 ? DEFAULT_POSITION.x : point.x / viewport.width * 100,
    y: viewport.height === 0 ? DEFAULT_POSITION.y : point.y / viewport.height * 100,
  };
}

// The reader's vertical extent is asymmetric: the frame is centred on the position, but
// the controls hang below it (.sp-reader-chrome, top: 100%). Clamping on the frame alone
// pushes the transport, progress and status off the bottom of the viewport, where they
// cannot be reached. SPEC §3.6 — the whole reader stays on screen, not just the frame.
export function clampPosition(
  position: ReaderPosition,
  viewport: Size,
  frame: Size,
  chromeHeight = 0,
): ReaderPosition {
  const halfWidth = viewport.width <= 0 ? 50 : Math.min(50, frame.width / viewport.width * 50);
  const above = viewport.height <= 0 ? 50 : Math.min(50, frame.height / viewport.height * 50);
  // Not capped at 50: this is a full extent measured from the centre, not a half extent
  // like halfWidth. Capping it silently let the controls overflow on short viewports.
  const below = viewport.height <= 0
    ? 50
    : (frame.height / 2 + chromeHeight) / viewport.height * 100;
  // A viewport too short to hold both leaves no valid range; keep the frame on screen and
  // let the controls overflow rather than producing an inverted clamp.
  const top = above;
  const bottom = Math.max(above, 100 - below);
  return {
    x: Math.min(100 - halfWidth, Math.max(halfWidth, position.x)),
    y: Math.min(bottom, Math.max(top, position.y)),
  };
}

export function snapPosition(position: ReaderPosition): ReaderPosition {
  return Math.abs(position.x - DEFAULT_POSITION.x) <= 2
    && Math.abs(position.y - DEFAULT_POSITION.y) <= 2
    ? { ...DEFAULT_POSITION }
    : position;
}

export function nudgePosition(
  position: ReaderPosition,
  xDirection: -1 | 0 | 1,
  yDirection: -1 | 0 | 1,
): ReaderPosition {
  return {
    x: position.x + xDirection * POSITION_NUDGE,
    y: position.y + yDirection * POSITION_NUDGE,
  };
}

export interface DragActions {
  commit: (position: ReaderPosition | null) => void;
}

interface Gesture {
  pointerId: number;
  startPointer: ReaderPosition;
  startPosition: ReaderPosition;
  viewport: Size;
  frame: Size;
  chromeHeight: number;
}

export class Drag {
  readonly #frame: HTMLElement;
  readonly #container: HTMLElement;
  readonly #chrome: HTMLElement | null;
  readonly #actions: DragActions;
  readonly #onPointerDown: (event: PointerEvent) => void;
  readonly #onPointerMove: (event: PointerEvent) => void;
  readonly #onPointerEnd: (event: PointerEvent) => void;
  readonly #onViewportChange: () => void;
  #position: ReaderPosition;
  #gesture: Gesture | undefined;

  constructor(
    frame: HTMLElement,
    container: HTMLElement,
    position: ReaderPosition | null,
    actions: DragActions,
  ) {
    this.#frame = frame;
    this.#container = container;
    this.#chrome = container.querySelector('.sp-reader-chrome');
    this.#actions = actions;
    this.#position = position ?? { ...DEFAULT_POSITION };
    this.#onPointerDown = (event) => this.#start(event);
    this.#onPointerMove = (event) => this.#move(event);
    this.#onPointerEnd = (event) => this.#end(event);
    this.#onViewportChange = () => this.reclamp(true);
    frame.addEventListener('pointerdown', this.#onPointerDown);
    frame.addEventListener('pointermove', this.#onPointerMove);
    frame.addEventListener('pointerup', this.#onPointerEnd);
    frame.addEventListener('pointercancel', this.#onPointerEnd);
    frame.addEventListener('lostpointercapture', this.#onPointerEnd);
    window.addEventListener('resize', this.#onViewportChange);
    window.addEventListener('orientationchange', this.#onViewportChange);
    this.#apply();
    this.reclamp(position !== null);
  }

  get position(): ReaderPosition {
    return { ...this.#position };
  }

  setPosition(position: ReaderPosition | null): void {
    this.#position = position ?? { ...DEFAULT_POSITION };
    this.#apply();
    this.reclamp(position !== null);
  }

  nudge(xDirection: -1 | 0 | 1, yDirection: -1 | 0 | 1): void {
    this.#position = clampPosition(
      nudgePosition(this.#position, xDirection, yDirection),
      this.#viewportSize(),
      this.#frameSize(),
      this.#chromeHeight(),
    );
    this.#apply();
    this.#commit();
  }

  reset(): void {
    this.#position = { ...DEFAULT_POSITION };
    this.#apply();
    this.#actions.commit(null);
  }

  reclamp(commit: boolean): void {
    const next = clampPosition(this.#position, this.#viewportSize(), this.#frameSize(), this.#chromeHeight());
    const changed = next.x !== this.#position.x || next.y !== this.#position.y;
    this.#position = next;
    this.#apply();
    if (commit && changed) this.#commit();
  }

  destroy(): void {
    this.#frame.removeEventListener('pointerdown', this.#onPointerDown);
    this.#frame.removeEventListener('pointermove', this.#onPointerMove);
    this.#frame.removeEventListener('pointerup', this.#onPointerEnd);
    this.#frame.removeEventListener('pointercancel', this.#onPointerEnd);
    this.#frame.removeEventListener('lostpointercapture', this.#onPointerEnd);
    window.removeEventListener('resize', this.#onViewportChange);
    window.removeEventListener('orientationchange', this.#onViewportChange);
  }

  #start(event: PointerEvent): void {
    if (event.button !== 0 || this.#gesture !== undefined) return;
    this.#gesture = {
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      startPosition: { ...this.#position },
      viewport: this.#viewportSize(),
      frame: this.#frameSize(),
      chromeHeight: this.#chromeHeight(),
    };
    this.#frame.setPointerCapture(event.pointerId);
    this.#frame.classList.add('sp-dragging');
    event.preventDefault();
  }

  #move(event: PointerEvent): void {
    const gesture = this.#gesture;
    if (gesture === undefined || gesture.pointerId !== event.pointerId) return;
    const delta = pixelsToPosition({
      x: event.clientX - gesture.startPointer.x,
      y: event.clientY - gesture.startPointer.y,
    }, gesture.viewport);
    this.#position = clampPosition({
      x: gesture.startPosition.x + delta.x,
      y: gesture.startPosition.y + delta.y,
    }, gesture.viewport, gesture.frame, gesture.chromeHeight);
    this.#apply();
    event.preventDefault();
  }

  #end(event: PointerEvent): void {
    const gesture = this.#gesture;
    if (gesture === undefined || gesture.pointerId !== event.pointerId) return;
    this.#gesture = undefined;
    this.#frame.classList.remove('sp-dragging');
    this.#position = clampPosition(snapPosition(this.#position), gesture.viewport, gesture.frame, gesture.chromeHeight);
    this.#apply();
    this.#commit();
  }

  #commit(): void {
    if (this.#position.x === DEFAULT_POSITION.x && this.#position.y === DEFAULT_POSITION.y) {
      this.#position = { ...DEFAULT_POSITION };
      this.#apply();
      this.#actions.commit(null);
      return;
    }
    this.#actions.commit({ ...this.#position });
  }

  #apply(): void {
    this.#container.style.left = `${this.#position.x}%`;
    this.#container.style.top = `${this.#position.y}%`;
  }

  // Measured per gesture, never per word tick — the render path must force no layout
  // (SPEC §1.3, asserted by the perf spec).
  #chromeHeight(): number {
    return this.#chrome?.getBoundingClientRect().height ?? 0;
  }

  #viewportSize(): Size {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  #frameSize(): Size {
    const rect = this.#frame.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}
