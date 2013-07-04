// Cryptocat templates for use with mustache.js.

Cryptocat.templates = {
	buddy: '<div class="buddy" title="{{nickname}}" id="buddy-{{nickname}}" status="online">'
		+ '<span>{{shortNickname}}</span>'
		+ '<div class="buddyMenu" id="menu-{{nickname}}"></div></div>',
		
	buddyMenu: '<li class="option1">{{sendEncryptedFile}}</li>'
		+ '<li class="option2">{{displayInfo}}</li>'
		+ '<li class="option3">{{block}}</li>',

	infoDialog: '<div class="title">{{nickname}}</div>'
		+ '<div id="displayInfo">{{otrFingerprint}}<br /><span id="otrFingerprint"></span><br />'
		+ '<div id="otrColorprint"></div>{{groupFingerprint}}'
		+ '<br /><span id="multiPartyFingerprint"></span><br />'
		+ '<div id="multiPartyColorprint"></div><br /></div>',

	authWrap: '<div id="smpAuth">'
		+ '<p><strong>SMP Authentication</strong></p>{{&html}}</div>',

	authDialog: '<p>Trust? <span id="smpTrust">{{trust}}</span></p>'
		+ '<div><p>(optional) Question?</p>'
		+ '<input type="text" name="smpQuestion" /></div>'
		+ '<div><p>Secret:</p> <input type="password" name="smpSecret" /></div>'
		+ '<div><input type="submit" name="submit" value="Send" /></div>',

	sendFile: '<div class="title">{{sendEncryptedFile}}</div>'
		+ '<input type="file" id="fileSelector" name="file[]" />'
		+ '<input type="button" id="fileSelectButton" value="{{sendEncryptedFile}}" />'
		+ '<div id="fileInfoField">{{fileTransferInfo}}</div>',

	file: '<div class="fileProgressBar" file="{{message}}"><div class="fileProgressBarFill"></div></div>',

	fileLink: '<a href="{{url}}" class="fileView" target="_blank" download="{{filename}}">{{downloadFile}}</a>',

	fileLinkMac: '<a href="{{url}}" class="fileView" download="{{filename}}">{{downloadFile}}</a>',

	message: '<div class="line{{lineDecoration}}"><span class="sender" sender="{{sender}}"'
		+ ' timestamp="{{currentTime}}">{{sender}}</span>{{&message}}</div>',

	composing: '<img src="img/typing.gif" class="typing" id="{{id}}" alt="" />'
}