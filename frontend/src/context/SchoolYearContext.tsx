"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface SchoolYearContextType {
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  availableYears: number[];
}

const SchoolYearContext = createContext<SchoolYearContextType | undefined>(undefined);

export function SchoolYearProvider({ children }: { children: React.ReactNode }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYearState] = useState<number>(currentYear);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("simce_selected_year");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 2020 && parsed <= 2040) {
          setSelectedYearState(parsed);
          return;
        }
      }
    } catch {
      // ignore localStorage errors
    }
    setSelectedYearState(currentYear);
  }, [currentYear]);

  const setSelectedYear = (year: number) => {
    setSelectedYearState(year);
    try {
      localStorage.setItem("simce_selected_year", String(year));
    } catch {
      // ignore localStorage errors
    }
  };

  const availableYears = [
    currentYear - 2,
    currentYear - 1,
    currentYear,
    currentYear + 1,
    currentYear + 2,
  ];

  return (
    <SchoolYearContext.Provider value={{ selectedYear, setSelectedYear, availableYears }}>
      {children}
    </SchoolYearContext.Provider>
  );
}

export function useSchoolYear() {
  const ctx = useContext(SchoolYearContext);
  if (!ctx) {
    const defaultYear = new Date().getFullYear();
    return {
      selectedYear: defaultYear,
      setSelectedYear: () => {},
      availableYears: [defaultYear - 1, defaultYear, defaultYear + 1],
    };
  }
  return ctx;
}
