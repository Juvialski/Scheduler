import { DateTime, Interval } from "luxon";

export interface TimeSlot {
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}

export interface WeeklyAvailability {
  [key: string]: TimeSlot[];
}

export interface Booking {
  id: string;
  startTime: Date;
  endTime: Date;
  childName: string;
}

export interface Override {
  date: string; // YYYY-MM-DD
  slots: TimeSlot[] | null;
}

/**
 * Merges overlapping or contiguous intervals into a minimal set of intervals.
 */
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length <= 1) return intervals;

  // Sort by start time
  const sorted = [...intervals].sort((a, b) => a.start!.toMillis() - b.start!.toMillis());
  const merged: Interval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (last.overlaps(current) || last.end?.equals(current.start!)) {
      // Merge: take the earliest start and latest end
      const newStart = last.start! < current.start! ? last.start! : current.start!;
      const newEnd = last.end! > current.end! ? last.end! : current.end!;
      merged[merged.length - 1] = Interval.fromDateTimes(newStart, newEnd);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Gets the raw available intervals for a specific day in the tutor's timezone (Asia/Manila).
 */
export function getTutorAvailabilityIntervals(
  datePH: DateTime, // This must be in Asia/Manila
  weekly: WeeklyAvailability,
  overrides: Override[]
): Interval[] {
  const dateStr = datePH.toISODate()!;
  const dayName = datePH.weekdayLong?.toLowerCase() || "";

  const override = overrides.find(o => o.date === dateStr);
  let baseTimeSlots: TimeSlot[] = [];

  if (override) {
    if (override.slots === null) return [];
    baseTimeSlots = override.slots;
  } else {
    baseTimeSlots = weekly[dayName] || [];
  }

  const intervals = baseTimeSlots.map(ts => {
    try {
      const [startH, startM] = ts.start.split(":").map(Number);
      const [endH, endM] = ts.end.split(":").map(Number);

      const start = datePH.set({ hour: startH, minute: startM, second: 0, millisecond: 0 });
      let end = datePH.set({ hour: endH, minute: endM, second: 0, millisecond: 0 });

      if (end <= start) {
        end = end.plus({ days: 1 });
      }

      return Interval.fromDateTimes(start, end);
    } catch (e) {
      console.error("Invalid interval data", ts, e);
      return null;
    }
  }).filter((i): i is Interval => i !== null);

  // CRITICAL: Merge them before returning to the UI to avoid overlaps
  return mergeIntervals(intervals);
}

/**
 * Checks if a proposed booking interval is fully within availability and doesn't overlap bookings.
 */
export function isSlotAvailable(
  proposedInterval: Interval,
  weekly: WeeklyAvailability,
  overrides: Override[],
  bookings: Booking[]
): boolean {
  const startPH = proposedInterval.start!.setZone("Asia/Manila");
  const endPH = proposedInterval.end!.setZone("Asia/Manila");

  const daysToCheck = [startPH.startOf("day"), endPH.startOf("day")];
  const uniqueDays = Array.from(new Set(daysToCheck.map(d => d.toISODate())));

  const availabilityIntervals: Interval[] = [];
  uniqueDays.forEach(dStr => {
    const d = DateTime.fromISO(dStr!, { zone: "Asia/Manila" });
    availabilityIntervals.push(...getTutorAvailabilityIntervals(d, weekly, overrides));
  });

  // Check if proposed is contained in ANY availability interval
  const isWithinAvailability = availabilityIntervals.some(ai =>
    ai.contains(proposedInterval.start!) && ai.contains(proposedInterval.end!)
  );
  if (!isWithinAvailability) return false;

  const hasConflict = bookings.some(b => {
    const bInterval = Interval.fromDateTimes(
      DateTime.fromJSDate(b.startTime),
      DateTime.fromJSDate(b.endTime)
    );
    return proposedInterval.overlaps(bInterval);
  });

  return !hasConflict;
}
