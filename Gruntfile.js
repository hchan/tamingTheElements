var buildDir = '../q8e192sandbox/war/craftyjs';
var warDir = "WebContent";
var assetFile = warDir + "/src/assets.js";
module.exports = function(grunt) {
    
  // Project configuration.
    grunt.initConfig({
	pkg: grunt.file.readJSON('package.json'),
	
	copy: {
	    build: {
		cwd: warDir,
		src: [ '**' ],
		dest: buildDir,
		expand: true
	    },
	},
	
	uglify: {
	    options: {
		banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
	    },
	    build: {
		files: [{
		    expand: true,
		    src: 'src/*',
		    dest: buildDir,
		    cwd: warDir,
		}]
	    }
	},

	"file-creator" : {
	    options: {
		openFlags: 'w'
	    },
	    "folder": {
		'WebContent/src/assets.js': function(fs, fd, done) {
		    var glob = grunt.file.glob;
		    var _ = grunt.util._;
		    glob(warDir + '/assets/*', function (err, files) {
			var date = new Date();
			fs.writeSync(fd, '// Generated on ' + date + '\n');
			fs.writeSync(fd, 'Global.assets = [\n');
			_.each(files, function(file) {
			    file = file.replace(warDir + '/', '');
			    fs.writeSync(fd, '"' + file + '",\n');
			});			
			fs.writeSync(fd, '];\n');
			done();
		    });
		},

		'WebContent/src/imageAssets.js': function(fs, fd, done) {
		    var glob = grunt.file.glob;
		    var _ = grunt.util._;
		    glob(warDir + '/assets/*', function (err, files) {
			var date = new Date();
			fs.writeSync(fd, '// Generated on ' + date + '\n');
			fs.writeSync(fd, 'ImageAsset = {\n');
			_.each(files, function(file) {
			    file = file.replace(warDir + '/', '');
			    if (file.indexOf("\.png") != -1) {
				var spriteName = file;
				var hasFrames = false;
				var frameCount = 0;
				spriteName = spriteName.replace("\.png", "");
				spriteName = spriteName.replace("assets/", "");
				
				if (spriteName.indexOf("_frames") != -1) {
				    hasFrames = true;
				    var frameIndex = spriteName.indexOf("_frames");
				    var frameCountIndex = frameIndex + "_frames".length;
				    frameCount = spriteName.substr(frameCountIndex, 1);				    
				    var processOut = grunt.util.spawn({
					cmd: 'dir',
					args: [file],
					opts: {stdio: 'inherit'}
				    }, function (err, res, code) {
					console.log("YO")
					if (err) {
					    grunt.fail.fatal(err);
					} else {
					    
					}
					console.log("ZZZZ");

				    });
				    processOut.start();
				    //console.log(processOut);
				   // console.log(processOut.stdout);
				    //processOut.stdout.on('data', function(buf) {
				//	console.log(String(buf));
				  //  });
				}
				fs.writeSync(fd, "\t" + spriteName + ": {\n");
				fs.writeSync(fd, "\t\turl: '" + file + "', \n");
				if (hasFrames) {
				    fs.writeSync(fd, "\t\tframes: '" + frameCount + "'\n");
				}
//pria : {
//		url : "assets/pria_frames4.png",
//		frames: []
//	}

				fs.writeSync(fd, '\t},\n');
			    }
			});			
			fs.writeSync(fd, '};\n');
			done();
		    });
		}
	    }
	}
    });
    
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-file-creator');
    
    // Default task(s).
    grunt.registerTask('default', ['copy', 'uglify']);
    grunt.registerTask('generateAssets', ['file-creator']);
};