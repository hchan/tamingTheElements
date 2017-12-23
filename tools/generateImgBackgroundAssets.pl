require "imgHelper.pl";
use List::Util qw[min max];
use POSIX;
$assetDir = "../imgWorkarea/background";
$assetDirHref = "img/background";

$imgAssetsFile = $srcDir . "/imgBackgroundAssets.js";



`rm $srcDir/../$assetDirHref/*`;
opendir DIR,$assetDir;
my @dir = readdir(DIR);
close DIR;


open WH, ">$imgAssetsFile";
print WH "// Img Background Assets Generated on : $date\n";
print WH "Global.imgBackgroundAssets = {\n";

foreach(@dir){
    $file = $_;
    if ($file =~ /\.png$/) {
	$spriteName = $file;
	$spriteName =~ s#\.png$##;

	$geometry = `identify -verbose $assetDir/$file 2>&1| grep Geometry`;
	$geometry =~ /:\s(\d+)x(\d+)/;
	$width = $1;
	$height = $2;
	$coords = "[0, 0, " . $width . ", $height]";

	print WH "\t'$spriteName': {\n";
	print WH "\t\turl: '" . $assetDirHref . "/" . $file . "',\n";
	print WH "\t\tcoords : $coords,\n";
	print WH "\t\tname : '" . $spriteName . "'\n";
	print WH "\t},\n";
	`cp $assetDir/$file $srcDir/../$assetDirHref`;
    }
}

print WH "}\n";
close WH;

