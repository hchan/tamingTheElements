GameHelper.createAbilityComponent('Capture', '',  {
	defaults : {
		speed : Global.defaultBulletSpeed,
		damage : Number.MAX_VALUE,
		type: 'Range',
		spriteName : 'capture',
		maxActive : 1,
		cooldown : 5000,
		w : Global.playerCharacter.width * 0.5,
		h : Global.playerCharacter.height * 0.5,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;		
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		var abilityEntity = this;
		this.createHitCallbackOrig = this.createHitCallback;
		this.createHitCallback = function() {
			return function() {};
		};
		character.doRange(character.direction, this.abilityName, this, null);		
		Global.playSound('capture');
	
		
		this.onHit(character.targetPlayerType, function(data) {		
			if (character.targetPlayer.characterName != Game.lastBoss) {
				character.targetPlayer.isCaptured = true;
				abilityEntity.createHitCallbackOrig(abilityEntity, abilityEntity.abilityName)(data);
			} else {
				Global.playSound('evilLaugh');
			}
		});
	},		
	getDescription : function(level) {
		return "Caputures an opponent";
	}
});


GameHelper.createAbilityComponent('Wind Cone', '',  {
	defaults : {
		speed : Global.defaultBulletSpeed,
		damage : 13,
		type: 'Range',
		spriteName : 'windCone',
		maxActive : 4,
		cooldown : 400,
		w : Global.playerCharacter.width * 0.3125,
		h : Global.playerCharacter.height * 0.125,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);	
		this.resize();
		character.doRange(character.direction, this.abilityName, this, null);		
		Global.playSound('laser1');
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});

GameHelper.createAbilityComponent('Stick', '',  {
	defaults : {
		speed : 8,
		damage : 10,
		type: 'Range',
		spriteName : 'stick',
		maxActive : 1,
		cooldown : 2000,
		w : Global.playerCharacter.width * 0.3125,
		h : Global.playerCharacter.height * 0.125,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		character.doRange(character.direction, this.abilityName, this, null);		
		Global.playSound('stick');
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});



GameHelper.createAbilityComponent('Fire Blast', '', {
	defaults : {
		speed : Global.defaultBulletSpeed,
		damage : 40,
		type : 'Range',
		spriteName : 'fireBlast',
		maxActive : 2,
		cooldown : 600,
		w : Global.playerCharacter.width * 0.9375,
		h : Global.playerCharacter.height * 0.1875,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		character.doRange(character.direction, this.abilityName, this, null);		
		Global.playSound('fireBreath');
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});

GameHelper.createAbilityComponent('Icicles', '', {
	defaults : {
		speed : Global.defaultBulletSpeed+2,
		damage : 10,
		type : 'Range',
		spriteName : 'icicles',
		maxActive : 3,
		cooldown : 300,
		w : Global.playerCharacter.width * 0.125,
		h : Global.playerCharacter.height * 0.3125,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		
		this.requires(this.type);		
		this.resize();
		character.doRange(character.direction, this.abilityName, this, null);		
		Global.playSound('freezing');
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});

GameHelper.createAbilityComponent('Hurl Rock', '', {
	defaults : {
		speed : Global.defaultBulletSpeed,
		damage : 40,
		type : 'Range',
		spriteName : 'hurlRock',
		maxActive : 2,
		cooldown : 500,
		w : Global.playerCharacter.width * 0.4375,
		h : Global.playerCharacter.height * 0.4375,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);		
		this.resize();
		character.doRange(character.direction, this.abilityName, this, null);		
		Global.playSound('rockBullet');
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});



GameHelper.createAbilityComponent('Ground Shock', '', {
	defaults : {
		w:  Global.playerCharacter.width * 3,
		h: Global.playerCharacter.height * 3,
		damage : 25,
		speed: 'n/a',
		type : 'Melee',
		spriteName : 'groundShock',
		maxActive : 1,
		cooldown : 3000,
		delayAfterAttack : 250,
		additionalDescription : "Omni-directional melee attack"
	},
	initAbility : function(character) {
		
		GameHelper.copyDefaultsToThis(this.defaults, this);
		
		
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		
		this.x = character.x - (this.w - character.w)/2;
		this.y = character.y - (this.h - character.h)/2;
		
		character.doMelee(character.direction, this.abilityName, this, null);
		Global.playSound('rockBullet');
		
	
		this.onHit('HUDContainer', function(data) {
			
		});
		this.onHit(character.targetPlayerType, function(data) {
			if (!character.targetPlayer.isTranslucent) {
				this.applyDamage(data[0].obj);
			}
		});
		
	},
	isInRange : function(character, w, h) {		
		return GameHelper.isInRangeExplosion(character, w, h);
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Adrenaline', '', {
	defaults : {
		duration : 3000,
		cooldown : 15000,
		speedIncrease : 5,
		type : "Buff",
		damageDecreasePercentage : 25,
		maxActive : 100,
		character : null,
		spriteName : "adrenaline"
	},
	initAbility : function (character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		var abilityEntity = this;
		var date = new Date();
		var curTime = date.getTime();
	
		character.characterSpeed += abilityEntity.speedIncrease;
		character.damageDecreasePercentage += abilityEntity.damageDecreasePercentage;
		character.abilitiesInfo[this.abilityName].lastUsed = curTime;

		character.topHUD.buffs[this.abilityName] = { lastUsed : curTime, duration : this.duration, type: "friendly"};
		Global.playSound('adrenaline');
		character.switchSprite(character.spriteName + "Adrenaline", character.getFrames());
		//character.addComponent("SpriteColor");
		//character.spriteColor(255, null, null, null);
	
		if (character.has("Fourway")) {
			character.fourway(character.characterSpeed);
			character.stopOnSolids(); // should be called when fourway is changed
		}
		Crafty.e("Delay").delay(function() {
			character.characterSpeed -= abilityEntity.speedIncrease;
			character.damageDecreasePercentage -= abilityEntity.damageDecreasePercentage;
			//character.removeComponent("SpriteColor");
			character.restoreDefaultSprite();
			if (!character.isDead) {
				if (character.has("Fourway")) {				
					character.fourway(character.characterSpeed);
					character.stopOnSolids(); // should be called when fourway is changed
				}
			}
		}, this.duration, 0);
	},
	
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Tornado', '', {
	defaults : {
		speed : Global.defaultBulletSpeed,
		cooldown : 6000,
		damage : 0,
		//dot : [5, 250],
		duration: 3000,
		maxActive : 1,
		character : null,
		spriteName : "tornado",
		type: "Range",
		w : Global.playerCharacter.width * 0.25,
		h : Global.playerCharacter.height * 0.75,
		additionalDescription : "Will stun the opponent"
	},
	getFrames : function() {
		//return [[0, 0], [300, 0], [600, 0], [900, 0]];
		return GameHelper.getFrames();
	},
		
	initAbility : function (character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.addComponent("SpriteAnimation");
		this.requires(this.type);
		this.resize();
		
		Global.playSound('whoosh');
		this.reel(this.spriteName + "Reel", 600, this.getFrames());		
		this.animate(this.spriteName + "Reel", -1);		
		character.doRange(character.direction, this.abilityName, this, true);			
		
		this.onHit(character.targetPlayerType, function(data) {
			for (var i = 0; i < data.length; i++) {
				if (data[i].obj.has(character.targetPlayerType)) {
					var opponent = data[i].obj;
					if (!opponent.isTranslucent) {
						opponent.freeze();
						var date = new Date();
						var curTime = date.getTime();
						var duration = this.duration;
						opponent.topHUD.buffs['Tornado'] = { lastUsed : curTime, duration : duration, type: "hostile"};
						Crafty.e("Delay").delay(function() {
							if (!character.isDead) {
								opponent.unfreeze();
							}
						}, duration, 0);
					}
				}
			}
		});
	},
			
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});

GameHelper.createAbilityComponent('Translucent Flame', '', {
	defaults : {
		duration : 1500,
		cooldown : 6000,	
		maxActive : 100,
		character : null,
		spriteName : "translucentFlame",
		type: "Buff",
		additionalDescription : "Become translucent (opponent's attacks will go through you)"
	},
	
	initAbility : function (character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		var abilityEntity = this;
		var date = new Date();
		var curTime = date.getTime();
		
		character.abilitiesInfo[this.abilityName].lastUsed = curTime;

		character.topHUD.buffs[this.abilityName] = { lastUsed : curTime, duration : this.duration, type: "friendly"};
		Global.playSound('flame');
		
//		character.spriteColor(255, null, null, null);
		character.becomeTranslucent();
		/*
		character.removeComponent(character.spriteName);
		character.addComponent(this.spriteName);
		character.spriteName = this.spriteName;
		
		character.reel(this.spriteName + "Reel", 600, this.getFrames());
		character.animate(this.spriteName + "Reel", this.duration/600);							
		character.w = Global.playerCharacter.width;
		character.h = Global.playerCharacter.height;
		*/
		character.switchSprite(this.spriteName, this.getFrames());
		
		if (character.has("Fourway")) {
			character.fourway(character.characterSpeed);
			character.stopOnSolids(); // should be called when fourway is changed
		}
		Crafty.e("Delay").delay(function() {
			
			if (!character.isDead) {
				Global.playSound('flame');
				character.becomeUntranslucent();
				/*
				character.removeComponent(abilityEntity.spriteName);
				character.addComponent(character.defaults.spriteName);
				character.spriteName = character.defaults.spriteName;
				character.w = Global.playerCharacter.width;
				character.h = Global.playerCharacter.height;
				*/
				character.restoreDefaultSprite();
				if (character.has("Fourway")) {	
					character.fourway(character.characterSpeed);
					character.stopOnSolids(); // should be called when fourway is changed
				}
			}
		}, this.duration, 0);
	},
	
	getFrames : function() {
		return GameHelper.getFrames();
	},
	
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Ice Blast', '', {
	defaults : {
		speed : Global.defaultBulletSpeed,
		cooldown : 6000,
		damage : 15,
		//dot : [5, 250],
		duration: 3000,
		maxActive : 100,
		speedIncrease : -2,
		character : null,
		spriteName : "iceBlast",
		effectSpriteName : "iceSheet",
		type: "Range",
		w : Global.playerCharacter.width * 0.75,
		h : Global.playerCharacter.height * 0.75,
		additionalDescription : "Inflicts damage and reduces opponent's speed"
	},
	
//	getFrames : function() {
//		return [[0, 0], [300, 0], [600, 0], [900, 0]];
//	},
		
	initAbility : function (character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		var abilityEntity = this;
		Global.playSound('iceBlast');

		character.doRange(character.direction, this.abilityName, this, null);			
		
		this.onHit(character.targetPlayerType, function(data) {
			for (var i = 0; i < data.length; i++) {
				if (data[i].obj.has(character.targetPlayerType)) {
					var opponent = data[i].obj;
					if (!opponent.isTranslucent) {
						opponent.characterSpeed += abilityEntity.speedIncrease;
						if (opponent.characterSpeed < 0) {
							opponent.characterSpeed = opponent.defaults.characterSpeed/2;
						}
//						opponent.removeComponent("SpriteColor");
//						opponent.addComponent("SpriteColor");
//						opponent.spriteColor("halfOfOriginal", "halfOfOriginal", 230, null);
						var effectSprite = Crafty.e("2D, Canvas, " + abilityEntity.effectSpriteName);
						effectSprite.w = character.targetPlayer.w;
						effectSprite.h = character.targetPlayer.h/4;					
						
						character.attach(effectSprite);
						effectSprite.bind(
								"EnterFrame",
								function() {
									if (character.targetPlayer.isDead) {
										this.destroy();
									} else {
										this.x = character.targetPlayer.x;
										this.y = character.targetPlayer.y + 3/4*character.targetPlayer.h;
									}
								}
						);
						
						if (opponent.has("Fourway")) {
							opponent.fourway(opponent.characterSpeed);
							opponent.stopOnSolids(); // should be called when fourway is changed
						}
						var date = new Date();
						var curTime = date.getTime();
						var duration = this.duration;
						opponent.topHUD.buffs[abilityEntity.abilityName] = { lastUsed : curTime, duration : duration, type: "hostile"};
						Crafty.e("Delay").delay(function() {
							if (!character.isDead) {
								if (opponent.characterSpeed < 0.2) {
									opponent.characterSpeed = opponent.defaults.characterSpeed;
								} else {
									opponent.characterSpeed -= abilityEntity.speedIncrease;
								}
//								opponent.removeComponent("SpriteColor");
								effectSprite.destroy();
								if (opponent.has("Fourway")) {
									opponent.fourway(opponent.characterSpeed);
									opponent.stopOnSolids(); // should be called when fourway is changed
								}
							}
						}, duration, 0);
					}
				}
			}
		});
	},
			
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Sonar Blast', '',  {
	defaults : {
		speed : Global.defaultBulletSpeed,
		damage : 40,
		type: 'Range',
		spriteName : 'sonarBlast',
		maxActive : 2,
		cooldown : 600,
		w : Global.playerCharacter.width * 0.25,
		h : Global.playerCharacter.height * 0.25,
		additionalDescription : "Project grows in width but decreases amount of damage done over distance"
	},	
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		this.myTween = this.myTweenOverride;
		
		character.doRange(character.direction, this.abilityName, this, null);			
		Global.playSound('sonarBlast');
	},	
	myTweenOverride : function () {
		this.origin("center");
		var bullet = this;
		var curRotation = bullet.rotation;
		var abilityEntity = this;
		Crafty.e("Delay").delay(function() {			
			if (bullet.isDead) {
				this.destroy();
			}		
			var curAlpha = bullet.alpha;
			var newAlpha = curAlpha * 0.99;
			bullet.alpha = newAlpha;
			var newH = bullet.h * 1.015;
			if (newH < (Global.playerCharacter.height * 0.5)) {
				bullet.h = newH;				
			} else{
				bullet.w *= 1.015;
			}
			abilityEntity.damage *= 0.98;			
			var rotateAmount = 0;			
			bullet.rotation += rotateAmount;			
			if (Math.abs(curRotation - bullet.rotation) > 5) {
				bullet.rotation = curRotation;
			}
		}, 10, -1);
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Steal Health', '',  {
	defaults : {
		speed : 'n/a',
		damage : 10,
		w:  Global.playerCharacter.width * 3,
		h:  Global.playerCharacter.width / 2,
		type: 'Melee',
		spriteName : 'stealHealth',
		maxActive : 2,
		cooldown : 1000,
		delayAfterAttack : 250,
		additionalDescription : "Will heal you for the amount of damage done"
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		Global.playSound('stealHealth');
		var direction = character.direction;
		this.reposition(direction, character);
		this.applyDamage = this.applyDamageOverride;
		this.onHit(character.targetPlayerType, function(data) {
			this.applyDamage(data[0].obj);
		});
		character.doMelee(character.direction, this.abilityName, this, true);
	},
	applyDamageOverride : function(character) {
		if (!character.targetPlayer.isTranslucent) {
			if (this.hasHit == null) {
				var damageDone = character.applyDamage(this.damage);
				this.character.heal(damageDone);
				this.hasHit = true;
			} 
		}
	},
	isInRange : function(character, w, h) {
		return GameHelper.isInRangeDirectional(character, w, h);
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Fireball', '',  {
	defaults : {
		speed : Global.defaultBulletSpeed,
		damage : 15,
		type: 'Range',
		spriteName : 'fireball',
		maxActive : 2,
		cooldown : 600,
		w : Global.playerCharacter.width * 0.3125,
		h : Global.playerCharacter.height * 0.15,
		additionalDescription : "Project grows in width and increases amount of damage done over distance"
	},	
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		this.myTween = this.myTweenOverride;
	
		character.doRange(character.direction, this.abilityName, this, null);			
		Global.playSound('fireBreath');
	},	
	myTweenOverride : function () {
		this.origin("center");
		var bullet = this;
		var curRotation = bullet.rotation;
		var abilityEntity = this;
		bullet.alpha = 0.25;
		abilityEntity.damage *= 0.25;
		Crafty.e("Delay").delay(function() {			
			if (bullet.isDead) {
				this.destroy();
			}		
			var curAlpha = bullet.alpha;
			var newAlpha = curAlpha * 1.01;
			if (newAlpha > 1) {
				newAlpha = 1;
			}
			bullet.alpha = newAlpha;
			var newH = bullet.h * 1.015;
			if (newH < (Global.playerCharacter.height * 0.5)) {
				bullet.h = newH;				
			} else{
				bullet.w *= 1.015;
			}
			abilityEntity.damage *= 1.02;
			if (abilityEntity.damage > abilityEntity.defaults.damge) {
				abilityEntity.damage = abilityEntity.defaults.damge;
			}
			var rotateAmount = 0;			
			bullet.rotation += rotateAmount;			
			if (Math.abs(curRotation - bullet.rotation) > 5) {
				bullet.rotation = curRotation;
			}
		}, 10, -1);
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});



GameHelper.createAbilityComponent('Fire Heal', '', {
	defaults : {
		heal : 10,
		type : "Heal",
		cooldown : 40000,
		maxActive : 100,
		spriteName : "fireHeal"
	},
	initAbility : function (character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		var date = new Date();
		var curTime = date.getTime();
	
		character.abilitiesInfo[this.abilityName].lastUsed = curTime;

		character.heal(this.heal);
		Global.playSound('fireHeal');
		
	},
	
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});



GameHelper.createAbilityComponent('Ice Shock', '',  {
	defaults : {
		speed : 'n/a',
		damage : 20,
		w:  Global.playerCharacter.width * 3,
		h:  Global.playerCharacter.width /2,
		type: 'Melee',
		spriteName : 'iceShock',
		maxActive : 2,
		cooldown : 1000,
		delayAfterAttack : 250
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		Global.playSound('iceShock');
		var direction = character.direction;
		this.reposition(direction, character);
		
		this.onHit(character.targetPlayerType, function(data) {
			this.applyDamage(data[0].obj);
		});
		character.doMelee(character.direction, this.abilityName, this, true);
	},
	
	isInRange : function(character, w, h) {
		return GameHelper.isInRangeDirectional(character, w, h);
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Shards of Ice', '',  {
	defaults : {
		speed : Global.defaultBulletSpeed+2,
		damage : 20,
		type: 'Range Omni-directional',
		spriteName : 'shardsOfIce',
		maxActive : 8,
		cooldown : 10000,
		w:  Global.playerCharacter.width /2,
		h:  Global.playerCharacter.width /8,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		var abilityEntity = this;
		var bullets = [];
		var directions = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];
		bullets.push(this);
		for (var i = 0; i < directions.length-1; i++) {
			var bullet = Crafty.e(this.abilityName);
		
			bullets.push(bullet);
		}
		for (var i = 0; i < bullets.length; i++) {
			
			var bullet = bullets[i];
			GameHelper.copyDefaultsToThis(this.defaults, bullet);
			bullet.character = character;
			var direction = directions[i];
			bullet.character = character;
			bullet.addComponent("Range");			
			bullet.addComponent(this.spriteName);
			bullet.attr({
				w: abilityEntity.defaults.w,
				h: abilityEntity.defaults.h
			});
			character.createBullet(direction, this.abilityName, bullet, null);		
			character.addBulletEvents(direction, this.abilityName, bullet);
		}
	
		Global.playSound('iceShard');
	},	
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Rock Pellet', '', {
	defaults : {
		speed : Global.defaultBulletSpeed+1,
		damage : 20,
		type : 'Range',
		spriteName : 'rockPellet',
		maxActive : 3,
		cooldown : 400,
		w:  Global.playerCharacter.width /2,
		h:  Global.playerCharacter.width /8,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		character.doRange(character.direction, this.abilityName, this, null);		
		Global.playSound('rockPellet');
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Rock Armour', '', {
	defaults : {
		duration : 3000,
		cooldown : 15000,
		damageDecreasePercentage : 75,
		maxActive : 100,
		spriteName : "rockArmour",
		type : 'Buff'
	},
	initAbility : function (character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		var abilityEntity = this;
		var date = new Date();
		var curTime = date.getTime();
		
		character.damageDecreasePercentage += abilityEntity.damageDecreasePercentage;
		character.abilitiesInfo[this.abilityName].lastUsed = curTime;

		character.topHUD.buffs[this.abilityName] = { lastUsed : curTime, duration : this.duration, type: "friendly"};
		Global.playSound('rockArmour');
		character.switchSprite(character.spriteName + "RockArmour", character.getFrames());
		//character.addComponent("SpriteColor");
		//character.spriteColor(255, null, null, null);
	
		if (character.has("Fourway")) {
			character.fourway(character.characterSpeed);
			character.stopOnSolids(); // should be called when fourway is changed
		}
		Crafty.e("Delay").delay(function() {
			character.damageDecreasePercentage -= abilityEntity.damageDecreasePercentage;
			//character.removeComponent("SpriteColor");
			character.restoreDefaultSprite();
			if (!character.isDead) {
				if (character.has("Fourway")) {				
					character.fourway(character.characterSpeed);
					character.stopOnSolids(); // should be called when fourway is changed
				}
			}
		}, this.duration, 0);
	},
	
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Hurricane', '', {
	defaults : {
		w:  Global.playerCharacter.width * 3,
		h: Global.playerCharacter.height * 3,
		damage : 13,
		speed: 'n/a',
		type : 'Melee',
		spriteName : 'hurricane',
		maxActive : 100,
		cooldown : 6000,
		duration : 3000,
		delayAfterAttack : 0,
		nextDamgeInterval : 500, // in ms
		lastHitTime : null,
		additionalDescription : 'Melee attack that moves with the player and inflicts damage when opponent is inside the hurricane'
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		var abilityEntity = this;
		this.x = character.x - (this.w - character.w)/2;
		this.y = character.y - (this.h - character.h)/2;
		var sound = Global.playSound('hurricane');
		this.bind(
				"EnterFrame",
				function() {
					if (!character.isDead) {
						this.origin("center");
						this.x = character.x - (this.w - character.w)/2;
						this.y = character.y - (this.h - character.h)/2;						
						this.alpha *= 0.99;
						sound.volume *= 0.99;
						this.rotation += 1;
					} else {
						character.removeMelee(this, abilityEntity.abilityName);
						abilityEntity.destroy();	
						sound.volume = 0.0;
					}
				}
		);		
		Crafty.e("Delay").delay(function() {
			try {
				//if (!character.isDead) {
					character.removeMelee(this, abilityEntity.abilityName);
					abilityEntity.destroy();	
					sound.volume = 0.0;
				//}
			} catch (e) {
				console.log(e);
			}
		}, this.duration, 0);
		this.onHit('HUDContainer', function(data) {	
			
		});
		this.onHit(character.targetPlayerType, function(data) {
			if (!character.targetPlayer.isTranslucent) {
				this.applyDamageOverride(character.targetPlayer);
			}
		});		
	},	
	applyDamageOverride : function(character) {
		var date = new Date();
		var curTime = date.getTime();
		if (this.lastHitTime == null || (curTime - this.lastHitTime) > this.nextDamgeInterval) {
			character.applyDamage(this.damage);
			this.lastHitTime = curTime;
			this.damage /= 2;
		}
	},	
	isInRange : function(character, w, h) {		
		return GameHelper.isInRangeExplosion(character, w, h);
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});

GameHelper.createAbilityComponent('Fade', '', {
	defaults : {
		duration : 3000,
		cooldown : 10000,	
		maxActive : 100,
		character : null,
		spriteName : "fade",
		type : "Buff",
		additionalDescription : "Become translucent (opponent's attacks will go through you)"
	},
	
	initAbility : function (character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		var abilityEntity = this;
		var date = new Date();
		var curTime = date.getTime();
		//var origCharacterSpeed = character.characterSpeed;
		//var origArmour = character.armour;		
		character.abilitiesInfo[this.abilityName].lastUsed = curTime;

		character.topHUD.buffs[this.abilityName] = { lastUsed : curTime, duration : this.duration, type: "friendly"};
		Global.playSound('fadeOut');
		
//		character.spriteColor(255, null, null, null);
		character.becomeTranslucent();
		/*
		character.removeComponent(character.spriteName);
		character.addComponent(this.spriteName);
		character.spriteName = this.spriteName;
		
		character.reel(this.spriteName + "Reel", 600, this.getFrames());
		character.animate(this.spriteName + "Reel", this.duration/600);							
		character.w = Global.playerCharacter.width;
		character.h = Global.playerCharacter.height;
		*/
		character.switchSprite(character.spriteName + "Fade", this.getFrames());
		
		if (character.has("Fourway")) {
			character.fourway(character.characterSpeed);
			character.stopOnSolids(); // should be called when fourway is changed
		}
		Crafty.e("Delay").delay(function() {
			
			if (!character.isDead) {
				Global.playSound('fadeOut');
				character.becomeUntranslucent();
				/*
				character.removeComponent(abilityEntity.spriteName);
				character.addComponent(character.defaults.spriteName);
				character.spriteName = character.defaults.spriteName;
				character.w = Global.playerCharacter.width;
				character.h = Global.playerCharacter.height;
				*/
				character.restoreDefaultSprite();
				if (character.has("Fourway")) {	
					character.fourway(character.characterSpeed);
					character.stopOnSolids(); // should be called when fourway is changed
				}
			}
		}, this.duration, 0);
	},
	
	getFrames : function() {
		//return [[0, 0], [300, 0], [600, 0], [900, 0]];
		return this.character.getFrames();
	},
	
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});

GameHelper.createAbilityComponent('Crimson Fire', '',  {
	defaults : {
		speed : Global.defaultBulletSpeed+2,
		damage : 13,
		type: 'Range',
		spriteName : 'crimsonFire',
		maxActive : 2,
		cooldown : 400,
		w:  Global.playerCharacter.width,
		h:  Global.playerCharacter.width /2,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		character.doRange(character.direction, this.abilityName, this, null);		
		Global.playSound('crimsonFire');
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Fire Dance', '', {
	defaults : {
		duration : 5000,
		cooldown : 16000,
		speedIncrease : 2,
		maxActive : 100,
		character : null,
		spriteName : "fireDance",
		type : 'Buff'
	},
	initAbility : function (character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		var abilityEntity = this;
		var date = new Date();
		var curTime = date.getTime();
		
		character.characterSpeed += abilityEntity.speedIncrease;
		character.abilitiesInfo[this.abilityName].lastUsed = curTime;

		character.topHUD.buffs[this.abilityName] = { lastUsed : curTime, duration : this.duration, type: "friendly"};
		var sound = Global.playSound('fireDance');
		var effectSprite = Crafty.e("2D, Canvas, FlipOnTargetPlayer, " + "fireDance");
		effectSprite.w = character.w;
		effectSprite.h = character.h;	
		effectSprite.alpha = 0.5;
		effectSprite.bind(
				"EnterFrame",
				function() {
					if (character.isDead) {
						this.destroy();
					} else {
						this.flipIfNecessary(character, character.targetPlayer);		
						this.x = character.x;
						this.y = character.y;
						this.h = character.h;
						this.alpha *= 0.9975;
						var yChange = character.h*0.1*Math.random();
						this.y += yChange;
						this.h -= yChange;
					}
				}
		);
	
		if (character.has("Fourway")) {
			character.fourway(character.characterSpeed);
			character.stopOnSolids(); // should be called when fourway is changed
		}
		Crafty.e("Delay").delay(function() {
			character.characterSpeed -= abilityEntity.speedIncrease;
			if (sound != null) {
				sound.volume = 0;
			}
			//character.removeComponent("SpriteColor");
			effectSprite.destroy();
			if (!character.isDead) {
				if (character.has("Fourway")) {				
					character.fourway(character.characterSpeed);
					character.stopOnSolids(); // should be called when fourway is changed
				}
			}
		}, this.duration, 0);
	},
	
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});

GameHelper.createAbilityComponent('Slime Blast', '',  {
	defaults : {
		speed : Global.defaultBulletSpeed,
		damage : 10,
		type: 'Range',
		spriteName : 'slimeBlast',
		maxActive : 3,
		cooldown : 1500,
		w : Global.playerCharacter.width * 0.5,
		h : Global.playerCharacter.height * 0.25,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		character.doRange(character.direction, this.abilityName, this, null);		
		Global.playSound('slimeBlast');
	},
	
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Circus of Slime', '',  {
	defaults : {
		speed : Global.defaultBulletSpeed-3,
		damage : 16,
		type: 'n/a',
		spriteName : 'circusOfSlimeIcon',
		maxActive : 4,
		cooldown : 10000,
		type : 'Range Omni-directional',
		w : Global.playerCharacter.width * 0.5,
		h : Global.playerCharacter.height * 0.25,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		var abilityEntity = this;
		var bullets = [];
		var directions = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];
		bullets.push(this);
		for (var i = 0; i < directions.length-1; i++) {
			var bullet = Crafty.e(this.abilityName);
		
			bullets.push(bullet);
		}
		for (var i = 0; i < bullets.length; i++) {
			
			var bullet = bullets[i];
			GameHelper.copyDefaultsToThis(this.defaults, bullet);
			bullet.character = character;
			var direction = directions[i];
			bullet.character = character;
			bullet.addComponent("Range");	
			bullet.addComponent("SpriteAnimation");
		
			var spriteName = this.spriteName;
			spriteName = spriteName.replace("Icon", "");
			bullet.addComponent(spriteName);
			bullet.reel(this.spriteName + "Reel", 600, this.getFrames());		
			bullet.animate(this.spriteName + "Reel", -1);		
			
			bullet.attr({
				w: abilityEntity.defaults.w,
				h: abilityEntity.defaults.h
			});
			character.createBullet(direction, this.abilityName, bullet, null);		
			character.addBulletEvents(direction, this.abilityName, bullet);
		}
	
		Global.playSound('circusOfSlime');
	},	
	
	getFrames : function() {
		return GameHelper.getFrames();
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});




GameHelper.createAbilityComponent('Strangling Branches', '',  {
	defaults : {
		speed : 'n/a',
		damage : 20,
		w:  Global.playerCharacter.width * 1.5,
		h:  Global.playerCharacter.height /2,
		type: 'Melee',
		spriteName : 'stranglingBranches',
		maxActive : 2,
		cooldown : 1000,
		delayAfterAttack : 250
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		Global.playSound('stranglingBranches');
		var direction = character.direction;
		this.reposition(direction, character);
		
		this.onHit(character.targetPlayerType, function(data) {
			if (!character.targetPlayer.isTranslucent) {
				this.applyDamage(data[0].obj);
			}
		});
		character.doMelee(character.direction, this.abilityName, this, true);
	},
	
	isInRange : function(character, w, h) {
		return GameHelper.isInRangeDirectional(character, w, h);
	},
	
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});

GameHelper.createAbilityComponent('Entangling Vines', '',  {
	defaults : {
		speed : 'n/a',
		damage : 0,
		w:  Global.playerCharacter.width * 4.5,
		h:  Global.playerCharacter.height /2,
		type: 'Melee',
		spriteName : 'entanglingVines',
		spriteNameLong : 'entanglingVinesLong',
		effectSpriteName : 'vineTrap',
		duration : 3000,
		maxActive : 2,
		cooldown : 5000,
		delayAfterAttack : 250,
		additionalDescription : "Entangles the opponent so it cannot move or cast any abilities"
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteNameLong);
		this.requires(this.type);
		this.resize();
		Global.playSound('entanglingVines');
		var direction = character.direction;
		this.reposition(direction, character);
		var abilityEntity = this;
		this.onHit(character.targetPlayerType, function(data) {
			if (!character.targetPlayer.isTranslucent) {		
				character.targetPlayer.freeze(true);
				var effectSprite = Crafty.e("2D, Canvas, " + abilityEntity.effectSpriteName);
				effectSprite.w = character.targetPlayer.w;
				effectSprite.h = character.targetPlayer.h/2;					
				effectSprite.x = character.targetPlayer.x;
				effectSprite.y = character.targetPlayer.y + 0.5*character.targetPlayer.h;
				character.targetPlayer.attach(effectSprite);
			
				var date = new Date();
				var curTime = date.getTime();
				var duration = this.duration;
				character.targetPlayer.topHUD.buffs[abilityEntity.abilityName] = { lastUsed : curTime, duration : duration, type: "hostile"};
				Crafty.e("Delay").delay(function() {
					if (!character.isDead) {
						character.targetPlayer.unfreeze(true);
						effectSprite.destroy();						
					}
				}, duration, 0);				
			}
		});
		character.doMelee(character.direction, this.abilityName, this, true);
	},
	
	isInRange : function(character, w, h) {
		return GameHelper.isInRangeDirectional(character, w, h);
	},
	
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Chaos Bolt', '', {
	defaults : {
		speed : Global.defaultBulletSpeed+2,
		damage : 40,
		type : 'Range',
		spriteName : 'chaosBolt',
		maxActive : 3,
		cooldown : 600,
		w : Global.playerCharacter.width * 0.9375,
		h : Global.playerCharacter.height * 0.1875,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		character.doRange(character.direction, this.abilityName, this, null);		
		Global.playSound('chaosBolt');
	},
	
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});

GameHelper.createAbilityComponent('Chaos Orb', '', {
	defaults : {
		speed : 2,
		damage : 140,
		type : 'Range',
		spriteName : 'chaosOrb',
		maxActive : 1,
		cooldown : 5000,
		w : Global.playerCharacter.width * 0.9375,
		h : Global.playerCharacter.height * 0.9375,
	},
	initAbility : function(character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.requires(this.type);
		this.resize();
		character.doRange(character.direction, this.abilityName, this, null);		
		Global.playSound('chaosOrb');
	},
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});


GameHelper.createAbilityComponent('Elemental Advantage : Fire cone', '', {
	defaults : {
		speed : Global.defaultBulletSpeed,
		cooldown : 1000,
		damage : 80,
		//dot : [5, 250],
		duration: 3000,
		maxActive : 3,
		character : null,
		spriteName : "fireCone",
		type: "Range",
		w : Global.playerCharacter.width * 1.25,
		h : Global.playerCharacter.height,
		additionalDescription : "Only usable on water elementals"
	},
	getFrames : function() {
		//return [[0, 0], [300, 0], [600, 0], [900, 0]];
		return GameHelper.getFrames();
	},
		
	initAbility : function (character) {
		GameHelper.copyDefaultsToThis(this.defaults, this);
		this.character = character;
		this.addComponent(this.spriteName);
		this.addComponent("SpriteAnimation");
		this.requires(this.type);
		this.resize();
	
		Global.playSound('fireCone');
		this.reel(this.spriteName + "Reel", 600, this.getFrames());		
		this.animate(this.spriteName + "Reel", -1);		
		character.doRange(character.direction, this.abilityName, this, null);					
	},
			
	getDescription : function(level) {
		return GameHelper.getAbilityDescription(this, level);
	}
});
