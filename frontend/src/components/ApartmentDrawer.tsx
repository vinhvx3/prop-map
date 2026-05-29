import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import type { Apartment, Listing } from '../api';
import { Icons } from './Icons';

function isNew(date?: string): boolean {
  if (!date) return false;
  const d = new Date(date);
  return (Date.now() - d.getTime()) < 86400000; // 24h
}

function sourceBadgeClass(source: string): string {
  const s = source.toLowerCase();
  if (s.includes('mogi')) return 'source-badge mogi';
  if (s.includes('nhatot')) return 'source-badge nhatot';
  if (s.includes('bds') || s.includes('batdongsan')) return 'source-badge bds';
  return 'source-badge mogi';
}

function legalLabel(legal?: string): string {
  if (!legal) return '';
  if (legal === 'so_hong') return 'Sổ hồng lâu dài';
  if (legal === 'so_do') return 'Sổ đỏ';
  if (legal === 'hop_dong_mua_ban') return 'HĐMB';
  return legal;
}

function segmentLabel(segment?: string): string {
  if (!segment) return '';
  if (segment === 'cao_cap') return 'Cao cấp';
  if (segment === 'trung_cap') return 'Trung cấp';
  if (segment === 'binh_dan') return 'Bình dân';
  return segment;
}

function amenityIconLabel(amenity: string): { icon: React.ReactNode; label: string } {
  const map: Record<string, { icon: React.ReactNode; label: string }> = {
    ho_boi: { icon: <Icons.Sparkles size={11} />, label: 'Hồ bơi' },
    gym: { icon: <Icons.Activity size={11} />, label: 'Phòng gym' },
    san_choi: { icon: <Icons.MapPin size={11} />, label: 'Sân chơi trẻ em' },
    sieu_thi: { icon: <Icons.Building size={11} />, label: 'Siêu thị' },
    bao_ve_24h: { icon: <Icons.Save size={11} />, label: 'Bảo vệ 24/7' },
    cong_vien: { icon: <Icons.Map size={11} />, label: 'Công viên' },
  };
  return map[amenity] || { icon: <Icons.Sparkles size={11} />, label: amenity };
}

const SOURCES = [
  { value: '', label: 'Tất cả nguồn' },
  { value: 'mogi.vn', label: 'Mogi.vn' },
  { value: 'nhatot.com', label: 'NhaTot' },
  { value: 'batdongsan.com.vn', label: 'BatDongSan' },
];

interface ListingCardProps {
  listing: Listing;
}

function ListingCard({ listing }: ListingCardProps) {
  return (
    <div className="listing-card slide-in">
      <div className="listing-card-top">
        <div className="listing-title">{listing.title}</div>
        {listing.price && <div className="listing-price">{listing.price}</div>}
      </div>

      <div className="listing-meta">
        <span className={sourceBadgeClass(listing.source)}>{listing.source}</span>
        {isNew(listing.date) && <span className="new-badge">Mới</span>}
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

      <a href={listing.link} target="_blank" rel="noopener noreferrer" className="listing-link">
        <Icons.Link size={12} />
        <span>{listing.link}</span>
      </a>
    </div>
  );
}

export function ApartmentDrawer() {
  const { activeApartmentId, setActiveApartment, apartments, crawlStatus, loadSessions, showToast } = useStore();
  const [apt, setApt] = useState<Apartment | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<'newest' | 'price_asc' | 'price_desc'>('newest');
  const [filterSource, setFilterSource] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [crawlingThis, setCrawlingThis] = useState(false);

  const handleCrawlApartment = async () => {
    if (!apt || crawlStatus === 'running' || crawlingThis) return;
    
    setCrawlingThis(true);
    showToast(`Đang chuẩn bị tiến trình cào cho "${apt.name}"...`, 'info');
    
    try {
      // 1. Tạo session tạm thời cho chung cư này
      const sessionName = `Crawl ${apt.name}`;
      const createRes = await api.createSession({
        name: sessionName,
        selected_ids: [apt.id],
        filter_state: { shapeType: null }
      });
      
      const newSession = createRes.data;
      
      // 2. Kích hoạt cào cho session mới
      const crawlRes = await api.triggerCrawl(newSession.id);
      const jobId = crawlRes.data.job_id;
      
      // 3. Đồng bộ danh sách session
      await loadSessions();
      
      // 4. Set currentSession và currentJobId để App.tsx tự động kích hoạt SSE Log streaming
      useStore.setState({
        currentSession: { ...newSession, status: 'running' },
        currentJobId: jobId,
        crawlStatus: 'running'
      });
      
      showToast(`Bắt đầu cào dữ liệu cho "${apt.name}"! Xem tiến trình góc phải bản đồ.`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Không thể bắt đầu cào', 'error');
    } finally {
      setCrawlingThis(false);
    }
  };

  const PAGE_SIZE = 20;
  const isOpen = !!activeApartmentId;

  useEffect(() => {
    if (!activeApartmentId) {
      setApt(null);
      setListings([]);
      return;
    }

    // Try local first
    const local = apartments.find(a => a.id === activeApartmentId);
    if (local) {
      setApt(local);
    } else {
      api.getApartment(activeApartmentId)
        .then(r => {
          setApt(r.data);
        })
        .catch(err => console.error('ApartmentDrawer remote fetch error:', err));
    }
  }, [activeApartmentId, apartments]);

  useEffect(() => {
    if (!activeApartmentId) return;
    setLoading(true);
    api.getListings(activeApartmentId, { sort, page, page_size: PAGE_SIZE, source: filterSource || undefined })
      .then(r => {
        setListings(r.data);
        setTotal(r.meta?.total ?? 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeApartmentId, sort, page, filterSource, crawlStatus]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function districtColor(d: string) {
    if (d === 'Q.7') return 'var(--color-q7)';
    if (d === 'Q.8') return 'var(--color-q8)';
    return 'var(--color-q6)';
  }

  return (
    <div className="drawer-overlay">
      <div className={`drawer ${isOpen ? 'open' : ''}`} id="apt-drawer">
        {apt && (
          <>
            {/* Banner ảnh dự án trên đầu nếu có */}
            {apt.images && apt.images.length > 0 && (
              <div style={{ width: '100%', height: 180, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                <img 
                  src={apt.images[0]} 
                  alt={apt.name} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
                <div style={{
                  position: 'absolute', 
                  bottom: 0, 
                  left: 0, 
                  right: 0, 
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', 
                  padding: '24px 20px 12px 20px',
                  color: 'white',
                  fontSize: 16,
                  fontWeight: 600
                }}>
                  {apt.name}
                </div>
              </div>
            )}

            <div className="drawer-header">
              <div style={{ flex: 1, minWidth: 0 }}>
                {!apt.images?.length && <div className="drawer-title">{apt.name}</div>}
                <div className="drawer-address" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icons.MapPin size={12} style={{ opacity: 0.6 }} />
                  <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{apt.address}</span>
                </div>
                {apt.location?.google_maps && (
                  <a
                    href={apt.location.google_maps}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: 'var(--color-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}
                  >
                    <Icons.Link size={11} />
                    <span>Xem trên Google Maps →</span>
                  </a>
                )}
              </div>
              <button
                className="drawer-close"
                id="btn-close-drawer"
                onClick={() => setActiveApartment(null)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icons.X size={14} />
              </button>
            </div>

            <div className="drawer-meta">
              <div className="meta-tag">
                <Icons.Building size={12} />
                <span style={{ color: districtColor(apt.district), fontWeight: 600 }}>{apt.district}</span>
              </div>
              {apt.ward && (
                <div className="meta-tag">
                  <Icons.MapPin size={12} />
                  <span>P. {apt.ward}</span>
                </div>
              )}
              {apt.year && (
                <div className="meta-tag">
                  <Icons.Calendar size={12} />
                  <span>BG {apt.year}</span>
                </div>
              )}
              {apt.km_q1 !== undefined && (
                <div className="meta-tag">
                  <Icons.MapPin size={12} />
                  <span>{apt.km_q1}km Q.1</span>
                </div>
              )}
              {apt.balcony !== undefined && (
                <div className="meta-tag">
                  <Icons.Sparkles size={12} />
                  <span>Ban công{apt.balcony === 'tuy_can' ? ' (tùy căn)' : apt.balcony ? '' : ' không có'}</span>
                </div>
              )}
              {(apt.price_range || apt.price_furnished) && (
                <div className="meta-tag">
                  <Icons.Activity size={12} />
                  <span>{apt.price_furnished ?? apt.price_range}</span>
                </div>
              )}
              <div className="meta-tag">
                <Icons.FileText size={12} />
                <span style={{ color: apt.listing_count > 0 ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  {apt.listing_count} tin đăng
                </span>
              </div>
            </div>

            <div style={{ padding: '0 20px', marginBottom: 12, flexShrink: 0 }}>
              <button
                className={`btn accent ${crawlStatus === 'running' ? 'disabled' : ''}`}
                id="btn-crawl-apt"
                onClick={handleCrawlApartment}
                disabled={crawlStatus === 'running' || crawlingThis}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px 16px',
                  fontWeight: 600,
                  fontSize: 13,
                  boxSizing: 'border-box'
                }}
              >
                {crawlingThis ? (
                  <Icons.Loader size={14} />
                ) : (
                  <Icons.Activity size={14} />
                )}
                <span>
                  {crawlingThis ? 'Đang chuẩn bị...' : crawlStatus === 'running' ? 'Đang có tiến trình cào...' : 'Crawl dữ liệu mới cho CC này'}
                </span>
              </button>
            </div>

            <div className="drawer-listings-header">
              <div className="drawer-listings-title">
                Feed bài đăng
                {total > 0 && <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}> ({total})</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  id="listing-source"
                  className="sort-select"
                  value={filterSource}
                  onChange={e => { setFilterSource(e.target.value); setPage(1); }}
                >
                  {SOURCES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <select
                  id="listing-sort"
                  className="sort-select"
                  value={sort}
                  onChange={e => { setSort(e.target.value as any); setPage(1); }}
                >
                  <option value="newest">Mới nhất</option>
                  <option value="price_asc">Giá tăng</option>
                  <option value="price_desc">Giá giảm</option>
                </select>
              </div>
            </div>

            <div className="listings-scroll">
              {/* Thông tin dự án phong phú */}
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.02)', 
                border: '1px solid var(--color-border)', 
                borderRadius: 'var(--radius-md)',
                padding: 16,
                marginBottom: 20,
                marginTop: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-accent-hover)', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icons.Building size={14} />
                  <span>Thông tin dự án</span>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12 }}>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Chủ đầu tư: </span>
                    <span style={{ fontWeight: 500 }}>{apt.developer ?? '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Phân khúc: </span>
                    <span style={{ fontWeight: 500 }}>{segmentLabel(apt.segment) ?? '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Pháp lý: </span>
                    <span style={{ fontWeight: 500 }}>{legalLabel(apt.legal) ?? '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Quy mô: </span>
                    <span style={{ fontWeight: 500 }}>{apt.total_units ? `${apt.total_units.toLocaleString('vi-VN')} căn` : '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Diện tích: </span>
                    <span style={{ fontWeight: 500 }}>{apt.area_range_m2 ? `${apt.area_range_m2.min} - ${apt.area_range_m2.max} m²` : '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Phí quản lý: </span>
                    <span style={{ fontWeight: 500 }}>{apt.management_fee ? `${apt.management_fee.toLocaleString('vi-VN')}đ/m²` : '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Gửi xe máy: </span>
                    <span style={{ fontWeight: 500 }}>{apt.parking_fee?.motorbike ? `${apt.parking_fee.motorbike.toLocaleString('vi-VN')}đ/th` : '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Gửi ô tô: </span>
                    <span style={{ fontWeight: 500 }}>{apt.parking_fee?.car ? `${apt.parking_fee.car.toLocaleString('vi-VN')}đ/th` : '—'}</span>
                  </div>
                </div>

                {apt.amenities && apt.amenities.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 12, marginTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icons.Sparkles size={12} />
                      <span>Tiện ích dự án</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {apt.amenities.map(am => {
                        const info = amenityIconLabel(am);
                        return (
                          <span key={am} style={{ 
                            fontSize: 11, 
                            padding: '3px 8px', 
                            borderRadius: 4, 
                            background: 'var(--color-bg-4)', 
                            color: 'var(--color-text-primary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {info.icon}
                            <span>{info.label}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="listing-card">
                    <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 8 }} />
                    <div className="skeleton" style={{ height: 12, width: '40%' }} />
                  </div>
                ))
              ) : listings.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                    <Icons.FileText size={32} style={{ opacity: 0.3 }} />
                  </div>
                  <div className="empty-state-text">Chưa có tin đăng</div>
                  <div className="empty-state-sub">Crawl để lấy dữ liệu cho chung cư này</div>
                </div>
              ) : (
                <>
                  {listings.map((l, i) => <ListingCard key={i} listing={l} />)}

                  {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                      <button
                        className="btn"
                        id="btn-prev-page"
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                      >← Trước</button>
                      <span style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {page}/{totalPages}
                      </span>
                      <button
                        className="btn"
                        id="btn-next-page"
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}
                      >Sau →</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
