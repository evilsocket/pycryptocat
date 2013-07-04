$(window).ready(function() {

// Safari compatibility
window.URL = window.URL || window.webkitURL

var files = {}
var rcvFile = {}
var fileMIME = new RegExp('^(image\/(png|jpeg|gif))|(application\/((x-compressed)|(x-zip-compressed)|(zip)'
	+ '|(x-zip)|(x-zip-compressed)|(x-compress)|(x-compressed)))|(multipart/x-zip)$'
)

function cn(to) {
	return Cryptocat.conversationName + '@' + Cryptocat.conferenceServer + '/' + to
}

Cryptocat.beginSendFile = function(data) {
	if (!data.file.type.match(fileMIME)) {
		$('#fileInfoField').text(Cryptocat.language['chatWindow']['fileTypeError'])
		return
	}
	else if (data.file.size > (Cryptocat.fileSize * 1024)) {
		$('#fileInfoField').text(Cryptocat.language['chatWindow']['fileSizeError'])
		return
	}
	else {
		window.setTimeout(function() {
			$('#dialogBoxClose').click()
		}, 500)
	}
	var sid = Cryptocat.connection.getUniqueId()
	files[sid] = {
		to: data.to,
		position: 0,
		file: data.file,
		key: data.key,
		total: Math.ceil(data.file.size / Cryptocat.chunkSize),
		ctr: -1
	}
	/* jshint -W106 */
	Cryptocat.connection.si_filetransfer.send(
	/* jshint +W106 */
		cn(data.to),
		sid,
		data.filename,
		data.file.size,
		data.file.type,
		function(err) {
			if (err) {
				return console.log(err)
			}
			Cryptocat.connection.ibb.open(cn(data.to), sid, Cryptocat.chunkSize, function(err) {
				if (err) {
					return console.log(err)
				}
				Cryptocat.addToConversation(sid, Cryptocat.myNickname, data.to, 'file')
				Cryptocat.sendFileData({
					start: true,
					to: data.to,
					sid: sid
				})
			})
		}
	)
}

Cryptocat.sendFileData = function(data) {
	var sid = data.sid
	var seq = data.start ? 0 : parseInt(data.seq, 10) + 1
	if (seq > 65535) {
		seq = 0
	}
	if (files[sid].position > files[sid].file.size) {
		Cryptocat.connection.ibb.close(cn(data.to), sid, function(err) {
			if (err) {
				return console.log(err)
			}
		})
		Cryptocat.updateFileProgressBar(sid, files[sid].ctr + 1, files[sid].file.size, data.to)
		return
	}
	// Split into chunk
	var end = files[sid].position + Cryptocat.chunkSize
	// Check for slice function on file
	var sliceStr = files[sid].file.slice ? 'slice' : 'webkitSlice'
	var chunk = files[sid].file[sliceStr](files[sid].position, end)
	files[sid].position = end
	files[sid].ctr += 1
	var reader = new FileReader()
	reader.onload = function(event) {
		var msg = event.target.result
		// Remove dataURL header
		msg = msg.split(',')[1]
		// Encrypt
		// don't use seq as a counter
		// it repeats after 65535 above
		var opts = {
			mode: CryptoJS.mode.CTR,
			iv: CryptoJS.enc.Latin1.parse(OTR.HLP.packCtr(files[sid].ctr)),
			padding: CryptoJS.pad.NoPadding
		}
		var aesctr = CryptoJS.AES.encrypt (
			CryptoJS.enc.Base64.parse(msg),
			CryptoJS.enc.Latin1.parse(files[sid].key[0]),
			opts
		)
		msg = aesctr.toString()
		// Then mac
		var prefix = OTR.HLP.packBytes(files[sid].ctr, 8)
		prefix += OTR.HLP.packBytes(files[sid].total, 8)
		var mac = CryptoJS.HmacSHA512(
			CryptoJS.enc.Base64.parse(prefix + msg),
			CryptoJS.enc.Latin1.parse(files[sid].key[1])
		)
		// Combine ciphertext and mac, then transfer chunk
		msg += mac.toString(CryptoJS.enc.Base64)
		Cryptocat.connection.ibb.data(cn(data.to), sid, seq, msg, function(err) {
			if (err) {
				return console.log(err)
			}
			Cryptocat.sendFileData({
				seq: seq,
				to: data.to,
				sid: sid
			})
		})
		Cryptocat.updateFileProgressBar(sid, files[sid].ctr + 1, files[sid].file.size, data.to)
	}
	reader.readAsDataURL(chunk)
}

// make sure current Safari is at least <version>
function matchSafariVersion(version) {
	var match = navigator.userAgent.match(/\bversion\/(\d+)\.(\d+)\.(\d+)/i)
	if (match == null) {
		return false
	}
	match = match.slice(1).map(function (i) {
		return parseInt(i, 10)
	})
	function ver(arr, pos) {
		if (arr[pos] > version[pos]) {
			return true
		}
		if (arr[pos] === version[pos]) {
			pos += 1
			if (pos === version.length) {
				return true
			}
			return ver(arr, pos)
		}
		return false
	}
	return ver(match, 0)
}

Cryptocat.ibbHandler = function(type, from, sid, data, seq) {
	var nick = from.split('/')[1]
	switch (type) {
		case 'open':
			var file = rcvFile[from][sid].filename
			rcvFile[from][sid].key = Cryptocat.fileKeys[nick][file]
			if (sid.match(/^\w{64}$/) && rcvFile[from][sid].mime.match(fileMIME)) {
				Cryptocat.addToConversation(sid, nick, nick, 'file')
			}
			delete Cryptocat.fileKeys[nick][file]
			break
		case 'data':
			if (rcvFile[from][sid].abort) {
				return
			}
			if (rcvFile[from][sid].ctr > rcvFile[from][sid].total - 1) {
				rcvFile[from][sid].abort = true
				Cryptocat.fileTransferError(sid)
				return
			}
			rcvFile[from][sid].seq = seq
			var key = rcvFile[from][sid].key
			var ss = data.length - 88
			var msg = data.substring(0, ss)
			var mac = data.substring(ss)
			var prefix = OTR.HLP.packBytes(rcvFile[from][sid].ctr, 8)
			prefix += OTR.HLP.packBytes(rcvFile[from][sid].total, 8)
			var cmac = CryptoJS.HmacSHA512(
				CryptoJS.enc.Base64.parse(prefix + msg),
				CryptoJS.enc.Latin1.parse(key[1])
			)
			if (mac !== cmac.toString(CryptoJS.enc.Base64)) {
				rcvFile[from][sid].abort = true
				Cryptocat.fileTransferError(sid)
				console.log('OTR file transfer: MACs do not match.')
				return
			}
			var opts = {
				mode: CryptoJS.mode.CTR,
				iv: CryptoJS.enc.Latin1.parse(OTR.HLP.packCtr(rcvFile[from][sid].ctr)),
				padding: CryptoJS.pad.NoPadding
			}
			msg = CryptoJS.AES.decrypt(msg, CryptoJS.enc.Latin1.parse(key[0]), opts)
			rcvFile[from][sid].data += (msg.toString(CryptoJS.enc.Latin1))
			rcvFile[from][sid].ctr += 1
			Cryptocat.updateFileProgressBar(sid, rcvFile[from][sid].ctr, rcvFile[from][sid].size, nick)
			break
		case 'close':
			if (!rcvFile[from][sid].abort && rcvFile[from][sid].total === rcvFile[from][sid].ctr) {
				var url
				if (navigator.userAgent === 'Chrome (Mac app)' ||
				(navigator.userAgent.match('Safari') && !navigator.userAgent.match('Chrome'))) {
					// Safari older than 6.0.5 can only support 128kb
					if (navigator.userAgent !== 'Chrome (Mac app)' &&
					!matchSafariVersion([6, 0, 5]) &&
					rcvFile[from][sid].size >= 131072) {
						Cryptocat.fileTransferError(sid)
						console.log('File size is too large for this version of Safari')
						;delete rcvFile[from][sid]
						return
					}
					url = 'data:application/octet-stream;base64,' +
						CryptoJS.enc.Latin1
							.parse(rcvFile[from][sid].data)
							.toString(CryptoJS.enc.Base64)
				}
				else {
					// Convert data to blob
					var ia = new Uint8Array(rcvFile[from][sid].data.length)
					for (var i = 0; i < rcvFile[from][sid].data.length; i++) {
						ia[i] = rcvFile[from][sid].data.charCodeAt(i)
					}
					var blob = new Blob([ia], { type: rcvFile[from][sid].mime })
					url = window.URL.createObjectURL(blob)
				}
				if (rcvFile[from][sid].filename.match(/^[\w-.]+$/)
				&& rcvFile[from][sid].mime.match(fileMIME)) {
					Cryptocat.addFile(url, sid, nick, rcvFile[from][sid].filename)
				}
				else {
					Cryptocat.fileTransferError(sid)
					console.log('Received file of unallowed file type ' +
						rcvFile[from][sid].mime + ' from ' + nick)
				}
			}
			delete rcvFile[from][sid]
			break
	}
}

Cryptocat.fileHandler = function(from, sid, filename, size, mime) {
	if (!rcvFile[from]) {
		rcvFile[from] = {}
	}
	rcvFile[from][sid] = {
		filename: filename,
		size: size,
		mime: mime,
		seq: 0,
		ctr: 0,
		total: Math.ceil(size / Cryptocat.chunkSize),
		abort: false,
		data: ''
	}
}

})
