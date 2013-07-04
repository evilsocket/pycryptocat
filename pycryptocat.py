#!/usr/bin/env python

import argparse
import gtk
import os
import sys
import webkit


class Cryptocat:

    def __init__(self):
        self.window = gtk.Window()
        self.webview = webkit.WebView()

        starter = 'core/index.html'
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

        self.window.set_title('pyCryptocat')
        self.window.connect('destroy', gtk.main_quit)

        icon_path = cc_path + '/core/img/cryptocat.png'
        self.window.set_icon_from_file(icon_path)

        self.window.add(self.webview)

    def _js(self, code):
        self.webview.execute_script(code)

    def run(self):
        self.webview.set_size_request(800, 600)
        self.window.set_position(gtk.WIN_POS_CENTER)
        self.window.show_all()
        self.webview.open(self.cryptocat)
        gtk.main()


def main():
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description=' A Cryptocat standalone python client', version='%(prog)s v.2 - Copyleft BackBox Team')
    parser.parse_args()
    
    # Run Cryptocat
    cc = Cryptocat()
    cc.run()


if __name__ == '__main__':
    try:
        main()
    # Handle keyboard interrupts
    except KeyboardInterrupt:
        sys.exit('\n\n[!] Quitting...\n')
    # Handle exceptions
    except Exception, error:
        sys.exit('\n[!] ' + str(error) + '\n')

