require "imgHelper.pl";


$assetDir = $srcDir . "/../snd";
$assetsFile = $srcDir . "/sndAssets.js";


opendir DIR,$assetDir;
my @dir = readdir(DIR);
close DIR;


open WH, ">$assetsFile";
print WH "// Sound Assests Generated on : $date\n";
print WH "Global.sndAssets = [\n";


foreach(@dir){
    $file = $_;
    if ($file =~ /\.ogg$/) {
	print WH "\t'snd/$file',\n";
    }
}


print WH "];\n";
close WH;

