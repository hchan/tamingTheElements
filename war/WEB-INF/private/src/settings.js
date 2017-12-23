Settings = {
	defaultDifficulty : 0.66,
	difficultyEnum : function () {
		return {
			"Easy" : 0.25,
			"Casual" : this.defaultDifficulty,
			"Normal" : 0.85,
			"Hard" : 1.12,
			"WTF (Way Too Fun)" : 1.5	
		};
	},
	defaultGarrisonSortOrder : 1,
	garrisonSortOrderEnum : function() {
		return {
			"Experience, Name, Elemental Type" : this.defaultGarrisonSortOrder,
			"Name, Experience, Elemental Type" : 2,
			"Elemental Type, Experience, Name" : 3
		};
	},
	defaultDisplaySettings : 1.25,	
	displaySettingsEnum : function () {
		return {
			"Smallest" : 1,
			"Smaller" : 1.1,
			"Medium" : this.defaultDisplaySettings,
			"Large" : 1.4,
			"Largest" : 1.6
		};
	},
	
	createRadioButtons : function (containerId, settingsEnum) {
		$("#" + containerId).html("");
		var name = containerId.replace("RadioContainer", "");
		for (var key in settingsEnum) {
			var inputJqueryObj = $("<input/>");
			inputJqueryObj.attr("type", "radio");			
			inputJqueryObj.attr("name", name);
			inputJqueryObj.attr("value", settingsEnum[key]);
			
			$("#" + containerId).append(inputJqueryObj);
			$("#" + containerId).append(key);
			$("#" + containerId).append("<br/>");			
		}
		var gameState = GamePersist.getGameState();
		$("#settings input[name='" + name + "']").each(function () {
			if ($(this).val() == gameState[name]) {
				$(this).attr('checked', 'checked');
			}
		});		
	},
	
	save : function() {			
		var date = new Date();
		var gameState = GamePersist.getGameState();
		gameState.difficulty = $("#settings input[name='difficulty']:checked").val();
		gameState.garrisonSortOrder = $("#settings input[name='garrisonSortOrder']:checked").val();
		gameState.displaySettings = $("#settings input[name='displaySettings']:checked").val();
		gameState.lastModifiedTime = date.getTime();
		GamePersist.saveGameState(gameState);				
		Settings.updateBodyZoom();
	},
	
	updateBodyZoom : function() {			
		var gameState = GamePersist.getGameState();
		scale = gameState.displaySettings;
		$("body").css(Settings.getZoomCss(scale));
		
		window.innerWidth /= scale;
		window.innerHeight /= scale;
		
		var bodyWidth = window.innerWidth-20;//$("body").css("width").replace("px","");
		bodyWidth /= scale;
	
	
		var bodyHeight = window.innerHeight-20;//$("body").css("height").replace("px","");
		bodyHeight /= scale;
	
		$("body").css("width", bodyWidth + "px");
		$("body").css("height", bodyHeight + "px");
		
		
		
			//$("body").css("height", bodyHeight + "px");
		
		
	
//		setTimeout(function(){
//			$("body").css("width", bodyWidth + "px");
//			$("body").css("height", bodyHeight + "px");
//			}, 3000);
		//$("#mainMenuTable").css(Settings.getZoomCss(scale));
		
	},
	
	getZoomCss : function(scale) {
		return {
			zoom: scale, /* IE */
			"-moz-transform": "scale(" + scale + ")", /* Firefox */
			"-moz-transform-origin": "0 0",
			"-o-transform": "scale(" + scale + ")", /* Opera */
			"-o-transform-origin": "0 0",
			"-webkit-transform": "scale(" + scale + ")", /* Safari And Chrome */
			"-webkit-transform-origin": "0 0",
			"transform": "scale(" + scale + ")", /* Standard Property */
			"transform-origin": "0 0"  /* Standard Property */			
		};
	},
	
};