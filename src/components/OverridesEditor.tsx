"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, setDoc, doc, deleteDoc } from "firebase/firestore";
import { Override, TimeSlot } from "@/lib/availability";
import { Plus, Trash2, Calendar as CalendarIcon, Loader2 } from "lucide-react";

export default function OverridesEditor() {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState("");

  const fetchOverrides = async () => {
    setLoading(true);
    const q = collection(db, "availability_overrides");
    const snapshot = await getDocs(q);
    setOverrides(snapshot.docs.map(d => ({ date: d.id, ...d.data() } as Override)));
    setLoading(false);
  };

  useEffect(() => {
    fetchOverrides();
  }, []);

  const handleAddOverride = async () => {
    if (!newDate) return;
    const docRef = doc(db, "availability_overrides", newDate);
    await setDoc(docRef, { slots: [] }); // Start with empty (unavailable)
    setNewDate("");
    fetchOverrides();
  };

  const handleDelete = async (date: string) => {
    await deleteDoc(doc(db, "availability_overrides", date));
    fetchOverrides();
  };

  const handleUpdateSlots = async (date: string, slots: TimeSlot[] | null) => {
    await setDoc(doc(db, "availability_overrides", date), { slots });
    fetchOverrides();
  };

  const handleAddSlot = (date: string) => {
    const ov = overrides.find(o => o.date === date);
    if (!ov) return;
    const currentSlots = ov.slots || [];
    handleUpdateSlots(date, [...currentSlots, { start: "09:00", end: "10:00" }]);
  };

  if (loading) return null;

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">Date-Specific Overrides</h2>
      </div>

      <div className="flex gap-2">
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <button
          onClick={handleAddOverride}
          className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-900"
        >
          <Plus className="w-4 h-4" />
          Add Override
        </button>
      </div>

      <div className="space-y-4">
        {overrides.map((ov) => (
          <div key={ov.date} className="border border-slate-100 rounded-lg p-4 bg-slate-50/30">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2 font-medium text-slate-700">
                <CalendarIcon className="w-4 h-4 text-indigo-500" />
                {ov.date}
              </div>
              <button onClick={() => handleDelete(ov.date)} className="text-slate-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {ov.slots === null ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-500 font-medium">Fully Unavailable</span>
                  <button
                    onClick={() => handleUpdateSlots(ov.date, [])}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Change to custom slots
                  </button>
                </div>
              ) : (
                <>
                  {ov.slots.map((slot, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={slot.start}
                        onChange={(e) => {
                          const newSlots = [...ov.slots!];
                          newSlots[i].start = e.target.value;
                          handleUpdateSlots(ov.date, newSlots);
                        }}
                        className="text-xs border border-slate-200 rounded px-1.5 py-1"
                      />
                      <span className="text-slate-400 text-xs">to</span>
                      <input
                        type="time"
                        value={slot.end}
                        onChange={(e) => {
                          const newSlots = [...ov.slots!];
                          newSlots[i].end = e.target.value;
                          handleUpdateSlots(ov.date, newSlots);
                        }}
                        className="text-xs border border-slate-200 rounded px-1.5 py-1"
                      />
                      <button
                        onClick={() => {
                          const newSlots = ov.slots!.filter((_, idx) => idx !== i);
                          handleUpdateSlots(ov.date, newSlots);
                        }}
                        className="text-slate-300 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => handleAddSlot(ov.date)}
                      className="text-xs text-indigo-600 font-medium hover:underline"
                    >
                      + Add slot
                    </button>
                    <button
                      onClick={() => handleUpdateSlots(ov.date, null)}
                      className="text-xs text-red-600 font-medium hover:underline"
                    >
                      Mark as fully unavailable
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {overrides.length === 0 && (
          <p className="text-sm text-slate-400 italic">No overrides set. Following weekly schedule.</p>
        )}
      </div>
    </div>
  );
}
