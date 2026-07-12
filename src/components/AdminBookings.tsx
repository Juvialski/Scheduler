"use client";

import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, getDocs, deleteDoc, doc } from "firebase/firestore";
import { DateTime } from "luxon";
import { Trash2, User, Clock, Baby } from "lucide-react";

export default function AdminBookings() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = async () => {
    setLoading(true);
    const q = query(collection(db, "bookings"), orderBy("startTime", "asc"));
    const snapshot = await getDocs(q);
    setBookings(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm("Cancel this booking?")) {
      await deleteDoc(doc(db, "bookings", id));
      fetchBookings();
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading bookings...</div>;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50">
        <h2 className="font-semibold text-slate-800">All Scheduled Sessions</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {bookings.map((b) => {
          const start = DateTime.fromJSDate(b.startTime.toDate()).setZone("Asia/Manila");
          return (
            <div key={b.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-indigo-500" />
                  <div>
                    <div className="font-medium text-slate-900">{start.toFormat("ccc, LLL d")}</div>
                    <div className="text-slate-500">{start.toFormat("h:mm a")} (PH)</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Baby className="w-4 h-4 text-pink-500" />
                  <div>
                    <div className="font-medium text-slate-900">{b.childName}</div>
                    <div className="text-slate-500 text-xs">Child</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-slate-400" />
                  <div>
                    <div className="font-medium text-slate-900 text-xs sm:text-sm truncate max-w-[120px]">{b.clientName}</div>
                    <div className="text-slate-500 text-[10px] truncate max-w-[120px]">{b.clientEmail}</div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(b.id)}
                className="ml-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
        {bookings.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm italic">
            No bookings found.
          </div>
        )}
      </div>
    </div>
  );
}
