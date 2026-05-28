import React, { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import type { Session, SessionSummary } from '../api';
import { SessionFeedModal } from './SessionFeedModal';
import { Icons } from './Icons';

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
  const [feedSession, setFeedSession] = useState<SessionSummary | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  const handleRename = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await api.updateSession(id, { name: editingName.trim() });
      if (currentSession?.id === id) {
        setCurrentSession({ ...currentSession, name: editingName.trim() });
      }
      setEditingSessionId(null);
      onRefresh();
    } catch (e) {
      console.error('Đổi tên thất bại', e);
    }
  };

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
      const crawlRes = await api.triggerCrawl(id);
      const jobId = crawlRes.data.job_id;

      const isCurrent = currentSession?.id === id;
      if (isCurrent) {
        // Chỉ cập nhật trạng thái hiển thị chính của app nếu đây là crawler đang hiển thị
        const { setCrawlStatus, clearCrawlLogs, setCrawlProgress, setCurrentJobId } = useStore.getState();
        setCrawlStatus('running');
        clearCrawlLogs();
        setCrawlProgress(null);
        setCurrentJobId(jobId);

        const r = await api.getSession(id);
        setCurrentSession({ ...r.data, status: 'running' as const });
        setShowSessionModal(false);
      }

      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStopCrawl = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.stopCrawl(id);
      
      const isCurrent = currentSession?.id === id;
      if (isCurrent) {
        const { setCrawlStatus, setCurrentJobId } = useStore.getState();
        setCrawlStatus('idle');
        setCurrentJobId(null);

        const r = await api.getSession(id);
        setCurrentSession({ ...r.data, status: 'idle' as const });
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
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icons.Map size={16} />
            <span>Danh sách Crawler</span>
          </div>
          <button className="icon-btn" onClick={() => setShowSessionModal(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.X size={14} />
          </button>
        </div>

        <div className="modal-body">
          {view === 'list' ? (
            <>
              {sessions.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  <div className="empty-state-icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    <Icons.Map size={32} style={{ opacity: 0.3 }} />
                  </div>
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
                      {editingSessionId === s.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }} onClick={e => e.stopPropagation()}>
                          <input
                            type="text"
                            className="input"
                            style={{
                              padding: '2px 6px',
                              fontSize: '13px',
                              height: '24px',
                              maxWidth: '180px',
                              backgroundColor: '#0d1117',
                              border: '1px solid var(--color-accent)',
                              color: '#fff',
                              borderRadius: '4px'
                            }}
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onKeyDown={async e => {
                              if (e.key === 'Enter') await handleRename(s.id);
                              if (e.key === 'Escape') setEditingSessionId(null);
                            }}
                            autoFocus
                          />
                          <button
                            className="icon-btn"
                            style={{ color: 'var(--color-success)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
                            onClick={() => handleRename(s.id)}
                            title="Lưu"
                          >
                            <Icons.Check size={12} />
                          </button>
                          <button
                            className="icon-btn"
                            style={{ color: 'var(--color-text-secondary)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
                            onClick={() => setEditingSessionId(null)}
                            title="Hủy"
                          >
                            <Icons.X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <div className="session-card-name" style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {s.name}
                          </div>
                          <button
                            className="icon-btn edit-name-btn"
                            style={{
                              opacity: 0.4,
                              padding: '2px',
                              cursor: 'pointer',
                              background: 'none',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSessionId(s.id);
                              setEditingName(s.name);
                            }}
                            title="Đổi tên"
                          >
                            <Icons.Edit size={12} />
                          </button>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {s.listing_count > 0 && (
                          <button
                            className="btn-action-sm"
                            style={{
                              color: '#10b981',
                              backgroundColor: 'rgba(16, 185, 129, 0.1)',
                              border: '1px solid rgba(16, 185, 129, 0.2)',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFeedSession(s);
                            }}
                            title="Xem tất cả bài đăng"
                          >
                            <Icons.FileText size={11} />
                            <span>{s.listing_count}</span>
                          </button>
                        )}
                        {s.status === 'running' ? (
                          <button
                            className="btn-action-sm"
                            style={{ 
                              color: '#ff4d4f', 
                              backgroundColor: 'rgba(255, 77, 79, 0.1)', 
                              border: '1px solid rgba(255, 77, 79, 0.2)',
                            }}
                            onClick={(e) => handleStopCrawl(e, s.id)}
                            title="Dừng cào dữ liệu chạy ngầm"
                          >
                            <Icons.X size={11} />
                            <span>Stop</span>
                          </button>
                        ) : (
                          <button
                            className="btn-action-sm"
                            style={{ 
                              color: '#3b82f6', 
                              backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                              border: '1px solid rgba(59, 130, 246, 0.2)',
                              opacity: s.apartment_count === 0 ? 0.5 : 1,
                              cursor: s.apartment_count === 0 ? 'not-allowed' : 'pointer'
                            }}
                            onClick={(e) => handleStartCrawl(e, s.id)}
                            disabled={s.apartment_count === 0}
                            title={s.apartment_count === 0 ? "Chưa chọn chung cư nào để cào" : "Bắt đầu cào dữ liệu mới"}
                          >
                            <Icons.Play size={11} fill="currentColor" />
                            <span>Start</span>
                          </button>
                        )}
                        <div className={`status-dot ${s.status}`} style={{ margin: '0 4px' }} />
                        {deleteConfirmId === s.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                            <span style={{ fontSize: 11, color: 'var(--color-danger)' }}>Xóa?</span>
                            <button
                              className="icon-btn"
                              style={{ color: 'var(--color-danger)', display: 'flex', alignItems: 'center' }}
                              onClick={(e) => handleDelete(e, s.id)}
                              title="Xác nhận xóa"
                            >
                              <Icons.Check size={11} />
                            </button>
                            <button
                              className="icon-btn"
                              style={{ display: 'flex', alignItems: 'center' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(null);
                              }}
                              title="Hủy"
                            >
                              <Icons.X size={11} />
                            </button>
                          </div>
                        ) : (
                          <button
                            className="icon-btn"
                            style={{ display: 'flex', alignItems: 'center' }}
                            onClick={(e) => handleDelete(e, s.id)}
                            title="Xóa Crawler"
                          >
                            <Icons.Trash size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="session-card-meta">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Icons.Building size={11} style={{ opacity: 0.7 }} />
                        <span>{s.apartment_count} CC</span>
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Icons.FileText size={11} style={{ opacity: 0.7 }} />
                        <span>{s.listing_count} tin</span>
                      </span>
                      {s.last_crawl && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Icons.Calendar size={11} style={{ opacity: 0.7 }} />
                          <span>{s.last_crawl.slice(0, 10)}</span>
                        </span>
                      )}
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
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Icons.X size={12} style={{ transform: 'rotate(45deg)', opacity: 0.8 }} />
              <span>Tạo Crawler mới</span>
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => setView('list')}>← Quay lại</button>
              <button
                className="btn accent"
                id="btn-confirm-create"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {creating ? (
                  <span>Đang tạo...</span>
                ) : (
                  <>
                    <Icons.Check size={12} />
                    <span>Tạo Crawler</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Feed Modal overlay */}
      {feedSession && (
        <SessionFeedModal
          session={feedSession}
          onClose={() => setFeedSession(null)}
        />
      )}
    </div>
  );
}
