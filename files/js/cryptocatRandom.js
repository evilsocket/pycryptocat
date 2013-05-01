var Cryptocat = function() {};

(function(){

var state;

Cryptocat.generateSeed = function() {
	// If Opera, do not seed (see Cryptocat.random() comments for explanation).
	if (navigator.userAgent.match('Opera')) { return false }
	// The following incredibly ugly Firefox hack is completely the fault of 
	// Firefox developers sucking and it taking them four years+ to implement
	// window.crypto.getRandomValues().
	function firefoxRandomBytes() {
		var element = document.createElement('cryptocatFirefoxElement');
		document.documentElement.appendChild(element);
		var evt = document.createEvent('HTMLEvents');
		evt.initEvent('cryptocatGenerateRandomBytes', true, false);
		element.dispatchEvent(evt);
		var output = element.getAttribute('randomValues').split(',');
		delete element;
		return output;
	}
	// Firefox
	if (navigator.userAgent.match('Firefox')) {
		var buffer = firefoxRandomBytes();
	}
	// Browsers that don't require shitty workarounds
	else {
		var buffer = new Uint8Array(40);
		window.crypto.getRandomValues(buffer);
	}
	return buffer;
}

Cryptocat.setSeed = function(s) {
	if (!s) { return false }
	state = new Salsa20(
		[
			s[00],s[01],s[02],s[03],s[04],s[05],s[06],s[07],
			s[08],s[09],s[10],s[11],s[12],s[13],s[14],s[15],
			s[16],s[17],s[18],s[19],s[20],s[21],s[22],s[23],
			s[24],s[25],s[26],s[27],s[28],s[29],s[30],s[31]
		],
		[
			s[32],s[33],s[34],s[35],s[36],s[37],s[38],s[39]
		]
	);
}

// In Opera, Math.random() is a cryptographically secure
// random number generator. Opera is the only browser
// in which this is the case. Therefore, it is safe to use
// Math.random() instead of implementing our own CSPRNG
// if Cryptocat is running on top of Opera.
if (navigator.userAgent.match('Opera')) {
	Cryptocat.random = Math.random;
}
else {
	Cryptocat.random = function() {
		o = '';
		while (o.length < 16) {
			x = state.getBytes(1);
			if (x[0] <= 250) {
				o += x[0] % 10;
			}
		}
		return parseFloat('0.' + o);
	}
}

// Generates a random string of length `size` characters.
// If `alpha = 1`, random string will contain alpha characters, and so on.
// If 'hex = 1', all other settings are overridden.
Cryptocat.randomString = function(size, alpha, uppercase, numeric, hex) {
	var keyspace = '';
	var result = '';
	if (hex) {
		keyspace = '0123456789abcdef';
	}
	else {
		if (alpha) {
			keyspace += 'abcdefghijklmnopqrstuvwxyz';
		}
		if (uppercase) {
			keyspace += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
		}
		if (numeric) {
			keyspace += '0123456789';
		}
	}
	for (var i = 0; i !== size; i++) {
		result += keyspace[Math.floor(Cryptocat.random()*keyspace.length)];
	}
	return result;
}

})();//:3