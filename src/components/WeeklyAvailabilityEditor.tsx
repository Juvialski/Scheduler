"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { WeeklyAvailability, TimeSlot } from "@/lib/availability";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function WeeklyAvailabilityEditor() {
  const [availability, setAvailability] = useState<WeeklyAvailability>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const docRef = doc(db, "settings", "tutor_availability");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setAvailability(docSnap.data() as WeeklyAvailability);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleAddSlot = (day: string) => {
    const newSlot: TimeSlot = { start: "09:00", end: "10:00" };
    setAvailability(prev => ({
      ...prev,
      [day]: [...(prev[day] || []), newSlot]
    }));
  };

  const handleRemoveSlot = (day: string, index: number) => {
    setAvailability(prev => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== index)
    }));
  };

  const handleUpdateSlot = (day: string, index: number, field: keyof TimeSlot, value: string) => {
    setAvailability(prev => ({
      ...prev,
      [day]: prev[day].map((slot, i) => i === index ? { ...slot, [field]: value } : slot)
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "tutor_availability"), availability);
      alert("Availability saved!");
    } catch (error) {
      console.error("Save error", error);
      alert("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-800">Recurring Weekly Availability</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </div>

      <div className="grid gap-4">
        {DAYS.map(day => (
          <div key={day} className="border-b border-slate-100 pb-4 last:border-0">
            <div className="flex justify-between items-center mb-2">
              <span className="capitalize font-medium text-slate-700">{day}</span>
              <button
                onClick={() => handleAddSlot(day)}
                className="text-indigo-600 hover:text-indigo-700 p-1 rounded-full hover:bg-indigo-50"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {(availability[day] || []).map((slot, index) => (
                <div key={index} className="flex items-center gap-3">
                  <input
                    type="time"
                    value={slot.start}
                    onChange={(e) => handleUpdateSlot(day, index, "start", e.target.value)}
                    className="border border-slate-200 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <span className="text-slate-400">to</span>
                  <input
                    type="time"
                    value={slot.end}
                    onChange={(e) => handleUpdateSlot(day, index, "end", e.target.value)}
                    className="border border-slate-200 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <button
                    onClick={() => handleRemoveSlot(day, index)}
                    className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {(!availability[day] || availability[day].length === 0) && (
                <p className="text-sm text-slate-400 italic">No slots defined (Unavailable)</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
