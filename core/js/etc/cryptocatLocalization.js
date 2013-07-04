if (typeof Cryptocat.Language === 'undefined') {
	Cryptocat.Language = function() {}
}

(function(){

// Handle aliases
function handleAliases(locale) {
	if (locale === ('zh-hk' || 'zh-tw')) {
		return 'zh-hk'
	}
	else if (locale === ('zh-cn' || 'zh-sg')) {
		return 'zh-cn'
	}
	else if (locale.match('-')) {
		return locale.match(/[a-z]+/)[0]
	}
	return locale
}

// Get locale file, call other functions
Cryptocat.Language.set = function(locale) {
	locale = handleAliases(locale.toLowerCase())
	$.ajax({
		url : 'locale/' + locale + '.txt',
		dataType: 'text',
		accepts: 'text/html',
		contentType: 'text/html',
		complete: function(data) {
			var language = data.responseText.split('\n')
			if (language.length < 5) { // data too small, dismiss
				Cryptocat.Language.set('en')
				return false
			}
			for (var i in language) {
				if (language.hasOwnProperty(i)) {
					language[i] = $.trim(language[i])
				}
			}
			Cryptocat.Language.buildObject(locale, language)
		},
		error: function() {
			Cryptocat.Language.set('en')
		}
	})
}

// Build and deliver language object
Cryptocat.Language.buildObject = function(locale, language) {
	var i = 0
	var languageObject = {
		'language': locale,
		'direction': language[i++],
		'font-family': language[i++],
		'loginWindow': {
			'introHeader': language[i++],
			'introParagraph': language[i++],
			'blog': language[i++],
			'customServer': language[i++],
			'reset': language[i++],
			'conversationName': language[i++],
			'nickname': language[i++],
			'connect': language[i++],
			'conversationNameTooltip': language[i++],
			'enterConversation': language[i++]
		},
		'loginMessage': {
			'enterConversation': language[i++],
			'conversationAlphanumeric': language[i++],
			'enterNickname': language[i++],
			'nicknameAlphanumeric': language[i++],
			'nicknameInUse': language[i++],
			'authenticationFailure': language[i++],
			'connectionFailed': language[i++],
			'thankYouUsing': language[i++],
			'registering': language[i++],
			'connecting': language[i++],
			'connected': language[i++],
			'typeRandomly': language[i++],
			'generatingKeys': language[i++]
		},
		'chatWindow': {
			'groupConversation': language[i++],
			'otrFingerprint': language[i++],
			'groupFingerprint': language[i++],
			'resetKeys': language[i++],
			'resetKeysWarn': language[i++],
			'continue': language[i++],
			'statusAvailable': language[i++],
			'statusAway': language[i++],
			'myInfo': language[i++],
			'desktopNotificationsOn': language[i++],
			'desktopNotificationsOff': language[i++],
			'audioNotificationsOn': language[i++],
			'audioNotificationsOff': language[i++],
			'rememberNickname': language[i++],
			'doNotRememberNickname': language[i++],
			'logout': language[i++],
			'displayInfo': language[i++],
			'sendEncryptedFile': language[i++],
			'viewImage': language[i++],
			'downloadFile': language[i++],
			'conversation': language[i++],
			'fileTransferInfo': language[i++].replace('(SIZE)', (Cryptocat.fileSize / 1024)),
			'fileTypeError': language[i++],
			'fileSizeError': language[i++].replace('(SIZE)', (Cryptocat.fileSize / 1024)),
			'startVideoChat': language[i++],
			'endVideoChat': language[i++],
			'videoChatQuery': language[i++],
			'cancel': language[i++]
		}
	}
	Cryptocat.Language.refresh(languageObject)
}

// Deliver new strings and refresh login page
Cryptocat.Language.refresh = function(languageObject) {
	Cryptocat.language = languageObject
	var smallType = ['bo', 'ar', 'in']
	if (smallType.indexOf(languageObject['language']) >= 0) {
		$('body').css({'font-size': '13px'})
	}
	else {
		$('body').css({'font-size': '11px'})
	}
	$('body').css('font-family', languageObject['font-family'])
	$('#introHeader').text(languageObject['loginWindow']['introHeader'])
	$('#introParagraph').html(languageObject['loginWindow']['introParagraph'])
	$('#customServer').text(languageObject['loginWindow']['customServer'])
	$('#conversationName').attr('placeholder', languageObject['loginWindow']['conversationName'])
	$('#nickname').attr('placeholder', languageObject['loginWindow']['nickname'])
	$('#loginSubmit').val(languageObject['loginWindow']['connect'])
	$('#loginInfo').text(languageObject['loginWindow']['enterConversation'])
	$('#logout').attr('title', languageObject['chatWindow']['logout'])
	$('#logout').attr('alt', languageObject['chatWindow']['logout'])
	$('#audio').attr('title', languageObject['chatWindow']['audioNotificationsOff'])
	$('#audio').attr('alt', languageObject['chatWindow']['audioNotificationsOff'])
	$('#notifications').attr('title', languageObject['chatWindow']['desktopNotificationsOff'])
	$('#notifications').attr('alt', languageObject['chatWindow']['desktopNotificationsOff'])
	$('#myInfo').attr('title', languageObject['chatWindow']['myInfo'])
	$('#myInfo').attr('alt', languageObject['chatWindow']['myInfo'])
	$('#status').attr('title', languageObject['chatWindow']['statusAvailable'])
	$('#status').attr('alt', languageObject['chatWindow']['statusAvailable'])
	$('#conversationTag').text(languageObject['chatWindow']['conversation'])
	$('#languageSelect').text($('#' + Cryptocat.language['language']).text())
	$('[title]').qtip({
		position: {
			my: 'top right',
			at: 'bottom left'
		}
	})
	$('#conversationName').qtip({
		position: {
			my: 'bottom left',
			at: 'top center'
		},
		content: languageObject['loginWindow']['conversationNameTooltip']
	})
	$('html').attr('dir', languageObject['direction'])
	if (languageObject['direction'] === 'ltr') {
		$('div#bubble #info li').css('background-position', 'top left')
	}
	else {
		$('div#bubble #info li').css('background-position', 'top right')
	}
	$('#conversationName').select()
}

})()
