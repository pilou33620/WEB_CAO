import http.server
import socketserver
import socket
import os

DEFAULT_PORT = 8000

def get_local_ip():
    """Recupere l'adresse IP locale de la machine sur le reseau."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    # Desactive la mise en cache
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
        
    # Redirige intelligemment vers le bon fichier HTML si index.html n'existe pas
    def translate_path(self, path):
        filepath = super().translate_path(path)
        
        # Si on navigue vers un dossier (ex: /editeur-schematique/)
        if os.path.isdir(filepath):
            # S'il n'y a pas de index.html
            if not os.path.exists(os.path.join(filepath, "index.html")):
                # On cherche un fichier HTML qui a le même nom que le dossier (ex: editeur-schematique.html)
                folder_name = os.path.basename(filepath.rstrip('/\\'))
                possible_html = os.path.join(filepath, f"{folder_name}.html")
                if os.path.exists(possible_html):
                    return possible_html
        
        return filepath

    def handle(self):
        try:
            super().handle()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass  # Ignore silently when a client disconnects early

class DualStackServer(socketserver.TCPServer):
    address_family = socket.AF_INET6
    allow_reuse_address = True

    def server_bind(self):
        # Desactiver IPV6_V6ONLY pour accepter a la fois IPv4 et IPv6 (Dual-Stack)
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()

def start_server():
    port = DEFAULT_PORT
    httpd = None
    
    for p in [DEFAULT_PORT, 0]:
        try:
            # On utilise DualStackServer avec "" pour ecouter sur toutes les interfaces (IPv4 et IPv6)
            httpd = DualStackServer(("", p), CustomHandler)
            port = httpd.server_address[1] 
            break
        except OSError as e:
            if p == DEFAULT_PORT:
                print(f"[!] Le port {DEFAULT_PORT} est bloque (securite entreprise ou deja utilise).")
                print("[*] Recherche automatique d'un port alternatif autorise...")
            else:
                print(f"[X] Impossible de demarrer le serveur sur le reseau local : {e}")
                
                # Ultime secours : essayer uniquement en localhost pour voir si c'est le pare-feu
                print("[*] Tentative en mode local uniquement (inaccessible depuis l'iPad)...")
                try:
                    httpd = socketserver.TCPServer(("127.0.0.1", 0), CustomHandler)
                    port = httpd.server_address[1]
                    break
                except OSError as e2:
                    print(f"[X] Echec definitif : {e2}")
                    return

    if httpd:
        # httpd.server_address[0] peut valoir "::", "0.0.0.0" (toutes interfaces) ou "127.0.0.1", "::1" (local)
        is_local_only = httpd.server_address[0] in ("127.0.0.1", "::1")
        local_ip = "127.0.0.1" if is_local_only else get_local_ip()
        print("="*50)
        print("SERVEUR CAO WEB DEMARRE")
        print("="*50)
        if local_ip == "127.0.0.1":
            print("\nATTENTION: Le serveur a demarre en mode local (pare-feu pro tres strict).")
            print("Il ne sera PAS accessible depuis votre iPad sur ce PC.")
        else:
            print("\nDepuis votre iPad (connecte au meme reseau WiFi),")
            print("ouvrez Safari et tapez simplement cette adresse :\n")
            print(f"-> http://{local_ip}:{port}/")
        
        print("\n" + "="*50)
        print("(Appuyez sur Ctrl+C pour arreter le serveur)")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServeur arrete avec succes.")
            httpd.server_close()

if __name__ == '__main__':
    start_server()
