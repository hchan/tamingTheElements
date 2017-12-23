if (typeof String.prototype.endsWith !== 'function') {
    String.prototype.endsWith = function(suffix) {
        return this.indexOf(suffix, this.length - suffix.length) !== -1;
    };
}

if (typeof String.prototype.startsWith !== 'function') {
	String.prototype.startsWith = function (str){
	    return this.indexOf(str) == 0;
	};
}

var assetsLoaded = false;
var GameHelper = {
	characters : {}, 
	charactersArray : [], // selectable characters by Chapter1 and by computer
	elementalCharactersByType : {},
	abilities : {},
	sprites : {},
	scenes : {},
	
	
	copyDefaultsToThis : function (defaults, entity) {
		if (defaults != null) {
			$.extend(true, entity, defaults);
		}		
	},
	
	createCharacterComponent : function (name, description, component) {
		Crafty.c(name, component);
		this.characters[name] = {};
		this.characters[name].name = name;
		this.characters[name].description = description;
		component.defaults.characterName = name;
		this.characters[name].component = component;
		
		if (component.defaults.npc != null || component.defaults.unselectable != null) {			
			return;
		}
		if (GameHelper.elementalCharactersByType[component.defaults.elementalType] == null) {
			GameHelper.elementalCharactersByType[component.defaults.elementalType] = [];
		}
		GameHelper.elementalCharactersByType[component.defaults.elementalType].push(this.characters[name]);
		GameHelper.charactersArray.push(this.characters[name]);
	},
	
	createAbilityComponent : function (name, description, component) {
		Crafty.c(name, component);
		this.abilities[name] = {};
		this.abilities[name].name = name;
		this.abilities[name].description = description;
		component.defaults.abilityName = name;
		this.abilities[name].component = component;
	},
	
	createScene : function (name, scene) {		
		GameHelper.scenes[name] = {};
		GameHelper.scenes[name].name = name;
		GameHelper.scenes[name].scene = scene;	
		var newFunc = function() {
			GameHelper.cleanup();
			GameHelper.showCrafty();
			scene(name);
		};		
		Crafty.scene(name, newFunc);
	},
	
	createSpriteComponent : function(name, url, coordsMap) {
		var spriteMap = {};
		spriteMap[name] = coordsMap;
		if (url == null) {
			console.log(name);
			console.log("empty url");
		}
	
		Crafty.sprite(url, spriteMap);
		this.sprites[name] = {};
		this.sprites[name].name = name;
		this.sprites[name].url = url;
		this.sprites[name].coordsMap = coordsMap;
	},
	
	getRandomCharacter : function (charactersArray) {
		var randIndex = Math.floor(Math.random() * charactersArray.length);
		return charactersArray[randIndex];
	},
	
	
	
	getCharacterDisplay : function (name) {
		
		var characterName = this.characters[name].name;
		var spriteName = this.characters[name].component.defaults.spriteName;
		var urlLarge = Global.imgMapAssets[spriteName + "Large"].url;
		
	
		var tdObj = $("<td/>");
		tdObj.css("cursor", "pointer");
		var jqueryImg = $("<img/>");
		jqueryImg.addClass("characterImage");
		jqueryImg.attr("width", Game.characterDisplayWidth);
		jqueryImg.attr("height", Game.characterDisplayHeight);
		jqueryImg.attr("src", urlLarge);
		jqueryImg.attr("alt", characterName);
		
	
//		var canvas = jqueryCanvas.get(0);		
//		var context = canvas.getContext('2d');
//		var sprite = GameHelper.getSpriteByCharacterName(characterName);		
//		var imageObj = new Image();
//		imageObj.src = sprite.url;
//
//		imageObj.onload = function() {
//			context.drawImage(imageObj, sprite.coordsMap[0],sprite.coordsMap[1], sprite.coordsMap[2],sprite.coordsMap[3], 0,0, canvas.width, canvas.height);
//			//context.drawImage(img,sx,sy,swidth,sheight,x,y,width,height);
//		};
		
		tdObj.append(jqueryImg);
//		  var context = jqueryCanvas[0].getContext('2d');
//	     
//	 
//	      var imageObj = new Image();
//	      imageObj.src = "http://www.eatthedamncake.com/wordpress/wp-content/uploads/2010/05/ice-cream.jpg";
//
//	      imageObj.onload = function() {
//	        context.drawImage(imageObj, 0, 0);
//	      };	     
		return tdObj;
	},
	
	getSpriteByCharacterName : function (name) {
		var spriteName = this.characters[name].component.defaults.spriteName;
		return this.sprites[spriteName];
	},
	
	loadAssets : function (postLoadFunc) {
		$("#loadingProgress").html("");
		if (!assetsLoaded) {
			var urlList = [];
			// Load Sound
			for (var i = 0; i < Global.sndAssets.length; i++) {
				var sndAsset = Global.sndAssets[i];
				urlList.push(sndAsset);
				var sndAssetKey = sndAsset;
				sndAssetKey = sndAssetKey.replace("snd/", "");
				if (sndAsset.endsWith(".ogg")) {
					sndAssetKey = sndAssetKey.replace(".ogg", "");
					try {
						Crafty.audio.add(sndAssetKey, sndAsset);
					} catch (e) {
						console.log(e);
					}
				}		
			}
			
			// Load img assets
			$.each( Global.imgAssets, function( key, value ) {
				if (GameHelper.sprites[key] == null) { // not already loaded
					urlList.push(value.url);
					GameHelper.createSpriteComponent(key, value.url, value.coords);
					Global.imgAssets[key]["imgObj"] = new Image();
					Global.imgAssets[key]["imgObj"].onload = function(){};
					Global.imgAssets[key]["imgObj"].src = value.url;
					//console.log("key: " + key + " value: " + value);
				}
			});
			
			
			// Load img map assets
			$.each( Global.imgMapAssets, function( key, value ) {
				if (GameHelper.sprites[key] == null) { // not already loaded
					urlList.push(value.url);
					GameHelper.createSpriteComponent(key, value.url, value.coords);
					Global.imgMapAssets[key]["imgObj"] = new Image();
					Global.imgMapAssets[key]["imgObj"].onload = function(){};
					Global.imgMapAssets[key]["imgObj"].src = value.url;
					//console.log("key: " + key + " value: " + value);
				}		
			});
			
			// Load img background assets
			$.each( Global.imgBackgroundAssets, function( key, value ) {
				if (GameHelper.sprites[key] == null) { // not already loaded
					urlList.push(value.url);
					GameHelper.createSpriteComponent(key, value.url, value.coords);
					Global.imgBackgroundAssets[key]["imgObj"] = new Image();
					Global.imgBackgroundAssets[key]["imgObj"].onload = function(){};
					Global.imgBackgroundAssets[key]["imgObj"].src = value.url;
					//console.log("key: " + key + " value: " + value);
				}		
			});

			Crafty.load(urlList,
				function() {
					// 	Now that our sprites are ready to draw, start the game
//					setTimeout(function()
//				            { 
//								assetsLoaded = true;
//								postLoadFunc();		 
//							}
//						, 5000);
				
				
					assetsLoaded = true;
					postLoadFunc();					
			    },
			    function(loadingProgressObj) {
			    	//progress
			    	//console.log(loadingProgressObj);
			    	try {
			    		$("#loadingProgress").html(Math.floor(loadingProgressObj.percent) + "%");
			    	} catch (e){}
			    },
			    function(e) {
			    	//uh oh, error loading
			    	console.log("loading error" + e);
			    }
			);
		} else {
			
			postLoadFunc();
		}
	},
	
	info : function(str) {
		alert(str);
	},
	
	hideCrafty: function() {
		try {
			$("#cr-stage").hide();
		} catch(e) {}
	},
	
	showCrafty : function() {
		$("#cr-stage").show();
	},
	
	removeAllEntities : function() {
		try {
			Crafty('DOM').each(function() { 
				if (this.__c != null) {
					this.unbind("Remove");
					this.undraw(); 			
				}
			});
			
			Crafty('obj').each(function() { 
				if (this.__c != null) {
					this.unbind("Remove");
					this.destroy(); 			
				}
			});
			
			Crafty('Delay').each(function() { 
				if (this.__c != null) {
					this.unbind("Remove");
					this.destroy(); 	
				}
			});
		} catch(e) {}
	}, 
	
	// melee helper
	isInRangeDirectional : function(character, rangeWidth, rangeHeight) {
		var targetPlayer = character.targetPlayer;
		var deltaX = Math.abs(targetPlayer.x - character.x);
		var deltaY = Math.abs(targetPlayer.y - character.y);
		var hasSameXaxis = (deltaX <= targetPlayer.h/2);
		var hasSameYaxis = (deltaY <= targetPlayer.w/2);
		
		if (hasSameXaxis) {
			if (deltaX < rangeWidth) {
				return true;
			}
		}
		if (hasSameYaxis) {
			if (deltaX < rangeHeight) {
				return true;
			}
		}
		return false;
	},
	
	//melee helper
	isInRangeExplosion : function(character, rangeWidth, rangeHeight) {
		var targetPlayer = character.targetPlayer;
		var deltaX = Math.abs(targetPlayer.x - character.x);
		var deltaY = Math.abs(targetPlayer.y - character.y);
		var hasSameXaxis = (deltaX <= targetPlayer.h/2);
		var hasSameYaxis = (deltaY <= targetPlayer.w/2);
		
		if (hasSameXaxis) {
			if (deltaX < rangeWidth/2) {
				return true;
			}
		}
		if (hasSameYaxis) {
			if (deltaX < rangeHeight/2) {
				return true;
			}
		}
		return false;
	},
	
	showCharacterDetails : function(characterName) {
		$("#characterDetails").show();
		//$(previousDomId).hide();
		var characterComponent = this.characters[characterName].component;
		var containerName = $("<div/>");
//		containerName.css("color", "white");
//		containerName.css("text-align", "center");
//		containerName.css("font-size", "24px");
//		containerName.css("font-family", "cursive");
//		containerName.css("font-style", "italic");
//		containerName.css("font-weight", "900");
		containerName.addClass("heading");
		
		var canvasObj = $("<canvas/>");
		canvasObj.prop("width", 300);
		canvasObj.prop("height", 300);
		canvasObj.css("margin-left", "auto");
		canvasObj.css("margin-right", "auto");
		canvasObj.css("display", "block");
		var canvas = canvasObj.get(0);		
		var context = canvas.getContext('2d');
		var sprite = GameHelper.getSpriteByCharacterName(characterName);		
		var imageObj = new Image();
		imageObj.src = sprite.url;

		imageObj.onload = function() {
			context.drawImage(imageObj, sprite.coordsMap[0],sprite.coordsMap[1], sprite.coordsMap[2],sprite.coordsMap[3], 0,0, canvas.width, canvas.height);
			//context.drawImage(img,sx,sy,swidth,sheight,x,y,width,height);
		};
		
		var info =  $("<div/>");		
		info.css("color", "white");
		info.css("font-size", "14px");
	
		
		var tableInfo = $("<table>");
		tableInfo.addClass("centerMe");
		tableInfo.prop("border", 1);
		tableInfo.addClass(characterComponent.defaults.elementalType);
		var tr = $("<tr/>");
		tableInfo.append(tr);
		tr.append($("<td class='info'>Description</td><td>" + characterComponent.defaults.description + "</td>"));
		var tr = $("<tr/>");
		tableInfo.append(tr);
		tr.append($("<td class='info'>Elemental Type</td><td>" + characterComponent.defaults.elementalType + "</td>")); 
		tr = $("<tr/>");
		tableInfo.append(tr);
		tr.append($("<td class='info'>Alignment</td><td>" + characterComponent.defaults.alignment + "</td>"));
		tr = $("<tr/>");
		tableInfo.append(tr);
		tr.append($("<td class='info'>Speed</td><td>" + characterComponent.defaults.characterSpeed + "</td>"));
		
		tr = $("<tr/>");
		tableInfo.append(tr);
			/*
			var primaryAbility = $("<td>" + characterComponent.defaults.primaryAbility + "</td>");
			var primaryAbilityTable = $("<table>");
			primaryAbilityTable.css("width", "100%");
			primaryAbilityTable.prop("border", 1);
			var trPrimaryAbility = $("<tr/>");
			var primaryAbilityComponent = GameHelper.abilities[characterComponent.defaults.primaryAbility].component;		
			trPrimaryAbility.append($("<td class='info'>Type</td><td>" + primaryAbilityComponent.defaults.type + "</td>")); 
			primaryAbilityTable.append(trPrimaryAbility);
			trPrimaryAbility = $("<tr/>");
			trPrimaryAbility.append($("<td class='info'>Damage</td><td>" + primaryAbilityComponent.defaults.damage + "</td>"));
			primaryAbilityTable.append(trPrimaryAbility);
			
			if (primaryAbilityComponent.defaults.type == 'Range') {
				trPrimaryAbility = $("<tr/>");
				trPrimaryAbility.append($("<td class='info'>Speed</td><td>" + primaryAbilityComponent.defaults.speed + "</td>")); 
				primaryAbilityTable.append(trPrimaryAbility);				
				trPrimaryAbility = $("<tr/>");
				trPrimaryAbility.append($("<td class='info'>Max Missles</td><td>" + primaryAbilityComponent.defaults.maxActive + "</td>")); 
				primaryAbilityTable.append(trPrimaryAbility);		
			
			}
			if (primaryAbilityComponent.defaults.type == 'Melee') {
				trPrimaryAbility = $("<tr/>");
				trPrimaryAbility.append($("<td class='info'>Delay After Attack</td><td>" + primaryAbilityComponent.defaults.delayAfterAttack + "</td>")); 
				primaryAbilityTable.append(trPrimaryAbility);		
			}
			trPrimaryAbility = $("<tr/>");
			trPrimaryAbility.append($("<td class='info'>Cooldown</td><td>" + primaryAbilityComponent.defaults.cooldown + "ms </td>")); 
			primaryAbilityTable.append(trPrimaryAbility);
			primaryAbility.append(primaryAbilityTable);
			
			
			tr.append($("<td class='info'>Primary ability</td>"));
			tr.append(primaryAbility);
			 */
		info.prepend(tableInfo);
		
	
		
		var backLink = $("<div/>");
		backLink.addClass("back");
//		backLink.css("color", "white");
//		backLink.css("text-align", "center");
//		backLink.css("font-size", "24px");
//		backLink.css("font-family", "cursive");
//		backLink.css("font-style", "italic");
//		backLink.css("font-weight", "900");
//		backLink.css("cursor", "pointer");
//		backLink.css("text-decoration", "underline");
		backLink.text("Main Menu");
		backLink.click(function () {
			$("#characterDetails").hide();
			//$(previousDomId).show();
			Main.main();
		});
		containerName.append(characterName);
		
		$("#characterDetails").html("");
		$("#characterDetails").append(containerName);
		$("#characterDetails").append(canvasObj);
		$("#characterDetails").append(info);
		$("#characterDetails").append(backLink);
		
		
	},
	
	createCharacterAvatarEntity : function (characterComponent, width, height) {
		var retval = Crafty.e("2D, Canvas");
		
		retval.addComponent(characterComponent.defaults.elementalType + "Circle");
		var spriteEntity = Crafty.e("2D, Canvas");
		spriteEntity.addComponent(characterComponent.defaults.spriteName);
		
		
		
		spriteEntity.w = width * 0.5;
		spriteEntity.h = height * 0.5;
		retval.w = width;
		retval.h = height;
		retval.bind("Move", function() {
			spriteEntity.x = retval.x + (retval.w - spriteEntity.w)/2; 
			spriteEntity.y = retval.y + (retval.h - spriteEntity.h)/2; 
		});
		retval.bind("Remove", function() {
			spriteEntity.destroy();
		});
		retval.bind("Change", function() {
			spriteEntity.alpha = retval.alpha;
		});
		return retval;
	},
	
	cleanup : function() {
		GameHelper.removeAllEntities();
		$("body").unbind("keydown");
		//GameHelper.hideCrafty();
	},
	
	createGUID : function () {
		/*
		var c = 1;
		var d = new Date();
		var m = d.getTime();
		return m;
		*/
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
	        var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
	        return v.toString(16);
	    });
	},
	
	getNumPlayableCharacters : function() {
		var retval = 0;
		for (var key in GameHelper.characters) {
			if (GameHelper.characters[key].component.defaults.npc == null) {
				retval++;				
			}
		}		
		return retval;
	},
	
	getFrames : function() {
		return [[0, 0], [Global.playerCharacter.width, 0], [Global.playerCharacter.width*2, 0], [Global.playerCharacter.width*3, 0]];
	},
	
	getFramesFromCoords : function(coords) {
		var retval = [];
	
		//var width = coords[2];
		var height = coords[3];
		var numFrames = 4;
		for (var i = 0; i < numFrames; i++) {
			var newCoords = [];
			newCoords.push(i*height);
			newCoords.push(0);
			
			retval.push(newCoords);
		}		
		return retval;
	},
	
	getAbilityDescription : function (abilityComponent, level) {
		var maxActiveDescription = "";
		var speedDescription = "";
		var damageDescription = "";
		var speedIncreaseDescription = "";
		var damageDecreasePercentageDescription = "";
		var durationDescription = "";
		var additionalDescriptionDescription = "";
		var healDescription = "";	
		var cooldownDescription = "";
		
		
		if (abilityComponent.defaults.type == "Range") {
			maxActiveDescription = "Max projectiles active : " + abilityComponent.defaults.maxActive + "<br/>";
			speedDescription = "Projectile Speed : " + abilityComponent.defaults.speed + "<br/>";
		}
		if (abilityComponent.defaults.type == "Range" || abilityComponent.defaults.type == "Melee"
			|| 	abilityComponent.defaults.type == "Range Omni-directional")
		{
			damageDescription = "Damage : " + 
			Math.floor(abilityComponent.defaults.damage * GameHelper.getDamageMultiplier(level)) +
			"<br/>";
		}
		if (abilityComponent.defaults.type == "Buff") {
			if (abilityComponent.defaults.speedIncrease != null) {
				if (abilityComponent.defaults.speedIncrease < 0) {
					speedIncreaseDescription = "Reduce Opponent's speed : " + (-abilityComponent.defaults.speedIncrease) + "<br/>";
				} else {
					speedIncreaseDescription = "Speed Increase : " + abilityComponent.defaults.speedIncrease + "<br/>";
				}
			}
			if (abilityComponent.defaults.damageDecreasePercentage != null) {
				damageDecreasePercentageDescription = "Damage Taken Reduced By : " + abilityComponent.defaults.damageDecreasePercentage + "%<br/>";
			}			
		}
		if (abilityComponent.defaults.additionalDescription != null) {
			additionalDescriptionDescription = "Addtional info : " + abilityComponent.defaults.additionalDescription + "<br/>";
		}
		if (abilityComponent.defaults.type == "Heal") {
			healDescription = "Heal : " + 
			Math.floor(abilityComponent.defaults.heal * GameHelper.getHealMultiplier(level)) +
			"<br/>";
		}
		
		if (abilityComponent.defaults.duration != null) {
			durationDescription = "Duration : " + abilityComponent.defaults.duration + "ms <br/>";
		}
		if (abilityComponent.defaults.cooldown != null) {
			cooldownDescription = "Cooldown : " + abilityComponent.defaults.cooldown + "ms <br/>";
		}
		return "Type : " + abilityComponent.defaults.type + "<br/>" +
		damageDescription +
		healDescription +
		speedDescription +
		maxActiveDescription +
		speedIncreaseDescription +
		damageDecreasePercentageDescription +
		durationDescription + 
		cooldownDescription +
		additionalDescriptionDescription;
		
	},
	
	getHealth : function (health, level) {
		return Math.floor(health * Math.pow(1.1, level));
	},
	
	getDamageMultiplier : function (level) {
		return Math.pow(1.1, level);
	},
	
	getHealMultiplier : function (level) {
		return Math.pow(1.1, level);
	},
	
	loadBackground : function() {
//		if (Game.gameScene.backgroundSprite != null) {
//			Game.gameScene.backgroundSprite.destroy();
//		}
//		var spriteName = Game.params.heroes[0].character.defaults.elementalType; 
//		Game.gameScene.backgroundSprite = Crafty.e(spriteName + ", 2D, Canvas");
//		Game.gameScene.backgroundSprite.w = Game.width();
//		Game.gameScene.backgroundSprite.h = Game.height();
//		Game.gameScene.backgroundSprite.z = -99999999;
		var elementalType = Game.params.heroes[0].character.defaults.elementalType;
		var url = Global.imgBackgroundAssets[elementalType].url;
		GameHelper.setBackgroundDiv(url);
	},
	
	
	setBackgroundDiv : function(url) {
		var gameBackgroundDiv = null;
		
		if ($("#gameBackgroundDiv").length) {
			gameBackgroundDiv = $("#gameBackgroundDiv");
		} else {
			gameBackgroundDiv = $("<div/>");			
			gameBackgroundDiv.attr("id", "gameBackgroundDiv");				     			
			$("#cr-stage").append(gameBackgroundDiv);
		}
		gameBackgroundDiv.show();
		gameBackgroundDiv.css("height", "100%");
		gameBackgroundDiv.css("width", "100%");
		gameBackgroundDiv.css("background", "url(" + url + ")");
		gameBackgroundDiv.css("background-size", Game.width() + "px " + Game.height() + "px");
		gameBackgroundDiv.css("background-repeat", "no-repeat");
		//gameBackgroundDiv.css("opacity", 0.1);
		//gameBackgroundDiv.css("-webkit-filter", "brightness(50%)");
		//gameBackgroundDiv.css("-moz-filter", "brightness(50%)");
	},
	
	hideBackgroundDiv : function() {
		$("#gameBackgroundDiv").hide();
	},
	
	getElementalTypeDescription : function(elementalType) {
		var retval = "";
	
		if (elementalType == "air") {
			retval = this.getElementalTypeDescriptionHelper("Air", "Earth", "Fire");
		} else if (elementalType == "earth") {
			retval = this.getElementalTypeDescriptionHelper("Earth", "Water", "Air");
		} else if (elementalType == "water") {
			retval = this.getElementalTypeDescriptionHelper("Water", "Fire", "Earth");
		} else if (elementalType == "fire") {
			retval = this.getElementalTypeDescriptionHelper("Fire", "Air", "Water");
		}
		return retval;
	},
	
	getElementalTypeDescriptionHelper : function (fromElementalType, toElementalType, weaknessFromElementalType) {
		return fromElementalType + " elementals will do " + (Global.elementalDamageMultiplier-1)*100 + "% more damage " +
		"and take " + (Global.elementalDamageReductionMultiplier-1)*100 + "% less damage from " + toElementalType + " elementals.  " +
		"However, they will do " + (Global.elementalDamageMultiplier-1)*100 + "% less damage " +
		"and take " + (Global.elementalDamageReductionMultiplier-1)*100 + "% more damage from " + weaknessFromElementalType + " elementals.";
	},
	
	createContinueButton : function(linkSelector, yOffset) {
		var fontPx = 18;
		var continueLink = Crafty.e('2D, DOM, Text')
		.text('Continue')
		.attr({ x: 7/16 * Game.width(), y: yOffset, w: Game.width() /8, h: fontPx+3})
		.textFont({ size: fontPx + "px", weight: 'bold', 'family': 'Cursive', 'type' : 'italic'})
		.textColor("#000000")
		.css("textAlign", "center")
		.css("height", fontPx)
		.css("cursor", "pointer");
		//.css("text-decoration", "underline");		
		$( "#" + continueLink.getDomId() ).click(function() {
			//Crafty.stop();
			window.location.href=linkSelector;
		});
		//$("#" + continueLink.getDomId()).html("Continue");
		$("#" + continueLink.getDomId()).addClass("continueContainer");
		$("#" + continueLink.getDomId()).addClass("continueContainerColor");
	}
	
};