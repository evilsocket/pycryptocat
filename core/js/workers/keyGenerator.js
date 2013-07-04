(function() {
	importScripts('../lib/crypto-js/core.js')
	importScripts('../lib/crypto-js/enc-base64.js')
	importScripts('../lib/crypto-js/cipher-core.js')
	importScripts('../lib/crypto-js/x64-core.js')
	importScripts('../lib/crypto-js/aes.js')
	importScripts('../lib/crypto-js/sha1.js')
	importScripts('../lib/crypto-js/sha256.js')
	importScripts('../lib/crypto-js/sha512.js')
	importScripts('../lib/crypto-js/hmac.js')
	importScripts('../lib/crypto-js/pad-nopadding.js')
	importScripts('../lib/crypto-js/mode-ctr.js')
	importScripts('../lib/salsa20.js')
	importScripts('../etc/cryptocatRandom.js')
	importScripts('../lib/bigint.js')
	importScripts('../lib/eventemitter.js')
	importScripts('../lib/otr.js')

	self.addEventListener('message', function(e) {
		Cryptocat.setSeed(e.data)
		self.postMessage(new DSA())
	}, false)

})()