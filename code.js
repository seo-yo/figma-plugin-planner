// MLB Planner Tools - Figma Plugin
// 기획자용: 퍼블 요소 표 / 랜딩 URL 표 / 버튼 마커 일괄 생성

figma.showUI(__html__, { width: 480, height: 820 });

const TEXT_NAMES = {
  no: "#no.n",
  content: "#content.n",
  url: "#url.n",
};

let _logBuffer = [];
function logUI(text) {
  _logBuffer.push(text);
  figma.ui.postMessage({ type: "log", text: _logBuffer.join("\n") });
}
function resetLog() {
  _logBuffer = [];
}

function getPageOf(node) {
  let p = node;
  while (p && p.type !== "PAGE") p = p.parent;
  return p;
}

function focusOn(node) {
  const page = getPageOf(node);
  if (page && page !== figma.currentPage) figma.currentPage = page;
  figma.currentPage.selection = [node];
  figma.viewport.scrollAndZoomIntoView([node]);
}

// ─── 컴포넌트 탐색 (currentPage만 스캔, 캐싱) ───
let _section = null;
let _tables = null;
let _rowComp = null;
let _btnComp = null;

function clearCache() {
  _section = _tables = _rowComp = _btnComp = null;
}

function findPublishingSection() {
  if (_section) return _section;
  _section = figma.currentPage.findOne((n) => n.name === "퍼블리싱 기획안");
  return _section;
}

function findRowComponent() {
  if (_rowComp) return _rowComp;
  const section = findPublishingSection();
  const scope = section || figma.currentPage;
  const found = scope.findOne(
    (n) => n.name === ".Row" && (n.type === "COMPONENT" || n.type === "INSTANCE")
  );
  if (!found) return null;
  _rowComp = found.type === "INSTANCE" ? found.mainComponent : found;
  return _rowComp;
}

function findTableByKind(kind) {
  const section = findPublishingSection();
  const scope = section || figma.currentPage;

  // 1) heading 텍스트 → 다음 형제 Table
  const headingText = HEADINGS[kind] || HEADINGS["pc-purpose"];
  const heading = scope.findOne(
    (n) => n.type === "TEXT" && n.characters.trim() === headingText
  );
  if (heading && heading.parent && "children" in heading.parent) {
    const siblings = heading.parent.children;
    const idx = siblings.indexOf(heading);
    for (let i = idx + 1; i < siblings.length; i++) {
      const c = siblings[i];
      if (c.name === "Table" && "children" in c) {
        logUI(`Table 매칭: "${headingText}" 다음 sibling`);
        return c;
      }
    }
  }

  // heading 매칭 실패 → null (createTableFromScratch로 새로 생성)
  return null;
}

// ─── 표 / 행을 처음부터 생성 ───
const HEAD_HEIGHT = 344;
const ROW_HEIGHT = 344;
const TABLE_FILL = { r: 0.2118, g: 0.2118, b: 0.2118 }; // #363636
const TABLE_STROKE = { r: 0.3569, g: 0.3569, b: 0.3569 }; // #5b5b5b

// 표 생성 위치 + 컬럼 폭 (kind별)
const TABLE_POS = {
  "pc-purpose": { x: 5096,  y: 453 },
  "pc-landing": { x: 5096,  y: 2917 },
  "mo-purpose": { x: 11500, y: 453 },
  "mo-landing": { x: 11500, y: 2917 },
};
const COL_WIDTHS = {
  "pc-purpose": { no: 400, content: 1126, url: 1126 },
  "pc-landing": { no: 400, content: 884,  url: 1368 },
  "mo-purpose": { no: 400, content: 1126, url: 1126 },
  "mo-landing": { no: 400, content: 884,  url: 1368 },
};
const HEADINGS = {
  "pc-purpose": "PC 퍼블리싱",
  "pc-landing": "PC 랜딩 URL",
  "mo-purpose": "MO 퍼블리싱",
  "mo-landing": "MO 랜딩 URL",
};
const KIND_LABELS = {
  "pc-purpose": "PC 퍼블 요소",
  "pc-landing": "PC URL",
  "mo-purpose": "MO 퍼블 요소",
  "mo-landing": "MO URL",
};
// kind → purpose|landing 분류 (auto-no 형식 결정용)
function kindFamily(kind) {
  return kind && kind.indexOf("landing") >= 0 ? "landing" : "purpose";
}
function tableWidth(kind) {
  const c = COL_WIDTHS[kind] || COL_WIDTHS["pc-purpose"];
  return c.no + c.content + c.url;
}

// 폰트 로드 (fallback 포함)
async function tryLoadFont(family, style) {
  try {
    await figma.loadFontAsync({ family, style });
    return { family, style };
  } catch (e) {
    return null;
  }
}

async function loadTableFonts() {
  const head =
    (await tryLoadFont("Pretendard Variable", "SemiBold")) ||
    (await tryLoadFont("Pretendard", "SemiBold")) ||
    (await tryLoadFont("Noto Sans KR", "Bold"));
  const noFont =
    (await tryLoadFont("Noto Sans", "Light")) ||
    (await tryLoadFont("Noto Sans KR", "Light")) ||
    (await tryLoadFont("Noto Sans KR", "Regular"));
  const contentFont =
    (await tryLoadFont("Noto Sans", "Regular")) ||
    (await tryLoadFont("Noto Sans KR", "Regular"));
  const urlFont = noFont;
  const markerFont =
    (await tryLoadFont("Noto Sans KR", "Bold")) ||
    (await tryLoadFont("Inter", "Bold"));
  return { head, no: noFont, content: contentFont, url: urlFont, marker: markerFont };
}

// 동기 마커 생성 (폰트 이미 로드된 상태)
function makeMarker(label, color, font, kind) {
  const frame = figma.createFrame();
  frame.name = `marker_${kind || "purpose"}_${label}`;
  frame.layoutMode = "HORIZONTAL";
  frame.primaryAxisAlignItems = "CENTER";
  frame.counterAxisAlignItems = "CENTER";
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  frame.paddingLeft = frame.paddingRight = 0;
  frame.paddingTop = frame.paddingBottom = 0;
  frame.resize(MARKER_W, MARKER_H);
  frame.cornerRadius = MARKER_RADIUS;
  frame.fills = [{ type: "SOLID", color }];
  frame.strokes = [];

  const t = figma.createText();
  t.fontName = font;
  t.fontSize = MARKER_FONT_SIZE;
  t.characters = label;
  t.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  frame.appendChild(t);

  return frame;
}

// No 컬럼 셀: 원본 테이블 스타일 — 평문 텍스트 (Noto Sans Light 80, 흰색).
// 텍스트 노드 이름을 `cell_no_<kind>_<label>` 로 지정해서 캔버스 클릭 시 arming 트리거로 인식.
function makeNoCellWithMarker(label, _color, markerFont, kind) {
  const w = (COL_WIDTHS[kind] || COL_WIDTHS["pc-purpose"]).no;
  const cell = figma.createFrame();
  cell.name = "Cell";
  cell.resize(w, ROW_HEIGHT);
  cell.clipsContent = true;
  // 다른 데이터 셀과 동일한 white @5% 톤
  cell.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.05 }];
  cell.strokes = [{ type: "SOLID", color: TABLE_STROKE }];
  cell.strokeWeight = 1;
  cell.strokeAlign = "INSIDE";

  const t = figma.createText();
  t.name = `cell_no_${kind || "pc-purpose"}_${label}`;
  t.fontName = markerFont;
  t.fontSize = 80;
  t.lineHeight = { value: 104, unit: "PIXELS" };
  t.characters = label;
  t.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  cell.appendChild(t);
  t.x = 100;
  t.y = Math.max(0, (ROW_HEIGHT - t.height) / 2);

  return cell;
}

function makeCell(textValue, opts) {
  const cell = figma.createFrame();
  cell.name = "Cell";
  cell.resize(opts.width, opts.height);
  // auto-layout 사용 안 함 — 텍스트를 절대 위치로 배치 (HUG 간섭 방지)
  cell.clipsContent = true;
  cell.fills = opts.cellFill ? [{ type: "SOLID", color: opts.cellFill, opacity: 0.05 }] : [];
  cell.strokes = [{ type: "SOLID", color: TABLE_STROKE }];
  cell.strokeWeight = 1;
  cell.strokeAlign = "INSIDE";

  const t = figma.createText();
  t.fontName = opts.font;
  t.fontSize = opts.fontSize;
  t.lineHeight = { value: opts.lineHeight || opts.fontSize * 1.3, unit: "PIXELS" };
  t.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

  const pad = 100;
  if (opts.fillWidth) {
    const innerW = Math.max(50, opts.width - pad * 2);
    const innerH = Math.max(opts.lineHeight || opts.fontSize * 1.3, 60);
    // NONE: 너비/높이 모두 고정 → 빈 셀에서도 텍스트 영역이 항상 보임
    // 오버플로는 cell.clipsContent로 처리
    t.textAutoResize = "NONE";
    try {
      t.resizeWithoutConstraints(innerW, innerH);
    } catch (e) {
      t.resize(innerW, innerH);
    }
    t.characters = textValue;
  } else {
    t.characters = textValue;
  }

  cell.appendChild(t);
  t.x = pad;
  t.y = Math.max(0, (opts.height - t.height) / 2);

  return cell;
}

function makeTableHead(fonts, kind) {
  const cw = COL_WIDTHS[kind] || COL_WIDTHS.purpose;
  const tw = cw.no + cw.content + cw.url;
  const head = figma.createFrame();
  head.name = "TableHead";
  head.resize(tw, HEAD_HEIGHT);
  head.layoutMode = "HORIZONTAL";
  head.primaryAxisSizingMode = "FIXED";
  head.counterAxisSizingMode = "FIXED";
  head.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.0001 }];
  head.itemSpacing = 0;
  const baseOpts = { height: HEAD_HEIGHT, font: fonts.head, fontSize: 80, lineHeight: 104, cellFill: { r: 0, g: 0, b: 0 } };
  head.appendChild(makeCell("No",      Object.assign({}, baseOpts, { width: cw.no })));
  head.appendChild(makeCell("Content", Object.assign({}, baseOpts, { width: cw.content })));
  head.appendChild(makeCell("url",     Object.assign({}, baseOpts, { width: cw.url })));
  return head;
}

function makeDataRow(values, fonts, kind) {
  const cw = COL_WIDTHS[kind] || COL_WIDTHS.purpose;
  const tw = cw.no + cw.content + cw.url;
  const row = figma.createFrame();
  row.name = ".Row";
  row.resize(tw, ROW_HEIGHT);
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "FIXED";
  row.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.0001 }];
  row.itemSpacing = 0;
  function opt(font, fontSize, lineHeight, fillWidth, w) {
    return {
      width: w,
      height: ROW_HEIGHT,
      cellFill: { r: 1, g: 1, b: 1 },
      font: font,
      fontSize: fontSize,
      lineHeight: lineHeight,
      fillWidth: !!fillWidth,
    };
  }
  // No 컬럼: 컬러 마커 배지
  const markerColor = MARKER_COLORS[kind] || MARKER_COLORS.purpose;
  row.appendChild(makeNoCellWithMarker(values[0] || "", markerColor, fonts.marker, kind));
  row.appendChild(makeCell(values[1] || "", opt(fonts.content, 48, 62.4, true, cw.content)));
  row.appendChild(makeCell(values[2] || "", opt(fonts.url,     48, 62.4, true, cw.url)));
  return row;
}

async function createTableFromScratch(kind, rowCount) {
  const fonts = await loadTableFonts();
  const tw = tableWidth(kind);
  const table = figma.createFrame();
  table.name = "Table";
  table.resize(tw, HEAD_HEIGHT);
  table.layoutMode = "VERTICAL";
  table.primaryAxisSizingMode = "AUTO";
  table.counterAxisSizingMode = "FIXED";
  table.fills = [{ type: "SOLID", color: TABLE_FILL }];
  table.strokes = [{ type: "SOLID", color: TABLE_STROKE }];
  table.strokeWeight = 1;
  table.strokeAlign = "INSIDE";
  table.cornerRadius = 4;
  table.itemSpacing = 0;
  table.appendChild(makeTableHead(fonts, kind));

  // 헤딩 텍스트 + 표를 section/page에 배치
  const section = findPublishingSection();
  const container = section || figma.currentPage;

  // 헤딩 텍스트도 같이 만들기
  await figma.loadFontAsync({ family: "Noto Sans KR", style: "Bold" });
  const heading = figma.createText();
  heading.name = "heading";
  heading.fontName = { family: "Noto Sans KR", style: "Bold" };
  heading.fontSize = 80;
  heading.lineHeight = { value: 60, unit: "PIXELS" };
  heading.characters = HEADINGS[kind] || HEADINGS["pc-purpose"];
  // 헤딩 색상 = 마커 색상과 동일 톤
  const mc = MARKER_COLORS[kind] || MARKER_COLORS["pc-purpose"];
  heading.fills = [{ type: "SOLID", color: mc }];

  // 배치 좌표 — 컨테이너 기준 상대좌표 그대로 사용
  const pos = TABLE_POS[kind] || { x: 100, y: 100 };
  const baseX = pos.x;
  const baseY = pos.y;

  container.appendChild(heading);
  heading.x = baseX;
  heading.y = baseY;

  const headingH = heading.height || 90;
  const margin = 60;

  container.appendChild(table);
  table.x = baseX;
  table.y = baseY + headingH + margin;

  return { table, heading };
}

function findButtonMarkerComponent() {
  if (_btnComp) return _btnComp;
  const section = findPublishingSection();
  const scope = section || figma.currentPage;
  const btnContainer = scope.findOne((n) => n.name === "버튼");
  if (!btnContainer || !("children" in btnContainer) || !btnContainer.children.length) return null;

  const first = btnContainer.children[0];
  if (first.type === "INSTANCE") _btnComp = first.mainComponent;
  else if (first.type === "COMPONENT") _btnComp = first;
  else if ("findOne" in first) {
    const inst = first.findOne((n) => n.type === "INSTANCE" || n.type === "COMPONENT");
    if (inst) _btnComp = inst.type === "INSTANCE" ? inst.mainComponent : inst;
  }
  return _btnComp;
}

// 텍스트 노드의 모든 폰트 로드 (mixed font 대응)
async function loadAllFonts(node) {
  const len = Math.max(1, node.characters.length);
  if (node.fontName === figma.mixed) {
    const fonts = node.getRangeAllFontNames(0, len);
    for (const f of fonts) await figma.loadFontAsync(f);
  } else {
    await figma.loadFontAsync(node.fontName);
  }
}

function fieldMatch(propName, fieldKey) {
  // fieldKey: "no" | "content" | "url"
  const p = propName.toLowerCase();
  if (fieldKey === "no") return p.startsWith("no") || p === "#no.n" || p.includes("no#") || p.includes(".no");
  if (fieldKey === "content") return p.startsWith("content") || p === "#content.n" || p.includes("content#");
  if (fieldKey === "url") return p.startsWith("url") || p === "#url.n" || p.includes("url#");
  return false;
}

async function applyToNode(node, value) {
  try {
    await loadAllFonts(node);
    node.characters = value;
    return true;
  } catch (e) {
    logUI(`적용 실패: ${e.message}`);
    return false;
  }
}

// 클론된 행의 in-cell 마커 frame 이름도 새 라벨로 갱신
function updateMarkerFrameName(instance, newLabel) {
  if (!newLabel) return;
  const markerFrame = instance.findOne(
    (n) => n.type === "FRAME" && /^marker_((?:pc|mo)-(?:purpose|landing))_/.test(n.name)
  );
  if (!markerFrame) return;
  const m = markerFrame.name.match(/^marker_((?:pc|mo)-(?:purpose|landing))_/);
  if (m) markerFrame.name = `marker_${m[1]}_${newLabel}`;
}

// ─── 텍스트 노드 override ───
async function setRowText(instance, row) {
  const fieldMap = {
    no: row.no || "",
    content: row.content || "",
    url: row.url || "",
  };

  // 클론된 행이면 in-cell 마커 frame 이름도 새 라벨로 갱신
  updateMarkerFrameName(instance, fieldMap.no);

  // 0) 셀 인덱스 기반 직접 매칭 (가장 견고) — cells[0]=No, [1]=content, [2]=url
  if ("children" in instance) {
    const cells = instance.children.filter((c) => c.name === "Cell");
    if (cells.length >= 3) {
      const noText = cells[0].findOne((n) => n.type === "TEXT");
      const contentText = cells[1].findOne((n) => n.type === "TEXT");
      const urlText = cells[2].findOne((n) => n.type === "TEXT");
      let touched = 0;
      if (noText && (await applyToNode(noText, fieldMap.no))) touched++;
      if (contentText && (await applyToNode(contentText, fieldMap.content))) touched++;
      if (urlText && (await applyToNode(urlText, fieldMap.url))) touched++;
      if (touched > 0) return touched;
    }
  }

  // 1) 컴포넌트 TEXT 프로퍼티 경로
  if (instance.componentProperties) {
    const props = instance.componentProperties;
    const updates = {};
    for (const key in props) {
      if (props[key].type !== "TEXT") continue;
      for (const f of ["no", "content", "url"]) {
        if (fieldMatch(key, f)) updates[key] = fieldMap[f];
      }
    }
    if (Object.keys(updates).length) {
      const allTexts = instance.findAll((n) => n.type === "TEXT");
      for (const t of allTexts) {
        try { await loadAllFonts(t); } catch (e) {}
      }
      try {
        instance.setProperties(updates);
        return Object.keys(updates).length;
      } catch (e) {
        logUI(`setProperties 실패: ${e.message}`);
      }
    }
  }

  const allTexts = instance.findAll((n) => n.type === "TEXT");

  // 2) 이름 기반 매칭 (#no.n / #content.n / #url.n)
  const named = { no: null, content: null, url: null };
  for (const n of allTexts) {
    if (n.name === TEXT_NAMES.no) named.no = n;
    else if (n.name === TEXT_NAMES.content) named.content = n;
    else if (n.name === TEXT_NAMES.url) named.url = n;
  }
  if (named.no && named.content && named.url) {
    let touched = 0;
    if (await applyToNode(named.no, fieldMap.no)) touched++;
    if (await applyToNode(named.content, fieldMap.content)) touched++;
    if (await applyToNode(named.url, fieldMap.url)) touched++;
    return touched;
  }

  // 3) 위치 기반 매칭 (X 좌표 오름차순 → no/content/url)
  if (allTexts.length >= 3) {
    const sorted = allTexts.slice().sort(
      (a, b) => a.absoluteBoundingBox.x - b.absoluteBoundingBox.x
    );
    let touched = 0;
    if (await applyToNode(sorted[0], fieldMap.no)) touched++;
    if (await applyToNode(sorted[1], fieldMap.content)) touched++;
    if (await applyToNode(sorted[2], fieldMap.url)) touched++;
    return touched;
  }

  const names = allTexts.map((n) => n.name).join(", ");
  logUI(`텍스트 노드 ${allTexts.length}개 (3개 필요). names: [${names}]`);
  return 0;
}

// 인스턴스에서 No 컬럼 값 읽기 (이름 → X좌표 fallback)
function readNoText(inst) {
  const named = inst.findOne((n) => n.type === "TEXT" && n.name === "#no.n");
  if (named) return named.characters.trim();

  const texts = inst.findAll((n) => n.type === "TEXT");
  if (texts.length >= 1) {
    texts.sort((a, b) => a.absoluteBoundingBox.x - b.absoluteBoundingBox.x);
    return texts[0].characters.trim();
  }
  return "";
}

// 기존 행의 layout sizing 복제 (auto-layout 대응)
function matchSizingFrom(newInst, refInst) {
  if (!refInst) return;
  try {
    if ("layoutSizingHorizontal" in newInst && "layoutSizingHorizontal" in refInst) {
      newInst.layoutSizingHorizontal = refInst.layoutSizingHorizontal;
    }
    if ("layoutSizingVertical" in newInst && "layoutSizingVertical" in refInst) {
      newInst.layoutSizingVertical = refInst.layoutSizingVertical;
    }
    if ("layoutAlign" in newInst && "layoutAlign" in refInst) {
      newInst.layoutAlign = refInst.layoutAlign;
    }
    if ("layoutGrow" in newInst && "layoutGrow" in refInst) {
      newInst.layoutGrow = refInst.layoutGrow;
    }
  } catch (e) {}
}

// ─── 표 생성 ───
async function genTable(kind, rows) {
  resetLog();
  // 매 생성마다 캐시 초기화 (디자인 변경 반영)
  clearCache();

  // 빈 행 필터
  rows = rows.filter((r) => r.no || r.content || r.url);
  if (!rows.length) {
    logUI("입력된 행이 없습니다.");
    return;
  }

  let table = findTableByKind(kind);
  let scratchHeading = null;
  if (!table) {
    const result = await createTableFromScratch(kind, rows.length);
    table = result.table;
    scratchHeading = result.heading;
    logUI(`Table 없음 → 새로 생성 (${kind})`);
  }

  // 기존 .Row 인스턴스 (clone 템플릿)
  const existingRows = "children" in table ? table.children.filter((c) => c.name === ".Row" || c.name === "Row") : [];
  const refRow = existingRows[0] || null;

  // refRow의 No 셀에 옛 badge frame(marker_*)이 있으면 fresh 스타일로 강제
  function isOldBadgeStyle(r) {
    if (!r || !("children" in r)) return false;
    const noCell = r.children.find((c) => c.name === "Cell");
    if (!noCell || !("children" in noCell)) return false;
    return noCell.children.some((c) => c.type === "FRAME" && /^marker_/.test(c.name));
  }
  const useClone = refRow && !isOldBadgeStyle(refRow);

  // clone 안 쓰면 fonts 로드 필요
  const fonts = useClone ? null : await loadTableFonts();

  // 입력 수만큼 행 생성
  const created = [];
  for (const row of rows) {
    let node;
    if (useClone) {
      node = refRow.clone();
      table.appendChild(node);
      matchSizingFrom(node, refRow);
      await setRowText(node, row);
    } else {
      node = makeDataRow([row.no, row.content, row.url], fonts, kind);
      table.appendChild(node);
    }
    created.push(node);
  }

  // 기존 행 모두 제거 (clone은 보존)
  existingRows.forEach((r) => r.remove());

  // scratch 생성 시 heading + table 그룹화
  if (scratchHeading) {
    const innerParent = scratchHeading.parent;
    if (innerParent && innerParent === table.parent) {
      const inner = figma.group([scratchHeading, table], innerParent);
      inner.name = KIND_LABELS[kind] || kind;
    }
  }

  const label = KIND_LABELS[kind] || kind;
  logUI(`${label}: ${created.length}행 (마커 셀에 포함)`);
}

const MARKER_COLORS = {
  // PC 퍼블: 주황 #FF8400
  "pc-purpose": { r: 1.0,    g: 0.5176, b: 0 },
  // PC URL: 하늘 #7BCCFF
  "pc-landing": { r: 0.4824, g: 0.8,    b: 1.0 },
  // MO 퍼블: 자홍 #E83A8C
  "mo-purpose": { r: 0.910,  g: 0.227,  b: 0.549 },
  // MO URL: 민트 #4ABDAC
  "mo-landing": { r: 0.290,  g: 0.741,  b: 0.675 },
};
const MARKER_W = 95;
const MARKER_H = 80;
const MARKER_RADIUS = 0;
const MARKER_FONT_SIZE = 60;

// 마커를 코드로 생성 (rounded rectangle)
async function createMarkerFromScratch(label, color, kind) {
  let font = { family: "Noto Sans KR", style: "Bold" };
  try {
    await figma.loadFontAsync(font);
  } catch (e) {
    font = { family: "Inter", style: "Bold" };
    await figma.loadFontAsync(font);
  }

  const frame = figma.createFrame();
  frame.name = `marker_${kind || "purpose"}_${label}`;
  frame.layoutMode = "HORIZONTAL";
  frame.primaryAxisAlignItems = "CENTER";
  frame.counterAxisAlignItems = "CENTER";
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  frame.paddingLeft = frame.paddingRight = 0;
  frame.paddingTop = frame.paddingBottom = 0;
  frame.resize(MARKER_W, MARKER_H);
  frame.cornerRadius = MARKER_RADIUS;
  frame.fills = [{ type: "SOLID", color }];
  frame.strokes = [];

  const text = figma.createText();
  text.fontName = font;
  text.fontSize = MARKER_FONT_SIZE;
  text.characters = label;
  text.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  frame.appendChild(text);

  return frame;
}

// ─── 표 위에 마커 그리드 생성 (5개씩) ───
async function genMarkersForTable(table, labels, kind) {
  if (!labels.length) return 0;

  const color = MARKER_COLORS[kind] || MARKER_COLORS.purpose;
  const tBox = table.absoluteBoundingBox;
  const parent = table.parent;
  const container = parent && "appendChild" in parent ? parent : figma.currentPage;
  const pBox = (parent && "absoluteBoundingBox" in parent && parent.absoluteBoundingBox) ? parent.absoluteBoundingBox : { x: 0, y: 0 };

  const tableLocalX = tBox.x - pBox.x;
  const tableLocalY = tBox.y - pBox.y;

  const perRow = 5;
  const gap = 30;
  const numRows = Math.ceil(labels.length / perRow);
  const totalHeight = numRows * (MARKER_H + gap) - gap;
  const startX = tableLocalX;
  const startY = tableLocalY - totalHeight - 60;

  const btnComp = findButtonMarkerComponent();
  if (btnComp) logUI("기존 버튼 컴포넌트 사용");

  const created = [];
  for (let i = 0; i < labels.length; i++) {
    let node;
    if (btnComp) {
      node = btnComp.createInstance();
      const textNode = node.findOne((n) => n.type === "TEXT");
      if (textNode) {
        try {
          await loadAllFonts(textNode);
          textNode.characters = labels[i];
        } catch (e) {
          logUI(`마커 폰트 실패: ${e.message}`);
        }
      }
    } else {
      node = await createMarkerFromScratch(labels[i], color);
    }
    container.appendChild(node);
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    node.x = startX + col * (node.width + gap);
    node.y = startY + row * (node.height + gap);
    created.push(node);
  }

  // 마커들을 Group으로 묶기
  let markerGroup = null;
  if (created.length) {
    markerGroup = figma.group(created, container);
    markerGroup.name = (KIND_LABELS[kind] || kind) + " 마커";
  }

  return { count: created.length, group: markerGroup };
}

// ─── 마커 클릭 배치 (선택 기반) ───
let _armedMarker = null; // {kind, label}
let _sequentialMode = null; // { kind, labels: [], index: 0 }
let _activeTab = "pc-purpose"; // UI에서 현재 활성 탭의 kind

async function placeMarkerForTarget(kind, label, node) {
  const box = node.absoluteBoundingBox;
  if (!box) return null;
  const parent = node.parent;
  let px = 0, py = 0;
  if (parent && "absoluteBoundingBox" in parent && parent.absoluteBoundingBox) {
    px = parent.absoluteBoundingBox.x;
    py = parent.absoluteBoundingBox.y;
  }
  const cursor = getCursorPos();
  const absX = cursor ? cursor.x - MARKER_W / 2 : box.x;
  const absY = cursor ? cursor.y - MARKER_H / 2 : box.y;

  const existing = findExistingMarker(kind, label);
  if (existing) existing.remove();

  const marker = await placeMarkerAt(kind, label, absX, absY);
  if (parent && "appendChild" in parent) {
    parent.appendChild(marker);
    marker.x = absX - px;
    marker.y = absY - py;
  }
  // 그룹화는 위치가 어긋나는 이슈가 있어서 보류 — 마커는 클릭 지점에 그대로 둠
  // (kind 구분은 마커 이름 prefix marker_<kind>_ 로 가능)
  return marker;
}

async function placeMarkerAt(kind, label, x, y) {
  const color = MARKER_COLORS[kind] || MARKER_COLORS.purpose;
  const marker = await createMarkerFromScratch(label, color, kind);
  figma.currentPage.appendChild(marker);
  marker.x = x;
  marker.y = y;
  return marker;
}

function findExistingMarker(kind, label) {
  const all = figma.currentPage.findAll(
    (n) => n.type === "FRAME" && n.name === `marker_${kind}_${label}`
  );
  // 셀/행/표 안에 있는 마커는 "템플릿"이므로 제외 — 자유 위치 마커만 반환
  return all.find((m) => {
    let p = m.parent;
    while (p && p.type !== "PAGE") {
      if (p.name === "Cell" || p.name === "Table" || p.name === ".Row" || p.name === "TableHead") return false;
      p = p.parent;
    }
    return true;
  }) || null;
}

// 현재 사용자 커서 위치 (가능하면)
function getCursorPos() {
  try {
    const users = figma.activeUsers;
    if (!users || !users.length) return null;
    const me = figma.currentUser
      ? users.find((u) => u.id === figma.currentUser.id)
      : users[0];
    const u = me || users[0];
    return u && u.position ? u.position : null;
  } catch (e) {
    return null;
  }
}

figma.on("selectionchange", async () => {
  const sel = figma.currentPage.selection;
  if (!sel.length) return;
  const node = sel[0];

  // 마커 자체 OR 테이블 No 셀 텍스트 — sequential mode에서 둘 다 무시 (placement 트리거 아님)
  const isMarkerNode = node.name && /^(?:marker|cell_no)_((?:pc|mo)-(?:purpose|landing))_/.test(node.name);

  // 1) 순서 배치 모드 — 마커가 아닌 노드 선택 시 다음 라벨 배치
  if (_sequentialMode) {
    if (isMarkerNode) {
      logUI(`마커 선택은 무시됨 (${node.name})`);
      return;
    }
    const q = _sequentialMode;
    if (q.index >= q.labels.length) {
      _sequentialMode = null;
      return;
    }
    if (!node.absoluteBoundingBox) {
      logUI(`선택 노드(${node.name})에 bounding box 없음 - 스킵`);
      return;
    }
    // index를 await 전에 미리 증가시켜 동시 클릭에 의한 중복 배치 방지
    const label = q.labels[q.index];
    const currentIdx = q.index;
    q.index++;
    try {
      const created = await placeMarkerForTarget(q.kind, label, node);
      if (!created) {
        logUI(`마커 생성 실패: "${label}" — placeMarkerForTarget null 반환 (${node.name}, type=${node.type})`);
      }
      figma.ui.postMessage({
        type: "sequential-progress",
        kind: q.kind,
        placed: currentIdx + 1,
        total: q.labels.length,
      });
      if (q.index >= q.labels.length) {
        logUI(`순서 배치 완료 (${q.labels.length}개)`);
        figma.ui.postMessage({ type: "sequential-done", kind: q.kind });
        _sequentialMode = null;
      } else {
        logUI(`"${label}" 배치. 다음: "${q.labels[q.index]}"`);
      }
      figma.currentPage.selection = [];
    } catch (e) {
      logUI(`순서 배치 실패: ${e.message}`);
    }
    return;
  }

  // 2) 마커 배지 선택 → arming
  // free 마커 frame 또는 No 셀 내 평문 텍스트 둘 다 arming 트리거
  const markerMatch = node.name && node.name.match(/^(?:marker|cell_no)_((?:pc|mo)-(?:purpose|landing))_(.+)$/);
  if (markerMatch) {
    // 활성 탭과 다른 kind면 arming 무시 (다른 탭의 마커가 실수로 잡히지 않도록)
    if (markerMatch[1] !== _activeTab) {
      logUI(`다른 탭 (${markerMatch[1]}) 마커 — 무시 (활성: ${_activeTab})`);
      return;
    }
    // 이미 다른 라벨로 arming 중이면 무시
    if (_armedMarker && _armedMarker.label !== markerMatch[2]) {
      logUI(`이미 "${_armedMarker.label}" arming 중 — "${markerMatch[2]}" 무시`);
      return;
    }
    _armedMarker = { kind: markerMatch[1], label: markerMatch[2] };
    logUI(`"${markerMatch[2]}" arming — 디자인 요소 선택 시 배치`);
    return;
  }

  // 3) Arming 중 + 일반 노드 선택 → 마커 배치
  if (!_armedMarker) return;
  const armed = _armedMarker;
  _armedMarker = null;
  try {
    const existing = findExistingMarker(armed.kind, armed.label);
    await placeMarkerForTarget(armed.kind, armed.label, node);
    logUI(`"${armed.label}" ${existing ? "재" : ""}생성`);
    figma.ui.postMessage({ type: "marker-placed", label: armed.label });
    figma.currentPage.selection = [];
  } catch (e) {
    logUI(`마커 배치 실패: ${e.message}`);
  }
});

// Figma 표 → 빌더로 동기화 (텍스트 읽기)
async function syncFromFigma(kind) {
  resetLog();
  clearCache();
  const table = findTableByKind(kind);
  if (!table) {
    figma.ui.postMessage({ type: "sync-result", kind, rows: [] });
    logUI(`${KIND_LABELS[kind] || kind} 표가 없습니다.`);
    return;
  }
  const dataRows = "children" in table ? table.children.filter((c) => c.name === ".Row" || c.name === "Row") : [];
  const rows = [];
  for (const r of dataRows) {
    if (!("children" in r)) continue;
    const cells = r.children.filter((c) => c.name === "Cell");
    if (cells.length < 3) continue;
    // cells[0] = No (marker), cells[1] = content, cells[2] = url
    const contentText = readFirstText(cells[1]);
    const urlText = readFirstText(cells[2]);
    rows.push({ content: contentText, url: urlText });
  }
  figma.ui.postMessage({ type: "sync-result", kind, rows });
  logUI(`${KIND_LABELS[kind] || kind} 표: ${rows.length}행 동기화`);
}

function readFirstText(cell) {
  const t = cell.findOne((n) => n.type === "TEXT");
  return t ? t.characters : "";
}

// 캔버스 마커 일괄 재라벨 (D&D 후) — 자유 위치 마커만, 셀 안 마커는 제외
function isInTable(node) {
  let p = node.parent;
  while (p && p.type !== "PAGE") {
    if (p.name === "Cell" || p.name === "Table" || p.name === ".Row" || p.name === "TableHead") return true;
    p = p.parent;
  }
  return false;
}

async function relabelMarkers(kind, mapping) {
  // mapping: { oldLabel -> newLabel }
  const targets = [];
  for (const oldLabel in mapping) {
    const all = figma.currentPage.findAll(
      (n) => n.type === "FRAME" && n.name === `marker_${kind}_${oldLabel}`
    );
    all.filter((m) => !isInTable(m)).forEach((m) =>
      targets.push({ node: m, oldLabel, newLabel: mapping[oldLabel] })
    );
  }
  if (!targets.length) return 0;

  // 1) 임시 이름
  targets.forEach((t, i) => {
    t.node.name = `marker_${kind}_TEMP_${i}`;
  });
  // 2) 최종 이름 + 텍스트 갱신
  for (const t of targets) {
    t.node.name = `marker_${kind}_${t.newLabel}`;
    const textNode = t.node.findOne((n) => n.type === "TEXT");
    if (textNode) {
      try {
        await loadAllFonts(textNode);
        textNode.characters = t.newLabel;
      } catch (e) {}
    }
  }
  return targets.length;
}

// ─── message handler ───
figma.ui.onmessage = async (msg) => {
  try {
    const { type, payload } = msg;
    if (type === "gen-table") await genTable(payload.kind, payload.rows);
    else if (type === "arm-marker") _armedMarker = { kind: payload.kind, label: payload.label };
    else if (type === "disarm-marker") _armedMarker = null;
    else if (type === "open-external") figma.openExternal(payload.url);
    else if (type === "sync-from-figma") await syncFromFigma(payload.kind);
    else if (type === "start-sequential") {
      // 이미 배치된(자유 위치) 마커는 스킵 → 미배치만 큐에 담음
      const remaining = payload.labels.filter(
        (label) => !findExistingMarker(payload.kind, label)
      );
      if (!remaining.length) {
        // 모두 배치 완료 → UI에서 재생성할지 confirm
        logUI(`모든 마커가 이미 배치되어 있습니다. (${payload.labels.length}개) — 재생성 여부 확인`);
        figma.ui.postMessage({
          type: "confirm-recreate",
          kind: payload.kind,
          labels: payload.labels,
        });
      } else {
        _sequentialMode = { kind: payload.kind, labels: remaining, index: 0 };
        _armedMarker = null;
        figma.ui.postMessage({
          type: "sequential-progress",
          kind: payload.kind,
          placed: 0,
          total: remaining.length,
        });
        const skipped = payload.labels.length - remaining.length;
        logUI(`순서 배치 시작: 남은 ${remaining.length}개 (${skipped}개 스킵). 첫: "${remaining[0]}"`);
      }
    }
    else if (type === "start-sequential-force") {
      // 기존 free 마커 모두 삭제 후 전체 배치 모드 시작
      for (const label of payload.labels) {
        const m = findExistingMarker(payload.kind, label);
        if (m) m.remove();
      }
      _sequentialMode = { kind: payload.kind, labels: payload.labels.slice(), index: 0 };
      _armedMarker = null;
      figma.ui.postMessage({
        type: "sequential-progress",
        kind: payload.kind,
        placed: 0,
        total: payload.labels.length,
      });
      logUI(`재생성 시작 (${payload.labels.length}개). 첫: "${payload.labels[0]}"`);
    }
    else if (type === "stop-sequential") {
      _sequentialMode = null;
      logUI("순서 배치 중단");
    }
    else if (type === "set-active-tab") {
      _activeTab = payload.kind;
    }
    else if (type === "delete-all-markers") {
      const kind = payload.kind;
      const all = figma.currentPage.findAll(
        (n) => n.type === "FRAME" && n.name.indexOf(`marker_${kind}_`) === 0
      );
      const free = all.filter((m) => !isInTable(m));
      free.forEach((m) => m.remove());
      logUI(`${KIND_LABELS[kind] || kind} 마커 ${free.length}개 삭제`);
    }
    else if (type === "relabel-markers") {
      // 1) 삭제된 라벨이 있으면 해당 free 마커 제거 (이름 충돌 방지)
      if (payload.deletedLabel) {
        const orphan = findExistingMarker(payload.kind, payload.deletedLabel);
        if (orphan) {
          orphan.remove();
          logUI(`"${payload.deletedLabel}" 마커 삭제`);
        }
      }
      // 2) 살아남은 마커 재라벨
      const n = await relabelMarkers(payload.kind, payload.mapping || {});
      if (n) logUI(`마커 ${n}개 재라벨됨`);
    }
  } catch (e) {
    logUI(`오류: ${e.message}`);
    console.error(e);
  }
};
