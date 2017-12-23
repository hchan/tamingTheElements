Swap = {
	getTeammates : function(character) {
		var retval = [];
		var team = null;
		if (character.has("PlayerCharacter")) {
			team = Game.params.heroes;
		} else {
			team = Game.params.opponents; //character.has("EnemyCharacter")
		}
		
		for (var i = 0; i < team.length; i++) {
			if (character.id != team[i].character.id) {
				retval.push(team[i]);
			}
		}
		return retval;
	},
	
	
	swapNextAliveTeammate : function(character) {
		var retval = false;
		var teammates = Swap.getTeammates(character);
		for (var i = 0; i < teammates.length; i++) {
			var teammate = teammates[i];
			if (!teammate.character.isDead) {
				if (character.has("PlayerCharacter")) {
					Swap.swapPlayer(teammate.character);
				} else {
					Swap.swapEnemy(teammate.character);
				}
				retval = true;
				break;
			}
		}
		return retval;
	},
	
	getPlayerBenchCharacters : function() {
		return Swap.getTeammates(Game.gameScene.player);
	},
	
	isInPlayerSwapCooldown : function() {
		var retval = false;
		var date = new Date();
		var curTime = date.getTime();
		retval = (curTime - Game.gameScene.swapPlayerInfo.lastUsed) > Game.swapCooldown;
		return !retval;
	},
	
	canPlayerSwap : function(character) {
		var retval = false;
		if (character != null && !character.isDead) {
			retval = !Swap.isInPlayerSwapCooldown();
		}
		return retval;
	},
	
	canEnemySwap : function(character) {
		var date = new Date();
		var curTime = date.getTime();
		return (curTime - Game.gameScene.swapEnemyInfo.lastUsed) > Game.swapCooldown;
	},
	
	swapPlayer : function (benchCharacter) {	
		var date = new Date();
		var curTime = date.getTime();
		Game.gameScene.swapPlayerInfo.lastUsed = curTime;
		Swap.benchHelper(Game.gameScene.player);
		Swap.unbenchHelper(benchCharacter);
		Game.gameScene.player = benchCharacter;
		Game.gameScene.enemy.targetPlayer = Game.gameScene.player;
		Swap.swapTargets(Game.params.opponents, benchCharacter);
		Game.gameScene.playerTopHUD.topHUD(2,2, Game.gameScene.player);
		Game.actionBar.ActionBar(benchCharacter, benchCharacter.characterName);
		Global.playSound('swap');
	},
	
	swapEnemy : function (benchCharacter) {	
		var date = new Date();
		var curTime = date.getTime();
		Game.gameScene.swapEnemyInfo.lastUsed = curTime;
		Swap.benchHelper(Game.gameScene.enemy);
		Swap.unbenchHelper(benchCharacter);
		Game.gameScene.enemy = benchCharacter;		
		Game.gameScene.player.targetPlayer = Game.gameScene.enemy;
		Swap.swapTargets(Game.params.heroes, benchCharacter);
		Game.gameScene.enemyTopHUD.topHUD(Game.width()/2,2,Game.gameScene.enemy);
		Global.playSound('swap');
	},
	
	swapTargets : function (team, character) {
		for (var i = 0; i < team.length; i++) {
			team[i].character.targetPlayer = character;			
		}
	},
	
	benchHelper : function(character) {
		character.freeze(true);		
		character.maxHealthWithRest = character.curHealth + (character.maxHealthWithRest - character.curHealth)/2;	
		var healWithRest = Crafty.e("HealWithRest");
		healWithRest.doDelay(character);
		character.x = 1;
		character.y = -1;
		character.w = 0;
		character.h = 0;
		character.visible = false;
	},
	
	unbenchHelper : function(benchCharacter) {
		benchCharacter.unfreeze(true);		
		benchCharacter.h = Global.playerCharacter.height;
		benchCharacter.w = Global.playerCharacter.width;	
		benchCharacter.setStartPosition();
		benchCharacter.visible = true;
		
	},
	
	isBenched : function(character) {
		return (Game.gameScene.player != character);
	}
};
//
//addSwapAbilities : function() {		
//	var teams = [Game.params.heroes, Game.params.opponents];
//	for (var j = 0; j < teams.length; j++) {
//		var team = teams[j];			
//		for (var i = 0; i < team.length; i++) {
//			var paramHero = team[i];
//			var benchCharacters = Swap.getTeammates(paramHero.character);
//			for (var i = 0; i < benchCharacters.length; i++) {
//				paramHero.character.abilitiesInfo["Swap" + (i+1)] = { curCount: 0, lastUsed: 0, character: benchCharacters[i]};
//			}	
//		} 
//	}
//},
//
