"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type Timezone = "Asia/Manila" | "America/Los_Angeles";

interface TimezoneContextType {
  timezone: Timezone;
  toggleTimezone: () => void;
  timezoneLabel: string;
}

const TimezoneContext = createContext<TimezoneContextType | undefined>(undefined);

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [timezone, setTimezone] = useState<Timezone>("Asia/Manila");

  // Load preference from localStorage if available
  useEffect(() => {
    const saved = localStorage.getItem("app-timezone") as Timezone;
    if (saved && (saved === "Asia/Manila" || saved === "America/Los_Angeles")) {
      setTimezone(saved);
    }
  }, []);

  const toggleTimezone = () => {
    const newTz = timezone === "Asia/Manila" ? "America/Los_Angeles" : "Asia/Manila";
    setTimezone(newTz);
    localStorage.setItem("app-timezone", newTz);
  };

  const timezoneLabel = timezone === "Asia/Manila" ? "PH Time" : "PST/PDT";

  return (
    <TimezoneContext.Provider value={{ timezone, toggleTimezone, timezoneLabel }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export const useTimezone = () => {
  const context = useContext(TimezoneContext);
  if (context === undefined) {
    throw new Error("useTimezone must be used within a TimezoneProvider");
  }
  return context;
};
