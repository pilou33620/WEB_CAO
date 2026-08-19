import http.server
import socketserver
import socket
import os
import ssl

try:
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    import datetime
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False

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

def generate_self_signed_cert(cert_file, key_file):
    if not HAS_CRYPTO:
        return False
    if os.path.exists(cert_file) and os.path.exists(key_file):
        return True
    
    print("[*] Generation d'un certificat SSL auto-signe...")
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, u"localhost"),
    ])
    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.datetime.utcnow()
    ).not_valid_after(
        datetime.datetime.utcnow() + datetime.timedelta(days=365)
    ).add_extension(
        x509.SubjectAlternativeName([x509.DNSName(u"localhost"), x509.DNSName(u"127.0.0.1")]),
        critical=False,
    ).sign(key, hashes.SHA256())

    with open(key_file, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        ))
    
    with open(cert_file, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    
    return True

def start_server():
    port = DEFAULT_PORT
    httpd = None
    
    cert_file = "cert.pem"
    key_file = "key.pem"
    use_https = generate_self_signed_cert(cert_file, key_file)
    
    for p in [DEFAULT_PORT, 0]:
        try:
            # On utilise DualStackServer avec "" pour ecouter sur toutes les interfaces (IPv4 et IPv6)
            httpd = DualStackServer(("", p), CustomHandler)
            if use_https:
                context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                context.load_cert_chain(certfile=cert_file, keyfile=key_file)
                httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
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
        protocol = "https" if use_https else "http"
        if local_ip == "127.0.0.1":
            print("\nATTENTION: Le serveur a demarre en mode local (pare-feu pro tres strict).")
            print("Il ne sera PAS accessible depuis votre iPad sur ce PC.")
        else:
            print("\nDepuis votre iPad (connecte au meme reseau WiFi),")
            print("ouvrez Safari et tapez simplement cette adresse :\n")
            print(f"-> {protocol}://{local_ip}:{port}/")
            if use_https:
                print("\n(Note: Safari affichera un avertissement 'Non securise' car le certificat est auto-signe.")
                print("Cliquez sur 'Afficher les details' puis 'Visiter ce site web' pour y acceder.)")
        
        print("\n" + "="*50)
        print("(Appuyez sur Ctrl+C pour arreter le serveur)")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServeur arrete avec succes.")
            httpd.server_close()

if __name__ == '__main__':
    start_server()
