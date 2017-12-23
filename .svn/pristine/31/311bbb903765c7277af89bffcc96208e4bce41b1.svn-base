$date = `date`;
$srcDir = "../war/WEB-INF/private/src";
$defaultWidth = 80;
$defaultHeight = 80;
$resizeGeom = 4*$defaultWidth . "x" . $defaultHeight;
$cropWidth = 400;
$cropHeight = 400;
$cropGeom = $cropWidth . "x" . $cropHeight;

sub inArray {
    local($retval) = 0;
    local($val, @arr) = @_;
    foreach (@arr) {
	$i = $_;
	if ($i eq $val) {
	    $retval = 1;
	    last;
	}
    }
    return $retval;
}

1;
