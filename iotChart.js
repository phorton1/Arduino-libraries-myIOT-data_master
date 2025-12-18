// iotChart.js

var charts = {};
var defaultSeriesColors = [
    "#4bb2c5", "#EAA228", "#c5b47f", "#579575",
    "#839557", "#958c12", "#953579", "#4b5de4",
    "#d8b83f", "#ff5800", "#0085cc", "#c747a3",
    "#cddf54", "#FBD178", "#26B4E3", "#bd70c7"
];



function setChartElementSize(name)
{
    let width = window.innerWidth;
    let height = window.innerHeight;
    let client_width = width - 30;
	let client_height = height - navbar_height - 20;
	let ele = document.getElementById(name + "_chart");
	ele.style.height = (client_height - 60) + "px";	// minus controls
	ele.style.width = client_width + "px";
}



function onChartResize()
{
    let width = window.innerWidth;
    let height = window.innerHeight;
    let client_width = width - 30;
	let client_height = height - navbar_height - 20;
	for (let name in charts)
	{
		let ele = document.getElementById(name + "_chart");
		ele.style.height = (client_height - 60) + "px";	// minus controls
		ele.style.width = client_width + "px";
		if (charts[name].plot)
			charts[name].plot.replot( { resetAxes: true } );
	}
}


function determineNumTicks(name)
	// using the column tick_intervals and the raw min and max
	// for each value, determine the number of ticks that will
	// completely encapsulate the data, then go back and set
	// the min and max of each column to the appropriate value.
{
	var num_ticks = 0;
	let header = charts[name].header;
	for (let i=0; i<header.num_cols; i++)
	{
		let col = header.col[i];
		let min = col.min;
		let max = col.max;
		let interval = col.tick_interval;

		let low = Math.floor(parseInt((min-interval+1) /interval));
		let high = Math.ceil(parseInt((max+interval-1) /interval));

		let new_min = low * interval;
		let ticks = high - low;
		if (ticks > num_ticks)
			num_ticks = ticks;

		col.min = new_min;
	}

	// now assign the max so that every one uses the same number of ticks

	for (var i=0; i<header.num_cols; i++)
	{
		let col = header.col[i];
		let min = col.min;
		let interval = col.tick_interval;

		let max = min + num_ticks * interval;
		col.max = max;
	}

	console.log("determineNumTicks() returning " + (num_ticks+1));
	for (let j=0; j<header.num_cols; j++)
	{
		console.log("   col[" + j + "]  min=" + header.col[j].min + "  max=" + header.col[j].max);
	}
	
	return num_ticks + 1;
}



function getSeriesData(name)
{
	let chart = charts[name];
	let header = chart.header;
	let col = header.col;
	let data = [];
	for (var i=0; i<header.num_cols; i++)
	{
		data[i] = [];
		col[i]['min'] = null;
		col[i]['max'] = null;
	}
	let recs = chart.recs;
	for (let i=0; i<recs.length; i++)
	{
		let rec = recs[i];
		let dt = rec[0];
		for (let j=0; j<header.num_cols; j++)
		{
			let val = rec[j+1];
			if (col[j].min == null)
			{
				col[j].min = val;
				col[j].max = val;
			}
			else
			{
				if (val < col[j].min) col[j].min = val;
				if (val > col[j].max) col[j].max = val;
			}

			data[j].push([dt*1000,val]);
		}
	}
	console.log("getSeriesData() returning " + data.length + " records");
	for (let j=0; j<header.num_cols; j++)
	{
		console.log("   col[" + j + "]  min=" + col[j].min + "  max=" + col[j].max);
	}
	return data;
}



function create_chart(name)
{
	if (charts[name].plot)
	{
		charts[name].plot.destroy();
		delete charts[name].plot;
	}

	let data = getSeriesData(name);
	let header = charts[name].header;
	let series_colors = header.series_colors || defaultSeriesColors;
	let num_ticks = determineNumTicks(name);

	let options = {

		title: name,
		seriesDefaults: {
			showMarker : false },

		legend : {
			renderer: $.jqplot.EnhancedLegendRenderer,
			show: true,
			showLabels: true,
			rendererOptions: {
				numberRows: 1,
			},
		},
		series: [],
		axes:{
			xaxis:{
				renderer:$.jqplot.DateAxisRenderer,
			},
		},	// axes

		seriesColors: series_colors,

		cursor : {
			zoom:true,
			looseZoom: true,
			showTooltip:true,
			followMouse: true,
			showTooltipOutsideZoom: true,
			constrainOutsideZoom: false},

	};	// options



	let col = header.col;
	for (var i=0; i<header.num_cols; i++)
	{
		var axis_name = 'y';
		if (i>0) axis_name += (i+1);
		axis_name += 'axis';

		options.axes[ axis_name ] = {
			pad: 1.2,
			show: true,
			label: col[i].name,
			showLabel : false,	// the axes are the same as the legend
			min: col[i].min,
			max: col[i].max,
			numberTicks: num_ticks,
		};
		options.series[i] = {
			showMarker: 0,
			showLine: 1,
			label: col[i].name,
			shadow : false,
			lineWidth: 2,
		};
	}

	// scale the values to the 0th axis

	if (header.num_cols > 1)
	{
		var global_min = col[0].min;
		var global_max = col[0].max;
		var global_range = global_max - global_min;

		for (var i=1; i<header.num_cols; i++)
		{
			var min = col[i].min;
			var max = col[i].max;
			var range = max - min;
			var series = data[i];
			for (var j=0; j<series.length; j++)
			{
				var rec = series[j];
				var val = rec[1];
				val -= min;
				val /= range;
				val *= global_range;
				val += global_min;
				rec[1] = val;
			}
		}
	}

	var plot = $.jqplot(name + '_chart', data, options);

	// reverse the order of the canvasas so that
	// the most important one (zero=temperature1)
	// is on top.

	for (var i=header.num_cols-1; i>=0; i--)
	{
		plot.moveSeriesToFront(i);
	}
	
	// add a click handler to the enhancedLegendRenderer
	// legend swatches so that when a series is made
	// visible it is moved to the top, so toggling
	// them on and off effectively lets the user set
	// the z-order ..

	// Note that this is NOT MULTI INSTANCE and
	// WILL NOT WORK with multiple charts on one page!
	
	var i=0;
	$('td.jqplot-table-legend-swatch').each(function(){
		$(this).bind('click',{index:i},function(ev){
			var index = ev.data.index;
			// alert("toggle " + index);
			plot.moveSeriesToFront(index);
		});
		i++;
	});

	// remember the plot

	charts[name].plot = plot;

	// set refresh timer if appropriate

	var refresh = document.getElementById(name + '_refresh_interval');
	if (refresh && refresh.value > 0)
	 	charts[name].timer = setTimeout(
			function () {
				if (data.length>0 && header.incremental_update)
					get_updated_chart_data(name);
				else
					get_chart_data(name);
			},refresh.value * 1000);

	// enable the Update button

	document.getElementById(name + "_update_button").disabled = false;
}




function getTypedValue(view,offset,typ)
{
	let val;
	if (typ == 'float')
		val = view.getFloat32(offset, true);
	else if (typ == 'temperature_t')
	{
		val = view.getFloat32(offset, true);
		if (DEGREE_TYPE)
			val = centigradeToFarenheit(val);
	}
	else if (typ == 'int32_t')
		val = view.getInt32(offset, true);
	else
		val = view.getUint32(offset, true);
	return val;
}



function dataToRecs(name, abuffer)
{
    const view = new DataView(abuffer);
	let bytes = view.byteLength;
	var recs = [];
	if (bytes > 0)
	{
		console.log("dataToRecs() received " + bytes + " bytes");
		var header = charts[name].header;
		var rec_size = 4*(header.num_cols+1);
		let num_recs = bytes / rec_size;
		if (bytes % rec_size)
		{
			console.log("WARNING: NON-INTEGRAL NUMBER OF CHART DATA RECORDS");
			return;
		}
		var offset = 0;
		var col = header.col;
		for (var i=0; i<num_recs; i++)
		{
			var rec = [];
			rec.push(view.getUint32(offset, true));
			offset += 4;
			for (var j=0; j<header.num_cols; j++)
			{
				rec.push(getTypedValue(view,offset,col[j].type));
				offset += 4;
			}
			recs.push(rec);
		}
	}
	else
	{
		console.log("WARNING: empty reply in dataToRecs()");
	}
	console.log("dataToRecs() returning " + recs.length  + " records");
	return recs;
}


function create_chart_data(name, abuffer)
{
	let recs = dataToRecs(name, abuffer);
	if (!recs) return;
	charts[name].recs = recs;
	create_chart(name);
}


function update_chart_data(name, abuffer)
{
	let recs = dataToRecs(name, abuffer);
	if (recs)
	{
		let old_recs = charts[name].recs;
		console.log("update_chart_data() num old_recs=" + old_recs.length);
		for (let i=0; i<recs.length; i++)
		{
			old_recs.push(recs[i]);
		}
		console.log("update_chart_data() num new chart[name].recs = " + charts[name].recs.length);
		create_chart(name);
	}
}


function get_chart_data(name)
{
	console.log("get_chart_data(" + name + ")");
	document.getElementById(name + "_update_button").disabled = true;
	var ele = document.getElementById(name + "_chart_period");
	var secs = ele ? ele.value : 0;
	var xhr = new XMLHttpRequest();
	xhr.open('GET','/custom/chart_data/' + name +
		"?secs=" + secs +
		"&uuid=" + device_uuid, true);
	xhr.responseType = 'arraybuffer';
	xhr.onload = function(e)
	{
		create_chart_data(name, this.response);
	};
	xhr.send();
}


function get_updated_chart_data(name)
	// an auto-update gets the records SINCE
	// and the data MUST contain at least one record
{
	let recs = charts[name].recs;
	var dt = recs[recs.length-1][0];
	console.log("get_updated_chart_data() since=" + dt);
	document.getElementById(name + "_update_button").disabled = true;

	var xhr = new XMLHttpRequest();
	xhr.open('GET','/custom/update_chart_data/' + name +
		"?since=" + dt +
		"&uuid=" + device_uuid, true);
	xhr.responseType = 'arraybuffer';
	xhr.onload = function(e)
	{
		update_chart_data(name, this.response);
	};
	xhr.send();
}


function get_chart_header(name)
	// get the chart_header and chain to get_chart_data
{
	console.log("get_chart_header(" + name + ")");
	var xhr_init = new XMLHttpRequest();
	xhr_init.onreadystatechange = function()
	{
		if (this.readyState == 4 && this.status == 200)
		{
			charts[name] = {};
			charts[name].header = JSON.parse(this.responseText);
			get_chart_data(name);
		}
    }
	xhr_init.open('GET','/custom/chart_header/' + name +
		"?uuid=" + device_uuid,true);
	xhr_init.send();
}


function doChart(name)
{
	console.log('doChart(' + name + ') called');
	stopChart(name);
	$.jqplot.config.enablePlugins = true;
	setChartElementSize(name);
	if (!charts[name])
	{
		get_chart_header(name);
	}
	else
	{
		get_chart_data(name);
	}
}


function stopChart(name)
	// stopChart() is called when the Widget tab is de-activated and also
	// at the top of get_chart_data() when we start loading new data
	// to turn off any existing pending timer for the chart.
{
	document.getElementById(name + "_update_button").disabled = true;
	if (charts[name] && charts[name].timer)
	{
		clearTimeout(charts[name].timer);
		delete charts[name].timer;
	}
}


