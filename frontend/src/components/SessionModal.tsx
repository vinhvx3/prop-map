import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import type { Session, SessionSummary } from '../api';

interface SessionModalProps {
  sessions?: SessionSummary[];
  onRefresh: () => void;
}

export function SessionModal({ sessions = [], onRefresh }: SessionModalProps) {
  const { currentSession, setCurrentSession, setShowSessionModal, selectedIds, currentPolygon, currentShapeType } = useStore();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<'list' | 'create'>('list');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleLoad = async (id: string) => {
    const r = await api.getSession(id);
    setCurrentSession(r.data);
    setShowSessionModal(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await api.createSession({
        name: newName.trim(),
        geometry: currentPolygon,
        selected_ids: Array.from(selectedIds),
        filter_state: { shapeType: currentShapeType },
      });
      setCurrentSession(r.data);
      setShowSessionModal(false);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      return;
    }
    await api.deleteSession(id);
    if (currentSession?.id === id) setCurrentSession(null);
    setDeleteConfirmId(null);
    onRefresh();
  };

  const handleStartCrawl = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const r = await api.getSession(id);
      const session = r.data;

      // Trigger crawl on backend
      const crawlRes = await api.triggerCrawl(id);
      const jobId = crawlRes.data.job_id;

      // Update local store state to show CrawlLogPanel instantly
      const { setCrawlStatus, clearCrawlLogs, setCrawlProgress, setCurrentJobId } = useStore.getState();
      setCrawlStatus('running');
      clearCrawlLogs();
      setCrawlProgress(null);
      setCurrentJobId(jobId);

      const updatedSession = { ...session, status: 'running' as const };
      setCurrentSession(updatedSession);

      setShowSessionModal(false);
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStopCrawl = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.stopCrawl(id);
      if (currentSession?.id === id) {
        const { setCrawlStatus } = useStore.getState();
        setCrawlStatus('idle');
      }
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => setShowSessionModal(false)}>
      <div 
        className="modal" 
        id="session-modal" 
        style={{ 
          backgroundColor: '#161b22', 
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">📂 Danh sách Crawler</div>
          <button className="icon-btn" onClick={() => setShowSessionModal(false)}>✕</button>
        </div>

        <div className="modal-body">
          {view === 'list' ? (
            <>
              {sessions.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  <div className="empty-state-icon">📂</div>
                  <div className="empty-state-text">Chưa có Crawler nào</div>
                </div>
              ) : (
                sessions.map(s => (
                  <div
                    key={s.id}
                    className={`session-card ${currentSession?.id === s.id ? 'active' : ''}`}
                    id={`session-card-${s.id}`}
                    style={{ 
                      backgroundColor: currentSession?.id === s.id ? 'rgba(59, 130, 246, 0.15)' : '#1c2128' 
                    }}
                    onClick={() => handleLoad(s.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div className="session-card-name">{s.name}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {s.status === 'running' ? (
                          <button
                            className="icon-btn"
                            style={{ 
                              color: '#ff4d4f', 
                              fontSize: '11px', 
                              backgroundColor: 'rgba(255, 77, 79, 0.1)', 
                              padding: '2px 8px', 
                              borderRadius: '4px',
                              border: '1px solid rgba(255, 77, 79, 0.2)',
                              cursor: 'pointer',
                              fontWeight: '500',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            onClick={(e) => handleStopCrawl(e, s.id)}
                            title="Dừng cào dữ liệu chạy ngầm"
                          >
                            🛑 Stop
                          </button>
                        ) : (
                          <button
                            className="icon-btn"
                            style={{ 
                              color: '#3b82f6', 
                              fontSize: '11px', 
                              backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                              padding: '2px 8px', 
                              borderRadius: '4px',
                              border: '1px solid rgba(59, 130, 246, 0.2)',
                              fontWeight: '500',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              opacity: s.apartment_count === 0 ? 0.5 : 1,
                              cursor: s.apartment_count === 0 ? 'not-allowed' : 'pointer'
                            }}
                            onClick={(e) => handleStartCrawl(e, s.id)}
                            disabled={s.apartment_count === 0}
                            title={s.apartment_count === 0 ? "Chưa chọn chung cư nào để cào" : "Bắt đầu cào dữ liệu mới"}
                          >
                            ⚡ Start
                          </button>
                        )}
                        <div className={`status-dot ${s.status}`} style={{ margin: '0 4px' }} />
                        {deleteConfirmId === s.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                            <span style={{ fontSize: 11, color: 'var(--color-danger)' }}>Xóa?</span>
                            <button
                              className="icon-btn"
                              style={{ color: 'var(--color-danger)' }}
                              onClick={(e) => handleDelete(e, s.id)}
                              title="Xác nhận xóa"
                            >✓</button>
                            <button
                              className="icon-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(null);
                              }}
                              title="Hủy"
                            >✕</button>
                          </div>
                        ) : (
                          <button
                            className="icon-btn"
                            onClick={(e) => handleDelete(e, s.id)}
                            title="Xóa Crawler"
                          >🗑</button>
                        )}
                      </div>
                    </div>
                    <div className="session-card-meta">
                      <span>🏢 {s.apartment_count} CC</span>
                      <span>📋 {s.listing_count} tin</span>
                      {s.last_crawl && <span>🕒 {s.last_crawl.slice(0, 10)}</span>}
                    </div>
                  </div>
                ))
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Crawler sẽ lưu vùng bản đồ hiện tại ({selectedIds.size} CC đã chọn).
              </div>
              <input
                id="session-name-input"
                className="input"
                placeholder="Tên Crawler (vd: Crawler Q.7)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
          )}
        </div>

        <div className="modal-footer">
          {view === 'list' ? (
            <button
              className="btn accent"
              id="btn-create-session"
              onClick={() => setView('create')}
            >
              + Tạo Crawler mới
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => setView('list')}>← Quay lại</button>
              <button
                className="btn accent"
                id="btn-confirm-create"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
              >
                {creating ? 'Đang tạo...' : '✓ Tạo Crawler'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
