var gulp = require('gulp');
var rimraf = require('gulp-rimraf'); // rimraf directly
var runSequence = require('run-sequence');
var uglify = require('gulp-uglify');
var rename = require("gulp-rename");
var shell = require('gulp-shell')
var zip = require('gulp-zip');
var sass = require('gulp-sass')
var glob = require('glob');
var fs = require('fs');

var dest = "c:/temp/tamingtheelements";
var src = "war";
var appCfgBin = 'c:\\appengine-java-sdk-1.9.4\\bin\\appcfg';
var nwTamingTheElementsDir = 'c:\\node-webkit\\tamingTheElements';
var nwTamingTheElementsDirOrig = 'c:\\node-webkit\\tamingTheElements.orig';


var tteWinDir = 'c:\\node-webkit\\tamingTheElements\\tteWin';
var tteLinuxDir = 'c:\\node-webkit\\tamingTheElements\\tteLinux';
var tteOsxDir = 'c:\\node-webkit\\tamingTheElements\\tteOsx';

var globalFilePath = null;

var copyPackageNw = function(filePath) {
    console.log("copyPackageNw" + filePath);
    return gulp.src(dest + '/package.nw')
	.pipe(gulp.dest(filePath));
};


var zipNwDistro = function(filePath) {
    console.log("zipNwDistro" + filePath);
    return gulp.src(filePath + '/**')
	.pipe(zip(filePath + '.zip'))
	.pipe(gulp.dest(nwTamingTheElementsDir));
};


gulp.task('default', function(cb) {
    runSequence('clean', 'copy', 'uglify', 'removeOldSrc', 'useNewSrc', 'removeSrc2', 'deployToGAE');
});

gulp.task('clean', function() {
    //rimraf(dest, cb);
    return gulp.src(dest).pipe(rimraf({force:true}));
});

gulp.task('copy', function() {
    return gulp.src(src + '/**').
	pipe(gulp.dest(dest));   
});

gulp.task('uglify', function() {
    return gulp.src(dest + '/WEB-INF/private/src/*.js').
	pipe(uglify()).
	pipe(gulp.dest(dest + '/WEB-INF/private/src2'));
});

gulp.task('removeOldSrc', function() {
    return gulp.src(dest + '/WEB-INF/private/src').pipe(rimraf({force:true}));
});

gulp.task('copyNodeWebkitPackageJson', function() {
    return gulp.src('node-webkit.package.json').
	pipe(rename('package.json')).
	pipe(gulp.dest(dest));   
});

gulp.task('useNewSrc', function() {
    return gulp.src(dest + '/WEB-INF/private/src2/*').pipe(gulp.dest(dest + '/WEB-INF/private/src'));
});


gulp.task('removeSrc2', function() {
    return gulp.src(dest + '/WEB-INF/private/src2').pipe(rimraf({force:true}));
});

gulp.task('deployToGAE', function() {
    return gulp.src(dest + '/..').pipe(shell([appCfgBin + ' --oauth2 update ' + dest]));
});

gulp.task('createNwZip', function() {
    return gulp.src(dest + '/**')
        .pipe(zip(dest + '/package.nw'))
        .pipe(gulp.dest(dest));
});


gulp.task('cleanNwDirs', function() {
    return gulp.src(nwTamingTheElementsDir).pipe(rimraf({force:true}));
});


gulp.task('createNwDirs', function() {
    return gulp.src(nwTamingTheElementsDirOrig + '/**').pipe(gulp.dest(nwTamingTheElementsDir));
});


gulp.task("node-webkit", function() {
    runSequence('clean', 'copy', 'uglify', 'removeOldSrc', 'useNewSrc', 'removeSrc2', 'copyNodeWebkitPackageJson', 'createNwZip', 
		'cleanNwDirs',
		'createNwDirs',
		'copyPackageWin',
		'zipPackageWin',
		'copyPackageLinux',
		'zipPackageLinux',
		'copyPackageOsx',
		'zipPackageOsx'
	       );
});


gulp.task('copyPackageNwInstance', function() {
     return copyPackageNw(globalFilePath);		
 });
gulp.task('zipNwDistroInstance', function() {
    return zipNwDistro(globalFilePath);
});


gulp.task('copyPackageWin', function() {
    return gulp.src(dest + '/package.nw')
	.pipe(gulp.dest(tteWinDir));
});
gulp.task('zipPackageWin', function() {
    return gulp.src(tteWinDir + '/**')
	.pipe(zip(tteWinDir + '.zip'))
	.pipe(gulp.dest(nwTamingTheElementsDir));
});
gulp.task('copyPackageLinux', function() {
    return gulp.src(dest + '/package.nw')
	.pipe(gulp.dest(tteLinuxDir));
});
gulp.task('zipPackageLinux', function() {
    return gulp.src(tteLinuxDir + '/**')
	.pipe(zip(tteLinuxDir + '.zip'))
	.pipe(gulp.dest(nwTamingTheElementsDir));
});
gulp.task('copyPackageOsx', function() {
    return gulp.src(dest + '/package.nw')
	.pipe(gulp.dest(tteOsxDir));
});
gulp.task('zipPackageOsx', function() {
    return gulp.src(tteOsxDir + '/**')
	.pipe(zip(tteOsxDir + '.zip'))
	.pipe(gulp.dest(nwTamingTheElementsDir));
});


gulp.task('copyPackageNws', function() {
    glob.sync(nwTamingTheElementsDir + '/*').forEach(function(filePath) {
	if (fs.statSync(filePath).isDirectory()) {

	    console.log("HERE:" + filePath);
	    globalFilePath = filePath;
	    copyPackageNw(globalFilePath);
	    zipNwDistro(globalFilePath);



	}
    });    
});

gulp.task('sass', function () {
   return gulp.src(src + '/WEB-INF/private/css/*.scss')
        .pipe(sass())
        .pipe(gulp.dest(src + '/WEB-INF/private/css'));
});