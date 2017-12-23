ChaoticFire = {
	
	canvas : null,
	ctx : null,
	data_width : null,
	data_height : null,
	colors : [],
	out_data : [],
	repeatInterval : null,

	// new filled array function
	new_filled_array : function(len, val) {
	    var rv = new Array(len);
	    while (--len >= 0) {
	        rv[len] = val;
	    }
	    return rv;
	},

	// prepare palette function
	prepare_palette : function() {
	    for (var i = 0; i < 64; ++i) {
	    	 this.colors[i + 0] = {r: 0, g: 0, b: i << 1, a: i};
	    	 this.colors[i + 64] = {g: i << 2, r: 0, b: 128 - (i << 2), a: i+64};
	    	 this.colors[i + 128] = {g: 128, r: i << 1, b: 0, a: i+128};
	    	 this.colors[i + 192] = {r: 0, g: 0, b: 0, a: i+192};
	    }
	},

	// drawing functions
	clearCtx : function() { // clear canvas function
	    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
	},
	
	reset: function() {
		this.clearCtx();
		clearInterval(this.repeatInterval);
	},

	drawScene : function() { // main drawScene function
	    this.clearCtx(); // clear canvas

	    var data_cnt = this.data_width * (this.data_height - 1);
	    for (var i = 0; i < this.data_width; i++) {
	        this.out_data[data_cnt + i] = (0.7 > Math.random()) ? 255 : 0;
	    }
	    
	    for (var y = 0; y < 175; y++){
	        for (var x = 0; x < this.data_width; x++){
	            var s = data_cnt + x;

	            var temp_data = this.out_data[s] + this.out_data[s + 1] + this.out_data[s - 1] + this.out_data[s - this.data_width];
	          
	            temp_data >>= 2;
	            if (temp_data > 1){
	                temp_data -= 1;
	            }
	            temp_data <<= 0;
	    
	            
	            this.out_data[s - this.data_width] = temp_data;
	            
	         
	            var id = s << 2;
	            //id -= 100000; // - changes the height
	           
	            this.img_data.data[id + 0] = this.colors[temp_data].r; // red
	            this.img_data.data[id + 1] = this.colors[temp_data].g; // green
	            this.img_data.data[id + 2] = this.colors[temp_data].b; // blue
	            this.img_data.data[id + 3] = this.colors[temp_data].a; // alpha 
	        
	          
	        }
	        data_cnt -= this.data_width/2;
	    }

	    // draw result data
	    this.ctx.putImageData(this.img_data, 0, 0);
	},

//	if (window.attachEvent) {
//	    window.attachEvent('onload', main_init);
//	} else {
//	    if(window.onload) {
//	        var curronload = window.onload;
//	        var newonload = function() {
//	            curronload();
//	            main_init();
//	        };
//	        window.onload = newonload;
//	    } else {
//	        window.onload = main_init;
//	    }
//	}

	main_init : function() {

	    // creating canvas and context objects
	    this.canvas = document.getElementById('enterPortalCanvas');
	    this.ctx = this.canvas.getContext('2d');

	    // preparing initial image data (empty)
	    this.img_data = this.ctx.createImageData(this.canvas.width, this.canvas.height);

	    this.data_width = this.img_data.width,
	    this.data_height = this.img_data.height,

	    this.prepare_palette();

	    // allocating array with zeros
	    this.out_data = this.new_filled_array(this.data_width * this.data_height, 0);

	    this.repeatInterval = setInterval(function() {ChaoticFire.drawScene();}, 30); // loop drawScene

	}				
};
