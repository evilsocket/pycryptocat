#!/usr/bin/python
# This file is part of pyCryptoCat.
#
# Copyleft Simone Margaritelli
# evilsocket@gmail.com
# http://www.evilsocket.net
# http://www.emoticode.net

import gtk, webkit
import sys
import os
import threading
import SocketServer
import BaseHTTPServer
import SimpleHTTPServer

class ThreadedHTTPD(SocketServer.ThreadingMixIn,BaseHTTPServer.HTTPServer):
    pass

class HTTPDAsyncStarter(threading.Thread):
    address = '127.0.0.1'
    port = 8080
    path = os.path.dirname(os.path.realpath(__file__)) + '/files'
    
    def __init__(self):
        threading.Thread.__init__(self)
        self.daemon = True
    
    def run(self):
        os.chdir( self.path )
        httpd = ThreadedHTTPD(( self.address, self.port ), SimpleHTTPServer.SimpleHTTPRequestHandler)
        try:
            while 1:
                httpd.handle_request()
        except KeyboardInterrupt:
            print "Finished"

class CryptoCat:
    version = '1.0.0'

    def __init__(self):
        self.httpd   = HTTPDAsyncStarter()
        self.window  = gtk.Window()
        self.webview = webkit.WebView()

        with open('init.js', 'r') as initjs:
          self.initjs = initjs.read()

        # get dom ready event
        self.webview.connect("load-finished", self._view_load_finished_cb)

        self.window.set_title( 'pyCryptoCat v' + self.version )                                                                                                                               
        self.window.connect( 'destroy', gtk.main_quit )

        self.window.add(self.webview)
   
    def _js( self, code ):
        self.webview.execute_script(code)

    def _view_load_finished_cb(self, view, frame):
      # run initialization code
      self._js( self.initjs )

    def run(self):
        self.httpd.start()
        
        self.window.set_position(gtk.WIN_POS_CENTER)
        self.window.show_all()
        self.webview.open( "http://%s:%d" % ( self.httpd.address, self.httpd.port ) )
    
        gtk.main()

cc = CryptoCat()
cc.run()
