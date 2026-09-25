import sys
import struct
import json
import subprocess
import os

def send_message(message):
    encoded = json.dumps(message).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('@I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    length = struct.unpack('@I', raw_length)[0]
    message_raw = sys.stdin.buffer.read(length)
    return json.loads(message_raw.decode('utf-8'))

def main():
    try:
        # Read host.json to get brave_path
        host_json_path = os.path.join(os.path.dirname(__file__), 'host.json')
        with open(host_json_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        brave_path = config.get("brave_path")
        if not brave_path or not os.path.exists(brave_path):
            send_message({"success": False, "message": "Brave executable not found. Please reinstall."})
            return

        message = read_message()
        if not message:
            return

        url = message.get("url")
        if not url:
            send_message({"success": False, "message": "No URL provided."})
            return

        # Launch Brave PWA
        subprocess.Popen([brave_path, f"--app={url}", "--start-maximized"])
        
        send_message({
            "success": True,
            "opened": True,
            "message": "Opened in Brave"
        })

    except Exception as e:
        send_message({"success": False, "message": str(e)})

if __name__ == '__main__':
    main()
