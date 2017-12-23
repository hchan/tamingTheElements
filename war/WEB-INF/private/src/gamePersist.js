GamePersist = {
		
		
		saveStart : function() {
			var date = new Date();
			var guid = GameHelper.createGUID();
			var character = GameHelper.getRandomCharacter(GameHelper.charactersArray);
			var garrisonCharacter = {
				id : guid,
				experience : 1,
				characterName : character.name,
				createdTime : date.getTime(),
				lastModifiedTime : date.getTime()
			};
			var gameState = {
					// garrisonSortOrder - see id="garrisonSortOrderRadioContainer" in GUI
					// difficulty - see id='difficultyRadioContainer' in GUI 
					garrisonSortOrder : Settings.defaultGarrisonSortOrder,
					difficulty : Settings.defaultDifficulty,
					displaySettings: Settings.defaultDisplaySettings,
					chapter : 1,
					garrison : [garrisonCharacter],
					createdTime : date.getTime(),
					lastModifiedTime : date.getTime()
			};
			this.saveGameState(gameState);
			
		},
		
		saveGameState : function(gameState) {
			var gameStateStr = null;
			try {
				gameStateStr = JSON.stringify(gameState);
			} catch (e) {
				gameState = GamePersist.getGameState();
				gameStateStr = JSON.stringify(gameState);
			}
			localStorage.setItem(Game.gameName, gameStateStr);
		},
		
		getGameState : function() {
			var retval = null;
			var gameStateStr = localStorage.getItem(Game.gameName);
			retval = JSON.parse(gameStateStr);
			if (retval == null) {
				retval = {
					chapter : 0,
					displaySettings : Settings.defaultDisplaySettings 
				};
			}
			/*
			if (retval.displaySettings == null) {
				retval.displaySettings = Settings.defaultDisplaySettings; 
			}			
			if (retval.difficulty == null) {
				retval.difficulty = Settings.defaultDifficulty;
			}
			if (retval.garrisonSortOrder == null) {
				retval.garrisonSortOrder = Settings.defaultGarrisonSortOrder;
			}
			*/
			return retval; 
		},
		
		clearGame : function() {
			localStorage.removeItem(Game.gameName);
		},
		
		updateCharacter : function (garrisonCharacter) {
			var date = new Date();
			var gameState = GamePersist.getGameState();
			for (var i = 0; i < gameState.garrison.length; i++) {
				var garrisonCharacterLoop = gameState.garrison[i];
				if (garrisonCharacter.id == garrisonCharacterLoop.id) {
					gameState.garrison[i] = garrisonCharacter;
					gameState.garrison[i].lastModifiedTime = date.getTime();
					break;
				}
			}
			gameState.lastModifiedTime = date.getTime();
			GamePersist.saveGameState(gameState);
		},
		
		updateParams : function (params) {
			var date = new Date();
			var gameState = GamePersist.getGameState();
			gameState.params = params;
			gameState.lastModifiedTime = date.getTime();
			GamePersist.saveGameState(gameState);
		},
		
		completeGame : function() {
			var date = new Date();
			var gameState = GamePersist.getGameState();
			gameState.completeTime = date.getTime();
			GamePersist.saveGameState(gameState);
		},
		
		isCompleteGame : function() {
			var gameState = GamePersist.getGameState();
			return gameState.completeTime != null;
		}
};