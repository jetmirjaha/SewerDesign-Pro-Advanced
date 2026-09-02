
"use strict";

const Calc = (() => {
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function buildSurveyGeometry(points) {
    let chainage = 0;
    return points.map((p, i) => {
      if (i > 0) chainage += distance(points[i - 1], p);
      return { ...p, chainage };
    });
  }

  function interpolateOnPolyline(points, targetChainage) {
    if (!points.length) return null;
    if (targetChainage <= 0) return { ...points[0], chainage: 0 };

    const last = points[points.length - 1];
    if (targetChainage >= last.chainage) return { ...last };

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (targetChainage <= b.chainage) {
        const segmentLength = b.chainage - a.chainage;
        const t = segmentLength === 0 ? 0 : (targetChainage - a.chainage) / segmentLength;
        return {
          x: a.x + t * (b.x - a.x),
          y: a.y + t * (b.y - a.y),
          z: a.z + t * (b.z - a.z),
          chainage: targetChainage,
          description: "Pusetë e gjeneruar"
        };
      }
    }
    return { ...last };
  }

  function generateManholes(points, maxDistance, minimumCover, designSlopePercent) {
    const geom = buildSurveyGeometry(points);
    if (geom.length < 2) return [];

    const total = geom[geom.length - 1].chainage;
    const count = Math.max(1, Math.ceil(total / maxDistance));
    const interval = total / count;
    const slope = designSlopePercent / 100;

    const manholes = [];
    for (let i = 0; i <= count; i++) {
      const ch = i === count ? total : i * interval;
      const p = interpolateOnPolyline(geom, ch);
      manholes.push({
        id: `P-${String(i + 1).padStart(2, "0")}`,
        ...p
      });
    }

    const startInvert = manholes[0].z - minimumCover;
    manholes.forEach(m => {
      m.invert = startInvert - slope * m.chainage;
      m.depth = m.z - m.invert;
    });
    return manholes;
  }

  function populationProjection(currentPopulation, growthRatePercent, years) {
    return currentPopulation * Math.pow(1 + growthRatePercent / 100, years);
  }

  function designFlowLps(population, consumptionLpd, returnCoefficient, peakCoefficient, infiltrationLps) {
    const average = population * consumptionLpd * returnCoefficient / 86400;
    return average * peakCoefficient + infiltrationLps;
  }

  function fullPipeCapacityLps(diameterMm, slopePercent, n) {
    const d = diameterMm / 1000;
    const slope = slopePercent / 100;
    if (d <= 0 || slope <= 0 || n <= 0) return 0;
    const area = Math.PI * d * d / 4;
    const radius = d / 4;
    return (1 / n) * area * Math.pow(radius, 2 / 3) * Math.sqrt(slope) * 1000;
  }

  function selectDiameter(requiredLps, slopePercent, n, minimumDiameter) {
    const standard = [160, 200, 250, 300, 315, 400, 500, 600, 800, 1000]
      .filter(d => d >= minimumDiameter);
    for (const dn of standard) {
      const capacity = fullPipeCapacityLps(dn, slopePercent, n);
      if (capacity >= requiredLps) return { dn, capacity };
    }
    const dn = standard[standard.length - 1];
    return { dn, capacity: fullPipeCapacityLps(dn, slopePercent, n), insufficient: true };
  }

  function generateSegments(manholes, flowLps, n, minimumDiameter) {
    const segments = [];
    for (let i = 1; i < manholes.length; i++) {
      const a = manholes[i - 1];
      const b = manholes[i];
      const length = b.chainage - a.chainage;
      const slope = length > 0 ? ((a.invert - b.invert) / length) * 100 : 0;
      const selection = selectDiameter(flowLps, slope, n, minimumDiameter);
      segments.push({
        id: `${a.id} – ${b.id}`,
        length,
        slope,
        dn: selection.dn,
        capacity: selection.capacity,
        flow: flowLps,
        status: selection.insufficient ? "Kapacitet i pamjaftueshëm" : "Në rregull"
      });
    }
    return segments;
  }

  return {
    distance,
    buildSurveyGeometry,
    generateManholes,
    populationProjection,
    designFlowLps,
    fullPipeCapacityLps,
    generateSegments
  };
})();
