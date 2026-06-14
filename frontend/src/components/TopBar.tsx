import React, { useState } from 'react';
import { useStore } from '../store';
import { Icons } from './Icons';

interface TopBarProps {
  onNewSession: () => void;
  onSaveSession: () => void;
  onCrawlDone: () => void;
  onOpenFeed: () => void;
}

export function TopBar({ onNewSession, onSaveSession, onCrawlDone, onOpenFeed }: TopBarProps) {
  const { currentSession, selectedIds, apartments, crawlStatus, setCrawlStatus, setShowSessionModal, sessions, loadSessions, setCurrentSession } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState('');

  const handleRename = async () => {
    if (!currentSession || !editingName.trim()) return;
    const { api } = await import('../api');
    const { showToast } = useStore.getState();
    try {
      await api.updateSession(currentSession.id, { name: editingName.trim() });
      setCurrentSession({ ...currentSession, name: editingName.trim() });
      setIsEditing(false);
      showToast('Đã đổi tên Crawler thành công!', 'success');
      await loadSessions();
    } catch (e) {
      showToast('Đổi tên thất bại', 'error');
    }
  };

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
    const { showToast, setCrawlStatus, setCurrentJobId, setCurrentSession } = useStore.getState();
    try {
      await api.stopCrawl(currentSession.id);
      
      // Ngắt kết nối SSE và reset log panel lập tức ở frontend
      setCrawlStatus('idle');
      setCurrentJobId(null);
      
      const r = await api.getSession(currentSession.id);
      setCurrentSession({ ...r.data, status: 'idle' as const });

      showToast('Đã dừng tiến trình cào dữ liệu!', 'info');
      await loadSessions();
    } catch (e) {
      showToast('Không thể dừng tiến trình cào dữ liệu', 'error');
    }
  };

  const runningBackgroundSessions = sessions.filter(
    (s) => s.status === 'running' && s.id !== currentSession?.id
  );

  const matchedSessionSummary = sessions.find((s) => s.id === currentSession?.id);
  const displayListingCount = matchedSessionSummary ? matchedSessionSummary.listing_count : (currentSession?.listing_count ?? 0);

  return (
    <div className="topbar">
      <div className="topbar-logo">
        <div className="topbar-logo-icon">
          <Icons.Map size={16} color="white" />
        </div>
        <span>PropMap</span>
      </div>

      <div className="topbar-divider" />

      {currentSession ? (
        <div
          id="session-selector"
          className="topbar-session-select active"
          style={{
            borderColor: 'var(--color-accent)',
            background: 'rgba(59, 130, 246, 0.12)',
            boxShadow: '0 0 8px rgba(59, 130, 246, 0.25)',
            color: 'var(--color-accent-hover)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--color-accent)',
            fontSize: '13px',
            minWidth: '220px',
            position: 'relative',
          }}
        >
          <span className="stat-chip-dot" style={{ background: 'var(--color-success)', marginRight: 0 }} />
          {isEditing ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }} onClick={e => e.stopPropagation()}>
              <input
                type="text"
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid var(--color-accent)',
                  color: '#fff',
                  fontSize: '13px',
                  padding: '0 2px',
                  width: '120px',
                  outline: 'none',
                }}
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter') await handleRename();
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                autoFocus
              />
              <button
                className="icon-btn"
                style={{ color: 'var(--color-success)', padding: '2px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onClick={handleRename}
                title="Lưu"
              >
                <Icons.Check size={12} />
              </button>
              <button
                className="icon-btn"
                style={{ color: 'var(--color-text-secondary)', padding: '2px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                onClick={() => setIsEditing(false)}
                title="Hủy"
              >
                <Icons.X size={12} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <span
                style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', cursor: 'pointer' }}
                title="Nhấp đúp hoặc click nút bút chì để đổi tên"
                onDoubleClick={() => {
                  setIsEditing(true);
                  setEditingName(currentSession.name);
                }}
                onClick={() => setShowSessionModal(true)}
              >
                {currentSession.name}
              </span>
              <button
                className="icon-btn edit-name-btn"
                style={{
                  opacity: 0.5,
                  padding: '2px',
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                  setEditingName(currentSession.name);
                }}
                title="Đổi tên"
              >
                <Icons.Edit size={12} />
              </button>
            </div>
          )}
          <span
            style={{ opacity: 0.6, cursor: 'pointer', paddingLeft: 4, display: 'flex', alignItems: 'center' }}
            onClick={() => setShowSessionModal(true)}
            title="Mở danh sách Crawler"
          >
            <Icons.ChevronDown size={11} />
          </span>
          {matchedSessionSummary?.apartment_names && matchedSessionSummary.apartment_names.length > 0 && (
            <div className="topbar-session-tooltip">
              <ul style={{ margin: 0, paddingLeft: 12, listStyleType: 'disc', color: 'var(--color-text-secondary)' }}>
                {matchedSessionSummary.apartment_names.slice(0, 8).map((name, idx) => (
                  <li key={idx} className="tooltip-item">{name}</li>
                ))}
                {matchedSessionSummary.apartment_names.length > 8 && (
                  <li style={{ listStyleType: 'none', marginLeft: -12, opacity: 0.5, fontStyle: 'italic', marginTop: 2 }}>
                    ... và {matchedSessionSummary.apartment_names.length - 8} chung cư khác
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <button
          id="session-selector"
          className="topbar-session-select inactive"
          onClick={() => setShowSessionModal(true)}
          title="Danh sách Crawler"
          style={{
            borderColor: 'rgba(245, 158, 11, 0.35)',
            background: 'rgba(245, 158, 11, 0.03)',
            borderStyle: 'dashed',
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ color: 'var(--color-warning)', display: 'flex', alignItems: 'center' }}>
            <Icons.Activity size={13} />
          </span>
          <span style={{ flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            Chưa chọn Crawler...
          </span>
          <Icons.ChevronDown size={11} style={{ opacity: 0.5 }} />
        </button>
      )}

      {currentSession && (
        <button
          className="topbar-btn"
          style={{
            borderColor: 'var(--color-success)',
            background: 'var(--color-success-dim)',
            color: 'var(--color-success)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
          onClick={onOpenFeed}
          title="Xem tất cả bài đăng của Crawler này"
        >
          <Icons.FileText size={13} />
          <span>Bài đăng ({displayListingCount})</span>
        </button>
      )}

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

      <button className="topbar-btn" id="btn-save-session" onClick={onSaveSession} title="Lưu Crawler hiện tại" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Icons.Save size={13} />
        <span>Lưu</span>
      </button>

      {crawlStatus === 'running' && currentSession ? (
        <button
          id="btn-stop-crawl"
          className="topbar-btn danger"
          onClick={handleStopCrawl}
          title="Dừng tiến trình cào hiện tại"
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <Icons.X size={13} />
          <span>Stop Crawl</span>
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
            cursor: (!currentSession && selectedIds.size === 0) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Icons.Play size={12} fill="currentColor" />
          <span>Start Crawl</span>
        </button>
      )}

      <button className="topbar-btn" id="btn-new-session" onClick={onNewSession} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Icons.X size={12} style={{ transform: 'rotate(45deg)', opacity: 0.8 }} />
        <span>Crawler mới</span>
      </button>
    </div>
  );
}
