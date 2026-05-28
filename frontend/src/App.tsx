import React, { useEffect, useState, useCallback, useRef } from 'react';
import { TopBar } from './components/TopBar';
import { FilterPanel } from './components/FilterPanel';
import { ApartmentList } from './components/ApartmentList';
import { ApartmentDrawer } from './components/ApartmentDrawer';
import { SessionModal } from './components/SessionModal';
import { MapView } from './components/MapView';
import { CrawlLogPanel } from './components/CrawlLogPanel';
import { Toast } from './components/Toast';
import { useStore } from './store';
import { api } from './api';
import type { SessionSummary } from './api';
import { SessionFeedModal } from './components/SessionFeedModal';
import { Icons } from './components/Icons';

export default function App() {
  const {
    setApartments,
    setCurrentPolygon,
    currentPolygon,
    showSessionModal,
    currentSession,
    selectedIds,
    setCurrentSession,
    showToast,
    sessions,
    loadSessions,
  } = useStore();

  const [clearTrigger, setClearTrigger] = useState(0);
  const [activeFeedSession, setActiveFeedSession] = useState<SessionSummary | null>(null);

  // When polygon changes, search apartments
  const searchApartments = useCallback(async (polygon: any, autoSelectAll = false) => {
    try {
      const r = await api.searchApartments(polygon);
      setApartments(r.data);
      if (autoSelectAll) {
        useStore.setState({ selectedIds: new Set(r.data.map(a => a.id)) });
      }
    } catch (e) {
      console.error('Search failed', e);
    }
  }, [setApartments]);

  // 1. Initial sessions load
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // 2. Smart background polling: if any session in list has status 'running', poll every 5s
  useEffect(() => {
    const hasRunning = sessions.some(s => s.status === 'running');
    if (!hasRunning) return;

    const interval = setInterval(() => {
      loadSessions();
    }, 5000);

    return () => clearInterval(interval);
  }, [sessions, loadSessions]);

  // Keep track of the last session ID to clear logs if session changes
  const prevSessionIdRef = useRef<string | null>(null);

  // 3. Centralized EventSource SSE connection management for current session
  useEffect(() => {
    const { setCrawlStatus, clearCrawlLogs, setCrawlProgress, addCrawlLog, currentJobId, setCurrentJobId } = useStore.getState();

    if (!currentSession) {
      setCrawlStatus('idle');
      clearCrawlLogs();
      setCrawlProgress(null);
      prevSessionIdRef.current = null;
      return;
    }

    // Clear logs only if we switch to a different session
    if (prevSessionIdRef.current !== currentSession.id) {
      clearCrawlLogs();
      setCrawlProgress(null);
      prevSessionIdRef.current = currentSession.id;
    }

    // Set crawl status to match session's current status
    setCrawlStatus(currentSession.status);

    if (currentSession.status === 'running') {
      // Đọc currentJobId từ store (set bởi TopBar/SessionModal khi trigger crawl)
      const jobId = useStore.getState().currentJobId;
      const jobParam = jobId ? `?job_id=${jobId}` : '';
      
      const eventSource = new EventSource(
        `http://localhost:8000/api/v1/sessions/${currentSession.id}/crawl/stream${jobParam}`
      );

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'progress') {
            setCrawlProgress({
              current: data.current,
              total: data.total,
              message: data.message,
            });
            addCrawlLog(data.message);
          } else if (data.type === 'done') {
            addCrawlLog(data.message);
            setCrawlStatus('idle');
            setCurrentJobId(null);
            // Refresh sessions list
            loadSessions();
            // Refresh current session detail
            api.getSession(currentSession.id).then(r => {
              const state = useStore.getState();
              if (state.currentSession?.id === currentSession.id) {
                // Cập nhật in-place, không reset polygon/selectedIds
                useStore.setState({
                  currentSession: { ...state.currentSession, ...r.data, status: 'idle' as const },
                });
              }
            });
            // Reload apartments in active polygon
            searchApartments(currentPolygon);
            eventSource.close();
          } else if (data.type === 'error') {
            addCrawlLog(data.message);
            setCrawlStatus('error');
            setCurrentJobId(null);
            loadSessions();
            eventSource.close();
          } else {
            addCrawlLog(data.message);
          }
        } catch (err) {
          console.error('SSE parse error:', err);
        }
      };

      eventSource.onerror = () => {
        addCrawlLog('🚨 Mất kết nối tới máy chủ cào hoặc tiến trình bị gián đoạn.');
        setCrawlStatus('error');
        setCurrentJobId(null);
        eventSource.close();
      };

      return () => {
        eventSource.close();
      };
    }
  }, [currentSession?.id, currentSession?.status, loadSessions, searchApartments, currentPolygon]);

  // Initial load — show all apartments without polygon
  useEffect(() => {
    searchApartments(null);
  }, []);

  // Track last loaded session ID to avoid double-fetching during manual draws
  const lastLoadedSessionIdRef = useRef<string | null>(null);

  // Synchronize apartments when loading another session
  useEffect(() => {
    const sessionId = currentSession ? currentSession.id : null;
    if (sessionId !== lastLoadedSessionIdRef.current) {
      lastLoadedSessionIdRef.current = sessionId;
      searchApartments(currentPolygon, false);
    }
  }, [currentPolygon, currentSession, searchApartments]);

  const handlePolygonDrawn = useCallback((geoJson: any, isUserAction = false) => {
    setCurrentPolygon(geoJson);
    searchApartments(geoJson, true);
    if (isUserAction && useStore.getState().currentSession) {
      setCurrentSession(null);
    }
  }, [searchApartments, setCurrentPolygon, setCurrentSession]);

  const handleClearPolygon = useCallback(() => {
    setClearTrigger((n: number) => n + 1);
    setCurrentPolygon(null);
    useStore.getState().deselectAll();
  }, []);

  const handleNewSession = useCallback(() => {
    setCurrentSession(null);
    handleClearPolygon();
  }, [setCurrentSession, handleClearPolygon]);

  const handleSaveSession = useCallback(async () => {
    if (currentSession) {
      // Update existing session
      await api.updateSession(currentSession.id, {
        geometry: currentPolygon,
        selected_ids: Array.from(selectedIds),
        filter_state: { shapeType: useStore.getState().currentShapeType },
      });
      loadSessions();
      showToast(`Crawler "${currentSession.name}" đã được lưu!`, 'success');
    } else {
      // Prompt create
      useStore.getState().setShowSessionModal(true);
    }
  }, [currentSession, currentPolygon, selectedIds, showToast, loadSessions]);

  return (
    <div className="app-layout">
      <TopBar
        onNewSession={handleNewSession}
        onSaveSession={handleSaveSession}
        onCrawlDone={() => searchApartments(currentPolygon)}
        onOpenFeed={() => currentSession && setActiveFeedSession({
          id: currentSession.id,
          name: currentSession.name,
          status: currentSession.status,
          apartment_count: currentSession.selected_ids?.length ?? 0,
          listing_count: currentSession.listing_count ?? 0,
          last_crawl: currentSession.last_crawl,
          created_at: currentSession.created_at,
        })}
      />

      <div className="app-body">
        {/* Map */}
        <div className="map-container">
          <MapView
            onPolygonDrawn={handlePolygonDrawn}
            clearTrigger={clearTrigger}
          />

          {/* Map toolbar hint */}
          <div className="map-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icons.Edit size={12} />
            <span>Dùng công cụ Draw (góc trái bản đồ) để vẽ vùng tìm kiếm</span>
          </div>

          {/* Crawl dynamic logs panel */}
          <CrawlLogPanel />
        </div>

        {/* Right panel */}
        <div className="right-panel">
          <FilterPanel />
          <ApartmentList />
        </div>
      </div>

      {/* Apartment detail drawer */}
      <ApartmentDrawer />

      {/* Session modal */}
      {showSessionModal && (
        <SessionModal sessions={sessions} onRefresh={loadSessions} />
      )}

      {/* Toast notifications */}
      <Toast />

      {/* Main Feed Modal */}
      {activeFeedSession && (
        <SessionFeedModal
          session={activeFeedSession}
          onClose={() => setActiveFeedSession(null)}
        />
      )}
    </div>
  );
}
