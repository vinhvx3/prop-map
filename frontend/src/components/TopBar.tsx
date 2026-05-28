import React from 'react';
import { useStore } from '../store';

interface TopBarProps {
  onNewSession: () => void;
  onSaveSession: () => void;
  onCrawlDone: () => void;
}

export function TopBar({ onNewSession, onSaveSession, onCrawlDone }: TopBarProps) {
  const { currentSession, selectedIds, apartments, crawlStatus, setCrawlStatus, setShowSessionModal, sessions, loadSessions, setCurrentSession } = useStore();

  const handleCrawl = async () => {
    const { api } = await import('../api');
    const { addCrawlLog, clearCrawlLogs, setCrawlProgress, setCrawlStatus, setCurrentSession, showToast, currentPolygon, currentShapeType } = useStore.getState();

    let session = currentSession;
    if (!session) {
      if (selectedIds.size === 0) {
        showToast('Vui lòng chọn ít nhất một chung cư hoặc vẽ vùng để cào dữ liệu', 'error');
        return;
      }
      const dateStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const name = `Crawler - ${selectedIds.size} CC (${dateStr})`;
      try {
        const res = await api.createSession({
          name,
          geometry: currentPolygon,
          selected_ids: Array.from(selectedIds),
          filter_state: { shapeType: currentShapeType },
        });
        session = res.data;
        setCurrentSession(session);
        showToast(`Đã tự động tạo ${name}!`, 'success');
        await loadSessions();
      } catch (e) {
        showToast('Không thể tự động tạo Crawler', 'error');
        return;
      }
    }

    setCrawlStatus('running');
    clearCrawlLogs();
    setCrawlProgress(null);

    try {
      const crawlRes = await api.triggerCrawl(session.id);
      const jobId = crawlRes.data.job_id;
      
      // Lưu job_id vào store để SSE URL có thể truyền lên backend
      const { setCurrentJobId } = useStore.getState();
      setCurrentJobId(jobId);
      
      // Update session status in store to run SSE effect in App
      const updatedSession = { ...session, status: 'running' as const };
      setCurrentSession(updatedSession);
      
      // Refresh global session list so status updates globally
      await loadSessions();
    } catch (err) {
      setCrawlStatus('error');
      showToast('Không thể bắt đầu tiến trình cào dữ liệu', 'error');
    }
  };

  const handleStopCrawl = async () => {
    if (!currentSession) return;
    const { api } = await import('../api');
    const { showToast } = useStore.getState();
    try {
      await api.stopCrawl(currentSession.id);
      showToast('Đang gửi lệnh dừng cào dữ liệu...', 'info');
      await loadSessions();
    } catch (e) {
      showToast('Không thể dừng tiến trình cào dữ liệu', 'error');
    }
  };

  const runningBackgroundSessions = sessions.filter(
    (s) => s.status === 'running' && s.id !== currentSession?.id
  );

  return (
    <div className="topbar">
      <div className="topbar-logo">
        <div className="topbar-logo-icon">🗺</div>
        <span>PropMap</span>
      </div>

      <div className="topbar-divider" />

      <button
        id="session-selector"
        className="topbar-session-select"
        onClick={() => setShowSessionModal(true)}
        title="Danh sách Crawler"
      >
        <span>📂</span>
        <span style={{ flex: 1 }}>{currentSession?.name ?? 'Chọn Crawler...'}</span>
        <span style={{ opacity: 0.5, fontSize: 10 }}>▼</span>
      </button>

      <div className="topbar-spacer" />

      <div className="topbar-stats">
        {runningBackgroundSessions.length > 0 && (
          <div
            className="stat-chip bg-crawling-pulse"
            title={`Có ${runningBackgroundSessions.length} Crawler khác đang cào ngầm`}
            onClick={() => setShowSessionModal(true)}
            style={{
              cursor: 'pointer',
              borderColor: 'var(--color-warning)',
              background: 'var(--color-warning-dim)',
            }}
          >
            <div className="stat-chip-dot pulse-warning-dot" style={{ background: 'var(--color-warning)' }} />
            <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
              {runningBackgroundSessions.length} chạy ngầm
            </span>
          </div>
        )}

        <div className={`stat-chip ${apartments.length > 0 ? 'selected' : ''}`}>
          <div className="stat-chip-dot" />
          {apartments.length} CC trong vùng
        </div>

        {selectedIds.size > 0 && (
          <div className="stat-chip selected" id="selected-count">
            <div className="stat-chip-dot" style={{ background: 'var(--color-accent)' }} />
            {selectedIds.size} đã chọn
          </div>
        )}

        <div className="stat-chip">
          <div className={`status-dot ${crawlStatus}`} />
          {crawlStatus === 'running' ? 'Đang crawl...' : crawlStatus === 'error' ? 'Lỗi cào' : 'Sẵn sàng'}
        </div>
      </div>

      <div className="topbar-divider" />

      <button className="topbar-btn" id="btn-save-session" onClick={onSaveSession} title="Lưu Crawler hiện tại">
        💾 Lưu
      </button>

      {crawlStatus === 'running' && currentSession ? (
        <button
          id="btn-stop-crawl"
          className="topbar-btn danger"
          onClick={handleStopCrawl}
          title="Dừng tiến trình cào hiện tại"
        >
          🛑 Stop Crawl
        </button>
      ) : (
        <button
          id="btn-crawl-now"
          className="topbar-btn primary"
          onClick={handleCrawl}
          disabled={!currentSession && selectedIds.size === 0}
          title={(!currentSession && selectedIds.size === 0) ? "Vui lòng vẽ vùng bản đồ hoặc chọn chung cư để bắt đầu cào" : "Bắt đầu cào dữ liệu cho chung cư đã chọn"}
          style={{
            opacity: (!currentSession && selectedIds.size === 0) ? 0.5 : 1,
            cursor: (!currentSession && selectedIds.size === 0) ? 'not-allowed' : 'pointer'
          }}
        >
          ⚡ Start Crawl
        </button>
      )}

      <button className="topbar-btn" id="btn-new-session" onClick={onNewSession}>
        + Crawler mới
      </button>
    </div>
  );
}
