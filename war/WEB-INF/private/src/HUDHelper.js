function Slot(name, entity, abilityInfo) {
	this.name = name;
	this.entity = entity;
	this.abilityInfo = abilityInfo;
	this.imgData = null;
};

HUDHelper = {
	resizeEntityForSlot : function(slot, slotIndex, slotSideLength, startX, startY) {
		var ent = slot.entity;
		var entEntitySpriteWidth = null;
		var entEntitySpriteHeight = null;
		try {
			entEntitySpriteWidth = ent.__coord[2] - ent.__coord[0];
			entEntitySpriteHeight = ent.__coord[3] - ent.__coord[1];
		} catch (e) {
			try {
				var coordsMap = GameHelper.sprites[slot.abilityInfo.character.character.spriteName].coordsMap;
				entEntitySpriteWidth = coordsMap[2] - coordsMap[0];
				entEntitySpriteHeight = coordsMap[3] - coordsMap[1];
			} catch (e2) {
				var imgAsset = Global.imgAssets[GameHelper.abilities[slot.name].component.defaults.spriteName];
				entEntitySpriteWidth = imgAsset.coords[2];
				entEntitySpriteHeight = imgAsset.coords[3];
			}
		}
		
		
		var entEntityGreaterOfWidthOrHeight = 0;
		var scale = 0.75;
		var offsetX = 0;//(Global.actionBarHeight-this.topBorderWidth) * 0.25;
		var offsetY = 0;//(Global.actionBarHeight-this.topBorderWidth) * 0.25;
		if (entEntitySpriteWidth > entEntitySpriteHeight) {
			entEntityGreaterOfWidthOrHeight = entEntitySpriteWidth;
		} else {
			entEntityGreaterOfWidthOrHeight = entEntitySpriteHeight;
		}
		
	
		
		var factorRatio = (slotSideLength)
				/ entEntityGreaterOfWidthOrHeight;
		//			if (factorRatio < 1) {
		//				factorRatio = 1 / factorRatio;
		//			}

		ent.w = Math.floor(factorRatio * ent.w * scale);
		ent.h = Math.floor(factorRatio * ent.h * scale);
		offsetX = ((slotSideLength) - ent.w) / 2;
		offsetY = ((slotSideLength) - ent.h) / 2;
		ent.attr({
			x : Math.floor(startX + (slotIndex * slotSideLength) + offsetX + 1),
			y : Math.floor(startY + offsetY + 1),
		});
	},

	drawCooldown : function (ctx, percentFinishedCD, point0, slotLength, fillStyleParam) {
		
		ctx.globalAlpha = 0.33;
		if (fillStyleParam != null) {
			ctx.fillStyle=fillStyleParam;
		} else {
			ctx.fillStyle="#090909";
		}
		
		ctx.beginPath();
		ctx.moveTo(point0[0] + slotLength/2, point0[1]);
		ctx.lineTo(point0[0] + slotLength/2, point0[1]+ slotLength/2);
		if (percentFinishedCD < 0.125) {
			var offset = percentFinishedCD/0.125 * slotLength*0.5;
			ctx.lineTo(point0[0] + slotLength/2 + offset, point0[1]);
			
			ctx.lineTo(point0[0]+slotLength, point0[1]);
			ctx.lineTo(point0[0]+slotLength, point0[1]+slotLength);
			ctx.lineTo(point0[0], point0[1]+slotLength);
			ctx.lineTo(point0[0], point0[1]);
		
		} else if (percentFinishedCD >= 0.125 && percentFinishedCD < 0.375) {
			var offset = (percentFinishedCD - 0.125)/0.25 * slotLength;
			ctx.lineTo(point0[0] + slotLength, point0[1] + offset);
			
			ctx.lineTo(point0[0]+slotLength, point0[1]+slotLength);
			ctx.lineTo(point0[0], point0[1]+slotLength);
			ctx.lineTo(point0[0], point0[1]);
		} else if (percentFinishedCD >= 0.375 && percentFinishedCD < 0.625) {
			var offset = (percentFinishedCD - 0.375)/0.25 * slotLength;
			ctx.lineTo(point0[0] + slotLength-offset, point0[1]+slotLength);
			
			ctx.lineTo(point0[0], point0[1]+slotLength);
			ctx.lineTo(point0[0], point0[1]);
		} else if (percentFinishedCD >= 0.625 && percentFinishedCD < 0.875) {
			var offset = (percentFinishedCD - 0.625)/0.25 * slotLength;
			ctx.lineTo(point0[0], point0[1]+slotLength-offset);
			
			ctx.lineTo(point0[0], point0[1]);
		} else if (percentFinishedCD >= 0.875) {
			var offset = (percentFinishedCD - 0.875)/0.125 * slotLength*0.5;
			
			ctx.lineTo(point0[0] + offset, point0[1]);
		}
		ctx.closePath();
	
		
		ctx.fill(); 
	
		ctx.globalAlpha = 1;
	}
};