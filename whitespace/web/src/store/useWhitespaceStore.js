import { create } from "zustand";
export const useWhitespaceStore = create((set) => ({
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
