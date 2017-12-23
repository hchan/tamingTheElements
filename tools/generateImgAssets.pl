require "imgHelper.pl";
use List::Util qw[min max];
use POSIX;
$assetDir = "../imgWorkarea";
$assetDirHref = "img";

$imgAssetsFile = $srcDir . "/imgAssets.js";
@doNotResize =("evilEyes", "death", "favicon", "pria", "victory", "waterCorner", "fireCorner", "earthCorner", "airCorner");


`rm $srcDir/../$assetDirHref/*`;
opendir DIR,$assetDir;
my @dir = readdir(DIR);
close DIR;


open WH, ">$imgAssetsFile";
print WH "// Img Assets Generated on : $date\n";
print WH "Global.imgAssets = {\n";

foreach(@dir){
    $file = $_;
    if ($file =~ /\.png$/) {
	$needToResize = 0;

	$spriteName = $file;
	$spriteName =~ s#\.png$##;


	$geometry = `identify -verbose $assetDir/$file 2>&1| grep Geometry`;
	$geometry =~ /:\s(\d+)x(\d+)/;
	$width = $1;
	$height = $2;
	$maxOfWidthAndHeight =  max($width, $height);
	if ($maxOfWidthAndHeight > $defaultWidth && !&inArray($spriteName, @doNotResize)) {
	    if ($width > $height) {
		$height = ceil(($height / $width) * $defaultWidth);
		$width = $defaultWidth;
	    } else {
		$width = ceil(($width / $height) * $defaultWidth);
		$height = $defaultWidth;
	    }
	    $resizeGeom = "${width}x${height}";
	    
	    $needToResize = 1;
	} 
	if ($needToResize == 1) {
	    `convert $assetDir/$file -resize $resizeGeom $srcDir/../$assetDirHref/$file 2>&1`;
	} else {
	    `cp $assetDir/$file $srcDir/../$assetDirHref`;
	}

	$geometry = `identify -verbose $srcDir/../$assetDirHref/$file 2>&1| grep Geometry`;
	$geometry =~ /:\s(\d+)x(\d+)/;
	$width = $1;
	$height = $2;
	$coords = "[0, 0, " . $width . ", $height]";

	print WH "\t'$spriteName': {\n";
	print WH "\t\turl: '" . $assetDirHref . "/" . $file . "',\n";
	print WH "\t\tcoords : $coords,\n";
	print WH "\t\tname : '" . $spriteName . "'\n";
	print WH "\t},\n";


    }
}

print WH "}\n";
close WH;

