// Game scene
// -------------
// Runs the core gameplay loop

GameHelper.createScene('Game', function(sceneName) {
	Game.gameScene = this;
	var playerCharacterName = null;
	var enemyCharacterName = null;
	Global.Alert = Crafty.e("Alert");
	var characterTypes = ["PlayerCharacter","EnemyCharacter"];
	var paramTypes = ["heroes", "opponents"];
	
	if (Game.params != null) {
		playerCharacterName = Game.params.heroes[0].characterName;		
		enemyCharacterName = Game.params.opponents[0].characterName;
		for (var j = 0; j < characterTypes.length; j++) {
			var characterType = characterTypes[j];
			var paramType = paramTypes[j];
	
			for (var i = 0; i < Game.params[paramType].length; i++) {
				var paramCharacter = Game.params[paramType][i];
				
				var character = Crafty.e(characterType);	
				character.addComponent(paramCharacter.characterName);
				Game.params[paramType][i]["character"] = character;		
				Garrison.addGarrisonInfo(paramCharacter, character);
			}
		}
		this.player = Game.params.heroes[0]["character"];
		this.enemy = Game.params.opponents[0]["character"];
		for (var i = 0; i < Game.params.heroes.length; i++) {
			Game.params.heroes[i]["character"].targetPlayer = this.enemy;
		}
		for (var i = 0; i < Game.params.opponents.length; i++) {
			Game.params.opponents[i]["character"].targetPlayer = this.player;
		}
		
		// bench Initial
		for (var j = 0; j < paramTypes.length; j++) {
			var team = Game.params[paramTypes[j]];
			for (var i = 1; i < team.length; i++) {	
				Swap.benchHelper(team[i].character);
			}
		}
		
	} else {
		this.player = Crafty.e('PlayerCharacter');	
		this.enemy = Crafty.e('EnemyCharacter');
		playerCharacterName = "Pax";
		enemyCharacterName = "Pax";
		this.player.addComponent(playerCharacterName);
		Garrison.addGarrisonInfo(Game.params.heroes[0], this.player);
		Game.params.heroes[0]["character"] = this.player;
		
		this.enemy.addComponent(enemyCharacterName);
		Garrison.addGarrisonInfo(Game.params.opponents[0], this.enemy);
		Game.params.opponents[0]["character"] = this.enemy;
	}
	
	GameHelper.loadBackground();
	
	
	// set enemy initial position
	//console.log(Game.width())
	//this.occupied[this.enemy.at().x][this.enemy.at().y] = true;
	this.swapPlayerInfo = {
		lastUsed:0	
	};
	this.swapEnemyInfo = {
			lastUsed:0	
	};
	this.player.setStartPosition();	
	this.enemy.setStartPosition();
	
	
	// init HUD
	this.initHUD = function() {
		this.hudContainer = Crafty.e('HUDContainer');
		//this.hudContainer.color(Game.backgroundColor);	
		this.hudContainer.attr({
			x: 0,
			y: 0,
			h: Game.hud_height,
			w: Game.width()
		});	
		this.playerTopHUD = Crafty.e('topHUD');
		this.playerTopHUD.topHUD(2,2, this.player);
		for (var i = 0; i < Game.params.heroes.length; i++) {
			Game.params.heroes[i]["character"].setTopHUD(this.playerTopHUD);
		}
		
		this.enemyTopHUD = Crafty.e('topHUD');
		this.enemyTopHUD.topHUD(Game.width()/2,2, this.enemy);
		for (var i = 0; i < Game.params.opponents.length; i++) {
			Game.params.opponents[i]["character"].setTopHUD(this.enemyTopHUD);
		}
	};
	this.initHUD();
	// init border
	this.topBorder = Crafty.e('Solid, Color');
	this.topBorder.color(Game.borderColor);
	this.topBorder.attr({
		x: 0,
		y: 0,
		h: Game.borderHeight,
		w: Game.width()
	});

	this.leftBorder = Crafty.e('Solid, Color');
	this.leftBorder.color(Game.borderColor);
	this.leftBorder.attr({
		x: 0,
		y: 0,
		h: Game.height(),
		w: Game.borderWidth
	});
	
	this.rightBorder = Crafty.e('Solid, Color');
	this.rightBorder.color(Game.borderColor);
	this.rightBorder.attr({
		x: Game.width()-Game.borderWidth,
		y: 0,
		h: Game.height(),
		w: Game.borderWidth
	});
	
	this.bottomBorder = Crafty.e('Solid, Color');
	this.bottomBorder.color(Game.borderColor);
	this.bottomBorder.attr({
		x: 0,
		y: Game.height()-Game.borderHeight,
		h: Game.borderHeight,
		w: Game.width()
	});
	
	Game.actionBar = Crafty.e('ActionBar');
	Game.actionBar.ActionBar(this.player, playerCharacterName);
	
	
	// Place a tree at every edge square on our grid of 16x16 tiles
//	for (var x = 0; x < Game.map_grid.width; x++) {
//		for (var y = 0; y < Game.map_grid.height; y++) {
//			var at_edge = x == 0 || x == Game.map_grid.width - 1 || y == 0 || y == Game.map_grid.height - 1;
//
//			if (at_edge) {
//				// Place a tree entity at the current tile
//				Crafty.e('Solid').at(x, y)
//				this.occupied[x][y] = true;
//			}
////			} else if (Math.random() < 0.06 && !this.occupied[x][y]) {
////				// Place a bush entity at the current tile
////				var bush_or_rock = (Math.random() > 0.3) ? 'Bush' : 'Rock'
////				Crafty.e(bush_or_rock).at(x, y)
////				this.occupied[x][y] = true;
////			}
//		}
//	}

	// Generate five villages on the map in random locations
//	var max_villages = 5;
//	for (var x = 0; x < Game.map_grid.width; x++) {
//		for (var y = 0; y < Game.map_grid.height; y++) {
//			if (Math.random() < 0.03) {
//				if (Crafty('Village').length < max_villages && !this.occupied[x][y]) {
//					Crafty.e('Village').at(x, y);
//				}
//			}
//		}
//	}
	
	// Play a ringing sound to indicate the start of the journey
	//Crafty.audio.play('ring');

	// Show the victory screen once all villages are visisted
//	this.show_victory = this.bind('VillageVisited', function() {
//		if (!Crafty('Village').length) {
//			Crafty.scene('Victory');
//		}
//	});
	
	
}, function() {
	// Remove our event binding from above so that we don't
	//  end up having multiple redundant event watchers after
	//  multiple restarts of the game
	//this.unbind('VillageVisited', this.show_victory);
});


// Victory scene
// -------------
// Tells the player when they've won and lets them start a new game
GameHelper.createScene('Victory', function(sceneName) {
	var gameState = GamePersist.getGameState();
	Global.playSound("victory");	
	GameHelper.setBackgroundDiv(Global.imgBackgroundAssets.risingSun.url);
	
	
	// Display some text in celebration of the victory
	//Crafty.background('url(' + Global.imgDir + "/victory.png" + ') no-repeat center center');
	var victoryFontSize = 18;
	var reportFontSize = 16;
	var capturedFontSize = 10;
	var entityVictoryEntity = Crafty.e('2D, DOM, Text')
		.text('Victory!')
		.attr(
				{ 
					x: 0, 
					//y: Game.height()/2 - 24,
					y:0,
					w: Game.width() 
					}
				)
		.textFont({ size: victoryFontSize + 'px', weight: 'bold'})
		.textColor("#FFD700")
		.css("textAlign", "center");
	
	// check if you have finished the game
	if (Game.gameScene.enemy.id == Game.lastBoss) {
		GamePersist.completeGame();
	}
	
	var garrisonCharacterId = Game.gameScene.player.id;
	var curHeightOffset = 2 * victoryFontSize;
	

	
	var reportEntityHeight = 0;
	if (garrisonCharacterId != null) {
		garrisonCharacter = Garrison.getGarrisonCharacter(garrisonCharacterId);
		var characterComponent = GameHelper.characters[garrisonCharacter.characterName].component;
		var spriteEntity = GameHelper.createCharacterAvatarEntity(characterComponent, Game.hud_height, Game.hud_height);
		spriteEntity.y = curHeightOffset;
		spriteEntity.x = (Game.width() - Game.hud_height)/2;
		curHeightOffset += Game.hud_height + 10;
		
		if (Game.params.practice == null) {
		
			var oldLevel = Garrison.getLevel(garrisonCharacter.experience);
			var xpGained = Garrison.addXP(garrisonCharacter);
			var textStr = "";
			if (xpGained > 0) {
				textStr = "XP gained : " + xpGained + "<br/>\n";
			} else {
				textStr = "XP gained : " + xpGained + " (this character has reached his max XP for this objective)<br/>\n";
			}
			textStr += "Current XP : " + garrisonCharacter.experience + "<br/>\n";
			var newLevel = Garrison.getLevel(garrisonCharacter.experience);
			if (newLevel > oldLevel) {
				textStr += "You are now Level : " + newLevel + "<br/>\n";
			} else {
				textStr += "Level : " + newLevel + "<br/>\n";
			}
			
			var lines = textStr.split(/\n/); 
			
			reportEntityHeight = reportFontSize * lines.length;
			var reportEntity = Crafty.e('2D, DOM, Text')
			.text(textStr)
			.attr(
					{ 
						x: 0,
						//y: Game.height()/2 - 24,
						y: curHeightOffset,
						w: Game.width() 
						}
					)
			.textFont({ size: reportFontSize + 'px', weight: 'bold'})
			.textColor("#D9EB3B")
			.css("textAlign", "center");
		}
			
	}
	curHeightOffset += reportEntityHeight;
	
	
	// is captured?

	var numCaptured = 0;
	numCaptured = Garrison.getNumberOfCapturedOpponents(Game.params.opponents);
	
	if (numCaptured > 0) {		
		var textStr = "<hr class='captureHR'/>";
		var captureEntity = Crafty.e('2D, DOM, Text')
		.text(textStr)
		.attr(
				{ 
					x: 0,
					//y: Game.height()/2 - 24,
					y: curHeightOffset,
					w: Game.width() 
					}
				)
		.textFont({ size: reportFontSize + 'px', weight: 'bold'})
		.textColor("#0aebd7")
		.css("textAlign", "center");
		curHeightOffset += reportFontSize;
		
		
		Crafty.e('2D, DOM, Text')
		.text("Captured:<br/>")
		.attr(
				{ 
					x: 0,
					//y: Game.height()/2 - 24,
					y: curHeightOffset,
					w: Game.width() 
				}
		)
		.textFont({ size: reportFontSize + 'px', weight: 'bold'})
		.textColor("#0aebd7")
		.css("textAlign", "center");
	
		curHeightOffset += reportFontSize*2;
		
		
		textStr = "<table><tr>";
		var capturedCharacters = [];
		
		for (var i = 0; i < Game.params.opponents.length; i++) {
			var opponent = Game.params.opponents[i];
			if (opponent.character.isCaptured) {
				var garrisonCharacter = jQuery.extend({}, opponent);
				delete garrisonCharacter['character'];
				Garrison.addGarrisonCharacter(garrisonCharacter);
				capturedCharacters.push(garrisonCharacter);
			}
		}
		
		for (var i = 0; i < capturedCharacters.length; i++) {
			var opponent = capturedCharacters[i];
			textStr = opponent.characterName + "<br/>Level : " + Garrison.getLevel(opponent.experience);
			Crafty.e('2D, DOM, Text')
			.text(textStr)
			.attr(
					{ 
						x: (Game.width() - Game.hud_height * 2 * capturedCharacters.length )/2 + i*2*Game.hud_height + Game.hud_height/2,
						//y: Game.height()/2 - 24,
						y: curHeightOffset,
						w: Game.hud_height
						}
					)
			.textFont({ size: capturedFontSize + 'px', weight: 'bold'})
			.textColor("#0aebd7");
			//.css("textAlign", "center");
		
			var characterComponent = GameHelper.characters[opponent.characterName].component;
			var spriteEntity = GameHelper.createCharacterAvatarEntity(characterComponent, Game.hud_height, Game.hud_height);
			spriteEntity.y = curHeightOffset + capturedFontSize*2.5;
			spriteEntity.x = (Game.width() - Game.hud_height * 2 * capturedCharacters.length )/2 + i*2*Game.hud_height + Game.hud_height/2;
			
			
		}
		curHeightOffset += Game.hud_height + capturedFontSize *2.5;
	
		textStr = "<hr class='captureHR'/>";
		Crafty.e('2D, DOM, Text')
		.text(textStr)
		.attr(
				{ 
					x: 0,
					//y: Game.height()/2 - 24,
					y: curHeightOffset,
					w: Game.width() 
					}
		);
		curHeightOffset += reportFontSize;
	}
	
	if (Garrison.objectivesMet()) {
		textStr = "";
		if (gameState.chapter < 4) {
			textStr = "Your objectives have been met for this chapter.<br/>Click on Current Objectives under the Main Menu to begin the next chapter";			
		} else {
			textStr = "Congratulations, you have have finished this game.  Thanks for playing!";
		}
		Crafty.e('2D, DOM, Text')
		.text(textStr)
		.attr(
				{ 
					x: 0,
					//y: Game.height()/2 - 24,
					y: curHeightOffset,
					w: Game.width() 
					}
		)
		.textFont({ size: reportFontSize + 'px', weight: 'bold'})
		.textColor("#FFD700")
		.css("textAlign", "center");
		curHeightOffset += 2.5*reportFontSize;
		GameHelper.createContinueButton("#", curHeightOffset);		
	} else {
		GameHelper.createContinueButton("#garrison", curHeightOffset);
	}

	
}, function() {
	// Remove our event binding from above so that we don't
	//  end up having multiple redundant event watchers after
	//  multiple restarts of the game
	//this.unbind('KeyDown', this.restart_game);
});


// YouJustDied
GameHelper.createScene('YouJustDied', function(sceneName) {
	// Display some text in celebration of the victory
	//Crafty.background('url(' + GameHelper.assetsDir + "/death.png" + ') no-repeat center center');
	Crafty.background("#000000");
	Crafty.e('2D, DOM, Text')
		.text('You have been defeated...')
		.attr({ x: 0, y: Game.height()/2 - 24, w: Game.width() })
		.textFont({ size: '24px', weight: 'bold'})
		.textColor("#FF0000")
		.css("textAlign", "center");
	
	GameHelper.createContinueButton("#garrison", Game.height()/2 + 24);
	
	// Give'em a round of applause!
	//Crafty.audio.play('applause');

	// After a short delay, watch for the player to press a key, then restart
	// the game when a key is pressed
//	var delay = true;
//	setTimeout(function() { delay = false; }, 5000);
//	this.restart_game = function() {
//		if (!delay) {
//			Crafty.scene('Game');
//		}
//	};
//	Crafty.bind('KeyDown', this.restart_game);
}, function() {
	// Remove our event binding from above so that we don't
	//  end up having multiple redundant event watchers after
	//  multiple restarts of the game
	//this.unbind('KeyDown', this.restart_game);
});

// Loading scene
// -------------
// Handles the loading of binary assets such as images and audio files
GameHelper.createScene('Loading', function(sceneName){
	// Draw some text for the player to see in case the file
	//  takes a noticeable amount of time to load
	Crafty.e('2D, DOM, Text')
		.text('Loading; please wait...')
		.attr({ x: 0, y: Game.height()/2 - 24, w: Game.width() })
		.textFont($text_css);


	
	//Crafty.load(assets, LoadAssets(assets, funcPostLoad));
	GameHelper.loadAssets(function() {
		assetsLoaded = true;
		Crafty.scene('Game');
	});
});




GameHelper.createScene("Homeworld: Pria", function(sceneName){		
	GameHelper.setBackgroundDiv(Global.imgBackgroundAssets["stars"].url);
	var cinematicAnimationHeight = Game.cinematicAnimationHeight();
	var cinematicAnimationWidth = Game.cinematicAnimationWidth();
	var cinematicAnimationShortLength = Math.min(cinematicAnimationHeight, cinematicAnimationWidth);
	var priaEntity = Crafty.e("2D, Canvas, pria");
	priaEntity.h = cinematicAnimationShortLength/2;
	priaEntity.w = cinematicAnimationShortLength/2;
	priaEntity.x = (cinematicAnimationWidth - priaEntity.w)/2;
	priaEntity.y = (cinematicAnimationHeight - priaEntity.h)/2;
	priaEntity.alpha = 0.5;
	priaEntity.origin("center");
	Crafty.e("Delay").delay(function() {
		priaEntity.rotation += 0.3;		
		priaEntity.alpha *= 1.05;
		
	}, 200, -1);
	var cinematicHeader = Crafty.e("CinematicHeader");	
	cinematicHeader.message(sceneName);
	cinematicHeader.bind("Remove", function() {
		var cinematicCaption = Crafty.e("CinematicCaption");
		cinematicCaption.message("For many millennia, Pria has been at peace, but in recent years, " +
				"there were signs of a lingering shadow over this planet, an omen of a darker time to come ...");
		//$("body").unbind("keydown");
		$("body").keydown(function() {
			Crafty.scene("The Disturbance");
		});			
	});		
});

GameHelper.createScene("The Disturbance", function(sceneName){
	GameHelper.setBackgroundDiv(Global.imgBackgroundAssets["stars"].url);
	var cinematicAnimationHeight = Game.cinematicAnimationHeight();
	var cinematicAnimationWidth = Game.cinematicAnimationWidth();
	var cinematicAnimationShortLength = Math.min(cinematicAnimationHeight, cinematicAnimationWidth);
	var cinematicHeader = Crafty.e("CinematicHeader");		
	cinematicHeader.message(sceneName);
	var priaEntity = Crafty.e("2D, Canvas, SpriteAnimation, priaUnbalanced");
	priaEntity.h = cinematicAnimationShortLength/2;
	priaEntity.w = cinematicAnimationShortLength/2;
	priaEntity.x = (cinematicAnimationWidth - priaEntity.w)/2;
	priaEntity.y = (cinematicAnimationHeight - priaEntity.h)/2;
	priaEntity.reel("priaUnbalancedReel", 5000, GameHelper.getFramesFromCoords(Global.imgMapAssets["priaUnbalanced"].coords));
	priaEntity.animate("priaUnbalancedReel", 1);
	priaEntity.alpha = 0.5;
	var chaoticFireEntity = Crafty.e("2D, Canvas, chaoticFire");
	chaoticFireEntity.alpha = 0;
	chaoticFireEntity.h = cinematicAnimationShortLength/2;
	chaoticFireEntity.w = cinematicAnimationShortLength/2;
	chaoticFireEntity.x = (cinematicAnimationWidth - priaEntity.w)/2;
	chaoticFireEntity.y = (cinematicAnimationHeight - priaEntity.h)/2;
	
	priaEntity.origin("center");
	Crafty.e("Delay").delay(function() {
		priaEntity.rotation += 0.3;		
		priaEntity.alpha *= 1.05;
		if (chaoticFireEntity.alpha < 0.5) {
			chaoticFireEntity.alpha += 0.05;
		}
		if (chaoticFireEntity.w < priaEntity.w * 1.5) {
			chaoticFireEntity.x -= 4;
			chaoticFireEntity.y -= 4;
			chaoticFireEntity.w += 8;
			chaoticFireEntity.h += 8;
		}
	}, 200, -1);
	
	

	
	cinematicHeader.bind("Remove", function() {
		var cinematicCaption = Crafty.e("CinematicCaption");
		cinematicCaption.message("And then one day the planet fractured from within.  A disturbance has unfolded throughout the land");
		//$("body").unbind("keydown");
		$("body").keydown(function() {
			Crafty.scene("Call of the Tamer");
		});
	});		
});


GameHelper.createScene("Call of the Tamer", function(sceneName){
	GameHelper.setBackgroundDiv(Global.imgBackgroundAssets["risingSun"].url);
	var cinematicAnimationHeight = Game.cinematicAnimationHeight();
	var cinematicAnimationWidth = Game.cinematicAnimationWidth();
	var cinematicAnimationShortLength = Math.min(cinematicAnimationHeight, cinematicAnimationWidth);
	var cinematicHeader = Crafty.e("CinematicHeader");		
	cinematicHeader.message(sceneName);
	var elementalSignsEntity = Crafty.e("2D, Canvas, elementalSigns");
	elementalSignsEntity.h = cinematicAnimationShortLength/2;
	elementalSignsEntity.w = cinematicAnimationShortLength/2;
	elementalSignsEntity.x = (cinematicAnimationWidth - elementalSignsEntity.w)/2;
	elementalSignsEntity.y = (cinematicAnimationHeight - elementalSignsEntity.h)/2;
	elementalSignsEntity.alpha = 0.25;
	
	elementalSignsEntity.origin("center");
	var avatarEntityWidth = cinematicAnimationShortLength/4;
	var avatarEntityHeight = cinematicAnimationShortLength/4;
	var elementalTypeInfoArray = [ {
									elementalType: "fire", 
									character: null, 
									avatarEntity: null, 
									indexOfSearch : 0, 
									hasLoopStarted : false,
									rotationDirection : null,
									x: (cinematicAnimationWidth-(2*avatarEntityWidth))/2,
									y : (cinematicAnimationHeight-(2*avatarEntityHeight))/2
							  }, 
							  {
									elementalType: "earth", 
									character: null, 
									avatarEntity: null, 
									indexOfSearch : 0, 
									hasLoopStarted : false,
									rotationDirection : null,
									x: (cinematicAnimationWidth-(2*avatarEntityWidth))/2 + avatarEntityWidth,
									y : (cinematicAnimationHeight-(2*avatarEntityHeight))/2
							  },
							  {
									elementalType: "water", 
									character: null, 
									avatarEntity: null, 
									indexOfSearch : 0, 
									hasLoopStarted : false,
									rotationDirection : null,
									x: (cinematicAnimationWidth-(2*avatarEntityWidth))/2,
									y : (cinematicAnimationHeight-(2*avatarEntityHeight))/2 + avatarEntityHeight
							  },
							  {
									elementalType: "air", 
									character: null, 
									avatarEntity: null, 
									indexOfSearch : 0, 
									hasLoopStarted : false,
									rotationDirection : null,
									x: (cinematicAnimationWidth-(2*avatarEntityWidth))/2 + avatarEntityWidth,
									y : (cinematicAnimationHeight-(2*avatarEntityHeight))/2 + avatarEntityHeight
							  }, 
	                          ];

	var showAvatarEntityAnimation = function(elementalTypeInfo)	{
		if (elementalTypeInfo.hasLoopStarted) {
			return;
		} else {
			elementalTypeInfo.hasLoopStarted = true;
		}
		Crafty.e("Delay").delay(function() {
			if (elementalTypeInfo.character == null) {
				elementalTypeInfo.character = GameHelper.elementalCharactersByType[elementalTypeInfo.elementalType][elementalTypeInfo.indexOfSearch];
				elementalTypeInfo.indexOfSearch++;
				if (elementalTypeInfo.indexOfSearch == GameHelper.elementalCharactersByType[elementalTypeInfo.elementalType].length) {
					elementalTypeInfo.indexOfSearch = 0;
				}
				elementalTypeInfo.avatarEntity = GameHelper.createCharacterAvatarEntity(elementalTypeInfo.character.component, avatarEntityWidth, avatarEntityHeight);
				elementalTypeInfo.avatarEntity.x = elementalTypeInfo.x;
				elementalTypeInfo.avatarEntity.y = elementalTypeInfo.y;
				elementalTypeInfo.avatarEntity.origin("center");
				if (Math.random() > 0.5) {
					elementalTypeInfo.rotationDirection = "cw";
				} else {
					elementalTypeInfo.rotationDirection = "ccw";
				}
				elementalTypeInfo.avatarEntity.increaseAlpha = true;
				elementalTypeInfo.avatarEntity.attr({alpha : 0.25});
			} else {
				if (elementalTypeInfo.rotationDirection == "cw") {
					elementalTypeInfo.avatarEntity.rotation += 1;
				} else {
					elementalTypeInfo.avatarEntity.rotation -= 1;
				}
				if (elementalTypeInfo.avatarEntity.increaseAlpha == true) {		
					var multiplierOffset = Math.random()/10 * 2;
					elementalTypeInfo.avatarEntity.attr({alpha : elementalTypeInfo.avatarEntity.alpha*(1+multiplierOffset)});
				} else {
					//var multiplierOffset = Math.random()/100;
					elementalTypeInfo.avatarEntity.attr({alpha : elementalTypeInfo.avatarEntity.alpha*(0.9)});
				}
			}
			if (elementalTypeInfo.avatarEntity.alpha < 0.25) {
				elementalTypeInfo.avatarEntity.destroy();
				elementalTypeInfo.character = null;
			} else if (elementalTypeInfo.avatarEntity.alpha >= 1) {
				elementalTypeInfo.avatarEntity.increaseAlpha = false;
			}
		}, 200, -1);			
	};
	
	var timeCounter = 0;
	Crafty.e("Delay").delay(function() {
		timeCounter++;
		elementalSignsEntity.alpha *= 1.1;
		if (elementalSignsEntity.alpha >= 1) {
			elementalSignsEntity.x += 4;
			elementalSignsEntity.y += 4;
			elementalSignsEntity.w -= 8;
			elementalSignsEntity.h -= 8;
			elementalSignsEntity.rotation += 5;
		}
		if (elementalSignsEntity.w < cinematicAnimationShortLength/2 && timeCounter % 10 == 0) {
			var randIndoxOfElementalTypeInfoArray =  Math.floor(Math.random() * elementalTypeInfoArray.length);
			showAvatarEntityAnimation(elementalTypeInfoArray[randIndoxOfElementalTypeInfoArray]);
		}
		if (elementalSignsEntity.w < cinematicAnimationShortLength/8) {
			elementalSignsEntity.destroy();
		}
	}, 50, -1);
	
	// make sure to start all avatarEntityAnimation in case random doesn't pick it up
	elementalSignsEntity.bind("Remove", function() {
		
		for (var i = 0; i < elementalTypeInfoArray.length; i++) {
			var elementalTypeInfo = elementalTypeInfoArray[i];
			showAvatarEntityAnimation(elementalTypeInfo);
		}
//		Crafty.e("Delay").delay(function() {
//			if (fireCharacter == null) {
//				fireCharacter = GameHelper.getRandomCharacter(GameHelper.elementalCharactersByType["fire"]);
//				avatarEntity = GameHelper.createCharacterAvatarEntity(fireCharacter.component, cinematicAnimationShortLength/4, cinematicAnimationShortLength/4);
//				avatarEntity.x = (cinematicAnimationWidth-(2*avatarEntity.w))/2;
//				avatarEntity.y = (cinematicAnimationHeight-(2*avatarEntity.h))/2;
//				avatarEntity.increaseAlpha = true;
//				avatarEntity.attr({alpha : 0.25});
//			} else {
//				if (avatarEntity.increaseAlpha == true) {					
//					avatarEntity.attr({alpha : avatarEntity.alpha*1.05});
//				} else {
//					avatarEntity.attr({alpha : avatarEntity.alpha*0.95});
//				}
//			}
//			if (avatarEntity.alpha < 0.25) {
//				avatarEntity.destroy();
//				fireCharacter = null;
//			} else if (avatarEntity.alpha >= 1) {
//				avatarEntity.increaseAlpha = false;
//			}
//			
//		}, 200, -1);
	});

	
	cinematicHeader.bind("Remove", function() {
		var cinematicCaption = Crafty.e("CinematicCaption");
		cinematicCaption.message("As  Pria cries out for a hero, you have risen to this challenge as the Tamer." +
				"  You must wield the power the of elements: fire, earth, water and air, by taming and training Elementals." +
				"  And only then..."); // Andy only then ... will you have a chance to unravel this disturbance caused from the center of Pria
		//$("body").unbind("keydown");
		$("body").keydown(function() {
			Crafty.scene("Restoring Balance");
		});
	});		
});



GameHelper.createScene("Restoring Balance", function(sceneName){
	GameHelper.setBackgroundDiv(Global.imgBackgroundAssets["stars"].url);
	var cinematicAnimationHeight = Game.cinematicAnimationHeight();
	var cinematicAnimationWidth = Game.cinematicAnimationWidth();
	var cinematicAnimationShortLength = Math.min(cinematicAnimationHeight, cinematicAnimationWidth);
	var cinematicHeader = Crafty.e("CinematicHeader");		
	cinematicHeader.message(sceneName);
	
	
	var priaEntity = Crafty.e("2D, Canvas, SpriteAnimation, priaUnbalanced");
	priaEntity.h = cinematicAnimationShortLength/2;
	priaEntity.w = cinematicAnimationShortLength/2;
	priaEntity.x = (cinematicAnimationWidth - priaEntity.w)/2;
	priaEntity.y = (cinematicAnimationHeight - priaEntity.h)/2;
	priaEntity.reel("priaUnbalancedReel", 5000, GameHelper.getFramesFromCoords(Global.imgMapAssets["priaUnbalanced"].coords));
	priaEntity.animate("priaUnbalancedReel", 1);
	priaEntity.reelPosition("end");
	priaEntity.alpha = 0.5;
	var chaoticFireEntity = Crafty.e("2D, Canvas, chaoticFire");
	chaoticFireEntity.alpha = 0;
	chaoticFireEntity.h = cinematicAnimationShortLength/2;
	chaoticFireEntity.w = cinematicAnimationShortLength/2;
	chaoticFireEntity.x = (cinematicAnimationWidth - priaEntity.w)/2;
	chaoticFireEntity.y = (cinematicAnimationHeight - priaEntity.h)/2;
	
	priaEntity.origin("center");
	Crafty.e("Delay").delay(function() {
		//priaEntity.rotation += 0.3;		
		priaEntity.alpha *= 1.05;
		if (chaoticFireEntity.alpha < 0.5) {
			chaoticFireEntity.alpha += 0.05;
		}
		var growMultiplier = 1.5;
		if (priaEntity.w >= cinematicAnimationShortLength) {
			
			growMultiplier = 3;
		}
		//if (chaoticFireEntity.w < priaEntity.w * 1.5) {
			chaoticFireEntity.x -= 2 * growMultiplier;
			chaoticFireEntity.y -= 2 * growMultiplier;
			chaoticFireEntity.w += 4 * growMultiplier;
			chaoticFireEntity.h += 4 * growMultiplier;
			priaEntity.x -=1 * growMultiplier;
			priaEntity.y -=1 * growMultiplier;
			priaEntity.w +=2 * growMultiplier;
			priaEntity.h +=2 * growMultiplier;
		//}
			if (priaEntity.w >= cinematicAnimationShortLength * 2) {
				priaEntity.destroy();
				chaoticFireEntity.destroy();
			}
	}, 1, -1);
	priaEntity.bind("Remove", function() {
		var whiteExplosion = Crafty.e("2D, Canvas, Color");
		whiteExplosion.color("#FFFFFF");
		whiteExplosion.x = 0;
		whiteExplosion.y = 0;
		whiteExplosion.h = cinematicAnimationHeight;
		whiteExplosion.w = cinematicAnimationWidth;
		Crafty.e("Delay").delay(function() {
			whiteExplosion.destroy();	
			GameHelper.hideBackgroundDiv();
		}, 500, 1);
		whiteExplosion.bind("Remove", function() {
		
			var evilEyesEntity = Crafty.e("2D, Canvas, evilEyes");
			evilEyesEntity.alpha = 0.10;
			evilEyesEntity.growAlpha = true;
			evilEyesEntity.h = cinematicAnimationShortLength;
			evilEyesEntity.w = cinematicAnimationShortLength;
			evilEyesEntity.x = (cinematicAnimationWidth - evilEyesEntity.w)/2;
			evilEyesEntity.y = (cinematicAnimationHeight - evilEyesEntity.h)/2;
			var growMultiplier = 1.01;
			var theDisturbanceMessageShown = false;
			Crafty.e("Delay").delay(function() {
				if (evilEyesEntity.growAlpha) {
					evilEyesEntity.alpha *= growMultiplier;
					if (evilEyesEntity.alpha >= 1) {
						evilEyesEntity.growAlpha = false;
						if (!theDisturbanceMessageShown) {
							theDisturbanceMessageShown = true;
							var theDisturbanceMessageEntity = Crafty.e('2D, DOM, Text');
							theDisturbanceMessageEntity.attr({
								x : 0,
								y: evilEyesEntity.y + evilEyesEntity.h + 5,
								w: cinematicAnimationWidth
							});
							theDisturbanceMessageEntity.textFont({ size: '10px', weight: 'italic', 'family' : 'Helvetica'})		
							.textColor("#FF0000", 1).css("textAlign", "center");
							theDisturbanceMessageEntity.text("[A Dark Voice: Come Tamer.  Come and face me if you do not value your life...]");
						}
					}
				} else {
					evilEyesEntity.alpha *= .995;
					if (evilEyesEntity.alpha <= 0.75) {
						evilEyesEntity.growAlpha = true;
						growMultiplier = 1.005;
					}
				}
				if (evilEyesEntity.w > cinematicAnimationShortLength/2) {
					
					evilEyesEntity.x +=1 * growMultiplier;
					evilEyesEntity.y +=1 * growMultiplier;
					evilEyesEntity.w -=2 * growMultiplier;
					evilEyesEntity.h -=2 * growMultiplier;
				}
			}, 10, -1);
		});
	});
	
	cinematicHeader.bind("Remove", function() {
		var cinematicCaption = Crafty.e("CinematicCaption");
		cinematicCaption.message("And only then ... will you have the power to journey to the center of Pria and " +
				"chance to unravel the mystery of this disturbance and " +
				"restore the balance.<br/>  The fate of Pria lies in your hands ...");
		//$("body").unbind("keydown");
		$("body").keydown(function() {
			GamePersist.saveStart();
			Main.currentObjectives("chapter1");
		});
	});		
});
