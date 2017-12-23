require "imgHelper.pl";

$assetDir = "../imgWorkarea/map";
$assetDirHref = "img/map";

$imgAssetsFile = $srcDir . "/imgMapAssets.js";

`rm $srcDir/../$assetDirHref/*`;
opendir DIR,$assetDir;
my @dir = readdir(DIR);
close DIR;


open WH, ">$imgAssetsFile";
print WH "// Img Map Assets Generated on : $date\n";
print WH "Global.imgMapAssets = {\n";

foreach(@dir){
    $file = $_;
    if ($file =~ /\.png$/) {
	$spriteName = $file;
	$spriteName =~ s#\.png$##;
	&copyAndTransform($file);

    }
}


opendir DIR, "$srcDir/../$assetDirHref";
@dir = readdir(DIR);
for (@dir) {
    $file = $_;
    if ($file =~ /\.png$/) {
	$spriteName = $file;
	$spriteName =~ s#\.png$##;
 	
	$geometry = `identify -verbose $srcDir/../$assetDirHref/$file 2>&1| grep Geometry`;
 	$geometry =~ /:\s(\d+)x(\d+)/;
 	$width = $1;
 	$height = $2;
	
	$baseFileName = $file;
	$baseFileName =~ s#\.png##;
 	print WH "\t'$spriteName': {\n";
 	print WH "\t\turl: '" . $assetDirHref . "/" . $file . "',\n";

	if ($file !~ /priaUnbalanced/) {
	    $coords = "[0, 0, " . $defaultWidth . ", $defaultHeight]";	
	} else {
	    $coords = "[0, 0, 400, 400]";	
	}

	if ($baseFileName !~ /Large$/) {
	    print WH "\t\turlLarge: '" . $assetDirHref . "/" . $baseFileName . "Large.png" . "',\n";	   
	} else {
	    $coords = "[0, 0, $cropWidth, $cropHeight]";
	}

	$frameCount = $width/$defaultWidth;

	print WH "\t\tleftFrames : [";
	for ($i = 0; $i < $frameCount; $i++) {
	    print WH "[" . $i*$defaultWidth . ",0]";
	    if ($i < $frameCount-1) {
		print WH ", ";
	    }
	}
	print WH "],\n";
	print WH "\t\trightFrames : [";
	for ($i = 0; $i < $frameCount; $i++) {
	    print WH "[" . $i*$defaultWidth . ",0]";
	    if ($i < $frameCount-1) {
		print WH ", ";
	    }
	}
	print WH "],\n";

	# Down Frames
	if (-f "$srcDir/../$assetDirHref/${spriteName}Down.png") {
	    $geometry = `identify -verbose $srcDir/../$assetDirHref/${spriteName}Up.png 2>&1| grep Geometry`;
	    $geometry =~ /:\s(\d+)x(\d+)/;
	    $width = $1;
	    $height = $2;
	    print WH "\t\tdownFrames : [";
	    for ($i = 0; $i < $frameCount; $i++) {
		print WH "[" . $i*$defaultWidth . ", " . $defaultHeight . "]";
		if ($i < $frameCount-1) {
		    print WH ", ";
		}
	    }
	    print WH "],\n";
	}
	# Up Frames
	if (-f "$srcDir/../$assetDirHref/${spriteName}Up.png") {
	    $geometry = `identify -verbose $srcDir/../$assetDirHref/${spriteName}Up.png 2>&1| grep Geometry`;
	    $geometry =~ /:\s(\d+)x(\d+)/;
	    $width = $1;
	    $height = $2;
	    print WH "\t\tupFrames : [";
	    for ($i = 0; $i < $frameCount; $i++) {
		print WH "[" . $i*$defaultWidth . ", " . $defaultHeight*2 . "]";
		if ($i < $frameCount-1) {
		    print WH ", ";
		}
	    }
	    print WH "],\n";
	}


	print WH "\t\tcoords : $coords,\n";

 	print WH "\t\tname : '" . $spriteName . "'\n";
 	print WH "\t},\n";
    }
}
print WH "}\n";
close WH;

sub copyAndTransform {
    local ($file) = @_;
    if ($file !~ /priaUnbalanced/) {
	`convert $assetDir/$file -resize $resizeGeom $srcDir/../$assetDirHref/$file 2>&1`;
	$baseFileName = $file;
	$baseFileName =~ s#\.png##;
	$newFileName = $file;
	$newFileName =~ s#\.png##;
	$newFileName .= "Large.png";
	`convert $assetDir/$file -crop $cropGeom $srcDir/../$assetDirHref/${newFileName} 2>&1`;
	`cp $srcDir/../$assetDirHref/${baseFileName}Large-0.png $srcDir/../$assetDirHref/$newFileName`;
	`rm $srcDir/../$assetDirHref/*Large-*`;
    } else {
	`cp $assetDir/$file $srcDir/../$assetDirHref`;
    }
    if ($file =~ /Down.png$/) {
	$masterFile = $file;
	$masterFile =~ s#Down.png$#.png#;
	`convert $srcDir/../$assetDirHref/$masterFile $srcDir/../$assetDirHref/$file -append $srcDir/../$assetDirHref/$masterFile`;
    };
    if ($file =~ /Up.png$/) {
	$masterFile = $file;
	$masterFile =~ s#Up.png$#.png#;
	`convert $srcDir/../$assetDirHref/$masterFile $srcDir/../$assetDirHref/$file -append $srcDir/../$assetDirHref/$masterFile`;
    };
    

};

