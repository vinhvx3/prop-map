import React from 'react';
import { useStore, useFilteredApartments } from '../store';
import type { Apartment } from '../api';

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
      >
        {isSelected && <span style={{ color: 'white', fontSize: 10, lineHeight: 1 }}>✓</span>}
      </div>

      <div className="apt-card-info">
        <div className="apt-card-name">{apt.name}</div>
        <div className="apt-card-sub">
          <span className={districtBadgeClass(apt.district)}>{apt.district}</span>
          <span>{apt.year ?? '—'}</span>
          <span>📍 {apt.km_q1}km</span>
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
  const { selectAll, deselectAll, selectedIds } = useStore();
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
          >✓</button>
          <button
            className="icon-btn"
            id="btn-deselect-all"
            onClick={deselectAll}
            title="Bỏ chọn tất cả"
          >✕</button>
        </div>
      </div>

      <div className="apt-list-scroll">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗺</div>
            <div className="empty-state-text">Vẽ polygon trên bản đồ</div>
            <div className="empty-state-sub">để tìm chung cư trong vùng</div>
          </div>
        ) : (
          filtered.map(apt => <ApartmentCard key={apt.id} apt={apt} />)
        )}
      </div>
    </>
  );
}
