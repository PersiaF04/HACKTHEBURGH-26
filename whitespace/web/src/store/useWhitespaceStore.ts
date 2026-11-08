import { create } from "zustand";
import type { FocusPoint } from "../api";

type WhitespaceState = {
  year: number;
  selectedConcepts: string[];
  focus: FocusPoint;
  openGap: string | null;
  setYear: (year: number) => void;
  selectConcept: (id: string) => void;
  setFocus: (focus: FocusPoint) => void;
  setOpenGap: (id: string | null) => void;
};

export const useWhitespaceStore = create<WhitespaceState>((set) => ({
  year: 2026,
  selectedConcepts: [],
  focus: null,
  openGap: null,
  setYear: (year) => set({ year }),
  selectConcept: (id) => set((state) => ({
    selectedConcepts: state.selectedConcepts.includes(id)
      ? state.selectedConcepts.filter((selected) => selected !== id)
      : [...state.selectedConcepts, id],
  })),
  setFocus: (focus) => set({ focus }),
  setOpenGap: (openGap) => set({ openGap }),
}));
