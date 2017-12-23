/**
 * @ #SpriteColor
 */
;
(function() {


	
	// draw callback
	sc_drawFunc = function(character) {

		var ctx = Crafty.canvas.context;
		var changeColor = function(fromColor, imgData, index) {
			if (fromColor != null) {
				if (fromColor == "halfOfOriginal") {
					imgData.data[index] = imgData.data[index] / 2;
				} else {
					imgData.data[index] = fromColor;
				}
			}
		};
		
		

		var imgData = null;
	
		if (this.cacheImgData != null) {
			imgData = this.cacheImgData;
		} else {
			try {

				if (this.hit("Character")) {
					this.hitCharacter = true;	
					
				}
				imgData = ctx.getImageData(this.x, this.y, this.w, this.h);
				for (var i = 0; i < imgData.data.length; i += 4) {
					// red
					changeColor(this.spriteColorRed, imgData, i);

					// green
					changeColor(this.spriteColorGreen, imgData, i + 1);

					// blue
					changeColor(this.spriteColorBlue, imgData, i + 2);

					// alpha
					changeColor(this.spriteColorAlpha, imgData, i + 3);
				}
				this.cacheImgData = imgData;

			} catch (e) {
			}
		}
		try {
			if (this.drawnCount == 0) {			
				ctx.putImageData(imgData, this.x, this.y);								
				this.drawnCount++;
			
			}
			
			var date = new Date();
			var milliSec = date.getMilliseconds(); 
			var curHitCharacter = false;
			if (milliSec % 20 == 0) {
				curHitCharacter = this.hit("Character");
		
				if (this.hitCharacter) {							
					if (!curHitCharacter) {
						this.cacheImgData = null;
						this.drawnCount = 0;
					}
				} else {
					ctx.putImageData(imgData, this.x, this.y);
					if (curHitCharacter) {
						this.hitCharacter = true;
						this.cacheImgData = null;
						this.drawnCount = 0;
					}
				}
			}
		} catch (e) {
			console.log(e);
		}
	};

	// the component
	Crafty.c("SpriteColor", {
		drawnCount : null,
		cacheImgData : null,
		drawnCount : 0,
		hitCharacter : false,

		init : function() {
			this.cacheImgData = null;
			sc_drawFunc();
			this.bind("EnterFrame", sc_drawFunc).bind("RemoveComponent",
					function(c) {
						if (c === "SpriteColor") {
							this.unbind("EnterFrame", sc_drawFunc);
						}
					});
		},

		// red, green, blue, alpha (0-255)

		spriteColor : function(red, green, blue, alpha) {
			this.spriteColorRed = red;
			this.spriteColorGreen = green;
			this.spriteColorBlue = blue;
			this.spriteColorAlpha = alpha;
			this.trigger("Change");

			return this;
		}
	});
})();