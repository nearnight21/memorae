import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  CRYSTAL_TIMELINE_INITIAL_DATE,
  CRYSTAL_TIMELINE_MAX_DATE,
  CRYSTAL_TIMELINE_MIN_DATE,
  clampProgress,
  dateToTimelineProgress,
  formatTimelineDate,
  formatTimelineMonth,
  timelineProgressToDate,
  timelineYearProgress,
} from './crystalTimelineTime';
import './crystal-timeline-prototype.css';

const YEARS = [2021, 2022, 2023, 2024, 2025];
const TRACK_INSET_PX = 46;

interface CrystalTimelinePrototypeProps {
  initialProgress?: number;
  materialOnly?: boolean;
}

const positionExpression = (progress: number): string => {
  const normalized = clampProgress(progress);
  const correction = TRACK_INSET_PX - TRACK_INSET_PX * 2 * normalized;
  return `calc(${normalized * 100}% + ${correction}px)`;
};

const progressFromPointer = (element: HTMLElement, clientX: number): number => {
  const rect = element.getBoundingClientRect();
  const trackWidth = Math.max(1, rect.width - TRACK_INSET_PX * 2);
  return clampProgress((clientX - rect.left - TRACK_INSET_PX) / trackWidth);
};

export default function CrystalTimelinePrototype({
  initialProgress = dateToTimelineProgress(CRYSTAL_TIMELINE_INITIAL_DATE),
  materialOnly = false,
}: CrystalTimelinePrototypeProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(() => clampProgress(initialProgress));
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const currentDate = useMemo(() => timelineProgressToDate(progress), [progress]);
  const currentYear = currentDate.getUTCFullYear();
  const style = {
    '--crystal-progress': `${progress * 100}%`,
    '--crystal-position': positionExpression(progress),
  } as CSSProperties;

  const updateFromPointer = (clientX: number) => {
    if (bodyRef.current) setProgress(progressFromPointer(bodyRef.current, clientX));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    updateFromPointer(event.clientX);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    event.preventDefault();
    updateFromPointer(event.clientX);
  };

  const finishDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const days = Math.max(
      1,
      (CRYSTAL_TIMELINE_MAX_DATE.getTime() - CRYSTAL_TIMELINE_MIN_DATE.getTime()) / 86_400_000,
    );
    const dayStep = 1 / days;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setProgress((value) => clampProgress(value - dayStep));
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setProgress((value) => clampProgress(value + dayStep));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setProgress(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setProgress(1);
    }
  };

  return (
    <section
      className={`crystal-timeline-prototype ${materialOnly ? 'is-material-only' : ''}`}
      aria-label="水晶时间轴开发原型"
      data-testid="crystal-timeline-prototype"
    >
      <div
        ref={bodyRef}
        className={`crystal-timeline-body ${isDragging ? 'is-dragging' : ''}`}
        style={style}
        role="slider"
        tabIndex={materialOnly ? -1 : 0}
        aria-valuemin={CRYSTAL_TIMELINE_MIN_DATE.getTime()}
        aria-valuemax={CRYSTAL_TIMELINE_MAX_DATE.getTime()}
        aria-valuenow={currentDate.getTime()}
        aria-valuetext={formatTimelineDate(currentDate)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDragging}
        onPointerCancel={finishDragging}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="crystal-glass-base" aria-hidden="true" />
        <div className="crystal-optical-highlight" aria-hidden="true" />
        <div className="crystal-optical-shade" aria-hidden="true" />
        <div className="crystal-edge-lens crystal-edge-lens-left" aria-hidden="true" />
        <div className="crystal-edge-lens crystal-edge-lens-right" aria-hidden="true" />
        <div className="crystal-current-focus" aria-hidden="true">
          <span className="crystal-current-focus-core" />
        </div>

        <div className="crystal-timeline-content">
          <div className="crystal-year-labels" aria-hidden="true">
            {YEARS.map((year) => (
              <span
                key={year}
                className={year === currentYear ? 'is-near-current' : ''}
                style={{ '--year-position': positionExpression(timelineYearProgress(year)) } as CSSProperties}
              >
                {year}
              </span>
            ))}
          </div>
          <div className="crystal-timeline-track" aria-hidden="true">
            <span className="crystal-timeline-track-past" />
          </div>
          <span className="crystal-timeline-handle" aria-hidden="true" />
          <span className="crystal-timeline-hit-target" aria-hidden="true" />
          <output
            className={`crystal-current-time-label ${isDragging || isHovering ? 'is-expanded' : ''}`}
            aria-live="polite"
          >
            <span className="crystal-current-time-short">{formatTimelineMonth(currentDate)}</span>
            <span className="crystal-current-time-full">{formatTimelineDate(currentDate)}</span>
          </output>
        </div>
      </div>
    </section>
  );
}
