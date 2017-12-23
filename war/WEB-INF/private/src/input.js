var Input = {
		types : { 
//			"Primary Ability" : ["SPACE", "1"],
//			"Secondary Ability" : ["ENTER", "2"],
//			"Capture" : ["3"],
//			"Swap1" : ["4"],
//			"Swap2" : ["5"],
			"Toggle Pause" : ["SHIFT-P"],
			"Toggle Mute" : ["CTRL-M"],
			"I Win" : ["SHIFT-Q"],
			"Freeze" : ["SHIFT-X"],
			"CaptureWin" : ["SHIFT-C"],
		},

		is : function (type, e) {
			
			var retval = false;
			var keys = this.types[type];
			
			
			if (keys != null) {
				for (var i = 0; i < keys.length; i++) {
					var key = keys[i];
					var ctrlCond = true;
					var shiftCond = true;
					if (key.startsWith("CTRL-")) {
						key = key.replace("CTRL-", "");
						ctrlCond = e.ctrlKey;
					} else if (key.startsWith("SHIFT-")) {
						key = key.replace("SHIFT-", "");
						shiftCond = e.shiftKey;
					}
					retval |= (shiftCond && ctrlCond && e.keyCode == Crafty.keys[key]);
					
				}
			}
			return retval;
		},
		
		getNumber : function (e) {
			var retval = -1;
			var keyCode = (e.keyCode ? e.keyCode : e.which);
		    if (keyCode > 47 && keyCode < 58) {
		    	retval = keyCode - 48;
		    }
			return retval;
		}
		
};