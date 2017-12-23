Crafty.c('HealWithRest', {
	init : function() {
		this.requires('Delay');	
	},
	
	doDelay : function(character) {
		this.delay(function() {
			if (Swap.isBenched(character) && !character.isDead) {			
				var healthToHeal = character.maxHealth * 0.005;
				character.curHealth += healthToHeal;
				if (character.curHealth > character.maxHealthWithRest) {
					character.curHealth = character.maxHealthWithRest;
					this.destroy();
				}
			}
		}, 1000, -1);
	}
});
