"use client";

import { useAuth } from "@/context/AuthContext";
import { useTimezone } from "@/context/TimezoneContext";
import { LogIn, LogOut, Globe } from "lucide-react";

export default function Navbar() {
  const { user, signIn, logout, isAdmin } = useAuth();
  const { toggleTimezone, timezoneLabel } = useTimezone();

  return (
    <nav className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xl text-indigo-600">TutorScheduler</span>
          {isAdmin && (
            <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-medium">
              Admin
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleTimezone}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
          >
            <Globe className="w-4 h-4" />
            {timezoneLabel}
          </button>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-sm font-medium text-slate-900 leading-none">
                  {user.displayName}
                </span>
                <span className="text-xs text-slate-500">{user.email}</span>
              </div>
              <button
                onClick={logout}
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Log out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              onClick={signIn}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Sign in with Google
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
