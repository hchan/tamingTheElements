// The Grid component allows an element to be located
// on a grid of tiles
//Crafty.c('Grid', {
//	init : function() {
//		this.attr({
//			w : Game.map_grid.tile.width,
//			h : Game.map_grid.tile.height
//		});
//	},
//
//	// Locate this entity at the given position on the grid
//	at : function(x, y) {
//		if (x === undefined && y === undefined) {
//			return {
//				x : this.x / Game.map_grid.tile.width,
//				y : this.y / Game.map_grid.tile.height
//			};
//		} else {
//			this.attr({
//				x : x * Game.map_grid.tile.width,
//				y : y * Game.map_grid.tile.height
//			});
//			return this;
//		}
//	}
//});

// An "Actor" is an entity that is drawn in 2D on canvas
// via our logical coordinate grid
Crafty.c('Actor', {
	init : function() {
		this.requires('2D, Canvas');
	},
});

// A Tree is just an Actor with a certain sprite
Crafty.c('Tree', {
	init : function() {
		this.requires('Actor, Solid, spr_tree');
	},
});

// A Bush is just an Actor with a certain sprite
Crafty.c('Bush', {
	init : function() {
		this.requires('Actor, Solid, spr_bush');
	},
});

// A Rock is just an Actor with a certain sprite
Crafty.c('Rock', {
	init : function() {
		this.requires('Actor, Solid, spr_rock');
	},
});

Crafty.c('Solid', {
	init : function() {
		this.requires('Grid, 2D, Canvas');
	},
});




Crafty.c('FlipOnTargetPlayer', {
	init : function() {
		this.requires('2D');	
	},
	flipIfNecessary : function(player, targetPlayer) {		
		if (targetPlayer != null) {
			if (targetPlayer.x > player.x) {
				this.unflip();
			} else {				
				this.flip();
			}
		} 
	}
});

Crafty.c('Ability', {
	init : function() {
		this.isDead = false;		
	},
	resize : function() {
		this.w = this.defaults.w;
		this.h = this.defaults.h;
		if (this.w == null) {
			console.log("width is null");
		}
		if (this.h == null) {
			console.log("height is null");
		}
	}
});

Crafty.c('Range Omni-directional'), {
	init : function() {
		this.requires('Ability, Grid, 2D, Canvas, Collision, FlipOnTargetPlayer');	
	}
};

Crafty.c('Range', {
	//speed : Global.defaultBulletSpeed,
	//damage: 25,
	init : function() {		
		this.requires('Ability, Grid, 2D, Canvas, Collision, FlipOnTargetPlayer');		
		
		
	},
	myTween : function () {
		
		this.origin("center");
		var bullet = this;
		var curRotation = bullet.rotation;
		var curWidth = bullet.w;
		
		Crafty.e("Delay").delay(function() {
			if (bullet.isDead) {
				this.destroy();
			}
			var rotateAmount = 0;
			var addWidth = 0;
			if (Math.random() > 0.5) {
				rotateAmount = 1;
				addWidth = 1;
			} else {
				rotateAmount = -1;
				addWidth = -1;
			}
			bullet.rotation += rotateAmount;
			bullet.w += addWidth;
			
			if (Math.abs(curRotation - bullet.rotation) > 5) {
				bullet.rotation = curRotation;
			}
			if (Math.abs(curWidth - bullet.w) > (curWidth * 0.1)) {
				bullet.w = curWidth;
			}
		}, 10, -1);
	},
	createHitCallback : function(bullet, abilityName) {
		return function(data) {
			var opponent = data[0].obj;
			if (!opponent.isTranslucent) {
				//character.removeBullet(bullet, abilityName);
				opponent.targetPlayer.removeBullet(bullet, abilityName);
				opponent.applyDamage(bullet.damage);
			}
		};
	}
});


//Melee
Crafty.c('Melee', {
	hasHit : null,
	init : function() {
		this.requires('Ability, 2D, Canvas, Collision');
		
	},
	
	applyDamage : function(character) {
		if (this.hasHit == null) {
			character.applyDamage(this.damage);
			this.hasHit = true;
		} 
	},
	
	reposition: function (direction, character) {
		if (direction == null) {
			direction = "e";
		}
		this.origin("top left");
		if (direction === "e") {
			this.x = character.x + character.w;
			this.y = character.y + (character.h-this.h)/2;
		} else if (direction === "w") {
			this.flip();
			this.x = character.x - this.w;
			this.y = character.y + (character.h-this.h)/2;
		} else if (direction === "s") {			
			this.x = character.x + character.w - (character.w- this.h)/2;
			this.y = character.y + character.h;
			this.rotation = 90;
		} else if (direction === "n") {
			this.x = character.x + (character.w- this.h)/2;
			this.y = character.y;
			this.rotation = 270;
			
		}
	},
	
	myTween : function () {
		
	},
	
	
	
	
});





// A village is a tile on the grid that the PC must visit in order to win the
// game
Crafty.c('Village', {
	init : function() {
		this.requires('Actor, spr_village');
	},

	// Process a visitation with this village
	visit : function() {
		this.destroy();
		Global.playSound('knock');
		Crafty.trigger('VillageVisited', this);
	}
});



Crafty.c("Alert", {
	init : function() {
		this.requires('2D, DOM, Text');
	},
	message : function(str) {	
		var alertThis = this;
		this.alpha = 1;
		this.text(str).attr({ x: 0, y: Game.height()/2 - 12, w: Game.width() })
		.textFont({ size: '12px', weight: 'bold'})
		.textColor("#FF0000", 1)
		.css("textAlign", "center");
		Crafty.e("Delay").delay(function() {
			  alertThis.alpha -= 0.1;
			}, 100, 10);
	}
}); 



Crafty.c("CinematicHeader", {
	init : function() {
		this.requires('2D, DOM, Text');
		this.alpha = 1;
		this.attr({ 
			x: 10, 
			y: 10,
			w: Game.width()
		})
		.textFont({ size: '30px', weight: 'bold', 'family' : 'Monospace'})		
		.textColor("#0FFF0F", 1)
		.css("textAlign", "left");
	},
	message : function(str) {	
		this.text(str);
		var entity = this;
		Crafty.e("Delay").delay(function() {
			entity.alpha -= 0.03;
			if (entity.alpha <=0.50 ){
				entity.destroy();
			}
			}, 150, 100);
	},
	
	messageStay : function(str) {	
		this.text(str);
	}
}); 


Crafty.c("CinematicCaption", {
	init : function() {
		this.requires('2D, DOM, Text');
	},
	message : function(str) {	
		str += "<br/><p style='font-style: italic; font-family: Cursive'>[Press any key to continue]</p>";
		var entity = this;
		this.alpha = 0.5;
		this.text(str).attr({ 
			x: 10, 
			y: 10 + Game.cinematicAnimationHeight(),
			w: Game.width()
		})
		.textFont({ size: '18px', weight: 'bold', 'family' : 'Helvetica'})		
		.textColor("#FFFFFF", 1);
		Crafty.e("Delay").delay(function() {
			entity.alpha += 0.1;
		
		}, 150, 10);
	}
}); 
