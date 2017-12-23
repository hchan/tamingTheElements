Game = {
	inBeta : true,
	gameName : "Taming the Elements",
	gameVersion : "Version 1.0",
	gameWorldName : "Pria",
	nodeWebKitGui : null,
	characterDisplayWidth : Global.playerCharacter.width,
	characterDisplayHeight : Global.playerCharacter.height,
	backgroundColor : "#FFFFCC",
	borderColor : "#666666",
	borderWidth : 2,
	borderHeight : 2,
	actionBar : null,
	hud_height : Global.playerCharacter.height * 1.25,
	params : null,
	gameScene : null,
	capturableHealthPercentage : 0.25,
	swapCooldown : 5000,
	hiddenCanvas : null,
	lastBoss : 'Eternal Void',
	dummyTarget : 'Dummy',
	
	// The total width of the game screen. Since our grid takes up the entire screen
	//  this is just the width of a tile times the width of the grid
	width: function() {
		//return this.map_grid.width * this.map_grid.tile.width;
		var gameState = GamePersist.getGameState();
		return (window.innerWidth - 20) / gameState.displaySettings;
	},

	// The total height of the game screen. Since our grid takes up the entire screen
	//  this is just the height of a tile times the height of the grid
	height: function() {
		//return this.map_grid.height * this.map_grid.tile.height;
		var gameState = GamePersist.getGameState();
		return (window.innerHeight - 20) / gameState.displaySettings;
	},
	cinematicAnimationHeight : function () {
		return this.height() * 0.8;
	},


	cinematicAnimationWidth : function () {
		return this.width();
	},
	
	
	
	
	// Initialize and start our game
	start: function(params) {
		if (params != null) {
			this.params = params;
		}
		// Start crafty and set a background color so that we can see it's working
		
		Crafty.init(Game.width(), Game.height());
		//GameHelper.setBackgroundDiv();
		
		this.hiddenCanvas = document.createElement("canvas");
		
		$(this.hiddenCanvas).prop("width", Global.actionBarHeight);
		$(this.hiddenCanvas).prop("height", Global.actionBarHeight);
		$(this.hiddenCanvas).hide();
		
		
		document.onkeydown = function keydown(e) {
		    if (!e) e = event;
		    if (Input.is("Toggle Pause", e)) {
			   e.stopPropagation();
			   var state = "Pause";
				 if (Crafty.isPaused() == true) {
					 state = "Unpause";
				 } else {
					 state = "Pause";
				 }
				
				Global.Alert.message(state);
				Crafty.pause();
			   return false;
		    } else if (Input.is("Toggle Mute", e)) {
		    	 Global.sound = !Global.sound;
				 var state = "";
				 if (Global.sound == true) {
					 Crafty.audio.unmute();
					 state = "off";
				 } else {
					 Crafty.audio.mute();
					 state = "on";
				 }
				
				Global.Alert.message("Mute " + state);
		    } else if (Input.is("I Win", e)) {
		    	 console.log("I Win!");
		    	 //console.log(Game.gameScene.player);
		    	 //console.log(Game.gameScene.enemy);
		    	 Game.gameScene.enemy.applyDamage(Number.MAX_VALUE);
		    } else if (Input.is("Freeze", e)) {
		    	 Game.gameScene.enemy.isFrozen = true;
		    } else if (Input.is("CaptureWin", e)) {
		    	e.stopPropagation();
		    	Game.gameScene.enemy.isCaptured = true;
		    	Game.gameScene.enemy.applyDamage(Number.MAX_VALUE);
		    }
		};
	
		// Simply start the "Loading" scene to get things going
		//Crafty.scene('Loading');
		Crafty.scene('Game');
	}
};

$text_css = { 'size': '24px', 'family': 'Arial', 'color': 'red', 'text-align': 'center' };