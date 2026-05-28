import L from 'leaflet';

// Fix Leaflet Draw bug on Windows touch-enabled Chrome/Edge where mouse clicks to draw are ignored.
// We must set these to false before importing 'leaflet-draw' so that it configures itself for mouse events.
if (L.Browser.touch) {
  (L.Browser as any).touch = false;
}
(L.Browser as any).pointer = false;

// Import leaflet-draw after setting touch/pointer to false
import 'leaflet-draw';

// Override L.GeometryUtil.readableArea to fix ReferenceError: type is not defined in Strict Mode
if (L.GeometryUtil && L.GeometryUtil.readableArea) {
  L.GeometryUtil.readableArea = function (area: number, isMetric: any, precision: any) {
    var areaStr,
        units,
        precisionVal = L.Util.extend({}, { km: 2, ha: 2, m: 0, mi: 2, ac: 2, yd: 0, ft: 0, nm: 2 }, precision);

    if (isMetric) {
      var type = typeof isMetric;
      if (type === 'string') {
        units = [isMetric];
      } else if (type !== 'boolean') {
        units = isMetric;
      } else {
        units = ['ha', 'm'];
      }

      if (area >= 1000000 && units.indexOf('km') !== -1) {
        areaStr = L.GeometryUtil.formattedNumber((area * 0.000001) as any, precisionVal.km) + ' km²';
      } else if (area >= 10000 && units.indexOf('ha') !== -1) {
        areaStr = L.GeometryUtil.formattedNumber((area * 0.0001) as any, precisionVal.ha) + ' ha';
      } else {
        areaStr = L.GeometryUtil.formattedNumber(area as any, precisionVal.m) + ' m²';
      }
    } else {
      area /= 0.836127; // convert to yards

      if (area >= 3097600) { // miles
        areaStr = L.GeometryUtil.formattedNumber((area / 3097600) as any, precisionVal.mi) + ' mi²';
      } else if (area >= 4840) { // acres
        areaStr = L.GeometryUtil.formattedNumber((area / 4840) as any, precisionVal.ac) + ' acres';
      } else { // yards
        areaStr = L.GeometryUtil.formattedNumber(area as any, precisionVal.yd) + ' yd²';
      }
    }

    return areaStr;
  };
}
