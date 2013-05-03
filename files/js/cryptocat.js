$(window).ready(function() {

/* Version number */
Cryptocat.version = '2.0.41';
$('#version').text(Cryptocat.version);

/* Configuration */
var defaultDomain = 'crypto.cat'; // Domain name to connect to for XMPP.
var defaultConferenceServer = 'conference.crypto.cat'; // Address of the XMPP MUC server.
var defaultBOSH = 'https://crypto.cat/http-bind'; // BOSH is served over an HTTPS proxy for better security and availability.
var fileSize = 700; // Maximum encrypted file sharing size, in kilobytes. Also needs to be defined in datareader.js
var localStorageEnabled = 1; 
if (navigator.userAgent.match('Firefox')) {
	// Local storage features are disabled in Firefox until we migrate to a packaged web app
	// (Scheduled for Firefox 21 or 22)
	localStorageEnabled = 0;
}

/* Initialization */
var domain = defaultDomain;
var conferenceServer = defaultConferenceServer;
var bosh = defaultBOSH;
var otrKeys = {};
var conversations = {};
var loginCredentials = [];
var currentConversation = 0;
var audioNotifications = 0;
var desktopNotifications = 0;
var buddyNotifications = 0;
var loginError = 0;
var currentStatus = 'online';
var soundEmbed = null;
var conn, conversationName, myNickname, myKey;

// Seed RNG
Cryptocat.setSeed(Cryptocat.generateSeed());

// Initialize language settings
if (!localStorageEnabled) {
	Language.set(window.navigator.language.toLowerCase());
}

// If localStorage is implemented, load saved settings
if (localStorageEnabled) {
	// Load language settings
	if (localStorage.getItem('language')) {
		Language.set(localStorage.getItem('language'));
	}
	else {
		Language.set(window.navigator.language.toLowerCase());
	}
	// Load nickname settings
	if (localStorage.getItem('myNickname')) {
		window.setTimeout(function() {
			$('#nickname').animate({'color': 'transparent'}, function() {
				$(this).val(localStorage.getItem('myNickname'));
				$(this).animate({'color': '#FFF'});
			});
		}, 0);
	}
	// Load notification settings
	if (localStorage.getItem('desktopNotifications') === '1') {
		$('#notifications').click();
	}
	if (localStorage.getItem('audioNotifications') === '1') {
		$('#audio').click();
	}
	// Load custom server settings
	if (localStorage.getItem('domain')) {
		domain = localStorage.getItem('domain');
	}
	if (localStorage.getItem('conferenceServer')) {
		conferenceServer = localStorage.getItem('conferenceServer');
	}
	if (localStorage.getItem('bosh')) {
		bosh = localStorage.getItem('bosh');
	}
	// Load pre-existing encryption keys
	// Key storage currently disabled as we are not yet sure if this is safe to do.
	/* if (localStorage.getItem('myKey') !== null) {
		myKey = new DSA(JSON.parse(localStorage.getItem('myKey')));
		multiParty.setPrivateKey(localStorage.getItem('multiPartyKey'));
		multiParty.genPublicKey();
	} */
}

// Initialize workers
var keyGenerator = new Worker('js/keygenerator.js');
var dataReader = new Worker('js/datareader.js');
keyGenerator.onmessage = function(e) {
	myKey = new DSA(e.data);
	// Key storage currently disabled as we are not yet sure if this is safe to do.
	//if (localStorageEnabled) {
	//	localStorage.setItem('myKey', JSON.stringify(myKey));
	//}
	$('#fill').stop().animate({'width': '100%', 'opacity': '1'}, 400, 'linear', function() {
		$('#loginInfo').text(Cryptocat.language['loginMessage']['connecting']);
		$('#dialogBoxClose').click();
	});
}

// Outputs the current hh:mm.
// If `seconds = 1`, outputs hh:mm:ss.
function currentTime(seconds) {
	var date = new Date();
	var time = [];
	time.push(date.getHours().toString());
	time.push(date.getMinutes().toString());
	if (seconds) {
		time.push(date.getSeconds().toString());
	}
	for (var just in time) {
		if (time[just].length === 1) {
			time[just] = '0' + time[just];
		}
	}
	return time.join(':');
}

// Plays the audio file defined by the `audio` variable.
function playSound(audio) {
	(new Audio('snd/' + audio + '.wav')).play();
}

// Scrolls down the chat window to the bottom in a smooth animation.
// 'speed' is animation speed in milliseconds.
function scrollDown(speed) {
	$('#conversationWindow').animate({
		scrollTop: $('#conversationWindow')[0].scrollHeight + 20
	}, speed);
}

// Initiates a conversation. Internal use.
function initiateConversation(conversation) {
	if (!conversations.hasOwnProperty(conversation)) {
		conversations[conversation] = '';
	}
}

// OTR functions
// Handle incoming messages
var uicb = function(buddy) {
	return function(msg) {
		addToConversation(msg, buddy, buddy);
	}
}

// Handle outgoing messages
var iocb = function(buddy) {
	return function(message) {
		conn.muc.message(conversationName + '@' + conferenceServer, buddy, message, null);
	}
}

// Creates a template for the conversation info bar at the top of each conversation.
function buildConversationInfo(conversation) {
	$('#conversationInfo').html(
		'<span class="conversationUserCount">' + $('.buddy').length + '</span>'
		+ '<span class="conversationName">' + myNickname + '@' + conversationName + '</span>'
	);
	if (conversation === 'main-Conversation') {
		$('#conversationInfo').append(
			'<span id="groupConversation">' + Cryptocat.language['chatWindow']['groupConversation'] + '</span>'
		);
	}
}

// Switches the currently active conversation to `buddy'
function switchConversation(buddy) {
	if ($('#buddy-' + buddy).attr('status') !== 'offline') {
		$('#' + buddy).animate({'background-color': '#7BBFEC'});
		$('#buddy-' + buddy).css('border-bottom', '1px solid #72B1DB');
	}
	if (buddy !== 'main-Conversation') {
		$('#buddy-' + buddy).css('background-image', 'none');
	}
	$('#conversationInfo').slideDown(function() {
		buildConversationInfo(currentConversation);
		$('#conversationWindow').slideDown('fast', function() {
			$('#userInput').fadeIn('fast', function() {
				$('#userInputText').focus();
			});
			var scrollWidth = document.getElementById('conversationWindow').scrollWidth;
			$('#conversationWindow').css('width', (712 + scrollWidth) + 'px');
			scrollDown(600);
		});
		$(window).resize();
	});
	// Clean up finished conversations
	$('#buddyList div').each(function() {
		if (($(this).attr('id') !== ('buddy-' + currentConversation))
			&& ($(this).css('background-image') === 'none')
			&& ($(this).attr('status') === 'offline')) {
			$(this).slideUp(500, function() {
				$(this).remove();
				updateUserCount();
			});
		}
	});
}

// Handles login failures
function loginFail(message) {
	buddyNotifications = 0;
	$('#loginInfo').text(message);
	$('#bubble').animate({'left': '+=5px'}, 130)
		.animate({'left': '-=10px'}, 130)
		.animate({'left': '+=5px'}, 130);
	$('#loginInfo').animate({'color': '#E93028'}, 'fast');
}

// Simply shortens a string `string` to length `length.
// Adds '..' to delineate that string was shortened.
function shortenString(string, length) {
	if (string.length > length) {
		return string.substring(0, (length - 2)) + '..';
	}
	return string;
}

// Clean nickname so that it's safe to use.
function cleanNickname(nickname) {
	var clean;
	if (clean = nickname.match(/\/([\s\S]+)/)) {
		clean = Strophe.xmlescape(clean[1]);
	}
	else {
		return false;
	}
	if (clean.match(/\W/)) {
		return false;
	}
	return clean;
}

// Get a fingerprint, formatted for readability
function getFingerprint(buddy, OTR) {
	if (OTR) {
		if (buddy === myNickname) {
			var fingerprint = myKey.fingerprint();
		}
		else {
			var fingerprint = otrKeys[buddy].their_priv_pk.fingerprint();
		}
	}
	else {
		if (buddy === myNickname) {
			var fingerprint = multiParty.genFingerprint();
		}
		else {
			var fingerprint = multiParty.genFingerprint(buddy);
		}
	}
	var formatted = '';
	for (var i in fingerprint) {
		if ((i !== 0) && !(i % 8)) {
			formatted += ' ';
		}
		formatted += fingerprint[i];
	}
	return formatted.toUpperCase();
}

// Convert message URLs to links. Used internally.
function addLinks(message) {
	if ((URLs = message.match(/(((news|(ht|f)tp(s?))\:\/\/){1}\S+)/gi))) {
		for (var i in URLs) {
			var sanitize = URLs[i].split('');
			for (var l in sanitize) {
				if (!sanitize[l].match(/\w|\d|\:|\/|\?|\=|\#|\+|\,|\.|\&|\;|\%/)) {
					sanitize[l] = encodeURIComponent(sanitize[l]);
				}
			}
			sanitize = sanitize.join('');
			var processed = sanitize.replace(':','&colon;');
			message = message.replace(sanitize, '<a target="_blank" href="' + processed + '">' + processed + '</a>');		
		}
	}
	return message;
}

// Convert text emoticons to graphical emoticons.
function addEmoticons(message) {
	return message
		.replace(/(\s|^)(:|(=))-?3(?=(\s|$))/gi, ' <div class="emoticon" id="eCat">$&</div> ')
		.replace(/(\s|^)(:|(=))-?\&apos;\((?=(\s|$))/gi, ' <div class="emoticon" id="eCry">$&</div> ')
		.replace(/(\s|^)(:|(=))-?o(?=(\s|$))/gi, ' <div class="emoticon" id="eGasp">$&</div> ')
		.replace(/(\s|^)(:|(=))-?D(?=(\s|$))/gi, ' <div class="emoticon" id="eGrin">$&</div> ')
		.replace(/(\s|^)(:|(=))-?\((?=(\s|$))/gi, ' <div class="emoticon" id="eSad">$&</div> ')
		.replace(/(\s|^)(:|(=))-?\)(?=(\s|$))/gi, ' <div class="emoticon" id="eSmile">$&</div> ')
		.replace(/(\s|^)-_-(?=(\s|$))/gi, ' <div class="emoticon" id="eSquint">$&</div> ')
		.replace(/(\s|^)(:|(=))-?p(?=(\s|$))/gi, ' <div class="emoticon" id="eTongue">$&</div> ')
		.replace(/(\s|^)(:|(=))-?(\/|s)(?=(\s|$))/gi, ' <div class="emoticon" id="eUnsure">$&</div> ')
		.replace(/(\s|^);-?\)(?=(\s|$))/gi, ' <div class="emoticon" id="eWink">$&</div> ')
		.replace(/(\s|^);-?\p(?=(\s|$))/gi, ' <div class="emoticon" id="eWinkTongue">$&</div> ')
		.replace(/(\s|^)\^(_|\.)?\^(?=(\s|$))/gi, ' <div class="emoticon" id="eHappy">$&</div> ')
		.replace(/(\s|^)(:|(=))-?x\b(?=(\s|$))/gi, ' <div class="emoticon" id="eShut">$&</div> ')
		.replace(/(\s|^)\&lt\;3\b(?=(\s|$))/g, ' <span class="monospace">&#9829;</span> ');
}

// Convert Data URI to viewable/downloadable file.
// Warning: This function is currently unused and is probably not secure for use.
function addFile(message) {
	var mime = new RegExp('(data:(application\/((x-compressed)|(x-zip-compressed)|'
		+ '(zip)))|(multipart\/x-zip))\;base64,(\\w|\\/|\\+|\\=|\\s)*$');

	if (match = message.match(/data:image\/\w+\;base64,(\w|\\|\/|\+|\=)*$/)) {
		message = message.replace(/data:image\/\w+\;base64,(\w|\\|\/|\+|\=)*$/,
			'<a href="' + match[0] + '" class="imageView" target="_blank">' + Cryptocat.language['chatWindow']['viewImage'] + '</a>');
	}
	else if (match = message.match(mime)) {
		message = message.replace(mime,
			'<a href="' + match[0] + '" class="fileView" target="_blank">' + Cryptocat.language['chatWindow']['downloadFile'] + '</a>');
	}
	return message;
}

// Add a `message` from `sender` to the `conversation` display and log.
function addToConversation(message, sender, conversation) {
	if (!message) {
		return false;
	}
	initiateConversation(conversation);
	if (sender === myNickname) {
		lineDecoration = 1;
		message = Strophe.xmlescape(message);
	}
	else {
		lineDecoration = 2;
		if (audioNotifications) {
			playSound('msgGet');
		}
		if (!document.hasFocus()) {
			desktopNotification('img/keygen.gif', sender, message, 0x1337);
		}
		message = Strophe.xmlescape(message);
		if (message.match(myNickname)) {
			var nickRegEx = new RegExp(myNickname, 'g');
			message = message.replace(nickRegEx, '<span class="nickHighlight">$&</span>');
			lineDecoration = 3;
		}
	}
	// message = addFile(message); Function disabled
	message = addLinks(message);
	message = addEmoticons(message);
	message = message.replace(/:/g, '&#58;');
	var timeStamp = '<span class="timeStamp">' + currentTime(0) + '</span>';
	var sender = '<span class="sender">' + Strophe.xmlescape(shortenString(sender, 16)) + '</span>';
	if (conversation === currentConversation) {
		message = '<div class="Line' + lineDecoration + '">' + timeStamp + sender + message + '</div>';
		conversations[conversation] += message;
		var width = $(window).width() - $('#buddyWrapper').width();
		$('#conversationWindow').append(message);
		$('.Line' + lineDecoration).last()
			.css('width', width - 60)
			.animate({'margin-top': '20px', 'opacity': '1'}, 'fast');
		if (($('#conversationWindow')[0].scrollHeight - $('#conversationWindow').scrollTop()) < 1500) {	
			scrollDown(400);
		}
	}
	else {
		message = '<div class="Line' + lineDecoration + '">' + timeStamp + sender + message + '</div>';
		conversations[conversation] += message;
		var backgroundColor = $('#buddy-' + conversation).css('background-color');
		$('#buddy-' + conversation).css('background-image', 'url("img/newMessage.png")');
		$('#buddy-' + conversation)
			.animate({'backgroundColor': '#A7D8F7'})
			.animate({'backgroundColor': backgroundColor});
	}
}

function desktopNotification(image, title, body, timeout) {
	if (desktopNotifications) {
		if (navigator.userAgent.match('Sentenza')) {
			Stz.notifyMe_({'title': 'Cryptocat', subtitle: title, content: body});
			return true;
		}
		var notice = window.webkitNotifications.createNotification(image, title, body);
		notice.show();
		if (timeout > 0) {
			window.setTimeout(function() {
				notice.cancel();
			}, timeout);
		}
	}
}

// Add a join/part notification to the main conversation window.
// If 'join === 1', shows join notification, otherwise shows part
function buddyNotification(buddy, join) {
	if (join) {
		var status = '<div class="userJoin"><strong>+</strong>' + buddy + '</div>';
		var audioNotification = 'userOnline';
	}
	else {
		var status = '<div class="userLeave"><strong>-</strong>' + buddy + '</div>';
		var audioNotification = 'userOffline';
	}
	conversations['main-Conversation'] += status;
	if (currentConversation === 'main-Conversation') {
		$('#conversationWindow').append(status);
	}
	if (($('#conversationWindow')[0].scrollHeight - $('#conversationWindow').scrollTop()) < 1500) {	
		scrollDown(400);
	}
	if (!document.hasFocus()) {
		desktopNotification('img/keygen.gif', buddy, '', 0x1337);
	}
	if (audioNotifications) {
		playSound(audioNotification);
	}
}

// Update user count for display in conversation info bar.
function updateUserCount() {
	if ($('.conversationUserCount').text() !== $('.buddy').length.toString()) {
		$('.conversationUserCount').animate({'color': '#70B9E0'}, function() {
			$(this).text($('.buddy').length);
			$(this).animate({'color': '#FFF'});
		});	
	}
}

// Build new buddy
function addBuddy(nickname) {
	$('#buddyList').queue(function() {
		var buddyTemplate = '<div class="buddy" title="' + nickname + '" id="buddy-' 
			+ nickname + '" status="online"><span>' + nickname + '</span>'
			+ '<div class="buddyMenu" id="menu-' + nickname + '"></div></div>'
		$(buddyTemplate).insertAfter('#buddiesOnline').slideDown(100, function() {
			$('#buddy-' + nickname).unbind('click');
			$('#menu-' + nickname).unbind('click');
			bindBuddyMenu(nickname);
			bindBuddyClick(nickname);
			updateUserCount();
			var sendPublicKey = multiParty.sendPublicKey(nickname);
			conn.muc.message(
				conversationName + '@' + conferenceServer, null,
				sendPublicKey, null
			);
		});
		if (buddyNotifications) {
			buddyNotification(nickname, 1);
		}
	});
	$('#buddyList').dequeue();
}

// Handle buddy going offline
function removeBuddy(nickname) {
	// Delete their encryption keys
	delete otrKeys[nickname];
	multiParty.removeKeys(nickname);
	if (($('#buddy-' + nickname).length !== 0)
		&& ($('#buddy-' + nickname).attr('status') !== 'offline')) {
		if ((currentConversation !== nickname)
			&& ($('#buddy-' + nickname).css('background-image') === 'none')) {
			$('#buddy-' + nickname).slideUp(500, function() {
				$(this).remove();
				updateUserCount();
			});
		}
		else {
			$('#buddy-' + nickname).attr('status', 'offline');
			$('#buddy-' + nickname).animate({
				'color': '#BBB',
				'backgroundColor': '#222',
				'borderLeftColor': '#111',
				'borderBottom': 'none'
			});
		}
	}
	if (buddyNotifications) {
		buddyNotification(nickname, 0);
	}
}

// Handle nickname change (which may be done by non-Cryptocat XMPP clients)
function changeNickname(oldNickname, newNickname) {
	otrKeys[newNickname] = otrKeys[oldNickname];
	multiParty.renameKeys(oldNickname, newNickname);
	conversations[newNickname] = conversations[oldNickname];
	removeBuddy(oldNickname);
}

// Handle incoming messages from the XMPP server.
function handleMessage(message) {
	var nickname = cleanNickname($(message).attr('from'));
	var body = $(message).find('body').text().replace(/\&quot;/g, '"');
	var type = $(message).attr('type');
	// If archived message, ignore.
	if ($(message).find('delay').length !== 0) {
		return true;
	}
	// If message is from me, ignore.
	if (nickname === myNickname) {
		return true;
	}
	// If message is from someone not on buddy list, ignore.
	if (!$('#buddy-' + nickname).length) {
		return true;
	}
	if (type === 'groupchat') {
		body = multiParty.receiveMessage(nickname, myNickname, body);
		if (typeof(body) === 'string') {
			addToConversation(body, nickname, 'main-Conversation');
		}
	}
	else if (type === 'chat') {
		otrKeys[nickname].receiveMsg(body);
	}
	return true;
}

// Handle incoming presence updates from the XMPP server.
function handlePresence(presence) {
	// console.log(presence);
	var nickname = cleanNickname($(presence).attr('from'));
	// If invalid nickname, do not process
	if ($(presence).attr('type') === 'error') {
		if ($(presence).find('error').attr('code') === '409') {
			// Delay logout in order to avoid race condition with window animation
			window.setTimeout(function() {
				loginError = 1;
				logout();
				loginFail(Cryptocat.language['loginMessage']['nicknameInUse']);
			}, 3000);
			return false;
		}
		return true;
	}
	// Ignore if presence status is coming from myself
	if (nickname === myNickname) {
		return true;
	}
	// Detect nickname change (which may be done by non-Cryptocat XMPP clients)
	if ($(presence).find('status').attr('code') === '303') {
		var newNickname = cleanNickname('/' + $(presence).find('item').attr('nick'));
		console.log(nickname + ' changed nick to ' + newNickname);
		changeNickname(nickname, newNickname);
		return true;
	}
	// Add to otrKeys if necessary
	if (nickname !== 'main-Conversation' && !otrKeys.hasOwnProperty(nickname)) {
		var options = {
		// 	fragment_size: 8192,
		// 	send_interval: 400,
			priv: myKey
		};
		otrKeys[nickname] = new OTR(options);
		otrKeys[nickname].REQUIRE_ENCRYPTION = true;
		otrKeys[nickname].on('ui', uicb(nickname));
		otrKeys[nickname].on('io', iocb(nickname));
		otrKeys[nickname].on('error', function(err) {
		console.log('OTR error: ' + err);
	});
    otrKeys[nickname].on('status', (function(nickname) {
      return function(state) {
        // close generating fingerprint dialog after AKE
        if ( otrKeys[nickname].generatingFingerprint &&
             state === OTR.CONST.STATUS_AKE_SUCCESS
        ) { closeGenerateFingerprints(nickname); }
      };
    }(nickname)));
  }
	// Detect buddy going offline
	if ($(presence).attr('type') === 'unavailable') {
		removeBuddy(nickname);
		return true;
	}
	// Create buddy element if buddy is new
	else if (!$('#buddy-' + nickname).length) {
		addBuddy(nickname);
	}
	// Handle buddy status change to 'available'
	else if ($(presence).find('show').text() === '' || $(presence).find('show').text() === 'chat') {
		if ($('#buddy-' + nickname).attr('status') !== 'online') {
			var status = 'online';
			var backgroundColor = '#72B1DB';
			var placement = '#buddiesOnline';
		}
	}
	// Handle buddy status change to 'away'
	else if ($('#buddy-' + nickname).attr('status') !== 'away') {
			var status = 'away';
			var backgroundColor = '#5588A5';
			var placement = '#buddiesAway';
	}
	// Perform status change
	$('#buddy-' + nickname).attr('status', status);
	if (placement) {
		$('#buddy-' + nickname).animate({
			'color': '#FFF',
			'backgroundColor': backgroundColor,
			'borderLeftColor': '#7BBFEC'
		});
		if (currentConversation !== nickname) {
			$('#buddy-' + nickname).slideUp('fast', function() {
				$(this).insertAfter(placement).slideDown('fast');
			});
		}
	}
	return true;
}

// Bind buddy click actions. Used internally.
function bindBuddyClick(nickname) {
	$('#buddy-' + nickname).click(function() {
		if ($(this).prev().attr('id') === 'currentConversation') {
			$('#userInputText').focus();
			return true;
		}
		if (nickname !== 'main-Conversation') {
			$(this).css('background-image', 'none');
		}
		else {
			$(this).css('background-image', 'url("img/groupChat.png")');
		}
		if (currentConversation) {
			var oldConversation = currentConversation;
			if ($('#buddy-' + oldConversation).attr('status') === 'online') {
				var placement = '#buddiesOnline';
				var backgroundColor = '#72B1DB';
				var color = '#FFF';
			}
			else if ($('#buddy-' + oldConversation).attr('status') === 'away') {
				var placement = '#buddiesAway';
				var backgroundColor = '#5588A5';
				var color = '#FFF';
			}
			$('#buddy-' + oldConversation).slideUp('fast', function() {
				$(this).css('background-color', backgroundColor);
				$(this).css('color', color);
				$(this).css('border-bottom', 'none');
				$(this).insertAfter(placement).slideDown('fast');
			});
		}
		currentConversation = nickname;
		initiateConversation(currentConversation);
		$('#conversationWindow').html(conversations[currentConversation]);
		$('.Line1, .Line2, .Line3').addClass('visibleLine');
		$(window).resize();
		if (($(this).prev().attr('id') === 'buddiesOnline')
			|| (($(this).prev().attr('id') === 'buddiesAway')
			&& $('#buddiesOnline').next().attr('id') === 'buddiesAway')) {
			$(this).insertAfter('#currentConversation');
			$(this).animate({'background-color': '#7BBFEC'});
			switchConversation(nickname);
		}
		else {
			$(this).slideUp('fast', function() {
				$(this).insertAfter('#currentConversation').slideDown('fast', function() {
					$(this).animate({'background-color': '#7BBFEC'});
					switchConversation(nickname);
				});
			});
		}
	});
}

// Send encrypted file
// File is converted into a base64 Data URI which is then sent as an OTR message.
function sendFile(nickname) {
	var sendFileDialog = '<div class="bar">' + Cryptocat.language['chatWindow']['sendEncryptedFile'] + '</div>'
		+ '<input type="file" id="fileSelector" name="file[]" />'
		+ '<input type="button" id="fileSelectButton" class="button" value="select file" />'
		+ '<div id="fileErrorField"></div>'
		+ 'Only .zip files and images are accepted.<br />'
		+ 'Maximum file size: ' + fileSize + ' kilobytes.';
	dialogBox(sendFileDialog, 1);
	$('#fileSelector').change(function(e) {
		e.stopPropagation();
		dataReader.onmessage = function(e) {
			if (e.data === 'typeError') {
				$('#fileErrorField').text('Please make sure your file is a .zip file or an image.');
			}
			else if (e.data === 'sizeError') {
				$('#fileErrorField').text('File cannot be larger than ' + fileSize + ' kilobytes');
			}
			else {
				otrKeys[nickname].sendMsg(e.data);
				addToConversation(e.data, myNickname, nickname);
				$('#dialogBoxClose').click();
			}
		};
		if (this.files) {
			dataReader.postMessage(this.files);
		}
	});
	$('#fileSelectButton').click(function() {
		$('#fileSelector').click();
	});
}

// Display info dialog
function displayInfoDialog(nickname) {
	return '<input type="button" class="bar" value="'
		+ nickname + '"/><div id="displayInfo">'
		+ Cryptocat.language['chatWindow']['otrFingerprint']
		+ '<br /><span id="otrFingerprint"></span><br />'
		+ '<div id="otrColorprint"></div>'
		+ Cryptocat.language['chatWindow']['groupFingerprint']
		+ '<br /><span id="multiPartyFingerprint"></span><br />'
		+ '<div id="multiPartyColorprint"></div><br /></div>';
}

// Show fingerprints internal function
function showFingerprints(nickname) {
	$('#otrFingerprint').text(getFingerprint(nickname, 1));
	$('#multiPartyFingerprint').text(getFingerprint(nickname, 0));
	var otrColorprint = getFingerprint(nickname, 1).split(' ');
	otrColorprint.splice(0, 1);
	for (var color in otrColorprint) {
		$('#otrColorprint').append(
			'<div class="colorprint" style="background:#'
			+ otrColorprint[color].substring(0, 6) + '"></div>'
		);
	}
	var multiPartyColorprint = getFingerprint(nickname, 0).split(' ');
	multiPartyColorprint.splice(0, 1);
	for (var color in multiPartyColorprint) {
		$('#multiPartyColorprint').append(
			'<div class="colorprint" style="background:#'
			+ multiPartyColorprint[color].substring(0, 6) + '"></div>'
		);
	}
}

// Close generating fingerprints dialog
function closeGenerateFingerprints(nickname) {
  $('#fill')
    .stop()
    .animate({'width': '100%', 'opacity': '1'}, 400, 'linear',
      function() {
        $('#dialogBoxContent').fadeOut(function() {
          $(this).html(displayInfoDialog(nickname));
          showFingerprints(nickname);
          $(this).fadeIn();
          otrKeys[nickname].generatingFingerprint = false;
        });
      });
}

// Display buddy information, including fingerprints etc.
function displayInfo(nickname) {
	// Do nothing if a dialog already exists
	if ($('#displayInfo').length) {
		return false;
	}
	nickname = Strophe.xmlescape(nickname);
	// If OTR fingerprints have not been generated, show a progress bar and generate them.
	if ((nickname !== myNickname) && !otrKeys[nickname].msgstate) {
		var progressDialog = '<div id="progressBar"><div id="fill"></div></div>';
		dialogBox(progressDialog, 1, null, function() {
			$('#displayInfo').remove();
		});
		$('#progressBar').css('margin', '70px auto 0 auto');
		$('#fill').animate({'width': '100%', 'opacity': '1'}, 8000, 'linear');
    // add some state for status callback
    otrKeys[nickname].generatingFingerprint = true;
    otrKeys[nickname].sendQueryMsg();
	}
	else {
		dialogBox(displayInfoDialog(nickname), 1, null, function() {
			$('#displayInfo').remove();
		});
		showFingerprints(nickname);
	}
}

// Bind buddy menus for new buddies. Used internally.
function bindBuddyMenu(nickname) {
	nickname = Strophe.xmlescape(nickname);
	$('#menu-' + nickname).attr('status', 'inactive');
	$('#menu-' + nickname).click(function(e) {
		e.stopPropagation();
		if ($('#menu-' + nickname).attr('status') === 'inactive') {
			$('#menu-' + nickname).attr('status', 'active');
			var buddyMenuContents = '<div class="buddyMenuContents" id="' + nickname + '-contents">';
			$(this).css('background-image', 'url("img/up.png")');
			$('#buddy-' + nickname).delay(10).animate({'height': '28px'}, 180, function() {
				$(this).append(buddyMenuContents);
				// File sharing menu item
				// (currently disabled)
				// $('#' + nickname + '-contents').append(
				// 	'<li class="option1">' + Cryptocat.language['chatWindow']['sendEncryptedFile']  + '</li>'
				// );
				$('#' + nickname + '-contents').append(
					'<li class="option2">' + Cryptocat.language['chatWindow']['displayInfo'] + '</li>'
				);
				$('#' + nickname + '-contents').fadeIn('fast', function() {
					$('.option1').click(function(e) {
						e.stopPropagation();
						sendFile(nickname);
						$('#menu-' + nickname).click();
					});
					$('.option2').click(function(e) {
						e.stopPropagation();
						displayInfo(nickname);
						$('#menu-' + nickname).click();
					});
				});
			});
		}
		else {
			$('#menu-' + nickname).attr('status', 'inactive');
			$(this).css('background-image', 'url("img/down.png")');
			$('#buddy-' + nickname).animate({'height': '15px'}, 190);
			$('#' + nickname + '-contents').fadeOut('fast', function() {
				$('#' + nickname + '-contents').remove();
			});
		}
	});
}

// Send your current status to the XMPP server.
function sendStatus() {
	if (currentStatus === 'away') {
		conn.muc.setStatus(conversationName + '@' + conferenceServer, myNickname, 'away', 'away');
	}
	else {
		conn.muc.setStatus(conversationName + '@' + conferenceServer, myNickname, '', '');
	}
}

// Displays a pretty dialog box with `data` as the content HTML.
// If `closeable = 1`, then the dialog box has a close button on the top right.
// onAppear may be defined as a callback function to execute on dialog box appear.
// onClose may be defined as a callback function to execute on dialog box close.
function dialogBox(data, closeable, onAppear, onClose) {
	if ($('#dialogBox').css('top') !== '-450px') {
		return false;
	}
	if (closeable) {
		$('#dialogBoxClose').css('width', '18px');
		$('#dialogBoxClose').css('font-size', '12px');
	}
	$('#dialogBoxContent').html(data);
	$('#dialogBox').animate({'top': '+=440px'}, 'fast').animate({
		'top': '-=10px'
	}, 'fast', function() {
		if (onAppear) {
			onAppear();
		}
	});
	$('#dialogBoxClose').unbind('click');
	$('#dialogBoxClose').click(function(e) {
		e.stopPropagation();
		if ($(this).css('width') === 0) {
			return false;
		}
		$('#dialogBox').animate({'top': '+=10px'}, 'fast')
			.animate({'top': '-450px'}, 'fast', function() {
				if (onClose) {
					onClose();
				}
			});
		$(this).css('width', '0');
		$(this).css('font-size', '0');
		$('#userInputText').focus();
	});
	if (closeable) {
		$(document).keydown(function(e) {
			if (e.keyCode === 27) {
				e.stopPropagation();
				$('#dialogBoxClose').click();
				$(document).unbind('keydown');
			}
		});
	}
}

// Buttons
// Status button
$('#status').click(function() {
	if ($(this).attr('src') === 'img/available.png') {
		$(this).attr('src', 'img/away.png');
		$(this).attr('alt', Cryptocat.language['chatWindow']['statusAway']);
		$(this).attr('title', Cryptocat.language['chatWindow']['statusAway']);
		currentStatus = 'away';
		sendStatus();
	}
	else {
		$(this).attr('src', 'img/available.png');
		$(this).attr('alt', Cryptocat.language['chatWindow']['statusAvailable']);
		$(this).attr('title', Cryptocat.language['chatWindow']['statusAvailable']);
		currentStatus = 'online';
		sendStatus();
	}
});

// My info button
$('#myInfo').click(function() {
	displayInfo(myNickname);
});

// Desktop notifications button
if (!window.webkitNotifications) {
	$('#notifications').remove();
}
else {
	$('#notifications').click(function() {
		if ($(this).attr('src') === 'img/noNotifications.png') {
			$(this).attr('src', 'img/notifications.png');
			$(this).attr('alt', Cryptocat.language['chatWindow']['desktopNotificationsOn']);
			$(this).attr('title', Cryptocat.language['chatWindow']['desktopNotificationsOn']);
			desktopNotifications = 1;
			localStorage.setItem('desktopNotifications', '1');
			if (window.webkitNotifications.checkPermission()) {
				window.webkitNotifications.requestPermission(function() {});
			}
		}
		else {
			$(this).attr('src', 'img/noNotifications.png');
			$(this).attr('alt', Cryptocat.language['chatWindow']['desktopNotificationsOff']);
			$(this).attr('title', Cryptocat.language['chatWindow']['desktopNotificationsOff']);
			desktopNotifications = 0;
			localStorage.setItem('desktopNotifications', '0');
		}
	});
}

// Audio notifications button
// If using Safari, remove this button
// (Since Safari does not support audio notifications)
if (!navigator.userAgent.match(/(Chrome)|(Firefox)/)) {
	$('#audio').remove();
}
else {
	$('#audio').click(function() {
		if ($(this).attr('src') === 'img/noSound.png') {
			$(this).attr('src', 'img/sound.png');
			$(this).attr('alt', Cryptocat.language['chatWindow']['audioNotificationsOn']);
			$(this).attr('title', Cryptocat.language['chatWindow']['audioNotificationsOn']);
			audioNotifications = 1;
			localStorage.setItem('audioNotifications', '1');
		}
		else {
			$(this).attr('src', 'img/noSound.png');
			$(this).attr('alt', Cryptocat.language['chatWindow']['audioNotificationsOff']);
			$(this).attr('title', Cryptocat.language['chatWindow']['audioNotificationsOff']);
			audioNotifications = 0;
			localStorage.setItem('audioNotifications', '0');
		}
	});
}


// Logout button
$('#logout').click(function() {
	logout();
});

// Submit user input
$('#userInput').submit(function() {
	var message = $.trim($('#userInputText').val());
	if (message !== '') {
		if (currentConversation === 'main-Conversation') {
			if (multiParty.userCount() >= 1) {
				conn.muc.message(
					conversationName + '@' + conferenceServer, null,
					multiParty.sendMessage(message), null
				);
			}
		}
		else {
			otrKeys[currentConversation].sendMsg(message);
		}
		addToConversation(message, myNickname, currentConversation);
	}
	$('#userInputText').val('');
	return false;
});

// User input key event detection.
// (Message submission, nick completion...)
$('#userInputText').keydown(function(e) {
	if (e.keyCode === 9) {
		e.preventDefault();
		for (var nickname in otrKeys) {
			if (match = nickname.match($(this).val().match(/(\S)+$/)[0])) {
				if ($(this).val().match(/\s/)) {
					$(this).val($(this).val().replace(match, nickname + ' '));
				}
				else {
					$(this).val($(this).val().replace(match, nickname + ': '));
				}
			}
		}
	}
	if (e.keyCode === 13) {
		e.preventDefault();
		$('#userInput').submit();
	}
});
$('#userInputText').keyup(function(e) {
	if (e.keyCode === 13) {
		e.preventDefault();
	}
});

// Custom server dialog
$('#customServer').click(function() {
	bosh = Strophe.xmlescape(bosh);
	conferenceServer = Strophe.xmlescape(conferenceServer);
	domain = Strophe.xmlescape(domain);
	var customServerDialog = '<input type="button" class="bar" value="'
		+ Cryptocat.language['loginWindow']['customServer'] + '"/><br />'
		+ '<input type="text" class="customServer" id="customDomain"></input>'
		+ '<input type="text" class="customServer" id="customConferenceServer"></input>'
		+ '<input type="text" class="customServer" id="customBOSH"></input>'
		+ '<input type="button" class="button" id="customServerReset"></input>'
		+ '<input type="button" class="button" id="customServerSubmit"></input>';
	dialogBox(customServerDialog, 1);
	$('#customDomain').val(domain)
		.attr('title', 'Domain name')
		.click(function() {$(this).select()});
	$('#customConferenceServer').val(conferenceServer)
		.attr('title', 'XMPP-MUC server')
		.click(function() {$(this).select()});
	$('#customBOSH').val(bosh)
		.attr('title', 'BOSH relay')
		.click(function() {$(this).select()});
	$('#customServerReset').val(Cryptocat.language['loginWindow']['reset']).click(function() {
		$('#customDomain').val(defaultDomain);
		$('#customConferenceServer').val(defaultConferenceServer);
		$('#customBOSH').val(defaultBOSH);
		if (localStorageEnabled) {
			localStorage.removeItem('domain');
			localStorage.removeItem('conferenceServer');
			localStorage.removeItem('bosh');
		}
	});
	$('#customServerSubmit').val(Cryptocat.language['chatWindow']['continue']).click(function() {
		domain = $('#customDomain').val();
		conferenceServer = $('#customConferenceServer').val();
		bosh = $('#customBOSH').val();
		$('#dialogBoxClose').click();
		if (localStorageEnabled) {
			localStorage.setItem('domain', domain);
			localStorage.setItem('conferenceServer', conferenceServer);
			localStorage.setItem('bosh', bosh);
		}
	});
	$('#customDomain').select();
	$('.customServer').qtip({
		position: {
			my: 'center left',
			at: 'center right'
		}
	});
});

// Language selector.
$('#languageSelect').click(function() {
	$('#introParagraph').fadeOut(function() {
		$('#languages li').css({'color': '#FFF', 'font-weight': 'normal'});
		$('#' + Cryptocat.language['language']).css({'color': '#7BBFEC', 'font-weight': 'bold'});
		$('#languages').fadeIn();
		$('#languages li').mouseenter(function() {
			$(this).animate({'color': '#7BBFEC'}, 'fast');
		});
		$('#languages li').mouseleave(function() {
			$(this).animate({'color': '#FFF'}, 'fast');
		});
		$('#languages li').click(function() {
			var lang = $(this).attr('id');
			$('#languages').fadeOut(function() {
				Language.set(lang);
				if (localStorageEnabled) {
					localStorage.setItem('language', lang);
				}
				$('#introParagraph').fadeIn();
			});
		});
	});
});

// Login form.
$('#conversationName').click(function() {
	$(this).select();
});
$('#nickname').click(function() {
	$(this).select();
});
$('#loginForm').submit(function() {
	// Don't submit if form is already being processed.
	if (($('#loginSubmit').attr('readonly') === 'readonly')) {
		return false;
	}
	//Check validity of conversation name and nickname.
	$('#conversationName').val($.trim($('#conversationName').val().toLowerCase()));
	$('#nickname').val($.trim($('#nickname').val().toLowerCase()));
	if (($('#conversationName').val() === '')
		|| ($('#conversationName').val() === Cryptocat.language['loginWindow']['conversationName'])) {
		loginFail(Cryptocat.language['loginMessage']['enterConversation']);
		$('#conversationName').select();
	}
	else if (!$('#conversationName').val().match(/^\w{1,20}$/)) {
		loginFail(Cryptocat.language['loginMessage']['conversationAlphanumeric']);
		$('#conversationName').select();
	}
	else if (($('#nickname').val() === '')
		|| ($('#nickname').val() === Cryptocat.language['loginWindow']['nickname'])) {
		loginFail(Cryptocat.language['loginMessage']['enterNickname']);
		$('#nickname').select();
	}
	else if (!$('#nickname').val().match(/^\w{1,16}$/)) {
		loginFail(Cryptocat.language['loginMessage']['nicknameAlphanumeric']);
		$('#nickname').select();
	}
	// If no encryption keys, generate.
	else if (!myKey) {
		var progressForm = '<br /><p id="progressForm"><img src="img/keygen.gif" '
			+ 'alt="" /><p id="progressInfo"><span>'
			+ Cryptocat.language['loginMessage']['generatingKeys'] + '</span></p>';
		dialogBox(progressForm, 0, function() {
			// We need to pass the web worker a pre-generated seed.
			keyGenerator.postMessage(Cryptocat.generateSeed());
			// Key storage currently disabled as we are not yet sure if this is safe to do.
			//if (localStorageEnabled) {
			//	localStorage.setItem('multiPartyKey', multiParty.genPrivateKey());
			//}
			//else {
				multiParty.genPrivateKey();
			//}
			multiParty.genPublicKey();
		}, function() {
			$('#loginSubmit').removeAttr('readonly')
			$('#loginForm').submit();
			$('#loginSubmit').attr('readonly', 'readonly');
		});
		if (Cryptocat.language['language'] === 'en') {
			$('#progressInfo').append(
				'<br />Here is an interesting fact while you wait:'
				+ '<br /><div id="interestingFact">'
				+ CatFacts.getFact() + '</div>'
			);
		}
		$('#progressInfo').append(
			'<div id="progressBar"><div id="fill"></div></div>'
		);
		var catFactInterval = window.setInterval(function() {
			$('#interestingFact').fadeOut(function() {
				$(this).text(CatFacts.getFact()).fadeIn();
			});
			if (myKey) {
				clearInterval(catFactInterval);
			}
		}, 10000);
		$('#fill').animate({'width': '100%', 'opacity': '1'}, 10000, 'linear');
	}
	// If everything is okay, then register a randomly generated throwaway XMPP ID and log in.
	else {
		conversationName = Strophe.xmlescape($('#conversationName').val());
		myNickname = Strophe.xmlescape($('#nickname').val());
		loginCredentials[0] = Cryptocat.randomString(256, 1, 1, 1, 0);
		loginCredentials[1] = Cryptocat.randomString(256, 1, 1, 1, 0);
		connectXMPP(loginCredentials[0], loginCredentials[1]);
		$('#loginSubmit').attr('readonly', 'readonly');
	}
	return false;
});

// Registers a new user on the XMPP server, connects and join conversation.
function connectXMPP(username, password) {
	conn = new Strophe.Connection(bosh);
	conn.register.connect(domain, function(status) {
		if (status === Strophe.Status.REGISTER) {
			$('#loginInfo').text(Cryptocat.language['loginMessage']['registering']);
			conn.register.fields.username = username;
			conn.register.fields.password = password;
			conn.register.submit();
		}
		else if (status === Strophe.Status.REGISTERED) {
			conn = new Strophe.Connection(bosh);
			conn.connect(username + '@' + domain, password, function(status) {
				if (status === Strophe.Status.CONNECTING) {
					$('#loginInfo').animate({'color': '#999'}, 'fast');
					$('#loginInfo').text(Cryptocat.language['loginMessage']['connecting']);
				}
				else if (status === Strophe.Status.CONNECTED) {
					connected();
				}
				else if (status === Strophe.Status.CONNFAIL) {
					if (!loginError) {
						$('#loginInfo').text(Cryptocat.language['loginMessage']['connectionFailed']);
						$('#loginInfo').animate({'color': '#E93028'}, 'fast');
					}
				}
				else if (status === Strophe.Status.DISCONNECTED) {
					if (loginError) {
						$('#loginInfo').text(Cryptocat.language['loginMessage']['connectionFailed']);
						$('#loginInfo').animate({'color': '#E93028'}, 'fast');
					}
					logout();
				}
			});
		}
		else if (status === Strophe.Status.SBMTFAIL) {
			loginFail(Cryptocat.language['loginMessage']['authenticationFailure']);
			$('#conversationName').select();
			$('#loginSubmit').removeAttr('readonly');
			conn = null;
			return false;
		}
	});
}

// Executes on XMPP connection.
function connected() {
	conn.muc.join(
		conversationName + '@' + conferenceServer, myNickname, 
		function(message) {
			if (handleMessage(message)) {
				return true;
			}
		},
		function (presence) {
			if (handlePresence(presence)) {
				return true;
			}
		}
	);
	if (localStorageEnabled) {
		localStorage.setItem('myNickname', myNickname);
	}
	$('#buddy-main-Conversation').attr('status', 'online');
	$('#loginInfo').text('✓');
	$('#loginInfo').animate({'color': '#7BBFEC'}, 'fast');
	$('#bubble').animate({'margin-top': '+=0.5%'}, function() {
		$('#bubble').animate({'margin-top': '0'}, function() {
			$('#loginLinks').fadeOut();
			$('#info').fadeOut();
			$('#version').fadeOut();
			$('#options').fadeOut();
			$('#loginForm').fadeOut();
			$('#bubble').animate({'width': '100%'})
			.animate({'height': $(window).height()}, function() {
				$(this).animate({'margin': '0', 'border-radius': '0'});
				$('.button').fadeIn();
				$('#buddyWrapper').slideDown('fast', function() {
					var scrollWidth = document.getElementById('buddyList').scrollWidth;
					$('#buddyList').css('width', (150 + scrollWidth) + 'px');
					bindBuddyClick('main-Conversation');
					$('#buddy-main-Conversation').click();
					buddyNotifications = 1;
				});
			});
		});
	});
	loginError = 0;
}

// Executes on user logout.
function logout() {
	buddyNotifications = 0;
	conn.muc.leave(conversationName + '@' + conferenceServer);
	conn.disconnect();
	$('.button').fadeOut('fast');
	$('#conversationInfo').slideUp();
	$('#conversationInfo').text('');
	$('#buddy-main-Conversation').attr('status', 'offline');
	$('#userInput').fadeOut(function() {
		$('#conversationWindow').slideUp(function() {
			$('#buddyWrapper').slideUp();
			if (!loginError) {
				$('#loginInfo').animate({'color': '#999'}, 'fast');
				$('#loginInfo').text(Cryptocat.language['loginMessage']['thankYouUsing']);
			}
			$('#bubble').css({
				'border-radius': '8px 0 8px 8px',
				'margin': '0 auto'
			});
			$('#bubble').animate({
				'margin-top': '5%',
				'height': '310px'
			}).animate({'width': '680px'}, function() {
				$('#buddyList div').each(function() {
					if ($(this).attr('id') !== 'buddy-main-Conversation') {
						$(this).remove();
					}
				});
				$('#conversationWindow').text('');
				otrKeys = {};
				multiParty.reset();
				conversations = {};
				loginCredentials = [];
				currentConversation = 0;
				conn = null;
				if (!loginError) {
					$('#conversationName').val(Cryptocat.language['loginWindow']['conversationName']);
				}
				$('#nickname').val(Cryptocat.language['loginWindow']['nickname']);
				$('#info').fadeIn();
				$('#loginLinks').fadeIn();
				$('#version').fadeIn();
				$('#options').fadeIn();
				$('#loginForm').fadeIn('fast', function() {
					$('#conversationName').select();
					$('#loginSubmit').removeAttr('readonly');
				});
			});
			$('.buddy').unbind('click');
			$('.buddyMenu').unbind('click');
			$('#buddy-main-Conversation').insertAfter('#buddiesOnline');
		});
	});
}

// On window focus, select text input field automatically if we are chatting.
$(window).focus(function() {
	if ($('#buddy-main-Conversation').attr('status') === 'online') {
		$('#userInputText').focus();
	}
});

// On browser resize, also resize Cryptocat window.
// (This can be done with CSS for width, but not really for height.)
$(window).resize(function() {
	if ($('#buddy-main-Conversation').attr('status') === 'online') {
		var width = $(window).width() - $('#buddyWrapper').width();
		if ($(window).height() > 525) {
			$('#bubble').css('height', $(window).height());
		}
		$('#conversationWrapper').css('width', width);
		$('#userInputText').css('width', width - 61);
		$('#conversationWindow').css('height', $('#bubble').height() - 133);
		$('#conversationInfo').css({'width': width});
		$('.Line1, .Line2, .Line3').css('width', width - 60);
	}
});

// Logout on browser close.
$(window).unload(function() {
	logout();
});

});//:3
