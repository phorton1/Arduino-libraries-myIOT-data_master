//------------------------------------------------------------------
// Datetime formatting helper
//------------------------------------------------------------------

function formatDt(dt)
{
	let date = new Date(dt * 1000);
	return date.getFullYear() + '-' +
		String(date.getMonth()+1).padStart(2,'0') + '-' +
		String(date.getDate()).padStart(2,'0') + ' ' +
		String(date.getHours()).padStart(2,'0') + ':' +
		String(date.getMinutes()).padStart(2,'0') + ':' +
		String(date.getSeconds()).padStart(2,'0');
}


//------------------------------------------------------------------
// Binary search for nearest record by dt (unix seconds)
//------------------------------------------------------------------

function findNearestRecIndex(dt)
{
	// Binary search in ascending chart.recs for the record closest to dt (unix seconds).
	// Returns the array index, or -1 if recs is empty.
	let recs = chart.recs;
	if (!recs || !recs.length) return -1;
	let lo = 0, hi = recs.length - 1;
	while (lo < hi)
	{
		let mid = (lo + hi) >> 1;
		if (recs[mid][0] < dt) lo = mid + 1;
		else hi = mid;
	}
	if (lo > 0 && Math.abs(recs[lo-1][0] - dt) < Math.abs(recs[lo][0] - dt))
		lo--;
	return lo;
}

function findNearestRec(dt)
{
	let idx = findNearestRecIndex(dt);
	return idx >= 0 ? chart.recs[idx] : null;
}


//------------------------------------------------------------------
// Custom tooltip
//------------------------------------------------------------------

function onChartMouseMove(ev, x_ms, chartPx, chartPy)
{
	if (!chart.recs || !chart.recs.length) return;

	let dt     = Math.round(x_ms / 1000);
	let center = findNearestRecIndex(dt);
	if (center < 0) return;

	// Tooltip always shows the time-nearest record regardless of proximity.
	showTooltip(ev, chart.recs[center]);

	if (!chart.plot || chartPx === undefined || chartPy === undefined)
		return;

	// Vertex snapping:
	// 1. Expand a pixel window left/right from the time-nearest record,
	//    including every record whose plotted x-pixel is within SNAP_PX
	//    of the cursor.  This handles multiple records collapsed onto the
	//    same visual column when zoomed out.
	// 2. Across all records in that window, check every visible series and
	//    find the single vertex with the smallest 2D pixel distance.
	//    "First match" is replaced by "nearest match" so the peak beats
	//    a sub-peak even when both are within the snap radius.

	const SNAP_PX = 16;
	let recs  = chart.recs;
	let xaxis = chart.plot.axes.xaxis;
	let col   = chart.header.col;
	let is_faren = document.getElementById('_degree_type') ?
		parseInt(document.getElementById('_degree_type').value) : 0;

	// walk left from center while still within pixel window
	let lo = center;
	while (lo > 0 && Math.abs(xaxis.u2p(recs[lo-1][0] * 1000) - chartPx) < SNAP_PX)
		lo--;

	// walk right from center while still within pixel window
	let hi = center;
	while (hi < recs.length - 1 && Math.abs(xaxis.u2p(recs[hi+1][0] * 1000) - chartPx) < SNAP_PX)
		hi++;

	// find the geometrically nearest vertex across window × series
	let best_dist = SNAP_PX;   // threshold: must beat this to qualify
	let best_rec = null, best_px = null, best_py = null, best_color = null;

	for (let i = lo; i <= hi; i++)
	{
		let rec    = recs[i];
		let rec_px = xaxis.u2p(rec[0] * 1000);
		for (let j = 0; j < chart.header.num_cols; j++)
		{
			let series = chart.plot.series[j];
			if (!series || !series.show || !series.yaxis) continue;
			let yaxis = chart.plot.axes[series.yaxis];
			if (!yaxis) continue;
			let val = rec[j+1];
			if (is_faren && (
				col[j].type == 'centigrade32_t' ||
				col[j].type == 'centigradeRaw_t' ||
				col[j].type == 'centigrade8_t'))
			{
				val = centigradeToFarenheit(val);
			}
			if (val === null) continue;		// sensor error sentinel; not plotted
			let rec_py = yaxis.u2p(val);
			let dx = chartPx - rec_px;
			let dy = chartPy - rec_py;
			let dist = Math.sqrt(dx*dx + dy*dy);
			if (dist < best_dist)
			{
				best_dist  = dist;
				best_rec   = rec;
				best_px    = rec_px;
				best_py    = rec_py;
				best_color = series.color;
			}
		}
	}

	if (best_rec !== null)
	{
		showVertexCircle(best_px, best_py, best_color);
		setChartCursor('pointer');
		chart.near_vertex = best_rec;
	}
	else
	{
		hideVertexCircle();
		setChartCursor('');
		delete chart.near_vertex;
	}
}


function showVertexCircle(px, py, color)
{
	let el = document.getElementById('_vertex_circle');
	if (!el)
	{
		el = document.createElement('div');
		el.id = '_vertex_circle';
		document.getElementById('_chart').appendChild(el);
	}
	el.style.left       = Math.round(px - 5) + 'px';
	el.style.top        = Math.round(py - 5) + 'px';
	el.style.background = color || '#888';
	el.style.display    = 'block';
}


function hideVertexCircle()
{
	let el = document.getElementById('_vertex_circle');
	if (el) el.style.display = 'none';
	delete chart.near_vertex;
}


function showTooltip(ev, rec)
{
	let header = chart.header;
	let col = header.col;
	let is_faren = document.getElementById('_degree_type') ?
		parseInt(document.getElementById('_degree_type').value) : 0;

	let html = '<div class="tt_dt">' + (chart.near_vertex ? '\u25cf ' : '') + formatDt(rec[0]) + '</div>';
	for (let j = 0; j < header.num_cols; j++)
	{
		let val = rec[j+1];
		if (is_faren && (
			col[j].type == 'centigrade32_t' ||
			col[j].type == 'centigradeRaw_t' ||
			col[j].type == 'centigrade8_t'))
		{
			val = centigradeToFarenheit(val);
		}
		let val_str = (val === null) ? '---' : (typeof val === 'number') ? val.toFixed(2) : val;
		html += '<div class="tt_row">' +
			'<span class="tt_label">' + col[j].name + '</span>' +
			'<span class="tt_value">' + val_str + '</span></div>';
	}

	let tip = document.getElementById('_tooltip');
	if (!tip)
	{
		tip = document.createElement('div');
		tip.id = '_tooltip';
		document.body.appendChild(tip);
	}

	tip.innerHTML = html;
	tip.style.display = 'block';

	let x = ev.pageX + 15;
	let y = ev.pageY - 10;
	if (x + 220 > window.innerWidth)  x = ev.pageX - 225;
	if (y + tip.offsetHeight > window.innerHeight) y = ev.pageY - tip.offsetHeight;
	tip.style.left = x + 'px';
	tip.style.top  = y + 'px';

	chart.tooltip_rec = rec;
}


function setChartCursor(val)
{
	var ch = document.getElementById('_chart');
	if (ch) ch.style.cursor = val;
	var canvases = ch ? ch.querySelectorAll('canvas') : [];
	for (var i = 0; i < canvases.length; i++)
		canvases[i].style.cursor = val;
}


function hideTooltip()
{
	let tip = document.getElementById('_tooltip');
	if (tip) tip.style.display = 'none';
	delete chart.tooltip_rec;
	hideVertexCircle();
	setChartCursor('');
}


//------------------------------------------------------------------
// Context menu
//------------------------------------------------------------------

function showContextMenu(ev)
{
	hideContextMenu();

	// Capture records now — chart.near_vertex / tooltip_rec may be
	// cleared by mouseleave before the user clicks a menu item.
	let captured_vertex = chart.near_vertex || null;
	let captured_rec    = chart.tooltip_rec || null;

	let items = [];
	var has_file = chart.header && chart.header.has_file;
	if (captured_vertex)
		items.push({ label: has_file ? 'View / Delete Record' : 'View Record', fn: function(){ showRecordDialog(captured_vertex); } });
	if (has_file && captured_rec)
		items.push({ label: 'Trim Before This Time', fn: function(){ doTrimBefore(captured_rec); } });
	if (has_file)
		items.push({ label: 'Scan Datalog', fn: doScanDatalog });

	let html = '';
	for (let i = 0; i < items.length; i++)
		html += '<div class="ctx_item" data-idx="' + i + '">' + items[i].label + '</div>';

	let menu = document.createElement('div');
	menu.id = '_context_menu';
	menu.innerHTML = html;
	document.body.appendChild(menu);
	menu.style.left = ev.pageX + 'px';
	menu.style.top  = ev.pageY + 'px';

	$(menu).find('.ctx_item').on('click', function()
	{
		let idx = parseInt($(this).attr('data-idx'));
		hideContextMenu();
		items[idx].fn();
	});

	$(document).one('click.ctx', hideContextMenu);
}


function hideContextMenu()
{
	let menu = document.getElementById('_context_menu');
	if (menu) menu.parentNode.removeChild(menu);
	$(document).off('click.ctx');
}


//------------------------------------------------------------------
// Record view / delete dialog
//------------------------------------------------------------------

var _dlg_rec = null;

function showRecordDialog(rec)
{
	if (!rec) rec = chart.near_vertex;
	if (!rec) return;
	_dlg_rec = rec;

	let header = chart.header;
	let col = header.col;
	let is_faren = document.getElementById('_degree_type') ?
		parseInt(document.getElementById('_degree_type').value) : 0;

	let html = '<div id="_dlg_overlay" onclick="closeRecordDialog()"></div>';
	html += '<div id="_rec_dialog">';
	html += '<div class="dlg_title">Record at ' + formatDt(rec[0]) + '</div>';
	html += '<table class="dlg_table">';
	for (let j = 0; j < header.num_cols; j++)
	{
		let val = rec[j+1];
		if (is_faren && (
			col[j].type == 'centigrade32_t' ||
			col[j].type == 'centigradeRaw_t' ||
			col[j].type == 'centigrade8_t'))
		{
			val = centigradeToFarenheit(val);
		}
		let val_str = (val === null) ? '---' : (typeof val === 'number') ? val.toFixed(3) : val;
		html += '<tr><td class="dlg_label">' + col[j].name + '</td>' +
				'<td class="dlg_value">' + val_str + '</td></tr>';
	}
	html += '</table>';
	html += '<div class="dlg_buttons">';
	if (header.has_file)
		html += '<button onclick="doDeleteRecord(_dlg_rec)">Delete</button> ';
	html += '<button onclick="closeRecordDialog()">Close</button>';
	html += '</div></div>';

	document.body.insertAdjacentHTML('beforeend', html);
}


function closeRecordDialog()
{
	_dlg_rec = null;
	['_rec_dialog','_dlg_overlay'].forEach(function(id)
	{
		let el = document.getElementById(id);
		if (el) el.parentNode.removeChild(el);
	});
}


function doDeleteRecord(rec)
{
	if (!rec) rec = chart.near_vertex;
	if (!rec) return;
	let dt = rec[0];
	if (!confirm('Delete all records at ' + formatDt(dt) + '?\nThis cannot be undone.'))
		return;
	closeRecordDialog();
	var xhr = new XMLHttpRequest();
	xhr.open('GET', '/custom/delete_record' +
		'?dt=' + dt +
		'&data_name=' + data_name +
		'&uuid=' + device_uuid, true);
	xhr.onload = function()
	{
		delete chart.max_dt;
		get_chart_data();
	};
	xhr.send();
}


//------------------------------------------------------------------
// Trim before
//------------------------------------------------------------------

function doTrimBefore(rec)
{
	if (!rec) rec = chart.tooltip_rec;
	if (!rec) return;
	let dt = rec[0];
	if (!confirm('Delete ALL history before ' + formatDt(dt) + '?\nThis cannot be undone.'))
		return;
	var xhr = new XMLHttpRequest();
	xhr.open('GET', '/custom/trim_before' +
		'?dt=' + dt +
		'&data_name=' + data_name +
		'&uuid=' + device_uuid, true);
	xhr.onload = function()
	{
		delete chart.max_dt;
		get_chart_data();
	};
	xhr.send();
}


//------------------------------------------------------------------
// Scan datalog
//------------------------------------------------------------------

function doScanDatalog()
{
	disableControls(true);
	var btn = document.getElementById('_update_button');
	var saved_label = btn ? btn.textContent : null;
	if (btn) btn.textContent = 'Scanning...';
	var xhr = new XMLHttpRequest();
	xhr.open('GET', '/custom/scan_datalog' +
		'?data_name=' + data_name +
		'&uuid=' + device_uuid, true);
	xhr.onload = function()
	{
		disableControls(false);
		if (btn && saved_label) btn.textContent = saved_label;
		try
		{
			showScanOverlay(JSON.parse(this.responseText));
		}
		catch(e)
		{
			console.log('scan_datalog parse error: ' + e);
		}
	};
	xhr.send();
}


function showScanOverlay(result)
{
	hideScanOverlay();
	let spikes = result.spikes || [];
	let html = '<div id="_scan_overlay">';
	html += '<div class="scan_title">Datalog Scan Results</div>';
	html += '<div class="scan_info">Records: '    + result.num_recs + '</div>';
	html += '<div class="scan_info">First: '      + (result.first_dt ? formatDt(result.first_dt) : 'none') + '</div>';
	html += '<div class="scan_info">Last: '       + (result.last_dt  ? formatDt(result.last_dt)  : 'none') + '</div>';
	html += '<div class="scan_info">Tombstones: ' + result.tombstones + '</div>';
	html += '<div class="scan_info">Spikes: '     + spikes.length + '</div>';

	// One row per spike: description + Delete button.
	// A spike is one or more consecutive records whose timestamps jumped
	// ahead of the surrounding sequence (e.g. a bad NTP read on boot).
	// The backward walk in scanFile() identified exactly which records
	// to remove; the Delete button tombstones that precise range.
	for (let i = 0; i < spikes.length; i++)
	{
		let s = spikes[i];
		let desc = s.count == 1
			? '1 record at ' + formatDt(s.first_dt)
			: s.count + ' records ' + formatDt(s.first_dt) + ' &rarr; ' + formatDt(s.last_dt);
		if (s.prev_dt)
			desc += '<br><span class="spike_ctx">between ' + formatDt(s.prev_dt) +
				' and ' + formatDt(s.next_dt) + '</span>';
		html += '<div class="scan_spike">' + desc +
			' <button onclick="doDeleteSpike(' +
				s.start_idx + ',' + s.end_idx + ',' + s.count +
			')">Delete</button></div>';
	}

	html += '<div class="scan_buttons">';
	if (result.needs_compact)
		html += '<button onclick="doCompact()">Compact (' + result.tombstones + ' tombstones)</button> ';
	html += '<button onclick="hideScanOverlay()">Close</button>';
	html += '</div></div>';
	document.body.insertAdjacentHTML('beforeend', html);
}


function doDeleteSpike(start_idx, end_idx, count)
{
	if (!confirm('Delete ' + count + ' spike record(s)?\nThis cannot be undone.'))
		return;
	hideScanOverlay();
	var xhr = new XMLHttpRequest();
	xhr.open('GET', '/custom/delete_spike' +
		'?start_idx=' + start_idx +
		'&end_idx='   + end_idx +
		'&data_name=' + data_name +
		'&uuid='      + device_uuid, true);
	xhr.onload = function()
	{
		delete chart.max_dt;
		get_chart_data();
	};
	xhr.send();
}


function hideScanOverlay()
{
	let el = document.getElementById('_scan_overlay');
	if (el) el.parentNode.removeChild(el);
}


function doDeleteOutOfOrder(indices)
{
	if (!confirm('Delete ' + indices.length + ' out-of-order record(s)?\nThis cannot be undone.'))
		return;
	hideScanOverlay();
	var xhr = new XMLHttpRequest();
	xhr.open('GET', '/custom/delete_out_of_order' +
		'?indices=' + indices.join(',') +
		'&data_name=' + data_name +
		'&uuid=' + device_uuid, true);
	xhr.onload = function()
	{
		delete chart.max_dt;
		get_chart_data();
	};
	xhr.send();
}


function doCompact()
{
	if (!confirm('Compact datalog file? This permanently removes tombstoned records.'))
		return;
	hideScanOverlay();
	var xhr = new XMLHttpRequest();
	xhr.open('GET', '/custom/compact_datalog' +
		'?data_name=' + data_name +
		'&uuid=' + device_uuid, true);
	xhr.onload = function()
	{
		delete chart.max_dt;
		get_chart_data();
	};
	xhr.send();
}


//------------------------------------------------------------------
// Injected CSS for tooltip, context menu, dialogs
//------------------------------------------------------------------

function injectStyles()
{
	if (document.getElementById('_iot_chart_styles')) return;
	let style = document.createElement('style');
	style.id = '_iot_chart_styles';
	style.textContent = [
		'#_chart { position:relative; }',
		'#_chart canvas { cursor:inherit; }',

		'#_vertex_circle {',
		'  display:none; position:absolute; width:10px; height:10px;',
		'  border-radius:50%; border:2px solid rgba(0,0,0,0.4);',
		'  box-shadow:0 0 2px rgba(0,0,0,0.5);',
		'  pointer-events:none; z-index:999; }',

		'#_tooltip {',
		'  display:none; position:fixed; background:rgba(0,0,0,0.82); color:#fff;',
		'  padding:7px 11px; border-radius:4px; font-size:12px; font-family:monospace;',
		'  pointer-events:none; z-index:1000; min-width:150px; }',
		'.tt_dt  { font-weight:bold; margin-bottom:4px; white-space:nowrap; }',
		'.tt_row { display:flex; justify-content:space-between; gap:14px; }',
		'.tt_label { color:#aaa; }',
		'.tt_value { text-align:right; }',

		'#_context_menu {',
		'  position:fixed; background:#fff; border:1px solid #888;',
		'  border-radius:3px; box-shadow:2px 2px 6px rgba(0,0,0,0.3);',
		'  z-index:1001; min-width:190px; cursor:default; }',
		'.ctx_item { padding:8px 14px; }',
		'.ctx_item:hover { background:#eef; }',

		'#_dlg_overlay {',
		'  position:fixed; top:0; left:0; width:100%; height:100%;',
		'  background:rgba(0,0,0,0.4); z-index:1002; }',
		'#_rec_dialog {',
		'  position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);',
		'  background:#fff; border:1px solid #888; border-radius:4px;',
		'  padding:16px; z-index:1003; min-width:260px; }',
		'.dlg_title { font-weight:bold; margin-bottom:10px; }',
		'.dlg_table { width:100%; border-collapse:collapse; margin-bottom:4px; }',
		'.dlg_table td { padding:3px 6px; }',
		'.dlg_label { color:#555; font-size:13px; }',
		'.dlg_value { text-align:right; font-family:monospace; font-size:13px; }',
		'.dlg_buttons { margin-top:12px; text-align:right; }',
		'.dlg_buttons button { margin-left:6px; }',

		'#_scan_overlay {',
		'  position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);',
		'  background:#fff; border:1px solid #888; border-radius:4px;',
		'  padding:16px; z-index:1003; min-width:300px; }',
		'.scan_title { font-weight:bold; margin-bottom:10px; font-size:14px; }',
		'.scan_info  { margin:3px 0; font-size:13px; }',
		'.scan_buttons { margin-top:14px; }',
		'.scan_buttons button { margin-right:8px; }',
		'.scan_spike { margin:6px 0; padding:5px 8px; background:#fff8e1;',
		'  border-left:3px solid #f0a000; font-size:12px; }',
		'.scan_spike button { margin-left:8px; font-size:12px; }',
		'.spike_ctx { color:#777; font-size:11px; }'
	].join('\n');
	document.head.appendChild(style);
}
