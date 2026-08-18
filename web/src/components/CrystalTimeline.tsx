import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import type { Memory, MemoryFilters } from '../types';
import { memoryDateValue, throughDateRange } from '../lib/memoryFilters';
import { getTimelineTicks } from '../lib/timelineTicks';
import './CrystalTimeline.css';

const DAY_MS = 86_400_000;
const TRACK_INSET = 76;

interface CrystalTimelineProps {
  memories: Memory[];
  filters: MemoryFilters;
  onFiltersChange: (filters: MemoryFilters) => void;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const formatDate = (date: Date) => `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
const formatMonth = (date: Date) => `${date.getUTCFullYear()} · ${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const positionFor = (progress: number): string => {
  const normalized = clamp(progress);
  const correction = TRACK_INSET - TRACK_INSET * 2 * normalized;
  return `calc(${normalized * 100}% + ${correction}px)`;
};

const progressForPointer = (element: HTMLElement, clientX: number): number => {
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, rect.width - TRACK_INSET * 2);
  return clamp((clientX - rect.left - TRACK_INSET) / width);
};

export default function CrystalTimeline({ memories, filters, onFiltersChange }: CrystalTimelineProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const pointerStartX = useRef<number | null>(null);
  const movedPointer = useRef(false);
  const [expanded, setExpanded] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const [hovering, setHovering] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return undefined;
    const updateWidth = () => setTrackWidth(element.clientWidth);
    updateWidth();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const bounds = useMemo(() => {
    const dates = memories.map(memoryDateValue);
    const min = dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : new Date(Date.UTC(2021, 0, 1));
    const max = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : new Date(Date.UTC(2025, 11, 31));
    if (max.getTime() <= min.getTime()) max.setUTCDate(max.getUTCDate() + 1);
    return { min, max };
  }, [memories]);

  const committedDate = useMemo(() => {
    const end = filters.dateRange?.end;
    if (!end) return bounds.max;
    const timestamp = Date.parse(`${end.slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(timestamp) ? new Date(timestamp) : bounds.max;
  }, [bounds.max, filters.dateRange?.end]);

  const totalDays = Math.max(1, (bounds.max.getTime() - bounds.min.getTime()) / DAY_MS);
  const committedProgress = clamp((committedDate.getTime() - bounds.min.getTime()) / (bounds.max.getTime() - bounds.min.getTime()));
  const progress = dragProgress ?? committedProgress;
  const currentDate = useMemo(
    () => new Date(Math.round((bounds.min.getTime() + (bounds.max.getTime() - bounds.min.getTime()) * progress) / DAY_MS) * DAY_MS),
    [bounds.max, bounds.min, progress],
  );
  const timelineTicks = useMemo(() => {
    const start = bounds.min.getUTCFullYear();
    const end = bounds.max.getUTCFullYear();
    return getTimelineTicks(start, end, { width: trackWidth || 1028 });
  }, [bounds.max, bounds.min, trackWidth]);
  const hasCommittedDateFilter = Boolean(filters.dateRange?.start || filters.dateRange?.end);
  const hasDateSelection = hasCommittedDateFilter || dragProgress !== null;
  const currentYear = hasDateSelection ? currentDate.getUTCFullYear() : null;

  const commitProgress = (nextProgress: number) => {
    const nextDate = new Date(Math.round((bounds.min.getTime() + (bounds.max.getTime() - bounds.min.getTime()) * clamp(nextProgress)) / DAY_MS) * DAY_MS);
    if (nextProgress >= 0.9995) {
      onFiltersChange({ ...filters, dateRange: null });
      return;
    }
    onFiltersChange({
      ...filters,
      dateRange: throughDateRange(bounds.min, nextDate),
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    pointerStartX.current = event.clientX;
    movedPointer.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const dayStep = 1 / totalDays;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      commitProgress(progress - dayStep);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      commitProgress(progress + dayStep);
    } else if (event.key === 'Home') {
      event.preventDefault();
      commitProgress(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      commitProgress(1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setExpanded(false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setExpanded((value) => !value);
    }
  };

  const style = {
    '--crystal-position': positionFor(progress),
    '--crystal-progress': `${progress * 100}%`,
  } as CSSProperties;

  return (
    <section
      className={`crystal-timeline-formal ${expanded ? 'is-expanded' : ''}`}
      aria-label="水晶时间轴"
      data-testid="crystal-timeline"
    >
      <div
        ref={bodyRef}
        className={`crystal-timeline-formal-body ${dragging ? 'is-dragging' : ''}`}
        style={style}
        role="slider"
        tabIndex={0}
        aria-valuemin={bounds.min.getTime()}
        aria-valuemax={bounds.max.getTime()}
        aria-valuenow={currentDate.getTime()}
        aria-valuetext={hasDateSelection ? formatDate(currentDate) : '全部时间'}
        onPointerDown={handlePointerDown}
        onPointerMove={(event) => {
          if (!dragging) return;
          if (pointerStartX.current !== null && Math.abs(event.clientX - pointerStartX.current) > 4) {
            movedPointer.current = true;
            setExpanded(true);
          }
          if (movedPointer.current) setDragProgress(progressForPointer(event.currentTarget, event.clientX));
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (movedPointer.current) commitProgress(progressForPointer(event.currentTarget, event.clientX));
          setDragging(false);
          setDragProgress(null);
          pointerStartX.current = null;
        }}
        onPointerCancel={() => {
          setDragging(false);
          setDragProgress(null);
          pointerStartX.current = null;
        }}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={() => {
          if (movedPointer.current) {
            movedPointer.current = false;
            return;
          }
          setExpanded((value) => !value);
        }}
      >
        <div className="crystal-formal-glass" aria-hidden="true" />
        <div className="crystal-formal-highlight" aria-hidden="true" />
        <div className="crystal-formal-shade" aria-hidden="true" />
        <div className="crystal-formal-focus" aria-hidden="true"><span /></div>
        <div className="crystal-formal-content">
          <button
            type="button"
            className="crystal-formal-edge crystal-formal-edge-calendar"
            aria-label="回到当前时间"
            title="回到当前时间"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              commitProgress(1);
              setExpanded(true);
            }}
          >
            <CalendarDays size={18} strokeWidth={1.55} aria-hidden="true" />
          </button>
          <span className="crystal-formal-edge crystal-formal-edge-plus" aria-hidden="true"><Plus size={22} strokeWidth={1.45} /></span>
          <div className="crystal-formal-years" aria-hidden="true">
            {timelineTicks.minorYears.map((year) => {
              const yearProgress = clamp((Date.UTC(year, 0, 1) - bounds.min.getTime()) / (bounds.max.getTime() - bounds.min.getTime()));
              return <span key={`minor-${year}`} className="crystal-formal-minor-tick" style={{ left: positionFor(yearProgress) }} />;
            })}
            {timelineTicks.majorYears.map((year) => {
              const yearProgress = clamp((Date.UTC(year, 0, 1) - bounds.min.getTime()) / (bounds.max.getTime() - bounds.min.getTime()));
              return <span key={year} className={year === currentYear ? 'is-current-major' : undefined} style={{ left: positionFor(yearProgress) }}>{year}</span>;
            })}
          </div>
          <div className="crystal-formal-track"><span /></div>
          <span className="crystal-formal-handle" aria-hidden="true" />
          <div className="crystal-formal-current-years" aria-hidden="true">
            {hasDateSelection && <span className={`crystal-formal-current-year ${dragging ? 'is-current' : ''}`} style={{ left: 'var(--crystal-position)' }}>{currentYear}</span>}
          </div>
          <output className={`crystal-formal-popover ${dragging || hovering || expanded ? 'is-visible' : ''}`} aria-live="polite">
            {hasDateSelection ? (
              <>
                <span className="crystal-formal-popover-month"><CalendarDays size={16} />{formatMonth(currentDate)}</span>
                <span className="crystal-formal-popover-date">截至 {formatDate(currentDate)}</span>
              </>
            ) : (
              <span className="crystal-formal-popover-all">全部时间</span>
            )}
          </output>
        </div>
      </div>
      {expanded && filters.dateRange && (
        <button
          type="button"
          className="crystal-formal-clear"
          onClick={(event) => {
            event.stopPropagation();
            onFiltersChange({ ...filters, dateRange: null });
            setExpanded(false);
          }}
        >
          清除时间
        </button>
      )}
    </section>
  );
}
