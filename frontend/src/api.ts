// API base URL
const API_BASE = 'http://localhost:8000/api/v1';

export interface Apartment {
  id: string;
  name: string;
  district: string;
  ward?: string;
  address: string;
  developer?: string;
  year?: number;
  total_units?: number;
  floors?: number;
  legal?: string;
  segment?: string;
  area_range_m2?: { min: number; max: number };
  km_q1?: number;
  balcony?: boolean | string;
  price_range?: string;
  price_furnished?: string;
  price_unfurnished?: string;
  management_fee?: number;
  parking_fee?: { motorbike?: number; car?: number };
  amenities?: string[];
  images?: string[];
  location: {
    lat: number;
    lng: number;
    accuracy?: string;
    google_maps?: string;
    place_id?: string;
  };
  verified?: boolean;
  updated_at?: string;
  listing_count: number;
}

export interface Listing {
  apartment_id: string;
  source: string;
  title: string;
  price?: string;
  area?: string;
  bedrooms?: string;
  link: string;
  date?: string;
  image?: string;
}

export interface Session {
  id: string;
  name: string;
  geometry?: any;
  selected_ids: string[];
  filter_state: Record<string, any>;
  crawl_config: Record<string, any>;
  status: 'idle' | 'running' | 'error';
  last_crawl?: string;
  listing_count?: number;
  created_at: string;
  updated_at?: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  apartment_count: number;
  listing_count: number;
  last_crawl?: string;
  status: 'idle' | 'running' | 'error';
  created_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: { page: number; page_size: number; total: number };
}

async function req<T>(method: string, path: string, body?: any): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Apartments
  searchApartments: (geometry?: any, filters?: any) =>
    req<Apartment[]>('POST', '/apartments/search', { geometry, filters }),

  getApartment: (id: string) =>
    req<Apartment>('GET', `/apartments/${id}`),

  getListings: (apartmentId: string, params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    ).toString();
    return req<Listing[]>('GET', `/apartments/${apartmentId}/listings${qs ? '?' + qs : ''}`);
  },

  // Sessions
  listSessions: () =>
    req<SessionSummary[]>('GET', '/sessions'),

  createSession: (body: { name: string; geometry?: any; selected_ids?: string[]; filter_state?: Record<string, any> }) =>
    req<Session>('POST', '/sessions', body),

  getSession: (id: string) =>
    req<Session>('GET', `/sessions/${id}`),

  updateSession: (id: string, body: Partial<Session>) =>
    req<Session>('PATCH', `/sessions/${id}`, body),

  deleteSession: (id: string) =>
    req<{ deleted: string }>('DELETE', `/sessions/${id}`),

  triggerCrawl: (sessionId: string) =>
    req<{ job_id: string }>('POST', `/sessions/${sessionId}/crawl`),

  stopCrawl: (sessionId: string) =>
    req<{ success: boolean; session_id: string }>('POST', `/sessions/${sessionId}/crawl/stop`),

  getSessionFeed: (sessionId: string, params: { page?: number; page_size?: number; sort?: string; source?: string } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    ).toString();
    return req<FeedListing[]>('GET', `/sessions/${sessionId}/feed${qs ? '?' + qs : ''}`);
  },
};

export interface FeedListing extends Listing {
  apartment_name: string;
  district: string;
}
