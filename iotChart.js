// iotChart.js

var chart = {};
var defaultSeriesColors = [
    "#4bb2c5", "#EAA228", "#c5b47f", "#579575",
    "#839557", "#958c12", "#953579", "#4b5de4",
    "#d8b83f", "#ff5800", "#0085cc", "#c747a3",
    "#cddf54", "#FBD178", "#26B4E3", "#bd70c7"
];


function centigradeToFarenheit(centigrade)
{
	var farenheit = (centigrade*9)/5 + 32;
	return parseFloat(farenheit.toFixed(3));
}


function disableOne(id,disable)
{
	let ele = document.getElementById(id);
	if (ele) ele.disabled = disable;
}


function disableControls(disable)
{
	disableOne("_update_button",disable);
	disableOne("_chart_period",disable);
	disableOne("_refresh_interval",disable);
	disableOne("_degree_type",disable);
}


function setChartElementSize()
{
	let ele = document.getElementById("_chart");
    if (ele)
	{
		let width = window.innerWidth;
		let height = window.innerHeight;
		let client_width = width - 30;
		let client_height = height;
		ele.style.height = (client_height - 40) + "px";	// minus controls
		ele.style.width = client_width + "px";
	}
}


function onChartResize()
{
	setChartElementSize();
	if (chart.plot)
		create_chart();
}


//-------------------------------
// plot creation
//-------------------------------

function determineNumTicks()
{
    const header = chart.header;
    let max_spaces = 0;

    // FIRST PASS: snap mins to interval multiples and compute spaces

    for (let i = 0; i < header.num_cols; i++)
    {
        const col = header.col[i];
        const interval = col.tick_interval;

        const low_step  = Math.floor(col.min / interval);
        const high_step = Math.ceil(col.max / interval);

        const snapped_min = low_step * interval;
        const spaces = high_step - low_step;

        col.min = snapped_min;

        if (spaces > max_spaces)
            max_spaces = spaces;
    }

    // SECOND PASS: assign max for all columns to use same number of spaces

    for (let i = 0; i < header.num_cols; i++)
    {
        let col = header.col[i];
        let interval = col.tick_interval;

        col.max = col.min + (max_spaces * interval);
    }

    // numberTicks is spaces + 1 (gridlines/labels count)

    const number_ticks = max_spaces + 1;
    console.log("determineNumTicks() returning " + number_ticks);
    for (let j = 0; j < header.num_cols; j++)
    {
        console.log("   col[" + j +
			"]  min=" + header.col[j].min +
            "  max=" + header.col[j].max);
    }


	// new: store full-chart tick count when not zoomed
	if (!chart.is_zoomed)
	{
		chart.full_num_ticks = number_ticks;
		chart.full_spaces = max_spaces;
	}

    return number_ticks;
}


function getSeriesData()
{
	let ele = document.getElementById('_degree_type');
	let is_faren = ele ? parseInt(ele.value) : 0;

	let header = chart.header;
	let col = header.col;
	let data = [];

	// initialize arrays and min/max

	for (var i = 0; i < header.num_cols; i++)
	{
		data[i] = [];
		col[i].min = null;
		col[i].max = null;
	}

	// FIRST PASS: build full data arrays and compute min/max

	let recs = chart.recs;
	for (let i = 0; i < recs.length; i++)
	{
		let rec = recs[i];
		let dt = rec[0];

		for (let j = 0; j < header.num_cols; j++)
		{
			let val = rec[j+1];

			if (is_faren && col[j].type == "temperature_t")
				val = centigradeToFarenheit(val);

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

			data[j].push([dt * 1000, val]);
		}
	}

	console.log("getSeriesData() built full dataset " + recs.length + "*" + data.length);
	for (let j = 0; j < header.num_cols; j++)
	{
		console.log("   full col[" + j + "]  min=" + col[j].min + "  max=" + col[j].max);
	}

	// SECOND PASS: apply zoom window filter if present

	if (chart.is_zoomed && chart.zoom_window)
	{
		let zw = chart.zoom_window;

		let filtered_data = [];
		let filtered_min = [];
		let filtered_max = [];

		for (let j = 0; j < header.num_cols; j++)
		{
			filtered_data[j] = [];
			filtered_min[j] = null;
			filtered_max[j] = null;
		}

		for (let j = 0; j < header.num_cols; j++)
		{
			let series = data[j];

			for (let k = 0; k < series.length; k++)
			{
				let x = series[k][0];
				let y = series[k][1];

				// in essence we are only zooming on the x axis and
				// will redraw the whole chart for that range.
				
				if (x >= zw.x_min && x <= zw.x_max)	// &&
					// y >= zw.y_min[j] && y <= zw.y_max[j])
				{
					filtered_data[j].push([x, y]);

					if (filtered_min[j] == null)
					{
						filtered_min[j] = y;
						filtered_max[j] = y;
					}
					else
					{
						if (y < filtered_min[j]) filtered_min[j] = y;
						if (y > filtered_max[j]) filtered_max[j] = y;
					}
				}
			}
		}

		// replace original data and min/max with filtered versions

		data = filtered_data;
		for (let j = 0; j < header.num_cols; j++)
		{
			col[j].min = filtered_min[j];
			col[j].max = filtered_max[j];
		}

		console.log("getSeriesData() applied zoom filter");
		for (let j = 0; j < header.num_cols; j++)
		{
			console.log("   zoom col[" + j + "]  min=" + col[j].min + "  max=" + col[j].max);
		}
	}

	return data;
}



function create_chart()
{
    // Destroy the previous jqPlot object

    let zoom_window = null;
    if (chart.plot)
    {
        // Capture the zoom window before destroying the plot

        if (chart.is_zoomed)
        {
            zoom_window = {
                x_min : chart.plot.axes.xaxis.min,
                x_max : chart.plot.axes.xaxis.max,
                y_min : [],
                y_max : []
            };

            for (let i = 0; i < chart.header.num_cols; i++)
            {
                let axis_name = (i === 0 ? 'yaxis' : ('y' + (i+1) + 'axis'));
                zoom_window.y_min[i] = chart.plot.axes[axis_name].min;
                zoom_window.y_max[i] = chart.plot.axes[axis_name].max;
            }

            chart.zoom_window = zoom_window;
        }

        chart.plot.destroy();
        delete chart.plot;
    }

    // build the series data, num_ticks, colors and
    // create the options

    let data = getSeriesData();
    let header = chart.header;
    let series_colors = header.series_colors || defaultSeriesColors;

    let num_ticks = chart.is_zoomed ? chart.full_num_ticks : determineNumTicks();
		// new: reuse full tick count during zoom
		// old: always recomputed ticks

    let options = {

        title: header.name,
        seriesDefaults: {
            showMarker : false
        },

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
        },  // axes

        seriesColors: series_colors,

        cursor : {
            zoom:true,
            looseZoom: true,
            showTooltip:true,
            followMouse: true,
            showTooltipOutsideZoom: true,
            constrainOutsideZoom: false
        },

    };  // options

    // fixup the axes according to my styling preferences

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
            showLabel : false,   // the axes are the same as the legend

            min: chart.is_zoomed ? chart.zoom_window.y_min[i] : col[i].min,   // new
            max: chart.is_zoomed ? chart.zoom_window.y_max[i] : col[i].max,   // new
            // old: min: col[i].min,
            // old: max: col[i].max,

            tickInterval: col[i].tick_interval,
            // numberTicks: num_ticks   // optional
        };

        options.series[i] = {
            showMarker: 0,
            showLine: 1,
            label: col[i].name,
            shadow : false,
            lineWidth: 2,
            yaxis: (i === 0 ? 'yaxis' : ('y' + (i+1) + 'axis'))
        };
    }

    // DO THE PLOT

    var plot = $.jqplot('_chart', data, options);
    chart.plot = plot;

    // reverse the order of the canvases so that
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

    $('td.jqplot-table-legend-swatch')
        .off('click')
        .each(function(i)
        {
            $(this).on('click', { index: i }, function(ev)
            {
                var index = ev.data.index;
                plot.moveSeriesToFront(index);
            });
        });

    // set refresh timer if appropriate

    setRefreshTimer();

    // enable the controls

    disableControls(false);

    // unbind/bind jqplot zoom handlers

    chart.draw_full_chart = false;

    $('#_chart')
        .off('jqplotZoom')
        .on('jqplotZoom', function(ev, gridpos, datapos, plot, cursor)
        {
            chart.is_zoomed = true;

			// gridpos.x and gridpos.y are the grid relative positions of the end of the zoom
			// datapos.x is relative to my single datetime axis; datapos.y is relative to the 0th y axis
			// at this point we can also get the grid relative pixel starting position from cursor.zoomStart.x and y
			// The padding around the grid is given by plot._gridPadding.left, .top, .bottom, and .right
			// Plot._plotDimensions gives the .width and .height of the outer plot area, so the grid rectangle
			// can be calculated with x=pad.left, y=pad.top, w=dim.width-pad.left-pad.right, and h=dim.height-pad.top-pad.bottom
			// DOM relative coordinates can be calculated with
			//		var offset = $('#_chart').offset();   // page coordinates of the plot container
			//		var globalX = offset.left + gridpos.x + plot._gridPadding.left;
			//		var globalY = offset.top  + gridpos.y + plot._gridPadding.top;
			// and viewport relative coordinates with
			//		var viewportX = globalX - window.scrollX;
			//		var viewportY = globalY - window.scrollY;

            chart.zoom_window = {
                x_min : plot.axes.xaxis.min,
                x_max : plot.axes.xaxis.max,
                y_min : [],
                y_max : []
            };

            for (let i = 0; i < header.num_cols; i++)
            {
                let axis_name = (i === 0 ? 'yaxis' : 'y' + (i+1) + 'axis');
                chart.zoom_window.y_min[i] = plot.axes[axis_name].min;   // new
                chart.zoom_window.y_max[i] = plot.axes[axis_name].max;   // new
            }
        });

    $('#_chart')
        .off('jqplotResetZoom')
        .on('jqplotResetZoom', function(ev, plot)
        {
            chart.is_zoomed = false;
            create_chart();
        });

}   // create_chart()





function setRefreshTimer()
{
    let refresh = document.getElementById('_refresh_interval');
	if (chart.timer)
	{
		console.log('clearing old timer');
		clearTimeout(chart.timer);
		delete chart.timer;
	}
	if (chart && chart.plot)
	{
	    let interval = refresh ? parseInt(refresh.value, 10) : 0;
		if (interval > 0)
		{
			console.log("setting refresh(" + (chart.max_dt?"get_updated_chart_data":"get_chart_data") + ") timer");
			chart.timer = chart.max_dt ?
				setTimeout(get_updated_chart_data, interval * 1000) :
				setTimeout(get_chart_data, interval * 1000);
		}
	}
	else
	{
		refresh.value = 0;
	}
}


//--------------------------
// UI event handlers
//--------------------------
// These methods can only be called after a plot
// has been created at least once.  Any UI interaction
// through a control sets draw_full_chart = true;

function stopTimer()
{
	if (chart.timer)
	{
		clearTimeout(chart.timer);
		delete chart.timer;
	}
}


function onPeriodChanged()
{
    console.log('onPeriodChanged()');
	stopTimer();
	get_chart_data();
}



function onUpdate()
{
    console.log('onUpdate()');
	stopTimer();
		
	// if we've previously plotted this number of seconds
	// and there was at least one value as given by max_dt
	// then do an update instead of getting all the data
	// when the user presses the update button.

	let secs = getChartSecs();
	if (chart.secs &&
		chart.secs == secs &&
		chart.max_dt)
	{
		get_updated_chart_data();
	}
	else
	{
		get_chart_data();
	}

}


function onRefreshChanged()
{
    console.log('onRefreshChanged()');
	stopTimer();
	disableControls(true);
	create_chart();
}


function onDegreesChanged()
{
    console.log('onDegreesChanged()');
	stopTimer();
	disableControls(true);
	create_chart();
}


//----------------------------------
// data handling
//----------------------------------

function getTypedValue(view,offset,typ)
{
	let val;
	if (typ == 'float')
		val = view.getFloat32(offset, true);
	else if (typ == 'temperature_t')
		val = view.getFloat32(offset, true);
	else if (typ == 'int32_t')
		val = view.getInt32(offset, true);
	else
		val = view.getUint32(offset, true);
	return val;
}


function dataToRecs(abuffer)
{
    const view = new DataView(abuffer);
	let bytes = view.byteLength;
	var recs = [];
    let max_dt = chart.max_dt || 0;

	if (bytes > 0)
	{
		console.log("dataToRecs() received " + bytes + " bytes");
		var header = chart.header;
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
			if (rec[0] > max_dt) max_dt = rec[0];
		}
	}
	else
	{
		console.log("WARNING: empty reply in dataToRecs()");
	}
	console.log("dataToRecs() returning " + recs.length  + " records; max_dt=" + max_dt);
	chart.max_dt = max_dt;
	return recs;
}


function create_chart_data(abuffer)
{
	let recs = dataToRecs(abuffer);
	if (!recs) return;
	chart.recs = recs;
	create_chart();
}


function update_chart_data(abuffer)
{
	let recs = dataToRecs(abuffer);
	if (recs)
	{
		let old_recs = chart.recs;
		console.log("update_chart_data() num old_recs=" + old_recs.length);
		for (let i=0; i<recs.length; i++)
		{
			old_recs.push(recs[i]);
		}
		console.log("update_chart_data() num new recs= " + chart.recs.length);
		create_chart();
	}
}


function getChartSecs()
{
	var ele = document.getElementById("_chart_period");
	return ele ? ele.value : 0;
}

function get_chart_data()
{
	console.log("get_chart_data()");
	disableControls(true);
	delete chart.max_dt;
		// reset max_dt when getting all records
	let secs = getChartSecs();
	chart.secs = secs;
	
	var xhr = new XMLHttpRequest();
	xhr.open('GET','/custom/chart_data' +
		"?secs=" + secs +
		"&uuid=" + device_uuid, true);
	xhr.responseType = 'arraybuffer';
	xhr.onload = function(e)
	{
		create_chart_data(this.response);
	};
	xhr.send();
}


function get_updated_chart_data()
{
	let recs = chart.recs;
	let max_dt = chart.max_dt;
	console.log("get_updated_chart_data() since=" + max_dt);
	disableControls(true);	

	var xhr = new XMLHttpRequest();
	xhr.open('GET','/custom/update_chart_data' +
		"?since=" + max_dt +
		"&uuid=" + device_uuid, true);
	xhr.responseType = 'arraybuffer';
	xhr.onload = function(e)
	{
		update_chart_data(this.response);
	};
	xhr.send();
}


//----------------------------------
// initialization
//----------------------------------

function get_chart_header()
{
	console.log("get_chart_header()");
	var xhr_init = new XMLHttpRequest();
	xhr_init.onreadystatechange = function()
	{
		if (this.readyState == 4 && this.status == 200)
		{
			chart = {};
			let header = JSON.parse(this.responseText);
			chart.header = header;
			document.title = header.name + " Chart";
			if (header.with_degrees)
				$('.degree_hidden').removeClass('degree_hidden');
			document.getElementById('_chart_period').value =
				header.default_period;
			get_chart_data();
		}
    }
	xhr_init.open('GET','/custom/chart_header' +
		"?uuid=" + device_uuid,true);
	xhr_init.send();
}


function beginChart()
	// called only when initial chart html is loaded
{
	console.log('beginChart() called');
	$.jqplot.config.enablePlugins = true;
	disableControls(true);
	setChartElementSize();
	get_chart_header();
}




