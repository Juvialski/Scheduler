"use client";

import React, { useState, useEffect, useRef } from "react";
import { DateTime, Interval } from "luxon";
import { useTimezone } from "@/context/TimezoneContext";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, addDoc, setDoc, Timestamp, deleteDoc } from "firebase/firestore";
import { WeeklyAvailability, Override, Booking, TimeSlot, getTutorAvailabilityIntervals, isSlotAvailable } from "@/lib/availability";
import { ChevronLeft, ChevronRight, Loader2, Clock, CheckCircle2, AlertCircle, Trash2, CalendarDays, LogIn, X } from "lucide-react";
import { clsx } from "clsx";
import { useWindowSize } from "usehooks-ts";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const ROW_HEIGHT = 96;

export default function Calendar() {
  const { timezone, timezoneLabel } = useTimezone();
  const { user, isAdmin, signIn } = useAuth();
  const { width } = useWindowSize();
  const isMobile = width < 768;

  const [currentWeekStart, setCurrentWeekStart] = useState(
    DateTime.now().setZone(timezone).startOf("week")
  );

  // Mobile specific: current focused day
  const [focusedDayIdx, setFocusedDayIdx] = useState(
    DateTime.now().setZone(timezone).weekday - 1
  );

  const [selectedStartTime, setSelectedStartTime] = useState<DateTime | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(60);

  const [weekly, setWeekly] = useState<WeeklyAvailability>({});
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingInProgress, setBookingInProgress] = useState(false);
  const [childName, setChildName] = useState("");
  const [pastChildNames, setPastChildNames] = useState<string[]>([]);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [now, setNow] = useState(DateTime.now().setZone(timezone));

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      console.log("Fetching fresh data from Firestore...");
      const weeklySnap = await getDoc(doc(db, "settings", "tutor_availability"));
      let fetchedWeekly = {};
      if (weeklySnap.exists()) {
        fetchedWeekly = weeklySnap.data() as WeeklyAvailability;
        setWeekly(fetchedWeekly);
      }

      const overridesSnap = await getDocs(collection(db, "availability_overrides"));
      const fetchedOverrides = overridesSnap.docs.map(d => ({ date: d.id, ...d.data() } as Override));
      setOverrides(fetchedOverrides);

      const bookingsSnap = await getDocs(collection(db, "bookings"));
      const fetchedBookings = bookingsSnap.docs.map(d => ({
        id: d.id,
        startTime: d.data().startTime.toDate(),
        endTime: d.data().endTime.toDate(),
        childName: d.data().childName
      }));
      setBookings(fetchedBookings);

      console.log("Sync Complete:", {
        weekly: Object.keys(fetchedWeekly).length,
        overrides: fetchedOverrides.length,
        bookings: fetchedBookings.length
      });

      if (user) {
        const userBookingsQ = query(collection(db, "bookings"), where("clientId", "==", user.uid));
        const userBookingsSnap = await getDocs(userBookingsQ);
        const names = Array.from(new Set(userBookingsSnap.docs.map(d => d.data().childName)));
        setPastChildNames(names as string[]);
      }
    } catch (e) {
      console.error("Fetch error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(DateTime.now().setZone(timezone));
    }, 60000);
    return () => clearInterval(timer);
  }, [timezone]);

  useEffect(() => {
    setCurrentWeekStart(prev => prev.setZone(timezone));
  }, [timezone]);

  useEffect(() => {
    if (!loading && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 8 * ROW_HEIGHT;
    }
  }, [loading]);

  const weekDays = Array.from({ length: 7 }, (_, i) => currentWeekStart.plus({ days: i }));
  const visibleDays = isMobile ? [weekDays[focusedDayIdx]] : weekDays;

  const nextWeek = () => setCurrentWeekStart(currentWeekStart.plus({ weeks: 1 }));
  const prevWeek = () => setCurrentWeekStart(currentWeekStart.minus({ weeks: 1 }));

  const handleAdminToggleSlot = async (slotStart: DateTime) => {
    if (!isAdmin) return;
    if (slotStart < DateTime.now()) {
      alert("Cannot edit availability in the past.");
      return;
    }

    setSavingAdmin(true);
    const slotPH = slotStart.setZone("Asia/Manila");
    const dateStr = slotPH.toISODate()!;
    const hourInterval = Interval.after(slotPH, { hours: 1 });

    // Get existing intervals for this day (this uses both weekly and overrides)
    const existingIntervals = getTutorAvailabilityIntervals(slotPH.startOf("day"), weekly, overrides);

    let newIntervals: Interval[] = [];
    const isAlreadyAvailable = existingIntervals.some(ai => ai.contains(slotPH) || ai.equals(hourInterval));

    if (isAlreadyAvailable) {
      // REMOVE: Subtract this hour from existing intervals
      existingIntervals.forEach(ai => {
        if (ai.overlaps(hourInterval)) {
          // Subtracting the hour might split one interval into two
          const result = ai.difference(hourInterval);
          newIntervals.push(...result);
        } else {
          newIntervals.push(ai);
        }
      });
    } else {
      // ADD: Add this hour and merge
      newIntervals = [...existingIntervals, hourInterval];
    }

    // Convert Intervals back to TimeSlot objects (HH:mm)
    const newSlots: TimeSlot[] = newIntervals.map(interval => ({
      start: interval.start!.toFormat("HH:mm"),
      end: interval.end!.toFormat("HH:mm")
    }));

    try {
      await setDoc(doc(db, "availability_overrides", dateStr), { slots: newSlots });
      await fetchData();
    } catch (e) {
      console.error("Admin toggle error", e);
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleBook = async () => {
    if (!user) {
      await signIn();
      return;
    }

    if (!selectedStartTime || !childName.trim()) return;
    const proposedInterval = Interval.after(selectedStartTime, { minutes: durationMinutes });

    if (proposedInterval.start! < DateTime.now()) {
      alert("Cannot book sessions in the past.");
      return;
    }

    if (!isSlotAvailable(proposedInterval, weekly, overrides, bookings)) {
      alert("This slot is no longer available or overlaps another booking.");
      return;
    }

    setBookingInProgress(true);
    try {
      await addDoc(collection(db, "bookings"), {
        startTime: Timestamp.fromDate(proposedInterval.start!.toJSDate()),
        endTime: Timestamp.fromDate(proposedInterval.end!.toJSDate()),
        clientId: user.uid,
        clientEmail: user.email,
        clientName: user.displayName,
        childName: childName,
        createdAt: Timestamp.now(),
        clientTimezone: timezone,
        notified: false
      });
      alert("Booking successful!");
      await fetchData();
      setChildName("");
      setSelectedStartTime(null);
    } catch (e) {
      console.error("Booking error", e);
      alert("Failed to book.");
    } finally {
      setBookingInProgress(false);
    }
  };

  const handleDeleteBooking = async (id: string) => {
    if (!isAdmin || !confirm("Delete this booking?")) return;
    try {
      await deleteDoc(doc(db, "bookings", id));
      await fetchData();
    } catch (e) {
      console.error("Delete error", e);
    }
  };

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin w-8 h-8 text-indigo-600" /></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-140px)] bg-white md:rounded-2xl shadow-2xl border-2 border-slate-200 overflow-hidden relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-center justify-between p-3 md:p-4 border-b-2 border-slate-200 bg-white gap-3 md:gap-0">
        <div className="flex items-center gap-3 md:gap-6 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 md:w-6 md:h-6 text-indigo-600" />
            <h2 className="text-lg md:text-2xl font-black text-slate-900 md:min-w-[200px] tracking-tight">
              {currentWeekStart.toFormat("MMMM yyyy")}
            </h2>
          </div>
          <div className="flex items-center bg-slate-100 rounded-xl p-1 shadow-inner border border-slate-200 ml-auto md:ml-0">
            <button onClick={prevWeek} className="p-1.5 md:p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all">
              <ChevronLeft className="w-4 h-4 md:w-5 md:h-5 text-slate-800" />
            </button>
            <button
              onClick={() => setCurrentWeekStart(DateTime.now().setZone(timezone).startOf("week"))}
              className="px-3 md:px-6 py-1 md:py-2 text-[10px] md:text-sm font-black text-slate-900 hover:bg-white hover:shadow-sm rounded-xl transition-all uppercase tracking-widest"
            >
              Today
            </button>
            <button onClick={nextWeek} className="p-1.5 md:p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all">
              <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-slate-800" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto justify-between">
          <div className="text-[10px] md:text-sm font-black text-white bg-indigo-600 px-4 md:px-6 py-2 md:py-3 rounded-full shadow-lg border-b-4 border-indigo-800 active:translate-y-0.5 transition-all">
             {timezoneLabel}
          </div>
          {isAdmin && savingAdmin && <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin text-indigo-600" />}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden bg-slate-50/30 relative">
        {/* Booking Sidebar / Mobile Modal */}
        {selectedStartTime && !isAdmin && (
           <div className={clsx(
             "md:w-80 border-r-2 border-slate-200 p-6 md:p-8 bg-white overflow-y-auto animate-in slide-in-from-bottom md:slide-in-from-left duration-300 shadow-2xl z-[100]",
             "absolute md:relative inset-x-0 bottom-0 top-[20%] md:top-0 rounded-t-3xl md:rounded-none"
           )}>
             <div className="flex justify-between items-center mb-6 md:hidden">
                <div className="flex items-center gap-2 text-emerald-700 font-black">
                   <Clock className="w-6 h-6" />
                   <span className="text-lg tracking-tighter uppercase">Book Session</span>
                </div>
                <button onClick={() => setSelectedStartTime(null)} className="p-2 bg-slate-100 rounded-full">
                   <X className="w-5 h-5 text-slate-600" />
                </button>
             </div>

             <div className="hidden md:flex items-center gap-3 text-emerald-700 font-black mb-2">
               <Clock className="w-7 h-7" />
               <span className="text-xl tracking-tighter uppercase">Book Session</span>
             </div>
             <p className="text-sm font-black text-slate-400 mb-6 md:mb-8 uppercase tracking-widest">
               {selectedStartTime.toFormat("cccc, MMM d")}
             </p>

             <div className="space-y-6 md:space-y-8">
                {!user ? (
                  <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-2xl">
                    <p className="text-amber-800 text-xs font-black uppercase mb-4 leading-tight tracking-tight">
                      Please sign in to confirm your booking.
                    </p>
                    <button
                      onClick={() => signIn()}
                      className="w-full bg-amber-500 text-white font-black py-3 rounded-xl hover:bg-amber-600 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      <LogIn className="w-4 h-4" />
                      SIGN IN WITH GOOGLE
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-[10px] md:text-[11px] font-black text-slate-600 uppercase tracking-widest mb-3 md:mb-4">Time & Duration</label>
                      <div className="grid grid-cols-2 gap-3 md:gap-4">
                        <div className="space-y-2">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Start</span>
                          <input
                            type="time"
                            value={selectedStartTime.toFormat("HH:mm")}
                            onChange={(e) => {
                              const [h, m] = e.target.value.split(":");
                              setSelectedStartTime(selectedStartTime.set({ hour: parseInt(h), minute: parseInt(m) }));
                            }}
                            className="w-full border-2 border-slate-300 rounded-xl md:rounded-2xl px-3 md:px-4 py-2 md:py-3 text-sm md:text-base font-black text-slate-900 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50 transition-all bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Duration</span>
                          <select
                            value={durationMinutes}
                            onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
                            className="w-full border-2 border-slate-300 rounded-xl md:rounded-2xl px-3 md:px-4 py-2 md:py-3 text-sm md:text-base font-black text-slate-900 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50 transition-all bg-white cursor-pointer"
                          >
                            <option value={30}>30 mins</option>
                            <option value={60}>1 hour</option>
                            <option value={90}>1.5 hours</option>
                            <option value={120}>2 hours</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] md:text-[11px] font-black text-slate-600 uppercase tracking-widest mb-3 md:mb-4">Child's Name</label>
                      <input
                        type="text"
                        value={childName}
                        onChange={(e) => setChildName(e.target.value)}
                        placeholder="Enter child's name..."
                        className="w-full border-2 border-slate-300 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-4 text-sm md:text-base font-black text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-50 outline-none bg-white transition-all"
                      />
                      {pastChildNames.length > 0 && (
                        <div className="mt-3 md:mt-5 flex flex-wrap gap-1.5 md:gap-2">
                          {pastChildNames.map(name => (
                            <button
                              key={name}
                              onClick={() => setChildName(name)}
                              className="text-[9px] md:text-[11px] font-black bg-white border-2 border-slate-200 text-slate-700 px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 transition-all shadow-sm"
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="pt-2 md:pt-4 space-y-3 md:space-y-4">
                  <button
                    onClick={handleBook}
                    disabled={bookingInProgress}
                    className="w-full bg-emerald-600 text-white font-black py-4 md:py-5 rounded-xl md:rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 disabled:opacity-50 flex items-center justify-center gap-3 text-base md:text-xl border-b-4 border-emerald-800 active:translate-y-1 active:border-b-0"
                  >
                    {bookingInProgress ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : (!user ? "SIGN IN TO BOOK" : "CONFIRM")}
                  </button>
                  <button
                    onClick={() => setSelectedStartTime(null)}
                    className="w-full text-slate-400 text-[9px] md:text-[10px] font-black hover:text-slate-900 py-1 md:py-2 uppercase tracking-[0.2em] transition-colors"
                  >
                    Cancel Selection
                  </button>
                </div>
             </div>
           </div>
        )}

        {/* Calendar Grid */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Day Selector (Mobile Only) */}
          {isMobile && (
            <div className="flex bg-white border-b-2 border-slate-200 p-2 gap-1 overflow-x-auto no-scrollbar">
               {weekDays.map((day, idx) => {
                 const isActive = focusedDayIdx === idx;
                 return (
                   <button
                    key={day.toISO()}
                    onClick={() => setFocusedDayIdx(idx)}
                    className={clsx(
                      "flex-shrink-0 flex flex-col items-center justify-center w-[13.5%] py-2 rounded-xl transition-all",
                      isActive ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-50"
                    )}
                   >
                     <span className="text-[10px] font-black uppercase tracking-tighter">{day.toFormat("ccc")}</span>
                     <span className="text-sm font-black">{day.day}</span>
                   </button>
                 );
               })}
            </div>
          )}

          {/* Table Headers (Desktop) */}
          {!isMobile && (
            <div className="grid grid-cols-[90px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b-2 border-slate-200 bg-white shadow-sm z-10 sticky top-0">
              <div className="border-r-2 border-slate-200" />
              {weekDays.map((day) => {
                const isToday = day.hasSame(now, "day");
                return (
                  <div key={day.toISO()} className="p-5 text-center border-r-2 border-slate-100 last:border-r-0">
                    <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3">{day.toFormat("ccc")}</div>
                    <div className={clsx(
                      "inline-flex items-center justify-center w-14 h-14 rounded-2xl text-2xl font-black transition-all",
                      isToday ? "bg-indigo-600 text-white shadow-xl shadow-indigo-200" : "text-slate-900"
                    )}>
                      {day.day}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-slate-100/30 relative">
            <div className={clsx(
              "relative",
              isMobile ? "grid grid-cols-[60px_1fr]" : "grid grid-cols-[90px_1fr_1fr_1fr_1fr_1fr_1fr_1fr]"
            )}>
              {/* "Now" indicator line */}
              {visibleDays.some(d => d.hasSame(now, "day")) && (
                <div
                  className={clsx(
                    "absolute right-0 z-40 flex items-center pointer-events-none",
                    isMobile ? "left-[60px]" : "left-[90px]"
                  )}
                  style={{
                    top: `${(now.hour * ROW_HEIGHT) + (now.minute / 60 * ROW_HEIGHT)}px`
                  }}
                >
                  <div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-red-500 rounded-full -ml-1 md:-ml-1.5 shadow-sm" />
                  <div className="flex-1 h-0.5 bg-red-500 shadow-sm" />
                </div>
              )}

              {HOURS.map((hour) => (
                <React.Fragment key={hour}>
                  <div className={clsx(
                    "border-r-2 border-slate-200 flex justify-center items-start pt-6 bg-white sticky left-0 z-20",
                    isMobile ? "h-24 px-1" : "h-24"
                  )}>
                    <span className="text-[10px] md:text-xs font-black text-slate-400 uppercase tabular-nums tracking-tighter">
                      {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
                    </span>
                  </div>

                  {visibleDays.map((day) => (
                    <div
                      key={`${day.toISO()}-${hour}`}
                      className="h-24 border-r border-b-2 border-slate-200/60 relative group"
                    >
                       {isAdmin && (
                         <button
                            onClick={() => handleAdminToggleSlot(day.set({ hour }))}
                            className="absolute inset-0 w-full h-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all bg-indigo-50/70 z-10"
                         >
                            <div className="bg-white border-2 border-indigo-500 text-indigo-700 text-[9px] md:text-[11px] font-black px-3 md:px-5 py-2 md:py-2.5 rounded-xl md:rounded-2xl shadow-2xl">
                              + OPEN SLOT
                            </div>
                         </button>
                       )}
                    </div>
                  ))}
                </React.Fragment>
              ))}

              {/* OVERLAY: Availability Blocks & Bookings */}
              <div className={clsx(
                "absolute inset-0 pointer-events-none",
                isMobile ? "left-[60px]" : "left-[90px]"
              )}>
                <div className={clsx(
                  "grid h-full w-full",
                  isMobile ? "grid-cols-1" : "grid-cols-7"
                )}>
                  {visibleDays.map((day) => {
                    const datePH = day.setZone("Asia/Manila").startOf("day");
                    const availabilityIntervals = getTutorAvailabilityIntervals(datePH, weekly, overrides);

                    return (
                      <div key={day.toISO()} className="relative h-full border-r border-slate-200/60">
                        {availabilityIntervals.map((interval, i) => {
                          const start = interval.start!.setZone(timezone);
                          const end = interval.end!.setZone(timezone);
                          if (!start.hasSame(day, "day")) return null;

                          const top = (start.hour * ROW_HEIGHT) + (start.minute / 60 * ROW_HEIGHT);
                          const height = interval.length("minutes") / 60 * ROW_HEIGHT;

                          // Fix: A slot is only "past" if it has completely finished
                          const isFullyPast = end < now;
                          const isOngoing = now >= start && now < end;

                          return (
                            <button
                              key={`avail-${i}`}
                              disabled={isAdmin || isFullyPast}
                              onClick={() => {
                                // If ongoing, suggest the next 15-min interval
                                if (isOngoing) {
                                  const roundedNow = now.plus({ minutes: 15 - (now.minute % 15) }).set({ second: 0, millisecond: 0 });
                                  setSelectedStartTime(roundedNow < end ? roundedNow : start);
                                } else {
                                  setSelectedStartTime(start);
                                }
                              }}
                              className={clsx(
                                "absolute left-1 right-1 rounded-xl md:rounded-2xl border-2 shadow-sm pointer-events-auto transition-all flex flex-col items-center justify-center text-center p-2",
                                isFullyPast ? "bg-slate-100 border-slate-200 opacity-40 cursor-not-allowed" : "bg-emerald-500 border-emerald-600 hover:bg-emerald-600 z-20"
                              )}
                              style={{ top: `${top}px`, height: `${height}px` }}
                            >
                               <span className="text-[8px] md:text-[10px] font-black uppercase text-emerald-100 tracking-widest mb-0.5">
                                 {isFullyPast ? "PAST" : "OPEN"}
                               </span>
                               <span className="text-[10px] md:text-sm font-black text-white tracking-tight leading-tight">
                                 {start.toFormat("h:mm")} - {end.toFormat("h:mm a")}
                               </span>
                            </button>
                          );
                        })}

                        {bookings.map((b, i) => {
                          const start = DateTime.fromJSDate(b.startTime).setZone(timezone);
                          const end = DateTime.fromJSDate(b.endTime).setZone(timezone);
                          if (!start.hasSame(day, "day")) return null;

                          const top = (start.hour * ROW_HEIGHT) + (start.minute / 60 * ROW_HEIGHT);
                          const height = (end.diff(start, "minutes").minutes / 60) * ROW_HEIGHT;
                          const isPast = start < DateTime.now();

                          return (
                            <div
                              key={`booking-${i}`}
                              className={clsx(
                                "absolute left-1 md:left-1.5 right-1 md:right-1.5 border-2 rounded-xl md:rounded-2xl p-2 md:p-4 border-l-4 md:border-l-[8px] flex flex-col justify-center items-center text-center overflow-hidden shadow-md z-30",
                                isAdmin ? "bg-indigo-50 border-indigo-200 border-l-indigo-600" : "bg-slate-100 border-slate-200 border-l-slate-400 opacity-60"
                              )}
                              style={{ top: `${top}px`, height: `${height}px` }}
                            >
                               <div className="flex justify-between items-start mb-0.5 md:mb-1 absolute top-2 left-2 right-2 md:top-3 md:left-3 md:right-3 pointer-events-none">
                                 <span className="text-[7px] md:text-[9px] font-black uppercase text-slate-500 tracking-widest">BOOKED</span>
                                 {isAdmin && !isPast && (
                                   <button
                                      className="text-slate-400 hover:text-red-600 transition-colors pointer-events-auto"
                                      onClick={() => handleDeleteBooking(b.id)}
                                   >
                                     <Trash2 className="w-3 md:w-3.5 h-3 md:h-3.5" />
                                   </button>
                                 )}
                               </div>
                               <span className="text-xs md:text-base font-black text-slate-900 truncate tracking-tight w-full px-2">{b.childName}</span>
                               <span className="text-[9px] md:text-[10px] font-black text-slate-400">
                                 {start.toFormat("h:mm")} - {end.toFormat("h:mm a")}
                               </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
