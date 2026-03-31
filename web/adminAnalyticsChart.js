export function renderAdminChart({ svg, hintEl, points = [], range = '30d', metricLabel = 'Metric', formatBucketLabel }) {
  if (!svg || !hintEl) return;
  if (!Array.isArray(points) || !points.length) {
    svg.innerHTML = '';
    hintEl.textContent = 'No data for this range.';
    return;
  }

  const numericPoints = points.map((p, idx) => ({ x: idx, label: p.bucket, value: Number(p.value || 0) }));
  const maxVal = Math.max(...numericPoints.map((p) => p.value), 1);
  const width = svg.clientWidth || 640;
  const height = 260;
  const pad = 30;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  const tickInterval = (() => {
    switch (range) {
      case '7d':
        return 1;
      case '14d':
        return 2;
      case '30d':
        return Math.max(1, Math.round(numericPoints.length / 6));
      case '90d':
        return Math.max(1, Math.round(numericPoints.length / 8));
      case '12m':
        return Math.max(1, Math.round(numericPoints.length / 12));
      default:
        return Math.max(1, Math.round(numericPoints.length / 6));
    }
  })();

  const xTicks = numericPoints
    .map((pt, idx) => ({ idx, label: formatBucketLabel ? formatBucketLabel(pt.label) : pt.label }))
    .filter((pt, idx) => idx % tickInterval === 0 || idx === numericPoints.length - 1);

  const pts = numericPoints.map((pt, idx) => {
    const x = pad + (plotW * idx) / Math.max(1, numericPoints.length - 1);
    const y = pad + plotH - (pt.value / maxVal) * plotH;
    return { ...pt, x, y };
  });

  const path = [];
  const crToBezier = (p0, p1, p2, p3) => {
    const alpha = 0.2;
    const d1x = (p2.x - p0.x) * alpha;
    const d1y = (p2.y - p0.y) * alpha;
    const d2x = (p3.x - p1.x) * alpha;
    const d2y = (p3.y - p1.y) * alpha;
    return `C ${p1.x + d1x} ${p1.y + d1y} ${p2.x - d2x} ${p2.y - d2y} ${p2.x} ${p2.y}`;
  };

  if (pts.length === 1) {
    path.push(`M ${pts[0].x} ${pts[0].y}`);
  } else if (pts.length === 2) {
    path.push(`M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`);
  } else {
    path.push(`M ${pts[0].x} ${pts[0].y}`);
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      path.push(crToBezier(p0, p1, p2, p3));
    }
  }

  const circles = pts.map((pt, idx) => `<circle class="chart-point" data-idx="${idx}" cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="5"></circle>`);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({ y: pad + plotH - ratio * plotH, label: Math.round(maxVal * ratio) }));

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <g stroke="rgba(20,40,80,0.08)" stroke-width="1">
      ${yTicks.map((tick) => `<line x1="${pad}" y1="${tick.y.toFixed(2)}" x2="${width - pad}" y2="${tick.y.toFixed(2)}" />`).join('')}
    </g>
    <g fill="rgba(20,40,80,0.6)" font-size="10" font-weight="600">
      ${yTicks.map((tick) => `<text x="${pad - 10}" y="${tick.y.toFixed(2)}" text-anchor="end" dominant-baseline="middle">${tick.label.toLocaleString()}</text>`).join('')}
      ${xTicks
        .map((tick) => {
          const x = pad + (plotW * tick.idx) / Math.max(1, numericPoints.length - 1);
          return `<text x="${x.toFixed(2)}" y="${height - 8}" text-anchor="middle">${tick.label}</text>`;
        })
        .join('')}
    </g>
    <path d="${path.join(' ')}" fill="none" stroke="#2d5cff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path>
    ${circles.join('')}
  `;

  const chartBody = svg.parentElement;
  let tooltip = chartBody.querySelector('.chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';
    chartBody.appendChild(tooltip);
  }

  hintEl.textContent = `${points.length} data points · ${metricLabel} (${range})`;

  const circlesEls = svg.querySelectorAll('.chart-point');
  let activeIdx = null;

  const showPoint = (idx, clientX, clientY) => {
    if (idx == null || idx < 0 || idx >= pts.length) return;
    if (activeIdx !== null && circlesEls[activeIdx]) circlesEls[activeIdx].classList.remove('active');
    activeIdx = idx;
    const pt = pts[idx];
    if (circlesEls[idx]) circlesEls[idx].classList.add('active');
    const rect = chartBody.getBoundingClientRect();
    tooltip.innerHTML = `<div class="tooltip-date">${formatBucketLabel ? formatBucketLabel(pt.label) : pt.label}</div><div class="tooltip-metric">${metricLabel}</div><div class="tooltip-value">${pt.value.toLocaleString()}</div>`;
    tooltip.style.opacity = '1';
    const tooltipWidth = tooltip.offsetWidth || 140;
    const tooltipHeight = tooltip.offsetHeight || 60;
    const x = (clientX || 0) - rect.left - tooltipWidth / 2;
    const y = (clientY || 0) - rect.top - tooltipHeight - 12;
    tooltip.style.transform = `translate(${Math.max(0, Math.min(rect.width - tooltipWidth, x))}px, ${Math.max(0, y)}px)`;
  };

  const clearHover = () => {
    if (activeIdx !== null && circlesEls[activeIdx]) circlesEls[activeIdx].classList.remove('active');
    activeIdx = null;
    tooltip.style.opacity = '0';
  };

  svg.onmousemove = (event) => {
    const rect = svg.getBoundingClientRect();
    const relativeX = event.clientX - rect.left - pad;
    const step = plotW / Math.max(1, numericPoints.length - 1);
    const idx = Math.max(0, Math.min(numericPoints.length - 1, Math.round(relativeX / step)));
    showPoint(idx, event.clientX, event.clientY);
  };
  svg.onmouseleave = clearHover;
  const lastPoint = circlesEls[circlesEls.length - 1];
  if (lastPoint) {
    const bbox = lastPoint.getBoundingClientRect();
    showPoint(circlesEls.length - 1, bbox.x + bbox.width / 2, bbox.y);
  }
}
