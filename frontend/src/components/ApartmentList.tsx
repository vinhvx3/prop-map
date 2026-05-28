import React from 'react';
import { useStore, useFilteredApartments } from '../store';
import type { Apartment } from '../api';
import { Icons } from './Icons';

function districtBadgeClass(d: string) {
  if (d === 'Q.7') return 'district-badge q7';
  if (d === 'Q.8') return 'district-badge q8';
  if (d === 'Q.6') return 'district-badge q6';
  return 'district-badge';
}

function getPriceDisplay(apt: Apartment): string {
  if (apt.price_furnished) return apt.price_furnished;
  if (apt.price_range) return apt.price_range;
  return '—';
}

interface ApartmentCardProps {
  apt: Apartment;
}

function ApartmentCard({ apt }: ApartmentCardProps) {
  const { selectedIds, toggleSelect, setActiveApartment, activeApartmentId } = useStore();
  const isSelected = selectedIds.has(apt.id);
  const isActive = activeApartmentId === apt.id;

  return (
    <div
      id={`apt-card-${apt.id}`}
      className={`apt-card fade-in ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
      onClick={() => setActiveApartment(isActive ? null : apt.id)}
    >
      <div
        role="checkbox"
        aria-checked={isSelected}
        tabIndex={0}
        className={`apt-checkbox ${isSelected ? 'checked' : ''}`}
        onClick={(e) => { e.stopPropagation(); toggleSelect(apt.id); }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            toggleSelect(apt.id);
          }
        }}
        title={isSelected ? 'Bỏ chọn' : 'Chọn'}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {isSelected && <Icons.Check size={10} color="white" />}
      </div>

      <div className="apt-card-info">
        <div className="apt-card-name">{apt.name}</div>
        <div className="apt-card-sub">
          <span className={districtBadgeClass(apt.district)}>{apt.district}</span>
          <span>{apt.year ?? '—'}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Icons.MapPin size={11} style={{ opacity: 0.6 }} />
            <span>{apt.km_q1}km</span>
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div className="apt-card-price">{getPriceDisplay(apt)}</div>
        <div className={`listing-count-badge ${apt.listing_count > 0 ? 'has-listings' : ''}`}>
          {apt.listing_count > 0 ? `${apt.listing_count} tin` : 'Chưa crawl'}
        </div>
      </div>
    </div>
  );
}

export function ApartmentList() {
  const { selectAll, deselectAll, filters, setFilters } = useStore();
  const filtered = useFilteredApartments();

  return (
    <>
      <div className="apt-list-header">
        <div>
          <div className="apt-list-title">Chung cư trong vùng</div>
          <div className="apt-list-count">{filtered.length} kết quả</div>
        </div>
        <div className="apt-list-actions">
          <button
            className="icon-btn"
            id="btn-select-all"
            onClick={selectAll}
            title="Chọn tất cả"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icons.Check size={12} />
          </button>
          <button
            className="icon-btn"
            id="btn-deselect-all"
            onClick={deselectAll}
            title="Bỏ chọn tất cả"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icons.X size={12} />
          </button>
        </div>
      </div>

      <div className="apt-search-container" style={{ padding: '0 12px 12px 12px' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: 10, color: '#8c959f', display: 'flex', alignItems: 'center' }}>
            <Icons.Search size={12} />
          </span>
          <input
            type="text"
            className="input"
            placeholder="Tìm theo tên (Sunrise, Happy...)"
            style={{
              padding: '6px 12px 6px 30px',
              fontSize: '12px',
              width: '100%',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: '#0d1117',
              border: '1px solid var(--color-border)',
              color: '#fff',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            value={filters.searchQuery || ''}
            onChange={(e) => setFilters({ searchQuery: e.target.value })}
          />
          {(filters.searchQuery || '') && (
            <button
              className="icon-btn"
              style={{
                position: 'absolute',
                right: 8,
                color: '#8c959f',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
              }}
              onClick={() => setFilters({ searchQuery: '' })}
              title="Xóa tìm kiếm"
            >
              <Icons.X size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="apt-list-scroll">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
              <Icons.Map size={32} style={{ opacity: 0.3 }} />
            </div>
            <div className="empty-state-text">Không tìm thấy chung cư nào</div>
            <div className="empty-state-sub">Vẽ vùng mới hoặc xóa bộ lọc để thử lại</div>
          </div>
        ) : (
          filtered.map(apt => <ApartmentCard key={apt.id} apt={apt} />)
        )}
      </div>
    </>
  );
}
