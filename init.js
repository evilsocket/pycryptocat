pyVersion = '1.0.1';

/* resize content with window */
$(window).resize( function() {
  $("#bubble").css("height", $(window).height() + "px");
});

$('#blog').click( function()
{

	dialogBox( '<center>pyCryptoCat v' + pyVersion + '<br/>Copyleft by evilsocket@gmail.com<br><br>CryptoCat by the http://crypto.cat team.', 1);

  return false;
});

$('#version').text( 'pyCryptoCat ' + pyVersion );

/* apply custom css and texts */
$('#bubble').attr( 'style', 
  'position: static;' +
  'width: 100%;' +
  'height: 100%;' +
  'min-width: 800px;' +
  'min-height: 600px;' +
  'background: black;' +
  'margin: auto auto;' +
  'border-radius: 0;' +
  'box-shadow: 0;'
);

$('head').append("<style>#bubble:after{ content:none; }</style>");

$('#blog').text('About').attr( 'href', '#' );
$('#logoText').text('pyCryptoCat - A Python CryptoCat client.');



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

