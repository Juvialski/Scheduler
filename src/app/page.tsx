"use client";

import { useAuth } from "@/context/AuthContext";
import Calendar from "@/components/Calendar";
import WeeklyAvailabilityEditor from "@/components/WeeklyAvailabilityEditor";
import AdminBookings from "@/components/AdminBookings";
import OverridesEditor from "@/components/OverridesEditor";
import { useState } from "react";
import { Settings, Calendar as CalendarIcon } from "lucide-react";
import { clsx } from "clsx";

export default function Home() {
  const { isAdmin, user } = useAuth();
  const [view, setView] = useState<"calendar" | "settings">("calendar");

  return (
    <div className="space-y-8">
      {isAdmin && (
        <div className="flex justify-center">
          <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex gap-1">
            <button
              onClick={() => setView("calendar")}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                view === "calendar" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <CalendarIcon className="w-4 h-4" />
              Calendar View
            </button>
            <button
              onClick={() => setView("settings")}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                view === "settings" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <Settings className="w-4 h-4" />
              Availability Settings
            </button>
          </div>
        </div>
      )}

      {view === "settings" && isAdmin ? (
        <div className="space-y-8">
          <WeeklyAvailabilityEditor />
          <OverridesEditor />
          <AdminBookings />
        </div>
      ) : (
        <Calendar />
      )}

      {!user && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 text-center">
          <h3 className="text-indigo-900 font-semibold mb-2">Ready to book a session?</h3>
          <p className="text-indigo-700 text-sm mb-4">Sign in with your Google account to secure your preferred schedule.</p>
        </div>
      )}
    </div>
  );
}
