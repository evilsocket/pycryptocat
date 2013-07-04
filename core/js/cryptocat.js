if (typeof Cryptocat === 'undefined') {
	Cryptocat = function() {}
}
Cryptocat.version = '2.1.11' // Version number
Cryptocat.fileSize = 5120 // Maximum encrypted file sharing size, in kilobytes.
Cryptocat.chunkSize = 64511 // Size in which file chunks are split, in bytes.

Cryptocat.fileKeys = {}
Cryptocat.blockedUsers = []
Cryptocat.connection = null
Cryptocat.domain = null
Cryptocat.conferenceServer = null
Cryptocat.bosh = null
Cryptocat.conversationName = null
Cryptocat.myNickname = null

if (typeof(window) !== 'undefined') { $(window).ready(function() {

// This provides backwards compatibility with CryptoJS 3.0.2
// CryptoJS.enc.Base64.parse used to do this by default.
var _base64Parse = CryptoJS.enc.Base64.parse
CryptoJS.enc.Base64.parse = function (base64Str) {
	return _base64Parse.call(CryptoJS.enc.Base64, base64Str.replace(/\s/g, ''))
}

/* Configuration */
// Domain name to connect to for XMPP.
var defaultDomain = 'crypto.cat'
// Address of the XMPP MUC server.
var defaultConferenceServer = 'conference.crypto.cat'
// BOSH is served over an HTTPS proxy for better security and availability.
var defaultBOSH = 'https://crypto.cat/http-bind'
var localStorageEnabled = true
if (navigator.userAgent.match('Firefox')) {
	localStorageEnabled = false
}

/* Initialization */
var otrKeys = {}
var conversations = {}
var composingTimeouts = {}
var currentStatus = 'online'
var isFocused = true
var currentConversation
var audioNotifications
var desktopNotifications
var showNotifications
var loginError
var myKey
var composing

// Set server information to defaults.
Cryptocat.domain = defaultDomain
Cryptocat.conferenceServer = defaultConferenceServer
Cryptocat.bosh = defaultBOSH

// Set version number in UI.
$('#version').text(Cryptocat.version)

// Seed RNG.
Cryptocat.setSeed(Cryptocat.generateSeed())

// Initialize language settings.
if (!localStorageEnabled) {
	Cryptocat.Language.set(window.navigator.language.toLowerCase())
}

// If localStorage is implemented, load saved settings.
if (localStorageEnabled) {
	// Load language settings
	if (localStorage.getItem('language')) {
		Cryptocat.Language.set(localStorage.getItem('language'))
	}
	else {
		Cryptocat.Language.set(window.navigator.language.toLowerCase())
	}
	// Load nickname settings.
	if (localStorage.getItem('myNickname')) {
		$('#nickname').animate({'color': 'transparent'}, function() {
			$(this).val(localStorage.getItem('myNickname'))
			$(this).animate({'color': '#FFF'})
		})
	}
	// Load notification settings.
	window.setTimeout(function() {
		if (localStorage.getItem('desktopNotifications') === 'true') {
			$('#notifications').click()
		}
		if (localStorage.getItem('audioNotifications') === 'true') {
			$('#audio').click()
		}
	}, 3000)
	// Load custom server settings
	if (localStorage.getItem('domain')) {
		Cryptocat.domain = localStorage.getItem('domain')
	}
	if (localStorage.getItem('conferenceServer')) {
		Cryptocat.conferenceServer = localStorage.getItem('conferenceServer')
	}
	if (localStorage.getItem('bosh')) {
		Cryptocat.bosh = localStorage.getItem('bosh')
	}
	// Load pre-existing encryption keys
	// Key storage currently disabled as we are not yet sure if this is safe to do.
	/* if (localStorage.getItem('myKey') !== null) {
		myKey = new DSA(JSON.parse(localStorage.getItem('myKey')))
		multiParty.setPrivateKey(localStorage.getItem('multiPartyKey'))
		multiParty.genPublicKey()
	} */
}

// Initialize workers
var keyGenerator = new Worker('js/workers/keyGenerator.js')
keyGenerator.onmessage = function(e) {
	myKey = new DSA(e.data)
	// Key storage currently disabled as we are not yet sure if this is safe to do.
	//if (localStorageEnabled) {
	//	localStorage.setItem('myKey', JSON.stringify(myKey))
	//}
	$('#loginInfo').text(Cryptocat.language['loginMessage']['connecting'])
	connectXMPP(Cryptocat.randomString(64, 1, 1, 1, 0), Cryptocat.randomString(64, 1, 1, 1, 0))
}

// Outputs the current hh:mm.
// If `seconds = true`, outputs hh:mm:ss.
function currentTime(seconds) {
	var date = new Date()
	var time = []
	time.push(date.getHours().toString())
	time.push(date.getMinutes().toString())
	if (seconds) { time.push(date.getSeconds().toString()) }
	for (var just in time) {
		if (time[just].length === 1) {
			time[just] = '0' + time[just]
		}
	}
	return time.join(':')
}

// Plays the audio file defined by the `audio` variable.
function playSound(audio) {
	(new Audio('snd/' + audio + '.wav')).play()
}

// Initiates a conversation. Internal use.
function initiateConversation(conversation) {
	if (!conversations.hasOwnProperty(conversation)) {
		conversations[conversation] = ''
	}
}

// OTR functions:
// Handle incoming messages.
var uicb = function(buddy) {
	return function(msg) {
		Cryptocat.addToConversation(msg, buddy, buddy, 'message')
	}
}
// Handle outgoing messages.
var iocb = function(buddy) {
	return function(message) {
		Cryptocat.connection.muc.message(
			Cryptocat.conversationName + '@' + Cryptocat.conferenceServer,
			buddy, message, null, 'chat', 'active'
		)
	}
}

// Handle SMP callback
var smcb = function (nickname) {
	return function (type, data) {
		var html
		switch (type) {
			case 'question':
				smpQuestion(nickname, data)
				break
			case 'trust':
				// smp completed
				html = otrKeys[nickname].trust
					? 'Successfully authenticated '
					: 'Failed to authenticate '
				html = Mustache.render(
					Cryptocat.templates.authWrap,
					{ html: '<p>' + html + nickname + '.</p>' })
				dialogBox(html, 1)
				break
		}
	}
}

// Creates a template for the conversation info bar at the top of each conversation.
function buildConversationInfo(conversation) {
	$('.conversationName').text(Cryptocat.myNickname + '@' + Cryptocat.conversationName)
	if (conversation === 'main-Conversation') {
		$('#groupConversation').text(Cryptocat.language['chatWindow']['groupConversation'])
	}
	else {
		$('#groupConversation').text('')
	}
}

// Switches the currently active conversation to `buddy'
function switchConversation(buddy) {
	if ($('#buddy-' + buddy).attr('status') !== 'offline') {
		$('#' + buddy).animate({'backgroundColor': '#151520'})
	}
	if (buddy !== 'main-Conversation') {
		$('#buddy-' + buddy).css('background-image', 'none')
	}
	buildConversationInfo(currentConversation)
	$('#conversationWindow').html(conversations[currentConversation])
	bindTimestamps()
	scrollDownConversation(0, false)
	$('#userInputText').focus()
	// Clean up finished conversations.
	$('#buddyList div').each(function() {
		if (($(this).attr('id') !== ('buddy-' + currentConversation))
			&& ($(this).css('background-image') === 'none')
			&& ($(this).attr('status') === 'offline')) {
			$(this).slideUp(500, function() {
				$(this).remove()
			})
		}
	})
}

// Handles login failures.
function loginFail(message) {
	showNotifications = false
	$('#loginInfo').text(message)
	$('#bubble').animate({'left': '+=5px'}, 130)
		.animate({'left': '-=10px'}, 130)
		.animate({'left': '+=5px'}, 130)
	$('#loginInfo').animate({'backgroundColor': '#E93028'}, 200)
}

// Simply shortens a string `string` to length `length.
// Adds '..' to delineate that string was shortened.
function shortenString(string, length) {
	if (string.length > length) {
		return string.substring(0, (length - 2)) + '..'
	}
	return string
}

// Clean nickname so that it's safe to use.
function cleanNickname(nickname) {
	var clean = nickname.match(/\/([\s\S]+)/)
	if (clean) { clean = Strophe.xmlescape(clean[1]) }
	else { return false }
	if (clean.match(/\W/)) { return false }
	return clean
}

// Get a fingerprint, formatted for readability.
function getFingerprint(buddy, OTR) {
	var fingerprint
	if (OTR) {
		if (buddy === Cryptocat.myNickname) {
			fingerprint = myKey.fingerprint()
		}
		else {
			/* jshint -W106 */
			fingerprint = otrKeys[buddy].their_priv_pk.fingerprint()
			/* jshint +W106 */
		}
	}
	else {
		if (buddy === Cryptocat.myNickname) {
			fingerprint = multiParty.genFingerprint()
		}
		else {
			fingerprint = multiParty.genFingerprint(buddy)
		}
	}
	var formatted = ''
	for (var i in fingerprint) {
		if (fingerprint.hasOwnProperty(i)) {
			if ((i !== 0) && (i % 8) === 0) {
				formatted += ' '
			}
			formatted += fingerprint[i]
		}
	}
	return formatted.toUpperCase()
}

// Convert message URLs to links. Used internally.
function addLinks(message) {
	var i, l, sanitize
	var URLs = message.match(/((http(s?)\:\/\/){1}\S+)/gi)
	if (URLs) {
		for (i in URLs) {
			if (URLs.hasOwnProperty(i)) {
				sanitize = URLs[i].split('')
				for (l in sanitize) {
					if (sanitize.hasOwnProperty(l) &&
						!sanitize[l].match(/\w|\d|\:|\/|\?|\=|\#|\+|\,|\.|\&|\;|\%/)) {
						sanitize[l] = encodeURIComponent(sanitize[l])
					}
				}
				sanitize = sanitize.join('')
				var processed = sanitize.replace(':','&colon;')
				if (navigator.userAgent === 'Chrome (Mac app)') {
					message = message.replace(
						sanitize, '<a href="' + processed + '">' + processed + '</a>'
					)
				}
				else {
					message = message.replace(
						sanitize, '<a href="' + processed + '" target="_blank">' + processed + '</a>'
					)
				}
			}
		}
	}
	return message
}

// Convert text emoticons to graphical emoticons.
function addEmoticons(message) {
	return message
		.replace(/(\s|^)(:|(=))-?3(?=(\s|$))/gi, ' <div class="emoticon eCat">$&</div> ')
		.replace(/(\s|^)(:|(=))-?\&apos;\((?=(\s|$))/gi, ' <div class="emoticon eCry">$&</div> ')
		.replace(/(\s|^)(:|(=))-?o(?=(\s|$))/gi, ' <div class="emoticon eGasp">$&</div> ')
		.replace(/(\s|^)(:|(=))-?D(?=(\s|$))/gi, ' <div class="emoticon eGrin">$&</div> ')
		.replace(/(\s|^)(:|(=))-?\((?=(\s|$))/gi, ' <div class="emoticon eSad">$&</div> ')
		.replace(/(\s|^)(:|(=))-?\)(?=(\s|$))/gi, ' <div class="emoticon eSmile">$&</div> ')
		.replace(/(\s|^)-_-(?=(\s|$))/gi, ' <div class="emoticon eSquint">$&</div> ')
		.replace(/(\s|^)(:|(=))-?p(?=(\s|$))/gi, ' <div class="emoticon eTongue">$&</div> ')
		.replace(/(\s|^)(:|(=))-?(\/|s)(?=(\s|$))/gi, ' <div class="emoticon eUnsure">$&</div> ')
		.replace(/(\s|^);-?\)(?=(\s|$))/gi, ' <div class="emoticon eWink">$&</div> ')
		.replace(/(\s|^);-?\p(?=(\s|$))/gi, ' <div class="emoticon eWinkTongue">$&</div> ')
		.replace(/(\s|^)\^(_|\.)?\^(?=(\s|$))/gi, ' <div class="emoticon eHappy">$&</div> ')
		.replace(/(\s|^)(:|(=))-?x\b(?=(\s|$))/gi, ' <div class="emoticon eShut">$&</div> ')
		.replace(/(\s|^)\&lt\;3\b(?=(\s|$))/g, ' <span class="monospace">&#9829;</span> ')
}

// Update a file transfer progress bar.
Cryptocat.updateFileProgressBar = function(file, chunk, size, recipient) {
	var progress = (chunk * 100) / (Math.ceil(size / Cryptocat.chunkSize))
	if (progress > 100) { progress = 100 }
	$('[file=' + file + '] .fileProgressBarFill').animate({'width': progress + '%'})
	var conversationBuffer = $(conversations[recipient])
	conversationBuffer.find('[file=' + file + '] .fileProgressBarFill').width(progress + '%')
	conversations[recipient] = $('<div>').append($(conversationBuffer).clone()).html()
}

// Convert Data blob/url to downloadable file, replacing the progress bar.
Cryptocat.addFile = function(url, file, conversation, filename) {
	var conversationBuffer = $(conversations[conversation])
	var fileLinkString = 'fileLink'
	if (navigator.userAgent === 'Chrome (Mac app)') {
		fileLinkString += 'Mac'
	}
	var fileLink = Mustache.render(Cryptocat.templates[fileLinkString], {
		url: url,
		filename: filename,
		downloadFile: Cryptocat.language['chatWindow']['downloadFile']
	})
	$('[file=' + file + ']').replaceWith(fileLink)
	conversationBuffer.find('[file=' + file + ']').replaceWith(fileLink)
	conversations[conversation] = $('<div>').append($(conversationBuffer).clone()).html()
}

// Signal a file transfer error in the UI.
Cryptocat.fileTransferError = function(sid) {
	$('[file=' + sid + ']').animate({
		'borderColor': '#F00'
	})
	$('[file=' + sid + ']').find('.fileProgressBarFill').animate({
		'backgroundColor': '#F00'
	})
}

// Add a `message` from `sender` to the `conversation` display and log.
// `type` can be 'file', 'composing' or 'message'.
Cryptocat.addToConversation = function(message, sender, conversation, type) {
	if (!message.length && (type !== 'composing')) { return false }
	if (Cryptocat.blockedUsers.indexOf(sender) >= 0) { return false }
	initiateConversation(conversation)
	var lineDecoration
	if (sender === Cryptocat.myNickname) {
		lineDecoration = 1
		message = Strophe.xmlescape(message)
	}
	else {
		lineDecoration = 2
		if (audioNotifications && (type !== 'composing')) {
			playSound('msgGet')
		}
		if (!isFocused && (type !== 'composing') && desktopNotifications) {
			desktopNotification('img/keygen.gif', sender, message, 0x1337)
		}
		message = Strophe.xmlescape(message)
		if (message.match(Cryptocat.myNickname)) {
			var nickRegEx = new RegExp(Cryptocat.myNickname, 'g')
			message = message.replace(nickRegEx, '<span class="nickHighlight">$&</span>')
			lineDecoration = 3
		}
	}
	if (type === 'file') {
		message = Mustache.render(Cryptocat.templates.file, { message: message })
	}
	else if (type === 'composing' && !message.length) {
		message = Mustache.render(Cryptocat.templates.composing, { id: 'composing-' + sender })
		if (composingTimeouts[sender]) {
			window.clearTimeout(composingTimeouts[sender])
			composingTimeouts[sender] = null
		}
		composingTimeouts[sender] = window.setTimeout(function() {
			if ($('#composing-' + sender).length) {
				$('#composing-' + sender).parent().fadeOut(100).remove()
			}
		}, 5000)
		if ($('#composing-' + sender).length) {
			return true
		}
	}
	else if (type === 'message') {
		message = addLinks(message)
		message = addEmoticons(message)
	}
	message = message.replace(/:/g, '&#58;')
	message = Mustache.render(Cryptocat.templates.message, {
		lineDecoration: lineDecoration,
		sender: shortenString(sender, 16),
		currentTime: currentTime(true),
		message: message
	})
	if (type !== 'composing') {
		conversations[conversation] += message
	}
	if (conversation === currentConversation) {
		$('#conversationWindow').append(message)
		$('.line' + lineDecoration).last().animate({'top': '0', 'opacity': '1'}, 100)
		bindTimestamps()
		scrollDownConversation(400, true)
	}
	else if (type !== 'composing') {
		iconNotify(conversation)
	}
}

// Bind timestamps to show when message sender is hovered.
function bindTimestamps() {
	$('.sender').unbind('mouseenter,mouseleave')
	$('.sender').mouseenter(function() {
		$(this).text($(this).attr('timestamp'))
	})
	$('.sender').mouseleave(function() {
		$(this).text($(this).attr('sender'))
	})
}

function iconNotify(conversation) {
	var backgroundColor = $('#buddy-' + conversation).css('backgroundColor')
	$('#buddy-' + conversation).css('background-image', 'url("img/newMessage.png")')
	$('#buddy-' + conversation)
		.animate({'backgroundColor': '#A7D8F7'})
		.animate({'backgroundColor': backgroundColor})
}

function desktopNotification(image, title, body, timeout) {
	// Mac
	if (navigator.userAgent === 'Chrome (Mac app)') {
		var iframe = document.createElement('IFRAME')
		iframe.setAttribute('src', 'js-call:'+title+':'+body)
		document.documentElement.appendChild(iframe)
		iframe.parentNode.removeChild(iframe)
		iframe = null
	}
	else {
		/* global Notification */ // This comment satisfies a jshint requirement.
		var notice = new Notification(title, { tag: 'Cryptocat', body: body, icon: image })
		if (timeout > 0) {
			window.setTimeout(function() {
				notice.cancel()
			}, timeout)
		}
	}
}

// Add a join/part notification to the main conversation window.
// If 'join === true', shows join notification, otherwise shows part.
function buddyNotification(buddy, join) {
	if (!showNotifications) { return false }
	var status, audioNotification
	buddy = Strophe.xmlescape(buddy)
	if (join) {
		status = '<div class="userJoin"><strong>+</strong>' + buddy + '</div>'
		audioNotification = 'userOnline'
	}
	else {
		status = '<div class="userLeave"><strong>-</strong>' + buddy + '</div>'
		audioNotification = 'userOffline'
	}
	conversations['main-Conversation'] += status
	if (currentConversation === 'main-Conversation') {
		$('#conversationWindow').append(status)
	}
	scrollDownConversation(400, true)
	if (!isFocused && desktopNotifications) {
		desktopNotification('img/keygen.gif', buddy, '', 0x1337)
	}
	if (audioNotifications) {
		playSound(audioNotification)
	}
}

// Build new buddy.
function addBuddy(nickname) {
	$('#buddyList').queue(function() {
		var buddyTemplate = Mustache.render(Cryptocat.templates.buddy, {
			nickname: nickname,
			shortNickname: shortenString(nickname, 12)
		})
		$(buddyTemplate).insertAfter('#buddiesOnline').slideDown(100, function() {
			$('#buddy-' + nickname).unbind('click')
			$('#menu-' + nickname).unbind('click')
			bindBuddyMenu(nickname)
			bindBuddyClick(nickname)
			for (var i = 0; i < 2; i++) {
				Cryptocat.connection.muc.message(
					Cryptocat.conversationName + '@' + Cryptocat.conferenceServer,
					null, multiParty.sendPublicKey(nickname), null, 'groupchat', 'active'
				)
			}
			buddyNotification(nickname, true)
		})
	})
	$('#buddyList').dequeue()
}

// Handle buddy going offline.
function removeBuddy(nickname) {
	// Delete their encryption keys.
	delete otrKeys[nickname]
	multiParty.removeKeys(nickname)
	if (($('#buddy-' + nickname).length !== 0)
		&& ($('#buddy-' + nickname).attr('status') !== 'offline')) {
		if ((currentConversation !== nickname)
			&& ($('#buddy-' + nickname).css('background-image') === 'none')) {
			$('#buddy-' + nickname).slideUp(500, function() {
				$(this).remove()
			})
		}
		else {
			$('#buddy-' + nickname).attr('status', 'offline')
			$('#buddy-' + nickname).animate({
				'color': '#BBB',
				'backgroundColor': '#222',
				'borderBottom': 'none'
			})
		}
	}
	buddyNotification(nickname, false)
}

// Handle nickname change (which may be done by non-Cryptocat XMPP clients)
function changeNickname(oldNickname, newNickname) {
	otrKeys[newNickname] = otrKeys[oldNickname]
	multiParty.renameKeys(oldNickname, newNickname)
	conversations[newNickname] = conversations[oldNickname]
	removeBuddy(oldNickname)
}

// Handle incoming messages from the XMPP server.
function handleMessage(message) {
	var nickname = cleanNickname($(message).attr('from'))
	var body = $(message).find('body').text().replace(/\&quot;/g, '"')
	var type = $(message).attr('type')
	// If archived message, ignore.
	if ($(message).find('delay').length !== 0) {
		return true
	}
	// If message is from me, ignore.
	if (nickname === Cryptocat.myNickname) {
		return true
	}
	// If message is from someone not on buddy list, ignore.
	if (!$('#buddy-' + nickname).length) {
		return true
	}
	// Check if message has a "composing" notification.	
	if ($(message).find('composing').length && !body.length) {
		var conversation
		if (type === 'groupchat') {
			conversation = 'main-Conversation'
		}
		else if (type === 'chat') {
			conversation = nickname
		}
		if (showNotifications) {
			Cryptocat.addToConversation('', nickname, conversation, 'composing')
		}
		return true
	}
	// Check if message has an "active" (stopped writing) notification.
	if ($(message).find('active').length) {
		if ($('#composing-' + nickname).length) {
			$('#composing-' + nickname).parent().fadeOut(100).remove()
		}
	}
	if (type === 'groupchat') {
		if (!body.length) { return true }
		body = multiParty.receiveMessage(nickname, Cryptocat.myNickname, body)
		if (typeof(body) === 'string') {
			Cryptocat.addToConversation(body, nickname, 'main-Conversation', 'message')
		}
	}
	else if (type === 'chat') {
		otrKeys[nickname].receiveMsg(body)
	}
	return true
}

// Handle incoming presence updates from the XMPP server.
function handlePresence(presence) {
	var nickname = cleanNickname($(presence).attr('from'))
	// If invalid nickname, do not process
	if ($(presence).attr('type') === 'error') {
		if ($(presence).find('error').attr('code') === '409') {
			// Delay logout in order to avoid race condition with window animation
			window.setTimeout(function() {
				loginError = true
				logout()
				loginFail(Cryptocat.language['loginMessage']['nicknameInUse'])
			}, 3000)
			return false
		}
		return true
	}
	// Ignore if presence status is coming from myself
	if (nickname === Cryptocat.myNickname) {
		return true
	}
	// Detect nickname change (which may be done by non-Cryptocat XMPP clients)
	if ($(presence).find('status').attr('code') === '303') {
		var newNickname = cleanNickname('/' + $(presence).find('item').attr('nick'))
		changeNickname(nickname, newNickname)
		return true
	}
	// Add to otrKeys if necessary
	if (nickname !== 'main-Conversation' && !otrKeys.hasOwnProperty(nickname)) {
		var options = {
			priv: myKey
		}
		otrKeys[nickname] = new OTR(options)
		otrKeys[nickname].REQUIRE_ENCRYPTION = true
		otrKeys[nickname].on('ui', uicb(nickname))
		otrKeys[nickname].on('io', iocb(nickname))
		otrKeys[nickname].on('smp', smcb(nickname))
		otrKeys[nickname].on('status', (function(nickname) {
			return function(state) {
				// Close generating fingerprint dialog after AKE.
				if (otrKeys[nickname].genFingerCb
				&& state === OTR.CONST.STATUS_AKE_SUCCESS) {
					closeGenerateFingerprints(nickname, otrKeys[nickname].genFingerCb)
					;delete otrKeys[nickname].genFingerCb
				}
			}
		} (nickname)))
		otrKeys[nickname].on('file', (function (nickname) {
			return function(type, key, filename) {
			// Make two keys, for encrypt then MAC.
				key = CryptoJS.SHA512(CryptoJS.enc.Latin1.parse(key))
				key = key.toString(CryptoJS.enc.Latin1)
				if (!Cryptocat.fileKeys[nickname]) {
					Cryptocat.fileKeys[nickname] = {}
				}
				Cryptocat.fileKeys[nickname][filename] = [
					key.substring(0, 32), key.substring(32)
				]
			}
		}) (nickname))
	}

	var status, color, placement
	// Detect buddy going offline.
	if ($(presence).attr('type') === 'unavailable') {
		removeBuddy(nickname)
		return true
	}
	// Create buddy element if buddy is new.
	else if (!$('#buddy-' + nickname).length) {
		addBuddy(nickname)
	}
	// Handle buddy status change to 'available'.
	else if ($(presence).find('show').text() === '' || $(presence).find('show').text() === 'chat') {
		if ($('#buddy-' + nickname).attr('status') !== 'online') {
			status = 'online'
			color = '#151520'
			placement = '#buddiesOnline'
		}
	}
	// Handle buddy status change to 'away'.
	else if ($('#buddy-' + nickname).attr('status') !== 'away') {
			status = 'away'
			color = '#778'
			placement = '#buddiesAway'
	}
	// Perform status change.
	$('#buddy-' + nickname).attr('status', status)
	if (placement) {
		$('#buddy-' + nickname).animate({ 'color': color }, function() {
			if (currentConversation !== nickname) {
				$(this).insertAfter(placement).slideDown(200)
			}
		})
	}
	return true
}

// Bind buddy click actions. Used internally.
function bindBuddyClick(nickname) {
	$('#buddy-' + nickname).click(function() {
		if ($(this).prev().attr('id') === 'currentConversation') {
			$('#userInputText').focus()
			return true
		}
		if (nickname !== 'main-Conversation') {
			$(this).css('background-image', 'none')
		}
		else {
			$(this).css('background-image', 'url("img/groupChat.png")')
		}
		if (currentConversation) {
			var previousConversation = currentConversation
			if ($('#buddy-' + previousConversation).attr('status') === 'online') {
				$('#buddy-' + previousConversation).animate({'backgroundColor': '#151520'})
				$('#buddy-' + previousConversation).insertAfter('#buddiesOnline').slideDown(100)
			}
			else if ($('#buddy-' + previousConversation).attr('status') === 'away') {
				$('#buddy-' + previousConversation).animate({'backgroundColor': '#222'})
				$('#buddy-' + previousConversation).insertAfter('#buddiesAway').slideDown(100)
			}
		}
		currentConversation = nickname
		initiateConversation(currentConversation)
		switchConversation(currentConversation)
		$('.line1, .line2, .line3').addClass('visibleLine')
		$(this).animate({'backgroundColor': '#97CEEC'})
		if (($(this).prev().attr('id') === 'buddiesOnline')
			|| (($(this).prev().attr('id') === 'buddiesAway')
			&& $('#buddiesOnline').next().attr('id') === 'buddiesAway')) {
			$(this).insertAfter('#currentConversation')
		}
		else {
			$(this).insertAfter('#currentConversation').slideDown(100)
		}
	})
}

// Send encrypted file.
function sendFile(nickname) {
	var sendFileDialog = Mustache.render(Cryptocat.templates.sendFile, {
		sendEncryptedFile: Cryptocat.language['chatWindow']['sendEncryptedFile'],
		fileTransferInfo: Cryptocat.language['chatWindow']['fileTransferInfo']
	})
	ensureOTRdialog(nickname, false, function() {
		dialogBox(sendFileDialog, 1)
		$('#fileSelector').change(function(e) {
			e.stopPropagation()
			if (this.files) {
				var file = this.files[0]
				var filename = Cryptocat.randomString(16, 1, 1, 1, 0)
				filename += file.name.match(/\.(\w)+$/)[0]
				otrKeys[nickname].sendFile(filename)
				var key = Cryptocat.fileKeys[nickname][filename]
				Cryptocat.beginSendFile({
					file: file,
					filename: filename,
					to: nickname,
					key: key
				})
				;delete Cryptocat.fileKeys[nickname][filename]
			}
		})
		$('#fileSelectButton').click(function() {
			$('#fileSelector').click()
		})
	})
}

// Scrolls down the chat window to the bottom in a smooth animation.
// 'speed' is animation speed in milliseconds.
// If `threshold is true, we won't scroll down if the user
// appears to be scrolling up to read messages.
function scrollDownConversation(speed, threshold) {
	var scrollPosition = $('#conversationWindow')[0].scrollHeight - $('#conversationWindow').scrollTop()
	if ((scrollPosition < 950) || !threshold) {
		$('#conversationWindow').animate({
			scrollTop: $('#conversationWindow')[0].scrollHeight + 20
		}, speed)
	}
}

// Close generating fingerprints dialog.
function closeGenerateFingerprints(nickname, arr) {
	var close = arr[0]
	var cb = arr[1]
	$('#fill').stop().animate({'width': '100%', 'opacity': '1'}, 400, 'linear', function() {
		$('#dialogBoxContent').fadeOut(function() {
			$(this).empty().show()
			if (close) {
				$('#dialogBoxClose').click()
			}
			cb()
		})
	})
}

// If OTR fingerprints have not been generated, show a progress bar and generate them.
function ensureOTRdialog(nickname, close, cb) {
	if (nickname === Cryptocat.myNickname || otrKeys[nickname].msgstate) {
		return cb()
	}
	var progressDialog = '<div id="progressBar"><div id="fill"></div></div>'
	dialogBox(progressDialog, 1)
	$('#progressBar').css('margin', '70px auto 0 auto')
	$('#fill').animate({'width': '100%', 'opacity': '1'}, 10000, 'linear')
	// add some state for status callback
	otrKeys[nickname].genFingerCb = [close, cb]
	otrKeys[nickname].sendQueryMsg()
}

// Display buddy information, including fingerprints etc.
function displayInfo(nickname) {
	nickname = Strophe.xmlescape(nickname)
	var infoDialog = Mustache.render(Cryptocat.templates.infoDialog, {
		nickname: nickname,
		otrFingerprint: Cryptocat.language['chatWindow']['otrFingerprint'],
		groupFingerprint: Cryptocat.language['chatWindow']['groupFingerprint']
	})
	ensureOTRdialog(nickname, false, function() {
		var color
		dialogBox(infoDialog, 1)
		$('#otrFingerprint').text(getFingerprint(nickname, 1))
		$('#multiPartyFingerprint').text(getFingerprint(nickname, 0))
		var otrColorprint = getFingerprint(nickname, 1).split(' ')
		otrColorprint.splice(0, 1)
		for (color in otrColorprint) {
			if (otrColorprint.hasOwnProperty(color)) {
				$('#otrColorprint').append(
					'<div class="colorprint" style="background:#'
					+ otrColorprint[color].substring(0, 6) + '"></div>'
				)
			}
		}
		var multiPartyColorprint = getFingerprint(nickname, 0).split(' ')
		multiPartyColorprint.splice(0, 1)
		for (color in multiPartyColorprint) {
			if (multiPartyColorprint.hasOwnProperty(color)) {
				$('#multiPartyColorprint').append(
					'<div class="colorprint" style="background:#'
					+ multiPartyColorprint[color].substring(0, 6) + '"></div>'
				)
			}
		}
	})
}

// Receive an SMP question
function smpQuestion(nickname, question) {
	var msg = nickname + ' requests your authentication secret.'
	if (question) {
		msg += ' They provided a question: ' + question
	}
	var secret = window.prompt(msg)
	otrKeys[nickname].smpSecret(secret)
}

// Display SMP authentication
/* function displayAuth(nickname) {
	ensureOTRdialog(nickname, false, function() {
		var authDialog = Mustache.render(
			Cryptocat.templates.authDialog,
			{ trust: otrKeys[nickname].trust })
		authDialog = Mustache.render(
			Cryptocat.templates.authWrap,
			{ html: authDialog })
		dialogBox(authDialog, 1)
		$('#smpAuth input[name=submit]')
			.unbind('click')
			.bind('click', function(e) {
				e.preventDefault()
				var question = $('#smpAuth input[name=smpQuestion]').val()
				var secret = $('#smpAuth input[name=smpSecret]').val()
				$('#dialogBoxClose').click()
				otrKeys[nickname].smpSecret(secret, question)
			})
	})
} */

// Bind buddy menus for new buddies. Used internally.
function bindBuddyMenu(nickname) {
	nickname = Strophe.xmlescape(nickname)
	$('#menu-' + nickname).attr('status', 'inactive')
	$('#menu-' + nickname).click(function(e) {
		e.stopPropagation()
		if ($('#menu-' + nickname).attr('status') === 'inactive') {
			$('#menu-' + nickname).attr('status', 'active')
			var buddyMenuContents = '<div class="buddyMenuContents" id="' + nickname + '-contents">'
			$(this).css('background-image', 'url("img/up.png")')
			var blockAction
			if (Cryptocat.blockedUsers.indexOf(nickname) >= 0) {
				blockAction = 'Unblock'
			}
			else {
				blockAction = 'Block'
			}
			$('#buddy-' + nickname).delay(10).animate({'height': '76px'}, 180, function() {
				$(this).append(buddyMenuContents)
				$('#' + nickname + '-contents').append(
					Mustache.render(Cryptocat.templates.buddyMenu, {
						sendEncryptedFile: Cryptocat.language['chatWindow']['sendEncryptedFile'],
						displayInfo: Cryptocat.language['chatWindow']['displayInfo'],
						block: blockAction
					})
				)
				$('#' + nickname + '-contents').fadeIn(200, function() {
					$('.option1').click(function(e) {
						e.stopPropagation()
						sendFile(nickname)
						$('#menu-' + nickname).click()
					})
					$('.option2').click(function(e) {
						e.stopPropagation()
						displayInfo(nickname)
						$('#menu-' + nickname).click()
					})
					$('.option3').click(function(e) {
						e.stopPropagation()
						if (blockAction === 'Block') {
							Cryptocat.blockedUsers.push(nickname)
						}
						else {
							Cryptocat.blockedUsers.splice(Cryptocat.blockedUsers.indexOf(nickname), 1)
						}
						$('#menu-' + nickname).click()
					})
					/* $('.option4').click(function(e) {
						e.stopPropagation()
						displayAuth(nickname)
						$('#menu-' + nickname).click()
					}) */
				})
			})
		}
		else {
			$('#menu-' + nickname).attr('status', 'inactive')
			$(this).css('background-image', 'url("img/down.png")')
			$('#buddy-' + nickname).animate({'height': '15px'}, 190)
			$('#' + nickname + '-contents').fadeOut(200, function() {
				$('#' + nickname + '-contents').remove()
			})
		}
	})
}

// Send your current status to the XMPP server.
function sendStatus() {
	if (currentStatus === 'away') {
		Cryptocat.connection.muc.setStatus(Cryptocat.conversationName + '@'
		+ Cryptocat.conferenceServer, Cryptocat.myNickname, 'away', 'away')
	}
	else {
		Cryptocat.connection.muc.setStatus(Cryptocat.conversationName + '@'
		+ Cryptocat.conferenceServer, Cryptocat.myNickname, '', '')
	}
}

// Displays a pretty dialog box with `data` as the content HTML.
// If `closeable = true`, then the dialog box has a close button on the top right.
// onAppear may be defined as a callback function to execute on dialog box appear.
// onClose may be defined as a callback function to execute on dialog box close.
function dialogBox(data, closeable, onAppear, onClose) {
	if (closeable) {
		$('#dialogBoxClose').css('width', '18px')
		$('#dialogBoxClose').css('font-size', '12px')
	}
	$('#dialogBoxContent').html(data)
	$('#dialogBox').fadeIn(200, function() {
		if (onAppear) { onAppear() }
	})
	$('#dialogBoxClose').unbind('click').click(function(e) {
		e.stopPropagation()
		$(this).unbind('click')
		if ($(this).css('width') === 0) {
			return false
		}
		$('#dialogBox').fadeOut(100, function() {
				$('#dialogBoxContent').empty()
				$('#dialogBoxClose').css('width', '0')
				$('#dialogBoxClose').css('font-size', '0')
				if (onClose) { onClose() }
			})
		$('#userInputText').focus()
	})
	if (closeable) {
		$(document).keydown(function(e) {
			if (e.keyCode === 27) {
				e.stopPropagation()
				$('#dialogBoxClose').click()
				$(document).unbind('keydown')
			}
		})
	}
}

// Buttons:
// Status button.
$('#status').click(function() {
	if ($(this).attr('src') === 'img/available.png') {
		$(this).attr('src', 'img/away.png')
		$(this).attr('alt', Cryptocat.language['chatWindow']['statusAway'])
		$(this).attr('title', Cryptocat.language['chatWindow']['statusAway'])
		currentStatus = 'away'
		sendStatus()
	}
	else {
		$(this).attr('src', 'img/available.png')
		$(this).attr('alt', Cryptocat.language['chatWindow']['statusAvailable'])
		$(this).attr('title', Cryptocat.language['chatWindow']['statusAvailable'])
		currentStatus = 'online'
		sendStatus()
	}
})

// My info button.
$('#myInfo').click(function() {
	displayInfo(Cryptocat.myNickname)
})

// Desktop notifications button.
var firefox = navigator.userAgent.match('Firefox\/(.*)')
if (!window.webkitNotifications && (firefox && ((firefox[1] | 0) < 22))) {
	$('#notifications').remove()
}
else {
	$('#notifications').click(function() {
		if ($(this).attr('src') === 'img/noNotifications.png') {
			$(this).attr('src', 'img/notifications.png')
			$(this).attr('alt', Cryptocat.language['chatWindow']['desktopNotificationsOn'])
			$(this).attr('title', Cryptocat.language['chatWindow']['desktopNotificationsOn'])
			desktopNotifications = true
			if (localStorageEnabled) {
				localStorage.setItem('desktopNotifications', 'true')
			}
			if (window.webkitNotifications) {
				if (window.webkitNotifications.checkPermission()) {
					window.webkitNotifications.requestPermission(function() {})
				}
			}
		}
		else {
			$(this).attr('src', 'img/noNotifications.png')
			$(this).attr('alt', Cryptocat.language['chatWindow']['desktopNotificationsOff'])
			$(this).attr('title', Cryptocat.language['chatWindow']['desktopNotificationsOff'])
			desktopNotifications = false
			if (localStorageEnabled) {
				localStorage.setItem('desktopNotifications', 'false')
			}
		}
	})
}

// Audio notifications button.
// If using Safari, remove this button.
// (Since Safari does not support audio notifications)
if (!navigator.userAgent.match(/(Chrome)|(Firefox)/)) {
	$('#audio').remove()
}
else {
	$('#audio').click(function() {
		if ($(this).attr('src') === 'img/noSound.png') {
			$(this).attr('src', 'img/sound.png')
			$(this).attr('alt', Cryptocat.language['chatWindow']['audioNotificationsOn'])
			$(this).attr('title', Cryptocat.language['chatWindow']['audioNotificationsOn'])
			audioNotifications = true
			if (localStorageEnabled) {
				localStorage.setItem('audioNotifications', 'true')
			}
		}
		else {
			$(this).attr('src', 'img/noSound.png')
			$(this).attr('alt', Cryptocat.language['chatWindow']['audioNotificationsOff'])
			$(this).attr('title', Cryptocat.language['chatWindow']['audioNotificationsOff'])
			audioNotifications = false
			if (localStorageEnabled) {
				localStorage.setItem('audioNotifications', 'false')
			}
		}
	})
}

// Logout button.
$('#logout').click(function() {
	logout()
})

// Submit user input.
$('#userInput').submit(function() {
	var message = $.trim($('#userInputText').val())
	if (message !== '') {
		if (currentConversation === 'main-Conversation') {
			if (multiParty.userCount() >= 1) {
				Cryptocat.connection.muc.message(
					Cryptocat.conversationName + '@' + Cryptocat.conferenceServer,
					null, multiParty.sendMessage(message), null, 'groupchat', 'active'
				)
			}
		}
		else {
			otrKeys[currentConversation].sendMsg(message)
		}
		Cryptocat.addToConversation(message, Cryptocat.myNickname, currentConversation, 'message')
	}
	$('#userInputText').val('')
	return false
})

// User input key event detection.
// (Message submission, nick completion...)
$('#userInputText').keydown(function(e) {
	if (e.keyCode === 9) {
		e.preventDefault()
		var nickname, match, suffix
		for (nickname in otrKeys) {
			if (otrKeys.hasOwnProperty(nickname)) {
				try { match = nickname.match($(this).val().match(/(\S)+$/)[0]) }
				catch(err) {}
				if (match) {
					if ($(this).val().match(/\s/)) { suffix = ' ' }
					else { suffix = ': ' }
					$(this).val($(this).val().replace(/(\S)+$/, nickname + suffix))
				}
			}
		}
	}
	else if (e.keyCode === 13) {
		e.preventDefault()
		$('#userInput').submit()
	}
	else if (!composing) {
		composing = true
		window.setTimeout(function() {
			composing = false
		}, 2500)
		var destination, type
		if (currentConversation === 'main-Conversation') {
			destination = null
			type = 'groupchat'
		}
		else {
			destination = currentConversation
			type = 'chat'
		}
		Cryptocat.connection.muc.message(
			Cryptocat.conversationName + '@' + Cryptocat.conferenceServer,
			destination, '', null, type, 'composing'
		)
	}
})
$('#userInputText').keyup(function(e) {
	if (e.keyCode === 13) {
		e.preventDefault()
	}
})
$('#userInputSubmit').click(function() {
	$('#userInput').submit()
	$('#userInputText').select()
})

// Custom server dialog.
$('#customServer').click(function() {
	Cryptocat.bosh = Strophe.xmlescape(Cryptocat.bosh)
	Cryptocat.conferenceServer = Strophe.xmlescape(Cryptocat.conferenceServer)
	Cryptocat.domain = Strophe.xmlescape(Cryptocat.domain)
	$('#languages').hide()
	$('#footer').animate({'height': '180px'}, function() {
		$('#customServerDialog').fadeIn()
		$('#customDomain').val(Cryptocat.domain)
			.click(function() {$(this).select()})
		$('#customConferenceServer').val(Cryptocat.conferenceServer)
			.click(function() {$(this).select()})
		$('#customBOSH').val(Cryptocat.bosh)
			.click(function() {$(this).select()})
		$('#customServerReset').val(Cryptocat.language['loginWindow']['reset']).click(function() {
			$('#customDomain').val(defaultDomain)
			$('#customConferenceServer').val(defaultConferenceServer)
			$('#customBOSH').val(defaultBOSH)
			if (localStorageEnabled) {
				localStorage.removeItem('domain')
				localStorage.removeItem('conferenceServer')
				localStorage.removeItem('bosh')
			}
		})
		$('#customServerSubmit').val(Cryptocat.language['chatWindow']['continue']).click(function() {
			$('#customServerDialog').fadeOut(200, function() {
				$('#footer').animate({'height': '14px'})
			})
			Cryptocat.domain = $('#customDomain').val()
			Cryptocat.conferenceServer = $('#customConferenceServer').val()
			Cryptocat.bosh = $('#customBOSH').val()
			if (localStorageEnabled) {
				localStorage.setItem('domain', Cryptocat.domain)
				localStorage.setItem('conferenceServer', Cryptocat.conferenceServer)
				localStorage.setItem('bosh', Cryptocat.bosh)
			}
		})
		$('#customDomain').select()
	})
})

// Language selector.
$('#languageSelect').click(function() {
	$('#customServerDialog').hide()
	$('#footer').animate({'height': '180px'}, function() {
		$('#languages li').css({'color': '#FFF', 'font-weight': 'normal'})
		$('#' + Cryptocat.language['language']).css({'color': '#97CEEC', 'font-weight': 'bold'})
		$('#languages').fadeIn()
		$('#languages li').click(function() {
			var lang = $(this).attr('id')
			$('#languages').fadeOut(200, function() {
				Cryptocat.Language.set(lang)
				if (localStorageEnabled) {
					localStorage.setItem('language', lang)
				}
				$('#footer').animate({'height': '14px'})
			})
		})
	})
})

// Login form.
$('#conversationName').click(function() {
	$(this).select()
})
$('#nickname').click(function() {
	$(this).select()
})
$('#loginForm').submit(function() {
	// Don't submit if form is already being processed.
	if (($('#loginSubmit').attr('readonly') === 'readonly')) {
		return false
	}
	//Check validity of conversation name and nickname.
	$('#conversationName').val($.trim($('#conversationName').val().toLowerCase()))
	$('#nickname').val($.trim($('#nickname').val().toLowerCase()))
	if ($('#conversationName').val() === '') {
		loginFail(Cryptocat.language['loginMessage']['enterConversation'])
		$('#conversationName').select()
	}
	else if (!$('#conversationName').val().match(/^\w{1,20}$/)) {
		loginFail(Cryptocat.language['loginMessage']['conversationAlphanumeric'])
		$('#conversationName').select()
	}
	else if ($('#nickname').val() === '') {
		loginFail(Cryptocat.language['loginMessage']['enterNickname'])
		$('#nickname').select()
	}
	else if (!$('#nickname').val().match(/^\w{1,16}$/)) {
		loginFail(Cryptocat.language['loginMessage']['nicknameAlphanumeric'])
		$('#nickname').select()
	}
	// If no encryption keys, generate.
	else if (!myKey) {
		var progressForm = '<br /><p id="progressForm"><img src="img/keygen.gif" '
			+ 'alt="" /><p id="progressInfo"><span>'
			+ Cryptocat.language['loginMessage']['generatingKeys'] + '</span></p>'
		dialogBox(progressForm, 0, function() {
			// We need to pass the web worker a pre-generated seed.
			keyGenerator.postMessage(Cryptocat.generateSeed())
			// Key storage currently disabled as we are not yet sure if this is safe to do.
			//if (localStorageEnabled) {
			//	localStorage.setItem('multiPartyKey', multiParty.genPrivateKey())
			//}
			//else {
				multiParty.genPrivateKey()
			//}
			multiParty.genPublicKey()
		})
		if (Cryptocat.language['language'] === 'en') {
			$('#progressInfo').append(
				'<br />Here is an interesting fact while you wait:'
				+ '<br /><div id="interestingFact">'
				+ CatFacts.getFact() + '</div>'
			)
		}
		$('#progressInfo').append(
			'<div id="progressBar"><div id="fill"></div></div>'
		)
		var catFactInterval = window.setInterval(function() {
			$('#interestingFact').fadeOut(function() {
				$(this).text(CatFacts.getFact()).fadeIn()
			})
			if (myKey) {
				clearInterval(catFactInterval)
			}
		}, 9000)
		$('#fill').animate({'width': '100%', 'opacity': '1'}, 12000, 'linear')
	}
	// If everything is okay, then register a randomly generated throwaway XMPP ID and log in.
	else {
		connectXMPP(Cryptocat.randomString(64, 1, 1, 1, 0), Cryptocat.randomString(64, 1, 1, 1, 0))
	}
	return false
})

// Registers a new user on the XMPP server, connects and join conversation.
function connectXMPP(username, password) {
	Cryptocat.conversationName = Strophe.xmlescape($('#conversationName').val())
	Cryptocat.myNickname = Strophe.xmlescape($('#nickname').val())
	Cryptocat.connection = new Strophe.Connection(Cryptocat.bosh)
	$('#loginSubmit').attr('readonly', 'readonly')
	Cryptocat.connection.register.connect(Cryptocat.domain, function(status) {
		if (status === Strophe.Status.REGISTER) {
			$('#loginInfo').text(Cryptocat.language['loginMessage']['registering'])
			Cryptocat.connection.register.fields.username = username
			Cryptocat.connection.register.fields.password = password
			Cryptocat.connection.register.submit()
		}
		else if (status === Strophe.Status.REGISTERED) {
			Cryptocat.connection = new Strophe.Connection(Cryptocat.bosh)
			Cryptocat.connection.connect(username + '@' + Cryptocat.domain, password, function(status) {
				if (status === Strophe.Status.CONNECTING) {
					$('#loginInfo').animate({'backgroundColor': '#97CEEC'}, 200)
					$('#loginInfo').text(Cryptocat.language['loginMessage']['connecting'])
				}
				else if (status === Strophe.Status.CONNECTED) {
					Cryptocat.connection.ibb.addIBBHandler(Cryptocat.ibbHandler)
					/* jshint -W106 */
					Cryptocat.connection.si_filetransfer.addFileHandler(Cryptocat.fileHandler)
					/* jshint +W106 */
					Cryptocat.connection.muc.join(
						Cryptocat.conversationName + '@' + Cryptocat.conferenceServer, Cryptocat.myNickname,
						function(message) {
							if (handleMessage(message)) { return true }
						},
						function (presence) {
							if (handlePresence(presence)) { return true }
						}
					)
					$('#fill').stop().animate({'width': '100%', 'opacity': '1'}, 400, 'linear', function() {
						$('#dialogBoxClose').click()
					})
					window.setTimeout(function() {
						connected()
					}, 400)
				}
				else if (status === Strophe.Status.CONNFAIL) {
					if (loginError) {
						$('#loginInfo').text(Cryptocat.language['loginMessage']['connectionFailed'])
						$('#loginInfo').animate({'backgroundColor': '#E93028'}, 200)
					}
					logout()
				}
				else if (status === Strophe.Status.DISCONNECTED) {
					if (!loginError) {
						$('#loginInfo').text(Cryptocat.language['loginMessage']['connectionFailed'])
						$('#loginInfo').animate({'bakgroundColor': '#E93028'}, 200)
					}
					logout()
				}
			})
		}
		else if (status === Strophe.Status.SBMTFAIL) {
			loginFail(Cryptocat.language['loginMessage']['authenticationFailure'])
			$('#conversationName').select()
			$('#loginSubmit').removeAttr('readonly')
			Cryptocat.connection = null
			return false
		}
	})
}

// Executes on successfully completed XMPP connection.
function connected() {
	if (localStorageEnabled) {
		localStorage.setItem('myNickname', Cryptocat.myNickname)
	}
	$('#buddy-main-Conversation').attr('status', 'online')
	$('#loginInfo').text('✓')
	$('#info').fadeOut(200)
	$('#loginOptions,#languages,#customServerDialog,#version,#logoText,#loginInfo').fadeOut(200)
	$('#header').animate({'backgroundColor': '#151520'})
	$('.logo').animate({'margin': '-11px 5px 0 0'})
	$('#loginForm').fadeOut(200, function() {
		$('#conversationInfo').fadeIn()
		bindBuddyClick('main-Conversation')
		$('#buddy-main-Conversation').click()
		$('#conversationWrapper').fadeIn()
		$('#optionButtons').fadeIn()
		$('#footer').delay(200).animate({'height': '60px'}, function() {
			$('#userInput').fadeIn(200, function() {
				$('#userInputText').focus()
			})
		})
		$('#buddyWrapper').slideDown()
		window.setTimeout(function() {
			showNotifications = true
		}, 6000)
	})
	loginError = false
}

// Executes on user logout.
function logout() {
	showNotifications = false
	Cryptocat.connection.muc.leave(Cryptocat.conversationName + '@' + Cryptocat.conferenceServer)
	Cryptocat.connection.disconnect()
	$('#conversationInfo,#optionButtons').fadeOut()
	$('#header').animate({'backgroundColor': 'transparent'})
	$('.logo').animate({'margin': '-5px 5px 0 5px'})
	$('#buddyWrapper').slideUp()
	$('.buddy').unbind('click')
	$('.buddyMenu').unbind('click')
	$('#buddy-main-Conversation').insertAfter('#buddiesOnline')
	$('#userInput').fadeOut(function() {
		$('#logoText').fadeIn()
		$('#footer').animate({'height': '14px'})
		$('#conversationWrapper').fadeOut(function() {
			if (!loginError) {
				$('#loginInfo').animate({'backgroundColor': '#97CEEC'}, 200)
				$('#loginInfo').text(Cryptocat.language['loginMessage']['thankYouUsing'])
			}
			$('#buddyList div').each(function() {
				if ($(this).attr('id') !== 'buddy-main-Conversation') {
					$(this).remove()
				}
			})
			$('#conversationWindow').html('')
			otrKeys = {}
			multiParty.reset()
			conversations = {}
			currentConversation = null
			Cryptocat.connection = null
			if (!loginError) {
				$('#conversationName').val('')
			}
			$('#info,#loginOptions,#version,#loginInfo').fadeIn()
			$('#loginForm').fadeIn(200, function() {
				$('#conversationName').select()
				$('#loginSubmit').removeAttr('readonly')
			})
		})
	})
}

// When the window/tab is not selected, set `isFocused` to false.
// The variable `isFocused` is used to know when to show desktop notifications.
$(window).blur(function() {
	isFocused = false
})

// On window focus, select text input field automatically if we are chatting.
// Also set `isFocused` to true.
$(window).focus(function() {
	isFocused = true
	if ($('#buddy-main-Conversation').attr('status') === 'online') {
		$('#userInputText').focus()
	}
})

// Prevent accidental window close.
$(window).bind('beforeunload', function() {
	if (showNotifications) {
		return Cryptocat.language['loginMessage']['thankYouUsing']
	}
})

// Logout on browser close.
$(window).unload(function() {
	if (Cryptocat.connection !== null) {
		logout()
	}
})

// Show main window.
$('#bubble').show()

})}//:3
