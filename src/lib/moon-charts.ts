/** A compact, dependency-free renderer for the far-side observation room. */
export interface ChartSpec {
  kind: 'bars' | 'columns' | 'lines';
  title: string;
  unit: string;
  labels: string[];
  series: { label: string; color: string; values: (number | null)[] }[];
  max?: number;
  subtitle?: string;
}

const palette = {
  background: '#17212b',
  text: '#e8e4dc',
  muted: '#9db1bf',
  grid: 'rgba(157, 177, 191, 0.15)',
  fallback: '#c8b486',
};
const font = 'system-ui, -apple-system, "Microsoft YaHei", sans-serif';

function shorten(ctx: CanvasRenderingContext2D, value: string, width: number): string {
  if (width <= 0) return '';
  if (ctx.measureText(value).width <= width) return value;
  const points = Array.from(value);
  while (points.length && ctx.measureText(`${points.join('')}…`).width > width) points.pop();
  return points.length ? `${points.join('')}…` : '';
}

function tickLabel(value: number, step: number): string {
  if (Number.isInteger(value)) return value.toLocaleString('zh-CN');
  let decimals = 0;
  while (decimals < 4 && Math.abs(step * 10 ** decimals - Math.round(step * 10 ** decimals)) > 1e-8) decimals += 1;
  return value.toLocaleString('zh-CN', { maximumFractionDigits: decimals });
}

function scaleFor(values: number[], preferred?: number): { max: number; step: number } {
  const observed = values.reduce((highest, value) => Math.max(highest, value), 0);
  const target = Math.max(observed, Number.isFinite(preferred) && preferred! > 0 ? preferred! : 0);
  if (!target) return { max: 1, step: 0.2 };
  const rough = target / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  const factor = rough / power;
  const step = (factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 2.5 ? 2.5 : factor <= 5 ? 5 : 10) * power;
  return { max: Math.ceil(target / step) * step, step };
}

function validValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Canvas remains static; an adjacent semantic table provides its full data. */
export function drawMoonChart(canvas: HTMLCanvasElement, spec: ChartSpec): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const box = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width || canvas.parentElement?.clientWidth || 800));
  const height = Math.max(1, Math.round(box.height || 400));
  const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'middle';
  const edge = width < 420 ? 16 : 22;
  const contentWidth = Math.max(1, width - edge * 2);
  ctx.fillStyle = palette.text;
  ctx.font = `600 ${width < 420 ? 13 : 15}px ${font}`;
  ctx.fillText(shorten(ctx, spec.title, contentWidth), edge, 26);

  let headerBottom = 40;
  if (spec.subtitle) {
    ctx.fillStyle = palette.muted;
    ctx.font = `10px ${font}`;
    // Preserve all subtitle text in the exported PNG, wrapping at characters.
    const points = Array.from(spec.subtitle);
    let line = '';
    let row = 0;
    for (const point of points) {
      if (line && ctx.measureText(line + point).width > contentWidth) {
        ctx.fillText(line, edge, 48 + row * 15);
        line = point;
        row += 1;
      } else line += point;
    }
    if (line) ctx.fillText(line, edge, 48 + row * 15);
    headerBottom = 60 + row * 15;
  }

  ctx.font = `10px ${font}`;
  let legendX = edge;
  let legendY = headerBottom + 8;
  for (let index = 0; index < spec.series.length; index += 1) {
    const series = spec.series[index];
    const label = shorten(ctx, series.label, contentWidth - 26);
    const itemWidth = ctx.measureText(label).width + 31;
    if (legendX > edge && legendX + itemWidth > width - edge) {
      legendX = edge;
      legendY += 19;
    }
    ctx.fillStyle = series.color || palette.fallback;
    if (spec.kind === 'lines') {
      ctx.strokeStyle = series.color || palette.fallback;
      ctx.lineWidth = 2;
      ctx.setLineDash(index === 0 ? [] : index % 2 ? [5, 3] : [2, 3]);
      ctx.beginPath();
      ctx.moveTo(legendX, legendY);
      ctx.lineTo(legendX + 12, legendY);
      ctx.stroke();
      ctx.setLineDash([]);
    } else ctx.fillRect(legendX, legendY - 4, 9, 9);
    ctx.fillStyle = palette.muted;
    ctx.fillText(label, legendX + 17, legendY);
    legendX += itemWidth;
  }
  const plotTop = (spec.series.length ? legendY : headerBottom) + 31;
  const visibleValues = spec.series.flatMap(series => series.values.slice(0, spec.labels.length).filter(validValue));
  if (!spec.labels.length || !visibleValues.length || height < plotTop + 75) {
    ctx.fillStyle = palette.muted;
    ctx.font = `12px ${font}`;
    ctx.textAlign = 'center';
    const emptyText = height < plotTop + 75 ? '请展开图表以查看完整内容' : '当前筛选条件下暂无可展示的数据';
    ctx.fillText(shorten(ctx, emptyText, contentWidth), width / 2, Math.min(height - 20, (height + plotTop) / 2));
    ctx.textAlign = 'left';
    return;
  }

  const scale = scaleFor(visibleValues, spec.max);
  const ticks = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, index) => index * scale.step);
  ctx.font = `10px ${font}`;
  const tickWidth = Math.max(...ticks.map(value => ctx.measureText(tickLabel(value, scale.step)).width));
  const longestLabel = Math.max(...spec.labels.map(label => ctx.measureText(label).width), 0);
  const left = spec.kind === 'bars'
    ? Math.max(edge + 44, Math.min(longestLabel + edge + 10, width * (width < 420 ? 0.34 : 0.3), 190))
    : edge + tickWidth + 12;
  const right = width - edge - (spec.kind === 'bars' ? Math.max(30, tickWidth + 8) : 8);
  const bottom = height - (spec.kind === 'bars' ? 32 : 47);
  const plotWidth = Math.max(1, right - left);
  const plotHeight = Math.max(1, bottom - plotTop);
  const yFor = (value: number): number => bottom - (value / scale.max) * plotHeight;
  const xFor = (value: number): number => left + (value / scale.max) * plotWidth;

  ctx.fillStyle = palette.muted;
  ctx.font = `10px ${font}`;
  ctx.fillText(shorten(ctx, spec.unit, contentWidth), edge, plotTop - 12);
  ctx.lineWidth = 1;
  for (const tick of ticks) {
    ctx.strokeStyle = palette.grid;
    ctx.beginPath();
    if (spec.kind === 'bars') {
      const x = xFor(tick);
      ctx.moveTo(x, plotTop);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(tickLabel(tick, scale.step), x, bottom + 17);
    } else {
      const y = yFor(tick);
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(tickLabel(tick, scale.step), left - 10, y);
    }
  }

  if (spec.kind === 'bars') {
    const rowHeight = plotHeight / spec.labels.length;
    const groupHeight = Math.min(rowHeight * 0.72, spec.series.length * 17);
    const barHeight = groupHeight / Math.max(1, spec.series.length);
    spec.labels.forEach((label, category) => {
      const center = plotTop + rowHeight * (category + 0.5);
      ctx.fillStyle = palette.muted;
      ctx.font = `10px ${font}`;
      ctx.textAlign = 'right';
      // Keep tick labels readable if a caller supplies an unusually short canvas.
      const labelStride = Math.max(1, Math.ceil(14 / rowHeight));
      if (category % labelStride === 0) ctx.fillText(shorten(ctx, label, left - edge - 10), left - 10, center);
      spec.series.forEach((series, seriesIndex) => {
        const value = series.values[category];
        if (!validValue(value)) return;
        const y = center - groupHeight / 2 + seriesIndex * barHeight;
        ctx.fillStyle = series.color || palette.fallback;
        ctx.fillRect(left, y, Math.max(0, xFor(value) - left), Math.max(1, barHeight - 2));
        // Values on a single-series bar chart remain visible in exports.
        if (spec.series.length === 1 && rowHeight >= 17) {
          const labelValue = value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
          const labelWidth = ctx.measureText(labelValue).width;
          const endpoint = xFor(value);
          if (endpoint + 6 + labelWidth <= width - edge) {
            ctx.fillStyle = palette.text;
            ctx.textAlign = 'left';
            ctx.fillText(labelValue, endpoint + 6, center - 1);
          }
        }
      });
    });
  } else {
    const count = spec.labels.length;
    const cellWidth = plotWidth / count;
    const pointX = (index: number): number => spec.kind === 'columns'
      ? left + cellWidth * (index + 0.5)
      : count === 1 ? left + plotWidth / 2 : left + (index / (count - 1)) * plotWidth;

    // Fit category labels without letting the end labels escape the PNG bounds.
    const labelSpace = Math.min(88, Math.max(42, longestLabel + 10));
    const stride = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plotWidth / labelSpace))));
    const labelIndices = Array.from({ length: count }, (_, index) => index).filter(index => index % stride === 0);
    if (count > 1 && !labelIndices.includes(count - 1)) {
      if (labelIndices.length > 1 && count - 1 - labelIndices[labelIndices.length - 1] < stride * 0.7) labelIndices.pop();
      labelIndices.push(count - 1);
    }
    ctx.fillStyle = palette.muted;
    ctx.textAlign = 'center';
    for (const index of labelIndices) {
      const available = Math.min(90, count === 1 ? plotWidth : Math.max(32, cellWidth * stride - 7));
      const label = shorten(ctx, spec.labels[index], available);
      const half = ctx.measureText(label).width / 2;
      const x = Math.min(width - edge - half, Math.max(edge + half, pointX(index)));
      ctx.fillText(label, x, bottom + 19);
    }

    // Clip data marks only; title, legends, labels and line gaps stay untouched.
    ctx.save();
    ctx.beginPath();
    ctx.rect(left - 4, plotTop - 4, plotWidth + 8, plotHeight + 8);
    ctx.clip();
    spec.series.forEach((series, seriesIndex) => {
      ctx.fillStyle = series.color || palette.fallback;
      ctx.strokeStyle = series.color || palette.fallback;
      if (spec.kind === 'columns') {
        const groupWidth = Math.min(70, cellWidth * 0.76);
        const barWidth = groupWidth / Math.max(1, spec.series.length);
        series.values.slice(0, count).forEach((value, index) => {
          if (!validValue(value)) return;
          const x = pointX(index) - groupWidth / 2 + barWidth * seriesIndex;
          const y = yFor(value);
          ctx.fillRect(x, y, Math.max(1, barWidth - Math.min(2, barWidth * 0.12)), bottom - y);
        });
      } else {
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.setLineDash(seriesIndex === 0 ? [] : seriesIndex % 2 ? [5, 3] : [2, 3]);
        ctx.beginPath();
        let connected = false;
        for (let index = 0; index < count; index += 1) {
          const value = series.values[index];
          if (!validValue(value)) {
            connected = false;
            continue;
          }
          if (connected) ctx.lineTo(pointX(index), yFor(value));
          else ctx.moveTo(pointX(index), yFor(value));
          connected = true;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        for (let index = 0; index < count; index += 1) {
          const value = series.values[index];
          if (!validValue(value)) continue;
          ctx.beginPath();
          // Different marker shapes give the first four cohorts a second cue.
          const x = pointX(index);
          const y = yFor(value);
          if (seriesIndex % 4 === 1) ctx.rect(x - 2.6, y - 2.6, 5.2, 5.2);
          else if (seriesIndex % 4 === 2) {
            ctx.moveTo(x, y - 3.5);
            ctx.lineTo(x + 3.5, y);
            ctx.lineTo(x, y + 3.5);
            ctx.lineTo(x - 3.5, y);
            ctx.closePath();
          } else if (seriesIndex % 4 === 3) {
            ctx.moveTo(x, y - 3.5);
            ctx.lineTo(x + 3.5, y + 2.5);
            ctx.lineTo(x - 3.5, y + 2.5);
            ctx.closePath();
          } else ctx.arc(x, y, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    ctx.restore();
  }
  ctx.textAlign = 'left';
  ctx.setLineDash([]);
}
