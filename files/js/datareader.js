(function(){

var fileSize = 700;
var mime = new RegExp('(image.*)|(application/((x-compressed)|(x-zip-compressed)|(zip)))|(multipart/x-zip)');

self.addEventListener('message', function(e) {
	var file = e.data;
	var reader = new FileReaderSync();
	if (!file[0].type.match(mime)) {
		postMessage('typeError');
	}
	else if (file[0].size > (fileSize * 1024)) {
		postMessage('sizeError');
	}
	else {
		file = reader.readAsDataURL(file[0]);
		postMessage(file);
	}
}, false);

})();