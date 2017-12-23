Crafty.c('MeleeCharacter', {
	
});
Crafty.c('ShooterCharacter', {
	
});


Crafty.c('Character', {
	isDead : false,
	characterSpeed : Global.defaultSpeed,
	characterSpeedReset : Global.defaultSpeed,
	curHealth : Global.defaultMaxHealth,
	maxHealth : Global.defaultMaxHealth,
	level : 0,
	damageMultiplier : 1, // scales with Level (and set to 0 on death)
	healMultiplier : 1, // scales with Level
	topHUD : null,	
	targetPlayer : null,
	isFrozen : false,
	isCaptured : false,
	damageDecreasePercentage : 0,
	
	init : function() {
		this.requires('FlipOnTargetPlayer, Actor, Collision');
				
		this.bind("EnterFrame", function() {
			//hud.refresh();
		});
	},
	
	removeBullet : function(bullet, abilityName) {
		bullet.destroy();
		bullet.isDead = true;
		try {
			this.abilitiesInfo[abilityName].curCount--;
		} catch (e) {}
	},
	
	removeMelee : function(melee, abilityName) {
		melee.destroy();
		melee.isDead = true;
		try {
			this.abilitiesInfo[abilityName].curCount--;
		} catch (e) {}	
	},

	applyDamage : function(damage) {	
		if (damage != Number.MAX_VALUE) {
			damage *= this.targetPlayer.damageMultiplier;
			
			damage *= this.getElementalDamageMultiplier(this.elementalType, this.targetPlayer.elementalType);
			damage /= this.getElementalDamageReductionMultiplier(this.targetPlayer.elementalType, this.elementalType);
			
			damage -= (damage * this.damageDecreasePercentage/100);
		}
		
		if (damage < 0) {
			damage = 0;
		}
		var origHealth = this.curHealth;
		this.curHealth -= damage;
		Global.playSound('damage');
		return Math.min(origHealth, damage);
	},
	
	getElementalDamageMultiplier : function(hitElementalType, hitterElementalType) {
		return this.getElementalDamageOrReductionMultiplier(hitElementalType, hitterElementalType, Global.elementalDamageMultiplier);
	},
	getElementalDamageReductionMultiplier : function(hitElementalType, hitterElementalType) {
		return this.getElementalDamageOrReductionMultiplier(hitElementalType, hitterElementalType, Global.elementalDamageReductionMultiplier);
	},
	
	
	
	getElementalDamageOrReductionMultiplier : function(hitElementalType, hitterElementalType, multiplier) {
		var retval = 1;
		if (hitElementalType == "fire" && hitterElementalType == "water") {
			retval = multiplier;
		} else if (hitElementalType == "water" && hitterElementalType == "earth") {
			retval = multiplier;
		} else if (hitElementalType == "earth" && hitterElementalType == "air") {
			retval = multiplier;
		} else if (hitElementalType == "air" && hitterElementalType == "fire") {
			retval = multiplier;
		}
		return retval;
	},
	
	heal : function(amount) {
		amount *= this.healMultiplier;
		this.curHealth += amount;
		if (this.curHealth > this.maxHealth) {
			this.curHealth = this.maxHealth;
		}
	},
	
	setTopHUD : function(topHUD) {
		this.topHUD = topHUD;
		//HUD.setCharacter(this);
	},
	
	
	
	// Registers a stop-movement function to be called when
	// this entity hits an entity with the "Solid" component
	stopOnSolids : function() {
		var curEntity = this;
		this.onHit('Solid', function () {
			curEntity.stopMovement();
		});
		
		return this;
	},

	// Stops the movement
	stopMovement : function() {		
	
		if (this._movement) {
			this.x -= (this._movement.x);
			this.y -= (this._movement.y);
		} 
		
	},
	
	
	resetCharacterSpeed : function() {		
		this.characterSpeed = this.characterSpeedReset;
	},
	
	resetIfOutOfBounds : function() {
//		var largestXVal = Game.width() - Game.map_grid.tile.width - this.w+2;
//		var largestYVal = Game.height() - Game.map_grid.tile.height - this.h;
//		var smallestYVal = Game.hud_height;
//		var smallestXVal = this.w/2;
//		if (this.x > largestXVal) {
//			this.x = largestXVal;
//		}
//		if (this.x < smallestXVal) {
//			this.x = smallestXVal;
//		}
//		if (this.y > largestYVal) {
//			this.y = largestYVal;
//		}
//		if (this.y < smallestYVal) {
//			this.y = smallestYVal;
//		}
		if (this.hit("Solid")) {
			var questionableX = this.x;
			var questionableY = this.Y;
			this.x = this.previousX;
			if (this.hit("Solid")) {
				this.x = questionableX;
				this.y = this.previousY;
				if (this.hit("Solid")) {
					this.x = this.previousX;
					this.y = this.previousY;
				}
			}
			
		}
		
		//this.resetCharacterSpeed();
	},
	
	addX : function(amount) {
		this.x = this.x + amount;
	},
	addY : function(amount) {
		this.y = this.y + amount;
	},
	
	canFire : function(abilityName) {	
		if (this.isFrozen) {
			return false;
		}
		
		if (GameHelper.abilities[abilityName].component.defaults.maxActive > this.abilitiesInfo[abilityName].curCount) {
			var date = new Date();
			var curTime = date.getTime();
			return ((curTime - this.abilitiesInfo[abilityName].lastUsed) > GameHelper.abilities[abilityName].component.defaults.cooldown);
		} else {
			return false;
		}
	},
	
	canMelee : function(abilityName) {	
		if (this.isFrozen) {
			return false;
		}
			
		if (GameHelper.abilities[abilityName].component.defaults.maxActive > this.abilitiesInfo[abilityName].curCount) {
			var date = new Date();
			var curTime = date.getTime();
			return ((curTime - this.abilitiesInfo[abilityName].lastUsed) > GameHelper.abilities[abilityName].component.defaults.cooldown);
		} else {
			return false;
		}	
	},
	
	canDoAbility : function(abilityName, abilityInfo) {		
		if (this.isFrozen) {
			return false;
		}
		var date = new Date();
		var curTime = date.getTime();
	
		
		if (abilityName == null) {
			return false;
		} else {
			if (abilityInfo.curCount >= GameHelper.abilities[abilityName].component.defaults.maxActive) {
				return false;
			} else {			
				return ((curTime - abilityInfo.lastUsed) > GameHelper.abilities[abilityName].component.defaults.cooldown);
			}
		}
	},
	
	doAnimation : function () {
		if (!this.isDead) {
			//this.stop();

			if (this.direction == 'e') {
				if (!this.isPlaying(this.spriteName + "RightReel")) {			
					this.animate(this.spriteName + "RightReel", -1);
				}
			} else if (this.direction == 'w') {
				if (!this.isPlaying(this.spriteName + "LeftReel")) {		
					this.animate(this.spriteName + "LeftReel", -1);
				}
			} else if (this.direction == 's') {
				if (!this.isPlaying(this.spriteName + "DownReel")) {		
					this.animate(this.spriteName + "DownReel", -1);
				}
			} else if (this.direction == 'n') {
				if (!this.isPlaying(this.spriteName + "UpReel")) {		
					this.animate(this.spriteName + "UpReel", -1);
				}
			} else {
				//this.animate(this.spriteName + "RightReel", -1);
			}
		}
	},
	
	characterInit : function() {
		var character = this;
		if (this.defaults != null) {
			$.extend(true, character, character.defaults);
		}
		
		if (this.has("Fourway")) {
			this.fourway(this.characterSpeed);
			this.stopOnSolids();
		}
		this.characterSpeedReset = this.characterSpeed;
		//this.maxHealthWithRest = this.curHealth;
		this.requires('Actor, Character, SpriteAnimation');
		
		/*
		if (Global.imgMapAssets[this.spriteName + "Up"] != null) {
			this.addComponent(this.spriteName + "Up");
		}
		if (Global.imgMapAssets[this.spriteName + "Down"] != null) {
			this.addComponent(this.spriteName + "Down");
		}
		*/
		this.addComponent(this.spriteName);
		this.attr({
			w: Global.playerCharacter.width,
			h: Global.playerCharacter.height 
		});
		//var frames =  this.getFrames();
	
		
		this.reel(this.spriteName + "LeftReel", 600, Global.imgMapAssets[this.spriteName].leftFrames);
		this.reel(this.spriteName + "RightReel", 600, Global.imgMapAssets[this.spriteName].rightFrames);
		if (Global.imgMapAssets[this.spriteName].downFrames != null) {
			this.reel(this.spriteName + "DownReel", 600, Global.imgMapAssets[this.spriteName].downFrames);
		} else {
			this.reel(this.spriteName + "DownReel", 600, Global.imgMapAssets[this.spriteName].rightFrames);
		}
		if (Global.imgMapAssets[this.spriteName].upFrames != null) {
			this.reel(this.spriteName + "UpReel", 600, Global.imgMapAssets[this.spriteName].upFrames);
		} else {
			this.reel(this.spriteName + "UpReel", 600, Global.imgMapAssets[this.spriteName].rightFrames);
		}
	},
	

	getFrames : function() {
		if (this.direction == 'e') {
			return Global.imgMapAssets[this.spriteName].rightFrames;
		} else if (this.direction == 'w') {
			return Global.imgMapAssets[this.spriteName].leftFrames;
		} else if (this.direction == 's') {
			if (Global.imgMapAssets[this.spriteName].downFrames != null) {
				return Global.imgMapAssets[this.spriteName].downFrames;
			} else {
				return Global.imgMapAssets[this.spriteName].rightFrames;
			}
		}  else if (this.direction == 'n') {
			if (Global.imgMapAssets[this.spriteName].upFrames != null) {
				return Global.imgMapAssets[this.spriteName].upFrames;
			} else {
				return Global.imgMapAssets[this.spriteName].rightFrames;
			}
		}
		//return [[0, 0], [Global.playerCharacter.width, 0], [Global.playerCharacter.width*2, 0], [Global.playerCharacter.width*3, 0]];
		//return GameHelper.getFrames();
	},
	
	doRange : function(direction, abilityName, bulletEntity, shouldNotRotateBullet) {
		if (!this.canFire(abilityName)) {
			return false;
		} else {
			this.abilitiesInfo[abilityName].curCount++;
			var date = new Date();
			var curTime = date.getTime();
			this.abilitiesInfo[abilityName].lastUsed = curTime;
		}
		var bullet = this.createBullet(direction, abilityName, bulletEntity, shouldNotRotateBullet);
		this.addBulletEvents(direction, abilityName, bullet);
		return true;
	},
	
	addBulletEvents : function(direction, abilityName, bullet) {
		var character = this;
		bullet.bind(
				"EnterFrame",
				function() {
					
					if (direction == "n") {
						this.y = this.y - (1*bullet.speed);
					} else if (direction == "s") {
						this.y = this.y + (1*bullet.speed);
					} else if (direction == "e") {
						this.x = this.x + (1*bullet.speed);							
					} else if (direction == "w") {
						this.x = this.x - (1*bullet.speed);		
					} 
					// diagonals
					else if (direction == "nw") {
						this.y = this.y - (1*bullet.speed);
						this.x = this.x - (1*bullet.speed);		
					} else if (direction == "ne") {
						this.y = this.y - (1*bullet.speed);
						this.x = this.x + (1*bullet.speed);		
					} else if (direction == "sw") {
						this.y = this.y + (1*bullet.speed);
						this.x = this.x - (1*bullet.speed);		
					} else if (direction == "se") {
						this.y = this.y + (1*bullet.speed);
						this.x = this.x + (1*bullet.speed);	
					}
					
					// destroy if it goes out of bounds
					if (this._x > Crafty.viewport.width || this._x < 0
							|| this._y > Crafty.viewport.height
							|| this._y < 0) {
						character.removeBullet(this, abilityName);
					}
				});
		bullet.onHit('HUDContainer', function() {
			character.removeBullet(bullet, abilityName);
		});
		/*
		bullet.defaultHitCallback = function(data) {
			var opponent = data[0].obj;
			if (!opponent.isTranslucent) {
				//character.removeBullet(bullet, abilityName);
				opponent.targetPlayer.removeBullet(bullet, abilityName);
				opponent.applyDamage(bullet.damage);
			}
		};
		*/
	
		bullet.onHit(this.targetPlayerType, bullet.createHitCallback(bullet, abilityName));		
	},
	

	
	createBullet : function(direction, abilityName, bulletEntity, shouldNotRotateBullet) {
		var bullet = null;
		if (bulletEntity != null) {
			bullet = bulletEntity;
		} else {
			bullet = Crafty.e(abilityName); 
			bullet.initAbility(this);
		}
		bullet.character = this;
		bullet.direction = direction;
		bullet.attr({
			x : bullet.character._x + (bullet.character._w - bullet._w)/2,
			y : bullet.character._y + (bullet.character._h - bullet._h)/2
		});;
		if (shouldNotRotateBullet == null) {
			bullet.origin("center");
			if (direction == null || direction == "e") {
				bullet.rotation = 0;
			} else if (direction == "w") {
				bullet.rotation = 180;
			} else if (direction == "s") {
				bullet.rotation = 90;
			} else if (direction == "n") {
				bullet.rotation = 270;
			}
			// diagonals
			else if (direction == "nw") {
				bullet.rotation = 225;	
			} else if (direction == "ne") {
				bullet.rotation = 315;	
			} else if (direction == "sw") {
				bullet.rotation = 135;		
			} else if (direction == "se") {
				bullet.rotation = 45;	
			}
		}
		var character = this;
		bullet.alpha = character.alpha;
		bullet.attr({
			x : this._x + (character._w - bullet._w)/2,
			y : character._y + (character._h - bullet._h)/2
		});
		bullet.myTween();
		return bullet;
	},
	
	
	doMelee : function(direction, abilityName, abilityEntity, shouldNotRotate) {
		if (!this.canMelee(abilityName)) {
			return false;
		} else {
			this.abilitiesInfo[abilityName].curCount++;
			var date = new Date();
			var curTime = date.getTime();
			this.abilitiesInfo[abilityName].lastUsed = curTime;
		}
		var meleeEntity = null;
		if (abilityEntity != null) {
			meleeEntity = abilityEntity;
		} else {
			meleeEntity = Crafty.e(abilityName);
			meleeEntity.initAbility(this);
		}
		var character = this;
		character.bind("Remove", function() {
			meleeEntity.destroy();
		});
		
		if (meleeEntity.delayAfterAttack != 0) {
			character.disableControls = true;		
			character.freeze(true);
			character.pauseAnimation();
		
			Crafty.e("Delay").delay(function() {	
				try {
					if (!character.isDead) {
						character.removeMelee(this, abilityName);
						meleeEntity.destroy();
						character.disableControls = false;
						character.unfreeze(true);
						character.resumeAnimation();
					}
				} catch (e) {
					console.log(e);
					// character may be destroyed
				}
			}, meleeEntity.delayAfterAttack, 0);
		}
		
		return true;
	},
	
	createMelee : function () {
		var meleeEntity = this.createMeleeEntity();
		meleeEntity.character = this;
		return meleeEntity;
	},
	
	getAbilityNameAndInfo : function (index) {
		var abilityName = null;
		var abilityInfo = null;
		var count = 0;
		jQuery.each(this.abilitiesInfo, function( name, value ) {
			if (count == index) {
				abilityName = name;
				abilityInfo = value;
			}
			count++;
		});
		if (abilityName == null || abilityInfo == null) {
			return null;
		} else {
			return [abilityName, abilityInfo];
		}
	},
	
	
	
	doAbility : function(abilityName, abilityInfo) {
		var date = new Date();
		var curTime = date.getTime();
		var abilityEntity = Crafty.e(abilityName);
		abilityEntity.initAbility(this);
		abilityInfo.lastUsed = curTime;
	},
	
	freeze : function(skipColorChange) {
		this.isFrozen = true;
		
		if (skipColorChange == null) {
			this.addComponent("SpriteColor");		
			this.spriteColor(null, null, 255, null);
			
		
			
			this.pauseAnimation();
		}
		if (this.has("Fourway")) {
			this.disableControls = true;
		}
	},
	
	unfreeze : function(skipColorChange) {
		if (!this.isDead) {
			this.isFrozen = false;
			
			if (skipColorChange == null) {
				this.removeComponent("SpriteColor");
				this.resumeAnimation();
			}
			if (this.has("Fourway")) {
				this.disableControls = false;
			}
		}
	},
	
	becomeTranslucent : function() {
		this.isTranslucent = true;
	},
	
	becomeUntranslucent : function() {
		this.isTranslucent = false;
	},
	
	switchSprite : function (newSpriteName, frames) {
		this.removeComponent(this.spriteName);
		this.addComponent(newSpriteName);
		this.spriteName = newSpriteName;
		
		//this.reel(this.spriteName + "RightReel", 600, frames);
		//this.animate(this.spriteName + "RightReel", -1);		
		
		this.w = Global.playerCharacter.width;
		this.h = Global.playerCharacter.height;
	},
	
	restoreDefaultSprite : function () {
		this.switchSprite(this.defaults.spriteName, this.getFrames(), -1);
	},
	

	
});

Crafty.c('PlayerCharacter', {
	targetPlayerType : 'EnemyCharacter',
	init : function() {
		this.requires('Character, Fourway');
		this.attr({
			w: Global.playerCharacter.width,
			h: Global.playerCharacter.height
		});
		// Watch for a change of direction and switch animations accordingly
		this.direction = "e";// n, e, s, w		
		//	this.fourway(this.characterSpeed);
		var character = this;
		this.bindNewDirection();
		this.bind('Moved',  function(data) {
			//this.doAnimation();
			
		});
		this.bind(
				"EnterFrame",
				function() {					
					this.flipIfNecessary(this, this.targetPlayer);
				}
		);		
		//this.stopOnSolids();
		var character = this;
		this.bind('KeyDown', function(e) {
			if (!character.isDead && !this.isFrozen) {
				
				var keyDownNumber = Input.getNumber(e);
				if (keyDownNumber == -1) {
					// keyCode 32 is space
					// keyCode 13 is enter
					if (e.keyCode == 32) {
						keyDownNumber = 1;
					} else if (e.keyCode == 13) {
						keyDownNumber = 2;
					}
				}
				if (keyDownNumber != -1) {
					var slot = Game.actionBar.slots[keyDownNumber-1];
					if (slot != null) {
						if (GameHelper.abilities[slot.name] != null && slot.name != "Capture") {
							var abilityName = slot.name;
							var abilityInfo = slot.abilityInfo;
							if (this.canDoAbility(abilityName, abilityInfo)) {
								this.doAbility(abilityName, abilityInfo);
							}
						} else if (slot.name == "Capture") {
							if (character.targetPlayer.isCapturable()) {
								var abilityName = slot.name;
								var abilityInfo = slot.abilityInfo;
								if (this.canDoAbility(abilityName, abilityInfo)) {
									this.doAbility(abilityName, abilityInfo);
								}
							}
						} else if (slot.name == "Swap1") {
							if (Swap.canPlayerSwap(Swap.getTeammates(character)[0].character)) {						
								Swap.swapPlayer(Swap.getTeammates(character)[0].character);					
							} 
						} else if (slot.name == "Swap2") {
							if (Swap.canPlayerSwap(Swap.getTeammates(character)[1].character)) {
								Swap.swapPlayer(Swap.getTeammates(character)[1].character);		
							}
						}					
					}
				}
			}
		});
	},
	
	
	
	bindNewDirection : function () {
		var character = this;
		this.bind('NewDirection', function(data) {
			if (!character.isDead && !character.isFrozen) {
				
				if (data.x > 0) {
					//this.animate('PlayerMovingRight', -1);
					this.direction = "e";
					this.doAnimation();
				} else if (data.x < 0) {
					//this.animate(this.spriteName + "Reel");
					//this.animate('PlayerMovingLeft', -1);
					this.direction = "w";
					this.doAnimation();
				} else if (data.y > 0) {
					//this.animate(this.spriteName + "Reel");
					//this.animate('PlayerMovingDown', -1);
					this.direction = "s";
					this.doAnimation();
				} else if (data.y < 0) {
					//this.animate(this.spriteName + "Reel");
					//this.animate('PlayerMovingUp', -1);
					this.direction = "n";
					this.doAnimation();
				} else {
					try {
						this.pauseAnimation();
					} catch (exception) {}
				}	
			}
		});
	},
	
	die : function() {
		this.pauseAnimation();
		if (this.has("Fourway")) {
			this.removeComponent("Fourway");
		}
		this.damageMultiplier = 0;
		this.destroy();
		//this.HUD.destroy();		
		if (this.isDead == false) {
			this.isDead = true;			
			if (!Swap.swapNextAliveTeammate(this)) {
				Global.playSound("death");
				Crafty.e("Delay").delay(function() {		
					Crafty.scene('YouJustDied');
				}, 3000, 0);	
			}
		}						
	},		
	
	setStartPosition : function() {
		this.attr({ x: 2, y: (Game.height() + Game.hud_height-1.5*this._h )/2});
	},
	
});

Crafty.c('EnemyCharacter', {
	targetPlayerType : 'PlayerCharacter',
	init : function() {	
		this.requires('2D, Canvas, Character');
		this.stopOnSolids();
		this.alpha = 0.75;
		this.direction = "w";// n, e, s, w		
		this.bind(
				"EnterFrame",
				function() {
					if (!this.isFrozen) {
						this.updateAttackDirection();
						this.doSecondaryAttackIfNecessary();
						this.doPrimaryAttackIfNecessary();
						this.doMovement(this.getAbilityNameAndInfo(0)[0]); // primary ability
						
						
						this.doAnimation();
						this.flipIfNecessary(this, this.targetPlayer);
					}
				});
	},
	
	updateAttackDirection : function() {
		var deltaX = Math.abs(this.targetPlayer.x - this.x);
		var deltaY = Math.abs(this.targetPlayer.y - this.y);
		var hasSameXaxis = (deltaX <= this.targetPlayer.h/2);
		var hasSameYaxis = (deltaY <= this.targetPlayer.w/2);
		if (hasSameXaxis) {
			if (this.y > this.targetPlayer.y) {
				this.direction = "n";
			} else {
				this.direction = "s";
			}
		}
		if (hasSameYaxis) {
			if (this.x > this.targetPlayer.x) {
				this.direction = "w";
			} else {
				this.direction = "e";
			}
		}
	},
	
	
	doSecondaryAttackIfNecessary : function() {
		var abilityName = null;
		var abilityInfo = null;
		var abilityNameAndInfo = this.getAbilityNameAndInfo(1);
		
		if (abilityNameAndInfo != null) {
			abilityName = abilityNameAndInfo[0];
			abilityInfo = abilityNameAndInfo[1];
			
			if (GameHelper.abilities[abilityName].component.defaults.type == "Melee") {			
				if (!(GameHelper.abilities[abilityName].component.isInRange(this, 
						GameHelper.abilities[abilityName].component.defaults.w,
						GameHelper.abilities[abilityName].component.defaults.h
						))) {
					return false;
				}
			} else if (GameHelper.abilities[abilityName].component.defaults.type == "Heal") {			
				if (this.curHealth == this.maxHealth) {
					return false;
				}
			}
			
			if (this.canDoAbility(abilityName, abilityInfo)) {	
				this.doAbility(abilityName, abilityInfo);
			}
		}
	},
	
	doPrimaryAttackIfNecessary : function() {
		var abilityNameAndInfo = this.getAbilityNameAndInfo(0);
		var abilityName = abilityNameAndInfo[0];
		//var abilityInfo = abilityNameAndInfo[1];
		
		if (GameHelper.abilities[abilityName].component.defaults.type == "Range") {
			if (this.isInRangeAxis()) {
				this.doRange(this.direction, abilityName);
			}	
		} else if (GameHelper.abilities[abilityName].component.defaults.type == "Melee") {
			if (GameHelper.abilities[abilityName].component.isInRange(this, 
					GameHelper.abilities[abilityName].component.defaults.w,
					GameHelper.abilities[abilityName].component.defaults.h
					)) {
				this.doMelee(null, abilityName);
			}
			//this.doMeleeIfNecessary(this.primaryAbility);
			
//				var deltaX = Math.abs(this.targetPlayer.x - this.x);
//				var deltaY = Math.abs(this.targetPlayer.y - this.y);
//				var rangeWidth = GameHelper.abilities[this.primaryAbility].component.defaults.rangeWidth;
//				var rangeHeight = GameHelper.abilities[this.primaryAbility].component.defaults.rangeHeight;
//				if (deltaX < rangeWidth/2 && deltaY < rangeHeight/2) {
//					this.doMelee(null, abilityName);
//				}
//			},
		//	
			
		}
	},
	doMovement : function(abilityName) {
		if (!this.isFrozen) {
			if (GameHelper.abilities[abilityName].component.defaults.type == "Range") {
				this.doShooterMovement(abilityName);
			} else if (GameHelper.abilities[abilityName].component.defaults.type == "Melee") {
				this.doMeleeMovement(abilityName);
			}
		}
	},
	doShooterMovement : function(abilityName) {
		var character = this;
		if (!this.canFire(abilityName)) {						
			this.moveAwayFromTargetPlayer();
		} else {
			if (character.has("MeleeCharacter")) {
				if (this.targetPlayer.has("MeleeCharacter") && !character.canMelee(abilityName)) {
					this.moveAwayFromTargetPlayer();
				} else {
					this.moveTowardsTargetPlayer();
				}
			} else {
				if (this.targetPlayer.has("MeleeCharacter")) {
					this.moveAwayFromTargetPlayer();
				} else {
					this.moveTowardsTargetPlayer();
				}
			}
			//this.moveTowardsTargetPlayer();
			//this.moveAwayFromTargetPlayer();
		}
	},
	doMeleeMovement : function(abilityName) {
		if (this.targetPlayer.has("MeleeCharacter") && !this.canMelee(abilityName)) {
			this.moveAwayFromTargetPlayer();
		} else {
			this.moveTowardsTargetPlayer();
		}		
	},
	
	isInRangeAxis : function() {
		var deltaX = Math.abs(this.targetPlayer.x - this.x);
		var deltaY = Math.abs(this.targetPlayer.y - this.y);
		var hasSameXaxis = (deltaX <= this.targetPlayer.h/2);
		var hasSameYaxis = (deltaY <= this.targetPlayer.w/2);
		if (hasSameXaxis) {
			if (this.y > this.targetPlayer.y) {
				this.direction = "n";
			} else {
				this.direction = "s";
			}
		}
		if (hasSameYaxis) {
			if (this.x > this.targetPlayer.x) {
				this.direction = "w";
			} else {
				this.direction = "e";
			}
		}
		return hasSameXaxis || hasSameYaxis;
	},
		
	
//	doRangeIfNecessary : function(abilityName) {
//		if (this.isInRangeAxis()) {
//			this.doRange(this.direction, abilityName);
//		}
//	},
//	
	
	
	
//	doMeleeIfNecessary : function(abilityName) {
//		var deltaX = Math.abs(this.targetPlayer.x - this.x);
//		var deltaY = Math.abs(this.targetPlayer.y - this.y);
//		var rangeWidth = GameHelper.abilities[this.primaryAbility].component.defaults.rangeWidth;
//		var rangeHeight = GameHelper.abilities[this.primaryAbility].component.defaults.rangeHeight;
//		if (deltaX < rangeWidth/2 && deltaY < rangeHeight/2) {
//			this.doMelee(null, abilityName);
//		}
//	},
//	
	
	
	moveAwayFromTargetPlayer : function() {
		this.previousX = this.x;
		this.previousY = this.y;
		
		var character = this;
		if (character.samePositionCheckActive == null) {
			character.samePositionCheckActive = true;
			Crafty.e("Delay").delay(function() {	
				character.samePositionCheckActive = null;
				if ((character.previousX == character.x) && (character.previousY == character.y)) {
					if (character.samePositionCount == null) {
						character.samePositionCount = 1;
					} else {
						character.samePositionCount++;
					}
					if (character.samePositionCount >= 5) {
						character.samePositionCount = 0;
						if ((character.targetPlayer.y - character.y) > 0) {
							character.moveAwayYDirection = "s";
							
						} else {
							character.moveAwayYDirection = "n";
								
						}
						Crafty.e("Delay").delay(function() {	
							character.moveAwayYDirection = null;
						}, 3000, 0);
					}
				}
			}, 2000, 0);
		}
		
		if (this.moveAwayXDirection == null) {
			if ((this.targetPlayer.x - this.x) > 0) {
				this.addX(- (this.characterSpeed * 1));			
			} else {
				this.addX(this.characterSpeed * 1);
			}
		}
		
		
		if (this.moveAwayYDirection == null) {
			if ((this.targetPlayer.y - this.y) > 0) {
				this.addY(- (this.characterSpeed * 1));			
			} else {
				this.addY(this.characterSpeed * 1);
			}
		}
		this.resetIfOutOfBounds();
		
		// x-edge ?	
		if (this.previousX == this.x && Math.abs(this.targetPlayer.x - this.x) < this.targetPlayer.w*3 && this.moveAwayXDirection == null){
			if ((this.targetPlayer.x - this.x) > 0) {
				this.moveAwayXDirection = "e";
				
			} else {
				this.moveAwayXDirection = "w";
					
			}
			var character = this;
			Crafty.e("Delay").delay(function() {	
				character.moveAwayXDirection = null;
			}, 3000, 0);
		}
		
	
		// y-edge ?	
		if (this.previousY == this.y && Math.abs(this.targetPlayer.y - this.y) < this.targetPlayer.h*3 && this.moveAwayYDirection == null){
			if ((this.targetPlayer.y - this.y) > 0) {
				this.moveAwayYDirection = "s";
				
			} else {
				this.moveAwayYDirection = "n";
					
			}
			
			Crafty.e("Delay").delay(function() {	
				character.moveAwayYDirection = null;
			}, 3000, 0);
		}
		
		if (this.moveAwayXDirection != null) {
			if (this.moveAwayXDirection == "e") {
				this.addX(this.characterSpeed * 1);
			} else {
				this.addX(- (this.characterSpeed * 1));		
			}
		}
		if (this.moveAwayYDirection != null) {
			if (this.moveAwayYDirection == "s") {
				this.addY(this.characterSpeed * 1);
			} else {
				this.addY(- (this.characterSpeed * 1));		
			}
		}
		this.resetIfOutOfBounds();
	},
	moveTowardsTargetPlayer : function() {
		this.previousX = this.x;
		this.previousY = this.y;
		if ((this.targetPlayer.x - this.x) > 0) {
			this.x = this.x + (this.characterSpeed * 1);
		} else {
			this.x = this.x - (this.characterSpeed * 1);
		}
		// randomness on x
		// if you don't have this randomness, there's a chance that the melee hit
		// would never hit the target as he is right over him
		if (this.x == this.targetPlayer.x) {
			if (Math.random() > 0.5) {
				this.x = this.x+ (this.characterSpeed * 1);
			} else {
				this.x = this.x- (this.characterSpeed * 1);
			}
		} 
		
		if ((this.targetPlayer.y - this.y) > 0) {
			this.y = this.y + (this.characterSpeed * 1);
		} else {
			this.y = this.y - (this.characterSpeed * 1);
		}
		// randomness on y
		// if you don't have this randomness, there's a chance that the melee hit
		// would never hit the target as he is right over him
		if (this.y == this.targetPlayer.y) {
			if (Math.random() > 0.5) {
				this.y = this.y+ (this.characterSpeed * 1);
			} else {
				this.y = this.y- (this.characterSpeed * 1);
			}
		} 
		
		this.resetIfOutOfBounds();
	},
	die : function() {
		this.damageMultiplier = 0;
	
		this.destroy();
		//this.HUD.destroy();
		Crafty("Bullet").each(function() {
			this.destroy();
		});
		if (this.isDead == false) {
			this.isDead = true;
			if (!Swap.swapNextAliveTeammate(this)) {
//				Global.playSound("victory");			
				Crafty.e("Delay").delay(function() {		
					Crafty.scene('Victory');
				}, 3000, 0);			
			}
		}		
	},
	
	
	isCapturable : function () {
		var retval = false;
		retval = (this.curHealth <= this.maxHealth * Game.capturableHealthPercentage);		
		return retval;
	},
	
	setStartPosition : function() {
		this.attr({ x: Game.width() -this.w-2, 
			y: (Game.height() + Game.hud_height - 1.5*this._h )/2});
	},
	
	
});