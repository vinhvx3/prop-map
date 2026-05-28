import '../leaflet-setup';
import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';
import { useStore, useFilteredApartments } from '../store';
import { api } from '../api';

// Fix Leaflet default icon path issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Ho Chi Minh City center
const HCM_CENTER: L.LatLngExpression = [10.762622, 106.660172];
const DEFAULT_ZOOM = 13;

function districtColor(district: string): string {
  const map: Record<string, string> = {
    'Q.1': '#ef4444',
    'Q.3': '#f97316',
    'Q.4': '#f59e0b',
    'Q.5': '#eab308',
    'Q.6': '#10b981',
    'Q.7': '#a855f7',
    'Q.8': '#3b82f6',
    'Q.10': '#06b6d4',
    'Q.11': '#0ea5e9',
    'Q.12': '#6366f1',
    'Q. Bình Tân': '#ec4899',
    'Q. Bình Thạnh': '#d946ef',
    'Q. Gò Vấp': '#14b8a6',
    'Q. Phú Nhuận': '#84cc16',
    'Q. Tân Bình': '#22c55e',
    'Q. Tân Phú': '#f43f5e',
    'TP. Thủ Đức': '#00bcd4',
    'H. Bình Chánh': '#78716c',
    'H. Hóc Môn': '#4b5563',
    'H. Nhà Bè': '#854d0e',
    'H. Củ Chi': '#4d7c0f',
    'H. Cần Giờ': '#15803d',
  };
  return map[district] || '#64748b';
}

function createAptIcon(name: string, district: string, segment: string, isSelected: boolean, zoom: number): L.DivIcon {
  // Xác định màu sắc và nhãn viết tắt theo Phân khúc (Segment) để tạo sự tối giản chuyên nghiệp
  let color = '#2563eb'; // trung_cap: Xanh dương uỷ nhiệm hiện đại
  let labelText = 'MID';
  let glowColor = '#2563eb';
  let border = '2px solid #ffffff';

  if (segment === 'cao_cap') {
    color = '#d97706'; // cao_cap: Vàng hổ phách sang trọng
    labelText = 'LUX';
    glowColor = '#fbbf24';
    border = isSelected ? '3px solid #fbbf24' : '2px solid #fbbf24';
  } else if (segment === 'binh_dan') {
    color = '#059669'; // binh_dan: Xanh ngọc lục bảo tinh tế
    labelText = 'ECO';
    glowColor = '#34d399';
    border = isSelected ? '2.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.6)';
  }

  // Tính toán kích thước cơ sở dựa theo cấp độ Zoom
  let baseSize = 28;
  if (zoom <= 10) baseSize = 6;
  else if (zoom === 11) baseSize = 9;
  else if (zoom === 12) baseSize = 13;
  else if (zoom === 13) baseSize = 18;
  else if (zoom === 14) baseSize = 24;
  else if (zoom === 15) baseSize = 28;
  else baseSize = 34; // zoom >= 16

  const size = isSelected ? Math.round(baseSize * 1.35) : baseSize;
  const showSymbol = baseSize >= 22; // Chỉ hiện nhãn viết tắt khi ghim đủ to
  const showName = zoom >= 16; // Hiện tên chung cư khi zoom từ mức 16 trở lên (cận cảnh chi tiết)

  const glow = isSelected
    ? `0 0 0 4px ${glowColor}50, 0 4px 12px rgba(0,0,0,0.6)`
    : '0 2px 8px rgba(0,0,0,0.4)';

  // Rút gọn nhãn tên nếu quá dài để bản đồ được gọn gàng
  const displayName = name.length > 20 ? name.substring(0, 18) + '...' : name;

  const htmlContent = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    ">
      ${showSymbol ? `
        <div style="
          width:${size}px; height:${size}px;
          background:${color};
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex; align-items: center; justify-content: center;
          box-shadow: ${glow};
          border: ${border};
          transition: all 0.15s;
        ">
          <span style="
            transform:rotate(45deg); 
            font-size:${size * 0.35}px; 
            color:white; 
            line-height:1; 
            font-weight:800;
            font-family: 'Inter', sans-serif;
            letter-spacing: -0.5px;
          ">${labelText}</span>
        </div>
      ` : `
        <div style="
          width:${size}px; height:${size}px;
          background:${color};
          border-radius: 50%;
          box-shadow: ${isSelected ? glow : '0 1px 4px rgba(0,0,0,0.3)'};
          border: ${border};
          transition: all 0.15s;
        "></div>
      `}
      
      ${showName ? `
        <div style="
          margin-top: 4px;
          background: none;
          color: #0f172a;
          padding: 0;
          font-size: 10px;
          font-weight: 800;
          white-space: nowrap;
          text-shadow: -1.5px -1.5px 0 #fff, 1.5px -1.5px 0 #fff, -1.5px 1.5px 0 #fff, 1.5px 1.5px 0 #fff, 0 1px 2px rgba(0,0,0,0.15);
          font-family: 'Inter', sans-serif;
          pointer-events: none;
          z-index: ${isSelected ? 1001 : 100};
        ">${displayName}</div>
      ` : ''}
    </div>
  `;

  // Tối ưu hóa điểm neo ghim để giữ ghim thăng bằng chính xác
  const totalHeight = size + (showName ? 20 : 0);
  return L.divIcon({
    html: htmlContent,
    className: '',
    iconSize: [size, totalHeight],
    iconAnchor: [size / 2, showSymbol ? size : size / 2],
    popupAnchor: [0, -size],
  });
}

interface MapViewProps {
  onPolygonDrawn: (geoJson: any) => void;
  clearTrigger: number;
}

export function MapView({ onPolygonDrawn, clearTrigger }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const drawnLayersRef = useRef<L.FeatureGroup | null>(null);
  const isDrawingRef = useRef(false);

  const [activeTool, setActiveTool] = React.useState<'rectangle' | 'circle' | 'polygon' | null>(null);
  const activeToolRef = useRef(activeTool);
  const [currentZoom, setCurrentZoom] = React.useState(DEFAULT_ZOOM);
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  const polygonHandlerRef = useRef<any>(null);
  const controlRectRef = useRef<L.Rectangle | null>(null);
  const shapeLayerRef = useRef<any>(null);
  const handlesRef = useRef<L.Marker[]>([]);
  const customCleanupRef = useRef<(() => void) | null>(null);

  const { setActiveApartment, activeApartmentId, selectedIds, setIsDrawing, currentPolygon } = useStore();
  const filtered = useFilteredApartments();
  const skipNextPolygonSyncRef = useRef(false);
  const updatePolygonFromMap = useCallback((geom: any) => {
    skipNextPolygonSyncRef.current = true;
    onPolygonDrawn(geom);
  }, [onPolygonDrawn]);

  // Generate coordinates for an inscribed ellipse inside bounding box
  const getEllipseCoords = (bnd: L.LatLngBounds) => {
    const sw = bnd.getSouthWest();
    const ne = bnd.getNorthEast();
    const center = bnd.getCenter();
    const latRadius = Math.abs(ne.lat - sw.lat) / 2;
    const lngRadius = Math.abs(ne.lng - sw.lng) / 2;

    const coords: L.LatLng[] = [];
    const steps = 64;
    for (let i = 0; i < steps; i++) {
      const angle = (i * 360 / steps) * Math.PI / 180;
      const lat = center.lat + latRadius * Math.sin(angle);
      const lng = center.lng + lngRadius * Math.cos(angle);
      coords.push(L.latLng(lat, lng));
    }
    coords.push(coords[0]);
    return coords;
  };

  const clearHandles = () => {
    handlesRef.current.forEach(h => h.remove());
    handlesRef.current = [];
  };

  const updateHandlePositions = (newBounds: L.LatLngBounds) => {
    const positions = [
      (b: L.LatLngBounds) => L.latLng(b.getNorth(), b.getWest()), // NW
      (b: L.LatLngBounds) => L.latLng(b.getNorth(), (b.getWest() + b.getEast()) / 2), // N
      (b: L.LatLngBounds) => L.latLng(b.getNorth(), b.getEast()), // NE
      (b: L.LatLngBounds) => L.latLng((b.getSouth() + b.getNorth()) / 2, b.getEast()), // E
      (b: L.LatLngBounds) => L.latLng(b.getSouth(), b.getEast()), // SE
      (b: L.LatLngBounds) => L.latLng(b.getSouth(), (b.getWest() + b.getEast()) / 2), // S
      (b: L.LatLngBounds) => L.latLng(b.getSouth(), b.getWest()), // SW
      (b: L.LatLngBounds) => L.latLng((b.getSouth() + b.getNorth()) / 2, b.getWest()) // W
    ];

    handlesRef.current.forEach((marker, idx) => {
      if (positions[idx]) {
        marker.setLatLng(positions[idx](newBounds));
      }
    });
  };

  const clearCustomDrawing = () => {
    if (customCleanupRef.current) {
      customCleanupRef.current();
      customCleanupRef.current = null;
    }
    clearHandles();
    if (controlRectRef.current) {
      controlRectRef.current.remove();
      controlRectRef.current = null;
    }
    if (shapeLayerRef.current) {
      shapeLayerRef.current.remove();
      shapeLayerRef.current = null;
    }
  };

  const renderHandles = (
    bounds: L.LatLngBounds,
    onResize: (newBounds: L.LatLngBounds) => void,
    onResizeEnd: () => void
  ) => {
    clearHandles();
    const map = mapRef.current;
    if (!map) return;

    const positions = [
      { name: 'NW', cursor: 'nwse-resize', getPos: (b: L.LatLngBounds) => L.latLng(b.getNorth(), b.getWest()), getNewBounds: (b: L.LatLngBounds, dLat: number, dLng: number) => L.latLngBounds([b.getSouth(), b.getEast()], [b.getNorth() + dLat, b.getWest() + dLng]) },
      { name: 'N', cursor: 'ns-resize', getPos: (b: L.LatLngBounds) => L.latLng(b.getNorth(), (b.getWest() + b.getEast()) / 2), getNewBounds: (b: L.LatLngBounds, dLat: number, dLng: number) => L.latLngBounds([b.getSouth(), b.getWest()], [b.getNorth() + dLat, b.getEast()]) },
      { name: 'NE', cursor: 'nesw-resize', getPos: (b: L.LatLngBounds) => L.latLng(b.getNorth(), b.getEast()), getNewBounds: (b: L.LatLngBounds, dLat: number, dLng: number) => L.latLngBounds([b.getSouth(), b.getWest()], [b.getNorth() + dLat, b.getEast() + dLng]) },
      { name: 'E', cursor: 'ew-resize', getPos: (b: L.LatLngBounds) => L.latLng((b.getSouth() + b.getNorth()) / 2, b.getEast()), getNewBounds: (b: L.LatLngBounds, dLat: number, dLng: number) => L.latLngBounds([b.getNorth(), b.getWest()], [b.getSouth(), b.getEast() + dLng]) },
      { name: 'SE', cursor: 'nwse-resize', getPos: (b: L.LatLngBounds) => L.latLng(b.getSouth(), b.getEast()), getNewBounds: (b: L.LatLngBounds, dLat: number, dLng: number) => L.latLngBounds([b.getNorth(), b.getWest()], [b.getSouth() + dLat, b.getEast() + dLng]) },
      { name: 'S', cursor: 'ns-resize', getPos: (b: L.LatLngBounds) => L.latLng(b.getSouth(), (b.getWest() + b.getEast()) / 2), getNewBounds: (b: L.LatLngBounds, dLat: number, dLng: number) => L.latLngBounds([b.getNorth(), b.getWest()], [b.getSouth() + dLat, b.getEast()]) },
      { name: 'SW', cursor: 'nesw-resize', getPos: (b: L.LatLngBounds) => L.latLng(b.getSouth(), b.getWest()), getNewBounds: (b: L.LatLngBounds, dLat: number, dLng: number) => L.latLngBounds([b.getNorth(), b.getEast()], [b.getSouth() + dLat, b.getWest() + dLng]) },
      { name: 'W', cursor: 'ew-resize', getPos: (b: L.LatLngBounds) => L.latLng((b.getSouth() + b.getNorth()) / 2, b.getWest()), getNewBounds: (b: L.LatLngBounds, dLat: number, dLng: number) => L.latLngBounds([b.getNorth(), b.getEast()], [b.getSouth(), b.getWest() + dLng]) }
    ];

    positions.forEach(pos => {
      const icon = L.divIcon({
        html: `<div class="leaflet-editing-icon" style="
          width: 8px;
          height: 8px;
          background: #ffffff;
          border: 1px solid #000000;
          box-shadow: 0 1px 2px rgba(0,0,0,0.3);
          cursor: ${pos.cursor};
          box-sizing: border-box;
        "></div>`,
        className: '',
        iconSize: [8, 8],
        iconAnchor: [4, 4]
      });

      const marker = L.marker(pos.getPos(bounds), {
        icon,
        draggable: false,
        zIndexOffset: 2000
      }).addTo(map);

      marker.on('mousedown', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e.originalEvent);
        e.originalEvent.preventDefault();

        map.dragging.disable();
        const startMouse = e.latlng;
        const startB = bounds;

        const onMouseMove = (moveEvt: L.LeafletMouseEvent) => {
          const dLat = moveEvt.latlng.lat - startMouse.lat;
          const dLng = moveEvt.latlng.lng - startMouse.lng;
          const nextBounds = pos.getNewBounds(startB, dLat, dLng);
          onResize(nextBounds);
        };

        const onMouseUp = () => {
          map.off('mousemove', onMouseMove);
          map.off('mouseup', onMouseUp);
          map.dragging.enable();
          onResizeEnd();
        };

        map.on('mousemove', onMouseMove);
        map.on('mouseup', onMouseUp);
      });

      handlesRef.current.push(marker);
    });
  };

  const getLatLngsFromGeoJSON = (geometry: any): L.LatLng[] => {
    if (!geometry || geometry.type !== 'Polygon') return [];
    const ring = geometry.coordinates[0];
    // GeoJSON coordinates are [lng, lat]
    return ring.map((pt: any) => L.latLng(pt[1], pt[0]));
  };

  const setupPolygonDrag = (layer: L.Polygon) => {
    const map = mapRef.current;
    if (!map) return;

    let isDragging = false;
    let startLatLng: L.LatLng | null = null;

    layer.on('mousedown', (event: L.LeafletMouseEvent) => {
      const targetEl = event.originalEvent.target as HTMLElement;
      if (targetEl && (targetEl.classList.contains('leaflet-editing-icon') || targetEl.classList.contains('leaflet-draw-guide-dash'))) {
        return;
      }
      isDragging = true;
      startLatLng = event.latlng;
      map.dragging.disable();
      L.DomEvent.stopPropagation(event.originalEvent);
    });

    const onMouseMove = (event: L.LeafletMouseEvent) => {
      if (!isDragging || !startLatLng) return;

      const currentLatLng = event.latlng;
      const dLat = currentLatLng.lat - startLatLng.lat;
      const dLng = currentLatLng.lng - startLatLng.lng;

      startLatLng = currentLatLng;

      if (typeof layer.getLatLngs === 'function') {
        const translateLatLngs = (latlngs: any[]): any[] => {
          return latlngs.map((item: any) => {
            if (Array.isArray(item)) {
              return translateLatLngs(item);
            }
            return L.latLng(item.lat + dLat, item.lng + dLng);
          });
        };
        const newLatLngs = translateLatLngs(layer.getLatLngs());
        layer.setLatLngs(newLatLngs);
      }

      layer.redraw();

      if ((layer as any).editing && (layer as any).editing.enabled()) {
        (layer as any).editing.disable();
        (layer as any).editing.enable();
      }

      updatePolygonFromMap(layer.toGeoJSON().geometry);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        startLatLng = null;
        map.dragging.enable();
        updatePolygonFromMap(layer.toGeoJSON().geometry);
      }
    };

    map.on('mousemove', onMouseMove);
    map.on('mouseup', handleMouseUp);
    layer.on('mouseup', handleMouseUp);

    layer.on('edit', () => {
      updatePolygonFromMap(layer.toGeoJSON().geometry);
    });
    layer.on('editdrag', () => {
      updatePolygonFromMap(layer.toGeoJSON().geometry);
    });

    const onEditVertex = (event: any) => {
      if (event.poly === layer) {
        updatePolygonFromMap(layer.toGeoJSON().geometry);
      }
    };
    map.on(L.Draw.Event.EDITVERTEX, onEditVertex);

    customCleanupRef.current = () => {
      if (mapRef.current) {
        mapRef.current.off('mousemove', onMouseMove);
        mapRef.current.off('mouseup', handleMouseUp);
        mapRef.current.off(L.Draw.Event.EDITVERTEX, onEditVertex);
      }
      layer.off('mousedown');
      layer.off('mouseup');
      layer.off('edit');
      layer.off('editdrag');
    };
  };

  const setupCustomEditing = (controlRect: L.Rectangle, shapeLayer: any, type: 'rectangle' | 'circle') => {
    const initialBounds = controlRect.getBounds();

    const updateShape = (newBounds: L.LatLngBounds) => {
      controlRect.setBounds(newBounds);
      controlRect.redraw();

      if (type === 'rectangle') {
        shapeLayer.setBounds(newBounds);
      } else {
        shapeLayer.setLatLngs(getEllipseCoords(newBounds));
      }
      shapeLayer.redraw();

      updateHandlePositions(newBounds);
    };

    renderHandles(initialBounds, (newBounds) => {
      updateShape(newBounds);
      updatePolygonFromMap(shapeLayer.toGeoJSON().geometry);
    }, () => {
      updatePolygonFromMap(shapeLayer.toGeoJSON().geometry);
    });

    let isDragging = false;
    let startMouseLatLng: L.LatLng | null = null;

    const startDrag = (event: L.LeafletMouseEvent) => {
      const targetEl = event.originalEvent.target as HTMLElement;
      if (targetEl && targetEl.classList.contains('leaflet-editing-icon')) {
        return;
      }
      isDragging = true;
      startMouseLatLng = event.latlng;
      mapRef.current?.dragging.disable();
      L.DomEvent.stopPropagation(event.originalEvent);
    };

    controlRect.on('mousedown', startDrag);
    shapeLayer.on('mousedown', startDrag);

    const moveDrag = (event: L.LeafletMouseEvent) => {
      if (!isDragging || !startMouseLatLng || !mapRef.current) return;

      const currentLatLng = event.latlng;
      const dLat = currentLatLng.lat - startMouseLatLng.lat;
      const dLng = currentLatLng.lng - startMouseLatLng.lng;

      startMouseLatLng = currentLatLng;

      const rectBounds = controlRect.getBounds();
      const newBounds = L.latLngBounds(
        L.latLng(rectBounds.getSouthWest().lat + dLat, rectBounds.getSouthWest().lng + dLng),
        L.latLng(rectBounds.getNorthEast().lat + dLat, rectBounds.getNorthEast().lng + dLng)
      );

      updateShape(newBounds);
      updatePolygonFromMap(shapeLayer.toGeoJSON().geometry);
    };

    const endDrag = () => {
      if (isDragging) {
        isDragging = false;
        startMouseLatLng = null;
        mapRef.current?.dragging.enable();
        updatePolygonFromMap(shapeLayer.toGeoJSON().geometry);
      }
    };

    mapRef.current?.on('mousemove', moveDrag);
    mapRef.current?.on('mouseup', endDrag);

    customCleanupRef.current = () => {
      if (mapRef.current) {
        mapRef.current.off('mousemove', moveDrag);
        mapRef.current.off('mouseup', endDrag);
      }
      controlRect.off('mousedown', startDrag);
      shapeLayer.off('mousedown', startDrag);
    };

    updatePolygonFromMap(shapeLayer.toGeoJSON().geometry);
  };

  // Handle active tool changes
  const startDraw = (tool: 'rectangle' | 'circle' | 'polygon') => {
    polygonHandlerRef.current?.disable();
    clearCustomDrawing();

    if (activeTool === tool) {
      setActiveTool(null);
      useStore.getState().setCurrentShapeType(null);
      if (mapRef.current) {
        mapRef.current.dragging.enable();
        mapRef.current.getContainer().style.cursor = '';
      }
      return;
    }

    setActiveTool(tool);
    useStore.getState().setCurrentShapeType(tool);

    if (tool === 'polygon') {
      polygonHandlerRef.current?.enable();
      if (mapRef.current) {
        mapRef.current.dragging.enable();
        mapRef.current.getContainer().style.cursor = '';
      }
    } else {
      if (mapRef.current) {
        mapRef.current.dragging.disable();
        mapRef.current.getContainer().style.cursor = 'crosshair';
      }
    }
  };

  const handleClear = () => {
    clearCustomDrawing();
    if (drawnLayersRef.current) {
      drawnLayersRef.current.clearLayers();
    }
    useStore.getState().setCurrentShapeType(null);
    updatePolygonFromMap(null);
    setActiveTool(null);
    polygonHandlerRef.current?.disable();
  };

  // Init map once
  useEffect(() => {
    if (mapRef.current || !mapElRef.current) return;

    const map = L.map(mapElRef.current, {
      center: HCM_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      tap: false,
    } as any);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    const drawnLayers = new L.FeatureGroup();
    drawnLayers.addTo(map);
    drawnLayersRef.current = drawnLayers;

    polygonHandlerRef.current = new L.Draw.Polygon(map, {
      allowIntersection: false,
      shapeOptions: {
        color: '#60a5fa',
        fillColor: '#60a5fa',
        fillOpacity: 0.2,
        opacity: 0.8,
        weight: 3,
      },
      showArea: true,
    });

    // Events
    map.on(L.Draw.Event.DRAWSTART, () => {
      setIsDrawing(true);
      isDrawingRef.current = true;
    });

    map.on(L.Draw.Event.DRAWSTOP, () => {
      setIsDrawing(false);
      isDrawingRef.current = false;
      setActiveTool(null);
    });

    // Custom drawing mouse listeners on the map
    map.on('mousedown', (e: L.LeafletMouseEvent) => {
      if (activeToolRef.current !== 'rectangle' && activeToolRef.current !== 'circle') {
        return;
      }

      const targetEl = e.originalEvent.target as HTMLElement;
      if (targetEl && (targetEl.classList.contains('leaflet-editing-icon') || targetEl.closest('.paint-ribbon'))) {
        return;
      }

      clearCustomDrawing();

      setIsDrawing(true);
      isDrawingRef.current = true;

      const startLatLng = e.latlng;
      const initialBounds = L.latLngBounds(startLatLng, startLatLng);

      const controlRect = L.rectangle(initialBounds, {
        color: '#8b949e',
        dashArray: '5, 5',
        fillColor: '#000000',
        fillOpacity: 0.0001,
        weight: 1.5,
        interactive: true
      }).addTo(drawnLayers);

      let shapeLayer: any;
      if (activeToolRef.current === 'rectangle') {
        shapeLayer = L.rectangle(initialBounds, {
          color: '#60a5fa',
          fillColor: '#60a5fa',
          fillOpacity: 0.15,
          weight: 3,
          className: 'paint-draggable-shape',
          interactive: true
        }).addTo(drawnLayers);
      } else {
        shapeLayer = L.polygon(getEllipseCoords(initialBounds), {
          color: '#60a5fa',
          fillColor: '#60a5fa',
          fillOpacity: 0.15,
          weight: 3,
          className: 'paint-draggable-shape',
          interactive: true
        }).addTo(drawnLayers);
      }

      controlRectRef.current = controlRect;
      shapeLayerRef.current = shapeLayer;

      const onMouseMove = (moveEvt: L.LeafletMouseEvent) => {
        const currentBounds = L.latLngBounds(startLatLng, moveEvt.latlng);
        controlRect.setBounds(currentBounds);

        if (activeToolRef.current === 'rectangle') {
          shapeLayer.setBounds(currentBounds);
        } else {
          shapeLayer.setLatLngs(getEllipseCoords(currentBounds));
        }

        controlRect.redraw();
        shapeLayer.redraw();
      };

      const onMouseUp = () => {
        map.off('mousemove', onMouseMove);
        map.off('mouseup', onMouseUp);

        setIsDrawing(false);
        isDrawingRef.current = false;

        const finalBounds = controlRect.getBounds();
        const sw = finalBounds.getSouthWest();
        const ne = finalBounds.getNorthEast();

        if (Math.abs(sw.lat - ne.lat) < 0.00005 && Math.abs(sw.lng - ne.lng) < 0.00005) {
          clearCustomDrawing();
          onPolygonDrawn(null);
        } else {
          setupCustomEditing(controlRect, shapeLayer, activeToolRef.current as 'rectangle' | 'circle');
        }

        setActiveTool(null);
        map.dragging.enable();
        map.getContainer().style.cursor = '';
      };

      map.on('mousemove', onMouseMove);
      map.on('mouseup', onMouseUp);
    });

    map.on(L.Draw.Event.CREATED, (e: any) => {
      clearCustomDrawing();
      drawnLayers.clearLayers();
      setActiveTool(null);

      const layer = e.layer;
      drawnLayers.addLayer(layer);

      if ((layer as any).editing) {
        (layer as any).editing.enable();
      }

      useStore.getState().setCurrentShapeType('polygon');
      setupPolygonDrag(layer);

      updatePolygonFromMap(layer.toGeoJSON().geometry);
    });

    map.on(L.Draw.Event.DELETED, () => {
      useStore.getState().setCurrentShapeType(null);
      updatePolygonFromMap(null);
    });

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    mapRef.current = map;

    return () => {
      clearCustomDrawing();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Clear polygon trigger
  useEffect(() => {
    if (clearTrigger > 0) {
      clearCustomDrawing();
      if (drawnLayersRef.current) {
        drawnLayersRef.current.clearLayers();
      }
    }
  }, [clearTrigger]);

  // Listen to currentPolygon changes from outside (e.g. loaded session or clear)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !drawnLayersRef.current) return;

    if (skipNextPolygonSyncRef.current) {
      skipNextPolygonSyncRef.current = false;
      return;
    }

    // Clear existing custom drawings on map
    clearCustomDrawing();
    drawnLayersRef.current.clearLayers();

    if (!currentPolygon) return;

    // We have a polygon to render on map!
    const shapeType = useStore.getState().currentShapeType;
    const latlngs = getLatLngsFromGeoJSON(currentPolygon);

    if (latlngs.length === 0) return;

    if (shapeType === 'rectangle' || shapeType === 'circle') {
      const bounds = L.latLngBounds(latlngs);

      const controlRect = L.rectangle(bounds, {
        color: '#8b949e',
        dashArray: '5, 5',
        fillColor: '#000000',
        fillOpacity: 0.0001,
        weight: 1.5,
        interactive: true
      }).addTo(drawnLayersRef.current);

      let shapeLayer: any;
      if (shapeType === 'rectangle') {
        shapeLayer = L.rectangle(bounds, {
          color: '#60a5fa',
          fillColor: '#60a5fa',
          fillOpacity: 0.15,
          weight: 3,
          className: 'paint-draggable-shape',
          interactive: true
        }).addTo(drawnLayersRef.current);
      } else {
        shapeLayer = L.polygon(getEllipseCoords(bounds), {
          color: '#60a5fa',
          fillColor: '#60a5fa',
          fillOpacity: 0.15,
          weight: 3,
          className: 'paint-draggable-shape',
          interactive: true
        }).addTo(drawnLayersRef.current);
      }

      controlRectRef.current = controlRect;
      shapeLayerRef.current = shapeLayer;

      setupCustomEditing(controlRect, shapeLayer, shapeType);
    } else {
      // Treat as polygon
      const layer = L.polygon(latlngs, {
        color: '#60a5fa',
        fillColor: '#60a5fa',
        fillOpacity: 0.15,
        weight: 3,
        interactive: true
      }).addTo(drawnLayersRef.current);

      if ((layer as any).editing) {
        (layer as any).editing.enable();
      }

      shapeLayerRef.current = layer;
      setupPolygonDrag(layer);
    }

    // Fit map bounds to the loaded polygon so the user sees it immediately!
    const bounds = L.latLngBounds(latlngs);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [currentPolygon]);

  // Update markers when filtered apartments change or selectedIds changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existingIds = new Set(markersRef.current.keys());
    const newIds = new Set(filtered.map(a => a.id));

    // Remove markers no longer in filtered list
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        markersRef.current.get(id)?.remove();
        markersRef.current.delete(id);
      }
    });

    // Add or update markers
    filtered.forEach(apt => {
      const isSelected = selectedIds.has(apt.id);
      const icon = createAptIcon(apt.name, apt.district, apt.segment || 'trung_cap', isSelected, currentZoom);

      if (markersRef.current.has(apt.id)) {
        // Update icon
        markersRef.current.get(apt.id)!.setIcon(icon);
      } else {
        // Create new marker
        const marker = L.marker([apt.location.lat, apt.location.lng], { icon })
          .addTo(map)
          .bindTooltip(
            `<b>${apt.name}</b><br>${apt.district} • ${apt.year ?? '—'} • ${apt.listing_count} tin`,
            { permanent: false, direction: 'top', className: 'apt-tooltip' }
          )
          .on('click', () => {
            setActiveApartment(apt.id);
          });

        markersRef.current.set(apt.id, marker);
      }
    });
  }, [filtered, selectedIds, currentZoom]);

  // Highlight active marker
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const apt = filtered.find(a => a.id === id);
      if (!apt) return;
      const isSelected = selectedIds.has(id);
      const icon = createAptIcon(apt.name, apt.district, apt.segment || 'trung_cap', isSelected, currentZoom);
      if (id === activeApartmentId) {
        // Make active marker bounce/glow
        const el = marker.getElement();
        if (el) el.style.zIndex = '1000';
      }
      marker.setIcon(icon);
    });
  }, [activeApartmentId, currentZoom]);

  // When session loads, fly to first apartment (once only)
  const hasInitialFlyRef = useRef(false);
  useEffect(() => {
    if (filtered.length > 0 && mapRef.current && !hasInitialFlyRef.current) {
      hasInitialFlyRef.current = true;
      const bounds = L.latLngBounds(filtered.map(a => [a.location.lat, a.location.lng]));
      if (bounds.isValid()) {
        mapRef.current.flyToBounds(bounds, { padding: [60, 60], duration: 1 });
      }
    }
  }, [filtered.length]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Drawing Toolbar */}
      <div className="paint-ribbon">
        <button
          onClick={() => startDraw('rectangle')}
          className={`paint-tool-btn test-btn-rectangle ${activeTool === 'rectangle' ? 'active' : ''}`}
          title="Hình chữ nhật"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="12" height="10" rx="1" />
          </svg>
        </button>

        <button
          onClick={() => startDraw('circle')}
          className={`paint-tool-btn test-btn-circle ${activeTool === 'circle' ? 'active' : ''}`}
          title="Hình tròn / Elip"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <ellipse cx="8" cy="8" rx="6" ry="5" />
          </svg>
        </button>

        <button
          onClick={() => startDraw('polygon')}
          className={`paint-tool-btn test-btn-polygon ${activeTool === 'polygon' ? 'active' : ''}`}
          title="Đa giác"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="8,1.5 14.5,6 12,14 4,14 1.5,6" />
          </svg>
        </button>

        <div className="paint-tool-divider"></div>

        <button
          onClick={handleClear}
          className="paint-tool-btn danger test-btn-clear"
          title="Xóa vùng"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4h12" />
            <path d="M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4" />
            <path d="M12.5 4l-.7 9.1a1 1 0 0 1-1 .9H5.2a1 1 0 0 1-1-.9L3.5 4" />
          </svg>
        </button>
      </div>

      <div
        ref={mapElRef}
        id="main-map"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
