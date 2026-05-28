import { create } from 'zustand';
import { api } from './api';
import type { Apartment, Session, SessionSummary } from './api';

interface Filters {
  districts: string[];   // ['Q.7', 'Q.8', 'Q.6']
  yearMin: number;
  yearMax: number;
  kmMax: number;
  balcony: 'all' | 'yes' | 'no';
}

interface AppState {
  // Apartments in current polygon/view
  apartments: Apartment[];
  setApartments: (apts: Apartment[]) => void;

  // Selection
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;

  // Filters
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;

  // Active apartment (drawer)
  activeApartmentId: string | null;
  setActiveApartment: (id: string | null) => void;

  // Current polygon GeoJSON
  currentPolygon: any | null;
  setCurrentPolygon: (geo: any) => void;

  // Kiểu hình vẽ hiện tại
  currentShapeType: 'rectangle' | 'circle' | 'polygon' | null;
  setCurrentShapeType: (type: 'rectangle' | 'circle' | 'polygon' | null) => void;

  // Current session
  currentSession: Session | null;
  setCurrentSession: (s: Session | null) => void;

  // UI state
  isDrawing: boolean;
  setIsDrawing: (v: boolean) => void;

  crawlStatus: 'idle' | 'running' | 'error';
  setCrawlStatus: (s: 'idle' | 'running' | 'error') => void;

  currentJobId: string | null;
  setCurrentJobId: (id: string | null) => void;

  crawlLogs: string[];
  addCrawlLog: (log: string) => void;
  clearCrawlLogs: () => void;

  crawlProgress: { current: number; total: number; message: string } | null;
  setCrawlProgress: (p: { current: number; total: number; message: string } | null) => void;

  showSessionModal: boolean;
  setShowSessionModal: (v: boolean) => void;

  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;

  sessions: SessionSummary[];
  setSessions: (sessions: SessionSummary[]) => void;
  loadSessions: () => Promise<void>;
}

const DEFAULT_FILTERS: Filters = {
  districts: [],
  yearMin: 2010,
  yearMax: 2025,
  kmMax: 12,
  balcony: 'all',
};

export const useStore = create<AppState>((set) => ({
  apartments: [],
  setApartments: (apartments) => set({ apartments }),

  selectedIds: new Set(),
  toggleSelect: (id) => set((s) => {
    const next = new Set(s.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selectedIds: next };
  }),
  selectAll: () => set((s) => ({ selectedIds: new Set(s.apartments.map(a => a.id)) })),
  deselectAll: () => set({ selectedIds: new Set() }),

  filters: DEFAULT_FILTERS,
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),

  activeApartmentId: null,
  setActiveApartment: (id) => set({ activeApartmentId: id }),

  currentPolygon: null,
  setCurrentPolygon: (geo) => set({ currentPolygon: geo }),

  currentShapeType: null,
  setCurrentShapeType: (type) => set({ currentShapeType: type }),

  currentSession: null,
  setCurrentSession: (s) => set(() => {
    if (!s) {
      return {
        currentSession: null,
        currentPolygon: null,
        selectedIds: new Set(),
        currentShapeType: null
      };
    }
    const shapeType = s.filter_state?.shapeType || null;
    return {
      currentSession: s,
      currentPolygon: s.geometry || null,
      selectedIds: new Set(s.selected_ids || []),
      currentShapeType: shapeType
    };
  }),

  isDrawing: false,
  setIsDrawing: (v) => set({ isDrawing: v }),

  crawlStatus: 'idle',
  setCrawlStatus: (s) => set({ crawlStatus: s }),

  currentJobId: null,
  setCurrentJobId: (id) => set({ currentJobId: id }),

  crawlLogs: [],
  addCrawlLog: (log) => set((s) => ({ crawlLogs: [...s.crawlLogs, log] })),
  clearCrawlLogs: () => set({ crawlLogs: [] }),

  crawlProgress: null,
  setCrawlProgress: (p) => set({ crawlProgress: p }),

  showSessionModal: false,
  setShowSessionModal: (v) => set({ showSessionModal: v }),

  toast: null,
  showToast: (message, type = 'info') => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 3000);
  },

  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  loadSessions: async () => {
    try {
      const r = await api.listSessions();
      set({ sessions: r.data });
      
      // Chỉ cập nhật status của currentSession in-place,
      // KHÔNG gọi setCurrentSession vì nó reset polygon/selectedIds/shapeType
      // và re-trigger SSE useEffect.
      const current = useStore.getState().currentSession;
      if (current) {
        const matching = r.data.find(s => s.id === current.id);
        if (matching && matching.status !== current.status) {
          set((state) => ({
            currentSession: state.currentSession
              ? { ...state.currentSession, status: matching.status }
              : null,
          }));
        }
      }
    } catch (e) {
      console.error('Failed to load sessions', e);
    }
  },
}));

// Derived: filtered apartments
export function useFilteredApartments() {
  const { apartments, filters } = useStore();
  return apartments.filter(apt => {
    if (filters.districts.length > 0 && !filters.districts.includes(apt.district)) return false;
    if (apt.year && (apt.year < filters.yearMin || apt.year > filters.yearMax)) return false;
    if (apt.km_q1 && apt.km_q1 > filters.kmMax) return false;
    if (filters.balcony === 'yes' && apt.balcony !== true) return false;
    if (filters.balcony === 'no' && apt.balcony === true) return false;
    return true;
  });
}
