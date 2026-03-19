/**
 * Flow 3 — Weekly Schedule prototype (party-count)
 * Asset type: party-count (max_parties, min_people_per_party, max_people_per_party)
 */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const PREVIEW_AXIS_START = 6;
const PREVIEW_AXIS_END = 22;
const PREVIEW_PX_PER_HOUR = 36;

function slotDataKey(data) {
  if (!data) return 'gap';
  if (data.ruleType === 'exception-closed') return `closed|${data.ruleId}`;
  return `${data.ruleId}|${data.capacityValue}|${data.ruleType}|${data.isOverride}`;
}
const DEFAULT_MAX_PARTIES = 10;
const DEFAULT_MIN_PEOPLE = 1;
const DEFAULT_MAX_PEOPLE = 50;

let rules = [];
let exceptions = [];
let editingId = null;
let editingExceptionId = null;
let dragSrc = null;
let ignoreNextCardClick = false;
let previewViewMode = 'weekly';
let previewWeekStart = null;
let previewMonth = null;
let exceptionPreviewHoverSnapshot = null;

function getWeekStart(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}
function dateToYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseDateYMD(str) {
  const [y, m, day] = str.split('-').map(Number);
  return new Date(y, m - 1, day);
}
function dateInRange(dateStr, startStr, endStr) {
  if (!dateStr || !startStr) return false;
  if (!endStr) endStr = startStr;
  return dateStr >= startStr && dateStr <= endStr;
}

const $ = (id) => document.getElementById(id);
function uid() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function parseTime(str) {
  const [h, m] = str.split(':').map(Number);
  return h + (m || 0) / 60;
}

function getPartyValues(record) {
  return {
    max_parties: record.max_parties != null ? record.max_parties : DEFAULT_MAX_PARTIES,
    min_people: record.min_people_per_party != null ? record.min_people_per_party : DEFAULT_MIN_PEOPLE,
    max_people: record.max_people_per_party != null ? record.max_people_per_party : DEFAULT_MAX_PEOPLE,
  };
}
function hasPartyOverride(record) {
  return record.max_parties != null || record.min_people_per_party != null || record.max_people_per_party != null;
}
function formatPartyLabel(vals, isOverride) {
  const range = `${vals.min_people}–${vals.max_people} pax`;
  if (isOverride) return `${vals.max_parties} groups (${range}) · override`;
  return `${vals.max_parties} groups (${range}) · base capacity`;
}

function ruleCoversHour(rule, dayIndex, hour) {
  if (!rule.days.includes(dayIndex)) return false;
  const start = parseTime(rule.timeStart);
  const end = parseTime(rule.timeEnd);
  const startHour = Math.floor(start);
  const endHour = end;
  return hour >= startHour && hour < endHour;
}
function exceptionCovers(ex, dateStr, hour) {
  if (!dateInRange(dateStr, ex.dateStart, ex.dateEnd || ex.dateStart)) return false;
  if (ex.allDay) return true;
  const start = parseTime(ex.timeStart);
  const end = parseTime(ex.timeEnd);
  const startHour = Math.floor(start);
  const endHour = end >= 24 ? 24 : end;
  return hour >= startHour && hour < endHour;
}

function getCellData(dayIndex, hour, weekStart) {
  const cellDate = new Date(weekStart);
  cellDate.setDate(cellDate.getDate() + dayIndex);
  const dateStr = dateToYMD(cellDate);

  for (let i = 0; i < exceptions.length; i++) {
    const ex = exceptions[i];
    if (exceptionCovers(ex, dateStr, hour)) {
      if (!ex.available) {
        const range = ex.dateEnd && ex.dateEnd !== ex.dateStart ? `${ex.dateStart} – ${ex.dateEnd}` : ex.dateStart;
        const timeLabel = ex.allDay ? 'All day' : `${ex.timeStart}–${ex.timeEnd}`;
        return {
          rule: ex,
          ruleId: ex.id,
          ruleType: 'exception-closed',
          sourceLabel: `Closed by exception (${range} ${timeLabel})`,
          capacityValue: null,
          capacityLabel: null,
          isOverride: false,
          priorityIndex: i + 1,
          overlappingCount: 1,
          precedenceLabel: 'Exception (closed)',
          overlapNote: '',
        };
      }
      const vals = getPartyValues(ex);
      const isOverride = hasPartyOverride(ex);
      const capacityLabel = formatPartyLabel(vals, isOverride);
      const range = ex.dateEnd && ex.dateEnd !== ex.dateStart ? `${ex.dateStart} – ${ex.dateEnd}` : ex.dateStart;
      const timeLabel = ex.allDay ? 'All day' : `${ex.timeStart}–${ex.timeEnd}`;
      const sourceLabel = `Exception (${range} ${timeLabel})`;
      return {
        rule: ex,
        ruleId: ex.id,
        capacityValue: vals.max_parties,
        capacityLabel,
        sourceLabel,
        isOverride,
        ruleType: isOverride ? 'exception' : 'exception-open',
        priorityIndex: i + 1,
        overlappingCount: 1,
        precedenceLabel: 'Exception',
        overlapNote: '',
      };
    }
  }

  const covering = [];
  for (let i = 0; i < rules.length; i++) {
    if (ruleCoversHour(rules[i], dayIndex, hour)) covering.push({ rule: rules[i], index: i });
  }
  if (covering.length === 0) return null;
  const { rule, index } = covering[0];
  const vals = getPartyValues(rule);
  const isOverride = hasPartyOverride(rule);
  const capacityLabel = formatPartyLabel(vals, isOverride);
  const sourceLabel = `Weekly schedule (${formatDays(rule.days)} ${rule.timeStart}–${rule.timeEnd})`;
  const precedenceLabel = `Priority ${index + 1}`;
  const overlapNote = covering.length > 1
    ? ` · ${covering.length} rules overlap; highest priority applies`
    : '';
  return {
    rule,
    ruleId: rule.id,
    capacityValue: vals.max_parties,
    capacityLabel,
    sourceLabel,
    isOverride,
    ruleType: 'recurring',
    priorityIndex: index + 1,
    overlappingCount: covering.length,
    precedenceLabel,
    overlapNote,
  };
}

function getPreviewWeekStart() {
  if (previewWeekStart) return previewWeekStart;
  return getWeekStart(new Date());
}
function getPreviewMonth() {
  if (previewMonth) return previewMonth;
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}
function setPreviewWeekFromDateInput(ymd) {
  const d = parseDateYMD(ymd);
  previewWeekStart = getWeekStart(d);
  renderPreview();
}
function setPreviewMonthFromInput(year, month) {
  previewMonth = { year, month: month - 1 };
  renderPreview();
}
function goPrevWeek() {
  const weekStart = getPreviewWeekStart();
  weekStart.setDate(weekStart.getDate() - 7);
  previewWeekStart = new Date(weekStart);
  renderPreview();
}
function goNextWeek() {
  const weekStart = getPreviewWeekStart();
  weekStart.setDate(weekStart.getDate() + 7);
  previewWeekStart = new Date(weekStart);
  renderPreview();
}
function goPrevMonth() {
  const { year, month } = getPreviewMonth();
  if (month === 0) previewMonth = { year: year - 1, month: 11 };
  else previewMonth = { year, month: month - 1 };
  renderPreview();
}
function goNextMonth() {
  const { year, month } = getPreviewMonth();
  if (month === 11) previewMonth = { year: year + 1, month: 0 };
  else previewMonth = { year, month: month + 1 };
  renderPreview();
}
function goToToday() {
  const today = new Date();
  if (previewViewMode === 'weekly') {
    previewWeekStart = getWeekStart(today);
    renderPreview();
  } else {
    previewMonth = { year: today.getFullYear(), month: today.getMonth() };
    renderPreview();
  }
}

function getCellDataForDate(dateStr, hour) {
  const d = parseDateYMD(dateStr);
  const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const weekStart = new Date(d);
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  weekStart.setDate(d.getDate() + diff);
  return getCellData(dayIndex, hour, weekStart);
}
function getDaySummary(dateStr) {
  let openHours = 0;
  let hasOpenOverride = false;
  let hasCapacityOverride = false;
  let capacityOverride = null;
  for (let hour = 0; hour < 24; hour++) {
    const data = getCellDataForDate(dateStr, hour);
    if (data && data.ruleType === 'exception-closed') continue;
    if (data && data.ruleType !== 'exception-closed') {
      openHours++;
      if (data.ruleType === 'exception-open') hasOpenOverride = true;
      if (data.ruleType === 'exception' && data.isOverride) {
        hasCapacityOverride = true;
        capacityOverride = data.capacityValue;
      }
    }
  }
  const allClosed = openHours === 0;
  return {
    allClosed,
    hasOpenOverride,
    hasCapacityOverride,
    capacityOverride: hasCapacityOverride ? capacityOverride : null,
  };
}
/** Hours with no rule → no capacity assigned (unavailable for booking). */
function countGaps() {
  const weekStart = getPreviewWeekStart();
  let count = 0;
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const data = getCellData(day, hour, weekStart);
      if (!data) count++;
    }
  }
  return count;
}

function getTotalHoursInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate() * 24;
}

function countGapsForMonth(year, month) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    for (let hour = 0; hour < 24; hour++) {
      if (!getCellDataForDate(dateStr, hour)) count++;
    }
  }
  return count;
}

/** Weekly preview: partition hours into bookable (rules), special-day closed, and gaps (no rule). */
function countWeeklyHourBuckets() {
  const weekStart = getPreviewWeekStart();
  let gaps = 0;
  let specialClosed = 0;
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const data = getCellData(day, hour, weekStart);
      if (!data) gaps++;
      else if (data.ruleType === 'exception-closed') specialClosed++;
    }
  }
  const totalH = 7 * 24;
  const bookable = totalH - gaps - specialClosed;
  return { gaps, specialClosed, bookable, totalH };
}

/** Monthly preview: same partition as weekly. */
function countMonthlyHourBuckets(year, month) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  let gaps = 0;
  let specialClosed = 0;
  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    for (let hour = 0; hour < 24; hour++) {
      const data = getCellDataForDate(dateStr, hour);
      if (!data) gaps++;
      else if (data.ruleType === 'exception-closed') specialClosed++;
    }
  }
  const totalH = lastDay * 24;
  const bookable = totalH - gaps - specialClosed;
  return { gaps, specialClosed, bookable, totalH };
}

function formatDays(days) {
  if (days.length === 7) return 'Mon–Sun';
  if (days.length === 5 && [0, 1, 2, 3, 4].every((d) => days.includes(d))) return 'Mon–Fri';
  if (days.length === 2 && days.includes(5) && days.includes(6)) return 'Sat–Sun';
  return days.map((d) => DAYS[d]).join(', ');
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatExceptionDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function formatCardPartyMetaLine(record) {
  const vals = getPartyValues(record);
  return `${vals.max_parties} groups · ${vals.min_people}-${vals.max_people} pax`;
}

function renderCards() {
  const container = $('cards-container');
  const emptyState = $('empty-state');
  container.querySelectorAll('.card').forEach((el) => el.remove());
  if (rules.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  rules.forEach((rule, index) => {
    const card = document.createElement('div');
    card.className = 'card card-rule-row';
    card.dataset.id = rule.id;
    card.dataset.index = index;
    const daysLabel = formatDays(rule.days);
    const metaStr = formatCardPartyMetaLine(rule);
    const timeFmt = `${rule.timeStart} - ${rule.timeEnd}`;
    const ov = hasPartyOverride(rule);
    const tagClass = ov ? 'tag-outline tag-info' : 'tag-outline tag-positive';
    const tagLabel = ov ? 'Override' : 'Base capacity';
    card.innerHTML = `
      <span class="card-drag" draggable="true" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
      <div class="card-body">
        <div class="card-title">${daysLabel} · ${timeFmt}</div>
        <div class="card-meta">${metaStr}</div>
      </div>
      <div class="card-trailing">
        <span class="${tagClass}">${tagLabel}</span>
        <span class="card-chevron" aria-hidden="true"></span>
      </div>
    `;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Open rule: ${daysLabel}, ${timeFmt}`);
    const dragEl = card.querySelector('.card-drag');
    dragEl.addEventListener('dragstart', onDragStart);
    dragEl.addEventListener('dragend', onDragEnd);
    card.addEventListener('dragover', onDragOver);
    card.addEventListener('drop', onDrop);
    card.addEventListener('click', (ev) => {
      if (ignoreNextCardClick || ev.target.closest('.card-drag')) return;
      openModal(rule.id);
    });
    card.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      if (document.activeElement !== card) return;
      ev.preventDefault();
      openModal(rule.id);
    });
    card.addEventListener('mouseenter', () => onCardHover(rule.id, true));
    card.addEventListener('mouseleave', () => onCardHover(null, false));
    container.appendChild(card);
  });
}

function onCardHover(ruleId, enter) {
  const panel = $('panel-preview');
  const cards = document.querySelectorAll('.card');
  const exceptionCards = document.querySelectorAll('.exception-card');
  const timelineBlocks = panel.querySelectorAll('.preview-timeline-block');
  if (enter && ruleId) {
    panel.dataset.hoverRule = ruleId;
    cards.forEach((c) => { if (c.dataset.id === ruleId) c.classList.add('highlight-rule'); });
    exceptionCards.forEach((c) => { if (c.dataset.exceptionId === ruleId) c.classList.add('highlight-rule'); });
    timelineBlocks.forEach((b) => { if (b.dataset.ruleId === ruleId) b.classList.add('highlight-by-rule'); });
  } else {
    delete panel.dataset.hoverRule;
    cards.forEach((c) => c.classList.remove('highlight-rule'));
    exceptionCards.forEach((c) => c.classList.remove('highlight-rule'));
    timelineBlocks.forEach((b) => b.classList.remove('highlight-by-rule'));
  }
}

function buildDaySegmentsParty(day, weekStart) {
  const segments = [];
  for (let h = 0; h < 24; h++) {
    const d = getCellData(day, h, weekStart);
    const key = slotDataKey(d);
    const last = segments[segments.length - 1];
    if (last && last.key === key) {
      last.endH = h + 1;
    } else {
      segments.push({ key, startH: h, endH: h + 1, data: d });
    }
  }
  return segments;
}

function formatTimelineRangeParty(startH, endH) {
  return `${String(startH).padStart(2, '0')}:00 – ${String(endH).padStart(2, '0')}:00`;
}

function partyBlockMainLine(d) {
  const vals = getPartyValues(d.rule);
  const range = `${vals.min_people}–${vals.max_people} pax`;
  return `${vals.max_parties} groups (${range})`;
}

function renderPreview() {
  const isWeekly = previewViewMode === 'weekly';
  const gridWrap = $('preview-grid-wrap');
  const calendarWrap = $('preview-calendar-wrap');
  const weekBlock = $('preview-week-block');
  const monthBlock = $('preview-month-block');
  if (gridWrap) gridWrap.hidden = !isWeekly;
  if (calendarWrap) calendarWrap.hidden = isWeekly;
  if (weekBlock) {
    weekBlock.hidden = !isWeekly;
    weekBlock.style.display = isWeekly ? '' : 'none';
  }
  if (monthBlock) {
    monthBlock.hidden = isWeekly;
    monthBlock.style.display = isWeekly ? 'none' : '';
  }
  const weekStart = getPreviewWeekStart();
  const weekPicker = $('week-picker');
  if (weekPicker) weekPicker.value = dateToYMD(weekStart);
  const { year, month } = getPreviewMonth();
  const monthPicker = $('month-picker');
  if (monthPicker) monthPicker.value = `${year}-${String(month + 1).padStart(2, '0')}`;
  updateMonthDisplay();
  if (isWeekly) {
    renderWeeklyPreview(weekStart);
  } else {
    renderCalendarView();
  }
  updateGapsBanner();
}

function updateMonthDisplay() {
  const { year, month } = getPreviewMonth();
  const display = $('month-display');
  if (display) display.textContent = `${MONTHS[month]} ${year}`;
}

function renderWeeklyPreview(weekStart) {
  const grid = $('preview-grid');
  grid.innerHTML = '';
  grid.className = 'preview-grid preview-timeline';

  const span = PREVIEW_AXIS_END - PREVIEW_AXIS_START;
  const colHeightPx = span * PREVIEW_PX_PER_HOUR;

  const headerRow = document.createElement('div');
  headerRow.className = 'preview-timeline-header';
  const corner = document.createElement('div');
  corner.className = 'preview-timeline-corner';
  headerRow.appendChild(corner);
  DAYS.forEach((label, dayIndex) => {
    const h = document.createElement('div');
    h.className = 'preview-timeline-day-head';
    const dayDate = new Date(weekStart);
    dayDate.setDate(dayDate.getDate() + dayIndex);
    h.innerHTML = `<span class="header-day-name">${label}</span><span class="header-day-date">${dayDate.getDate()} ${MONTHS[dayDate.getMonth()]}</span>`;
    headerRow.appendChild(h);
  });
  grid.appendChild(headerRow);

  const body = document.createElement('div');
  body.className = 'preview-timeline-body';

  const timeCol = document.createElement('div');
  timeCol.className = 'preview-timeline-time-col';
  timeCol.style.height = `${colHeightPx}px`;
  for (let t = PREVIEW_AXIS_START; t < PREVIEW_AXIS_END; t += 2) {
    const lab = document.createElement('div');
    lab.className = 'preview-timeline-time-label';
    lab.textContent = `${String(t).padStart(2, '0')}:00`;
    lab.style.top = `${((t - PREVIEW_AXIS_START) / span) * 100}%`;
    timeCol.appendChild(lab);
  }
  body.appendChild(timeCol);

  const dayColsWrap = document.createElement('div');
  dayColsWrap.className = 'preview-timeline-days';
  for (let day = 0; day < 7; day++) {
    const col = document.createElement('div');
    col.className = 'preview-timeline-day-col';
    col.style.height = `${colHeightPx}px`;
    col.style.setProperty('--timeline-hours', String(span));

    const segments = buildDaySegmentsParty(day, weekStart);
    segments.forEach((seg) => {
      if (seg.key === 'gap') return;
      const clipStart = Math.max(seg.startH, PREVIEW_AXIS_START);
      const clipEnd = Math.min(seg.endH, PREVIEW_AXIS_END);
      if (clipStart >= clipEnd) return;
      const d = seg.data;
      const topPx = ((clipStart - PREVIEW_AXIS_START) / span) * colHeightPx;
      let hPx = ((clipEnd - clipStart) / span) * colHeightPx;
      const minBlockPx = 26;
      if (hPx < minBlockPx) hPx = minBlockPx;

      const block = document.createElement('div');
      block.className = 'preview-timeline-block';
      block.dataset.ruleId = d.ruleId;
      block.style.top = `${topPx}px`;
      block.style.height = `${hPx}px`;

      const isClosed = d.ruleType === 'exception-closed';
      const timeStr = formatTimelineRangeParty(clipStart, clipEnd);
      if (isClosed) {
        block.classList.add('preview-timeline-block--closed');
        block.innerHTML = `<div class="ptb-main">Closed</div><div class="ptb-sub">${timeStr}</div>`;
      } else {
        block.classList.add('preview-timeline-block--available');
        if (d.ruleType === 'exception' || d.ruleType === 'exception-open') {
          block.classList.add('preview-timeline-block--exception');
        }
        if (d.isOverride) block.classList.add('preview-timeline-block--override');
        const dot = d.isOverride ? '<span class="ptb-dot" aria-label="groups override"></span>' : '';
        block.innerHTML = `<div class="ptb-main">${partyBlockMainLine(d)} ${dot}</div><div class="ptb-sub">${timeStr}</div>`;
      }
      block.title = isClosed
        ? `${d.sourceLabel}\n${timeStr}`
        : `${d.sourceLabel}\n${d.capacityLabel}\n${d.precedenceLabel}${d.overlapNote || ''}\n${timeStr}`;
      block.addEventListener('mouseenter', (e) => showCellTooltip(e, day, clipStart, d));
      block.addEventListener('mouseleave', hideCellTooltip);
      block.addEventListener('mousemove', moveCellTooltip);
      col.appendChild(block);
    });
    dayColsWrap.appendChild(col);
  }
  body.appendChild(dayColsWrap);
  grid.appendChild(body);
}

function renderCalendarView() {
  const container = $('preview-calendar');
  if (!container) return;
  container.innerHTML = '';
  const { year, month } = getPreviewMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const daysInMonth = last.getDate();
  let startDow = first.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  const headerRow = document.createElement('div');
  headerRow.className = 'calendar-row calendar-header';
  DAYS.forEach((d) => {
    const c = document.createElement('div');
    c.className = 'calendar-day-header';
    c.textContent = d;
    headerRow.appendChild(c);
  });
  container.appendChild(headerRow);
  const rows = [];
  let row = document.createElement('div');
  row.className = 'calendar-row';
  for (let i = 0; i < startDow; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day-cell calendar-day-empty';
    row.appendChild(empty);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const sum = getDaySummary(dateStr);
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell';
    cell.dataset.date = dateStr;
    cell.title = dateStr;
    if (sum.allClosed) {
      cell.classList.add('calendar-day-closed');
      cell.textContent = '\u2715';
    } else if (sum.hasCapacityOverride) {
      cell.classList.add('calendar-day-open', 'calendar-day-override');
      cell.textContent = sum.capacityOverride;
      const dot = document.createElement('span');
      dot.className = 'cell-dot-marker';
      cell.appendChild(dot);
    } else if (sum.hasOpenOverride) {
      cell.classList.add('calendar-day-open-override');
      cell.textContent = '\u2713';
    } else {
      cell.classList.add('calendar-day-open');
      cell.textContent = '\u2713';
    }
    row.appendChild(cell);
    if (row.children.length === 7) {
      rows.push(row);
      row = document.createElement('div');
      row.className = 'calendar-row';
    }
  }
  while (row.children.length > 0 && row.children.length < 7) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day-cell calendar-day-empty';
    row.appendChild(empty);
  }
  if (row.children.length) rows.push(row);
  rows.forEach((r) => container.appendChild(r));
}

function showCellTooltip(e, day, hour, data) {
  const tooltip = $('cell-tooltip');
  if (data) {
    if (data.ruleType === 'exception-closed') {
      tooltip.innerHTML = `<strong>${data.sourceLabel}</strong>The asset is closed by an exception at this date/time.`;
    } else {
      const overrideTag = data.isOverride ? '<span class="tooltip-tag">override</span>' : '<span class="tooltip-tag tooltip-tag-default">base capacity</span>';
      const precedence = `${data.precedenceLabel}${data.overlapNote || ''}`;
      tooltip.innerHTML = `<strong>${data.sourceLabel}</strong>${data.capacityLabel} ${overrideTag}<br><em>${precedence}</em>`;
    }
  } else {
    tooltip.innerHTML = '<strong>Unavailable</strong>No availability is set for this time. Add weekly hours to make it bookable.';
  }
  tooltip.hidden = false;
  moveCellTooltip(e);
}
function hideCellTooltip() {
  $('cell-tooltip').hidden = true;
}
function moveCellTooltip(e) {
  const tooltip = $('cell-tooltip');
  if (tooltip.hidden) return;
  const x = e.clientX;
  const y = e.clientY;
  const offset = 10;
  const rect = tooltip.getBoundingClientRect();
  let left = x + offset;
  let top = y + offset;
  if (left + rect.width > window.innerWidth) left = x - rect.width - offset;
  if (top + rect.height > window.innerHeight) top = y - rect.height - offset;
  if (top < 0) top = offset;
  if (left < 0) left = offset;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

const HOURS_PER_WEEK = 7 * 24;

function formatStatsWeekRange(weekStart) {
  const mon = new Date(weekStart);
  const sun = new Date(weekStart);
  sun.setDate(sun.getDate() + 6);
  const dMon = mon.getDate();
  const dSun = sun.getDate();
  const mMon = mon.getMonth();
  const mSun = sun.getMonth();
  const yMon = mon.getFullYear();
  const ySun = sun.getFullYear();
  if (yMon === ySun && mMon === mSun) {
    return `Mon ${dMon} – Sun ${dSun} ${MONTHS[mMon]} ${yMon}`;
  }
  if (yMon === ySun) {
    return `Mon ${dMon} ${MONTHS[mMon]} – Sun ${dSun} ${MONTHS[mSun]} ${yMon}`;
  }
  return `Mon ${dMon} ${MONTHS[mMon]} ${yMon} – Sun ${dSun} ${MONTHS[mSun]} ${ySun}`;
}

function formatStatsMonthPeriod(year, month) {
  const days = new Date(year, month + 1, 0).getDate();
  return `${MONTHS[month]} ${year} · ${days} days`;
}

function updateGapsBanner() {
  const banner = $('gaps-banner');
  const segBook = $('week-stats-seg-bookable');
  const segSpecial = $('week-stats-seg-special');
  const segGap = $('week-stats-seg-gap');
  const txtBook = $('stats-bookable-text');
  const txtSpecial = $('stats-special-text');
  const txtGap = $('stats-gap-text');
  const metricSpecial = $('week-stats-metric-special');
  const cta = $('week-stats-cta');
  const rangeEl = $('week-stats-range');
  const headingEl = $('preview-week-stats-heading');
  const totalEl = $('preview-stats-total');
  if (!banner || !segBook || !segGap || !txtBook || !txtGap) return;

  const isWeekly = previewViewMode === 'weekly';
  let totalH;
  let periodLabel;
  let bookable;
  let gaps;
  let specialClosed;
  if (isWeekly) {
    const buckets = countWeeklyHourBuckets();
    ({ bookable, gaps, specialClosed, totalH } = buckets);
    periodLabel = formatStatsWeekRange(getPreviewWeekStart());
    if (headingEl) headingEl.textContent = 'Weekly coverage';
  } else {
    const { year, month } = getPreviewMonth();
    const buckets = countMonthlyHourBuckets(year, month);
    ({ bookable, gaps, specialClosed, totalH } = buckets);
    periodLabel = formatStatsMonthPeriod(year, month);
    if (headingEl) headingEl.textContent = 'Monthly coverage';
  }
  if (rangeEl) rangeEl.textContent = periodLabel;
  if (totalEl) totalEl.textContent = `${totalH} h total`;

  const showBanner = gaps > 0 || specialClosed > 0;
  if (!showBanner) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;

  segBook.style.flex = `${bookable} 1 0`;
  if (segSpecial) {
    segSpecial.style.flex = `${specialClosed} 1 0`;
    segSpecial.dataset.hasHours = specialClosed > 0 ? '1' : '0';
  }
  segGap.style.flex = `${gaps} 1 0`;
  segBook.dataset.hasHours = bookable > 0 ? '1' : '0';
  segGap.dataset.hasHours = gaps > 0 ? '1' : '0';

  const bookLabel = isWeekly ? 'with weekly hours' : 'with rules (weekly or override)';
  txtBook.textContent = bookable === 1 ? `1 h ${bookLabel}` : `${bookable} h ${bookLabel}`;
  if (txtSpecial && metricSpecial) {
    metricSpecial.hidden = false;
    txtSpecial.textContent =
      specialClosed === 0
        ? '0h closed (special day)'
        : specialClosed === 1
          ? '1 h closed (special day)'
          : `${specialClosed} h closed (special day)`;
  }
  txtGap.textContent = gaps === 1 ? '1 h not set' : `${gaps} h not set`;

  if (cta) {
    cta.hidden = gaps === 0;
  }

  banner.setAttribute(
    'aria-label',
    `${periodLabel}. Total ${totalH} hours. Bookable: ${bookable}. Closed on special days: ${specialClosed}. Not set: ${gaps}.${gaps > 0 ? ' Add weekly hours to cover gaps.' : ''}`,
  );
}

function getFormData() {
  const days = Array.from(document.querySelectorAll('input[name="day"]:checked')).map((el) => parseInt(el.value, 10));
  const timeStart = $('time-start').value;
  const timeEnd = $('time-end').value;
  const maxParties = $('max-parties').value.trim();
  const minPeople = $('min-people-per-party').value.trim();
  const maxPeople = $('max-people-per-party').value.trim();
  return {
    days,
    timeStart,
    timeEnd,
    max_parties: maxParties ? parseInt(maxParties, 10) : null,
    min_people_per_party: minPeople ? parseInt(minPeople, 10) : null,
    max_people_per_party: maxPeople ? parseInt(maxPeople, 10) : null,
  };
}

function openModal(ruleId = null) {
  editingId = ruleId;
  clearFormError();
  const modal = $('modal-overlay');
  $('modal-title').textContent = ruleId ? 'Edit recurring rule' : 'New recurring rule';
  const form = $('rule-form');
  form.reset();
  if (ruleId) {
    const rule = rules.find((r) => r.id === ruleId);
    if (rule) {
      rule.days.forEach((d) => {
        const cb = document.querySelector(`input[name="day"][value="${d}"]`);
        if (cb) cb.checked = true;
      });
      $('time-start').value = rule.timeStart;
      $('time-end').value = rule.timeEnd;
      $('max-parties').value = rule.max_parties != null ? rule.max_parties : '';
      $('min-people-per-party').value = rule.min_people_per_party != null ? rule.min_people_per_party : '';
      $('max-people-per-party').value = rule.max_people_per_party != null ? rule.max_people_per_party : '';
    }
  } else {
    $('time-start').value = '09:00';
    $('time-end').value = '21:00';
  }
  const delBtn = $('modal-delete-rule');
  if (delBtn) {
    const editingExisting =
      ruleId != null &&
      String(ruleId) !== '' &&
      rules.some((r) => r.id === ruleId);
    delBtn.hidden = !editingExisting;
    delBtn.setAttribute('aria-hidden', editingExisting ? 'false' : 'true');
    delBtn.tabIndex = editingExisting ? 0 : -1;
  }
  modal.hidden = false;
}

function closeModal() {
  $('modal-overlay').hidden = true;
  const delBtn = $('modal-delete-rule');
  if (delBtn) {
    delBtn.hidden = true;
    delBtn.setAttribute('aria-hidden', 'true');
    delBtn.tabIndex = -1;
  }
  editingId = null;
}

function showFormError(message) {
  const el = $('form-error');
  el.textContent = message;
  el.hidden = false;
}
function clearFormError() {
  const el = $('form-error');
  el.textContent = '';
  el.hidden = true;
}

function timeRangesOverlap(start1, end1, start2, end2) {
  const s1 = parseTime(start1);
  const e1 = parseTime(end1);
  const s2 = parseTime(start2);
  const e2 = parseTime(end2);
  return s1 < e2 && e1 > s2;
}

function addOrUpdateRule(e) {
  e.preventDefault();
  clearFormError();
  const { days, timeStart, timeEnd, max_parties, min_people_per_party, max_people_per_party } = getFormData();
  if (days.length === 0) {
    showFormError('Select at least one day.');
    return;
  }
  if (timeEnd <= timeStart) {
    showFormError('End time must be after start time.');
    return;
  }
  if (editingId) {
    const rule = rules.find((r) => r.id === editingId);
    if (rule) {
      rule.days = days;
      rule.timeStart = timeStart;
      rule.timeEnd = timeEnd;
      rule.max_parties = max_parties;
      rule.min_people_per_party = min_people_per_party;
      rule.max_people_per_party = max_people_per_party;
    }
  } else {
    rules.unshift({
      id: uid(),
      days,
      timeStart,
      timeEnd,
      max_parties,
      min_people_per_party,
      max_people_per_party,
    });
  }
  closeModal();
  renderCards();
  renderPreview();
}

function snapshotExceptionPreviewNav() {
  return {
    weekStart: previewWeekStart ? new Date(previewWeekStart.getTime()) : null,
    month: previewMonth ? { year: previewMonth.year, month: previewMonth.month } : null,
  };
}

function focusPreviewOnExceptionDate(ex) {
  const d = parseDateYMD(ex.dateStart);
  previewWeekStart = getWeekStart(new Date(d.getTime()));
  previewMonth = { year: d.getFullYear(), month: d.getMonth() };
  renderPreview();
}

function restoreExceptionPreviewNav() {
  if (exceptionPreviewHoverSnapshot == null) return;
  const s = exceptionPreviewHoverSnapshot;
  exceptionPreviewHoverSnapshot = null;
  previewWeekStart = s.weekStart ? new Date(s.weekStart.getTime()) : null;
  previewMonth = s.month ? { year: s.month.year, month: s.month.month } : null;
  renderPreview();
}

function onExceptionCardMouseEnter(ex) {
  if (exceptionPreviewHoverSnapshot == null) {
    exceptionPreviewHoverSnapshot = snapshotExceptionPreviewNav();
  }
  focusPreviewOnExceptionDate(ex);
  onCardHover(ex.id, true);
}

function onExceptionCardMouseLeave(e) {
  onCardHover(null, false);
  const t = e.relatedTarget;
  if (t && typeof t.closest === 'function' && t.closest('.exception-card')) {
    return;
  }
  restoreExceptionPreviewNav();
}

function renderExceptions() {
  const container = $('exceptions-container');
  const emptyEl = $('exceptions-empty');
  container.querySelectorAll('.exception-card').forEach((el) => el.remove());
  if (exceptions.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  const sorted = [...exceptions].sort((a, b) => a.dateStart.localeCompare(b.dateStart));
  sorted.forEach((ex) => {
    const card = document.createElement('div');
    card.className = 'exception-card';
    card.dataset.exceptionId = ex.id;
    const titleStr = ex.dateEnd && ex.dateEnd !== ex.dateStart
      ? `${formatExceptionDate(ex.dateStart)} - ${formatExceptionDate(ex.dateEnd)}`
      : formatExceptionDate(ex.dateStart);
    const timeFmt = ex.allDay ? 'All day' : `${ex.timeStart} - ${ex.timeEnd}`;
    const vals = getPartyValues(ex);
    const gLine = `${vals.max_parties} groups · ${vals.min_people}-${vals.max_people} pax`;
    let metaStr;
    let tagClass;
    let tagLabel;
    if (!ex.available) {
      metaStr = timeFmt;
      tagClass = 'tag-outline tag-danger';
      tagLabel = 'Closed';
    } else if (hasPartyOverride(ex)) {
      metaStr = ex.allDay ? `All day · ${gLine}` : `${timeFmt} · ${gLine}`;
      tagClass = 'tag-outline tag-accent';
      tagLabel = 'Override';
    } else {
      metaStr = ex.allDay ? `All day · ${gLine}` : `${timeFmt} · ${gLine}`;
      tagClass = 'tag-outline tag-positive';
      tagLabel = 'Open';
    }
    card.innerHTML = `
      <div class="exception-card-body">
        <div class="exception-card-title">${titleStr}</div>
        <div class="exception-card-meta">${metaStr}</div>
      </div>
      <div class="card-trailing">
        <span class="${tagClass}">${tagLabel}</span>
        <span class="card-chevron" aria-hidden="true"></span>
      </div>
    `;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Open exception: ${titleStr}`);
    card.addEventListener('click', () => openExceptionModal(ex.id));
    card.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      if (document.activeElement !== card) return;
      ev.preventDefault();
      openExceptionModal(ex.id);
    });
    card.addEventListener('mouseenter', () => onExceptionCardMouseEnter(ex));
    card.addEventListener('mouseleave', (e) => onExceptionCardMouseLeave(e));
    container.appendChild(card);
  });
}

function getExceptionFormData() {
  const dateStart = $('exception-date-start').value;
  const dateEnd = ($('exception-date-end').value || '').trim() || dateStart;
  const allDay = $('exception-all-day').checked;
  const timeStart = allDay ? '00:00' : $('exception-time-start').value;
  const timeEnd = allDay ? '24:00' : $('exception-time-end').value;
  const available = document.querySelector('input[name="exception-available"]:checked')?.value === 'true';
  const maxParties = $('exception-max-parties').value.trim();
  const minPeople = $('exception-min-people').value.trim();
  const maxPeople = $('exception-max-people').value.trim();
  return {
    dateStart,
    dateEnd,
    allDay,
    timeStart,
    timeEnd,
    available,
    max_parties: maxParties ? parseInt(maxParties, 10) : null,
    min_people_per_party: minPeople ? parseInt(minPeople, 10) : null,
    max_people_per_party: maxPeople ? parseInt(maxPeople, 10) : null,
  };
}

function openExceptionModal(exId = null) {
  editingExceptionId = exId;
  const overlay = $('exception-modal-overlay');
  $('exception-modal-title').textContent = exId ? 'Edit special days' : 'Special days';
  const errEl = $('exception-form-error');
  errEl.textContent = '';
  errEl.hidden = true;
  const form = $('exception-form');
  form.reset();
  const today = dateToYMD(new Date());
  $('exception-date-start').value = today;
  $('exception-date-end').value = '';
  $('exception-all-day').checked = false;
  $('exception-time-start').value = '09:00';
  $('exception-time-end').value = '21:00';
  $('exception-max-parties').value = '';
  $('exception-min-people').value = '';
  $('exception-max-people').value = '';
  const availableRadio = document.querySelector('input[name="exception-available"][value="true"]');
  if (availableRadio) availableRadio.checked = true;
  if (exId) {
    const ex = exceptions.find((e) => e.id === exId);
    if (ex) {
      $('exception-date-start').value = ex.dateStart;
      $('exception-date-end').value = ex.dateEnd || ex.dateStart;
      $('exception-all-day').checked = !!ex.allDay;
      $('exception-time-start').value = ex.timeStart || '09:00';
      $('exception-time-end').value = ex.timeEnd || '21:00';
      document.querySelector(`input[name="exception-available"][value="${ex.available}"]`).checked = true;
      $('exception-max-parties').value = ex.max_parties != null ? ex.max_parties : '';
      $('exception-min-people').value = ex.min_people_per_party != null ? ex.min_people_per_party : '';
      $('exception-max-people').value = ex.max_people_per_party != null ? ex.max_people_per_party : '';
    }
  }
  toggleExceptionAllDay();
  toggleExceptionAvailable();
  const delEx = $('modal-delete-exception');
  if (delEx) {
    const editingExisting =
      exId != null &&
      String(exId) !== '' &&
      exceptions.some((e) => e.id === exId);
    delEx.hidden = !editingExisting;
    delEx.setAttribute('aria-hidden', editingExisting ? 'false' : 'true');
    delEx.tabIndex = editingExisting ? 0 : -1;
  }
  overlay.hidden = false;
}

function toggleExceptionAllDay() {
  const allDay = $('exception-all-day').checked;
  $('exception-time-row').hidden = allDay;
}
function toggleExceptionAvailable() {
  const available = document.querySelector('input[name="exception-available"]:checked')?.value === 'true';
  $('exception-capacity-field').hidden = !available;
}

function closeExceptionModal() {
  $('exception-modal-overlay').hidden = true;
  const delEx = $('modal-delete-exception');
  if (delEx) {
    delEx.hidden = true;
    delEx.setAttribute('aria-hidden', 'true');
    delEx.tabIndex = -1;
  }
  editingExceptionId = null;
}

function addOrUpdateException(e) {
  e.preventDefault();
  const data = getExceptionFormData();
  const errEl = $('exception-form-error');
  errEl.hidden = true;
  if (data.dateEnd < data.dateStart) {
    errEl.textContent = 'End date must be on or after start date.';
    errEl.hidden = false;
    return;
  }
  if (!data.allDay && data.timeEnd <= data.timeStart) {
    errEl.textContent = 'End time must be after start time.';
    errEl.hidden = false;
    return;
  }
  if (editingExceptionId) {
    const ex = exceptions.find((e) => e.id === editingExceptionId);
    if (ex) {
      ex.dateStart = data.dateStart;
      ex.dateEnd = data.dateEnd;
      ex.allDay = data.allDay;
      ex.timeStart = data.timeStart;
      ex.timeEnd = data.timeEnd;
      ex.available = data.available;
      ex.max_parties = data.max_parties;
      ex.min_people_per_party = data.min_people_per_party;
      ex.max_people_per_party = data.max_people_per_party;
    }
  } else {
    exceptions.push({
      id: uid(),
      dateStart: data.dateStart,
      dateEnd: data.dateEnd,
      allDay: data.allDay,
      timeStart: data.timeStart,
      timeEnd: data.timeEnd,
      available: data.available,
      max_parties: data.max_parties,
      min_people_per_party: data.min_people_per_party,
      max_people_per_party: data.max_people_per_party,
    });
  }
  closeExceptionModal();
  renderExceptions();
  renderPreview();
}

function onDragStart(e) {
  dragSrc = e.target.closest('.card');
  if (!dragSrc) return;
  dragSrc.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrc.dataset.id);
}
function onDragEnd(e) {
  const card = e.target.closest('.card');
  if (card) card.classList.remove('dragging');
  dragSrc = null;
  ignoreNextCardClick = true;
  setTimeout(() => {
    ignoreNextCardClick = false;
  }, 100);
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}
function onDrop(e) {
  e.preventDefault();
  const target = e.target.closest('.card');
  if (!target || !dragSrc || target === dragSrc) return;
  const id = dragSrc.dataset.id;
  const rule = rules.find((r) => r.id === id);
  if (!rule) return;
  const container = $('cards-container');
  const all = [...container.querySelectorAll('.card')];
  const fromIdx = all.indexOf(dragSrc);
  const toIdx = all.indexOf(target);
  if (fromIdx === -1 || toIdx === -1) return;
  const newRules = [...rules];
  newRules.splice(fromIdx, 1);
  newRules.splice(toIdx, 0, rule);
  rules = newRules;
  renderCards();
  renderPreview();
}

function initDayCheckboxes() {
  const container = $('day-checkboxes');
  DAYS.forEach((dayLabel, i) => {
    const labelEl = document.createElement('label');
    labelEl.className = 'day-tile-label';
    labelEl.innerHTML = `<input type="checkbox" name="day" value="${i}" /><span class="day-tile-text">${dayLabel}</span>`;
    container.appendChild(labelEl);
  });
}

function init() {
  initDayCheckboxes();
  renderExceptions();
  renderPreview();
  $('btn-add').addEventListener('click', () => openModal());
  $('modal-close').addEventListener('click', closeModal);
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-overlay').addEventListener('click', (e) => {
    if (e.target === $('modal-overlay')) closeModal();
  });
  $('rule-form').addEventListener('submit', addOrUpdateRule);
  const btnDelRule = $('modal-delete-rule');
  if (btnDelRule) {
    btnDelRule.addEventListener('click', () => {
      if (!editingId) return;
      const id = editingId;
      if (!confirm('Delete this rule?')) return;
      rules = rules.filter((r) => r.id !== id);
      closeModal();
      renderCards();
      renderPreview();
    });
  }
  const btnDelEx = $('modal-delete-exception');
  if (btnDelEx) {
    btnDelEx.addEventListener('click', () => {
      if (!editingExceptionId) return;
      const id = editingExceptionId;
      if (!confirm('Delete this exception?')) return;
      exceptions = exceptions.filter((e) => e.id !== id);
      closeExceptionModal();
      renderExceptions();
      renderPreview();
    });
  }
  document.querySelectorAll('input[name="preview-view"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      previewViewMode = e.target.value === 'monthly' ? 'calendar' : 'weekly';
      renderPreview();
    });
  });
  const navPrev = $('nav-prev');
  const navNext = $('nav-next');
  if (navPrev) navPrev.addEventListener('click', () => previewViewMode === 'weekly' ? goPrevWeek() : goPrevMonth());
  if (navNext) navNext.addEventListener('click', () => previewViewMode === 'weekly' ? goNextWeek() : goNextMonth());
  const btnToday = $('btn-today');
  if (btnToday) btnToday.addEventListener('click', goToToday);
  const weekPicker = $('week-picker');
  if (weekPicker) {
    weekPicker.addEventListener('change', () => {
      if (weekPicker.value) setPreviewWeekFromDateInput(weekPicker.value);
    });
  }
  const monthPicker = $('month-picker');
  if (monthPicker) {
    monthPicker.addEventListener('change', () => {
      const v = monthPicker.value;
      if (v) {
        const [y, m] = v.split('-').map(Number);
        setPreviewMonthFromInput(y, m);
      }
    });
  }
  const monthBlock = $('preview-month-block');
  if (monthPicker && monthBlock) {
    monthBlock.addEventListener('click', () => monthPicker.click());
  }
  $('btn-add-exception').addEventListener('click', () => openExceptionModal());
  $('exception-modal-close').addEventListener('click', closeExceptionModal);
  $('exception-modal-cancel').addEventListener('click', closeExceptionModal);
  $('exception-modal-overlay').addEventListener('click', (e) => {
    if (e.target === $('exception-modal-overlay')) closeExceptionModal();
  });
  $('exception-form').addEventListener('submit', addOrUpdateException);
  const exceptionAllDay = document.getElementById('exception-all-day');
  if (exceptionAllDay) exceptionAllDay.addEventListener('change', toggleExceptionAllDay);
  document.querySelectorAll('input[name="exception-available"]').forEach((r) => r.addEventListener('change', toggleExceptionAvailable));
  const explanationToggle = $('explanation-toggle');
  const explanationContent = $('explanation-content');
  if (explanationToggle && explanationContent) {
    explanationToggle.addEventListener('click', () => {
      const open = explanationContent.hidden;
      explanationContent.hidden = !open;
      explanationToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
}

init();
