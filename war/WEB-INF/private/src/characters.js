GameHelper.createCharacterComponent(Game.lastBoss, '', {
	defaults : {
		description : "Last Boss",
		elementalType: 'void',
		alignment: 'evil',
		characterSpeed : Global.defaultSpeed+1,
		isTranslucent : false,
		curHealth : Global.defaultMaxHealth*10,
		maxHealth : Global.defaultMaxHealth*10,
		npc : true,
		abilitiesInfo : { 
			"Chaos Bolt" : { curCount: 0, lastUsed: 0},
			"Chaos Orb" : { curCount: 0, lastUsed: 0}		
		},		
		spriteName : "eternalVoid"
	},
	
	init : function() {
		this.characterInit();
	},	
		
	
});

GameHelper.createCharacterComponent(Game.dummyTarget, '', {
	defaults : {
		description : "Dummy Target - not very useful in combat, but great in practice",
		elementalType: 'void',
		alignment: 'neutral',
		characterSpeed : 0.2,
		maxHealth : Global.defaultMaxHealth,
		curHealth : Global.defaultMaxHealth,
		isTranslucent : false,
		abilitiesInfo : { 
			"Stick" : { curCount: 0, lastUsed: 0}		
		},		
		spriteName : "dummyTarget",
		unselectable : true
	},
	
	init : function() {
		this.characterInit();
	},	
		
	
});


GameHelper.createCharacterComponent('Cyclonius', '', {
	defaults : {
		description : "A race of Wind creatures born as sons from the Air Titan.  They are determined to make their lineage proud.  " +
		"However, their over-zealous  ambitions have twisted their ideals for their quest for power and have caused them to slowly lose their sanity...",
		elementalType: 'air',
		alignment: 'evil',
		characterSpeed : Global.defaultSpeed,
		maxHealth : Global.defaultMaxHealth,
		curHealth : Global.defaultMaxHealth,
		isTranslucent : false,
		abilitiesInfo : { 
			"Wind Cone" : { curCount: 0, lastUsed: 0},
			"Tornado" : { curCount: 0, lastUsed: 0}
		},		
		//spriteName : "spr_StormBlue"
		spriteName : "cyclonius"
	},
	init : function() {
		this.characterInit();
	},	
		
	createBulletEntity : function() {
		return Crafty.e("Wind Cone");
	}	
});



GameHelper.createCharacterComponent('Sindarosa', '', {
	defaults : {
		description : "A race of red dragons born in the depths of molten lava.  They have little respect for mankind and are one of the first races "
			+ "born in " + Game.gameWorldName,
		elementalType: 'fire',
		alignment: 'evil',
		characterSpeed : Global.defaultSpeed,
		maxHealth : Global.defaultMaxHealth,
		curHealth : Global.defaultMaxHealth,
		isTranslucent : false,
		abilitiesInfo : { 
			"Fire Blast" : { curCount: 0, lastUsed: 0},
			"Translucent Flame" : { curCount: 0, lastUsed: 0},
			//"Elemental Advantage : Fire cone" : { curCount: 0, lastUsed: 0},			
		},
	
		spriteName : "sindarosa"
	},
	init : function() {
		this.characterInit();
	},	
		
	createBulletEntity : function() {
		return Crafty.e("Fire Blast");;
	}	
});



GameHelper.createCharacterComponent('Morblass', '', {
	defaults : {
		description : "Little is known of this race.  What is known is that they are guardians to the oceans in " + Game.gameWorldName,
		elementalType: 'water',
		alignment: 'good',
		characterSpeed : Global.defaultSpeed,
		maxHealth : Global.defaultMaxHealth,
		curHealth : Global.defaultMaxHealth,
		isTranslucent : false,
		abilitiesInfo : { 
			"Icicles" : { curCount: 0, lastUsed: 0},
			"Ice Blast" : { curCount: 0, lastUsed: 0}		
		},
		spriteName : "morblass"
	},
	init : function() {
		this.characterInit();		
	},	
		
	createBulletEntity : function() {
		return Crafty.e("Icicles");;
	},
	
});

GameHelper.createCharacterComponent('Pax', '', {
	defaults : {
		description : "A race of rock creatures that were born in the center of " + Game.gameWorldName + 
		".  They were once guardions of this planet, but having seen so much destruction over the millennium, their desire is "
		+ "now rule " + Game.gameWorldName,
		elementalType: 'earth',
		alignment: 'evil',
		characterSpeed : Global.defaultSpeed-2,
		maxHealth : Global.defaultMaxHealth*1.5,
		curHealth : Global.defaultMaxHealth*1.5,
		isTranslucent : false,
		abilitiesInfo : { 
			"Ground Shock" : { curCount: 0, lastUsed: 0},
			"Adrenaline" : {lastUsed : 0}
		},
		//spriteName : "rockElemental"
		spriteName : "pax"
	},
	
	init : function() {
		this.requires("MeleeCharacter");
		this.requires("Activate");
		this.characterInit();				
	},		
		
	createMeleeEntity : function() {
		var retval = Crafty.e("Ground Shock");
		retval.initAgainstCharacterType(this.targetPlayerType, this);	
		return retval;
	},		
	
});


GameHelper.createCharacterComponent('Wispera', '', {
	defaults : {
		description : "Air creatures that neither sleep or rest",
		elementalType: 'air',
		alignment: 'good',
		characterSpeed : Global.defaultSpeed-2,
		maxHealth : Global.defaultMaxHealth,
		curHealth : Global.defaultMaxHealth,
		isTranslucent : false,
		abilitiesInfo : { 
			"Sonar Blast" : { curCount: 0, lastUsed: 0},
			"Steal Health" : { curCount: 0, lastUsed: 0}
		},	
		spriteName : "wispera"
	},
	init : function() {
		this.characterInit();
	},	
	createBulletEntity : function() {
		return Crafty.e("Sonar Blast");
	},	
});

GameHelper.createCharacterComponent('Fiara', '', {
	defaults : {
		description : "A cousin of phoenixes.  They are fierce but yet uphold truth and justice",
		elementalType: 'fire',
		alignment: 'good',
		characterSpeed : Global.defaultSpeed,
		maxHealth : Global.defaultMaxHealth * 1.3,
		curHealth : Global.defaultMaxHealth * 1.3,
		isTranslucent : false,
		abilitiesInfo : { 
			"Fireball" : { curCount: 0, lastUsed: 0},
			"Fire Heal" : { curCount: 0, lastUsed: 0}
		},	
		spriteName : "fiara"
	},
	init : function() {
		this.characterInit();
	},	
});


GameHelper.createCharacterComponent('Curomo', '', {
	defaults : {
		description : "A race of water serpents.  They have rarely travelled above water, but have been more frequently since the imbalance",
		elementalType: 'water',
		alignment: 'good',
		characterSpeed : Global.defaultSpeed-1,
		maxHealth : Global.defaultMaxHealth,
		curHealth : Global.defaultMaxHealth,
		isTranslucent : false,
		abilitiesInfo : { 
			"Ice Shock" : { curCount: 0, lastUsed: 0},
			"Shards of Ice" : { curCount: 0, lastUsed: 0}
		},	
		spriteName : "curomo"
	},
	init : function() {
		this.characterInit();
	},	
});

GameHelper.createCharacterComponent('Rokcore', '', {
	defaults : {
		description : "A race of stone golems.  They are the cousins of paxes, and they still believe in peace above everything else",
		elementalType: 'earth',
		alignment: 'good',
		characterSpeed : Global.defaultSpeed,
		maxHealth : Global.defaultMaxHealth * 1.2,
		curHealth : Global.defaultMaxHealth * 1.2,
		isTranslucent : false,
		abilitiesInfo : { 
			"Rock Pellet" : { curCount: 0, lastUsed: 0},
			"Rock Armour" : { curCount: 0, lastUsed: 0}
		},	
		spriteName : "rokcore"
	},
	init : function() {
		this.characterInit();
	},	
});


GameHelper.createCharacterComponent('Echo', '', {
	defaults : {
		description : "A race of beings with no emotions.  Tho their life spans are short, they are known to travel many miles in their lifetime.",
		elementalType: 'air',
		alignment: 'neutral',
		characterSpeed : Global.defaultSpeed-1,
		maxHealth : Global.defaultMaxHealth,
		curHealth : Global.defaultMaxHealth,
		isTranslucent : false,
		abilitiesInfo : { 
			"Hurricane" : { curCount: 0, lastUsed: 0},
			"Fade" : { curCount: 0, lastUsed: 0}
		},	
		spriteName : "echo"
	},
	init : function() {
		this.characterInit();
	},	
});

GameHelper.createCharacterComponent('Lavax', '', {
	defaults : {
		description : "A race born in molten.  They are good friends with rokcores, but would rather stay neutral over the battles in " + Game.gameWorldName,
		elementalType: 'fire',
		alignment: 'neutral',
		characterSpeed : Global.defaultSpeed-1,
		maxHealth : Global.defaultMaxHealth,
		curHealth : Global.defaultMaxHealth,
		isTranslucent : false,
		abilitiesInfo : { 
			"Crimson Fire" : { curCount: 0, lastUsed: 0},
			"Fire Dance" : { curCount: 0, lastUsed: 0}
		},	
		spriteName : "lavax"
	},
	init : function() {
		this.characterInit();
	},	
});

GameHelper.createCharacterComponent('Ishimi', '', {
	defaults : {
		description : "One of the newer races in" + Game.gameWorldName + ".  Although gross in nature, these slime-like creatures have developed a " +
		"symbiotic relationship with the oceans and rivers in " + Game.gameWorldName,
		elementalType: 'water',
		alignment: 'neutral',
		characterSpeed : Global.defaultSpeed,
		maxHealth : Global.defaultMaxHealth,
		curHealth : Global.defaultMaxHealth,
		isTranslucent : false,
		abilitiesInfo : { 
			"Slime Blast" : { curCount: 0, lastUsed: 0},
			"Circus of Slime" : { curCount: 0, lastUsed: 0}
		},	
		spriteName : "ishimi"
	},
	init : function() {
		this.characterInit();
	},	
});


GameHelper.createCharacterComponent('Treenoc', '', {
	defaults : {
		description : "An ancient race in " + Game.gameWorldName + ".  These tree-like creatures hardly move, but when the unbalance first unfolded " +
		"they were amongst the first races to notice it.",
		elementalType: 'earth',
		alignment: 'neutral',
		characterSpeed : Global.defaultSpeed-1,
		maxHealth : Global.defaultMaxHealth * 0.9,
		curHealth : Global.defaultMaxHealth * 0.9,
		isTranslucent : false,
		abilitiesInfo : { 
			"Strangling Branches" : { curCount: 0, lastUsed: 0},
			"Entangling Vines" : { curCount: 0, lastUsed: 0}
		},	
		spriteName : "treenoc"
	},
	init : function() {
		this.characterInit();
	},	
});