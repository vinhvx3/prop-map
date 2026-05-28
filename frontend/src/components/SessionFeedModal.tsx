import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api';
import type { FeedListing, SessionSummary } from '../api';
import { Icons } from './Icons';

interface SessionFeedModalProps {
  session: SessionSummary;
  onClose: () => void;
}

function sourceBadgeClass(source: string): string {
  const s = source.toLowerCase();
  if (s.includes('mogi')) return 'source-badge mogi';
  if (s.includes('nhatot')) return 'source-badge nhatot';
  if (s.includes('bds') || s.includes('batdongsan')) return 'source-badge bds';
  return 'source-badge mogi';
}

const SOURCES = [
  { value: '', label: 'Tất cả nguồn' },
  { value: 'mogi.vn', label: 'Mogi.vn' },
  { value: 'nhatot.com', label: 'NhaTot' },
  { value: 'batdongsan.com.vn', label: 'BatDongSan' },
];

export function SessionFeedModal({ session, onClose }: SessionFeedModalProps) {
  const [listings, setListings] = useState<FeedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<'newest' | 'price_asc' | 'price_desc'>('newest');
  const [filterApt, setFilterApt] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const PAGE_SIZE = 30;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getSessionFeed(session.id, {
        page,
        page_size: PAGE_SIZE,
        sort,
        source: filterSource || undefined,
      });
      setListings(r.data);
      setTotal(r.meta?.total ?? 0);
    } catch (e) {
      console.error('Feed fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [session.id, page, sort, filterSource]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Scroll to top when page changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  // Build unique apartment names for filter dropdown
  const aptNames = Array.from(new Set(listings.map(l => l.apartment_name))).sort();

  // Apply local apartment filter
  const filtered = filterApt === 'all'
    ? listings
    : listings.filter(l => l.apartment_name === filterApt);

  // Group by apartment for display
  const grouped = new Map<string, FeedListing[]>();
  for (const l of filtered) {
    const key = l.apartment_name || l.apartment_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(l);
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 10001 }} onClick={onClose}>
      <div
        className="modal feed-modal"
        id="session-feed-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icons.FileText size={16} />
              <span>Bài đăng — {session.name}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {total} tin đăng từ {session.apartment_count} chung cư
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.X size={14} />
          </button>
        </div>

        {/* Toolbar: sort + filter */}
        <div className="feed-toolbar">
          <div className="feed-toolbar-left">
            <select
              className="sort-select"
              value={sort}
              onChange={e => { setSort(e.target.value as any); setPage(1); }}
            >
              <option value="newest">Mới nhất</option>
              <option value="price_asc">Giá tăng</option>
              <option value="price_desc">Giá giảm</option>
            </select>

            <select
              className="sort-select"
              value={filterSource}
              onChange={e => { setFilterSource(e.target.value); setPage(1); }}
            >
              {SOURCES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>

            {aptNames.length > 1 && (
              <select
                className="sort-select"
                value={filterApt}
                onChange={e => setFilterApt(e.target.value)}
              >
                <option value="all">Tất cả CC ({listings.length})</option>
                {aptNames.map(name => {
                  const count = listings.filter(l => l.apartment_name === name).length;
                  return (
                    <option key={name} value={name}>{name} ({count})</option>
                  );
                })}
              </select>
            )}
          </div>

          {totalPages > 1 && (
            <div className="feed-pagination">
              <button
                className="btn feed-page-btn"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >←</button>
              <span className="feed-page-info">{page}/{totalPages}</span>
              <button
                className="btn feed-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >→</button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="feed-scroll" ref={scrollRef}>
          {loading ? (
            <div className="feed-loading">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="feed-listing-card">
                  <div className="skeleton" style={{ height: 14, width: '60%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 12, width: '35%', marginBottom: 6 }} />
                  <div className="skeleton" style={{ height: 10, width: '80%' }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 48 }}>
              <div className="empty-state-icon" style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
                <Icons.FileText size={32} style={{ opacity: 0.3 }} />
              </div>
              <div className="empty-state-text">Chưa có tin đăng nào</div>
              <div className="empty-state-sub">Hãy chạy Crawler để thu thập dữ liệu</div>
            </div>
          ) : (
            Array.from(grouped.entries()).map(([aptName, posts]) => (
              <div key={aptName} className="feed-apt-group">
                <div className="feed-apt-group-header" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icons.Building size={13} style={{ opacity: 0.8 }} />
                  <span className="feed-apt-group-name">{aptName}</span>
                  <span className="feed-apt-group-count">{posts.length} tin</span>
                </div>
                {posts.map((listing, i) => (
                  <div key={i} className="feed-listing-card slide-in">
                    <div className="feed-listing-top">
                      <div className="feed-listing-title">{listing.title}</div>
                      {listing.price && (
                        <div className="feed-listing-price">{listing.price}</div>
                      )}
                    </div>

                    <div className="listing-meta">
                      <span className={sourceBadgeClass(listing.source)}>{listing.source}</span>
                      {listing.bedrooms && (
                        <span className="listing-meta-item" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Icons.Bed size={12} style={{ opacity: 0.7 }} />
                          <span>{listing.bedrooms}</span>
                        </span>
                      )}
                      {listing.area && (
                        <span className="listing-meta-item" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Icons.Maximize size={11} style={{ opacity: 0.7 }} />
                          <span>{listing.area}</span>
                        </span>
                      )}
                      {listing.date && (
                        <span className="listing-meta-item" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Icons.Calendar size={12} style={{ opacity: 0.7 }} />
                          <span>{listing.date}</span>
                        </span>
                      )}
                    </div>

                    <a
                      href={listing.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="listing-link"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Icons.Link size={12} />
                      <span>{listing.link}</span>
                    </a>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer pagination */}
        {totalPages > 1 && (
          <div className="modal-footer" style={{ justifyContent: 'center' }}>
            <button
              className="btn"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >← Trang trước</button>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center' }}>
              Trang {page} / {totalPages} • {total} kết quả
            </span>
            <button
              className="btn"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >Trang sau →</button>
          </div>
        )}
      </div>
    </div>
  );
}
