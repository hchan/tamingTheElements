// game master - cheat tool ? ;)

GameMaster = {
	updateTextArea : function() {
		$("#gameMasterTextArea").val(JSON.stringify(GamePersist.getGameState(), undefined, 2));	
	},
	
	updateGameState : function() {
		var gameStateStr = $("#gameMasterTextArea").val();
		if (gameStateStr == "") {
			GamePersist.clearGame();
		} else {
			gameStateStr = gameStateStr.trim();
			var gameState = JSON.parse(gameStateStr);
			GamePersist.saveGameState(gameState);
		}
	},
	
	clearGameState : function() {
		$("#gameMasterTextArea").val("");
		GamePersist.clearGame();
	},
	
	newGameState : function() {		
		$("#gameMasterTextArea").val("");
		GamePersist.saveStart();
		this.updateTextArea();
	},
	
	chapterHelper : function(chapter, numOfCharacters) {
		var date = new Date();
		var guid = null;
		var garrison = [];
		for (var i = 0; i < numOfCharacters; i++) {
			guid = GameHelper.createGUID();
			var character = GameHelper.getRandomCharacter(GameHelper.charactersArray);
			var garrisonCharacter = {
				id : guid,
				experience : Garrison.MaxXP["chapter" + chapter] - 1,
				characterName : character.name,
				createdTime : date.getTime(),
				lastModifiedTime : date.getTime()
			};
			garrison.push(garrisonCharacter);
		}
		var gameState = {
				garrisonSortOrder : Settings.defaultGarrisonSortOrder,
				difficulty : Settings.defaultDifficulty,
				displaySettings : Settings.defaultDisplaySettings,
				chapter : chapter,
				garrison : garrison,
				createdTime : date.getTime(),
				lastModifiedTime : date.getTime()
		};
		GamePersist.saveGameState(gameState);
		this.updateTextArea();
	},
	
	chapter2 : function() {
		this.chapterHelper(2, 5);
	},
	
	chapter3 : function() {
		this.chapterHelper(3, 5);
	},
	
	chapter4 : function() {
		this.chapterHelper(4, 5);
	},
	
	chapterComplete : function() {
		var date = new Date();
		var guid = null;
		var garrison = [];
		for (var i = 0; i < GameHelper.charactersArray.length; i++) {
			guid = GameHelper.createGUID();
			var character = GameHelper.charactersArray[i];
			var garrisonCharacter = {
				id : guid,
				experience : Garrison.MaxXP["chapter4"],
				characterName : character.name,
				createdTime : date.getTime(),
				lastModifiedTime : date.getTime()
			};
			garrison.push(garrisonCharacter);
		}
		var gameState = {
				garrisonSortOrder : Settings.defaultGarrisonSortOrder,
				difficulty : Settings.defaultDifficulty,
				displaySettings : Settings.defaultDisplaySettings,
				chapter : 4,
				garrison : garrison,
				createdTime : date.getTime(),
				lastModifiedTime : date.getTime()
		};
		GamePersist.saveGameState(gameState);
		this.updateTextArea();
	}
};