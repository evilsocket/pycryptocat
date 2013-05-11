#!/usr/bin/python
# -*- coding: utf-8 -*-
#
# This file is part of pyCryptoCat.
#
# Copyleft Simone Margaritelli
# evilsocket@gmail.com
# http://www.evilsocket.net
# http://www.emoticode.net

import os
import gtk
import webkit

__name__ = 'pyCryptoCat'
__version__ = '1.0.1'


class CryptoCat:

    def __init__(self):
        self.window = gtk.Window()
        self.webview = webkit.WebView()

        starter = 'files/index.html'
        cc_path = os.path.dirname(os.path.realpath(__file__))
        self.cryptocat = os.path.join('file://', cc_path, starter)

        settings = self.webview.get_settings()
        # Make webview load file:// urls without security exceptions
        settings.set_property('enable-universal-access-from-file-uris', True)
        settings.set_property('enable-file-access-from-file-uris', True)
        # Enable audio notifications
        settings.set_property('enable-webaudio', True)
        # Set default encoding
        settings.set_property('default-encoding', 'utf-8')

        initjs_path = os.path.join(cc_path, 'init.js')
        with open(initjs_path, 'r') as initjs:
            self.initjs = initjs.read()

        # get dom ready event
        self.webview.connect('load-finished', self._view_load_finished_cb)

        self.window.set_title(__name__ + ' v' + __version__)
        self.window.connect('destroy', gtk.main_quit)

        self.window.add(self.webview)

    def _js(self, code):
        self.webview.execute_script(code)

    def _view_load_finished_cb(self, view, frame):
        # run initialization code
        self._js(self.initjs)

    def run(self):
        self.webview.set_size_request(800, 600)
        self.window.set_position(gtk.WIN_POS_CENTER)
        self.window.show_all()
        self.webview.open(self.cryptocat)
        gtk.main()

cc = CryptoCat()
cc.run()
