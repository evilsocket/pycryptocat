# This file is part of pyCryptoCat.
#
# Copyright(c) 2010-2011 Simone Margaritelli
# evilsocket@gmail.com
# http://www.evilsocket.net
# http://www.emoticode.net
#
# This file may be licensed under the terms of of the
# GNU General Public License Version 2 (the ``GPL'').
#
# Software distributed under the License is distributed
# on an ``AS IS'' basis, WITHOUT WARRANTY OF ANY KIND, either
# express or implied. See the GPL for the specific language
# governing rights and limitations.
#
# You should have received a copy of the GPL along with this
# program. If not, go to http://www.gnu.org/licenses/gpl.html
# or write to the Free Software Foundation, Inc.,
# 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.

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
    path = 'files'
    
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
        self.httpd = HTTPDAsyncStarter()
        self.window = gtk.Window()
        self.webview = webkit.WebView()

        self.window.set_title( 'pyCryptoCat v' + self.version )
        self.window.connect( 'destroy', gtk.main_quit )

        self.window.add(self.webview)
    
    def run(self):
        self.httpd.start()

        self.window.show_all()
        self.webview.open( "http://%s:%d" % ( self.httpd.address, self.httpd.port ) )
    
        gtk.main()

cc = CryptoCat()
cc.run()
