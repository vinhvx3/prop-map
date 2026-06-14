import React from 'react';
import { useStore, useFilteredApartments } from '../store';

export function FilterPanel() {
  const { filters, setFilters } = useStore();
  const filtered = useFilteredApartments();

  const districts = ['Q.7', 'Q.8', 'Q.6', 'H. Nhà Bè', 'H. Bình Chánh'];

  const toggleDistrict = (d: string) => {
    const next = filters.districts.includes(d)
      ? filters.districts.filter(x => x !== d)
      : [...filters.districts, d];
    setFilters({ districts: next });
  };

  const districtClass = (d: string) => {
    const base = d === 'Q.7' ? 'q7' : d === 'Q.8' ? 'q8' : d === 'Q.6' ? 'q6' : d === 'H. Nhà Bè' ? 'nhabe' : 'binhchanh';
    return `chip ${base} ${filters.districts.includes(d) ? 'active' : ''}`;
  };

  return (
    <div className="filter-panel">
      <div className="filter-title">Bộ lọc — {filtered.length} kết quả</div>

      <div className="filter-row">
        <span className="filter-label">Quận</span>
        <div className="filter-chips">
          {districts.map(d => (
            <button key={d} className={districtClass(d)} onClick={() => toggleDistrict(d)} id={`filter-district-${d.replace('.', '')}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row">
        <span className="filter-label">Năm BG</span>
        <div className="range-row" style={{ flex: 1 }}>
          <input
            id="filter-year-min"
            type="range"
            className="range-input"
            min={2010} max={2025} step={1}
            value={filters.yearMin}
            onChange={e => {
              const val = Number(e.target.value);
              setFilters({ yearMin: Math.min(val, filters.yearMax) });
            }}
          />
          <span className="range-val">{filters.yearMin}</span>
          <span style={{ color: 'var(--color-text-muted)', margin: '0 4px' }}>—</span>
          <input
            id="filter-year-max"
            type="range"
            className="range-input"
            min={2010} max={2025} step={1}
            value={filters.yearMax}
            onChange={e => {
              const val = Number(e.target.value);
              setFilters({ yearMax: Math.max(val, filters.yearMin) });
            }}
          />
          <span className="range-val">{filters.yearMax}</span>
        </div>
      </div>

      <div className="filter-row">
        <span className="filter-label">Km Q.1</span>
        <div className="range-row" style={{ flex: 1 }}>
          <input
            id="filter-km-max"
            type="range"
            className="range-input"
            min={1} max={30} step={0.5}
            value={filters.kmMax}
            onChange={e => setFilters({ kmMax: Number(e.target.value) })}
          />
          <span className="range-val">≤{filters.kmMax}km</span>
        </div>
      </div>

      <div className="filter-row">
        <span className="filter-label">Ban công</span>
        <div className="filter-chips">
          {(['all', 'yes', 'no'] as const).map(v => (
            <button
              key={v}
              id={`filter-balcony-${v}`}
              className={`chip ${filters.balcony === v ? 'active' : ''}`}
              onClick={() => setFilters({ balcony: v })}
            >
              {v === 'all' ? 'Tất cả' : v === 'yes' ? 'Có' : 'Không'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
