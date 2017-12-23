ActionBar = {
	imgDataCapture : null,
	imgDataCaptureCooldown : null,
	actionBarCanvasJqueryObj : null,
};

Crafty.c("ActionBar", {
	character : null,
	characterName : null,
	slots : [],
	abilitiesName : [],
	topBorderWidth : 1,
	slotSideLength : 0,
	slotBorderWidth : 2,
	init : function() {
		this.requires('2D, Tween, Canvas, Solid, Color, HUDContainer, DOM');
		this.createActionBarCanvasIfNecessary();
	},
	
	createActionBarCanvasIfNecessary : function () {
		if (!$("#actionBarCanvas").length) {
			ActionBar.actionBarCanvasJqueryObj = $("<canvas/>");
			ActionBar.actionBarCanvasJqueryObj.css("z-index", 100);
			ActionBar.actionBarCanvasJqueryObj.css("position", "relative");
			ActionBar.actionBarCanvasJqueryObj.attr("id", "actionBarCanvas");
			ActionBar.actionBarCanvasJqueryObj.height(Global.actionBarHeight);
			ActionBar.actionBarCanvasJqueryObj.width(Game.width());
			ActionBar.actionBarCanvasJqueryObj.attr("height", Global.actionBarHeight);
			ActionBar.actionBarCanvasJqueryObj.attr("width", Game.width());
			
			$(this._element).append(ActionBar.actionBarCanvasJqueryObj);
		}
	},

	ActionBar : function(character, characterName) {
		this.createActionBarCanvasIfNecessary();
		this.character = character;
		this.characterName = characterName;
		
		this.abilitiesName = [],
		this.x = 0;
		this.y = Game.height() - Global.actionBarHeight;
		this.w = Game.width();
		this.h = Global.actionBarHeight;
		this.slotSideLength = Global.actionBarHeight - (this.slotBorderWidth/2) - this.topBorderWidth*2;
		//this.color('#CCD6FF');
		var actionBar = this;
		$.each(character.abilitiesInfo, function(key,val){ actionBar.abilitiesName.push(key); });
	
		for (var i = 0; i < this.slots.length; i++) {
			var slot = this.slots[i];
			slot.entity.destroy();
		}
		this.slots = [];
		
		for (var i = 0; i < this.abilitiesName.length; i++) {
			var abilityName = this.abilitiesName[i];				
			var spriteName = GameHelper.abilities[abilityName].component.defaults.spriteName;
			var spriteEntity = Crafty.e(spriteName + ", Canvas");
			var slot = new Slot(abilityName, spriteEntity, character.abilitiesInfo[abilityName]);
			this.slots.push(slot);
			
		}
		this.addSwapSlot();
		
		// draw image data and cache
		for (var i = 0; i < this.slots.length; i++) {					
			var slot = this.slots[i];
			var ctx = Game.hiddenCanvas.getContext("2d");
			
			
			
			//var point0 = [this.slotBorderWidth/2 + (i * this.slotSideLength), this.y + (this.slotBorderWidth/2)];
			var point0 = [0,0];
			
			//var slotIndex = jQuery.inArray(slot, this.slots);
			//HUDHelper.resizeEntityForSlot(slot, slotIndex, this.slotSideLength, 0, this.y + this.topBorderWidth);
			HUDHelper.resizeEntityForSlot(slot, 0, this.slotSideLength, 0, 0);
			//point0 = [slot.entity.x, slot.entity.y];
			
			ctx.clearRect(point0[0], point0[1], this.slotSideLength, this.slotSideLength);
			try {
				slot.entity.draw(ctx);
			} catch (e) {
				console.log(e);
			}
			if (slot.entity.redXEntity != null) {
				slot.entity.redXEntity.visible = true;
				slot.entity.redXEntity.w = slot.entity.w;
				slot.entity.redXEntity.h = slot.entity.h;
				slot.entity.redXEntity.x = slot.entity.x;
				slot.entity.redXEntity.y = slot.entity.y;
				slot.entity.redXEntity.draw(ctx);
				slot.entity.redXEntity.visible = false;
			}
			// draw box
			ctx.beginPath();
			ctx.strokeStyle = '#000';
			
			ctx.lineWidth = 1;
			ctx.lineCap="round";			
			
			ctx.moveTo(point0[0], point0[1]);
			ctx.lineTo(point0[0]+this.slotSideLength, point0[1]);
			ctx.lineTo(point0[0]+this.slotSideLength, point0[1]+this.slotSideLength);
			ctx.lineTo(point0[0], point0[1]+this.slotSideLength);
			ctx.lineTo(point0[0], point0[1]);
			ctx.stroke();
			
			// draw number
			ctx.textAlign="left"; 
			ctx.fillStyle = "black";
			ctx.font = "bold 16px Arial";
			ctx.fillText((i+1), point0[0], point0[1]+12);
			
			
			if (slot.name == "Capture") {						
				if (ActionBar.imgDataCapture == null) {
					ActionBar.imgDataCapture = ctx.getImageData(point0[0], point0[1], this.slotSideLength, this.slotSideLength);
				}
				if (ActionBar.imgDataCaptureCooldown == null) {
					HUDHelper.drawCooldown(ctx, 0, point0, this.slotSideLength);						
					ActionBar.imgDataCaptureCooldown = ctx.getImageData(point0[0], point0[1], this.slotSideLength, this.slotSideLength);
				}
			} else {
				slot.imgData = ctx.getImageData(point0[0], point0[1], this.slotSideLength, this.slotSideLength);
			}
			slot.entity.attr({visible : false});	
			
		}
		
		
//		var primaryAbilityName = GameHelper.characters[this.characterName].component.defaults.primaryAbility;
//		var primaryAbilitySpriteName = GameHelper.abilities[primaryAbilityName].component.defaults.spriteName;
//		var actionEntity = Crafty.e(primaryAbilitySpriteName + ", Canvas");
//		var slot = new Slot(primaryAbilityName, actionEntity);
//		this.slots.push(slot);
//		this.resizeEntityForSlot(slot);
//
//		actionEntity = Crafty.e(primaryAbilitySpriteName + ", Canvas");
//		slot = new Slot(primaryAbilityName, actionEntity);
//		this.slots.push(slot);
//		this.resizeEntityForSlot(slot);
		
		this.refresh();
		this.unbind("EnterFrame");
		this.bind("EnterFrame", function() {			
			this.refresh();
		});
	},
	
	addSwapSlot : function() {
		var teammates = Swap.getTeammates(this.character);
	
		for (var i = 0; i < teammates.length; i++) {	
			var teammate = teammates[i];
			var abilityName = "Swap" + (i+1);
			var spriteName = teammate.character.defaults.spriteName;
			var spriteEntity = Crafty.e(spriteName + ", Canvas");
			var slot = new Slot(abilityName, spriteEntity, null);
			this.slots.push(slot);
			//var slotIndex = jQuery.inArray(slot, this.slots);
			//HUDHelper.resizeEntityForSlot(slot, slotIndex, this.slotSideLength, 0, this.y + this.topBorderWidth);
			slot.character = teammate.character;
			if (teammate.character.isDead) {											
				var redXEntity = Crafty.e("Canvas, redX");							
				spriteEntity.redXEntity = redXEntity;	
				spriteEntity.redXEntity.visible = false;
			}			
		}
	},
	
	

	refresh : function() {
		//console.log($(this._element).append(ActionBar.actionBarCanvasJqueryObj));
		
		var actionBarCanvas= ActionBar.actionBarCanvasJqueryObj[0].getContext('2d');
		//actionBarCanvas.fillRect(0,0,Game.width(),Global.actionBarHeight); 
		
		var ctx = actionBarCanvas;
		
		
		//var ctx = Crafty.canvas.context;

//			// draw rectangle
//			ctx.beginPath();
//			//ctx.shadowColor = 'red';
//			//ctx.shadowOffsetX = 0;
//			//ctx.shadowOffsetY = 0;
//			//ctx.shadowBlur = 10;
//			ctx.rect(188, 50, 200, 100);
//			ctx.fillStyle = 'yellow';
//			ctx.fill();
//			ctx.lineWidth = 7;
//			ctx.strokeStyle = 'black';
//			ctx.stroke();
		//var yOffset = this.y;
		var yOffset = 0;
		
		// draw border line
		ctx.beginPath();
		ctx.strokeStyle = '#111';
		ctx.lineWidth = this.topBorderWidth;
		ctx.lineCap="round";
		ctx.moveTo(0, yOffset + this.topBorderWidth);
		ctx.lineTo(Game.width(), yOffset + this.topBorderWidth);
		ctx.stroke();
		
		
		// draw slot box
		for (var i = 0; i < this.slots.length; i++) {
			var slot = this.slots[i];
			var abilityName = slot.name;
			var abilityInfo = this.character.abilitiesInfo[abilityName];
			var date = new Date();
			var curTime = date.getTime();
			
			
			var point0 = [this.slotBorderWidth/2 + (i * this.slotSideLength), yOffset + (this.slotBorderWidth/2)];		
			
			
			
			//slot.entity.alpha = 0;
			//ctx.clearRect(point0[0], point0[1], this.slotSideLength, this.slotSideLength);
			//slot.entity.draw();
			
			if (abilityName != "Capture") {
			
				ctx.putImageData(slot.imgData,point0[0],point0[1]);
			}
		
			
			if (abilityInfo != null) {
				if (abilityInfo.curCount == GameHelper.abilities[abilityName].component.defaults.maxActive && 
						GameHelper.abilities[abilityName].component.defaults.maxActive != 1) {
					ctx.textAlign="center"; 
					ctx.fillStyle = "red";
					ctx.font = "bold 16px Arial";
					ctx.fillText("Max'ed", point0[0] + this.slotSideLength/2, point0[1] + this.slotSideLength/2);
					
					
					
					
	//				var maxedOutEntity = Crafty.e("2D, Canvas, Text");
	//				
	//				maxedOutEntity.text("Max'ed").attr({ x: point0[0] + this.slotSideLength/2, y:point0[1] + this.slotSideLength/2})
	//				.textFont({ size: '12px', weight: 'bold'})
	//				.textColor("#FF0000", 1);
	//				
				
				} else if ((curTime - abilityInfo.lastUsed) < GameHelper.abilities[abilityName].component.defaults.cooldown) {
					var percentFinishedCD = (curTime - abilityInfo.lastUsed)/GameHelper.abilities[abilityName].component.defaults.cooldown;
					HUDHelper.drawCooldown(ctx, percentFinishedCD, point0, this.slotSideLength);
				}
			} else if (abilityName.startsWith("Swap")) {
				if (!slot.character.isDead && Swap.isInPlayerSwapCooldown()) {
					var percentFinishedCD = (curTime - Game.gameScene.swapPlayerInfo.lastUsed)/Game.swapCooldown;
					HUDHelper.drawCooldown(ctx, percentFinishedCD, point0, this.slotSideLength);
				}
				
			}
			// Capture should not be activatable until opponent's health is <= 25%
			if (abilityName == "Capture") {
				if (!this.character.targetPlayer.isCapturable()) {
					ctx.putImageData(ActionBar.imgDataCaptureCooldown,point0[0],point0[1]);
					//HUDHelper.drawCooldown(ctx, 0, point0, this.slotSideLength);
				} else {
					ctx.putImageData(ActionBar.imgDataCapture,point0[0],point0[1]);
					//HUDHelper.drawCooldown(ctx, 0, point0, this.slotSideLength);
					if ((curTime - abilityInfo.lastUsed) < GameHelper.abilities[abilityName].component.defaults.cooldown) {
						var percentFinishedCD = (curTime - abilityInfo.lastUsed)/GameHelper.abilities[abilityName].component.defaults.cooldown;
						HUDHelper.drawCooldown(ctx, percentFinishedCD, point0, this.slotSideLength);
					}					
				}			
			}
		}				
	},


});
