$(function()
{
	// Theme toggle
	function initTheme() {
		const savedTheme = localStorage.getItem('theme') || 'light';
		applyTheme(savedTheme);
	}

	function applyTheme(theme) {
		if (theme === 'dark') {
			document.body.classList.add('dark-mode');
			$('#theme-icon').text('☀️');
			localStorage.setItem('theme', 'dark');
		} else {
			document.body.classList.remove('dark-mode');
			$('#theme-icon').text('🌙');
			localStorage.setItem('theme', 'light');
		}
	}

	$('#theme-toggle').click(function() {
		const isDark = document.body.classList.contains('dark-mode');
		applyTheme(isDark ? 'light' : 'dark');
	});

	$('#help-toggle').click(function() {
		$('#help-modal').addClass('active');
	});

	$('#help-close').click(function() {
		$('#help-modal').removeClass('active');
	});

	$('#help-modal').click(function(e) {
		if (e.target === this) {
			$(this).removeClass('active');
		}
	});

	$(document).on('change', '#minimized-connections-select', function() {
		const selectedId = $(this).val();
		if (selectedId) {
			const connection = minimizedConnections.find(conn => conn.id === selectedId);
			if (connection) {
				$('#' + selectedId).dialog('open');
				minimizedConnections = minimizedConnections.filter(conn => conn.id !== selectedId);
				updateMinimizedConnectionsSelect();
			}
			$(this).val('');
		}
	});

	const latest_version = "6.1.BETA26";
	let version = latest_version;
	
	let minimizedConnections = [];

	function updateMinimizedConnectionsSelect() {
		const select = document.getElementById('minimized-connections-select');
		
		const currentVersionConnections = minimizedConnections.filter(conn => conn.version === version);
		
		if (currentVersionConnections.length === 0) {
			select.style.display = 'none';
			select.innerHTML = '<option value="">Restore Connection...</option>';
			return;
		}
		
		select.style.display = 'block';
		select.innerHTML = '<option value="">Restore Connection...</option>';
		
		currentVersionConnections.forEach(function(connection) {
			const option = document.createElement('option');
			option.value = connection.id;
			option.textContent = connection.title.replace(' &rarr; ', ' → ').replace(/<[^>]*>/g, '');
			select.appendChild(option);
		});
	}

	function isAddonAvailableForVersion(addonKey, selectedVersion) {
		const addon = addon_dictionary[addonKey];
		if (!addon || !addon.tcversions) return true; 
		
		const majorVersion = selectedVersion.split('.')[0];
		return addon.tcversions.includes(majorVersion);
	}

	// Preferences
	function loadPreferences() {
		const savedVersion = localStorage.getItem('selectedVersion');
		const savedFromAspect = localStorage.getItem('fromAspect');
		const savedToAspect = localStorage.getItem('toAspect');
		const hiddenAddons = localStorage.getItem('hiddenAddons');

		if (savedVersion) version = savedVersion;
		if (savedFromAspect) document.getElementById('fromSel').value = savedFromAspect;
		if (savedToAspect) document.getElementById('toSel').value = savedToAspect;

		return {
			version: savedVersion,
			fromAspect: savedFromAspect,
			toAspect: savedToAspect,
			aspects: [],
			addons: [],
			hiddenAddons: hiddenAddons ? JSON.parse(hiddenAddons) : []
		};
	}

	initTheme();
	const preferences = loadPreferences();
	$.each(version_dictionary, function(key, version){
		$("#version").append("<option value=" + key + ">" + key + "</option>");
	});
	let aspects = [];
	let addon_aspects;
	let default_aspects = [];
	let tier_aspects = [];
	let combinations = {};
	let addon_aspect_map = {};
	let unavailableAspects = new Set();
	$("#version").val(preferences.version || latest_version);
	version = preferences.version || latest_version;
	let graph = {};

	function connect(aspect1, aspect2)
	{
		function addConnection(from, to)
		{
			if(!(from in graph))
				graph[from] = [];
			graph[from].push(to);
		}
		addConnection(aspect1, aspect2);
		addConnection(aspect2, aspect1);
	}

	function aspectSort(a, b)
	{
		return (a == b) ? 0 : (translate[a]<translate[b]) ? -1 : 1;
	}

	function ddDataSort(a, b)
	{
		return (a.text == b.text) ? 0 : (a.text<b.text) ? -1 : 1;
	}

	function find(from, to, steps)
	{
		function search(queue, to, visited)
		{
			let iterations = 0;
			const MAX_ITERATIONS = 100000;
			const MAX_PATH_LENGTH = 50;
			
			while (!queue.isEmpty() && iterations < MAX_ITERATIONS) {
				iterations++;
				const element = queue.dequeue();
				let node = element.path.pop();
				
				if (element.path.length > MAX_PATH_LENGTH) {
					continue;
				}
				
				if(!(node in visited) || visited[node].indexOf(element.path.length) < 0)
				{
					element.path.push(node);
					if(node == to && element.path.length > steps + 1)
						return element.path;

					graph[node].forEach(function(entry) {
						if (unavailableAspects.has(entry) && entry !== to) {
							return;
						}
						const newpath = element.path.slice();
						newpath.push(entry);
						queue.enqueue({"path":newpath,"length":element.length+getWeight(entry)});
					});

					if(!(node in visited))
						visited[node] = [];

					visited[node].push(element.path.length-1);
				}
			}
			return null;
		}

		const queue = new buckets.PriorityQueue(function(a,b) {return b.length-a.length;});
		queue.enqueue({"path":[from],"length":0});
		let visited = {};
		return search(queue, to, visited);
	}

	function push_addons(aspects, combinations)
	{
		addon_aspects = [];
		addon_aspect_map = {};
		let hasAddons = false;
		
		const currentHiddenAddons = localStorage.getItem('hiddenAddons') ? JSON.parse(localStorage.getItem('hiddenAddons')) : [];
		
		$.each(addon_dictionary, function(key, addon_info){
			if (isAddonAvailableForVersion(key, version)) {
				hasAddons = true;
				const isHidden = currentHiddenAddons.includes(key);
				const $btn = $('<button type="button" class="addon-toggle' + (isHidden ? ' hidden-addon' : '') + '" id="'+key+'">'+addon_info["name"]+'</button>');
				$("#addons").append($btn);
				
				addon_aspects_for_addon = [];
				
				$.each(addon_info["aspects"], function(number, aspect){
					addon_aspects.push(aspect);
					addon_aspects_for_addon.push(aspect);
				});
				
				addon_aspect_map[key] = addon_aspects_for_addon;
				
				$.each(addon_info["combinations"], function(combination_name, combination){
					combinations[combination_name]=combination;
				});
			}
		});
		
		// Show or hide addons card based on availability
		if (hasAddons) {
			$("#addons-card").show();
		} else {
			$("#addons-card").hide();
		}
		
		addon_aspects = addon_aspects.sort(aspectSort);
		$.each(addon_aspects, function(number, aspect){
			aspects.push(aspect);
		});
	}

	function toggle(obj)
	{
		$(obj).find("img").attr("src", function(i,orig){ return (orig.indexOf("color") < 0) ? orig.replace(/mono/, "color") : orig.replace(/color/, "mono"); });
		$(obj).toggleClass("unavail");
		const aspect = $(obj).attr('data-aspect');
		if ($(obj).hasClass('unavail')) {
			unavailableAspects.add(aspect);
		} else {
			unavailableAspects.delete(aspect);
		}
	}

	function toggle_addons(aspect_list)
	{
		aspect_list.forEach(function(e){
			const obj = $('[data-aspect="'+e+'"]');
			obj.find("img").attr("src", function(i, orig){ return orig.replace(/color/, "mono"); });
			obj.addClass("unavail");
			unavailableAspects.add(e);
		});
	}

	function option(value, text)
	{
		const option = document.createElement("option");
		option.value = value;
		option.textContent = text;
		return option;
	}
	
	function formatAspectName(string)
	{
		return string.charAt(0).toUpperCase() + string.slice(1);
	}

	const fromSel = document.getElementById("fromSel");
	const toSel = document.getElementById("toSel");
	const check = document.getElementById("available");
	const steps = $("#spinner").spinner({min: 1, max: 10, buttons: false});
	reset_aspects();
	
	const savedAspects = localStorage.getItem('selectedAspects_' + version);
	const savedAddons = localStorage.getItem('activeAddons_' + version);
	if (savedAspects) {
		restoreState(JSON.parse(savedAspects), savedAddons ? JSON.parse(savedAddons) : []);
	}

	$("#find_connection").click(function(){
		run();
	});

	$(document).on("click", ".addon-toggle", function() {
		const addon = $(this).attr("id");
		
		if ($(this).hasClass('hidden-addon')) {
			return;
		}
		
		if (!isAddonAvailableForVersion(addon, version)) {
			return;
		}
		
		$(this).toggleClass("active");
		
		if($(this).hasClass("active"))
		{
			addon_dictionary[addon]["aspects"].forEach(function(e){
				const obj = $('[data-aspect="'+e+'"]');
				obj.find("img").attr("src", function(i,orig){ return orig.replace(/mono/, "color"); });
				obj.removeClass("unavail");
				unavailableAspects.delete(e);
			});
		}
		else
		{
			addon_dictionary[addon]["aspects"].forEach(function(e){
				const obj = $('[data-aspect="'+e+'"]');
				obj.find("img").attr("src", function(i,orig){ return orig.replace(/color/, "mono"); });
				obj.addClass("unavail");
				unavailableAspects.add(e);
			});
		}
		saveState();
	});

	document.addEventListener('contextmenu', function(e) {
		const $target = $(e.target).closest('.addon-toggle');
		if ($target.length === 0) return;
		
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
		
		const addon = $target.attr("id");
		const hiddenAddons = localStorage.getItem('hiddenAddons') ? JSON.parse(localStorage.getItem('hiddenAddons')) : [];
		
		if (hiddenAddons.includes(addon)) {
			hiddenAddons.splice(hiddenAddons.indexOf(addon), 1);
			$target.removeClass('hidden-addon');
			$target.removeClass('active');
			const addonAspects = addon_aspect_map[addon];
			if (addonAspects) {
				const addonName = addon_dictionary[addon].name;
				let addonHtml = '<div class="aspects-group" data-addon="' + addon + '">';
				addonHtml += '<h6 class="aspects-group-title">' + addonName + ' (' + addonAspects.length + ')</h6>';
				addonHtml += '<ul id="avail_addon_' + addon + '" class="aspectlist aspect-grid mb-0">';
				addonAspects.forEach(function(aspect) {
					addonHtml += '<li class="aspect unavail" data-aspect="'+aspect+'"><img src="aspects/mono/' + translate[aspect] + '.png" /><div>' + formatAspectName(translate[aspect]) + '</div><div class="desc">' + aspect + '</div></li>';
					unavailableAspects.add(aspect);
				});
				addonHtml += '</ul></div>';
				
				let inserted = false;
				const addonKeys = Object.keys(addon_aspect_map);
				const currentAddonIndex = addonKeys.indexOf(addon);
				
				for (let i = currentAddonIndex + 1; i < addonKeys.length; i++) {
					const nextAddonKey = addonKeys[i];
					const $nextAddonGroup = $('[data-addon="' + nextAddonKey + '"]');
					if ($nextAddonGroup.length > 0) {
						$nextAddonGroup.before(addonHtml);
						inserted = true;
						break;
					}
				}
				
				if (!inserted) {
					$("#aspects-container").append(addonHtml);
				}
			}
		} else {
			hiddenAddons.push(addon);
			$target.addClass('hidden-addon');
			$target.removeClass('active');
			
			const addonAspects = addon_aspect_map[addon];
			if (addonAspects) {
				addonAspects.forEach(function(aspect) {
					unavailableAspects.add(aspect);
				});
			}
			
			$("[data-addon=\"" + addon + "\"]").remove();
		}
		
		localStorage.setItem('hiddenAddons', JSON.stringify(hiddenAddons));
		saveState();
		return false;
	}, true);

	$("#sel_all").click(function(){
		const hiddenAddons = localStorage.getItem('hiddenAddons') ? JSON.parse(localStorage.getItem('hiddenAddons')) : [];
		
		$("#avail_default .aspect").each(function(){
			const aspect = $(this).attr('data-aspect');
			$(this).find("img").attr("src", function(i,orig){ return orig.replace("mono", "color")});
			$(this).removeClass("unavail");
			unavailableAspects.delete(aspect);
		});
		
		$("[id^='avail_addon_'] .aspect").each(function(){
			const addonId = $(this).closest('[id^="avail_addon_"]').attr('id');
			const addonKey = addonId.replace('avail_addon_', '');
			const aspect = $(this).attr('data-aspect');
			
			if (!hiddenAddons.includes(addonKey)) {
				$(this).find("img").attr("src", function(i,orig){ return orig.replace("mono", "color")});
				$(this).removeClass("unavail");
				unavailableAspects.delete(aspect);
			}
		});
		
		$(".addon-toggle").each(function(){
			const addonKey = $(this).attr("id");
			if (!hiddenAddons.includes(addonKey)) {
				$(this).addClass('active');
			}
		});
		saveState();
	});

	$("#def_only").click(function(){
		$(".addon-toggle").removeClass('active');
		$("#avail_default .aspect").each(function(){
			const aspect = $(this).attr('data-aspect');
			$(this).find("img").attr("src", function(i,orig){ return orig.replace("mono", "color")});
			$(this).removeClass("unavail");
			unavailableAspects.delete(aspect);
		});
		$("[id^='avail_addon_'] .aspect").each(function(){
			const aspect = $(this).attr('data-aspect');
			$(this).find("img").attr("src", function(i,orig){ return orig.replace("color", "mono")});
			$(this).addClass("unavail");
			unavailableAspects.add(aspect);
		});
		saveState();
	});

	$("#desel_all").click(function(){
		$("#avail_default .aspect, [id^='avail_addon_'] .aspect").each(function(){
			const aspect = $(this).attr('data-aspect');
			$(this).find("img").attr("src", function(i,orig){ return orig.replace("color", "mono")});
			$(this).addClass("unavail");
			unavailableAspects.add(aspect);
		});
		$(".addon-toggle").removeClass('active');
		saveState();
	});

	$("#version").change(function(){
		version = $("#version").val();
		localStorage.setItem('selectedVersion', version);
		$(".result").each(function() {
			if($(this).hasClass('ui-dialog-content')) {
				$(this).dialog("close");
			}
		});
		
		document.getElementById('fromSel').value = '';
		document.getElementById('toSel').value = '';
		updateAspectDisplay('fromSel');
		updateAspectDisplay('toSel');
		localStorage.removeItem('fromAspect');
		localStorage.removeItem('toAspect');
		
		reset_aspects();
		
		const savedAspects = localStorage.getItem('selectedAspects_' + version);
		const savedAddons = localStorage.getItem('activeAddons_' + version);
		
		if (savedAspects) {
			restoreState(JSON.parse(savedAspects), savedAddons ? JSON.parse(savedAddons) : []);
		} else {
			$("#def_only").click();
		}
		
		updateMinimizedConnectionsSelect();
	});

	$(document).on( "click", "#avail_default .aspect, [id^='avail_addon_'] .aspect", function(){
		toggle(this);
		saveState();
		
		$.each(addon_aspect_map, function(addonKey, addonAspects) {
			let allAspectsEnabled = true;
			addonAspects.forEach(function(aspect) {
				if ($('[data-aspect="' + aspect + '"]').hasClass('unavail')) {
					allAspectsEnabled = false;
				}
			});
			
			const addonButton = $('#' + addonKey + '.addon-toggle');
			if (allAspectsEnabled && addonAspects.length > 0 && !addonButton.hasClass('hidden-addon')) {
				addonButton.addClass('active');
			} else {
				addonButton.removeClass('active');
			}
		});
	});

	const $combinationBox = $("#combination_box");
	
	$(document).on("mouseover", "#avail_default .aspect, [id^='avail_addon_'] .aspect", function(e) {
		const aspect = $(e.target).closest(".aspect").attr("data-aspect");
		
		if(!aspect || aspect === "fire" || aspect === "water" || aspect === "order" || aspect === "air" || aspect === "entropy" || aspect === "earth") {
			$combinationBox.hide();
			return;
		}
		
		const combination = combinations[aspect];
		if(!combination) {
			$combinationBox.hide();
			return;
		}
		
		$("#combination_box #left").html('<img src="aspects/color/' + translate[combination[0]] + '.png" /><div class="name">' + formatAspectName(translate[combination[0]]) + '</div><div class="desc">' + combination[0] + '</div>');
		$("#combination_box #right").html('<img src="aspects/color/' + translate[combination[1]] + '.png" /><div class="name">' + formatAspectName(translate[combination[1]]) + '</div><div class="desc">' + combination[1] + '</div>');
		$("#combination_box #equals").html('<img src="aspects/color/' + translate[aspect] + '.png" /><div class="name">' + formatAspectName(translate[aspect]) + '</div><div class="desc">' + aspect + '</div>');
		const boxWidth = 400;
		$combinationBox.css({left: e.pageX - (boxWidth/2), top: e.pageY - 130}).show();
	});
	
	$(document).on("mouseout", "#avail_default .aspect, [id^='avail_addon_'] .aspect", function(e) {
		$combinationBox.hide();
	});

	$(document).on("mouseover", ".aspect_result", function(e) {
		const aspect = $(e.target).closest(".aspect_result").attr("data-aspect");
		
		if(!aspect) {
			$combinationBox.hide();
			return;
		}
		
		const combination = combinations[aspect];
		if(!combination) {
			$combinationBox.hide();
			return;
		}
		
		$("#combination_box #left").html('<img src="aspects/color/' + translate[combination[0]] + '.png" /><div class="name">' + formatAspectName(translate[combination[0]]) + '</div><div class="desc">' + combination[0] + '</div>');
		$("#combination_box #right").html('<img src="aspects/color/' + translate[combination[1]] + '.png" /><div class="name">' + formatAspectName(translate[combination[1]]) + '</div><div class="desc">' + combination[1] + '</div>');
		$("#combination_box #equals").html('<img src="aspects/color/' + translate[aspect] + '.png" /><div class="name">' + formatAspectName(translate[aspect]) + '</div><div class="desc">' + aspect + '</div>');
		const boxWidth = 400;
		$combinationBox.css({left: e.pageX - (boxWidth/2), top: e.pageY - 130}).show();
	});
	
	$(document).on("mouseout", ".aspect_result", function(e) {
		$combinationBox.hide();
	});

	function reset_aspects()
	{
		unavailableAspects.clear();
		
		aspects = $.extend([], version_dictionary[version]["base_aspects"]);
		combinations = $.extend(true, {}, version_dictionary[version]["combinations"]);
		$("#aspects-container").empty();
		$("#addons").empty();
		
		tier_aspects = [];
		$.each(combinations, function(aspect, value){tier_aspects.push(aspect);});
		tier_aspects = tier_aspects.sort(aspectSort);
		aspects = aspects.concat(tier_aspects);
		
		push_addons(aspects, combinations);
		
		default_aspects = [];
		$.each(version_dictionary[version]["base_aspects"], function(i, asp){
			default_aspects.push(asp);
		});
		$.each(tier_aspects, function(i, asp){
			default_aspects.push(asp);
		});
		
		let defaultHtml = '<div class="aspects-group">';
		defaultHtml += '<h6 class="aspects-group-title">Default (' + default_aspects.length + ')</h6>';
		defaultHtml += '<ul id="avail_default" class="aspectlist aspect-grid mb-0">';
		default_aspects.forEach(function(aspect) {
			defaultHtml += '<li class="aspect" data-aspect="'+aspect+'"><img src="aspects/color/' + translate[aspect] + '.png" /><div>' + formatAspectName(translate[aspect]) + '</div><div class="desc">' + aspect + '</div></li>';
		});
		defaultHtml += '</ul></div>';
		$("#aspects-container").append(defaultHtml);
		
		const currentHiddenAddons = localStorage.getItem('hiddenAddons') ? JSON.parse(localStorage.getItem('hiddenAddons')) : [];
		
		$.each(addon_aspect_map, function(addonKey, addonAspects) {
			if (currentHiddenAddons.includes(addonKey)) {
				return;
			}
			
			const addonName = addon_dictionary[addonKey].name;
			let addonHtml = '<div class="aspects-group" data-addon="' + addonKey + '">';
			addonHtml += '<h6 class="aspects-group-title">' + addonName + ' (' + addonAspects.length + ')</h6>';
			addonHtml += '<ul id="avail_addon_' + addonKey + '" class="aspectlist aspect-grid mb-0">';
			
			addonAspects.forEach(function(aspect) {
				addonHtml += '<li class="aspect" data-aspect="'+aspect+'"><img src="aspects/color/' + translate[aspect] + '.png" /><div>' + formatAspectName(translate[aspect]) + '</div><div class="desc">' + aspect + '</div></li>';
			});
			
			addonHtml += '</ul></div>';
			$("#aspects-container").append(addonHtml);
		});
		
		toggle_addons(addon_aspects);
		
		graph={};
		for(compound in combinations)
		{
			connect(compound, combinations[compound][0]);
			connect(compound, combinations[compound][1]);
		}
	}
	function run()
	{
		const fromSel = document.getElementById("fromSel").value;
		const toSel = document.getElementById("toSel").value;
		const path = find(fromSel, toSel, steps.spinner("value"));
		
		if (!path) {
			alert('No possible connection found within ' + steps.spinner("value") + ' steps.');
			return;
		}
		
		const id = fromSel + 'to' + toSel;
		const step_count = path.length - 2;
		const title = formatAspectName(translate[fromSel])+' &rarr; '+formatAspectName(translate[toSel]) + ' (Total Steps: ' + step_count + ')';
		const aspect_count={};
		$.each(aspects, function(aspect, value){aspect_count[value]=0;});
		$('#' + id).remove();
		$("body").append('<ul id="'+id+'" class="aspectlist result" title="'+title+'"></ul>');
		const dialogWidth = Math.round($(window).width() * 0.8);
		
		$('#' + id).dialog({
			autoOpen: false, 
			modal: false, 
			resizable: false, 
			width: dialogWidth,
			open: function() {
				const titlebar = $(this).siblings('.ui-dialog-titlebar');
				if (titlebar.length > 0 && titlebar.find('.ui-dialog-titlebar-minimize').length === 0) {
					const closeButton = titlebar.find('.ui-dialog-titlebar-close');
					if (closeButton.length > 0) {
						const minimizeButton = $('<button type="button" class="ui-dialog-titlebar-minimize" aria-label="Minimize"></button>');
						minimizeButton.insertBefore(closeButton);
						
						minimizeButton.on('click', function(e) {
							e.preventDefault();
							$('#' + id).dialog('close');
							
						if (!minimizedConnections.some(conn => conn.id === id)) {
							minimizedConnections.push({
								id: id,
								title: title,
								version: version
								});
							}
							
							updateMinimizedConnectionsSelect();
						});
					}
				}
			}
		});
		$('#' + id).append("<div></div>");
		let loop_count=0;
		path.forEach(function(e) {
			loop_count++;
			if(loop_count != 1 && loop_count != path.length)
			{
				aspect_count[e]++;
			}
			$('#'+id).append('<li class="aspect_result aspect" data-aspect="' + e + '"><img src="aspects/color/' + translate[e] + '.png" /><div><div class="name">' + formatAspectName(translate[e]) + '</div><div class="desc">' + e + '</div></div></li>');
			if(loop_count !== path.length) {
				$('#'+id).append('<li style="padding: 0.5rem 0; font-size: 1.5rem; color: #667eea;">↓</li>');
			}
		});
		
		$('#' + id).append('<li id="aspects_used">Aspects Used</li>');
		let used = '<ul id="aspects_used_list">';
		$.each(aspect_count, function(aspect, value){
			if(value > 0) {
				const aspectImg = 'aspects/color/' + translate[aspect] + '.png';
				used += '<li title="' + translate[aspect] + ': ' + value + '" style="background-image:url(\'' + aspectImg + '\')">' + value + '</li>';
			}
		});
		used += '</ul>';
		$('#' + id).append(used);
		$('#' + id).dialog("open");
	}

	// Aspect Selection Popup
	function showAspectPicker(targetField) {
		const modal = document.createElement('div');
		modal.id = 'aspect-picker-modal';
		modal.className = 'aspect-picker-modal';
		
		const backdrop = document.createElement('div');
		backdrop.className = 'aspect-picker-backdrop';
		backdrop.onclick = function() {
			modal.remove();
			backdrop.remove();
		};
		
		const content = document.createElement('div');
		content.className = 'aspect-picker-content';
		
		const header = document.createElement('h5');
		header.textContent = 'Select an Aspect';
		header.style.marginBottom = '1.5rem';
		header.style.fontWeight = '600';
		content.appendChild(header);
		
		// Search input
		const searchInput = document.createElement('input');
		searchInput.type = 'text';
		searchInput.className = 'aspect-picker-search';
		searchInput.placeholder = 'Search aspects...';
		content.appendChild(searchInput);
		
		const grid = document.createElement('div');
		grid.className = 'aspect-picker-grid';
		grid.id = 'aspect-picker-grid';
		
		// Get available aspects
		let availableAspects = [];
		$('#avail_default .aspect, [id^="avail_addon_"] .aspect').each(function() {
			availableAspects.push($(this).attr('data-aspect'));
		});
		
		// Create aspect buttons
		function renderAspects(aspectsToRender) {
			grid.innerHTML = '';
			if (aspectsToRender.length === 0) {
				const noResults = document.createElement('div');
				noResults.style.gridColumn = '1 / -1';
				noResults.style.textAlign = 'center';
				noResults.style.padding = '2rem';
				noResults.style.color = '#999';
				noResults.textContent = 'No aspects found';
				grid.appendChild(noResults);
				return;
			}
			
			aspectsToRender.forEach(function(aspect) {
				const button = document.createElement('div');
				button.className = 'aspect-picker-item';
				button.innerHTML = '<img src="aspects/color/' + translate[aspect] + '.png" /><div class="name">' + formatAspectName(translate[aspect]) + '</div>';
				button.onclick = function() {
					document.getElementById(targetField).value = aspect;
					updateAspectDisplay(targetField);
					backdrop.click();
				};
				grid.appendChild(button);
			});
		}
		
		renderAspects(availableAspects);
		
		// Search functionality
		searchInput.addEventListener('input', function() {
			const query = this.value.toLowerCase();
			const filtered = availableAspects.filter(function(aspect) {
				return translate[aspect].toLowerCase().indexOf(query) >= 0 || aspect.toLowerCase().indexOf(query) >= 0;
			});
			renderAspects(filtered);
		});
		
		content.appendChild(grid);
		modal.appendChild(content);
		document.body.appendChild(modal);
		document.body.appendChild(backdrop);
		backdrop.style.display = 'block';
		searchInput.focus();
	}

	function updateAspectDisplay(fieldId) {
		const value = document.getElementById(fieldId).value;
		const displayId = fieldId + '_display';
		const displayEl = document.getElementById(displayId);
		
		if (value) {
			displayEl.innerHTML = '<img src="aspects/color/' + translate[value] + '.png" style="max-width: 32px; max-height: 32px; margin-right: 0.5rem;" /><span>' + formatAspectName(translate[value]) + '</span>';
			displayEl.classList.remove('text-muted');
			if (fieldId === 'fromSel') {
				localStorage.setItem('fromAspect', value);
			} else if (fieldId === 'toSel') {
				localStorage.setItem('toAspect', value);
			}
		} else {
			displayEl.textContent = 'Select an aspect...';
			displayEl.classList.add('text-muted');
		}
	}

	function saveState() {
		const selectedAspects = [];
		const activeAddons = [];
		const hiddenAddons = localStorage.getItem('hiddenAddons') ? JSON.parse(localStorage.getItem('hiddenAddons')) : [];
		
		$('#avail_default .aspect, [id^="avail_addon_"] .aspect').each(function() {
			if (!$(this).hasClass('unavail')) {
				selectedAspects.push($(this).attr('data-aspect'));
			}
		});
		
		$('.addon-toggle.active').each(function() {
			activeAddons.push($(this).attr('id'));
		});
		
		localStorage.setItem('selectedAspects_' + version, JSON.stringify(selectedAspects));
		localStorage.setItem('activeAddons_' + version, JSON.stringify(activeAddons));
		localStorage.setItem('hiddenAddons', JSON.stringify(hiddenAddons));
	}

	// Restore aspect/addon state from localStorage
	function restoreState(savedAspects, savedAddons) {
		if (!savedAspects) return;
		
		$('#avail_default .aspect, [id^="avail_addon_"] .aspect').each(function() {
			const aspect = $(this).attr('data-aspect');
			if (!savedAspects.includes(aspect)) {
				$(this).find("img").attr("src", function(i,orig){ return orig.replace(/color/, "mono"); });
				$(this).addClass("unavail");
				unavailableAspects.add(aspect);
			} else {
				$(this).find("img").attr("src", function(i,orig){ return orig.replace(/mono/, "color"); });
				$(this).removeClass("unavail");
				unavailableAspects.delete(aspect);
			}
		});
		
		$.each(addon_aspect_map, function(addonKey, addonAspects) {
			let allAspectsEnabled = true;
			addonAspects.forEach(function(aspect) {
				if ($('[data-aspect="' + aspect + '"]').hasClass('unavail')) {
					allAspectsEnabled = false;
				}
			});
			
			const addonButton = $('#' + addonKey + '.addon-toggle');
			if (allAspectsEnabled && addonAspects.length > 0 && !addonButton.hasClass('hidden-addon')) {
				addonButton.addClass('active');
			} else {
				addonButton.removeClass('active');
			}
		});
	}

	// Aspect display click handlers
	$(document).on('click', '#fromSel_display, #toSel_display', function() {
		const fieldId = $(this).attr('id').replace('_display', '');
		showAspectPicker(fieldId);
	});

	function getWeight(aspect)
	{
		return unavailableAspects.has(aspect) ? 100 : 1;
	}
});
