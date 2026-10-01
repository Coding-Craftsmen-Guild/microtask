<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<meta name="design_doc_mode" content="canvas">
<style>
body{margin:0;background:#ecebf1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#0a0a0a}
a{color:#2e2456;text-decoration:none}a:hover{text-decoration:underline}
*{box-sizing:border-box}
</style>
</helmet>

<section style="padding:56px 56px 24px;display:grid;gap:24px">
  <div style="display:grid;gap:6px;max-width:960px">
    <div style="font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#5b5675">Turn 4 · Items on the board, resizable detail panel</div>
    <div style="font-size:15px;line-height:1.5;color:#3a3650;text-wrap:pretty">At Sprint zoom each feature shows as a thin band with its items as bars underneath. Quarter and Year zoom show whole features. Drag the handle above the panel to resize it; the board scrolls in both directions. Click a feature band or an item to open it as a tab.</div>
  </div>
  <div id="4a" style="display:grid;gap:14px">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="background:#2e2456;color:#ffd24a;font-weight:700;font-size:13px;padding:3px 9px;border-radius:6px">4a</span>
      <span style="font-size:15px;font-weight:600">Calm board · items view · stacked detail tabs</span>
      <span style="font-size:13px;color:#5b5675">interactive: zoom, hover, click, drag the panel edge, edit fields</span>
    </div>
    <div style="width:1440px;height:1080px;overflow:hidden;background:#fff;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(0,0,0,.06),0 12px 40px rgba(46,36,86,.12);border-radius:4px">
      <header style="background:#2e2456;border-bottom:3px solid #ffd24a;color:#fff;display:flex;align-items:center;gap:12px;padding:8px 20px;flex-shrink:0">
        <img src="logo.webp" alt="CC Guild logo" style="width:28px;height:28px;border-radius:7px;display:block">
        <span style="display:grid">
          <span style="font-size:14px;line-height:1.1;font-weight:700;letter-spacing:.02em">Macroplan</span>
          <span style="font-size:10px;letter-spacing:.14em;color:#ffd24a;text-transform:uppercase">CC Guild</span>
        </span>
        <span style="width:1px;height:22px;background:rgba(255,255,255,.18);margin:0 6px"></span>
        <span style="font-size:13px;color:#c9c3e6">Plans</span>
        <span style="font-size:13px;color:#8e86b5">/</span>
        <span style="font-size:13px;font-weight:600">Identity Management Plan</span>
        <span style="flex:1"></span>
        <span style="font-size:13px;color:#c9c3e6">Sign out</span>
      </header>
      <div style="display:flex;align-items:center;gap:16px;padding:14px 20px;border-bottom:1px solid #e5e5e5;flex-shrink:0">
        <div style="display:grid;gap:2px">
          <div style="font-size:20px;font-weight:650;line-height:1.15">Identity Management Plan</div>
          <div style="display:flex;gap:8px;font-size:12px;color:#737373"><span>starts 2026-09-28</span><span>·</span><span>10-day sprints</span><span>·</span><span>UTC</span></div>
        </div>
        <div style="display:flex;gap:2px;padding:2px;border-radius:8px;background:#f5f5f5;margin-left:12px">
          <span style="padding:4px 12px;border-radius:6px;background:#fff;font-size:13px;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.08)">Timeline</span>
          <span style="padding:4px 12px;border-radius:6px;font-size:13px;font-weight:500;color:#737373">Table</span>
        </div>
        <span style="flex:1"></span>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="padding:4px 10px;border-radius:999px;background:#2e2456;color:#fff;font-size:12px;font-weight:500">All work</span>
          <span style="display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#f1edfd;color:#4c1d95;font-size:12px;font-weight:500"><span style="width:8px;height:8px;border-radius:50%;background:#7c3aed"></span>Phase 0<span style="color:#7c6aa8">{{ e.g0n }}</span></span>
          <span style="display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#e8f5ef;color:#0f5a3d;font-size:12px;font-weight:500"><span style="width:8px;height:8px;border-radius:50%;background:#1f9d6b"></span>Phase 1<span style="color:#4f8a72">{{ e.g1n }}</span></span>
          <span style="padding:3px 10px;border-radius:999px;border:1px dashed #d4d4d4;color:#737373;font-size:12px">+ Group</span>
        </div>
        <span style="width:1px;height:22px;background:#e5e5e5"></span>
        <div style="display:flex;gap:2px;padding:2px;border-radius:8px;background:#f5f5f5">
          <sc-for list="{{ e.zooms }}" as="z" hint-placeholder-count="3">
            <span onClick="{{ z.pick }}" style="cursor:pointer;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:500;color:{{ z.ink }};background:{{ z.bg }};box-shadow:{{ z.sh }}">{{ z.label }}</span>
          </sc-for>
        </div>
        <span style="height:28px;display:inline-flex;align-items:center;padding:0 10px;border-radius:6px;border:1px solid #e5e5e5;font-size:13px;font-weight:500">Settings</span>
        <span style="height:28px;display:inline-flex;align-items:center;padding:0 12px;border-radius:6px;background:#2e2456;color:#fff;font-size:13px;font-weight:500">Share</span>
      </div>

      <div style="height:44px;flex-shrink:0;display:flex;align-items:center;gap:8px;padding:0 20px;border-bottom:1px solid #e5e5e5;background:#fbfbfc">
        <span style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8a8699;margin-right:4px">Add</span>
        <span draggable="true" onDragStart="{{ e.pills.epic.start }}" onDragEnd="{{ e.pills.epic.end }}" style="cursor:grab;user-select:none;height:28px;display:flex;align-items:center;gap:7px;padding:0 12px 0 9px;border-radius:999px;background:#fff;border:1px solid #d9d6e4;font-size:12px;font-weight:600;color:#2e2456;box-shadow:0 1px 2px rgba(46,36,86,.06)" style-hover="border-color:#2e2456">
          <span style="width:14px;height:10px;border-radius:2px;border:1.5px solid #2e2456;border-left-width:4px"></span>Epic
        </span>
        <span draggable="true" onDragStart="{{ e.pills.feature.start }}" onDragEnd="{{ e.pills.feature.end }}" style="cursor:grab;user-select:none;height:28px;display:flex;align-items:center;gap:7px;padding:0 12px 0 9px;border-radius:999px;background:#fff;border:1px solid #d9d6e4;font-size:12px;font-weight:600;color:#2e2456;box-shadow:0 1px 2px rgba(46,36,86,.06)" style-hover="border-color:#2e2456">
          <span style="width:16px;height:6px;border-radius:2px;background:#7c3aed33;border:1px solid #7c3aed"></span>Feature
        </span>
        <span draggable="true" onDragStart="{{ e.pills.item.start }}" onDragEnd="{{ e.pills.item.end }}" style="cursor:grab;user-select:none;height:28px;display:flex;align-items:center;gap:7px;padding:0 12px 0 9px;border-radius:999px;background:#fff;border:1px solid #d9d6e4;font-size:12px;font-weight:600;color:#2e2456;box-shadow:0 1px 2px rgba(46,36,86,.06)" style-hover="border-color:#2e2456">
          <span style="display:flex;gap:2px"><span style="width:6px;height:6px;border-radius:1.5px;background:#1f9d6b"></span><span style="width:6px;height:6px;border-radius:1.5px;background:#1f9d6b88"></span></span>Item
        </span>
        <span style="width:1px;height:20px;background:#e5e5e5;margin:0 6px"></span>
        <span style="font-size:12px;color:#5b5675">{{ e.dragHint }}</span>
      </div>
      <div style="flex:1;min-height:120px;overflow:auto;position:relative;background:#fff">
        <div style="position:relative;width:{{ e.totalW }}px;min-height:100%">
          <div style="position:sticky;top:0;z-index:6;display:flex;height:72px;background:#fff;border-bottom:1px solid #e5e5e5">
            <div style="position:sticky;left:0;z-index:7;width:264px;flex-shrink:0;background:#fff;border-right:1px solid #e5e5e5;display:flex;align-items:flex-end;gap:8px;padding:0 12px 10px">
              <input placeholder="Filter rails and features" style="flex:1;min-width:0;border:1px solid #e5e5e5;border-radius:6px;padding:5px 8px;font:inherit;font-size:13px;outline:none">
              <span style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;border:1px solid #e5e5e5;font-size:16px;color:#525252">+</span>
            </div>
            <div style="position:relative;flex-shrink:0;width:{{ e.tw }}px">
              <div style="position:absolute;left:0;right:0;top:0;height:20px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;padding:0 10px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#2e2456"><span>2026</span></div>
              <div style="position:absolute;left:0;right:0;top:20px;height:22px;border-bottom:1px solid #f0f0f0">
                <span style="position:absolute;top:0;bottom:0;left:0;width:{{ e.q4 }}px;display:flex;align-items:center;padding:0 8px;font-size:11px;font-weight:600;color:#737373;background:#fafafa;overflow:hidden">Q3</span>
                <span style="position:absolute;top:0;bottom:0;left:{{ e.q4 }}px;right:0;display:flex;align-items:center;padding:0 10px;font-size:11px;font-weight:600;border-left:1px solid #e5e5e5">Q4 2026</span>
              </div>
              <sc-for list="{{ e.sprints }}" as="s" hint-placeholder-count="5">
                <div style="position:absolute;top:42px;bottom:0;left:{{ s.left }}px;width:{{ s.w }}px;border-left:1px solid #e5e5e5;padding:0 8px;display:flex;align-items:center;gap:8px;overflow:hidden;white-space:nowrap">
                  <span style="font-size:12px;font-weight:600">{{ s.name }}</span>
                  <span style="font-size:11px;color:#737373;font-variant-numeric:tabular-nums">{{ s.sub }}</span>
                </div>
              </sc-for>
              <div style="position:absolute;top:2px;left:{{ e.todayPill }}px;background:#ffd24a;color:#2e2456;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;letter-spacing:.02em">TODAY</div>
            </div>
          </div>
          <div onDragOver="{{ e.onDragOver }}" onDrop="{{ e.onDrop }}" style="display:flex">
            <div style="position:sticky;left:0;z-index:5;width:264px;flex-shrink:0;background:#fff;border-right:1px solid #e5e5e5">
              <sc-for list="{{ e.lanes }}" as="l" hint-placeholder-count="8">
                <div draggable="true" onDragStart="{{ l.dragStart }}" onDragEnd="{{ l.dragEnd }}" onDoubleClick="{{ l.rename }}" style="cursor:grab;height:{{ l.h }}px;display:flex;align-items:center;gap:10px;padding:0 14px 0 6px;border-bottom:1px solid #f0f0f0" style-hover="background:#faf9fc">
                  <span style="width:12px;flex-shrink:0;font-size:10px;letter-spacing:-1px;color:#c4c1d0;text-align:center">⋮⋮</span>
                  <span style="width:10px;height:10px;border-radius:3px;flex-shrink:0;background:{{ l.c }}"></span>
                  <sc-if value="{{ l.notEditing }}" hint-placeholder-val="{{ true }}">
                    <span style="flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ l.name }}</span>
                  </sc-if>
                  <sc-if value="{{ l.editing }}" hint-placeholder-val="{{ false }}">
                    <input autoFocus="{{ true }}" value="{{ l.name }}" onChange="{{ l.onRename }}" onKeyDown="{{ l.doneRename }}" onBlur="{{ l.doneRename }}" style="flex:1;min-width:0;height:28px;font:inherit;font-size:13px;font-weight:600;border:1px solid #2e2456;border-radius:6px;padding:0 6px;outline:none;box-shadow:0 0 0 3px #efecfa">
                  </sc-if>
                  <span style="font-size:11px;color:#737373;font-variant-numeric:tabular-nums">{{ l.count }}</span>
                </div>
              </sc-for>
              <sc-if value="{{ e.ghost.line }}" hint-placeholder-val="{{ false }}">
                <div style="position:absolute;left:0;right:0;height:3px;background:#2e2456;pointer-events:none;top:{{ e.ghost.top }}px"></div>
              </sc-if>
            </div>
            <div ref="{{ e.canvasRef }}" style="position:relative;flex-shrink:0;width:{{ e.tw }}px;height:{{ e.th }}px">
              <sc-if value="{{ e.ghost.line }}" hint-placeholder-val="{{ false }}">
                <div style="position:absolute;left:0;right:0;height:3px;background:#2e2456;z-index:15;pointer-events:none;top:{{ e.ghost.top }}px"></div>
                <div style="position:absolute;z-index:16;pointer-events:none;left:{{ e.ghost.labelLeft }}px;top:{{ e.ghost.labelTop }}px;background:#2e2456;color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:5px;white-space:nowrap">{{ e.ghost.label }}</div>
              </sc-if>
              <sc-if value="{{ e.ghost.box }}" hint-placeholder-val="{{ false }}">
                <div style="position:absolute;z-index:15;pointer-events:none;left:{{ e.ghost.left }}px;top:{{ e.ghost.top }}px;width:{{ e.ghost.w }}px;height:{{ e.ghost.h }}px;border-radius:5px;background:{{ e.ghost.bg }};border:1.5px {{ e.ghost.bdStyle }} {{ e.ghost.bd }}"></div>
                <div style="position:absolute;z-index:16;pointer-events:none;left:{{ e.ghost.labelLeft }}px;top:{{ e.ghost.labelTop }}px;background:{{ e.ghost.chipBg }};color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:5px;white-space:nowrap">{{ e.ghost.label }}</div>
              </sc-if>
              <sc-for list="{{ e.sprints }}" as="s" hint-placeholder-count="5">
                <div style="position:absolute;top:0;bottom:0;left:{{ s.left }}px;width:{{ s.w }}px;border-left:1px solid #ededed;background:{{ s.bg }}"></div>
              </sc-for>
              <sc-for list="{{ e.lanes }}" as="l" hint-placeholder-count="8">
                <div style="position:absolute;left:0;right:0;top:{{ l.top }}px;height:{{ l.h }}px;border-bottom:1px solid #f0f0f0"></div>
              </sc-for>
              {{ e.arcs }}
              <sc-for list="{{ e.feats }}" as="x" hint-placeholder-count="0">
                <div onMouseEnter="{{ x.enter }}" onMouseLeave="{{ x.leave }}" style="position:absolute;left:{{ x.wl }}px;top:{{ x.top }}px;width:{{ x.ww }}px;height:{{ x.h }}px;opacity:{{ x.op }};transition:opacity .12s">
                  <div onClick="{{ x.click }}" style="position:absolute;cursor:pointer;left:24px;top:0;width:{{ x.w }}px;height:100%;border-radius:6px;background:{{ x.bg }};border:{{ x.border }};display:flex;align-items:center;overflow:hidden">
                    <span style="padding:0 7px;font-size:12px;font-weight:600;color:{{ x.ink }};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">{{ x.label }}</span>
                  </div>
                  <span onMouseDown="{{ x.grabStart }}" title="Drag to add" style="display:{{ x.hdisp }};position:absolute;left:{{ x.cL }}px;top:50%;margin-top:-7px;width:14px;height:14px;border-radius:50%;align-items:center;justify-content:center;background:{{ x.c }};cursor:crosshair;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,.18)" style-hover="transform:scale(1.15)"><svg width="7" height="7" viewBox="0 0 10 10" style="display:block;pointer-events:none"><path d="M5 1.5v7M1.5 5h7" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"></path></svg></span>
                  <span onMouseDown="{{ x.grabEnd }}" title="Drag to add" style="display:{{ x.hdisp }};position:absolute;right:{{ x.cL }}px;top:50%;margin-top:-7px;width:14px;height:14px;border-radius:50%;align-items:center;justify-content:center;background:{{ x.c }};cursor:crosshair;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,.18)" style-hover="transform:scale(1.15)"><svg width="7" height="7" viewBox="0 0 10 10" style="display:block;pointer-events:none"><path d="M5 1.5v7M1.5 5h7" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"></path></svg></span>
                </div>
              </sc-for>
              <sc-for list="{{ e.lines }}" as="x" hint-placeholder-count="12">
                <div onMouseEnter="{{ x.enter }}" onMouseLeave="{{ x.leave }}" style="position:absolute;left:{{ x.wl }}px;top:{{ x.top }}px;width:{{ x.ww }}px;height:18px;opacity:{{ x.op }};transition:opacity .12s">
                  <div onClick="{{ x.click }}" style="position:absolute;cursor:pointer;left:22px;top:0;width:{{ x.w }}px;height:18px">
                    <div style="position:absolute;left:0;right:0;top:{{ x.ltop }}px;height:{{ x.th }}px;border-radius:2px;background:{{ x.c }}"></div>
                    <div style="position:absolute;left:{{ x.dzo }}px;top:{{ x.dtop }}px;width:{{ x.dz }}px;height:{{ x.dz }}px;transform:rotate(45deg);background:{{ x.c }};border-radius:1.5px;box-shadow:0 0 0 1.5px #fff"></div>
                    <div style="position:absolute;right:{{ x.dzo }}px;top:{{ x.dtop }}px;width:{{ x.dz }}px;height:{{ x.dz }}px;transform:rotate(45deg);background:{{ x.c }};border-radius:1.5px;box-shadow:0 0 0 1.5px #fff"></div>
                    <span style="position:absolute;left:10px;top:1px;max-width:{{ x.lw }}px;padding:0 5px;background:#fff;border-radius:3px;font-size:10.5px;line-height:15px;font-weight:600;color:{{ x.ink }};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">{{ x.label }}</span>
                  </div>
                  <span onMouseDown="{{ x.grabStart }}" title="Drag to add" style="display:{{ x.hdisp }};position:absolute;left:16px;top:3px;width:12px;height:12px;border-radius:2.5px;transform:rotate(45deg);align-items:center;justify-content:center;background:{{ x.c }};cursor:crosshair;z-index:2;box-shadow:0 0 0 2px #fff,0 2px 5px rgba(0,0,0,.2)" style-hover="box-shadow:0 0 0 2px #fff,0 0 0 4px {{ x.c }}55"><span style="display:flex;transform:rotate(-45deg)"><svg width="7" height="7" viewBox="0 0 10 10" style="display:block;pointer-events:none"><path d="M5 1.5v7M1.5 5h7" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"></path></svg></span></span>
                  <span onMouseDown="{{ x.grabEnd }}" title="Drag to add" style="display:{{ x.hdisp }};position:absolute;right:16px;top:3px;width:12px;height:12px;border-radius:2.5px;transform:rotate(45deg);align-items:center;justify-content:center;background:{{ x.c }};cursor:crosshair;z-index:2;box-shadow:0 0 0 2px #fff,0 2px 5px rgba(0,0,0,.2)" style-hover="box-shadow:0 0 0 2px #fff,0 0 0 4px {{ x.c }}55"><span style="display:flex;transform:rotate(-45deg)"><svg width="7" height="7" viewBox="0 0 10 10" style="display:block;pointer-events:none"><path d="M5 1.5v7M1.5 5h7" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"></path></svg></span></span>
                </div>
              </sc-for>
              <sc-for list="{{ e.items }}" as="x" hint-placeholder-count="20">
                <div onMouseEnter="{{ x.enter }}" onMouseLeave="{{ x.leave }}" style="position:absolute;left:{{ x.wl }}px;top:{{ x.top }}px;width:{{ x.ww }}px;height:{{ x.h }}px;opacity:{{ x.op }};transition:opacity .12s">
                  <div onClick="{{ x.click }}" style="position:absolute;cursor:pointer;left:22px;top:0;width:{{ x.w }}px;height:100%;border-radius:5px;background:{{ x.bg }};border:{{ x.border }};display:flex;align-items:center;overflow:hidden">
                    <span style="padding:0 7px;font-size:12px;font-weight:500;color:{{ x.ink }};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">{{ x.label }}</span>
                  </div>
                  <span onMouseDown="{{ x.grabStart }}" title="Drag to add" style="display:{{ x.hdisp }};position:absolute;left:{{ x.cL }}px;top:50%;margin-top:-7px;width:14px;height:14px;border-radius:50%;align-items:center;justify-content:center;background:{{ x.c }};cursor:crosshair;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,.18)" style-hover="transform:scale(1.15)"><svg width="7" height="7" viewBox="0 0 10 10" style="display:block;pointer-events:none"><path d="M5 1.5v7M1.5 5h7" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"></path></svg></span>
                  <span onMouseDown="{{ x.grabEnd }}" title="Drag to add" style="display:{{ x.hdisp }};position:absolute;right:{{ x.cL }}px;top:50%;margin-top:-7px;width:14px;height:14px;border-radius:50%;align-items:center;justify-content:center;background:{{ x.c }};cursor:crosshair;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,.18)" style-hover="transform:scale(1.15)"><svg width="7" height="7" viewBox="0 0 10 10" style="display:block;pointer-events:none"><path d="M5 1.5v7M1.5 5h7" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"></path></svg></span>
                </div>
              </sc-for>
              <sc-if value="{{ e.draw.show }}" hint-placeholder-val="{{ false }}">
                <div style="position:absolute;z-index:14;pointer-events:none;top:0;bottom:0;width:0;border-left:1.5px dashed #2e2456;left:{{ e.draw.guideL }}px"></div>
                <div style="position:absolute;z-index:15;pointer-events:none;left:{{ e.draw.left }}px;top:{{ e.draw.top }}px;width:{{ e.draw.w }}px;height:{{ e.draw.h }}px;border-radius:5px;border:1.5px dashed #2e2456;background:repeating-linear-gradient(135deg,#efecfa 0 6px,#e4dff7 6px 12px)"></div>
                <div style="position:absolute;z-index:16;pointer-events:none;left:{{ e.draw.chipLeft }}px;top:{{ e.draw.chipTop }}px;display:flex;gap:6px;align-items:center;background:#2e2456;color:#fff;font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;white-space:nowrap;box-shadow:0 4px 12px rgba(46,36,86,.25)">{{ e.draw.label }}<span style="color:#ffd24a">{{ e.draw.meta }}</span></div>
              </sc-if>
              <div style="position:absolute;top:0;bottom:0;width:2px;background:#e0ac00;left:{{ e.today }}px;pointer-events:none"></div>
              <sc-if value="{{ e.pop.show }}" hint-placeholder-val="{{ false }}">
                <div style="position:absolute;z-index:20;pointer-events:none;left:{{ e.pop.left }}px;top:{{ e.pop.top }}px;width:300px;background:#fff;border:1px solid #e5e5e5;border-radius:10px;box-shadow:0 12px 32px rgba(46,36,86,.16),0 2px 6px rgba(0,0,0,.06);overflow:hidden">
                  <div style="padding:12px 14px 10px;display:grid;gap:6px">
                    <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#737373;min-width:0">
                      <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:{{ e.pop.railC }}"></span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ e.pop.context }}</span>
                    </div>
                    <div style="font-size:14px;font-weight:600;line-height:1.3;text-wrap:pretty">{{ e.pop.title }}</div>
                  </div>
                  <div style="display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #f0f0f0;background:#fafafa">
                    <div style="padding:8px 14px;display:grid;gap:1px"><span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Estimate</span><span style="font-size:13px;font-weight:500">{{ e.pop.est }}</span></div>
                    <div style="padding:8px 14px;display:grid;gap:1px;border-left:1px solid #f0f0f0"><span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Sprint</span><span style="font-size:13px;font-weight:500">{{ e.pop.sprint }}</span></div>
                    <div style="padding:8px 14px;display:grid;gap:1px;border-left:1px solid #f0f0f0"><span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">{{ e.pop.thirdLabel }}</span><span style="font-size:13px;font-weight:500">{{ e.pop.third }}</span></div>
                  </div>
                  <div style="padding:8px 14px;border-top:1px solid #f0f0f0;display:flex;font-size:12px;color:#525252;font-variant-numeric:tabular-nums"><span style="flex:1">{{ e.pop.dates }}</span><span style="color:#2e2456;font-weight:500">Click to open</span></div>
                </div>
              </sc-if>
            </div>
          </div>
        </div>
      </div>

      <div style="height:{{ e.panelH }}px;flex-shrink:0;display:flex;flex-direction:column;background:#fff;border-top:1px solid #dcdae4;box-shadow:0 -6px 20px rgba(46,36,86,.06)">
        <div onMouseDown="{{ e.startDrag }}" title="Drag to resize" style="height:10px;flex-shrink:0;cursor:row-resize;display:flex;align-items:center;justify-content:center;background:#f6f5f9" style-hover="background:#efecfa"><span style="width:44px;height:4px;border-radius:2px;background:#cfccd9"></span></div>
        <div style="height:38px;flex-shrink:0;display:flex;align-items:flex-end;gap:2px;padding:0 12px;background:#f6f5f9;border-bottom:1px solid #e5e5e5">
          <sc-for list="{{ e.tabs }}" as="t" hint-placeholder-count="2">
            <div onClick="{{ t.select }}" style="cursor:pointer;height:32px;max-width:280px;display:flex;align-items:center;gap:8px;padding:0 8px 0 12px;border-radius:8px 8px 0 0;background:{{ t.bg }};border:1px solid {{ t.bd }};border-bottom:none;margin-bottom:-1px">
              <span style="width:8px;height:8px;flex-shrink:0;border-radius:{{ t.dotR }};background:{{ t.dotBg }};border:1.5px solid {{ t.c }}"></span>
              <span style="font-size:11px;color:#8a8699;flex-shrink:0">{{ t.kind }}</span>
              <span style="font-size:12px;font-weight:{{ t.fw }};color:{{ t.ink }};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ t.name }}</span>
              <span onClick="{{ t.close }}" style="width:18px;height:18px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:4px;font-size:13px;color:#8a8a8a" style-hover="background:#ecebf1;color:#0a0a0a">×</span>
            </div>
          </sc-for>
          <span style="flex:1"></span>
          <span style="align-self:center;font-size:12px;color:#8a8699">Hover for a summary · click to open another tab</span>
        </div>

        <sc-if value="{{ e.isFeat }}" hint-placeholder-val="{{ true }}">
          <div style="flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr) minmax(0,1fr);align-items:start">
            <div style="padding:16px 22px 22px;display:grid;gap:14px;align-content:start;border-right:1px solid #f0f0f0;min-height:100%">
              <div style="display:grid;gap:4px">
                <span style="font-size:11px;color:#737373;font-variant-numeric:tabular-nums">{{ e.cur.dates }}</span>
                <input value="{{ e.cur.name }}" onChange="{{ e.onName }}" style="font:inherit;font-size:17px;font-weight:650;line-height:1.3;border:1px solid transparent;border-radius:7px;padding:4px 6px;margin:0 -7px;outline:none;color:#0a0a0a;background:transparent" style-hover="border-color:#e5e5e5" style-focus="border-color:#2e2456;background:#fff">
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
                <div style="position:relative;display:grid;gap:4px">
                  <span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Epic</span>
                  <span onClick="{{ e.openEpic }}" style="cursor:pointer;height:34px;min-width:150px;display:flex;align-items:center;gap:8px;padding:0 10px;border-radius:8px;border:1px solid {{ e.epicBd }};background:#fff;font-size:13px;font-weight:500" style-hover="border-color:#b9b4cc">
                    <span style="width:9px;height:9px;border-radius:3px;background:{{ e.cur.railC }}"></span><span style="flex:1">{{ e.cur.rail }}</span><span style="font-size:10px;color:#8a8a8a">▾</span>
                  </span>
                  <sc-if value="{{ e.popEpic }}" hint-placeholder-val="{{ false }}">
                    <div style="position:absolute;z-index:30;top:62px;left:0;width:260px;background:#fff;border:1px solid #e5e5e5;border-radius:10px;box-shadow:0 12px 32px rgba(46,36,86,.18);overflow:hidden">
                      <div style="padding:8px;border-bottom:1px solid #f0f0f0"><input value="{{ e.q }}" onChange="{{ e.onQ }}" placeholder="Search epics" style="width:100%;height:30px;font:inherit;font-size:13px;border:1px solid #e0e0e6;border-radius:6px;padding:0 8px;outline:none"></div>
                      <div style="max-height:190px;overflow:auto;padding:4px">
                        <sc-for list="{{ e.epicOpts }}" as="o" hint-placeholder-count="6">
                          <div onClick="{{ o.pick }}" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;font-size:13px;background:{{ o.bg }}" style-hover="background:#f5f4f9"><span style="width:9px;height:9px;border-radius:3px;background:{{ o.c }}"></span><span style="flex:1">{{ o.name }}</span><span style="font-size:11px;color:#8a8a8a">{{ o.mark }}</span></div>
                        </sc-for>
                      </div>
                    </div>
                  </sc-if>
                </div>
                <div style="display:grid;gap:4px">
                  <span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Estimate</span>
                  <div style="height:34px;display:flex;align-items:center;border:1px solid #e0e0e6;border-radius:8px;overflow:hidden;background:#fff">
                    <span onClick="{{ e.estDown }}" style="cursor:pointer;width:30px;height:100%;display:flex;align-items:center;justify-content:center;font-size:15px;color:#525252" style-hover="background:#f5f5f5">−</span>
                    <input value="{{ e.cur.est }}" onChange="{{ e.onEst }}" style="width:42px;height:100%;border:none;border-left:1px solid #f0f0f0;border-right:1px solid #f0f0f0;text-align:center;font:inherit;font-size:13px;font-weight:600;outline:none;font-variant-numeric:tabular-nums">
                    <span onClick="{{ e.estUp }}" style="cursor:pointer;width:30px;height:100%;display:flex;align-items:center;justify-content:center;font-size:15px;color:#525252" style-hover="background:#f5f5f5">+</span>
                  </div>
                </div>
                <div style="position:relative;display:grid;gap:4px">
                  <span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Sprint</span>
                  <div style="height:34px;display:flex;align-items:center;border:1px solid {{ e.sprintBd }};border-radius:8px;overflow:hidden;background:#fff">
                    <span onClick="{{ e.pinDown }}" style="cursor:pointer;width:30px;height:100%;display:flex;align-items:center;justify-content:center;font-size:15px;color:#525252" style-hover="background:#f5f5f5">−</span>
                    <span onClick="{{ e.openSprint }}" style="cursor:pointer;height:100%;min-width:92px;display:flex;align-items:center;gap:6px;padding:0 10px;border-left:1px solid #f0f0f0;border-right:1px solid #f0f0f0;font-size:13px;font-weight:600" style-hover="background:#fafafa">{{ e.cur.sprint }}<span style="font-size:11px;font-weight:400;color:#8a8a8a">{{ e.cur.pinNote }}</span><span style="font-size:10px;color:#8a8a8a">▾</span></span>
                    <span onClick="{{ e.pinUp }}" style="cursor:pointer;width:30px;height:100%;display:flex;align-items:center;justify-content:center;font-size:15px;color:#525252" style-hover="background:#f5f5f5">+</span>
                  </div>
                  <sc-if value="{{ e.popSprint }}" hint-placeholder-val="{{ false }}">
                    <div style="position:absolute;z-index:30;top:62px;left:0;width:240px;background:#fff;border:1px solid #e5e5e5;border-radius:10px;box-shadow:0 12px 32px rgba(46,36,86,.18);padding:4px;max-height:230px;overflow:auto">
                      <sc-for list="{{ e.sprintOpts }}" as="o" hint-placeholder-count="8">
                        <div onClick="{{ o.pick }}" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:6px;font-size:13px;background:{{ o.bg }}" style-hover="background:#f5f4f9"><span style="width:52px;font-weight:600">{{ o.label }}</span><span style="flex:1;font-size:12px;color:#737373">{{ o.dates }}</span><span style="font-size:11px;color:#2e2456">{{ o.mark }}</span></div>
                      </sc-for>
                    </div>
                  </sc-if>
                </div>
                <span style="width:1px;height:34px;background:#ececf0;margin:0 4px"></span>
                <div style="display:grid;gap:4px">
                  <span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Group</span>
                  <div style="display:flex;gap:6px;height:34px;align-items:center">
                    <sc-for list="{{ e.groups }}" as="g" hint-placeholder-count="3">
                      <span onClick="{{ g.pick }}" style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;font-size:12px;font-weight:500;background:{{ g.bg }};color:{{ g.ink }};border:1px solid {{ g.bd }}"><span style="width:8px;height:8px;border-radius:50%;background:{{ g.c }}"></span>{{ g.label }}</span>
                    </sc-for>
                  </div>
                </div>
              </div>
              <span style="font-size:11.5px;line-height:1.45;color:#8a8699;max-width:560px">Sprint is placed by the schedule unless pinned. A pin is a floor: it can only delay a feature, never move it earlier.</span>
            </div>

            <div style="padding:16px 22px 22px;display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-content:start;border-right:1px solid #f0f0f0;min-height:100%">
              <div style="position:relative;display:grid;grid-template-columns:minmax(0,1fr);gap:8px">
                <div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:12px;font-weight:600;color:#3a3650">Waits for</span><span style="font-size:11.5px;color:#8a8699">starts after these finish</span></div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                  <sc-for list="{{ e.after }}" as="w" hint-placeholder-count="2">
                    <span style="max-width:100%;display:flex;align-items:center;gap:6px;height:28px;padding:0 4px 0 9px;border-radius:7px;border:1px solid #e0e0e6;background:#fff;font-size:12px">
                      <span style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:{{ w.c }}"></span>
                      <span onClick="{{ w.open }}" style="cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" style-hover="text-decoration:underline">{{ w.name }}</span>
                      <span onClick="{{ w.remove }}" style="cursor:pointer;width:18px;height:18px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:4px;color:#8a8a8a" style-hover="background:#f0f0f3;color:#0a0a0a">×</span>
                    </span>
                  </sc-for>
                  <span onClick="{{ e.openDeps }}" style="cursor:pointer;height:28px;display:flex;align-items:center;padding:0 10px;border-radius:7px;border:1px dashed #c9c6d6;font-size:12px;color:#5b5675" style-hover="border-color:#2e2456;color:#2e2456">+ Add</span>
                </div>
                <sc-if value="{{ e.noAfter }}" hint-placeholder-val="{{ false }}"><span style="font-size:12px;color:#a3a3a3">Nothing. It can start as soon as its rail is free.</span></sc-if>
                <sc-if value="{{ e.popDeps }}" hint-placeholder-val="{{ false }}">
                  <div style="position:relative;max-width:360px;background:#fff;border:1px solid #e5e5e5;border-radius:10px;box-shadow:0 12px 32px rgba(46,36,86,.18);overflow:hidden">
                    <div style="padding:8px;border-bottom:1px solid #f0f0f0"><input value="{{ e.q }}" onChange="{{ e.onQ }}" placeholder="Search features" style="width:100%;height:30px;font:inherit;font-size:13px;border:1px solid #e0e0e6;border-radius:6px;padding:0 8px;outline:none"></div>
                    <div style="max-height:200px;overflow:auto;padding:4px">
                      <sc-for list="{{ e.depOpts }}" as="o" hint-placeholder-count="6">
                        <div onClick="{{ o.pick }}" style="cursor:{{ o.cursor }};display:grid;grid-template-columns:auto minmax(0,1fr);gap:1px 8px;align-items:center;padding:7px 8px;border-radius:6px" style-hover="background:#f5f4f9">
                          <span style="width:7px;height:7px;border-radius:50%;background:{{ o.c }}"></span>
                          <span style="font-size:13px;color:{{ o.ink }};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ o.name }}</span>
                          <span></span>
                          <span style="font-size:11px;color:{{ o.subInk }}">{{ o.sub }}</span>
                        </div>
                      </sc-for>
                    </div>
                  </div>
                </sc-if>
              </div>
              <div style="display:grid;gap:8px">
                <div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:12px;font-weight:600;color:#3a3650">Unblocks</span><span style="font-size:11.5px;color:#8a8699">these start after this finishes</span></div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                  <sc-for list="{{ e.next }}" as="w" hint-placeholder-count="1">
                    <span onClick="{{ w.open }}" style="cursor:pointer;max-width:100%;display:flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:7px;background:#f6f5f9;font-size:12px" style-hover="background:#efecfa">
                      <span style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:{{ w.c }}"></span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ w.name }}</span><span style="color:#8a8699">→</span>
                    </span>
                  </sc-for>
                </div>
                <sc-if value="{{ e.noNext }}" hint-placeholder-val="{{ false }}"><span style="font-size:12px;color:#a3a3a3">Nothing waits for this yet.</span></sc-if>
              </div>
            </div>

            <div style="padding:16px 22px 22px;display:grid;gap:10px;background:#fbfbfc;min-height:100%;align-content:start">
              <div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:12px;font-weight:600;color:#3a3650">Items</span><span style="font-size:11.5px;color:#8a8699">{{ e.itemSummary }}</span></div>
              <div style="display:grid;grid-template-columns:minmax(0,1fr);border:1px solid #ececf0;border-radius:8px;background:#fff;overflow:hidden">
                <sc-for list="{{ e.itemRows }}" as="it" hint-placeholder-count="4">
                  <div style="min-width:0;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 10px;border-top:1px solid #f2f2f5">
                    <span style="width:16px;font-size:11px;color:#a3a3a3;font-variant-numeric:tabular-nums">{{ it.n }}</span>
                    <span onClick="{{ it.open }}" style="cursor:pointer;flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" style-hover="color:#2e2456;text-decoration:underline">{{ it.name }}</span>
                    <div style="height:24px;display:flex;align-items:center;border:1px solid #ececf0;border-radius:6px;font-size:12px;font-variant-numeric:tabular-nums">
                      <span onClick="{{ it.down }}" style="cursor:pointer;width:20px;text-align:center;color:#737373" style-hover="color:#0a0a0a">−</span><span style="min-width:28px;text-align:center;font-weight:600">{{ it.est }}</span><span onClick="{{ it.up }}" style="cursor:pointer;width:20px;text-align:center;color:#737373" style-hover="color:#0a0a0a">+</span>
                    </div>
                  </div>
                </sc-for>
                <div style="display:flex;gap:6px;padding:6px;border-top:1px solid #f2f2f5;background:#fcfcfd">
                  <input value="{{ e.newItem }}" onChange="{{ e.onNewItem }}" placeholder="New item…" style="flex:1;min-width:0;height:30px;font:inherit;font-size:13px;border:1px solid transparent;border-radius:6px;padding:0 8px;outline:none;background:transparent" style-focus="border-color:#2e2456;background:#fff">
                  <span onClick="{{ e.addItem }}" style="cursor:pointer;height:30px;display:inline-flex;align-items:center;padding:0 12px;border-radius:6px;background:#2e2456;color:#fff;font-size:12px;font-weight:500">Add</span>
                </div>
              </div>
            </div>
          </div>
        </sc-if>

        <sc-if value="{{ e.isItem }}" hint-placeholder-val="{{ false }}">
          <div style="flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,2fr);align-items:start">
            <div style="padding:16px 22px 22px;display:grid;gap:14px;align-content:start;border-right:1px solid #f0f0f0;min-height:100%">
              <div style="display:grid;gap:4px">
                <span style="font-size:11px;color:#737373;font-variant-numeric:tabular-nums">{{ e.cur.dates }}</span>
                <input value="{{ e.cur.name }}" onChange="{{ e.onName }}" style="font:inherit;font-size:17px;font-weight:650;line-height:1.3;border:1px solid transparent;border-radius:7px;padding:4px 6px;margin:0 -7px;outline:none;color:#0a0a0a;background:transparent" style-hover="border-color:#e5e5e5" style-focus="border-color:#2e2456;background:#fff">
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
                <div style="position:relative;display:grid;gap:4px">
                  <span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Feature</span>
                  <span onClick="{{ e.openFeat }}" style="cursor:pointer;height:34px;max-width:300px;display:flex;align-items:center;gap:8px;padding:0 10px;border-radius:8px;border:1px solid {{ e.featBd }};background:#fff;font-size:13px;font-weight:500" style-hover="border-color:#b9b4cc">
                    <span style="width:9px;height:9px;border-radius:50%;flex-shrink:0;background:{{ e.cur.railC }}"></span><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ e.cur.parent }}</span><span style="font-size:10px;color:#8a8a8a">▾</span>
                  </span>
                  <sc-if value="{{ e.popFeat }}" hint-placeholder-val="{{ false }}">
                    <div style="position:absolute;z-index:30;top:62px;left:0;width:320px;background:#fff;border:1px solid #e5e5e5;border-radius:10px;box-shadow:0 12px 32px rgba(46,36,86,.18);overflow:hidden">
                      <div style="padding:8px;border-bottom:1px solid #f0f0f0"><input value="{{ e.q }}" onChange="{{ e.onQ }}" placeholder="Search features" style="width:100%;height:30px;font:inherit;font-size:13px;border:1px solid #e0e0e6;border-radius:6px;padding:0 8px;outline:none"></div>
                      <div style="max-height:190px;overflow:auto;padding:4px">
                        <sc-for list="{{ e.featOpts }}" as="o" hint-placeholder-count="6">
                          <div onClick="{{ o.pick }}" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;font-size:13px;background:{{ o.bg }}" style-hover="background:#f5f4f9"><span style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:{{ o.c }}"></span><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ o.name }}</span><span style="font-size:11px;color:#8a8a8a">{{ o.mark }}</span></div>
                        </sc-for>
                      </div>
                    </div>
                  </sc-if>
                </div>
                <div style="display:grid;gap:4px">
                  <span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Estimate</span>
                  <div style="height:34px;display:flex;align-items:center;border:1px solid #e0e0e6;border-radius:8px;overflow:hidden;background:#fff">
                    <span onClick="{{ e.estDown }}" style="cursor:pointer;width:30px;height:100%;display:flex;align-items:center;justify-content:center;font-size:15px;color:#525252" style-hover="background:#f5f5f5">−</span>
                    <input value="{{ e.cur.est }}" onChange="{{ e.onEst }}" style="width:42px;height:100%;border:none;border-left:1px solid #f0f0f0;border-right:1px solid #f0f0f0;text-align:center;font:inherit;font-size:13px;font-weight:600;outline:none;font-variant-numeric:tabular-nums">
                    <span onClick="{{ e.estUp }}" style="cursor:pointer;width:30px;height:100%;display:flex;align-items:center;justify-content:center;font-size:15px;color:#525252" style-hover="background:#f5f5f5">+</span>
                  </div>
                </div>
                <div style="display:grid;gap:4px">
                  <span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Sprint</span>
                  <span style="height:34px;display:flex;align-items:center;gap:6px;padding:0 12px;border-radius:8px;background:#f6f5f9;font-size:13px;font-weight:600">{{ e.cur.sprint }}<span style="font-size:11px;font-weight:400;color:#8a8a8a">placed by order</span></span>
                </div>
              </div>
              <span style="font-size:11.5px;line-height:1.45;color:#8a8699;max-width:520px">Days of work, in halves: 0.5, 1, 1.5. Items run one after another inside their feature, so changing an estimate moves the items that follow it.</span>
            </div>
            <div style="padding:16px 22px 22px;display:grid;gap:12px;align-content:start">
              <div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:12px;font-weight:600;color:#3a3650">Order in feature</span><span style="font-size:11.5px;color:#8a8699">{{ e.cur.pos }}</span></div>
              <div style="display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:10px;align-items:center">
                <div style="display:grid;gap:3px;padding:10px 12px;border-radius:8px;background:#f6f5f9;min-width:0"><span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Comes after</span><span onClick="{{ e.openPrev }}" style="cursor:pointer;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ e.cur.prev }}</span></div>
                <div style="display:flex;gap:4px">
                  <span onClick="{{ e.moveEarlier }}" title="Move earlier" style="cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:7px;border:1px solid #e0e0e6;font-size:14px" style-hover="background:#f5f5f5">←</span>
                  <span onClick="{{ e.moveLater }}" title="Move later" style="cursor:pointer;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:7px;border:1px solid #e0e0e6;font-size:14px" style-hover="background:#f5f5f5">→</span>
                </div>
                <div style="display:grid;gap:3px;padding:10px 12px;border-radius:8px;background:#f6f5f9;min-width:0"><span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Comes before</span><span onClick="{{ e.openNext }}" style="cursor:pointer;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ e.cur.nextName }}</span></div>
              </div>
            </div>
          </div>
        </sc-if>

        <sc-if value="{{ e.none }}" hint-placeholder-val="{{ false }}">
          <div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:13px;color:#8a8699">Click a feature or an item on the timeline to open it here.</div>
        </sc-if>
      </div>
    </div>
    <div style="display:grid;gap:4px;font-size:13px;line-height:1.5;color:#3a3650;max-width:1000px">
      <div>• Sprint zoom: each feature is a thin line with diamonds at its start and end, and its items sit as bars on that line. Quarter and Year zoom show whole feature bars.</div><div>• Hover a feature line, a feature bar or an item to get a + at its start and end. Drag the + along the rail to size a provisional bar (a new item, or a new feature after or before it). Drag it onto another rail to start a new feature there, linked to the source. The chip shows its length and which sprints it spans.</div>
      <div>• Feature tab: the name, then Epic (searchable picker), Estimate (− value +, typeable) and Sprint (− pick +, with dates), then Group. Waits for / Unblocks replace the checkbox list. Items can be edited inline.</div>
      <div>• Item tab: the parent feature (searchable), estimate, its derived sprint, and its order (comes after / before, move ← →).</div>
      <div>• Move, delete and new-feature controls are taken out of the panel. Delete could live in a ⋯ menu on the tab.</div>
    </div>
  </div>
</section>

<section style="padding:56px 56px 24px;display:grid;gap:24px">
  <div style="display:grid;gap:6px;max-width:900px">
    <div style="font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#5b5675">Turn 3 · Calm board, refined</div>
    <div style="font-size:15px;line-height:1.5;color:#3a3650;text-wrap:pretty">This turn uses the original coloring again (group washes, rail-coloured arcs, item ticks) and a header labelled by year, quarter and sprint. Hover a bar for the quick card. Click it to open the feature as a tab in the panel below, which holds the restyled form.</div>
  </div>
  <div id="3a" style="display:grid;gap:14px">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="background:#2e2456;color:#ffd24a;font-weight:700;font-size:13px;padding:3px 9px;border-radius:6px">3a</span>
      <span style="font-size:15px;font-weight:600">Calm board + hover card + detail tabs</span>
      <span style="font-size:13px;color:#5b5675">interactive: hover and click the bars</span>
    </div>
    <div style="width:1440px;height:1040px;overflow:hidden;background:#fff;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(0,0,0,.06),0 12px 40px rgba(46,36,86,.12);border-radius:4px">
      <header style="background:#2e2456;border-bottom:3px solid #ffd24a;color:#fff;display:flex;align-items:center;gap:12px;padding:8px 20px;flex-shrink:0">
        <img src="logo.webp" alt="CC Guild logo" style="width:28px;height:28px;border-radius:7px;display:block">
        <span style="display:grid">
          <span style="font-size:14px;line-height:1.1;font-weight:700;letter-spacing:.02em">Macroplan</span>
          <span style="font-size:10px;letter-spacing:.14em;color:#ffd24a;text-transform:uppercase">CC Guild</span>
        </span>
        <span style="width:1px;height:22px;background:rgba(255,255,255,.18);margin:0 6px"></span>
        <span style="font-size:13px;color:#c9c3e6">Plans</span>
        <span style="font-size:13px;color:#8e86b5">/</span>
        <span style="font-size:13px;font-weight:600">Identity Management Plan</span>
        <span style="flex:1"></span>
        <span style="font-size:13px;color:#c9c3e6">Sign out</span>
      </header>
      <div style="display:flex;align-items:center;gap:16px;padding:14px 20px;border-bottom:1px solid #e5e5e5;flex-shrink:0">
        <div style="display:grid;gap:2px">
          <div style="font-size:20px;font-weight:650;line-height:1.15">Identity Management Plan</div>
          <div style="display:flex;gap:8px;font-size:12px;color:#737373"><span>starts 2026-09-28</span><span>·</span><span>10-day sprints</span><span>·</span><span>UTC</span></div>
        </div>
        <div style="display:flex;gap:2px;padding:2px;border-radius:8px;background:#f5f5f5;margin-left:12px">
          <span style="padding:4px 12px;border-radius:6px;background:#fff;font-size:13px;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.08)">Timeline</span>
          <span style="padding:4px 12px;border-radius:6px;font-size:13px;font-weight:500;color:#737373">Table</span>
        </div>
        <span style="flex:1"></span>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="padding:4px 10px;border-radius:999px;background:#2e2456;color:#fff;font-size:12px;font-weight:500">All work</span>
          <span style="display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#f1edfd;color:#4c1d95;font-size:12px;font-weight:500"><span style="width:8px;height:8px;border-radius:50%;background:#7c3aed"></span>Phase 0<span style="color:#7c6aa8">8</span></span>
          <span style="display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#e8f5ef;color:#0f5a3d;font-size:12px;font-weight:500"><span style="width:8px;height:8px;border-radius:50%;background:#1f9d6b"></span>Phase 1<span style="color:#4f8a72">29</span></span>
          <span style="padding:3px 10px;border-radius:999px;border:1px dashed #d4d4d4;color:#737373;font-size:12px">+ Group</span>
        </div>
        <span style="width:1px;height:22px;background:#e5e5e5"></span>
        <div style="display:flex;gap:2px;padding:2px;border-radius:8px;background:#f5f5f5">
          <span style="padding:4px 10px;border-radius:6px;font-size:13px;font-weight:500;color:#737373">Year</span>
          <span style="padding:4px 10px;border-radius:6px;font-size:13px;font-weight:500;color:#737373">Quarter</span>
          <span style="padding:4px 10px;border-radius:6px;background:#fff;font-size:13px;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.08)">Sprint</span>
        </div>
        <span style="height:28px;display:inline-flex;align-items:center;padding:0 10px;border-radius:6px;border:1px solid #e5e5e5;font-size:13px;font-weight:500">Settings</span>
        <span style="height:28px;display:inline-flex;align-items:center;padding:0 12px;border-radius:6px;background:#2e2456;color:#fff;font-size:13px;font-weight:500">Share</span>
      </div>
      <div style="display:flex;flex:1;min-height:0">
        <div style="width:264px;flex-shrink:0;border-right:1px solid #e5e5e5;display:flex;flex-direction:column">
          <div style="height:72px;display:flex;align-items:flex-end;gap:8px;padding:0 12px 10px;border-bottom:1px solid #e5e5e5">
            <input placeholder="Filter rails and features" style="flex:1;min-width:0;border:1px solid #e5e5e5;border-radius:6px;padding:5px 8px;font:inherit;font-size:13px;outline:none">
            <span style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;border:1px solid #e5e5e5;font-size:16px;color:#525252">+</span>
          </div>
          <sc-for list="{{ rails }}" as="r" hint-placeholder-count="8">
            <div style="height:52px;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid #f0f0f0">
              <span style="width:10px;height:10px;border-radius:3px;flex-shrink:0;background:{{ r.c }}"></span>
              <span style="flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.name }}</span>
              <span style="font-size:11px;color:#737373;font-variant-numeric:tabular-nums">{{ r.count }}</span>
            </div>
          </sc-for>
        </div>
        <div style="flex:1;min-width:0;position:relative;overflow:hidden;background:#fff">
          <div style="height:72px;position:relative;border-bottom:1px solid #e5e5e5;background:#fff">
            <div style="position:absolute;left:0;right:0;top:0;height:20px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;padding:0 10px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#2e2456"><span>2026</span></div>
            <div style="position:absolute;left:0;right:0;top:20px;height:22px;border-bottom:1px solid #f0f0f0">
              <span style="position:absolute;top:0;bottom:0;left:0;width:{{ d.q4 }}px;display:flex;align-items:center;padding:0 10px;font-size:11px;font-weight:600;color:#737373;background:#fafafa">Q3</span>
              <span style="position:absolute;top:0;bottom:0;left:{{ d.q4 }}px;right:0;display:flex;align-items:center;padding:0 10px;font-size:11px;font-weight:600;border-left:1px solid #e5e5e5">Q4 2026</span>
            </div>
            <sc-for list="{{ d.sprints }}" as="s" hint-placeholder-count="3">
              <div style="position:absolute;top:42px;bottom:0;left:{{ s.left }}px;width:{{ s.w }}px;border-left:1px solid #e5e5e5;padding:0 10px;display:flex;align-items:center;gap:8px">
                <span style="font-size:12px;font-weight:600">{{ s.name }}</span>
                <span style="font-size:11px;color:#737373;font-variant-numeric:tabular-nums">{{ s.week }} · {{ s.dates }}</span>
              </div>
            </sc-for>
            <div style="position:absolute;top:2px;left:{{ d.todayPill }}px;background:#ffd24a;color:#2e2456;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;letter-spacing:.02em">TODAY</div>
          </div>
          <div style="position:absolute;top:72px;left:0;right:0;bottom:0">
            <sc-for list="{{ d.sprints }}" as="s" hint-placeholder-count="3">
              <div style="position:absolute;top:0;bottom:0;left:{{ s.left }}px;width:{{ s.w }}px;border-left:1px solid #ededed;background:{{ s.bg }}"></div>
            </sc-for>
            <sc-for list="{{ rails }}" as="r" hint-placeholder-count="8">
              <div style="position:absolute;left:0;right:0;top:{{ r.topD }}px;height:52px;border-bottom:1px solid #f0f0f0"></div>
            </sc-for>
            {{ d.arcs }}
            <sc-for list="{{ d.bars }}" as="x" hint-placeholder-count="12">
              <div onMouseEnter="{{ x.enter }}" onMouseLeave="{{ x.leave }}" onClick="{{ x.click }}" style="position:absolute;cursor:pointer;left:{{ x.left }}px;top:{{ x.top }}px;width:{{ x.w }}px;height:{{ x.h }}px;border-radius:{{ x.radius }};transform:{{ x.rot }};background:{{ x.bg }};border:{{ x.border }};opacity:{{ x.op }};overflow:hidden;display:flex;align-items:center;transition:opacity .12s">
                <span style="padding:0 8px;font-size:12px;font-weight:500;color:{{ x.ink }};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">{{ x.label }}</span>
              </div>
            </sc-for>
            <sc-for list="{{ d.ticks }}" as="k" hint-placeholder-count="6">
              <div style="position:absolute;pointer-events:none;left:{{ k.left }}px;top:{{ k.top }}px;width:{{ k.w }}px;height:3px;border-radius:2px;background:{{ k.bg }};opacity:{{ k.op }}"></div>
            </sc-for>
            <div style="position:absolute;top:0;bottom:0;width:2px;background:#e0ac00;left:{{ d.today }}px;pointer-events:none"></div>
            <sc-if value="{{ d.pop.show }}" hint-placeholder-val="{{ false }}">
              <div style="position:absolute;z-index:20;pointer-events:none;left:{{ d.pop.left }}px;top:{{ d.pop.top }}px;width:300px;background:#fff;border:1px solid #e5e5e5;border-radius:10px;box-shadow:0 12px 32px rgba(46,36,86,.16),0 2px 6px rgba(0,0,0,.06);overflow:hidden">
                <div style="padding:12px 14px 10px;display:grid;gap:6px">
                  <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#737373">
                    <span style="width:8px;height:8px;border-radius:3px;background:{{ d.pop.groupC }}"></span>{{ d.pop.group }}<span>·</span><span style="width:8px;height:8px;border-radius:50%;background:{{ d.pop.railC }}"></span>{{ d.pop.rail }}
                  </div>
                  <div style="font-size:14px;font-weight:600;line-height:1.3;text-wrap:pretty">{{ d.pop.title }}</div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #f0f0f0;background:#fafafa">
                  <div style="padding:8px 14px;display:grid;gap:1px"><span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Estimate</span><span style="font-size:13px;font-weight:500">{{ d.pop.est }}</span></div>
                  <div style="padding:8px 14px;display:grid;gap:1px;border-left:1px solid #f0f0f0"><span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Sprint</span><span style="font-size:13px;font-weight:500">{{ d.pop.sprint }}</span></div>
                  <div style="padding:8px 14px;display:grid;gap:1px;border-left:1px solid #f0f0f0"><span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Waits on</span><span style="font-size:13px;font-weight:500">{{ d.pop.deps }}</span></div>
                </div>
                <div style="padding:8px 14px;border-top:1px solid #f0f0f0;display:flex;font-size:12px;color:#525252;font-variant-numeric:tabular-nums"><span style="flex:1">{{ d.pop.dates }}</span><span style="color:#2e2456;font-weight:500">Click to open</span></div>
              </div>
            </sc-if>
          </div>
        </div>
      </div>
      <div style="height:420px;flex-shrink:0;border-top:1px solid #dcdae4;background:#fff;display:flex;flex-direction:column;box-shadow:0 -6px 20px rgba(46,36,86,.06)">
        <div style="height:40px;flex-shrink:0;display:flex;align-items:flex-end;gap:2px;padding:0 12px;background:#f6f5f9;border-bottom:1px solid #e5e5e5">
          <sc-for list="{{ d.tabs }}" as="t" hint-placeholder-count="1">
            <div onClick="{{ t.select }}" style="cursor:pointer;height:32px;max-width:260px;display:flex;align-items:center;gap:8px;padding:0 8px 0 12px;border-radius:8px 8px 0 0;background:{{ t.bg }};border:1px solid {{ t.bd }};border-bottom:none;margin-bottom:-1px">
              <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:{{ t.c }}"></span>
              <span style="font-size:12px;font-weight:{{ t.fw }};color:{{ t.ink }};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ t.name }}</span>
              <span onClick="{{ t.close }}" style="width:18px;height:18px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:4px;font-size:13px;color:#8a8a8a" style-hover="background:#ecebf1;color:#0a0a0a">×</span>
            </div>
          </sc-for>
          <span style="flex:1"></span>
          <span style="align-self:center;font-size:12px;color:#8a8699">{{ d.tabHint }}</span>
        </div>
        <sc-if value="{{ d.hasTab }}" hint-placeholder-val="{{ true }}">
          <div style="flex:1;min-height:0;display:grid;grid-template-columns:1.15fr 1fr 1fr .95fr">
            <div style="padding:18px 22px;display:grid;align-content:start;gap:16px;border-right:1px solid #f0f0f0;overflow:auto">
              <div style="display:grid;gap:6px">
                <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#737373"><span style="width:8px;height:8px;border-radius:50%;background:{{ d.f.railC }}"></span>{{ d.f.rail }}<span>·</span>{{ d.f.sprint }}<span>·</span>{{ d.f.dates }}</div>
                <input value="{{ d.f.name }}" onChange="{{ d.onName }}" style="font:inherit;font-size:17px;font-weight:650;line-height:1.3;border:1px solid transparent;border-radius:7px;padding:4px 6px;margin:0 -7px;outline:none;color:#0a0a0a;background:transparent" style-hover="border-color:#e5e5e5" style-focus="border-color:#2e2456;background:#fff">
              </div>
              <div style="display:grid;gap:6px">
                <span style="font-size:12px;font-weight:600;color:#3a3650">Estimate in days</span>
                <div style="display:flex;gap:8px;align-items:center">
                  <input value="{{ d.f.est }}" onChange="{{ d.onEst }}" placeholder="Not sized" style="width:110px;height:34px;font:inherit;font-size:13px;border:1px solid #e0e0e6;border-radius:7px;padding:0 10px;outline:none" style-focus="border-color:#2e2456;box-shadow:0 0 0 3px #efecfa">
                  <span style="font-size:12px;color:#737373">days</span>
                </div>
                <span style="font-size:11.5px;line-height:1.45;color:#8a8699">Days of work, in halves — 0.5, 1, 1.5. Empty means nobody has sized it; 0 is a milestone that takes no time.</span>
              </div>
              <div style="display:grid;gap:6px">
                <span style="font-size:12px;font-weight:600;color:#3a3650">Pinned to sprint</span>
                <div style="display:flex;gap:4px;padding:3px;border-radius:8px;background:#f5f5f5;width:max-content">
                  <sc-for list="{{ d.pins }}" as="p" hint-placeholder-count="7">
                    <span onClick="{{ p.pick }}" style="cursor:pointer;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:500;color:{{ p.ink }};background:{{ p.bg }};box-shadow:{{ p.sh }}">{{ p.label }}</span>
                  </sc-for>
                </div>
                <span style="font-size:11.5px;line-height:1.45;color:#8a8699">Sprints are counted from 1, as the table numbers them. Empty means no pin. A pin is a floor: it can only delay a feature, never move it earlier.</span>
              </div>
            </div>
            <div style="padding:18px 22px;display:grid;align-content:start;gap:16px;border-right:1px solid #f0f0f0;overflow:auto">
              <div style="display:grid;gap:6px">
                <span style="font-size:12px;font-weight:600;color:#3a3650">Group</span>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <sc-for list="{{ d.groups }}" as="g" hint-placeholder-count="3">
                    <span onClick="{{ g.pick }}" style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;font-size:12px;font-weight:500;background:{{ g.bg }};color:{{ g.ink }};border:1px solid {{ g.bd }}"><span style="width:8px;height:8px;border-radius:50%;background:{{ g.c }}"></span>{{ g.label }}</span>
                  </sc-for>
                </div>
                <span style="font-size:11.5px;line-height:1.45;color:#8a8699">A group spans rails: choosing its chip above lights every feature in it and dims the rest. It changes no date.</span>
              </div>
              <div style="display:grid;gap:6px">
                <span style="font-size:12px;font-weight:600;color:#3a3650">Waits on</span>
                <div style="display:grid;border:1px solid #ececf0;border-radius:8px;overflow:hidden">
                  <sc-for list="{{ d.waits }}" as="w" hint-placeholder-count="5">
                    <div onClick="{{ w.toggle }}" style="cursor:{{ w.cursor }};display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 10px;align-items:center;padding:8px 10px;border-top:1px solid #f2f2f5;background:{{ w.bg }}">
                      <span style="width:16px;height:16px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;background:{{ w.boxBg }};border:1.5px solid {{ w.boxBd }}">{{ w.mark }}</span>
                      <span style="display:flex;align-items:center;gap:6px;min-width:0;font-size:13px;color:{{ w.ink }}"><span style="width:7px;height:7px;border-radius:50%;flex-shrink:0;background:{{ w.c }}"></span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ w.name }}</span></span>
                      <span></span>
                      <span style="font-size:11px;color:#b45309;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ w.hint }}</span>
                    </div>
                  </sc-for>
                </div>
              </div>
            </div>
            <div style="padding:18px 22px;display:grid;align-content:start;gap:16px;border-right:1px solid #f0f0f0;overflow:auto">
              <div style="display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #ececf0;border-radius:8px;overflow:hidden">
                <div style="padding:8px 12px;display:grid;gap:1px"><span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Epic</span><span style="font-size:13px;font-weight:500">{{ d.f.rail }}</span></div>
                <div style="padding:8px 12px;display:grid;gap:1px;border-left:1px solid #ececf0"><span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Estimate</span><span style="font-size:13px;font-weight:500">{{ d.f.estLabel }}</span></div>
                <div style="padding:8px 12px;display:grid;gap:1px;border-left:1px solid #ececf0"><span style="font-size:10px;font-weight:600;letter-spacing:.05em;color:#8a8a8a;text-transform:uppercase">Sprint</span><span style="font-size:13px;font-weight:500">{{ d.f.sprint }}</span></div>
              </div>
              <span style="font-size:11.5px;line-height:1.45;color:#8a8699;margin-top:-6px">Broken down: the timeline places this feature by its items. Its own estimate is kept rather than overwritten, so changing it moves no bar.</span>
              <div style="display:grid;gap:6px">
                <span style="font-size:12px;font-weight:600;color:#3a3650">Move on its rail</span>
                <div style="display:flex;gap:6px">
                  <span style="height:32px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;border-radius:7px;border:1px solid #e0e0e6;font-size:13px;font-weight:500;color:#a3a3a3">↑ Move up</span>
                  <span style="height:32px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;border-radius:7px;border:1px solid #e0e0e6;font-size:13px;font-weight:500" style-hover="background:#f5f5f5">↓ Move down</span>
                </div>
              </div>
              <div style="display:grid;gap:6px">
                <span style="font-size:12px;font-weight:600;color:#3a3650">Move to another rail</span>
                <select style="height:34px;font:inherit;font-size:13px;border:1px solid #e0e0e6;border-radius:7px;padding:0 8px;background:#fff;outline:none">
                  <option>On this rail</option>
                  <sc-for list="{{ rails }}" as="r" hint-placeholder-count="8"><option>{{ r.name }}</option></sc-for>
                </select>
              </div>
              <div style="display:flex;align-items:center;gap:10px;padding-top:12px;border-top:1px solid #f0f0f0">
                <span style="flex:1;font-size:11.5px;color:#8a8699">Removes the feature and its items.</span>
                <span style="height:30px;display:inline-flex;align-items:center;padding:0 12px;border-radius:7px;color:#b91c1c;border:1px solid #f3c7c7;font-size:13px;font-weight:500" style-hover="background:#fdf2f2">Delete feature</span>
              </div>
            </div>
            <div style="padding:18px 22px;display:grid;align-content:start;gap:18px;background:#fbfbfc;overflow:auto">
              <div style="display:grid;gap:6px">
                <span style="font-size:12px;font-weight:600;color:#3a3650">New feature on this rail</span>
                <div style="display:flex;gap:6px">
                  <input placeholder="Feature name" style="flex:1;min-width:0;height:34px;font:inherit;font-size:13px;border:1px solid #e0e0e6;border-radius:7px;padding:0 10px;outline:none;background:#fff" style-focus="border-color:#2e2456;box-shadow:0 0 0 3px #efecfa">
                  <span style="height:34px;display:inline-flex;align-items:center;padding:0 12px;border-radius:7px;background:#2e2456;color:#fff;font-size:13px;font-weight:500">Add</span>
                </div>
                <span style="font-size:11.5px;line-height:1.45;color:#8a8699">It is added after the last feature on this rail. Work is usually added in the order it will be done, so there is nothing to place.</span>
              </div>
              <div style="display:grid;gap:6px">
                <span style="font-size:12px;font-weight:600;color:#3a3650">New item in this feature</span>
                <div style="display:flex;gap:6px">
                  <input placeholder="Item name" style="flex:1;min-width:0;height:34px;font:inherit;font-size:13px;border:1px solid #e0e0e6;border-radius:7px;padding:0 10px;outline:none;background:#fff" style-focus="border-color:#2e2456;box-shadow:0 0 0 3px #efecfa">
                  <span style="height:34px;display:inline-flex;align-items:center;padding:0 12px;border-radius:7px;background:#2e2456;color:#fff;font-size:13px;font-weight:500">Add</span>
                </div>
                <span style="font-size:11.5px;line-height:1.45;color:#8a8699">It is added after the last item in this feature. Work is usually added in the order it will be done, so there is nothing to place.</span>
              </div>
            </div>
          </div>
        </sc-if>
        <sc-if value="{{ d.noTab }}" hint-placeholder-val="{{ false }}">
          <div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:13px;color:#8a8699">Click a bar on the timeline to open its details here.</div>
        </sc-if>
      </div>
    </div>
    <div style="display:grid;gap:4px;font-size:13px;line-height:1.5;color:#3a3650;max-width:1000px">
      <div>• Header has three tiers: year, quarter (the partial Q3 is shaded), then sprint with week numbers and dates.</div>
      <div>• Hovering lights the feature's dependency thread and fades the rest. The card shows group, rail, estimate, sprint, what it waits on, and dates.</div>
      <div>• Clicking opens the feature as a tab. Several can be open; × closes one.</div>
      <div>• The form is split into four columns: identity and sizing, group and dependencies, placement, adding work. Sprint pins and groups are segmented controls instead of empty inputs and selects. Blocked dependencies say why inline.</div>
    </div>
  </div>
</section>

<section style="padding:56px 56px 24px;display:grid;gap:24px">
  <div style="display:grid;gap:6px;max-width:900px">
    <div style="font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#5b5675">Turn 2 · Restyle directions</div>
    <div style="font-size:15px;line-height:1.5;color:#3a3650;text-wrap:pretty">Both keep the indigo/gold brand and the rail model. Shared fixes: one rail list instead of two, feature names on the bars, dependency arcs quieted until a feature is picked, and the board grows to fill the screen.</div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:56px;align-items:flex-start">

    <!-- 2a -->
    <div id="2a" style="display:grid;gap:14px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="background:#2e2456;color:#ffd24a;font-weight:700;font-size:13px;padding:3px 9px;border-radius:6px">2a</span>
        <span style="font-size:15px;font-weight:600">Calm board</span>
        <span style="font-size:13px;color:#5b5675">same frame, less chrome, labelled bars</span>
      </div>
      <div style="width:1440px;height:860px;overflow:hidden;background:#fff;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(0,0,0,.06),0 12px 40px rgba(46,36,86,.12);border-radius:4px">
        <header style="background:#2e2456;border-bottom:3px solid #ffd24a;color:#fff;display:flex;align-items:center;gap:12px;padding:8px 20px;flex-shrink:0">
          <img src="logo.webp" alt="CC Guild logo" style="width:28px;height:28px;border-radius:7px;display:block">
          <span style="display:grid">
            <span style="font-size:14px;line-height:1.1;font-weight:700;letter-spacing:.02em">Macroplan</span>
            <span style="font-size:10px;letter-spacing:.14em;color:#ffd24a;text-transform:uppercase">CC Guild</span>
          </span>
          <span style="width:1px;height:22px;background:rgba(255,255,255,.18);margin:0 6px"></span>
          <span style="font-size:13px;color:#c9c3e6">Plans</span>
          <span style="font-size:13px;color:#8e86b5">/</span>
          <span style="font-size:13px;font-weight:600">Identity Management Plan</span>
          <span style="flex:1"></span>
          <span style="font-size:13px;color:#c9c3e6">Sign out</span>
        </header>
        <div style="display:flex;align-items:center;gap:16px;padding:14px 20px;border-bottom:1px solid #e5e5e5;flex-shrink:0">
          <div style="display:grid;gap:2px">
            <div style="font-size:20px;font-weight:650;line-height:1.15">Identity Management Plan</div>
            <div style="display:flex;gap:8px;font-size:12px;color:#737373"><span>starts 2026-09-28</span><span>·</span><span>10-day sprints</span><span>·</span><span>UTC</span></div>
          </div>
          <div style="display:flex;gap:2px;padding:2px;border-radius:8px;background:#f5f5f5;margin-left:12px">
            <span style="padding:4px 12px;border-radius:6px;background:#fff;font-size:13px;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.08)">Timeline</span>
            <span style="padding:4px 12px;border-radius:6px;font-size:13px;font-weight:500;color:#737373">Table</span>
          </div>
          <span style="flex:1"></span>
          <div style="display:flex;gap:6px;align-items:center">
            <span style="padding:4px 10px;border-radius:999px;background:#2e2456;color:#fff;font-size:12px;font-weight:500">All work</span>
            <span style="display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#f1edfd;color:#4c1d95;font-size:12px;font-weight:500"><span style="width:8px;height:8px;border-radius:50%;background:#7c3aed"></span>Phase 0<span style="color:#7c6aa8">8</span></span>
            <span style="display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:#e8f5ef;color:#0f5a3d;font-size:12px;font-weight:500"><span style="width:8px;height:8px;border-radius:50%;background:#1f9d6b"></span>Phase 1<span style="color:#4f8a72">29</span></span>
            <span style="padding:3px 10px;border-radius:999px;border:1px dashed #d4d4d4;color:#737373;font-size:12px">+ Group</span>
          </div>
          <span style="width:1px;height:22px;background:#e5e5e5"></span>
          <div style="display:flex;gap:2px;padding:2px;border-radius:8px;background:#f5f5f5">
            <span style="padding:4px 10px;border-radius:6px;font-size:13px;font-weight:500;color:#737373">Year</span>
            <span style="padding:4px 10px;border-radius:6px;font-size:13px;font-weight:500;color:#737373">Quarter</span>
            <span style="padding:4px 10px;border-radius:6px;background:#fff;font-size:13px;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.08)">Sprint</span>
          </div>
          <span style="height:28px;display:inline-flex;align-items:center;padding:0 10px;border-radius:6px;border:1px solid #e5e5e5;font-size:13px;font-weight:500">Settings</span>
          <span style="height:28px;display:inline-flex;align-items:center;padding:0 12px;border-radius:6px;background:#2e2456;color:#fff;font-size:13px;font-weight:500">Share</span>
        </div>
        <div style="display:flex;flex:1;min-height:0">
          <div style="width:264px;flex-shrink:0;border-right:1px solid #e5e5e5;display:flex;flex-direction:column">
            <div style="height:48px;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid #e5e5e5">
              <input placeholder="Filter rails and features" style="flex:1;min-width:0;border:1px solid #e5e5e5;border-radius:6px;padding:5px 8px;font:inherit;font-size:13px;outline:none">
              <span style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;border:1px solid #e5e5e5;font-size:16px;color:#525252">+</span>
            </div>
            <sc-for list="{{ rails }}" as="r" hint-placeholder-count="8">
              <div style="height:56px;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid #f0f0f0">
                <span style="width:10px;height:10px;border-radius:3px;flex-shrink:0;background:{{ r.c }}"></span>
                <span style="flex:1;min-width:0;display:grid;gap:1px">
                  <span style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.name }}</span>
                  <span style="font-size:11px;color:#737373">{{ r.count }}</span>
                </span>
                <span style="font-size:11px;color:#a3a3a3">▸</span>
              </div>
            </sc-for>
          </div>
          <div style="flex:1;min-width:0;position:relative;overflow:hidden;background:#fff">
            <div style="height:48px;position:relative;border-bottom:1px solid #e5e5e5;background:#fff">
              <sc-for list="{{ a.sprints }}" as="s" hint-placeholder-count="3">
                <div style="position:absolute;top:0;bottom:0;left:{{ s.left }}px;width:{{ s.w }}px;border-left:1px solid #e5e5e5;padding:8px 10px;display:grid;gap:1px">
                  <span style="font-size:12px;font-weight:600">{{ s.name }}</span>
                  <span style="font-size:11px;color:#737373;font-variant-numeric:tabular-nums">{{ s.dates }}</span>
                </div>
              </sc-for>
              <div style="position:absolute;top:30px;left:{{ a.todayPill }}px;background:#ffd24a;color:#2e2456;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;letter-spacing:.02em">TODAY</div>
            </div>
            <div style="position:absolute;top:48px;left:0;right:0;bottom:0">
              <sc-for list="{{ a.sprints }}" as="s" hint-placeholder-count="3">
                <div style="position:absolute;top:0;bottom:0;left:{{ s.left }}px;width:{{ s.w }}px;border-left:1px solid #ededed;background:{{ s.bg }}"></div>
              </sc-for>
              <sc-for list="{{ rails }}" as="r" hint-placeholder-count="8">
                <div style="position:absolute;left:0;right:0;top:{{ r.topA }}px;height:56px;border-bottom:1px solid #f0f0f0"></div>
              </sc-for>
              {{ a.arcs }}
              <sc-for list="{{ a.bars }}" as="b" hint-placeholder-count="10">
                <div style="position:absolute;left:{{ b.left }}px;top:{{ b.top }}px;width:{{ b.w }}px;height:{{ b.h }}px;border-radius:{{ b.radius }};transform:{{ b.rot }};background:{{ b.bg }};border:1px solid {{ b.stroke }};overflow:hidden;display:flex;align-items:center">
                  <div style="position:absolute;left:0;top:0;bottom:0;width:{{ b.prog }}%;background:{{ b.progBg }}"></div>
                  <span style="position:relative;padding:0 8px;font-size:12px;font-weight:500;color:{{ b.ink }};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ b.label }}</span>
                </div>
              </sc-for>
              <div style="position:absolute;top:0;bottom:0;width:2px;background:#e0ac00;left:{{ a.today }}px"></div>
            </div>
          </div>
        </div>
      </div>
      <div style="display:grid;gap:4px;font-size:13px;line-height:1.5;color:#3a3650;max-width:1000px">
        <div>• Brand bar slimmed to 48px and carries the breadcrumb; title, view, groups, zoom and actions share one row.</div>
        <div>• Sidebar tree and rail-names column merged into one 264px rail list aligned to the lanes. Features are named on their bars.</div>
        <div>• Group chips filled with their hue so they double as the legend. Started work shows as a darker fill.</div>
        <div>• Sprint header shows dates; alternating sprint shading; a gold TODAY tag. Arcs drawn in neutral grey at rest.</div>
      </div>
    </div>

    <!-- 2b -->
    <div id="2b" style="display:grid;gap:14px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="background:#2e2456;color:#ffd24a;font-weight:700;font-size:13px;padding:3px 9px;border-radius:6px">2b</span>
        <span style="font-size:15px;font-weight:600">Brand frame + inspector</span>
        <span style="font-size:13px;color:#5b5675">indigo nav rail, labelled lanes, docked detail panel</span>
      </div>
      <div style="width:1440px;height:860px;overflow:hidden;background:#fff;display:flex;box-shadow:0 1px 2px rgba(0,0,0,.06),0 12px 40px rgba(46,36,86,.12);border-radius:4px">
        <aside style="width:232px;flex-shrink:0;background:#2e2456;color:#fff;display:flex;flex-direction:column">
          <div style="display:flex;align-items:center;gap:10px;padding:16px 16px 18px;border-bottom:1px solid rgba(255,255,255,.08)">
            <img src="logo.webp" alt="CC Guild logo" style="width:32px;height:32px;border-radius:8px;display:block">
            <span style="display:grid">
              <span style="font-size:15px;line-height:1.1;font-weight:700;letter-spacing:.02em">Macroplan</span>
              <span style="font-size:11px;letter-spacing:.14em;color:#ffd24a;text-transform:uppercase">CC Guild</span>
            </span>
          </div>
          <div style="padding:16px 10px 6px;display:grid;gap:2px">
            <div style="padding:0 8px 6px;font-size:11px;font-weight:600;letter-spacing:.06em;color:#9a92c4;text-transform:uppercase">Plan</div>
            <div style="padding:7px 8px;border-radius:6px;background:rgba(255,255,255,.1);font-size:13px;font-weight:600">Identity Management Plan</div>
          </div>
          <div style="padding:14px 10px;display:grid;gap:2px">
            <div style="display:flex;align-items:center;padding:0 8px 6px">
              <span style="flex:1;font-size:11px;font-weight:600;letter-spacing:.06em;color:#9a92c4;text-transform:uppercase">Rails</span>
              <span style="font-size:15px;color:#c9c3e6">+</span>
            </div>
            <sc-for list="{{ rails }}" as="r" hint-placeholder-count="8">
              <div style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px">
                <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:{{ r.c }}"></span>
                <span style="flex:1;min-width:0;font-size:13px;color:#e8e5f5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.name }}</span>
                <span style="font-size:11px;color:#8e86b5;font-variant-numeric:tabular-nums">{{ r.n }}</span>
              </div>
            </sc-for>
          </div>
          <span style="flex:1"></span>
          <div style="padding:14px 18px;border-top:1px solid rgba(255,255,255,.08);font-size:13px;color:#c9c3e6">Sign out</div>
        </aside>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column">
          <div style="padding:20px 24px 14px;display:flex;align-items:flex-end;gap:16px">
            <div style="display:grid;gap:4px">
              <div style="font-size:12px;color:#737373">Plans /</div>
              <div style="font-size:24px;font-weight:650;line-height:1.1;letter-spacing:-.01em">Identity Management Plan</div>
              <div style="display:flex;gap:8px;font-size:12px;color:#737373"><span>starts 2026-09-28</span><span>·</span><span>10-day sprints</span><span>·</span><span>UTC</span></div>
            </div>
            <span style="flex:1"></span>
            <span style="height:30px;display:inline-flex;align-items:center;padding:0 12px;border-radius:6px;border:1px solid #e5e5e5;font-size:13px;font-weight:500">Settings</span>
            <span style="height:30px;display:inline-flex;align-items:center;padding:0 14px;border-radius:6px;background:#2e2456;color:#fff;font-size:13px;font-weight:500">Share</span>
          </div>
          <div style="padding:0 24px 12px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #e5e5e5">
            <div style="display:flex;gap:18px">
              <span style="font-size:13px;font-weight:600;padding:6px 0;border-bottom:2px solid #2e2456;margin-bottom:-13px">Timeline</span>
              <span style="font-size:13px;font-weight:500;color:#737373;padding:6px 0">Table</span>
            </div>
            <span style="flex:1"></span>
            <div style="display:flex;gap:6px">
              <span style="padding:4px 10px;border-radius:6px;border:1px solid #2e2456;font-size:12px;font-weight:500">All work</span>
              <span style="display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:6px;border:1px solid #e5e5e5;font-size:12px;color:#525252"><span style="width:10px;height:10px;border-radius:3px;background:#7c3aed"></span>Phase 0 · 8</span>
              <span style="display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:6px;border:1px solid #e5e5e5;font-size:12px;color:#525252"><span style="width:10px;height:10px;border-radius:3px;background:#1f9d6b"></span>Phase 1 · 29</span>
            </div>
            <div style="display:flex;gap:2px;padding:2px;border-radius:8px;background:#f5f5f5">
              <span style="padding:3px 10px;border-radius:6px;font-size:12px;font-weight:500;color:#737373">Year</span>
              <span style="padding:3px 10px;border-radius:6px;font-size:12px;font-weight:500;color:#737373">Quarter</span>
              <span style="padding:3px 10px;border-radius:6px;background:#fff;font-size:12px;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.08)">Sprint</span>
            </div>
          </div>
          <div style="flex:1;min-height:0;display:flex">
            <div style="flex:1;min-width:0;position:relative;overflow:hidden;background:#fbfbfc">
              <div style="height:40px;position:relative;border-bottom:1px solid #e5e5e5;background:#fff">
                <sc-for list="{{ b.sprints }}" as="s" hint-placeholder-count="3">
                  <div style="position:absolute;top:0;bottom:0;left:{{ s.left }}px;width:{{ s.w }}px;border-left:1px solid #e5e5e5;padding:0 10px;display:flex;align-items:center;gap:8px">
                    <span style="font-size:12px;font-weight:600">{{ s.short }}</span>
                    <span style="font-size:11px;color:#737373;font-variant-numeric:tabular-nums">{{ s.dates }}</span>
                  </div>
                </sc-for>
              </div>
              <div style="position:absolute;top:40px;left:0;right:0;bottom:0">
                <sc-for list="{{ b.sprints }}" as="s" hint-placeholder-count="3">
                  <div style="position:absolute;top:0;bottom:0;left:{{ s.left }}px;border-left:1px dashed #e3e3e8"></div>
                </sc-for>
                <sc-for list="{{ rails }}" as="r" hint-placeholder-count="8">
                  <div style="position:absolute;left:0;right:0;top:{{ r.topB }}px;height:72px;border-bottom:1px solid #ececf0">
                    <div style="position:absolute;left:12px;top:7px;display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#3a3650">
                      <span style="width:8px;height:8px;border-radius:50%;background:{{ r.c }}"></span>{{ r.name }}<span style="font-weight:400;color:#8a8a8a">{{ r.n }}</span>
                    </div>
                  </div>
                </sc-for>
                {{ b.arcs }}
                <sc-for list="{{ b.bars }}" as="x" hint-placeholder-count="10">
                  <div style="position:absolute;left:{{ x.left }}px;top:{{ x.top }}px;width:{{ x.w }}px;height:{{ x.h }}px;border-radius:{{ x.radius }};transform:{{ x.rot }};background:{{ x.bg }};border:{{ x.border }};box-shadow:{{ x.shadow }};opacity:{{ x.op }};min-width:{{ x.minW }};z-index:{{ x.z }};overflow:hidden;display:grid;align-content:center;padding:0 9px">
                    <span style="font-size:12px;font-weight:600;color:{{ x.ink }};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ x.label }}</span>
                    <span style="font-size:11px;color:{{ x.sub }};white-space:nowrap">{{ x.est }}</span>
                  </div>
                </sc-for>
                <div style="position:absolute;top:0;bottom:0;width:2px;background:#e0ac00;left:{{ b.today }}px"></div>
                <div style="position:absolute;top:-40px;height:40px;display:flex;align-items:center;left:{{ b.todayPill }}px"><span style="background:#ffd24a;color:#2e2456;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px">OCT 1</span></div>
              </div>
            </div>
            <div style="width:300px;flex-shrink:0;border-left:1px solid #e5e5e5;background:#fff;padding:18px 20px;display:flex;flex-direction:column;gap:16px">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:11px;font-weight:600;letter-spacing:.06em;color:#737373;text-transform:uppercase;flex:1">Feature</span>
                <span style="font-size:16px;color:#a3a3a3">×</span>
              </div>
              <div style="font-size:16px;font-weight:650;line-height:1.3;text-wrap:pretty">03 Application metadata, email templates, organization removal</div>
              <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:13px">
                <span style="color:#737373">Feature</span><span>Role hygiene, EuroWIN rename, de-org and per-product branding</span>
                <span style="color:#737373">Rail</span><span style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:#3355ff"></span>gwi-auth</span>
                <span style="color:#737373">Group</span><span style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:3px;background:#7c3aed"></span>Phase 0</span>
                <span style="color:#737373">Estimate</span><span>2d</span>
                <span style="color:#737373">Sprint</span><span>S1</span>
                <span style="color:#737373">Dates</span><span style="font-variant-numeric:tabular-nums">2026-10-01 to 2026-10-02</span>
              </div>
              <div style="height:1px;background:#eee"></div>
              <div style="display:grid;gap:8px;font-size:13px">
                <span style="font-size:11px;font-weight:600;letter-spacing:.06em;color:#737373;text-transform:uppercase">Depends on</span>
                <span>01 Establish the state and conf…</span>
                <span style="font-size:11px;font-weight:600;letter-spacing:.06em;color:#737373;text-transform:uppercase;margin-top:6px">Blocks</span>
                <span>04 Custom domains, per-prod…</span>
              </div>
              <span style="flex:1"></span>
              <span style="height:32px;display:flex;align-items:center;justify-content:center;border-radius:6px;border:1px solid #e5e5e5;font-size:13px;font-weight:500">Open feature</span>
            </div>
          </div>
        </div>
      </div>
      <div style="display:grid;gap:4px;font-size:13px;line-height:1.5;color:#3a3650;max-width:1000px">
        <div>• Brand indigo becomes a left nav rail (logo, plan, rails) so the top of the page is free for the plan itself.</div>
        <div>• No names column: each lane carries its own label, giving the timeline ~200px more width.</div>
        <div>• Taller cards with name + estimate. Selecting a feature dims the rest and shows only its arcs.</div>
        <div>• The hover card becomes a docked inspector with dependencies, so details stay put while you read.</div>
      </div>
    </div>
  </div>
</section>

<section style="padding:40px 56px 72px;display:grid;gap:24px">
  <div style="font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#5b5675">Turn 1 · Current</div>
  <div id="1a" style="display:grid;gap:14px">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="background:#2e2456;color:#ffd24a;font-weight:700;font-size:13px;padding:3px 9px;border-radius:6px">1a</span>
      <span style="font-size:15px;font-weight:600">Current plan timeline (recreated from source)</span>
    </div>
    <div style="width:1440px;height:860px;overflow:hidden;background:#fff;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(0,0,0,.06),0 12px 40px rgba(46,36,86,.12);border-radius:4px">
      <header style="background:#2e2456;border-bottom:3px solid #ffd24a;color:#fff;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:12px;padding:12px 20px">
          <span style="display:flex;align-items:center;gap:10px">
            <img src="logo.webp" alt="CC Guild logo" style="width:34px;height:34px;border-radius:8px;display:block">
            <span style="display:grid">
              <span style="font-size:15px;line-height:1.1;font-weight:700;letter-spacing:.02em">Macroplan</span>
              <span style="font-size:11px;letter-spacing:.14em;color:#ffd24a;text-transform:uppercase">CC Guild</span>
            </span>
          </span>
          <span style="flex:1"></span>
          <span style="font-size:13px">Sign out</span>
        </div>
      </header>
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;background:#fdfdfd">
        <div style="flex-shrink:0;border-bottom:1px solid #e5e5e5;background:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px">
          <div style="min-width:0">
            <div style="display:flex;gap:6px;font-size:12px;color:#737373"><span>Plans</span><span>/</span></div>
            <div style="font-size:18px;line-height:1.25;font-weight:600">Identity Management Plan</div>
            <div style="margin-top:2px;display:flex;gap:8px;font-size:12px;color:#737373"><span>starts 2026-09-28</span><span>·</span><span>10-day sprints</span><span>·</span><span>UTC</span></div>
          </div>
          <span style="flex:1"></span>
          <div style="display:flex;gap:6px">
            <span style="height:28px;display:inline-flex;align-items:center;padding:0 10px;border-radius:6px;border:1px solid #e5e5e5;background:#fff;font-size:13px;font-weight:500">Settings</span>
            <span style="height:28px;display:inline-flex;align-items:center;padding:0 10px;border-radius:6px;background:#2e2456;color:#fff;font-size:13px;font-weight:500">Share</span>
          </div>
        </div>
        <div style="flex-shrink:0;border-bottom:1px solid #e5e5e5;background:#fff;padding:8px 16px;display:flex;align-items:center;gap:16px">
          <div style="display:flex;gap:2px;padding:2px;border-radius:8px;background:#f5f5f5">
            <span style="padding:4px 10px;border-radius:6px;background:#fff;font-size:13px;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.08)">Timeline</span>
            <span style="padding:4px 10px;border-radius:6px;font-size:13px;font-weight:500;color:#737373">Table</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <span style="padding:2px 8px;border-radius:999px;border:1px solid #0a0a0a;font-size:12px;font-weight:500">All work</span>
            <span style="padding:2px 8px;border-radius:999px;border:1px solid #e5e5e5;font-size:12px;color:#737373;display:flex;align-items:center"><span style="width:8px;height:8px;border-radius:50%;background:#7c3aed;margin-right:6px"></span>Phase 0 · 8 features</span>
            <span style="padding:2px 8px;border-radius:999px;border:1px solid #e5e5e5;font-size:12px;color:#737373;display:flex;align-items:center"><span style="width:8px;height:8px;border-radius:50%;background:#1f9d6b;margin-right:6px"></span>Phase 1 · 29 features</span>
            <span style="padding:2px 8px;border-radius:999px;border:1px dashed #e5e5e5;font-size:12px;color:#737373">New group</span>
          </div>
          <span style="flex:1"></span>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;color:#737373">Zoom</span>
            <div style="display:flex;gap:2px;padding:2px;border-radius:8px;background:#f5f5f5">
              <span style="padding:4px 10px;border-radius:6px;font-size:13px;font-weight:500;color:#737373">Year</span>
              <span style="padding:4px 10px;border-radius:6px;font-size:13px;font-weight:500;color:#737373">Quarter</span>
              <span style="padding:4px 10px;border-radius:6px;background:#fff;font-size:13px;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.08)">Sprint</span>
            </div>
          </div>
        </div>
        <div style="flex:1;min-height:0;display:flex">
          <aside style="width:280px;flex-shrink:0;border-right:1px solid #e5e5e5;background:#fff;overflow:hidden">
            <div style="display:grid;gap:8px;border-bottom:1px solid #e5e5e5;padding:10px 12px">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="flex:1;font-size:11px;font-weight:600;letter-spacing:.025em;color:#737373;text-transform:uppercase">Rails</span>
                <span style="height:28px;display:inline-flex;align-items:center;padding:0 10px;border-radius:6px;border:1px solid #e5e5e5;font-size:13px;font-weight:500">Add rail</span>
              </div>
              <input placeholder="Filter…" style="width:100%;border:1px solid #e5e5e5;border-radius:6px;padding:4px 8px;font:inherit;font-size:13px;outline:none">
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1fr);gap:2px;padding:4px 8px 12px">
              <sc-for list="{{ tree }}" as="t" hint-placeholder-count="20">
                <div style="display:flex;min-width:0;max-width:100%;overflow:hidden;align-items:center;gap:8px;border-radius:6px;padding:6px 6px 6px {{ t.pl }}px;background:{{ t.bg }}">
                  <span style="width:20px;height:20px;flex-shrink:0;display:{{ t.caretDisp }};align-items:center;justify-content:center;font-size:9px;color:#737373">▾</span>
                  <span style="width:20px;height:20px;flex-shrink:0;display:flex;align-items:center;justify-content:center"><span style="width:10px;height:10px;border-radius:3px;background:{{ t.c }};display:{{ t.swDisp }}"></span></span>
                  <span style="flex:1;min-width:0;font-size:13px;font-weight:{{ t.fw }};color:{{ t.ink }};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ t.name }}</span>
                </div>
              </sc-for>
            </div>
          </aside>
          <div style="flex:1;min-width:0;display:flex;overflow:hidden">
            <div style="width:208px;flex-shrink:0;border-right:1px solid #e5e5e5;background:#fff;display:flex;flex-direction:column">
              <div style="height:44px;border-bottom:1px solid #e5e5e5"></div>
              <sc-for list="{{ rails }}" as="r" hint-placeholder-count="8">
                <div style="height:44px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #eeeeee;padding:0 12px;font-size:13px">
                  <span style="width:10px;height:10px;border-radius:3px;flex-shrink:0;background:{{ r.c }}"></span>
                  <span style="flex:1;min-width:0;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ r.name }}</span>
                  <span style="flex-shrink:0;font-size:11px;color:#737373;font-variant-numeric:tabular-nums">{{ r.count }}</span>
                </div>
              </sc-for>
            </div>
            <div style="flex:1;min-width:0;position:relative;overflow:hidden">
              <div style="background:#fff">
                <div style="position:relative;height:22px;overflow:hidden;border-bottom:1px solid #eeeeee">
                  <span style="position:absolute;top:0;height:100%;left:0;width:126px;display:flex;align-items:center;padding:0 8px;font-size:11px;font-weight:600;border-left:1px solid #eeeeee">Q3 2026</span>
                  <span style="position:absolute;top:0;height:100%;left:126px;width:2000px;display:flex;align-items:center;padding:0 8px;font-size:11px;font-weight:600;border-left:1px solid #eeeeee">Q4 2026</span>
                </div>
                <div style="position:relative;height:22px;overflow:hidden;border-bottom:1px solid #e5e5e5">
                  <sc-for list="{{ c.sprints }}" as="s" hint-placeholder-count="3">
                    <span style="position:absolute;top:0;height:100%;left:{{ s.left }}px;width:{{ s.w }}px;display:flex;align-items:center;padding:0 8px;font-size:11px;color:#737373;border-left:1px solid #f2f2f2;font-variant-numeric:tabular-nums">{{ s.week }}</span>
                  </sc-for>
                </div>
              </div>
              <div style="position:absolute;top:44px;left:0;right:0;bottom:0;background:#f7f7f7">
                <sc-for list="{{ c.sprints }}" as="s" hint-placeholder-count="3">
                  <div style="position:absolute;top:0;bottom:0;left:{{ s.left }}px;border-left:1px solid #e8e8e8"></div>
                </sc-for>
                <sc-for list="{{ rails }}" as="r" hint-placeholder-count="8">
                  <div style="position:absolute;left:0;right:0;top:{{ r.topC }}px;height:44px;border-bottom:1px solid #ececec;background:#fafafa"></div>
                </sc-for>
                {{ c.arcs }}
                <sc-for list="{{ c.bars }}" as="x" hint-placeholder-count="10">
                  <div style="position:absolute;left:{{ x.left }}px;top:{{ x.top }}px;width:{{ x.w }}px;height:{{ x.h }}px;border-radius:{{ x.radius }};transform:{{ x.rot }};background:{{ x.bg }};border:{{ x.border }}"></div>
                </sc-for>
                <sc-for list="{{ c.ticks }}" as="k" hint-placeholder-count="6">
                  <div style="position:absolute;left:{{ k.left }}px;top:{{ k.top }}px;width:{{ k.w }}px;height:3px;border-radius:2px;background:{{ k.bg }}"></div>
                </sc-for>
                <div style="position:absolute;top:0;bottom:0;width:2px;background:#e0ac00;left:{{ c.today }}px"></div>
                <div style="position:absolute;left:150px;top:52px;max-width:320px;border:1px solid #e5e5e5;border-radius:6px;background:#fff;padding:8px 12px;font-size:12px;box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)">
                  <p style="margin:0 0 4px;font-size:13px;font-weight:600">03 Application metadata, email templates, organization removal</p>
                  <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px">
                    <span style="color:#737373">Feature</span><span>Role hygiene, EuroWIN rename, de-org and per-product branding</span>
                    <span style="color:#737373">Rail</span><span>gwi-auth</span>
                    <span style="color:#737373">Group</span><span>Phase 0</span>
                    <span style="color:#737373">Estimate</span><span>2d</span>
                    <span style="color:#737373">Sprint</span><span>S1</span>
                    <span style="color:#737373">Dates</span><span>2026-10-01 to 2026-10-02</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
</x-dc>
<script type="text/x-dc" data-dc-script>
const RAILS = [
  ['gwi-auth', '#3355ff', 5], ['eu_win', '#e0336e', 1], ['gwi-platform', '#7c3aed', 4], ['WaterData2.0', '#0e9fb0', 2],
  ['gwi-iac', '#e47a12', 3], ['gwi-cloud', '#13a067', 19], ['beti_shared', '#2f4cdd', 2], ['gwi-cloud-app-d…', '#13a067', 1],
];
const G = [
  { c: '#7c3aed', ink: '#4c1d95', sub: '#7c6aa8', tint: '#f1edfd', mid: '#ddd2fb' },
  { c: '#1f9d6b', ink: '#0f5a3d', sub: '#4f8a72', tint: '#e8f5ef', mid: '#c4e7d6' },
];
// [rail, startDay, durDays, group, name, estimate, progress 0..1]
const F = [
  [0, 0, 8, 0, 'Role hygiene, EuroWIN rename, de-org and per-product branding', '8d', 0.55],
  [0, 8, 1.5, 0, '02 EuroWIN rename and permissions', '1.5d', 0],
  [0, 10, 1, 0, '01 Establish the state and config', '1d', 0],
  [0, 11, 1, 0, '03 Application metadata, email templates', '2d', 0],
  [0, 12, 3, 0, '04 Custom domains, per-product', '3d', 0],
  [1, 9.6, 0.8, 0, '02 EuroWIN authorizes on per-product', '1d', 0],
  [2, 12, 1, 0, '03 Branding from the client', '1d', 0],
  [3, 15, 0, 0, '04 Both permission sets in one token', 'milestone', 0],
  [4, 11, 7.5, 1, '1.a The service exists and listens', '7.5d', 0],
  [4, 18.5, 3, 1, '1.a.1 AWS account vending', '3d', 0],
  [4, 21.5, 2.5, 1, '1.a.3 Network, compute, DNS', '2.5d', 0],
  [5, 18.5, 12.5, 1, '1.b Cluster baseline', '12.5d', 0],
  [5, 31, 5, 1, '1.c Observability', '5d', 0],
  [6, 26, 4, 1, 'Shared token library', '4d', 0],
  [7, 30, 3, 1, 'App deployment pipeline', '3d', 0],
];
const DEPS = [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [2, 6], [4, 7], [7, 9], [8, 9], [9, 10], [9, 11], [4, 13], [6, 14], [10, 12]];
const SPRINTS = [
  ['Sprint 1', 'S1', 'Sep 28 – Oct 9', 'W40–41'], ['Sprint 2', 'S2', 'Oct 12 – 23', 'W42–43'],
  ['Sprint 3', 'S3', 'Oct 26 – Nov 6', 'W44–45'], ['Sprint 4', 'S4', 'Nov 9 – 20', 'W46–47'],
];
const TODAY = 3;

function geo(o) {
  const bars = F.map((f, i) => {
    const [r, s, d, g] = f, ms = d === 0;
    const top = r * o.rowH + o.barTop, x = s * o.ppd;
    if (ms) {
      const z = o.ms;
      return { i, r, g, ms, left: x - z / 2, top: top + (o.barH - z) / 2, w: z, h: z, cy: top + o.barH / 2, x1: x, x2: x };
    }
    return { i, r, g, ms, left: x + 2, top, w: Math.max(d * o.ppd - 4, 4), h: o.barH, cy: top + o.barH / 2, x1: x + 2, x2: x + d * o.ppd - 2 };
  });
  const sprints = SPRINTS.map((s, i) => ({ name: s[0], short: s[1], dates: s[2], week: s[3], left: i * 10 * o.ppd, w: 10 * o.ppd, bg: i % 2 ? '#fafafa' : '#ffffff' }));
  return { bars, sprints, today: TODAY * o.ppd - 1, todayPill: TODAY * o.ppd + 4 };
}

function arcPath(a, b) {
  const x1 = a.x2, y1 = a.cy, x2 = b.x1, y2 = b.cy, k = Math.max(24, Math.abs(x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`;
}

function arcsSvg(bars, style) {
  const paths = DEPS.map(([a, b], n) => {
    const st = style(a, b);
    if (!st) return null;
    return React.createElement('path', { key: n, d: arcPath(bars[a], bars[b]), fill: 'none', stroke: st.c, strokeWidth: st.w, strokeOpacity: st.o, strokeDasharray: st.dash });
  });
  return React.createElement('svg', { style: { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' } }, paths);
}

function dayDate(d) {
  const w = Math.floor(d / 5), r = Math.floor(d) % 5;
  const t = new Date(Date.UTC(2026, 8, 28 + w * 7 + r));
  return t.toISOString().slice(0, 10);
}
function reach(from) {
  const seen = new Set(), st = [from];
  while (st.length) { const n = st.pop(); DEPS.forEach(([a, b]) => { if (a === n && !seen.has(b)) { seen.add(b); st.push(b); } }); }
  return seen;
}

const FEATS = [
  [0, 0, 'Role hygiene, EuroWIN rename, de-org and per-product branding', 0, [['01 Establish the state and config', 2], ['02 EuroWIN rename and permissions', 2], ['03 Application metadata, email templates, organization removal', 2], ['04 Custom domains, per-product branding', 2]]],
  [1, 0, '02 EuroWIN authorizes on per-product', 8, [['Per-product role map', 1], ['Authorize check in gateway', 1.5]]],
  [2, 0, '03 Branding from the client', 4, [['Theme tokens per product', 1], ['Logo and email assets', 1]]],
  [2, 0, '1.c.4 Retire the cron job', 6, [['Replace with event hook', 1.5], ['Remove schedule', 0.5]]],
  [2, 0, '1.d.1 dated_roles regression', 8.5, [['Reproduce', 0.5], ['Fix and test', 1.5]]],
  [2, 0, '1.d.3 Remove the API-side default', 11, [['Remove default', 1], ['Migrate callers', 2]]],
  [3, 0, '04 Both permission sets in one token', 10, [['Token schema', 1.5], ['Issue combined token', 2]]],
  [3, 0, '1.d.1 dated_roles regression', 13.5, [['Patch', 1]]],
  [4, 1, '1.a The service exists and listens', 3, [['Repo and pipeline', 1.5], ['Health endpoint', 1], ['Deploy to dev', 2]]],
  [4, 1, '1.a.1 AWS account vending', 7.5, [['Account factory', 2], ['Guardrails', 1.5]]],
  [4, 1, '1.a.3 Network, compute, DNS', 11, [['VPC', 1.5], ['Cluster', 2], ['DNS zone', 1]]],
  [5, 1, '1.b It can do the work, in shadow', 15.5, [['Shadow traffic', 3], ['Compare outputs', 2], ['Fix diffs', 3]]],
  [5, 1, '1.c Cutover', 23.5, [['Switch traffic', 1], ['Watch', 2]]],
  [5, 1, '1.d Decouple and email', 26.5, [['Email service', 2], ['Remove coupling', 2]]],
  [6, 1, 'Shared token library', 14, [['Extract', 2], ['Publish', 1]]],
  [7, 1, 'App design pass', 16, [['Wireframes', 2], ['Review', 1]]],
];
const DEPS4 = [[0, 1], [1, 6], [8, 9], [9, 10], [10, 11], [6, 11], [11, 12], [12, 13], [5, 14], [10, 15]];
const RAIL4 = RAILS.map((r, i) => (i === 7 ? ['gwi-cloud-app-design', r[1]] : [r[0], r[1]]));
const ZOOMS = [['year', 'Year', 4], ['quarter', 'Quarter', 12], ['sprint', 'Sprint', 40]];
const fmtD = (n) => `${n}d`;
const shortDate = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };
const clampHalf = (v) => Math.max(0, Math.round(v * 2) / 2);

class Component extends DCLogic {
  state = {
    hover: null, tabs: [0, 3], active: 0, edits: {}, pins: {}, groups: {}, waits: {},
    kZoom: 'sprint', kPanelH: 360, kTabs: ['f0', 'i:0-2'], kActive: 'f0', kHover: null, kPop: null, kQ: '',
    kNames: {}, kFEst: {}, kPin: {}, kGrp: {}, kRail: {}, kNew: '',
    kExtra: [], kRails: RAIL4.map((r) => [...r]), kOrder: RAIL4.map((_, i) => i), kGhost: null, kEditRail: null, kDragKind: null, kDraw: null,
    kDeps: DEPS4.map((d) => [...d]),
    kItems: FEATS.map((f, fi) => f[4].map((it, ii) => ({ id: `${fi}-${ii}`, name: it[0], est: it[1] }))),
  };

  componentWillUnmount() { this._up && this._up(); }

  commitDraw() {
    const p = this._drawPlan; this._drawPlan = null;
    if (!p || !this.state.kDraw) { this.setState({ kDraw: null }); return; }
    const s = this.state, nF = FEATS.length + s.kExtra.length, id = p.fi + '-d' + Date.now();
    const grp = p.fi in s.kGrp ? s.kGrp[p.fi] : (p.fi < FEATS.length ? FEATS[p.fi][1] : s.kExtra[p.fi - FEATS.length][1]);
    if (p.mode === 'item') {
      this.setState((st) => ({ kDraw: null, kItems: st.kItems.map((l, x) => { if (x !== p.fi) return l; const c = [...l]; c.splice(p.side === 'end' ? p.ii + 1 : p.ii, 0, { id, name: 'New item', est: p.len }); return c; }),
        kTabs: [...st.kTabs, 'i:' + id], kActive: 'i:' + id }));
    } else {
      const dep = p.side === 'end' ? [p.fi, nF] : [nF, p.fi];
      this.setState((st) => ({ kDraw: null, kExtra: [...st.kExtra, [p.tr, grp, 'New feature', p.sd, []]], kItems: [...st.kItems, [{ id: nF + '-0', name: 'New item', est: p.len }]],
        kDeps: [...st.kDeps, dep], kTabs: [...st.kTabs, 'f' + nF], kActive: 'f' + nF }));
    }
  }

  boardE() {
    const s = this.state, set = (o) => this.setState(o);
    const F4 = [...FEATS, ...s.kExtra], RL = s.kRails;
    const zi = ZOOMS.find((z) => z[0] === s.kZoom), ppd = zi[2], items = s.kZoom === 'sprint';
    const laneH = items ? 52 : 48, tw = Math.max(46 * ppd, 1176);
    const railOf = (fi) => s.kRail[fi] ?? F4[fi][0];
    const grpOf = (fi) => (fi in s.kGrp ? s.kGrp[fi] : F4[fi][1]);
    const fname = (fi) => s.kNames['f' + fi] ?? F4[fi][2];
    const durOf = (fi) => Math.max(s.kItems[fi].reduce((a, b) => a + b.est, 0), 0.5);
    const _st = []; (() => { const by = {}; F4.forEach((f, fi) => { (by[railOf(fi)] = by[railOf(fi)] || []).push(fi); }); Object.values(by).forEach((l) => { l.sort((x, y) => F4[x][3] - F4[y][3]); let end = 0; l.forEach((fi) => { const s0 = Math.max(F4[fi][3], end); _st[fi] = s0; end = s0 + durOf(fi); }); }); })();
    const stF = (fi) => _st[fi];
    const findItem = (id) => { for (let fi = 0; fi < s.kItems.length; fi++) { const ii = s.kItems[fi].findIndex((x) => x.id === id); if (ii >= 0) return [fi, ii]; } return null; };
    const open = (key) => this.setState((st) => ({ kTabs: st.kTabs.includes(key) ? st.kTabs : [...st.kTabs, key], kActive: key, kHover: null, kPop: null, kQ: '' }));
    const range = (st, d) => (d <= 0 ? dayDate(st) : `${dayDate(st)} → ${dayDate(st + Math.max(Math.ceil(d), 1) - 1)}`);
    const sprintOf = (d) => Math.floor(d / 10) + 1;
    const hov = s.kHover;
    const near = new Set();
    if (hov) {
      near.add(hov);
      if (hov[0] === 'f') { const fi = +hov.slice(1); s.kDeps.forEach(([a, b]) => { if (a === fi) near.add('f' + b); if (b === fi) near.add('f' + a); }); }
      else { const p = findItem(hov.slice(2)); if (p) near.add('f' + p[0]); }
    }
    const dim = (key, fi) => (!hov || near.has(key) || (hov[0] === 'f' && near.has('f' + fi) && key[0] === 'i') ? 1 : 0.35);

    const HW = 22;
    const geoF = F4.map((f, fi) => {
      const r = railOf(fi), idx = s.kOrder.indexOf(r), lt = idx * laneH, x = stF(fi) * ppd, w = durOf(fi) * ppd;
      return items ? { fi, x, w, lt, idx, top: lt + 1, h: 18, cy: lt + 10, r } : { fi, x, w, lt, idx, top: lt + 10, h: 28, cy: lt + 24, r };
    });
    const drawing = !!s.kDraw;
    const grab = (src, side) => (e) => {
      e.stopPropagation(); e.preventDefault();
      const g0 = geoF[src.fi];
      let od;
      if (src.kind === 'item') { const l = s.kItems[src.fi]; const st0 = stF(src.fi) + l.slice(0, src.ii).reduce((x, y) => x + y.est, 0); od = side === 'end' ? st0 + l[src.ii].est : st0; }
      else od = side === 'end' ? stF(src.fi) + durOf(src.fi) : stF(src.fi);
      const init = { ...src, side, od, oi: g0.idx, cd: od + (side === 'end' ? 1 : -1), ci: g0.idx };
      this.setState({ kDraw: init, kHover: null });
      const mv = (ev) => { const p = pt(ev); if (!p) return; const cd = Math.round((p.x / ppd) * 2) / 2, ci = Math.max(0, Math.min(s.kOrder.length - 1, Math.floor(p.y / laneH))); this.setState((st) => (st.kDraw ? { kDraw: { ...st.kDraw, cd, ci } } : null)); };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); this._up = null; this.commitDraw(); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); this._up = up;
    };
    const showH = (key) => (!drawing && hov === key ? 'flex' : 'none');
    const feats = items ? [] : geoF.map((g) => {
      const fi = g.fi, col = G[grpOf(fi)] || { c: '#a3a3a3', ink: '#404040' }, key = 'f' + fi, lit = hov === key || s.kActive === key;
      return {
        wl: g.x - HW, ww: g.w + HW * 2, top: g.top, w: Math.max(g.w - 4, 6), h: g.h, bg: col.c + '2e', border: `${lit ? 2 : 1}px solid ${col.c}`,
        ink: col.ink, c: col.c, cL: 17, label: fname(fi), op: dim(key, fi), hdisp: showH(key),
        enter: () => !drawing && set({ kHover: key }), leave: () => !drawing && set({ kHover: null }), click: () => open(key),
        grabStart: grab({ kind: 'feature', fi }, 'start'), grabEnd: grab({ kind: 'feature', fi }, 'end'),
      };
    });
    const lines = !items ? [] : geoF.map((g) => {
      const fi = g.fi, col = G[grpOf(fi)] || { c: '#a3a3a3', ink: '#404040' }, key = 'f' + fi, lit = hov === key || s.kActive === key;
      return {
        wl: g.x - HW, ww: g.w + HW * 2, top: g.top, w: g.w, th: lit ? 3 : 2, ltop: lit ? 7.5 : 8, c: col.c, ink: col.ink, label: fname(fi),
        lw: Math.max(g.w - 24, 0), endL: HW + g.w - 5, dz: lit ? 10 : 8, dzo: lit ? -5 : -4, dtop: lit ? 4 : 5,
        op: dim(key, fi), hdisp: showH(key),
        enter: () => !drawing && set({ kHover: key }), leave: () => !drawing && set({ kHover: null }), click: () => open(key),
        grabStart: grab({ kind: 'feature', fi }, 'start'), grabEnd: grab({ kind: 'feature', fi }, 'end'),
      };
    });
    const itemBars = [];
    geoF.forEach((g) => {
      if (!items) return;
      let cur = stF(g.fi);
      const col = G[grpOf(g.fi)] || { c: '#a3a3a3', ink: '#404040' };
      s.kItems[g.fi].forEach((it, ii) => {
        const key = 'i:' + it.id, lit = hov === key || s.kActive === key, x = cur * ppd, w = Math.max(it.est * ppd - 4, 6);
        itemBars.push({
          wl: x + 2 - HW, ww: w + HW * 2, top: g.lt + 20, w, h: 24,
          bg: col.c + '2e', border: `${lit ? 2.5 : 1.25}px solid ${col.c}`, ink: col.ink, c: col.c, cL: 15, label: it.name, op: dim(key, g.fi), hdisp: showH(key),
          enter: () => !drawing && set({ kHover: key }), leave: () => !drawing && set({ kHover: null }), click: () => open(key),
          grabStart: grab({ kind: 'item', fi: g.fi, ii }, 'start'), grabEnd: grab({ kind: 'item', fi: g.fi, ii }, 'end'),
        });
        cur += it.est;
      });
    });
    const dr = s.kDraw;
    let draw = { show: false };
    const extraPaths = [];
    if (dr) {
      const sd = dr.side === 'end' ? dr.od : Math.min(dr.cd, dr.od - 0.5), ed = dr.side === 'end' ? Math.max(dr.cd, dr.od + 0.5) : dr.od, len = ed - sd;
      const same = dr.ci === dr.oi, tr = s.kOrder[dr.ci], lt = dr.ci * laneH;
      const mode = same && dr.kind === 'item' ? 'item' : 'feature';
      const top = items ? lt + 20 : lt + 10, hh = items ? 24 : 28;
      const sp1 = sprintOf(sd), sp2 = sprintOf(Math.max(ed - 0.5, sd));
      const rel = dr.side === 'end' ? 'after' : 'before';
      const what = mode === 'item' ? `New item ${rel} “${s.kItems[dr.fi][dr.ii].name}”` : same ? `New feature ${rel} “${fname(dr.fi)}”` : `New feature on ${RL[tr][0]} · ${dr.side === 'end' ? 'waits for' : 'unblocks'} “${fname(dr.fi)}”`;
      draw = { show: true, left: sd * ppd + 2, top, w: Math.max(len * ppd - 4, 6), h: hh, label: what, meta: `${fmtD(len)} · ${sp1 === sp2 ? 'S' + sp1 : 'S' + sp1 + '–S' + sp2}`,
        chipLeft: sd * ppd + 2, chipTop: Math.max(0, top - 24), guideL: (dr.side === 'end' ? ed : sd) * ppd, c: (G[grpOf(dr.fi)] || { c: '#2e2456' }).c };
      if (!same) {
        const ox = dr.od * ppd, oy = geoF[dr.fi].cy + (dr.kind === 'item' && items ? 22 : 0), tx = (dr.side === 'end' ? sd : ed) * ppd, ty = top + hh / 2, k = Math.max(20, Math.abs(tx - ox) / 2);
        extraPaths.push(React.createElement('path', { key: 'draw', d: dr.side === 'end' ? `M${ox},${oy} C${ox + k},${oy} ${tx - k},${ty} ${tx},${ty}` : `M${tx},${ty} C${tx + k},${ty} ${ox - k},${oy} ${ox},${oy}`, fill: 'none', stroke: '#2e2456', strokeWidth: 1.5, strokeDasharray: '4 3' }));
      }
      this._drawPlan = { mode, same, tr, sd, ed, len, side: dr.side, fi: dr.fi, ii: dr.ii, kind: dr.kind };
    }
    const arcs = React.createElement('svg', { style: { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' } },
      s.kDeps.map(([a, b], n) => {
        const A = geoF[a], B = geoF[b], x1 = A.x + A.w, x2 = B.x, k = Math.max(24, Math.abs(x2 - x1) / 2);
        const on = !hov || hov === 'f' + a || hov === 'f' + b;
        return React.createElement('path', { key: n, d: `M${x1},${A.cy} C${x1 + k},${A.cy} ${x2 - k},${B.cy} ${x2},${B.cy}`, fill: 'none', stroke: RL[railOf(a)][1], strokeWidth: hov && on ? 2 : 1.25, strokeOpacity: on ? 0.85 : 0.12 });
      }).concat(extraPaths));

    const nS = Math.ceil(tw / (10 * ppd));
    const sprints = Array.from({ length: nS }, (_, i) => {
      const a = dayDate(i * 10), b = dayDate(i * 10 + 9);
      const name = ppd >= 40 ? `Sprint ${i + 1}` : `S${i + 1}`;
      const sub = ppd >= 40 ? `W${40 + 2 * i}–${41 + 2 * i} · ${shortDate(a)} – ${shortDate(b)}` : ppd >= 12 ? shortDate(a) : '';
      return { name, sub, left: i * 10 * ppd, w: 10 * ppd, bg: i % 2 ? '#fafafa' : '#ffffff' };
    });
    const lanes = s.kOrder.map((r, idx) => {
      const [name, c] = RL[r], n = F4.filter((_, fi) => railOf(fi) === r).length, editing = s.kEditRail === r;
      return { name, c, count: n === 1 ? '1 feature' : `${n} features`, h: laneH, top: idx * laneH, editing, notEditing: !editing,
        rename: () => set({ kEditRail: r }),
        onRename: (e) => { const v = e.target.value; this.setState((st) => ({ kRails: st.kRails.map((x, i) => (i === r ? [v, x[1]] : x)) })); },
        doneRename: (e) => { if (!e.key || e.key === 'Enter' || e.key === 'Escape') set({ kEditRail: null }); },
        dragStart: (e) => { this._drag = { kind: 'rail', id: r }; e.dataTransfer.setData('text/plain', 'rail'); e.dataTransfer.effectAllowed = 'move'; set({ kDragKind: 'rail' }); },
        dragEnd: () => { this._drag = null; this._gk = null; set({ kGhost: null, kDragKind: null }); } };
    });

    if (!this.canvasRef) this.canvasRef = React.createRef();
    const pt = (e) => { const el = this.canvasRef.current; if (!el) return null; const bb = el.getBoundingClientRect(), sc = bb.width / tw || 1; return { x: (e.clientX - bb.left) / sc, y: (e.clientY - bb.top) / sc }; };
    const planDrop = (kind, p) => {
      const n = s.kOrder.length, idx = Math.max(0, Math.min(n - 1, Math.floor(p.y / laneH)));
      if (kind === 'epic' || kind === 'rail') {
        const ins = Math.max(0, Math.min(n, Math.round(p.y / laneH)));
        return { kind, ins, ok: true, line: true, top: ins * laneH - 1, label: kind === 'epic' ? 'New epic goes here' : `Move ${RL[this._drag.id][0]} here`, labelLeft: 8, labelTop: Math.max(0, ins * laneH - 22) };
      }
      const r = s.kOrder[idx], day = Math.max(0, p.x / ppd), laneTop = idx * laneH;
      if (kind === 'feature') {
        let after = null, best = 99;
        F4.forEach((f, fi) => { if (railOf(fi) !== r) return; const dd = Math.abs(stF(fi) + durOf(fi) - day); if (dd <= 1.5 && dd < best) { best = dd; after = fi; } });
        const start = after != null ? stF(after) + durOf(after) : Math.round(day * 2) / 2;
        const top = laneTop + (items ? 8 : 10), h = items ? 48 : 28;
        return { kind, ok: true, r, start, after, left: start * ppd + 2, top, w: Math.max(2 * ppd - 4, 10), h,
          label: after != null ? `After “${fname(after)}”` : `${RL[r][0]} · ${shortDate(dayDate(start))}`, labelLeft: start * ppd + 2, labelTop: Math.max(0, top - 22) };
      }
      let target = null;
      F4.forEach((f, fi) => { if (railOf(fi) === r && day >= stF(fi) - 0.25 && day <= stF(fi) + durOf(fi) + 0.5) target = fi; });
      if (target == null) return { kind, ok: false, left: day * ppd - 1, top: laneTop + 6, w: 3, h: laneH - 12, label: 'Drop inside a feature', labelLeft: day * ppd + 6, labelTop: laneTop + 4 };
      let cur = stF(target), pos = s.kItems[target].length;
      s.kItems[target].some((it, ii) => { if (day < cur + it.est / 2) { pos = ii; return true; } cur += it.est; return false; });
      const insX = (stF(target) + s.kItems[target].slice(0, pos).reduce((a2, b2) => a2 + b2.est, 0)) * ppd;
      return { kind, ok: true, fi: target, pos, left: insX - 1, top: laneTop + 4, w: 3, h: laneH - 8, label: `Into “${fname(target)}” · position ${pos + 1}`, labelLeft: insX + 6, labelTop: laneTop + 4 };
    };
    const dragPill = (kind) => ({
      start: (e) => { this._drag = { kind }; e.dataTransfer.setData('text/plain', kind); e.dataTransfer.effectAllowed = 'copy'; set({ kDragKind: kind }); },
      end: () => { this._drag = null; this._gk = null; set({ kGhost: null, kDragKind: null }); },
    });
    const PAL = ['#c2410c', '#0891b2', '#be185d', '#4d7c0f', '#6d28d9', '#b45309'];
    const onDragOver = (e) => {
      if (!this._drag) return; e.preventDefault();
      const p = pt(e); if (!p) return;
      const g = planDrop(this._drag.kind, p), key = JSON.stringify(g);
      if (key !== this._gk) { this._gk = key; set({ kGhost: g }); }
    };
    const onDrop = (e) => {
      const d = this._drag; if (!d) return; e.preventDefault();
      const p = pt(e); const g = p && planDrop(d.kind, p);
      this._drag = null; this._gk = null;
      if (!g || !g.ok) { set({ kGhost: null, kDragKind: null }); return; }
      if (d.kind === 'epic') {
        const id = RL.length;
        this.setState((st) => { const o = [...st.kOrder]; o.splice(g.ins, 0, id); return { kRails: [...st.kRails, ['New epic', PAL[id % PAL.length]]], kOrder: o, kEditRail: id, kGhost: null, kDragKind: null }; });
      } else if (d.kind === 'rail') {
        this.setState((st) => { const o = st.kOrder.filter((x) => x !== d.id); let ins = g.ins; if (st.kOrder.indexOf(d.id) < ins) ins -= 1; o.splice(ins, 0, d.id); return { kOrder: o, kGhost: null, kDragKind: null }; });
      } else if (d.kind === 'feature') {
        const nfi = F4.length, onRail = F4.map((_, i) => i).filter((i) => railOf(i) === g.r);
        const grp = g.after != null ? grpOf(g.after) : onRail.length ? grpOf(onRail[onRail.length - 1]) : 0;
        this.setState((st) => ({
          kExtra: [...st.kExtra, [g.r, grp, 'New feature', g.start, []]],
          kItems: [...st.kItems, [{ id: `${nfi}-0`, name: 'New item', est: 2 }]],
          kDeps: g.after != null ? [...st.kDeps, [g.after, nfi]] : st.kDeps,
          kGhost: null, kDragKind: null,
        }));
        open('f' + nfi);
      } else if (d.kind === 'item') {
        const id = `${g.fi}-n${Date.now()}`;
        this.setState((st) => ({ kItems: st.kItems.map((l, x) => { if (x !== g.fi) return l; const c2 = [...l]; c2.splice(g.pos, 0, { id, name: 'New item', est: 1 }); return c2; }), kGhost: null, kDragKind: null }));
        open('i:' + id);
      }
    };
    const gh = s.kGhost;
    const ghost = gh ? { ...gh, box: !gh.line, line: !!gh.line, bd: gh.ok ? '#2e2456' : '#dc2626', bg: gh.ok ? (gh.kind === 'feature' ? '#efecfacc' : '#2e2456') : '#dc2626', chipBg: gh.ok ? '#2e2456' : '#dc2626', bdStyle: gh.kind === 'feature' ? 'dashed' : 'solid' } : { box: false, line: false };
    const HINTS = {
      epic: 'Drop between rails to insert a new epic.',
      rail: 'Drop between rails to reorder.',
      feature: 'Drop on a rail. Near the end of a feature it goes after it and takes its group.',
      item: 'Drop inside a feature. It lands between the items under the pointer.',
    };
    const dragHint = s.kDragKind ? HINTS[s.kDragKind] : 'Drag a pill onto the board to add it. Drag a rail name to reorder rails. Double-click a rail name to rename it.';
    const pills = { epic: dragPill('epic'), feature: dragPill('feature'), item: dragPill('item') };

    let pop = { show: false };
    if (hov) {
      if (hov[0] === 'f') {
        const fi = +hov.slice(1), g = geoF[fi], ups = s.kDeps.filter(([, q]) => q === fi).length;
        pop = { show: true, left: Math.min(Math.max(g.x, 8), tw - 310), top: g.top + g.h + 8, railC: RL[railOf(fi)][1],
          context: `${['Phase 0', 'Phase 1'][grpOf(fi)] ?? 'No group'} · ${RL[railOf(fi)][0]}`, title: fname(fi),
          est: fmtD(durOf(fi)), sprint: 'S' + sprintOf(stF(fi)), thirdLabel: 'Waits for', third: ups ? `${ups} feature${ups > 1 ? 's' : ''}` : 'Nothing',
          dates: range(stF(fi), durOf(fi)) };
      } else {
        const p = findItem(hov.slice(2));
        if (p) {
          const [fi, ii] = p, it = s.kItems[fi][ii], st = stF(fi) + s.kItems[fi].slice(0, ii).reduce((a, b) => a + b.est, 0), g = geoF[fi];
          pop = { show: true, left: Math.min(Math.max(st * ppd, 8), tw - 310), top: g.top + 56, railC: RL[railOf(fi)][1],
            context: `Item of ${fname(fi)}`, title: it.name, est: fmtD(it.est), sprint: 'S' + sprintOf(st), thirdLabel: 'Position', third: `${ii + 1} of ${s.kItems[fi].length}`, dates: range(st, it.est) };
        }
      }
    }

    const tabs = s.kTabs.map((key) => {
      const isF = key[0] === 'f', p = isF ? null : findItem(key.slice(2)), fi = isF ? +key.slice(1) : p ? p[0] : 0, on = key === s.kActive;
      const name = isF ? fname(fi) : p ? s.kItems[p[0]][p[1]].name : '';
      return { name, kind: isF ? 'Feature' : 'Item', c: RL[railOf(fi)][1], dotBg: isF ? RL[railOf(fi)][1] : '#fff', dotR: isF ? '50%' : '2px',
        bg: on ? '#fff' : 'transparent', bd: on ? '#e5e5e5' : 'transparent', fw: on ? 600 : 500, ink: on ? '#0a0a0a' : '#5b5675',
        select: () => set({ kActive: key, kPop: null }),
        close: (e) => { e.stopPropagation(); this.setState((st) => { const t = st.kTabs.filter((x) => x !== key); return { kTabs: t, kActive: st.kActive === key ? t[t.length - 1] ?? null : st.kActive, kPop: null }; }); } };
    });

    const act = s.kTabs.includes(s.kActive) ? s.kActive : null;
    const togglePop = (name) => () => this.setState((st) => ({ kPop: st.kPop === name ? null : name, kQ: '' }));
    const q = s.kQ.trim().toLowerCase();
    const out = {
      totalW: 264 + tw, tw, th: RL.length * laneH, q4: 3 * ppd, today: TODAY * ppd - 1, todayPill: TODAY * ppd + 4,
      sprints, lanes, feats, items: itemBars, arcs, pop, tabs, panelH: s.kPanelH, q: s.kQ,
      canvasRef: this.canvasRef, onDragOver, onDrop, ghost, dragHint: s.kDraw ? 'Drag along the rail to size it, or onto another rail to start a new feature there. Release to create.' : dragHint, pills, dragging: !!s.kDragKind,
      lines, draw,
      g0n: F4.filter((_, i) => grpOf(i) === 0).length, g1n: F4.filter((_, i) => grpOf(i) === 1).length,
      zooms: ZOOMS.map(([id, label]) => ({ label, bg: id === s.kZoom ? '#fff' : 'transparent', ink: id === s.kZoom ? '#0a0a0a' : '#737373', sh: id === s.kZoom ? '0 1px 2px rgba(0,0,0,.08)' : 'none', pick: () => set({ kZoom: id }) })),
      startDrag: (e) => {
        e.preventDefault(); const y0 = e.clientY, h0 = s.kPanelH;
        const mv = (ev) => this.setState({ kPanelH: Math.min(820, Math.max(140, h0 - (ev.clientY - y0))) });
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); this._up = null; };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); this._up = up;
      },
      onQ: (e) => set({ kQ: e.target.value }),
      isFeat: false, isItem: false, none: act == null, cur: {},
    };
    if (!act) return out;

    if (act[0] === 'f') {
      const fi = +act.slice(1), r = railOf(fi), auto = sprintOf(stF(fi)), pin = s.kPin[fi] ?? null;
      const ownEst = s.kFEst[fi] ?? (fi === 0 ? 8 : durOf(fi));
      const ups = s.kDeps.filter(([, b]) => b === fi).map(([a]) => a), downs = s.kDeps.filter(([a]) => a === fi).map(([, b]) => b);
      const reachF = (from) => { const seen = new Set(), st = [from]; while (st.length) { const n = st.pop(); s.kDeps.forEach(([a, b]) => { if (a === n && !seen.has(b)) { seen.add(b); st.push(b); } }); } return seen; };
      const loop = reachF(fi);
      const setPin = (v) => this.setState((st) => ({ kPin: { ...st.kPin, [fi]: v }, kPop: null }));
      const effSprint = pin ?? auto;
      Object.assign(out, {
        isFeat: true,
        cur: { name: fname(fi), dates: `${RL[r][0]} · ${range(stF(fi), durOf(fi))}`, rail: RL[r][0], railC: RL[r][1], est: String(ownEst),
          sprint: 'S' + effSprint, pinNote: pin == null ? 'auto' : 'pinned' },
        onName: (e) => { const v = e.target.value; this.setState((st) => ({ kNames: { ...st.kNames, ['f' + fi]: v } })); },
        onEst: (e) => { const v = parseFloat(e.target.value); this.setState((st) => ({ kFEst: { ...st.kFEst, [fi]: isNaN(v) ? 0 : v } })); },
        estDown: () => this.setState((st) => ({ kFEst: { ...st.kFEst, [fi]: clampHalf(ownEst - 0.5) } })),
        estUp: () => this.setState((st) => ({ kFEst: { ...st.kFEst, [fi]: clampHalf(ownEst + 0.5) } })),
        pinDown: () => setPin(effSprint - 1 < auto ? null : effSprint - 1),
        pinUp: () => setPin(effSprint + 1),
        openEpic: togglePop('epic'), openSprint: togglePop('sprint'), openDeps: togglePop('deps'),
        popEpic: s.kPop === 'epic', popSprint: s.kPop === 'sprint', popDeps: s.kPop === 'deps',
        epicBd: s.kPop === 'epic' ? '#2e2456' : '#e0e0e6', sprintBd: s.kPop === 'sprint' ? '#2e2456' : '#e0e0e6',
        epicOpts: RL.map(([name, c], i) => ({ name, c, i })).filter((o) => !q || o.name.toLowerCase().includes(q)).map((o) => ({
          name: o.name, c: o.c, mark: o.i === r ? 'current' : '', bg: o.i === r ? '#f6f5f9' : 'transparent',
          pick: () => this.setState((st) => ({ kRail: { ...st.kRail, [fi]: o.i }, kPop: null, kQ: '' })) })),
        sprintOpts: [null, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => ({
          label: p == null ? 'Auto' : 'S' + p, dates: p == null ? `placed by schedule (S${auto})` : `${shortDate(dayDate((p - 1) * 10))} – ${shortDate(dayDate((p - 1) * 10 + 9))}`,
          mark: p === pin ? '✓' : p != null && p < auto ? 'earlier than scheduled' : '', bg: p === pin ? '#f6f5f9' : 'transparent',
          pick: () => setPin(p != null && p <= auto ? (p === auto ? auto : null) : p) })),
        groups: [0, 1, null].map((gi) => {
          const on = gi === grpOf(fi), g = G[gi];
          return { label: gi == null ? 'No group' : ['Phase 0', 'Phase 1'][gi], c: g ? g.c : '#c4c4c4', bg: on ? (g ? g.tint : '#f5f5f5') : '#fff', ink: on ? (g ? g.ink : '#0a0a0a') : '#525252', bd: on ? (g ? g.c : '#a3a3a3') : '#e5e5e5', pick: () => this.setState((st) => ({ kGrp: { ...st.kGrp, [fi]: gi } })) };
        }),
        after: ups.map((a) => ({ name: fname(a), c: RL[railOf(a)][1], open: () => open('f' + a), remove: () => this.setState((st) => ({ kDeps: st.kDeps.filter(([x, y]) => !(x === a && y === fi)) })) })),
        noAfter: ups.length === 0,
        next: downs.map((b) => ({ name: fname(b), c: RL[railOf(b)][1], open: () => open('f' + b) })),
        noNext: downs.length === 0,
        depOpts: F4.map((_, i) => i).filter((i) => i !== fi && !ups.includes(i) && (!q || fname(i).toLowerCase().includes(q))).map((i) => {
          const bad = loop.has(i);
          return { name: fname(i), c: RL[railOf(i)][1], ink: bad ? '#a3a3a3' : '#0a0a0a', cursor: bad ? 'not-allowed' : 'pointer',
            sub: bad ? 'Can’t: it already waits for this feature' : `${RL[railOf(i)][0]} · ends ${shortDate(dayDate(stF(i) + Math.ceil(durOf(i)) - 1))}`, subInk: bad ? '#b45309' : '#8a8a8a',
            pick: bad ? undefined : () => this.setState((st) => ({ kDeps: [...st.kDeps, [i, fi]], kPop: null, kQ: '' })) };
        }),
        itemSummary: `${s.kItems[fi].length} · ${fmtD(durOf(fi))} total`,
        itemRows: s.kItems[fi].map((it, ii) => {
          const step = (dv) => this.setState((st) => ({ kItems: st.kItems.map((l, x) => (x === fi ? l.map((y) => (y.id === it.id ? { ...y, est: clampHalf(Math.max(0.5, y.est + dv)) } : y)) : l)) }));
          return { n: ii + 1, name: it.name, est: fmtD(it.est), open: () => open('i:' + it.id), down: () => step(-0.5), up: () => step(0.5) };
        }),
        newItem: s.kNew, onNewItem: (e) => set({ kNew: e.target.value }),
        addItem: () => { const name = s.kNew.trim(); if (!name) return; const id = `${fi}-n${Date.now()}`; this.setState((st) => ({ kNew: '', kItems: st.kItems.map((l, x) => (x === fi ? [...l, { id, name, est: 1 }] : l)) })); },
      });
    } else {
      const p = findItem(act.slice(2));
      if (!p) return out;
      const [fi, ii] = p, list = s.kItems[fi], it = list[ii], st0 = stF(fi) + list.slice(0, ii).reduce((a, b) => a + b.est, 0);
      const upd = (fn) => this.setState((st) => ({ kItems: st.kItems.map((l, x) => (x === fi ? l.map((y) => (y.id === it.id ? fn(y) : y)) : l)) }));
      const swap = (d) => this.setState((st) => ({ kItems: st.kItems.map((l, x) => { if (x !== fi) return l; const j = ii + d; if (j < 0 || j >= l.length) return l; const c = [...l]; [c[ii], c[j]] = [c[j], c[ii]]; return c; }) }));
      Object.assign(out, {
        isItem: true,
        cur: { name: it.name, dates: `${fname(fi)} · ${range(st0, it.est)}`, parent: fname(fi), railC: RL[railOf(fi)][1], est: String(it.est), sprint: 'S' + sprintOf(st0),
          pos: `${ii + 1} of ${list.length}`, prev: ii > 0 ? list[ii - 1].name : 'Start of feature', nextName: ii < list.length - 1 ? list[ii + 1].name : 'End of feature' },
        onName: (e) => { const v = e.target.value; upd((y) => ({ ...y, name: v })); },
        onEst: (e) => { const v = parseFloat(e.target.value); upd((y) => ({ ...y, est: isNaN(v) ? 0.5 : Math.max(0.5, v) })); },
        estDown: () => upd((y) => ({ ...y, est: clampHalf(Math.max(0.5, y.est - 0.5)) })),
        estUp: () => upd((y) => ({ ...y, est: clampHalf(y.est + 0.5) })),
        openFeat: togglePop('feat'), popFeat: s.kPop === 'feat', featBd: s.kPop === 'feat' ? '#2e2456' : '#e0e0e6',
        featOpts: F4.map((_, i) => i).filter((i) => !q || fname(i).toLowerCase().includes(q)).map((i) => ({
          name: fname(i), c: RL[railOf(i)][1], mark: i === fi ? 'current' : '', bg: i === fi ? '#f6f5f9' : 'transparent',
          pick: () => this.setState((st) => { if (i === fi) return { kPop: null }; const moved = st.kItems[fi].find((y) => y.id === it.id); return { kPop: null, kQ: '', kItems: st.kItems.map((l, x) => (x === fi ? l.filter((y) => y.id !== it.id) : x === i ? [...l, moved] : l)) }; }) })),
        moveEarlier: () => swap(-1), moveLater: () => swap(1),
        openPrev: ii > 0 ? () => open('i:' + list[ii - 1].id) : undefined,
        openNext: ii < list.length - 1 ? () => open('i:' + list[ii + 1].id) : undefined,
      });
    }
    return out;
  }

  boardD() {
    const s = this.state, dg = geo({ ppd: 40, rowH: 52, barTop: 11, barH: 28, ms: 14 });
    const hov = s.hover, act = s.tabs.includes(s.active) ? s.active : null;
    const near = new Set();
    if (hov != null) { near.add(hov); DEPS.forEach(([a, b]) => { if (a === hov) near.add(b); if (b === hov) near.add(a); }); }
    const grpOf = (i) => (s.groups[i] ?? F[i][3]);
    const open = (i) => this.setState((st) => ({ tabs: st.tabs.includes(i) ? st.tabs : [...st.tabs, i], active: i, hover: null }));
    const bars = dg.bars.map((b) => {
      const gi = grpOf(b.i), g = G[gi] || { c: '#a3a3a3', ink: '#404040' }, lit = b.i === hov || b.i === act;
      return {
        ...b, radius: b.ms ? '3px' : '6px', rot: b.ms ? 'rotate(45deg)' : 'none',
        bg: b.ms ? g.c : g.c + '2e', border: `${lit ? 2.5 : 1.25}px solid ${g.c}`,
        op: hov == null || near.has(b.i) ? 1 : 0.35, ink: g.ink,
        label: b.ms ? '' : (s.edits[b.i] ?? F[b.i][4]),
        enter: () => this.setState({ hover: b.i }), leave: () => this.setState({ hover: null }), click: () => open(b.i),
      };
    });
    const ticks = [];
    [[0, 4], [8, 3], [11, 6]].forEach(([fi, n]) => {
      const b = dg.bars[fi], seg = (b.w - (n - 1) * 3) / n, g = G[grpOf(fi)] || { c: '#a3a3a3' };
      for (let k = 0; k < n; k++) ticks.push({ left: b.left + k * (seg + 3), top: b.top + 32, w: seg, bg: g.c + '99', op: hov == null || near.has(fi) ? 1 : 0.35 });
    });
    const arcs = arcsSvg(dg.bars, (a, b) => {
      const on = hov == null || a === hov || b === hov;
      return { c: RAILS[F[a][0]][1], w: hov != null && on ? 2 : 1.25, o: on ? 0.85 : 0.12 };
    });
    const label = (i) => s.edits[i] ?? F[i][4];
    let pop = { show: false };
    if (hov != null) {
      const b = dg.bars[hov], f = F[hov], gi = grpOf(hov), ups = DEPS.filter(([, q]) => q === hov).length;
      pop = {
        show: true, left: Math.min(Math.max(b.left, 8), 1176 - 310), top: b.top + b.h + 10,
        title: label(hov), group: gi == null ? 'No group' : ['Phase 0', 'Phase 1'][gi], groupC: (G[gi] || {}).c || '#a3a3a3',
        rail: RAILS[f[0]][0], railC: RAILS[f[0]][1], est: f[5], sprint: 'S' + (Math.floor(f[1] / 10) + 1),
        deps: ups === 0 ? 'Nothing' : ups === 1 ? '1 feature' : `${ups} features`,
        dates: f[2] === 0 ? dayDate(f[1]) : `${dayDate(f[1])} to ${dayDate(f[1] + Math.max(f[2], 1) - 1)}`,
      };
    }
    const tabs = s.tabs.map((i) => ({
      name: label(i), c: RAILS[F[i][0]][1], bg: i === act ? '#fff' : 'transparent', bd: i === act ? '#e5e5e5' : 'transparent',
      fw: i === act ? 600 : 500, ink: i === act ? '#0a0a0a' : '#5b5675',
      select: () => this.setState({ active: i }),
      close: (e) => { e.stopPropagation(); this.setState((st) => { const t = st.tabs.filter((x) => x !== i); return { tabs: t, active: st.active === i ? t[t.length - 1] ?? null : st.active }; }); },
    }));
    let f = {}, pins = [], groups = [], waits = [];
    if (act != null) {
      const r = F[act];
      const estV = s.edits['e' + act] ?? (r[5] === 'milestone' ? '0' : r[5].replace('d', ''));
      f = { name: label(act), est: estV, estLabel: r[5], rail: RAILS[r[0]][0], railC: RAILS[r[0]][1], sprint: 'S' + (Math.floor(r[1] / 10) + 1),
        dates: r[2] === 0 ? dayDate(r[1]) : `${dayDate(r[1])} → ${dayDate(r[1] + Math.max(r[2], 1) - 1)}` };
      const pin = s.pins[act] ?? null;
      pins = [null, 1, 2, 3, 4, 5, 6].map((p) => ({ label: p == null ? 'None' : 'S' + p, bg: p === pin ? '#fff' : 'transparent', ink: p === pin ? '#0a0a0a' : '#737373', sh: p === pin ? '0 1px 2px rgba(0,0,0,.1)' : 'none', pick: () => this.setState((st) => ({ pins: { ...st.pins, [act]: p } })) }));
      const gc = grpOf(act);
      groups = [0, 1, null].map((gi) => {
        const on = gi === gc, g = G[gi];
        return { label: gi == null ? 'No group' : ['Phase 0', 'Phase 1'][gi], c: g ? g.c : '#c4c4c4', bg: on ? (g ? g.tint : '#f5f5f5') : '#fff', ink: on ? (g ? g.ink : '#0a0a0a') : '#525252', bd: on ? (g ? g.c : '#a3a3a3') : '#e5e5e5', pick: () => this.setState((st) => ({ groups: { ...st.groups, [act]: gi } })) };
      });
      const down = reach(act), wst = s.waits[act] || {};
      const ups = DEPS.filter(([, q]) => q === act).map(([p]) => p);
      const cands = [...ups, ...F.map((_, i) => i).filter((i) => i !== act && !ups.includes(i))].slice(0, 6);
      waits = cands.map((i) => {
        const blocked = down.has(i), on = wst[i] ?? ups.includes(i);
        return {
          name: label(i), c: RAILS[F[i][0]][1], blocked,
          hint: blocked ? `Would loop: ${label(i).slice(0, 18)}… already waits on this` : '',
          mark: on ? '✓' : '', boxBg: on ? '#2e2456' : '#fff', boxBd: on ? '#2e2456' : blocked ? '#e5e5e5' : '#c9c9d2',
          ink: blocked ? '#a3a3a3' : '#0a0a0a', bg: on ? '#faf9fd' : '#fff', cursor: blocked ? 'not-allowed' : 'pointer',
          toggle: blocked ? undefined : () => this.setState((st) => ({ waits: { ...st.waits, [act]: { ...(st.waits[act] || {}), [i]: !on } } })),
        };
      });
    }
    return {
      ...dg, q4: 3 * 40, bars, ticks, arcs, pop, tabs, f, pins, groups, waits,
      hasTab: act != null, noTab: act == null, tabHint: act == null ? '' : 'Hover for a summary · click a bar to open another tab',
      onName: (e) => { const v = e.target.value; this.setState((st) => ({ edits: { ...st.edits, [act]: v } })); },
      onEst: (e) => { const v = e.target.value; this.setState((st) => ({ edits: { ...st.edits, ['e' + act]: v } })); },
    };
  }

  renderVals() {
    const rails = RAILS.map(([name, c, n], i) => ({ name, c, n, count: n === 1 ? '1 feature' : `${n} features`, topA: i * 56, topB: i * 72, topC: i * 44, topD: i * 52 }));
    const d = this.boardD();

    // 1a current
    const cg = geo({ ppd: 42, rowH: 44, barTop: 9, barH: 22, ms: 12 });
    const cBars = cg.bars.map((b) => ({
      ...b, radius: b.ms ? '2px' : '6px', rot: b.ms ? 'rotate(45deg)' : 'none',
      bg: G[b.g].c + '2e', border: `${b.i === 0 ? 2.5 : 1.25}px solid ${G[b.g].c}`,
    }));
    const ticks = [];
    [[0, 4], [8, 3], [11, 6]].forEach(([fi, n]) => {
      const b = cg.bars[fi], seg = (b.w - (n - 1) * 3) / n;
      for (let k = 0; k < n; k++) ticks.push({ left: b.left + k * (seg + 3), top: b.top + 25, w: seg, bg: G[b.g].c + '99' });
    });
    const c = { ...cg, bars: cBars, ticks, arcs: arcsSvg(cg.bars, (a) => ({ c: RAILS[F[a][0]][1], w: 1.25, o: 0.9 })) };

    // 2a calm
    const ag = geo({ ppd: 40, rowH: 56, barTop: 13, barH: 30, ms: 14 });
    const aBars = ag.bars.map((b) => {
      const g = G[b.g];
      return {
        ...b, radius: b.ms ? '3px' : '6px', rot: b.ms ? 'rotate(45deg)' : 'none',
        bg: b.ms ? g.c : g.tint, stroke: b.ms ? g.c : g.mid, ink: g.ink,
        label: b.ms ? '' : F[b.i][4], prog: Math.round(F[b.i][6] * 100), progBg: g.mid,
      };
    });
    const a = { ...ag, bars: aBars, arcs: arcsSvg(ag.bars, () => ({ c: '#8a8a8a', w: 1, o: 0.35 })) };

    // 2b brand frame, feature 3 selected
    const bg = geo({ ppd: 36, rowH: 72, barTop: 26, barH: 38, ms: 16 });
    const SEL = 3, thread = new Set([2, 3, 4]);
    const bBars = bg.bars.map((x) => {
      const g = G[x.g], sel = x.i === SEL;
      return {
        ...x, radius: x.ms ? '3px' : '7px', rot: x.ms ? 'rotate(45deg)' : 'none',
        bg: x.ms ? g.c : sel ? '#fff' : g.tint,
        border: sel ? '2px solid #2e2456' : `1px solid ${x.ms ? g.c : g.mid}`,
        shadow: sel ? '0 4px 14px rgba(46,36,86,.22)' : 'none',
        op: thread.has(x.i) ? 1 : 0.45, ink: sel ? '#2e2456' : g.ink, sub: g.sub,
        label: x.ms ? '' : F[x.i][4], est: x.ms || (x.w < 60 && !sel) ? '' : F[x.i][5],
        minW: sel ? '220px' : '0', z: sel ? 3 : 1,
      };
    });
    const b = { ...bg, bars: bBars, arcs: arcsSvg(bg.bars, (p, q) => (p === SEL || q === SEL ? { c: '#2e2456', w: 1.75, o: 1 } : null)) };

    // sidebar tree for 1a
    const T = [
      ['gwi-auth', 0, 1], ['Role hygiene, EuroWIN rename, de-org and per-product branding', 0, 0, true], ['02 EuroWIN rename and permissions', 0, 0], ['01 Establish the state and config', 0, 0], ['03 Application metadata, email templates', 0, 0], ['04 Custom domains, per-product', 0, 0],
      ['eu_win', 1, 1], ['02 EuroWIN authorizes on per-product', 1, 0],
      ['gwi-platform', 2, 1], ['03 Branding from the client, or…', 2, 0], ['1.c.4 Retire the cron job', 2, 0], ['1.d.1 dated_roles regression in…', 2, 0], ['1.d.3 Remove the API-side def…', 2, 0],
      ['WaterData2.0', 3, 1], ['04 Both permission sets in one…', 3, 0], ['1.d.1 dated_roles regression in…', 3, 0],
      ['gwi-iac', 4, 1], ['1.a The service exists and listens', 4, 0], ['1.a.1 AWS account vending', 4, 0], ['1.a.3 Network, compute, DNS …', 4, 0],
    ];
    const tree = T.map(([name, r, isRail, sel]) => ({
      name, c: RAILS[r][1], pl: isRail ? 6 : 28, caretDisp: isRail ? 'flex' : 'none', swDisp: isRail ? 'block' : 'none',
      fw: isRail ? 500 : 400, ink: isRail ? '#0a0a0a' : '#737373', bg: sel ? '#efecfa' : 'transparent',
    }));

    const e = this.boardE();
    return { rails, c, a, b, tree, d, e };
  }
}
</script>
</body>
</html>
